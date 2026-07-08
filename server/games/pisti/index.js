const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../../core/security');
const { initFirebaseAdmin } = require('../../config/firebaseAdmin');
const { debitBalance, creditBalance, readBalance } = require('../../core/economyService');
const { getProgression, normalizeXpBigInt } = require('../../core/progressionService');
const { runtimeStore } = require('../../core/runtimeStore');
const { recordRecentActivity } = require('../../core/recentActivityService');

let addAdminLog = null;
try {
  ({ addAdminLog } = require('../../admin/adminRuntimeLogStore'));
} catch (_) {
  addAdminLog = null;
}

const router = express.Router();
const rooms = new Map();
const closedRooms = new Map();
let ioRef = null;

const ROOM_TTL_MS = 60 * 60 * 1000;
const ROOM_EXTENSION_MS = 30 * 60 * 1000;
const ROOM_EXTENSION_RESPONSE_MS = 60 * 1000;
const PLAYING_INACTIVITY_MS = 5 * 60 * 1000;
const FINISHED_ROOM_TTL_MS = 10 * 60 * 1000;
const CLOSED_ROOM_TOMBSTONE_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 1000;
const ALLOWED_PISTI_MODES = new Set(['bot-2-52', 'bot-2-104', 'free-2-52', 'free-reward-2-52', 'bet-2-52', 'bet-2-104', 'bet-4-52', 'bet-4-104']);
const LEGACY_MODE_ALIASES = Object.freeze({ '2-52': 'bet-2-52', '2-104': 'bet-2-104', '4-104': 'bet-4-104', 'bot': 'bot-2-52', 'free': 'free-2-52', 'free-reward': 'free-reward-2-52' });
const MIN_BET = 1000;
const MAX_BET = 1_000_000;
const FREE_WIN_REWARD_MC = 5000;
const FREE_REWARD_DAILY_LIMIT = 10;
const FREE_REWARD_OPPONENT_DAILY_LIMIT = 3;
const FREE_REWARD_COUNTER_TTL_MS = 48 * 3600000;
const PISTI_BET_XP_PER_1000_MC = 50;
const BOT_MOVE_DELAY_MS = 2600;
const BOT_DIFFICULTY_MULTIPLIER = 3;
const now = () => Date.now();

function sanitizeLogValue(value = '') {
  return String(value || '')
    .replace(/(AIza[0-9A-Za-z_\-]{20,})/g, '[redacted-api-key]')
    .replace(/(token|secret|password|private_key|service_account|hash|salt)\s*[:=]\s*[^,}\s]+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function pushPistiAdminRuntimeLog(entry = {}) {
  if (typeof addAdminLog !== 'function') return;
  try {
    if (addAdminLog.length >= 2) addAdminLog('pisti.runtime.error', entry);
    else addAdminLog(entry);
  } catch (_) {}
}

function closedRoomMessage(reason = '') {
  const normalized = String(reason || '').toLowerCase();
  if (normalized.includes('inactivity')) return 'Masa 5 dakika boyunca gerçek oyun hareketi olmadığı için kapatıldı.';
  if (normalized.includes('extension-rejected')) return 'Masa uzatma isteği kabul edilmediği için kapatıldı.';
  if (normalized.includes('extension-no-response')) return 'Masa uzatma onayı süresi dolduğu için kapatıldı.';
  if (normalized.includes('extension-expired')) return '30 dakikalık ek süre dolduğu için masa kapatıldı.';
  if (normalized.includes('lifetime')) return 'Masa 60 dakikalık oda süresi dolduğu için kapatıldı.';
  if (normalized.includes('waiting')) return 'Masa bekleme süresi dolduğu için kapatıldı.';
  if (normalized.includes('leave')) return 'Masa oyuncu çıkışı nedeniyle kapatıldı.';
  return 'Masa kapatıldı.';
}

function pruneClosedRooms() {
  const cutoff = now() - CLOSED_ROOM_TOMBSTONE_MS;
  for (const [id, info] of closedRooms) {
    if (Number(info?.closedAt || 0) < cutoff) closedRooms.delete(id);
  }
}

function rememberClosedRoom(room, reason = 'room-closed') {
  if (!room?.id) return;
  pruneClosedRooms();
  closedRooms.set(String(room.id), {
    id: String(room.id),
    reason: safeText(reason, 80),
    message: closedRoomMessage(reason),
    closedAt: now(),
    players: room.players.map((player) => String(player?.uid || '')).filter(Boolean)
  });
}

function closedRoomPayload(roomId = '', viewerUid = '') {
  pruneClosedRooms();
  const info = closedRooms.get(String(roomId || ''));
  if (!info) return null;
  const uid = String(viewerUid || '');
  if (Array.isArray(info.players) && info.players.length && !info.players.includes(uid)) return null;
  return { ok: false, error: 'ROOM_CLOSED', reason: info.reason, message: info.message, closedAt: info.closedAt };
}

function logPistiRuntimeError(code = 'PISTI_RUNTIME_ERROR', message = '', context = {}) {
  try {
    const safeContext = {};
    for (const [key, value] of Object.entries(context || {})) {
      if (/password|token|secret|private|hash|salt|key/i.test(key)) continue;
      safeContext[key] = typeof value === 'string' ? sanitizeLogValue(value) : value;
    }
    const entry = {
      level: 'error',
      source: 'pisti',
      category: 'PISTI_RUNTIME_ERROR',
      code: sanitizeLogValue(code),
      message: sanitizeLogValue(message),
      safeContext,
      timestamp: new Date().toJSON()
    };
    console.error(JSON.stringify(entry));
    pushPistiAdminRuntimeLog(entry);
  } catch (_) {}
}

const roomId = () => `pi_${now()}_${crypto.randomBytes(4).toString('hex')}`;

function makeRoomLifecycle(startAt = now()) {
  const createdAt = Number(startAt || now()) || now();
  return {
    primaryDeadlineAt: createdAt + ROOM_TTL_MS,
    extensionPromptAt: 0,
    extensionResponseDeadlineAt: 0,
    extensionDeadlineAt: 0,
    finalDeadlineAt: createdAt + ROOM_TTL_MS,
    extensionState: 'none',
    extensionResponses: {},
    notice: ''
  };
}

function humanPlayers(room = {}) {
  return (Array.isArray(room.players) ? room.players : []).filter((player) => isRealPlayer(player));
}

function normalizeLifecycle(room = {}) {
  room.lifecycle = room.lifecycle || makeRoomLifecycle(room.createdAt || room.updatedAt || now());
  const life = room.lifecycle;
  if (!life.primaryDeadlineAt) life.primaryDeadlineAt = Number(room.createdAt || room.updatedAt || now()) + ROOM_TTL_MS;
  if (!life.finalDeadlineAt) life.finalDeadlineAt = life.primaryDeadlineAt;
  if (!life.extensionResponses || typeof life.extensionResponses !== 'object') life.extensionResponses = {};
  if (!life.extensionState) life.extensionState = 'none';
  return life;
}

function extensionPromptFor(room = {}, viewerUid = '') {
  if (!room || room.status !== 'playing') return null;
  const life = normalizeLifecycle(room);
  if (life.extensionState !== 'pending') return null;
  const uid = String(viewerUid || '');
  const humans = humanPlayers(room).map((player) => String(player.uid || '')).filter(Boolean);
  if (!humans.includes(uid)) return null;
  return {
    active: true,
    promptAt: life.extensionPromptAt || 0,
    responseDeadlineAt: life.extensionResponseDeadlineAt || 0,
    remainingMs: Math.max(0, Number(life.extensionResponseDeadlineAt || 0) - now()),
    acceptedCount: Object.values(life.extensionResponses || {}).filter((value) => value === true).length,
    requiredCount: humans.length,
    myResponse: Object.prototype.hasOwnProperty.call(life.extensionResponses || {}, uid) ? life.extensionResponses[uid] : null,
    message: '60 dakika doldu. İki oyuncu devam etmek isterse Pişti masası 30 dakika uzatılacak.'
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function safeText(value = '', max = 80) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, max);
}

function uidOf(req) {
  return String(req.user?.uid || '').trim();
}

function normalizeModeValue(mode = '') {
  const raw = String(mode || 'bet-2-52').trim().toLowerCase();
  const aliased = LEGACY_MODE_ALIASES[raw] || raw;
  return ALLOWED_PISTI_MODES.has(aliased) ? aliased : '';
}

function parseMode(mode = '') {
  const raw = normalizeModeValue(mode) || 'bet-2-52';
  let economyMode = 'bet';
  let detail = raw;
  if (raw.startsWith('free-reward-')) {
    economyMode = 'free';
    detail = raw.replace('free-reward-', '');
  } else if (raw.startsWith('free-')) {
    economyMode = 'free';
    detail = raw.replace('free-', '');
  } else if (raw.startsWith('bot-')) {
    economyMode = 'bot';
    detail = raw.replace('bot-', '');
  } else if (raw.startsWith('bet-')) {
    economyMode = 'bet';
    detail = raw.replace('bet-', '');
  }
  const [playersPart, deckPart] = detail.split('-');
  const maxPlayers = Math.max(2, Math.min(4, Number(playersPart || 2) || 2));
  const deckSize = Number(deckPart || 52) === 104 ? 104 : 52;
  const isBot = economyMode === 'bot';
  const isFree = economyMode === 'free';
  const isRewardFree = raw === 'free-2-52' || raw === 'free-reward-2-52';
  const isBet = economyMode === 'bet';
  const rewardMc = isRewardFree ? FREE_WIN_REWARD_MC : 0;
  const xpEnabled = isBet;
  const labelMap = {
    'bot-2-52': 'Bota Karşı 52',
    'bot-2-104': 'Bota Karşı 104',
    'free-2-52': 'Bahissiz 2 Kişi Ödüllü',
    'free-reward-2-52': 'Bahissiz 2 Kişi Ödüllü',
    'bet-2-52': 'Bahisli 2/52',
    'bet-2-104': 'Bahisli 2/104',
    'bet-4-52': 'Bahisli 4/52',
    'bet-4-104': 'Bahisli 4/104'
  };
  return {
    value: raw,
    legacyValue: raw.replace(/^bet-/, ''),
    label: labelMap[raw] || raw,
    economyMode,
    isBet,
    isFree,
    isFreeXp: false,
    isRewardFree,
    isBot,
    requiresBet: isBet,
    rewardMc,
    xpEnabled,
    maxPlayers: isBot ? 2 : maxPlayers,
    deckCopies: deckSize === 104 ? 2 : 1,
    deckSize
  };
}

function readBetForMode(value, modeInfo = parseMode('bet-2-52')) {
  if (!modeInfo.requiresBet) return { ok: true, value: 0 };
  const n = Math.trunc(Number(value) || 0);
  if (!Number.isFinite(n) || n < MIN_BET) {
    return { ok: false, status: 400, error: 'PISTI_BET_REQUIRED' };
  }
  if (n > MAX_BET) {
    return { ok: false, status: 400, error: 'PISTI_BET_MAX_EXCEEDED' };
  }
  return { ok: true, value: n };
}

async function ensurePistiBalanceBeforeRoomCreate(uid, bet, modeInfo) {
  if (!modeInfo?.requiresBet || !bet) return { ok: true };
  const balance = await readBalance(uid).catch(() => 0);
  if (Number(balance || 0) < Number(bet || 0)) return { ok: false, status: 409, error: 'INSUFFICIENT_BALANCE', balance };
  return { ok: true, balance };
}

function clampBet(value, modeInfo = parseMode('bet-2-52')) {
  const parsed = readBetForMode(value, modeInfo);
  return parsed.ok ? parsed.value : (modeInfo.requiresBet ? MIN_BET : 0);
}

function createDeck(copies = 1) {
  const suits = ['S', 'H', 'D', 'C'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const cards = [];
  const safeCopies = Math.max(1, Math.min(2, Math.trunc(Number(copies) || 1)));
  for (let copy = 1; copy <= safeCopies; copy += 1) {
    for (const suit of suits) {
      for (const rank of ranks) cards.push(`${rank}${suit}${safeCopies > 1 ? `#${copy}` : ''}`);
    }
  }
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function cardCode(card = '') {
  return String(card || '').split('#')[0];
}

function cardRank(card = '') {
  return cardCode(card).replace(/[SHDC]$/i, '');
}

function cardPoints(card = '') {
  const code = cardCode(card).toUpperCase();
  const rank = cardRank(code);
  if (code === '10D') return 3;
  if (code === '2C') return 2;
  if (rank === 'A' || rank === 'J') return 1;
  return 0;
}

function sumCardPoints(cards = []) {
  return cards.reduce((total, card) => total + cardPoints(card), 0);
}

function createPasswordHash(password = '', salt = '') {
  const raw = safeText(password, 80);
  const safeSalt = String(salt || '').trim();
  if (!raw || !safeSalt) return '';
  return crypto.createHash('sha256').update(`${safeSalt}:${raw}`).digest('hex');
}

function createPasswordRecord(password = '') {
  const raw = safeText(password, 80);
  if (!raw) return { salt: '', hash: '' };
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: createPasswordHash(raw, salt) };
}

function timingSafeEqualText(a = '', b = '') {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function readUserProfile(uid = '') {
  const { db } = initFirebaseAdmin();
  if (!db || !uid) return {};
  const snap = await db.collection('users').doc(uid).get().catch(() => null);
  return snap?.exists ? (snap.data() || {}) : {};
}

async function buildPlayer(req) {
  const uid = uidOf(req);
  const profile = await readUserProfile(uid);
  const username = safeText(profile.username || profile.displayName || profile.fullName || req.user?.name || `Oyuncu-${uid.slice(0, 5)}`, 60);
  return {
    uid,
    name: username,
    username,
    avatar: safeText(profile.avatar || '', 1000),
    selectedFrame: Math.max(0, Math.min(100, Math.floor(Number(profile.selectedFrame || profile.frameLevel || 0) || 0))),
    frameUrl: safeText(profile.marketFrameUrl || profile.frameUrl || '', 1000),
    marketFrameUrl: safeText(profile.marketFrameUrl || profile.frameUrl || '', 1000),
    profileBadgeId: safeText(profile.profileBadgeId || '', 200),
    profileBadgeUrl: safeText(profile.profileBadgeUrl || '', 1000),
    nameEffectId: safeText(profile.nameEffectId || '', 200),
    nameEffectClass: safeText(profile.nameEffectClass || '', 200),
    gameTableThemeId: safeText(profile.gameTableThemeId || '', 200),
    gameTableThemeUrl: safeText(profile.gameTableThemeUrl || '', 1000),
    hand: [],
    capturedCards: [],
    connected: true,
    joinedAt: now(),
    lastSeenAt: now(),
    paidBet: false,
    isBot: false
  };
}

function buildBotPlayer(room) {
  return {
    uid: `pisti_bot_${room.id}`,
    name: 'PlayMatrix',
    username: 'PlayMatrix',
    avatar: '/public/assets/images/logo.png',
    selectedFrame: 100,
    frameUrl: '/public/assets/frames/frame-18.png',
    marketFrameUrl: '/public/assets/frames/frame-18.png',
    profileBadgeId: '',
    profileBadgeUrl: '',
    nameEffectId: '',
    nameEffectClass: '',
    gameTableThemeId: '',
    gameTableThemeUrl: '',
    hand: [],
    capturedCards: [],
    connected: true,
    joinedAt: now(),
    lastSeenAt: now(),
    paidBet: false,
    isBot: true
  };
}

function createRoomShell(req, opts = {}) {
  const modeInfo = parseMode(opts.mode);
  const nameSource = opts.roomName || `${safeText(req.user?.name || '', 28) || 'PlayMatrix'} Masası`;
  const pass = safeText(opts.password || '', 80);
  const passwordRecord = createPasswordRecord(pass);
  const id = roomId();
  return {
    id,
    roomName: safeText(nameSource, 60),
    passwordSalt: passwordRecord.salt,
    passwordHash: passwordRecord.hash,
    hasPassword: !!passwordRecord.hash,
    mode: modeInfo.value,
    modeLabel: modeInfo.label,
    economyMode: modeInfo.economyMode,
    isBotMode: modeInfo.isBot,
    isFreeMode: modeInfo.isFree,
    isRewardFree: modeInfo.isRewardFree,
    isFreeXpMode: false,
    xpEnabled: modeInfo.xpEnabled,
    deckSize: modeInfo.deckSize,
    status: 'waiting',
    bet: clampBet(opts.bet, modeInfo),
    freeRewardMc: modeInfo.rewardMc,
    pot: 0,
    maxPlayers: modeInfo.maxPlayers,
    players: [],
    deck: createDeck(modeInfo.deckCopies),
    tableCards: [],
    pileOwner: -1,
    turn: 0,
    scores: Array(modeInfo.maxPlayers).fill(0),
    cardTotals: Array(modeInfo.maxPlayers).fill(0),
    pistiCounts: Array(modeInfo.maxPlayers).fill(0),
    teamBonusScores: [0, 0],
    lastMajorityTeam: -1,
    winner: [],
    winnerSeats: [],
    resultSummary: null,
    lastEvent: null,
    settlementDone: false,
    processedMoves: new Set(),
    settlementAttempts: 0,
    refundFailures: [],
    xpAwards: {},
    freeRewardClaims: {},
    botMoveScheduled: false,
    stateVersion: 1,
    createdAt: now(),
    updatedAt: now(),
    lastGameActionAt: now(),
    lifecycle: makeRoomLifecycle(now())
  };
}

function roomHostName(room) {
  return room.players[0]?.username || room.players[0]?.name || 'Bilinmeyen';
}

function isBotMode(room) {
  return room?.economyMode === 'bot' || room?.isBotMode === true;
}

function isFreeMode(room) {
  return room?.economyMode === 'free' || room?.isFreeMode === true;
}

function isBetMode(room) {
  return room?.economyMode === 'bet';
}

function isRealPlayer(player) {
  return !!player?.uid && player.isBot !== true && !String(player.uid).startsWith('pisti_bot_');
}

function allowedModeError(mode = '') {
  return { ok: false, error: 'PISTI_MODE_NOT_ALLOWED', allowedModes: [...ALLOWED_PISTI_MODES] };
}

function istanbulDateKey(ts = now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ts));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  } catch (_) {
    return new Date(ts).toJSON().slice(0, 10);
  }
}

function opponentSignatureForFreeReward(room = {}, winnerUid = '') {
  const opponents = (Array.isArray(room.players) ? room.players : [])
    .filter((player) => isRealPlayer(player) && player.uid !== winnerUid)
    .map((player) => String(player.uid || '').trim())
    .filter(Boolean)
    .sort();
  if (!opponents.length) return '';
  return crypto.createHash('sha256').update(opponents.join('|')).digest('hex').slice(0, 24);
}

async function consumeFreeRewardAllowance(uid = '', room = null) {
  const safeUid = String(uid || '').trim();
  const roomId = String(room?.id || '').trim();
  if (!safeUid || !roomId) return { ok: false, allowed: false, error: 'INVALID_FREE_REWARD_CONTEXT' };
  const dateKey = istanbulDateKey();
  const opponentHash = opponentSignatureForFreeReward(room, safeUid);
  const idemKey = `pisti:free-reward:${dateKey}:${safeUid}:${roomId}`;
  const cached = runtimeStore.temporary.get(`idem:${idemKey}`);
  if (cached) return cached;
  const { db } = initFirebaseAdmin();
  if (!db) {
    const counterKey = `pisti:free-reward-counter:${dateKey}:${safeUid}`;
    const opponentKey = opponentHash ? `pisti:free-reward-opponent:${dateKey}:${safeUid}:${opponentHash}` : '';
    const current = Math.max(0, Number(runtimeStore.temporary.get(counterKey) || 0) || 0);
    const opponentCurrent = opponentKey ? Math.max(0, Number(runtimeStore.temporary.get(opponentKey) || 0) || 0) : 0;
    const result = current >= FREE_REWARD_DAILY_LIMIT
      ? { ok: true, allowed: false, reason: 'DAILY_FREE_REWARD_LIMIT', dateKey, remaining: 0, limit: FREE_REWARD_DAILY_LIMIT }
      : opponentKey && opponentCurrent >= FREE_REWARD_OPPONENT_DAILY_LIMIT
        ? { ok: true, allowed: false, reason: 'SAME_OPPONENT_FREE_REWARD_LIMIT', dateKey, remaining: Math.max(0, FREE_REWARD_DAILY_LIMIT - current), opponentUsed: opponentCurrent, opponentLimit: FREE_REWARD_OPPONENT_DAILY_LIMIT, limit: FREE_REWARD_DAILY_LIMIT }
        : { ok: true, allowed: true, reason: 'FREE_REWARD_ALLOWED', dateKey, remaining: Math.max(0, FREE_REWARD_DAILY_LIMIT - current - 1), opponentUsed: opponentCurrent + (opponentKey ? 1 : 0), opponentLimit: FREE_REWARD_OPPONENT_DAILY_LIMIT, limit: FREE_REWARD_DAILY_LIMIT };
    if (result.allowed) {
      runtimeStore.temporary.set(counterKey, String(current + 1), FREE_REWARD_COUNTER_TTL_MS);
      if (opponentKey) runtimeStore.temporary.set(opponentKey, String(opponentCurrent + 1), FREE_REWARD_COUNTER_TTL_MS);
    }
    runtimeStore.temporary.set(`idem:${idemKey}`, result, FREE_REWARD_COUNTER_TTL_MS);
    return result;
  }
  const counterRef = db.collection('pistiFreeRewardCounters').doc(`${dateKey}_${safeUid}`);
  const opponentCounterRef = opponentHash ? db.collection('pistiFreeRewardCounters').doc(`${dateKey}_${safeUid}_vs_${opponentHash}`) : null;
  const idemRef = db.collection('idempotency').doc(idemKey);
  let output = null;
  await db.runTransaction(async (tx) => {
    const reads = [tx.get(idemRef), tx.get(counterRef)];
    if (opponentCounterRef) reads.push(tx.get(opponentCounterRef));
    const [idemSnap, counterSnap, opponentSnap] = await Promise.all(reads);
    if (idemSnap.exists) { output = idemSnap.data().result; return; }
    const data = counterSnap.exists ? (counterSnap.data() || {}) : {};
    const count = Math.max(0, Number(data.count || 0) || 0);
    const oppData = opponentSnap?.exists ? (opponentSnap.data() || {}) : {};
    const opponentCount = Math.max(0, Number(oppData.count || 0) || 0);
    output = count >= FREE_REWARD_DAILY_LIMIT
      ? { ok: true, allowed: false, reason: 'DAILY_FREE_REWARD_LIMIT', dateKey, remaining: 0, limit: FREE_REWARD_DAILY_LIMIT }
      : opponentCounterRef && opponentCount >= FREE_REWARD_OPPONENT_DAILY_LIMIT
        ? { ok: true, allowed: false, reason: 'SAME_OPPONENT_FREE_REWARD_LIMIT', dateKey, remaining: Math.max(0, FREE_REWARD_DAILY_LIMIT - count), opponentUsed: opponentCount, opponentLimit: FREE_REWARD_OPPONENT_DAILY_LIMIT, limit: FREE_REWARD_DAILY_LIMIT }
        : { ok: true, allowed: true, reason: 'FREE_REWARD_ALLOWED', dateKey, remaining: Math.max(0, FREE_REWARD_DAILY_LIMIT - count - 1), opponentUsed: opponentCount + (opponentCounterRef ? 1 : 0), opponentLimit: FREE_REWARD_OPPONENT_DAILY_LIMIT, limit: FREE_REWARD_DAILY_LIMIT };
    if (output.allowed) {
      tx.set(counterRef, { uid: safeUid, dateKey, count: count + 1, updatedAt: now() }, { merge: true });
      if (opponentCounterRef) tx.set(opponentCounterRef, { uid: safeUid, opponentHash, dateKey, count: opponentCount + 1, updatedAt: now() }, { merge: true });
    }
    tx.set(idemRef, { key: idemKey, type: 'pisti-free-reward', uid: safeUid, roomId, opponentHash, mode: room?.mode || '', dateKey, createdAt: now(), result: output }, { merge: false });
  });
  runtimeStore.temporary.set(`idem:${idemKey}`, output, FREE_REWARD_COUNTER_TTL_MS);
  return output;
}

function isTeamRoom(room) {
  return Number(room?.maxPlayers || 0) === 4 && Array.isArray(room?.players) && room.players.length === 4;
}

function teamIdForSeat(seat = 0) {
  return Number(seat) === 0 || Number(seat) === 2 ? 0 : 1;
}

function teamSeats(teamId = 0) {
  return Number(teamId) === 0 ? [0, 2] : [1, 3];
}

function teamName(teamId = 0) {
  return Number(teamId) === 0 ? 'A Takımı' : 'B Takımı';
}

function teamScoresForRoom(room) {
  if (!isTeamRoom(room)) return room.players.map((_, index) => Number(room.scores[index] || 0));
  const bonus = Array.isArray(room.teamBonusScores) ? room.teamBonusScores : [0, 0];
  return [
    Number(room.scores[0] || 0) + Number(room.scores[2] || 0) + Number(bonus[0] || 0),
    Number(room.scores[1] || 0) + Number(room.scores[3] || 0) + Number(bonus[1] || 0)
  ];
}

function winnerSeats(room) {
  if (Array.isArray(room.winnerSeats) && room.winnerSeats.length) return room.winnerSeats;
  if (isTeamRoom(room)) {
    const scores = teamScoresForRoom(room);
    if (scores[0] === scores[1]) return [0, 1, 2, 3];
    return teamSeats(scores[0] > scores[1] ? 0 : 1);
  }
  const scores = room.scores.slice(0, room.players.length).map((score) => Number(score || 0));
  const maxScore = Math.max(...scores);
  if (!Number.isFinite(maxScore)) return [];
  return scores.map((score, index) => score === maxScore ? index : -1).filter((index) => index >= 0);
}

function isDrawResult(room) {
  const seats = winnerSeats(room);
  if (isTeamRoom(room)) return seats.length === 4;
  return seats.length > 1;
}

function viewerTeamId(room, viewerUid = '') {
  const seat = room.players.findIndex((player) => player.uid === String(viewerUid || ''));
  return seat >= 0 && isTeamRoom(room) ? teamIdForSeat(seat) : -1;
}

function verifyRoomPassword(room, password = '') {
  const incoming = createPasswordHash(password, room?.passwordSalt || '');
  return !!incoming && timingSafeEqualText(incoming, room?.passwordHash || '');
}

function calculateFinalBonuses(room) {
  if (room.finalBonusesApplied) return;
  const counts = room.players.map((player) => Array.isArray(player.capturedCards) ? player.capturedCards.length : 0);
  room.cardTotals = counts;
  room.teamBonusScores = [0, 0];
  room.lastMajoritySeat = -1;
  room.lastMajorityTeam = -1;
  if (isTeamRoom(room)) {
    const teamCounts = [Number(counts[0] || 0) + Number(counts[2] || 0), Number(counts[1] || 0) + Number(counts[3] || 0)];
    if (teamCounts[0] !== teamCounts[1] && Math.max(...teamCounts) > 0) {
      const team = teamCounts[0] > teamCounts[1] ? 0 : 1;
      room.teamBonusScores[team] = 3;
      room.lastMajorityTeam = team;
    }
    room.teamCardTotals = teamCounts;
    room.finalBonusesApplied = true;
    return;
  }
  const maxCount = Math.max(0, ...counts);
  const majoritySeats = counts.map((count, index) => count === maxCount && count > 0 ? index : -1).filter((index) => index >= 0);
  if (majoritySeats.length === 1) {
    const seat = majoritySeats[0];
    room.scores[seat] = Number(room.scores[seat] || 0) + 3;
    room.lastMajoritySeat = seat;
  }
  room.finalBonusesApplied = true;
}

function winnerUids(room) {
  if (Array.isArray(room.winner) && room.winner.length) return room.winner;
  return winnerSeats(room).map((seat) => room.players[seat]?.uid).filter(Boolean);
}

function resultSummaryFor(room, viewerUid = '') {
  if (room.status !== 'finished' && room.status !== 'abandoned') return null;
  const viewer = String(viewerUid || '');
  const winners = winnerUids(room);
  const draw = isDrawResult(room);
  const won = winners.includes(viewer);
  const amount = Number(room.resultSummary?.amount || 0) || 0;
  const rewardClaim = room.resultSummary?.rewardClaims?.[viewer] || room.freeRewardClaims?.[viewer] || null;
  const rewardLimitText = rewardClaim && rewardClaim.allowed === false ? ` Günlük ücretsiz ödül hakkınız dolduğu için MC/XP ödülü verilmedi.` : '';
  const mcText = amount > 0 && (!rewardClaim || rewardClaim.allowed !== false) ? ` ${amount.toLocaleString('tr-TR')} MC hesabınıza işlendi.` : '';
  const xpAwarded = Number(room.xpAwards?.[viewer]?.xpAwarded || room.resultSummary?.xpAwards?.[viewer]?.xpAwarded || 0) || 0;
  const xpText = xpAwarded > 0 ? ` +${xpAwarded.toLocaleString('tr-TR')} XP işlendi.` : '';
  const settlementStatus = String(room.resultSummary?.settlementStatus || (room.settlementDone ? 'success' : 'pending'));
  const refunded = Array.isArray(room.resultSummary?.refunded) && room.resultSummary.refunded.includes(viewer);
  const refundStatus = String(room.resultSummary?.refundStatus || '');
  const teamMode = isTeamRoom(room);
  const myTeam = viewerTeamId(room, viewer);
  const winningTeam = teamMode && !draw ? teamIdForSeat(winnerSeats(room)[0]) : -1;
  if (room.status === 'abandoned' || /timeout|expired|cleanup/i.test(String(room.finishReason || ''))) {
    const finishReason = String(room.finishReason || '');
    const closeText = finishReason === 'playing-inactivity-timeout'
      ? 'Masa 5 dakika boyunca gerçek oyun hareketi olmadığı için kapatıldı.'
      : finishReason === 'room-lifetime-expired'
        ? 'Masa 60 dakikalık süre dolduğu için kapatıldı.'
        : 'Masa tamamlanamadı.';
    return {
      gameType: 'pisti',
      resultCode: 'refund',
      settledAt: room.updatedAt,
      outcome: refunded ? 'draw' : 'abandoned',
      title: 'MASA KAPATILDI',
      message: refunded
        ? `${closeText} Giriş ücretiniz güvenli şekilde iade edildi.`
        : refundStatus === 'pending'
          ? `${closeText} İade işlemi güvenli şekilde tekrar denenecek.`
          : closeText
    };
  }
  if (draw) {
    return {
      gameType: 'pisti',
      resultCode: 'draw',
      settledAt: room.updatedAt,
      outcome: won ? 'draw' : 'loss',
      title: 'BERABERE',
      message: room.bet > 0
        ? settlementStatus === 'success'
          ? `Masa berabere bitti. Havuz ${winners.length} oyuncu arasında paylaştırıldı.`
          : 'Masa berabere bitti. Ödeme işlemi güvenli şekilde tekrar denenecek.'
        : 'Masa berabere bitti.'
    };
  }
  if (won) {
    return {
      gameType: 'pisti',
      resultCode: teamMode ? 'team_win' : 'win',
      settledAt: room.updatedAt,
      outcome: 'win',
      title: teamMode ? 'TAKIMINIZ KAZANDI' : 'TEBRİKLER',
      message: room.bet > 0
        ? settlementStatus === 'success'
          ? `${teamMode ? `${teamName(myTeam)} masayı kazandı.` : 'Masayı kazandınız.'}${mcText}${xpText}${rewardLimitText}`
          : `${teamMode ? `${teamName(myTeam)} masayı kazandı.` : 'Masayı kazandınız.'} Ödül işlemi güvenli şekilde tekrar denenecek.`
        : `${teamMode ? `${teamName(myTeam)} masayı kazandı.` : 'Masayı kazandınız.'}${mcText}${xpText}${rewardLimitText}`
    };
  }
  return {
    gameType: 'pisti',
    resultCode: teamMode ? 'team_loss' : 'loss',
    settledAt: room.updatedAt,
    outcome: 'loss',
    title: teamMode ? 'TAKIMINIZ KAYBETTİ' : 'MASAYI KAYBETTİNİZ',
    message: `${teamMode && winningTeam >= 0 ? `${teamName(winningTeam)} kazandı. ` : ''}Şansınızı tekrar deneyin.${xpText}`
  };
}

function publicPlayer(player, index, room, viewerUid = '') {
  const isViewer = player.uid === viewerUid;
  const hand = Array.isArray(player.hand) ? player.hand : [];
  return {
    uid: player.uid,
    name: player.name,
    username: player.username || player.name,
    avatar: player.avatar || '',
    selectedFrame: Number(player.selectedFrame || 0) || 0,
    frameUrl: player.frameUrl || player.marketFrameUrl || '',
    marketFrameUrl: player.marketFrameUrl || player.frameUrl || '',
    profileBadgeId: player.profileBadgeId || '',
    profileBadgeUrl: player.profileBadgeUrl || '',
    nameEffectId: player.nameEffectId || '',
    nameEffectClass: player.nameEffectClass || '',
    gameTableThemeId: player.gameTableThemeId || '',
    gameTableThemeUrl: player.gameTableThemeUrl || '',
    isBot: player.isBot === true,
    seat: index,
    score: Number(room.scores[index] || 0),
    capturedCount: Array.isArray(player.capturedCards) ? player.capturedCards.length : 0,
    pistiCount: Number(room.pistiCounts[index] || 0),
    hand: isViewer ? hand : hand.map(() => 'BACK'),
    handCount: hand.length,
    opponentCardCount: isViewer ? 0 : hand.length,
    connected: player.connected !== false,
    lastSeenAt: player.lastSeenAt || 0
  };
}

function publicRoom(room, viewerUid = '') {
  const isFinal = room.status === 'finished' || room.status === 'abandoned';
  return {
    id: room.id,
    roomName: room.roomName,
    mode: room.mode,
    modeLabel: room.modeLabel,
    economyMode: room.economyMode || 'bet',
    isBotMode: isBotMode(room),
    isFreeMode: isFreeMode(room),
    isRewardFree: room.isRewardFree === true,
    isFreeXpMode: false,
    xpEnabled: room.xpEnabled === true,
    deckSize: room.deckSize,
    status: room.status,
    bet: room.bet,
    freeRewardMc: Number(room.freeRewardMc || 0),
    pot: room.pot,
    maxPlayers: room.maxPlayers,
    currentPlayers: room.players.length,
    isPrivate: !!room.hasPassword,
    hostName: roomHostName(room),
    turn: room.turn,
    tableCards: Array.isArray(room.tableCards) ? room.tableCards : [],
    deckCount: room.deck.length,
    scores: room.scores,
    cardTotals: room.cardTotals,
    pistiCounts: room.pistiCounts,
    teamMode: isTeamRoom(room),
    teamScores: teamScoresForRoom(room),
    teamBonusScores: Array.isArray(room.teamBonusScores) ? room.teamBonusScores : [0, 0],
    teamCardTotals: Array.isArray(room.teamCardTotals) ? room.teamCardTotals : [],
    viewerTeam: viewerTeamId(room, viewerUid),
    winnerSeats: isFinal ? winnerSeats(room) : [],
    isDraw: isFinal ? isDrawResult(room) : false,
    stateVersion: room.stateVersion,
    updatedAt: room.updatedAt,
    createdAt: room.createdAt,
    lifecycle: (() => { const life = normalizeLifecycle(room); return { primaryDeadlineAt: life.primaryDeadlineAt || 0, extensionDeadlineAt: life.extensionDeadlineAt || 0, finalDeadlineAt: life.finalDeadlineAt || 0, extensionState: life.extensionState || 'none', notice: life.notice || '' }; })(),
    extensionPrompt: extensionPromptFor(room, viewerUid),
    finishReason: room.finishReason || '',
    winner: isFinal ? winnerUids(room) : [],
    lastEvent: room.lastEvent || null,
    resultSummary: resultSummaryFor(room, viewerUid),
    settlementStatus: room.resultSummary?.settlementStatus || (room.settlementDone ? 'success' : ''),
    refundStatus: room.resultSummary?.refundStatus || '',
    xpAwards: room.xpAwards || {},
    players: room.players.map((player, index) => publicPlayer(player, index, room, viewerUid))
  };
}

function publicLobbyRoom(room) {
  const view = publicRoom(room, '');
  delete view.tableCards;
  delete view.scores;
  delete view.cardTotals;
  delete view.pistiCounts;
  delete view.lastEvent;
  delete view.resultSummary;
  delete view.winner;
  delete view.winnerSeats;
  delete view.teamCardTotals;
  if (room.hasPassword) {
    view.roomName = 'Özel Pişti Masası';
    view.hostName = 'Gizli Kurucu';
  }
  view.players = view.players.map((player) => ({
    seat: player.seat,
    handCount: player.handCount,
    connected: player.connected
  }));
  return view;
}

function visibleLobbyRooms() {
  return [...rooms.values()].filter((room) => !isBotMode(room) && room.status !== 'finished' && room.status !== 'abandoned').map(publicLobbyRoom);
}

function emitLobby() {
  if (!ioRef) return;
  ioRef.to('pisti:lobby').emit('pisti:lobby', { ok: true, rooms: visibleLobbyRooms(), at: now() });
}

function emitRoom(room) {
  if (!ioRef || !room) return;
  for (const player of room.players) {
    ioRef.to(`pisti:user:${player.uid}`).emit('pisti:update', { ok: true, room: publicRoom(room, player.uid), id: room.id, stateVersion: room.stateVersion, at: now() });
  }
  ioRef.to(`pisti:${room.id}`).emit('pisti:touch', { ok: true, id: room.id, stateVersion: room.stateVersion, updatedAt: room.updatedAt });
}

async function chargePlayer(room, player) {
  if (!room.bet || !isBetMode(room) || player.paidBet || player.isBot) return { ok: true };
  const result = await debitBalance({ uid: player.uid, amount: room.bet, reason: 'pisti-bet', idempotencyKey: `pisti:bet:${room.id}:${player.uid}` });
  if (!result?.ok) return result || { ok: false, error: 'BET_DEBIT_FAILED' };
  player.paidBet = true;
  room.pot += room.bet;
  return result;
}

async function refundPlayer(room, player, reason = 'pisti-refund') {
  if (!room?.bet || !isBetMode(room) || !player?.uid || !player.paidBet || player.isBot) return { ok: true, skipped: true };
  try {
    const result = await creditBalance({ uid: player.uid, amount: room.bet, reason, idempotencyKey: `pisti:refund:${room.id}:${player.uid}:${reason}` });
    if (!result?.ok) {
      logPistiRuntimeError('PISTI_REFUND_FAILED', result?.error || 'Refund credit failed', { roomId: room.id, uid: player.uid, reason });
      return { ok: false, error: result?.error || 'REFUND_FAILED' };
    }
    player.paidBet = false;
    room.pot = Math.max(0, Number(room.pot || 0) - Number(room.bet || 0));
    return result;
  } catch (error) {
    logPistiRuntimeError('PISTI_REFUND_EXCEPTION', error?.message || 'Refund exception', { roomId: room.id, uid: player.uid, reason });
    return { ok: false, error: 'REFUND_FAILED' };
  }
}

async function refundRoom(room, reason = 'pisti-room-refund') {
  const refunded = [];
  const failed = [];
  for (const player of room.players) {
    const result = await refundPlayer(room, player, reason);
    if (result?.ok) {
      if (!result.skipped) refunded.push(player.uid);
    } else {
      failed.push(player.uid);
    }
  }
  room.refundFailures = failed;
  room.resultSummary = {
    refunded,
    refundFailures: failed.length,
    refundStatus: failed.length ? 'pending' : 'success',
    amount: room.bet,
    settledAt: now()
  };
  return { ok: failed.length === 0, refunded, failed };
}

async function addPlayer(req, room) {
  const existing = room.players.find((player) => player.uid === uidOf(req));
  if (existing) {
    existing.connected = true;
    existing.lastSeenAt = now();
    return { ok: true, player: existing, alreadyJoined: true };
  }
  if (room.players.length >= room.maxPlayers) return { ok: false, status: 409, error: 'ROOM_FULL' };
  if (room.status !== 'waiting') return { ok: false, status: 409, error: 'ROOM_NOT_JOINABLE' };
  const player = await buildPlayer(req);
  const charged = await chargePlayer(room, player);
  if (!charged.ok) return { ...charged, status: 409 };
  room.players.push(player);
  room.updatedAt = now();
  room.stateVersion += 1;
  return { ok: true, player, balance: charged.balance };
}

function dealIfReady(room) {
  if (room.status === 'playing' || room.status === 'finished' || room.status === 'abandoned') return;
  if (room.players.length < room.maxPlayers) return;
  room.status = 'playing';
  for (const player of room.players) player.hand = room.deck.splice(0, 4);
  room.tableCards = room.deck.splice(0, 4);
  room.turn = 0;
  room.updatedAt = now();
  room.lastGameActionAt = now();
  room.stateVersion += 1;
  room.lastEvent = { type: 'deal', ts: now(), at: now() };
}

function applyCapture(room, playerIndex, playedCard, tableBefore) {
  const captured = [...tableBefore, playedCard];
  const previousTop = tableBefore[tableBefore.length - 1] || '';
  const isSingleCardTable = tableBefore.length === 1;
  const isSameRank = cardRank(playedCard) === cardRank(previousTop);
  const isJackPisti = isSingleCardTable && cardRank(playedCard) === 'J' && cardRank(previousTop) === 'J';
  const isPisti = isSingleCardTable && isSameRank;
  let points = 0;
  let type = 'capture';
  const capturedCardPoints = sumCardPoints(captured);
  if (isJackPisti) {
    points = 20 + capturedCardPoints;
    type = 'pisti';
  } else if (isPisti) {
    points = 10 + capturedCardPoints;
    type = 'pisti';
  } else {
    points = capturedCardPoints;
  }
  room.players[playerIndex].capturedCards.push(...captured);
  room.scores[playerIndex] = Number(room.scores[playerIndex] || 0) + points;
  if (type === 'pisti') room.pistiCounts[playerIndex] = Number(room.pistiCounts[playerIndex] || 0) + 1;
  room.tableCards = [];
  room.pileOwner = playerIndex;
  room.lastEvent = { type, uid: room.players[playerIndex].uid, seat: playerIndex, points, card: playedCard, tableBefore, capturedCount: captured.length, ts: now(), at: now() };
}


function outcomeForPlayer(room, player) {
  const winners = winnerUids(room);
  if (isDrawResult(room)) return 'draw';
  return winners.includes(player.uid) ? 'win' : 'loss';
}

function xpForPlayer(room, player, rewardClaim = null) {
  if (!room?.xpEnabled || !isRealPlayer(player)) return 0;
  if (isBotMode(room)) return 0;
  if (room.finishReason === 'leave' && room.leaverUid && String(player.uid) === String(room.leaverUid)) return 0;
  const outcome = outcomeForPlayer(room, player);
  if (outcome === 'draw') return 0;
  if (isBetMode(room)) return Math.max(0, Math.floor(Number(room.bet || 0) * PISTI_BET_XP_PER_1000_MC / 1000));
  return 0;
}

async function applyPistiXp({ uid, xp, outcome, roomId, mode }) {
  const safeXp = Math.max(0, Math.trunc(Number(xp || 0)));
  if (!uid || !safeXp) return { ok: true, xpAwarded: 0, progression: getProgression(0) };
  const key = `pisti:xp:${roomId}:${uid}`;
  const memoryKey = `idem:${key}`;
  const cached = runtimeStore.temporary.get(memoryKey);
  if (cached) return cached;
  const { db } = initFirebaseAdmin();
  if (!db) {
    const xpKey = `xp:${uid}`;
    const statsKey = `gameStats:${uid}`;
    const current = normalizeXpBigInt(runtimeStore.temporary.get(xpKey) || 0);
    const before = getProgression(current);
    const xpToAdd = before.isMaxLevel ? 0 : safeXp;
    const next = current + BigInt(xpToAdd);
    const progression = getProgression(next);
    const previousStats = runtimeStore.temporary.get(statsKey) || {};
    const previousPisti = previousStats.pisti && typeof previousStats.pisti === 'object' ? previousStats.pisti : {};
    const previousTotal = previousStats.total && typeof previousStats.total === 'object' ? previousStats.total : {};
    const patchPisti = { ...previousPisti, rounds: Number(previousPisti.rounds || 0) + 1, wins: Number(previousPisti.wins || 0) + (outcome === 'win' ? 1 : 0), losses: Number(previousPisti.losses || 0) + (outcome === 'loss' ? 1 : 0), draws: Number(previousPisti.draws || 0) + (outcome === 'draw' ? 1 : 0) };
    patchPisti.winRatePct = patchPisti.rounds ? Math.round((patchPisti.wins / patchPisti.rounds) * 1000) / 10 : 0;
    const patchTotal = { ...previousTotal, rounds: Number(previousTotal.rounds || 0) + 1, wins: Number(previousTotal.wins || 0) + (outcome === 'win' ? 1 : 0), losses: Number(previousTotal.losses || 0) + (outcome === 'loss' ? 1 : 0), draws: Number(previousTotal.draws || 0) + (outcome === 'draw' ? 1 : 0) };
    patchTotal.winRatePct = patchTotal.rounds ? Math.round((patchTotal.wins / patchTotal.rounds) * 1000) / 10 : 0;
    runtimeStore.temporary.set(xpKey, next.toString(), 30 * 86400000);
    runtimeStore.temporary.set(statsKey, { ...previousStats, pisti: patchPisti, total: patchTotal }, 30 * 86400000);
    const out = { ok: true, firestore: false, xpAwarded: xpToAdd, xpLocked: before.isMaxLevel, xpReason: before.isMaxLevel ? 'MAX_LEVEL_REACHED' : '', progression };
    runtimeStore.temporary.set(memoryKey, out, 24 * 3600000);
    return out;
  }
  const userRef = db.collection('users').doc(uid);
  const idemRef = db.collection('idempotency').doc(key);
  let output = null;
  await db.runTransaction(async (tx) => {
    const idem = await tx.get(idemRef);
    if (idem.exists) { output = idem.data().result; return; }
    const snap = await tx.get(userRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const current = normalizeXpBigInt(data.xp ?? data.accountXp ?? 0);
    const before = getProgression(current);
    const xpToAdd = before.isMaxLevel ? 0 : safeXp;
    const next = current + BigInt(xpToAdd);
    const progression = getProgression(next);
    const gameStats = data.gameStats && typeof data.gameStats === 'object' ? data.gameStats : {};
    const pisti = gameStats.pisti && typeof gameStats.pisti === 'object' ? gameStats.pisti : {};
    const total = gameStats.total && typeof gameStats.total === 'object' ? gameStats.total : {};
    const patchPisti = { ...pisti, rounds: Number(pisti.rounds || 0) + 1, wins: Number(pisti.wins || 0) + (outcome === 'win' ? 1 : 0), losses: Number(pisti.losses || 0) + (outcome === 'loss' ? 1 : 0), draws: Number(pisti.draws || 0) + (outcome === 'draw' ? 1 : 0) };
    patchPisti.winRatePct = patchPisti.rounds ? Math.round((patchPisti.wins / patchPisti.rounds) * 1000) / 10 : 0;
    const patchTotal = { ...total, rounds: Number(total.rounds || 0) + 1, wins: Number(total.wins || 0) + (outcome === 'win' ? 1 : 0), losses: Number(total.losses || 0) + (outcome === 'loss' ? 1 : 0), draws: Number(total.draws || 0) + (outcome === 'draw' ? 1 : 0) };
    patchTotal.winRatePct = patchTotal.rounds ? Math.round((patchTotal.wins / patchTotal.rounds) * 1000) / 10 : 0;
    output = { ok: true, xpAwarded: xpToAdd, xpLocked: before.isMaxLevel, xpReason: before.isMaxLevel ? 'MAX_LEVEL_REACHED' : '', progression };
    tx.set(userRef, { xp: progression.xp, accountXp: progression.currentXp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progression, gameStats: { ...gameStats, pisti: patchPisti, total: patchTotal }, monthlyActiveScore: Number(data.monthlyActiveScore || 0) + 1, updatedAt: now() }, { merge: true });
    tx.set(idemRef, { key, type: 'pisti-xp', uid, roomId, mode, outcome, xp: xpToAdd, requestedXp: safeXp, createdAt: now(), result: output }, { merge: false });
  });
  runtimeStore.temporary.set(memoryKey, output, 24 * 3600000);
  return output;
}

function bestBotCardIndex(room, playerIndex) {
  const hand = room.players[playerIndex]?.hand || [];
  if (!hand.length) return -1;
  const tableBefore = room.tableCards || [];
  const previousTop = tableBefore[tableBefore.length - 1] || '';
  const knownCards = new Set([
    ...tableBefore.map(cardCode),
    ...room.players.flatMap((player) => Array.isArray(player.capturedCards) ? player.capturedCards.map(cardCode) : []),
    ...hand.map(cardCode)
  ]);
  const remainingByRank = (rank) => {
    const copies = Number(room.deckSize || 52) === 104 ? 8 : 4;
    let seen = 0;
    for (const code of knownCards) if (cardRank(code) === rank) seen += 1;
    return Math.max(0, copies - seen);
  };
  const topRank = cardRank(previousTop);
  const canCapture = (card) => previousTop && (cardRank(card) === topRank || cardRank(card) === 'J');
  const tablePointLoad = sumCardPoints(tableBefore);
  const tableDanger = (tableBefore.length === 1 ? 260 : tableBefore.length >= 3 ? 90 : 0) * BOT_DIFFICULTY_MULTIPLIER;
  const captureScore = (card) => {
    const rank = cardRank(card);
    const captured = [...tableBefore, card];
    const isSingle = tableBefore.length === 1;
    const same = rank === topRank;
    const jackPisti = isSingle && rank === 'J' && topRank === 'J';
    const normalPisti = isSingle && same;
    const points = (jackPisti ? 20 : normalPisti ? 10 : 0) + sumCardPoints(captured);
    const clearsRisk = tableBefore.length >= 2 ? 140 : 0;
    const jackTax = rank === 'J' && !jackPisti ? -55 : 0;
    return (2600 + points * 120 + captured.length * 8 + tablePointLoad * 35 + clearsRisk + jackTax + (jackPisti ? 1800 : normalPisti ? 1150 : 0)) * BOT_DIFFICULTY_MULTIPLIER;
  };
  const discardRiskScore = (card) => {
    const rank = cardRank(card);
    const points = cardPoints(card);
    const futureMatches = remainingByRank(rank);
    const isLowValue = points === 0 && rank !== 'J';
    let score = 0;
    score -= points * 70 * BOT_DIFFICULTY_MULTIPLIER;
    score -= futureMatches * (tableBefore.length === 1 ? 24 : 12);
    score -= tableDanger;
    if (rank === 'J') score -= 420 * BOT_DIFFICULTY_MULTIPLIER;
    if (tableBefore.length === 0) score += isLowValue ? 95 : -95;
    if (tableBefore.length === 1) score -= 150;
    if (['Q','K','8','9'].includes(rank)) score += 20;
    if (['A','2','10'].includes(rank)) score -= 60;
    return score;
  };
  let best = { index: 0, score: -Infinity };
  hand.forEach((card, index) => {
    const score = canCapture(card) ? captureScore(card) : discardRiskScore(card);
    if (score > best.score) best = { index, score };
  });
  if (!Number.isFinite(best.score)) {
    const sorted = hand.map((card, index) => ({ index, score: discardRiskScore(card) })).sort((a, b) => b.score - a.score);
    return sorted[0]?.index ?? 0;
  }
  return best.index;
}

function shouldScheduleBotMove(room) {
  if (!room || !isBotMode(room) || room.status !== 'playing') return false;
  const current = room.players[room.turn];
  return current?.isBot === true && !room.botMoveScheduled;
}

function scheduleBotMove(room) {
  if (!shouldScheduleBotMove(room)) return;
  room.botMoveScheduled = true;
  setTimeout(async () => {
    try {
      const live = rooms.get(room.id);
      if (!live || live.status !== 'playing') return;
      const playerIndex = live.turn;
      const bot = live.players[playerIndex];
      if (!bot?.isBot) return;
      const cardIndex = bestBotCardIndex(live, playerIndex);
      if (cardIndex < 0) return;
      await processBotPlay(live, playerIndex, cardIndex);
    } catch (error) {
      logPistiRuntimeError('PISTI_BOT_MOVE_ERROR', error?.message || 'Bot move failed', { roomId: room.id });
    } finally {
      const live = rooms.get(room.id);
      if (live) live.botMoveScheduled = false;
    }
  }, BOT_MOVE_DELAY_MS).unref?.();
}

async function processBotPlay(room, playerIndex, cardIndex) {
  const bot = room.players[playerIndex];
  if (!bot?.isBot || room.status !== 'playing') return;
  const cardToken = bot.hand.splice(cardIndex, 1)[0];
  const tableBefore = room.tableCards.slice();
  room.tableCards.push(cardToken);
  const previousTop = tableBefore[tableBefore.length - 1] || '';
  const rank = cardRank(cardToken);
  const previousRank = cardRank(previousTop);
  if (previousTop && (rank === previousRank || rank === 'J')) applyCapture(room, playerIndex, cardToken, tableBefore);
  else room.lastEvent = { type: 'bot-play', uid: bot.uid, seat: playerIndex, card: cardToken, ts: now(), at: now() };
  if (room.players.every((player) => !player.hand.length)) {
    if (room.deck.length >= room.players.length * 4) {
      for (const player of room.players) player.hand = room.deck.splice(0, 4);
      room.lastEvent = { type: 'deal', ts: now(), at: now() };
    } else {
      await finishRoom(room, 'deck-empty');
    }
  }
  if (room.status !== 'finished') room.turn = (room.turn + 1) % room.players.length;
  room.updatedAt = now();
  room.lastGameActionAt = now();
  room.stateVersion += 1;
  emitRoom(room);
  emitLobby();
}

async function settleRoom(room) {
  if (room.settlementDone) return { ok: true, skipped: true };
  if (room.status !== 'finished') return { ok: true, skipped: true };
  room.settlementAttempts = Number(room.settlementAttempts || 0) + 1;
  const winners = winnerUids(room).filter(Boolean);
  const draw = isDrawResult(room);
  const totalPot = Math.max(0, Math.trunc(Number(room.pot || 0) || 0));
  const credited = [];
  const failed = [];
  const rewardClaims = room.freeRewardClaims && typeof room.freeRewardClaims === 'object' ? room.freeRewardClaims : {};
  let mcReward = 0;
  if (isBotMode(room)) {
    mcReward = 0;
  } else if (room.isRewardFree === true && !draw) {
    mcReward = Math.max(0, Number(room.freeRewardMc || FREE_WIN_REWARD_MC));
  } else if (room.bet > 0 && winners.length > 0) {
    mcReward = Math.floor(totalPot / winners.length);
  }
  if (mcReward > 0 && winners.length > 0) {
    for (const winnerUid of winners) {
      let rewardAllowed = { ok: true, allowed: true, reason: 'BET_REWARD' };
      if (isFreeMode(room)) {
        try {
          rewardAllowed = await consumeFreeRewardAllowance(winnerUid, room);
        } catch (error) {
          rewardAllowed = { ok: false, allowed: false, reason: 'FREE_REWARD_CHECK_FAILED' };
          logPistiRuntimeError('PISTI_FREE_REWARD_CHECK_FAILED', error?.message || 'Free reward allowance failed', { roomId: room.id, uid: winnerUid });
        }
        rewardClaims[winnerUid] = rewardAllowed;
        if (rewardAllowed.allowed !== true) continue;
      }
      try {
        const credit = await creditBalance({ uid: winnerUid, amount: mcReward, reason: isFreeMode(room) ? 'pisti-free-win' : 'pisti-win', idempotencyKey: `pisti:win:${room.id}:${winnerUid}` });
        if (credit?.ok) credited.push(winnerUid);
        else {
          failed.push(winnerUid);
          logPistiRuntimeError('PISTI_SETTLEMENT_FAILED', credit?.error || 'Winner credit failed', { roomId: room.id, uid: winnerUid, amount: mcReward });
        }
      } catch (error) {
        failed.push(winnerUid);
        logPistiRuntimeError('PISTI_SETTLEMENT_EXCEPTION', error?.message || 'Winner credit exception', { roomId: room.id, uid: winnerUid, amount: mcReward });
      }
    }
  }
  room.freeRewardClaims = rewardClaims;
  const xpAwards = {};
  const xpFailed = [];
  for (const player of room.players) {
    if (!isRealPlayer(player)) continue;
    const xp = xpForPlayer(room, player, rewardClaims[player.uid]);
    if (!xp) continue;
    const outcome = outcomeForPlayer(room, player);
    try {
      const xpResult = await applyPistiXp({ uid: player.uid, xp, outcome, roomId: room.id, mode: room.mode });
      xpAwards[player.uid] = xpResult;
      if (!xpResult?.ok) xpFailed.push(player.uid);
    } catch (error) {
      xpAwards[player.uid] = { ok: false, xpAwarded: 0, error: 'PISTI_XP_FAILED' };
      xpFailed.push(player.uid);
      logPistiRuntimeError('PISTI_XP_EXCEPTION', error?.message || 'XP update failed', { roomId: room.id, uid: player.uid, xp });
    }
  }
  room.xpAwards = xpAwards;
  const settlementStatus = failed.length || xpFailed.length ? 'pending' : 'success';
  room.resultSummary = { amount: mcReward, winners, credited, failedCount: failed.length, xpFailedCount: xpFailed.length, totalPot, settlementStatus, xpAwards, rewardClaims, settledAt: now() };
  const recentDraw = winners.length > 1;
  room.players.filter(isRealPlayer).forEach((player) => {
    const won = winners.includes(player.uid);
    const xp = Number(xpAwards?.[player.uid]?.xpAwarded || 0) || 0;
    const amount = won && credited.includes(player.uid) ? mcReward : 0;
    recordRecentActivity({ id: `pisti:${room.id}:${player.uid}`, source: 'pisti', game: 'pisti', title: recentDraw ? 'Pişti Beraberlik' : isBotMode(room) ? 'Pişti Botlu Maç' : 'Pişti Sonucu', username: player.username || player.name || 'Oyuncu', uid: player.uid, amount, xp, score: Number(room.scores?.[player.seat] || 0) || 0, outcome: recentDraw ? 'draw' : won ? 'win' : 'loss', rewardLabel: recentDraw ? 'Beraberlik sonucu' : won ? 'Pişti galibiyeti' : 'Pişti sonucu' });
  });
  if (failed.length || xpFailed.length) return { ok: false, failed, xpFailed };
  room.settlementDone = true;
  return { ok: true, credited, xpAwards };
}

async function finishRoom(room, reason = 'finished') {
  if (room.status === 'finished' || room.status === 'abandoned') return;
  if (room.pileOwner >= 0 && room.tableCards.length) {
    const owner = room.players[room.pileOwner];
    if (owner) {
      owner.capturedCards.push(...room.tableCards);
      room.scores[room.pileOwner] = Number(room.scores[room.pileOwner] || 0) + sumCardPoints(room.tableCards);
    }
  }
  room.tableCards = [];
  calculateFinalBonuses(room);
  room.status = 'finished';
  room.finishReason = reason;
  room.winnerSeats = winnerSeats(room);
  room.winner = winnerUids(room);
  room.updatedAt = now();
  room.lastGameActionAt = now();
  room.stateVersion += 1;
  await settleRoom(room);
}

router.get('/lobby', requireAuth, (_req, res) => {
  res.json({ ok: true, rooms: visibleLobbyRooms(), at: now() });
});

router.post('/play-open', requireAuth, asyncRoute(async (req, res) => {
  if (req.body?.mode && !normalizeModeValue(req.body.mode)) return res.status(400).json(allowedModeError(req.body.mode));
  const modeInfo = parseMode(req.body?.mode);
  const betValue = readBetForMode(req.body?.bet, modeInfo);
  if (!betValue.ok) return res.status(betValue.status).json({ ok: false, error: betValue.error });
  const bet = betValue.value;
  const balanceCheck = await ensurePistiBalanceBeforeRoomCreate(uidOf(req), bet, modeInfo);
  if (!balanceCheck.ok) return res.status(balanceCheck.status || 409).json(balanceCheck);
  let room = null;
  if (!modeInfo.isBot) {
    room = [...rooms.values()].find((item) => !item.hasPassword && item.status === 'waiting' && item.bet === bet && item.mode === modeInfo.value && item.players.length < item.maxPlayers);
  }
  if (!room) {
    room = createRoomShell(req, { mode: modeInfo.value, bet });
    rooms.set(room.id, room);
  }
  const joined = await addPlayer(req, room);
  if (!joined.ok) {
    if (!room.players.length) rooms.delete(room.id);
    return res.status(joined.status || 409).json(joined);
  }
  if (modeInfo.isBot && !room.players.some((player) => player.isBot)) room.players.push(buildBotPlayer(room));
  dealIfReady(room);
  emitRoom(room);
  emitLobby();
  scheduleBotMove(room);
  res.json({ ok: true, room: publicRoom(room, uidOf(req)), balance: joined.balance, queued: room.status === 'waiting' });
}));

router.post('/create-private', requireAuth, asyncRoute(async (req, res) => {
  if (req.body?.mode && !normalizeModeValue(req.body.mode)) return res.status(400).json(allowedModeError(req.body.mode));
  const modeInfo = parseMode(req.body?.mode);
  if (modeInfo.isBot) return res.status(400).json({ ok: false, error: 'BOT_PRIVATE_ROOM_DISABLED' });
  if (modeInfo.isFree) return res.status(400).json({ ok: false, error: 'FREE_PRIVATE_ROOM_DISABLED' });
  const betValue = readBetForMode(req.body?.bet, modeInfo);
  if (!betValue.ok) return res.status(betValue.status).json({ ok: false, error: betValue.error });
  const roomName = safeText(req.body?.roomName || '', 60);
  const password = safeText(req.body?.password || '', 80);
  if (roomName.length < 5) return res.status(400).json({ ok: false, error: 'ROOM_NAME_TOO_SHORT' });
  if (password.length < 5) return res.status(400).json({ ok: false, error: 'ROOM_PASSWORD_TOO_SHORT' });
  const balanceCheck = await ensurePistiBalanceBeforeRoomCreate(uidOf(req), betValue.value, modeInfo);
  if (!balanceCheck.ok) return res.status(balanceCheck.status || 409).json(balanceCheck);
  const room = createRoomShell(req, { ...req.body, roomName, password, bet: betValue.value, mode: modeInfo.value });
  rooms.set(room.id, room);
  const joined = await addPlayer(req, room);
  if (!joined.ok) {
    rooms.delete(room.id);
    return res.status(joined.status || 409).json(joined);
  }
  emitLobby();
  res.json({ ok: true, room: publicRoom(room, uidOf(req)), balance: joined.balance });
}));

router.post('/join', requireAuth, asyncRoute(async (req, res) => {
  const id = String(req.body?.roomId || '');
  const room = rooms.get(id);
  if (!room) {
    const closed = closedRoomPayload(id, uidOf(req));
    if (closed) return res.status(410).json(closed);
    return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  }
  if (room.hasPassword && !verifyRoomPassword(room, req.body?.password || '')) {
    return res.status(403).json({ ok: false, error: 'ROOM_PASSWORD_REQUIRED' });
  }
  if (room.status === 'finished' || room.status === 'abandoned') return res.status(409).json({ ok: false, error: 'ROOM_FINISHED' });
  const joined = await addPlayer(req, room);
  if (!joined.ok) return res.status(joined.status || 409).json(joined);
  dealIfReady(room);
  emitRoom(room);
  emitLobby();
  res.json({ ok: true, room: publicRoom(room, uidOf(req)), balance: joined.balance });
}));

router.get('/state/:roomId', requireAuth, asyncRoute(async (req, res) => {
  const id = String(req.params.roomId || '');
  const room = rooms.get(id);
  if (!room) {
    const closed = closedRoomPayload(id, uidOf(req));
    if (closed) return res.status(410).json(closed);
    return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  }
  if (!room.players.some((player) => player.uid === uidOf(req))) return res.status(403).json({ ok: false, error: 'NOT_IN_ROOM' });
  await enforceRoomLifecycle(room, 'state');
  if (!rooms.has(id)) {
    const closed = closedRoomPayload(id, uidOf(req));
    if (closed) return res.status(410).json(closed);
    return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  }
  if (room.status === 'finished' && !room.settlementDone) await settleRoom(room);
  res.json({ ok: true, room: publicRoom(room, uidOf(req)) });
}));

router.post('/ping', requireAuth, asyncRoute(async (req, res) => {
  const id = String(req.body?.roomId || '');
  const room = rooms.get(id);
  if (!room) {
    const closed = closedRoomPayload(id, uidOf(req));
    if (closed) return res.status(410).json(closed);
    return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  }
  const player = room.players.find((item) => item.uid === uidOf(req));
  if (!player) return res.status(403).json({ ok: false, error: 'NOT_IN_ROOM' });
  player.connected = true;
  player.lastSeenAt = now();
  await enforceRoomLifecycle(room, 'ping');
  if (!rooms.has(id)) {
    const closed = closedRoomPayload(id, uidOf(req));
    if (closed) return res.status(410).json(closed);
    return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  }
  res.json({ ok: true, room: publicRoom(room, uidOf(req)) });
}));


router.post('/extend', requireAuth, asyncRoute(async (req, res) => {
  const result = await recordExtensionDecision(req.body?.roomId, uidOf(req), req.body?.accept !== false);
  res.status(result.status).json(result.payload);
}));


async function processPlay(roomIdValue, playerUid, body = {}) {
  const roomId = String(roomIdValue || '');
  const room = rooms.get(roomId);
  if (!room) {
    const closed = closedRoomPayload(roomId, playerUid);
    if (closed) return { status: 410, payload: closed };
    return { status: 404, payload: { ok: false, error: 'ROOM_NOT_FOUND' } };
  }
  const lifecycle = await enforceRoomLifecycle(room, 'play');
  if (lifecycle?.prompted || normalizeLifecycle(room).extensionState === 'pending') {
    return { status: 409, payload: { ok: false, error: 'ROOM_EXTENSION_PENDING', message: 'Masa süresi doldu. Devam etmek için uzatma kararını vermen gerekiyor.', room: publicRoom(room, playerUid) } };
  }
  if (!rooms.has(roomId)) {
    const closed = closedRoomPayload(roomId, playerUid);
    return closed ? { status: 410, payload: closed } : { status: 404, payload: { ok: false, error: 'ROOM_NOT_FOUND' } };
  }
  if (room.status !== 'playing') return { status: 409, payload: { ok: false, error: 'ROOM_NOT_PLAYING', room: publicRoom(room, playerUid) } };
  const playerIndex = room.players.findIndex((player) => player.uid === playerUid);
  if (playerIndex < 0) return { status: 403, payload: { ok: false, error: 'NOT_IN_ROOM' } };
  const clientMoveId = safeText(body?.clientMoveId || '', 120);
  if (clientMoveId && room.processedMoves?.has(clientMoveId)) return { status: 200, payload: { ok: true, duplicate: true, room: publicRoom(room, playerUid) } };
  if (playerIndex !== room.turn) return { status: 409, payload: { ok: false, error: 'NOT_YOUR_TURN', room: publicRoom(room, playerUid) } };
  const expectedStateVersion = Math.trunc(Number(body?.expectedStateVersion) || 0);
  if (expectedStateVersion && expectedStateVersion !== room.stateVersion) {
    return { status: 409, payload: { ok: false, error: 'STATE_VERSION_MISMATCH', room: publicRoom(room, playerUid) } };
  }
  const token = safeText(body?.cardToken || '', 30);
  const hand = room.players[playerIndex].hand;
  const cardIndex = token ? hand.indexOf(token) : Math.trunc(Number(body?.cardIndex) || -1);
  if (cardIndex < 0 || cardIndex >= hand.length) return { status: 400, payload: { ok: false, error: 'CARD_NOT_IN_HAND', room: publicRoom(room, playerUid) } };
  const cardToken = hand.splice(cardIndex, 1)[0];
  const tableBefore = room.tableCards.slice();
  room.tableCards.push(cardToken);
  const previousTop = tableBefore[tableBefore.length - 1] || '';
  const rank = cardRank(cardToken);
  const previousRank = cardRank(previousTop);
  if (previousTop && (rank === previousRank || rank === 'J')) applyCapture(room, playerIndex, cardToken, tableBefore);
  else room.lastEvent = { type: 'play', uid: playerUid, seat: playerIndex, card: cardToken, ts: now(), at: now() };
  if (room.players.every((player) => !player.hand.length)) {
    if (room.deck.length >= room.players.length * 4) {
      for (const player of room.players) player.hand = room.deck.splice(0, 4);
      room.lastEvent = { type: 'deal', ts: now(), at: now() };
    } else {
      await finishRoom(room, 'deck-empty');
    }
  }
  if (room.status !== 'finished') room.turn = (room.turn + 1) % room.players.length;
  if (clientMoveId) {
    room.processedMoves = room.processedMoves || new Set();
    room.processedMoves.add(clientMoveId);
    if (room.processedMoves.size > 500) room.processedMoves = new Set([...room.processedMoves].slice(-250));
  }
  room.updatedAt = now();
  room.lastGameActionAt = now();
  room.stateVersion += 1;
  emitRoom(room);
  emitLobby();
  scheduleBotMove(room);
  return { status: 200, payload: { ok: true, room: publicRoom(room, playerUid) } };
}

router.post('/play', requireAuth, asyncRoute(async (req, res) => {
  const result = await processPlay(req.body?.roomId, uidOf(req), req.body || {});
  res.status(result.status).json(result.payload);
}));

router.post('/leave', requireAuth, asyncRoute(async (req, res) => {
  const id = String(req.body?.roomId || '');
  const room = rooms.get(id);
  if (!room) {
    const closed = closedRoomPayload(id, uidOf(req));
    if (closed) return res.status(410).json(closed);
    return res.json({ ok: true });
  }
  const playerIndex = room.players.findIndex((player) => player.uid === uidOf(req));
  if (playerIndex < 0) return res.json({ ok: true });
  if (room.status === 'playing') {
    const leaver = room.players[playerIndex];
    const seats = isTeamRoom(room) ? teamSeats(teamIdForSeat(playerIndex) === 0 ? 1 : 0) : room.players.map((_, index) => index).filter((index) => index !== playerIndex);
    const winners = seats.map((seat) => room.players[seat]?.uid).filter(Boolean);
    room.winnerSeats = seats;
    room.winner = winners;
    room.leaverUid = leaver.uid;
    room.status = 'finished';
    room.finishReason = 'leave';
    room.updatedAt = now();
    room.lastGameActionAt = now();
    room.stateVersion += 1;
    await settleRoom(room);
    emitRoom(room);
  } else if (room.status === 'waiting') {
    const leaver = room.players[playerIndex];
    const refund = await refundPlayer(room, leaver, 'pisti-waiting-leave');
    if (!refund?.ok) {
      return res.status(409).json({ ok: false, error: 'REFUND_FAILED', room: publicRoom(room, uidOf(req)) });
    }
    room.players.splice(playerIndex, 1);
    if (!room.players.length) rooms.delete(room.id);
    else {
      room.updatedAt = now();
      room.stateVersion += 1;
      emitRoom(room);
    }
  }
  emitLobby();
  res.json({ ok: true });
}));

async function authenticatePistiSocket(socket) {
  try {
    if (socket.data?.pistiUid) return true;
    const token = String(socket.handshake?.auth?.token || '').trim();
    if (!token) return false;
    const { auth } = initFirebaseAdmin();
    if (!auth) return false;
    const decoded = await auth.verifyIdToken(token);
    const uid = String(decoded.uid || '');
    if (!uid) {
      socket.emit('AUTH_REQUIRED');
      return false;
    }
    socket.data.pistiUid = uid;
    if (socket.data.pistiUid) socket.join(`pisti:user:${socket.data.pistiUid}`);
    return !!socket.data.pistiUid;
  } catch (_) {
    socket.data.pistiUid = '';
    socket.emit('pisti:auth_error', { ok: false, error: 'INVALID_AUTH_TOKEN' });
    return false;
  }
}

function installSocket(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    socket.on('pisti:lobby:subscribe', async (_payload, ack) => {
      if (!(await authenticatePistiSocket(socket))) {
        if (typeof ack === 'function') ack({ ok: false, error: 'AUTH_REQUIRED' });
        return;
      }
      socket.join('pisti:lobby');
      const payload = { ok: true, rooms: visibleLobbyRooms(), at: now() };
      if (typeof ack === 'function') ack(payload);
      socket.emit('pisti:lobby', payload);
    });
    socket.on('pisti:join', async (id, ack) => {
      if (!(await authenticatePistiSocket(socket))) {
        if (typeof ack === 'function') ack({ ok: false, error: 'AUTH_REQUIRED' });
        return;
      }
      const room = rooms.get(String(id || ''));
      if (!room || !room.players.some((player) => player.uid === socket.data.pistiUid)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'NOT_IN_ROOM' });
        return;
      }
      socket.join(`pisti:${room.id}`);
      socket.join(`pisti:user:${socket.data.pistiUid}`);
      const payload = { ok: true, room: publicRoom(room, socket.data.pistiUid) };
      if (typeof ack === 'function') ack(payload);
      socket.emit('pisti:update', { ...payload, id: room.id, stateVersion: room.stateVersion, at: now() });
    });
    socket.on('pisti:play', async (payload = {}, ack) => {
      if (!(await authenticatePistiSocket(socket))) {
        if (typeof ack === 'function') ack({ ok: false, error: 'AUTH_REQUIRED' });
        return;
      }
      const result = await processPlay(payload?.roomId, socket.data.pistiUid, payload || {});
      if (typeof ack === 'function') ack(result.payload);
      if (result.status >= 400) socket.emit('pisti:play:reject', result.payload);
    });
    socket.on('pisti:extend', async (payload = {}, ack) => {
      if (!(await authenticatePistiSocket(socket))) {
        if (typeof ack === 'function') ack({ ok: false, error: 'AUTH_REQUIRED' });
        return;
      }
      const result = await recordExtensionDecision(payload?.roomId, socket.data.pistiUid, payload?.accept !== false);
      if (typeof ack === 'function') ack(result.payload);
      if (result.status >= 400) socket.emit('pisti:extend:reject', result.payload);
    });
    socket.on('pisti:leave', async (id, ack) => {
      if (await authenticatePistiSocket(socket)) socket.leave(`pisti:${String(id || '')}`);
      if (typeof ack === 'function') ack({ ok: true });
    });
  });
}


async function enforceRoomLifecycle(room, source = 'sweep') {
  if (!room || room.status !== 'playing') return { ok: true, skipped: true };
  const t = now();
  const life = normalizeLifecycle(room);
  const humans = humanPlayers(room).filter((player) => player.connected !== false);
  if (life.extensionState === 'none' && t >= Number(life.primaryDeadlineAt || 0)) {
    if (humans.length >= 2) {
      life.extensionState = 'pending';
      life.extensionPromptAt = t;
      life.extensionResponseDeadlineAt = t + ROOM_EXTENSION_RESPONSE_MS;
      life.extensionResponses = {};
      life.notice = 'extension-pending';
      room.updatedAt = t;
      room.stateVersion += 1;
      emitRoom(room);
      emitLobby();
      return { ok: true, prompted: true };
    }
    return closeAndDeleteRoom(room, 'room-lifetime-expired');
  }
  if (life.extensionState === 'pending') {
    const responses = life.extensionResponses || {};
    const humanUids = humanPlayers(room).map((player) => String(player.uid || '')).filter(Boolean);
    if (humanUids.some((uid) => responses[uid] === false)) {
      life.notice = 'extension-rejected';
      return closeAndDeleteRoom(room, 'extension-rejected');
    }
    if (humanUids.length >= 2 && humanUids.every((uid) => responses[uid] === true)) {
      life.extensionState = 'accepted';
      const extensionBase = Number(life.primaryDeadlineAt || 0) || t;
      life.extensionDeadlineAt = extensionBase + ROOM_EXTENSION_MS;
      life.finalDeadlineAt = life.extensionDeadlineAt;
      life.notice = 'extension-accepted';
      room.updatedAt = t;
      room.stateVersion += 1;
      emitRoom(room);
      emitLobby();
      return { ok: true, extended: true };
    }
    if (t >= Number(life.extensionResponseDeadlineAt || 0)) {
      life.notice = 'extension-no-response';
      return closeAndDeleteRoom(room, 'extension-no-response');
    }
  }
  if (life.extensionState === 'accepted' && Number(life.finalDeadlineAt || 0) && t >= Number(life.finalDeadlineAt || 0)) {
    life.notice = 'extension-expired';
    return closeAndDeleteRoom(room, 'extension-expired');
  }
  return { ok: true };
}

async function recordExtensionDecision(roomIdValue = '', playerUid = '', accept = false) {
  const roomId = String(roomIdValue || '');
  const room = rooms.get(roomId);
  if (!room) {
    const closed = closedRoomPayload(roomId, playerUid);
    return closed ? { status: 410, payload: closed } : { status: 404, payload: { ok: false, error: 'ROOM_NOT_FOUND' } };
  }
  const uid = String(playerUid || '');
  if (!room.players.some((player) => player.uid === uid && isRealPlayer(player))) return { status: 403, payload: { ok: false, error: 'NOT_IN_ROOM' } };
  const life = normalizeLifecycle(room);
  if (room.status !== 'playing' || life.extensionState !== 'pending') return { status: 200, payload: { ok: true, ignored: true, room: publicRoom(room, uid) } };
  life.extensionResponses[uid] = !!accept;
  life.notice = accept ? 'extension-accepted-waiting' : 'extension-rejected';
  room.updatedAt = now();
  room.stateVersion += 1;
  const enforced = await enforceRoomLifecycle(room, 'extension-response');
  if (!rooms.has(room.id)) return { status: 200, payload: { ok: true, closed: true, reason: life.notice || 'extension-finished' } };
  emitRoom(room);
  emitLobby();
  return { status: 200, payload: { ok: true, room: publicRoom(room, uid), lifecycle: publicRoom(room, uid).lifecycle } };
}


async function closeAndDeleteRoom(room, reason = 'room-timeout') {
  if (!room) return false;
  if (room.status === 'finished' && !room.settlementDone) {
    const settled = await settleRoom(room);
    if (!settled?.ok) return false;
  }
  if (room.status === 'waiting' || room.status === 'playing') {
    const refund = await refundRoom(room, reason);
    if (!refund?.ok) return false;
    room.status = 'abandoned';
    room.finishReason = reason;
    room.lifecycle = room.lifecycle || makeRoomLifecycle(room.createdAt || now());
    room.lifecycle.notice = reason;
    room.updatedAt = now();
    room.stateVersion += 1;
    emitRoom(room);
  }
  rememberClosedRoom(room, reason);
  rooms.delete(room.id);
  return true;
}

setInterval(() => {
  Promise.resolve().then(async () => {
    const roomLifetimeCutoff = now() - ROOM_TTL_MS;
    const inactivityCutoff = now() - PLAYING_INACTIVITY_MS;
    const finishedCutoff = now() - FINISHED_ROOM_TTL_MS;
    for (const [key, room] of rooms) {
      if ((room.status === 'finished' || room.status === 'abandoned') && room.updatedAt < finishedCutoff) {
        await closeAndDeleteRoom(room, 'finished-cleanup');
        continue;
      }
      if (room.status === 'playing') {
        await enforceRoomLifecycle(room, 'sweep');
        if (!rooms.has(key)) continue;
      } else if (Number(room.createdAt || room.updatedAt || 0) < roomLifetimeCutoff) {
        await closeAndDeleteRoom(room, 'waiting-timeout');
        continue;
      }
      if (room.status === 'playing') {
        const activityAt = Number(room.lastGameActionAt || room.updatedAt || 0);
        if (activityAt < inactivityCutoff) {
          await closeAndDeleteRoom(room, 'playing-inactivity-timeout');
        }
      }
    }
    pruneClosedRooms();
    emitLobby();
  }).catch((error) => logPistiRuntimeError('PISTI_CLEANUP_ERROR', error?.message || 'Cleanup failed'));
}, CLEANUP_INTERVAL_MS).unref();

module.exports = { router, installSocket, _rooms: rooms };
