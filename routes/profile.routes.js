// routes/profile.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Modüllerimiz
const { db, admin } = require('../config/firebase');
const { verifyAuth, tryVerifyOptionalAuth } = require('../middlewares/auth.middleware');
const { profileLimiter, bonusLimiter } = require('../middlewares/rateLimiters');
const { safeNum, cleanStr, isDisposableEmail, containsBlockedUsername, nowMs } = require('../utils/helpers');
const { touchUserActivity, touchUserPresence, touchServerSession } = require('../utils/activity');
const { createNotification } = require('../utils/notifications');
const { recordRewardLedger } = require('../utils/rewardLedger');
const { ACCOUNT_PROGRESSION_VERSION, buildProgressionSnapshot, getAccountLevel, getAccountXp, getVipMembershipScore, normalizeUserRankState } = require('../utils/progression');
const { getSafeCompetitiveElo } = require('../utils/eloSystem');
const { TtlCache } = require('../utils/cache');
const { listActiveSessionsForUid } = require('../utils/gameSession');
const { 
  COMPETITIVE_ELO_DEFAULT, 
  ALLOWED_AVATAR_DOMAIN, 
  ALLOWED_LOCAL_AVATAR_PATH,
  CHAT_RETENTION_POLICY 
} = require('../config/constants');

const colUsers = () => db.collection('users');
const leaderboardCache = new TtlCache(15000, 24);
const colPromos = () => db.collection('promo_codes');
const colUsernames = () => db.collection('usernames');

// ---------------------------------------------------------
// YARDIMCI FONKSİYONLAR (Sadece bu rotada kullanılanlar)
// ---------------------------------------------------------
function getFirestoreTimestampMs(value, fallback = 0) {
  if (value && typeof value.toMillis === 'function') return safeNum(value.toMillis(), fallback);
  if (value instanceof Date) return safeNum(value.getTime(), fallback);
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function pickUserSelectedFrame(user = {}) {
  if (typeof user?.selectedFrame === 'string' && user.selectedFrame.trim()) return user.selectedFrame.trim();
  const numericSelected = Number(user?.selectedFrame);
  if (Number.isFinite(numericSelected) && numericSelected > 0) return Math.floor(numericSelected);
  if (typeof user?.activeFrameClass === 'string' && user.activeFrameClass.trim()) return user.activeFrameClass.trim();
  const numericActive = Number(user?.activeFrame);
  if (Number.isFinite(numericActive) && numericActive > 0) return Math.floor(numericActive);
  return 0;
}

function isAllowedAvatarValue(value = '') {
  const avatar = String(value || '').trim();
  if (!avatar || avatar.length > 250) return false;
  if (avatar.startsWith(ALLOWED_AVATAR_DOMAIN)) return true;
  if (ALLOWED_LOCAL_AVATAR_PATH.test(avatar)) return true;
  return false;
}


function sanitizeStoredUsername(value = '') {
  const username = cleanStr(value || '', 32);
  if (!username) return '';
  if (username.includes('@')) return '';
  return username;
}

async function findUsernameByUid(uid = '') {
  const safeUid = cleanStr(uid || '', 160);
  if (!safeUid) return '';
  try {
    const snap = await colUsernames().where('uid', '==', safeUid).limit(1).get();
    if (snap.empty) return '';
    return sanitizeStoredUsername(snap.docs[0].id);
  } catch (_) {
    return '';
  }
}

async function resolvePublicUsername(uid = '', userData = {}) {
  const direct = sanitizeStoredUsername(userData?.username);
  if (direct) return direct;
  const mapped = await findUsernameByUid(uid);
  if (mapped) return mapped;
  return 'Oyuncu';
}

function hasSameScalarValue(left, right) {
  if (typeof left === 'number' || typeof right === 'number') return safeNum(left, Number.NaN) === safeNum(right, Number.NaN);
  return String(left ?? '') === String(right ?? '');
}

function applyNormalizedRankPatch(user = {}, updates = {}) {
  const normalized = normalizeUserRankState(user);
  let changed = false;
  Object.entries(normalized).forEach(([key, value]) => {
    if (!hasSameScalarValue(user?.[key], value)) {
      updates[key] = value;
      user[key] = value;
      changed = true;
    }
  });
  return changed;
}


// Liderlik tablosu formatlayıcı
async function formatLeaderboardUser(doc, rank = null, extra = {}) {
  const data = doc.data() || {};
  const totalRp = safeNum(data.rp, 0);
  const username = await resolvePublicUsername(doc.id, data);
  const progression = buildProgressionSnapshot(data);
  return {
    uid: doc.id,
    username,
    avatar: isAllowedAvatarValue(data.avatar) ? data.avatar : '',
    rp: totalRp,
    seasonRp: safeNum(data.seasonRp, 0),
    totalRp,
    level: progression.accountLevel,
    accountLevel: progression.accountLevel,
    accountXp: progression.accountXp,
    accountLevelScore: progression.accountLevelScore,
    competitiveScore: progression.competitiveScore,
    totalRank: progression.totalRank,
    totalRankName: progression.totalRank,
    totalRankClass: progression.totalRankClass,
    totalRankScore: progression.totalRankScore,
    seasonScore: progression.seasonScore,
    seasonRank: progression.seasonRank,
    seasonRankName: progression.seasonRank,
    seasonRankClass: progression.seasonRankClass,
    monthlyActiveScore: progression.monthlyActivity,
    chessElo: getSafeCompetitiveElo(data.chessElo, COMPETITIVE_ELO_DEFAULT),
    pistiElo: getSafeCompetitiveElo(data.pistiElo, COMPETITIVE_ELO_DEFAULT),
    vipLevel: progression.vipLevel,
    vipBand: progression.vipBand,
    vipName: progression.vipName,
    vipLabel: progression.vipLabel,
    vipScore: progression.vipScore,
    vipProgress: progression.vipProgress,
    rankName: progression.rank,
    rankClass: progression.rankClass,
    selectedFrame: pickUserSelectedFrame(data),
    progression,
    rank,
    ...extra
  };
}

async function scanUsersByComputedMetric(metric = '', limit = 10, targetUid = '') {
  const safeMetric = cleanStr(metric || '', 64);
  const safeLimit = Math.max(1, Math.min(50, safeNum(limit, 10)));
  const entries = [];
  let lastDoc = null;

  while (true) {
    let query = colUsers().orderBy(admin.firestore.FieldPath.documentId()).limit(250);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const snap = await query.get();
    if (snap.empty) break;

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      let score = 0;
      if (safeMetric === 'accountLevelScore') score = getAccountXp(data);
      else if (safeMetric === 'vipScore') score = getVipMembershipScore(data);
      if (score > 0 || doc.id === targetUid) entries.push({ doc, score });
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 250) break;
  }

  entries.sort((a, b) => b.score - a.score || String(a.doc.id).localeCompare(String(b.doc.id)));
  const topSlice = entries.slice(0, safeLimit);
  const top = await Promise.all(topSlice.map(async (entry, index) => formatLeaderboardUser(entry.doc, index + 1, { [safeMetric]: entry.score })));
  let self = null;
  if (targetUid) {
    const idx = entries.findIndex((entry) => entry.doc.id === targetUid);
    if (idx !== -1) self = await formatLeaderboardUser(entries[idx].doc, idx + 1, { [safeMetric]: entries[idx].score });
  }
  return { top, self };
}

async function getLeaderboardTop(field, limit = 10) {
  const inputField = cleanStr(field || '', 64);
  const safeField = inputField === 'competitiveScore' ? 'rp' : inputField === 'seasonScore' ? 'seasonRp' : inputField;
  if (safeField === 'accountLevelScore') {
    return leaderboardCache.remember(`top:${safeField}:${limit}`, async () => (await scanUsersByComputedMetric(safeField, limit, '')).top, 15000);
  }
  if (safeField === 'vipScore') {
    return leaderboardCache.remember(`top:${safeField}:${limit}`, async () => (await scanUsersByComputedMetric(safeField, limit, '')).top, 15000);
  }
  const cacheKey = `top:${safeField}:${limit}`;
  return leaderboardCache.remember(cacheKey, async () => {
    const snap = await colUsers().orderBy(safeField, 'desc').limit(limit).get();
    return Promise.all(snap.docs.map((doc, index) => formatLeaderboardUser(doc, index + 1)));
  }, 15000);
}

async function getLeaderboardSelfEntry(uid, field) {
  if (!uid) return null;
  const inputField = cleanStr(field || '', 64);
  const safeField = inputField === 'competitiveScore' ? 'rp' : inputField === 'seasonScore' ? 'seasonRp' : inputField;
  if (safeField === 'accountLevelScore' || safeField === 'vipScore') {
    return (await scanUsersByComputedMetric(safeField, 10, uid)).self;
  }

  const selfSnap = await colUsers().doc(uid).get();
  if (!selfSnap.exists) return null;

  const selfData = selfSnap.data() || {};
  const normalizedField = ['rp', 'seasonRp', 'monthlyActiveScore', 'chessElo', 'pistiElo'].includes(safeField) ? safeField : 'seasonRp';
  const currentValue = (normalizedField === 'seasonRp' || normalizedField === 'rp' || normalizedField === 'monthlyActiveScore')
    ? safeNum(selfData[normalizedField], 0)
    : getSafeCompetitiveElo(selfData[normalizedField], COMPETITIVE_ELO_DEFAULT);

  let rank = 1;
  try {
    const higherCountSnap = await colUsers().where(normalizedField, '>', currentValue).count().get();
    rank = safeNum(higherCountSnap.data()?.count, 0) + 1;
  } catch (_) {}

  return formatLeaderboardUser(selfSnap, rank);
}

async function scanVipLeaderboard(limit = 10, targetUid = '') {
  return scanUsersByComputedMetric('vipScore', limit, targetUid);
}

async function getVipLeaderboardTop(limit = 10) {

  return leaderboardCache.remember(`vip:${limit}`, async () => (await scanVipLeaderboard(limit, '')).top, 15000);
}

async function getVipSelfEntry(uid = '') {
  if (!uid) return null;
  return (await scanVipLeaderboard(10, uid)).self;
}

function genReferralCode(uid){
  return crypto.createHash('sha256').update(uid + '|' + nowMs() + '|' + crypto.randomBytes(8).toString('hex')).digest('hex').slice(0,10).toUpperCase();
}

async function findPromoDocIdByNormalized(codeUpper, maxScan = 500) {
  const refs = await colPromos().listDocuments();
  let c = 0;
  for (const ref of refs) {
    c++;
    if (c > maxScan) break;
    if (String(ref.id || '').trim().toUpperCase() === codeUpper) return ref.id;
  }
  return null;
}

// ---------------------------------------------------------
// API UÇ NOKTALARI
// ---------------------------------------------------------

// GET /api/me - Profil verileri ve İlk Giriş/Mail Onay Ödülleri
router.get('/', verifyAuth, async (req, res) => {
  try {
    let uData = await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(req.user.uid);
      const snap = await tx.get(uRef);

      let u = snap.exists
        ? (snap.data() || {})
        : {
            balance: 0,
            email: req.user.email,
            createdAt: nowMs(),
            lastActiveAt: nowMs(),
            lastSeen: nowMs(),
            lastLogin: nowMs(),
            userChangeCount: 0,
            rp: 0,
            rank: 0,
            competitiveScore: 0,
            totalRp: 0,
            totalRank: 'Bronze',
            totalRankKey: 'bronze',
            totalRankClass: 'rank-bronze',
            seasonRp: 0,
            seasonScore: 0,
            seasonRank: 'Bronze',
            seasonRankKey: 'bronze',
            seasonRankClass: 'rank-bronze',
            monthlyActiveScore: 0,
            totalSpentMc: 0,
            totalRounds: 0,
            chessElo: COMPETITIVE_ELO_DEFAULT,
            pistiElo: COMPETITIVE_ELO_DEFAULT,
            notificationsEnabled: true,
            unread_messages: 0
          };
      const updates = {};
      let isUpdated = false;
      const toast = { signup: false, email: false };
      let balanceDelta = 0;
      let grantedSignupReward = false;
      let grantedEmailReward = false;

      if (!cleanStr(u.email) && req.user.email) { updates.email = req.user.email; u.email = req.user.email; isUpdated = true; }
      if (u.rp === undefined || u.rp === null) { updates.rp = 0; u.rp = 0; isUpdated = true; }
      if (u.rank === undefined || u.rank === null) { updates.rank = safeNum(u.rp, 0); u.rank = safeNum(u.rp, 0); isUpdated = true; }
      if (u.chessElo === undefined || u.chessElo === null) { updates.chessElo = COMPETITIVE_ELO_DEFAULT; u.chessElo = COMPETITIVE_ELO_DEFAULT; isUpdated = true; }
      if (u.pistiElo === undefined || u.pistiElo === null) { updates.pistiElo = COMPETITIVE_ELO_DEFAULT; u.pistiElo = COMPETITIVE_ELO_DEFAULT; isUpdated = true; }
      if (u.seasonRp === undefined || u.seasonRp === null) { updates.seasonRp = 0; u.seasonRp = 0; isUpdated = true; }
      if (u.monthlyActiveScore === undefined || u.monthlyActiveScore === null) { updates.monthlyActiveScore = 0; u.monthlyActiveScore = 0; isUpdated = true; }
      if (u.totalSpentMc === undefined || u.totalSpentMc === null) { updates.totalSpentMc = 0; u.totalSpentMc = 0; isUpdated = true; }
      if (u.totalRounds === undefined || u.totalRounds === null) { updates.totalRounds = 0; u.totalRounds = 0; isUpdated = true; }
      if (u.userChangeCount === undefined || u.userChangeCount === null) { updates.userChangeCount = 0; u.userChangeCount = 0; isUpdated = true; }
      if (u.unread_messages === undefined || u.unread_messages === null) { updates.unread_messages = 0; u.unread_messages = 0; isUpdated = true; }
      const normalizedAccountXp = getAccountXp(u);
      const normalizedAccountLevel = getAccountLevel({ ...u, accountXp: normalizedAccountXp });
      if (safeNum(u.accountXp, -1) !== normalizedAccountXp) { updates.accountXp = normalizedAccountXp; u.accountXp = normalizedAccountXp; isUpdated = true; }
      if (safeNum(u.accountLevelScore, -1) !== normalizedAccountXp) { updates.accountLevelScore = normalizedAccountXp; u.accountLevelScore = normalizedAccountXp; isUpdated = true; }
      if (safeNum(u.level, -1) !== normalizedAccountLevel) { updates.level = normalizedAccountLevel; u.level = normalizedAccountLevel; isUpdated = true; }
      if (safeNum(u.accountProgressionVersion, 0) !== ACCOUNT_PROGRESSION_VERSION) { updates.accountProgressionVersion = ACCOUNT_PROGRESSION_VERSION; u.accountProgressionVersion = ACCOUNT_PROGRESSION_VERSION; isUpdated = true; }
      if (u.lastActiveAt === undefined || u.lastActiveAt === null) { updates.lastActiveAt = nowMs(); u.lastActiveAt = nowMs(); isUpdated = true; }
      if (u.lastSeen === undefined || u.lastSeen === null) { updates.lastSeen = nowMs(); u.lastSeen = nowMs(); isUpdated = true; }
      if (!snap.exists) { updates.lastLogin = nowMs(); u.lastLogin = nowMs(); isUpdated = true; }
      if (cleanStr(u.fullName) && !u.fullNameLocked) { updates.fullNameLocked = true; u.fullNameLocked = true; isUpdated = true; }

      if (applyNormalizedRankPatch(u, updates)) isUpdated = true;

      if (!snap.exists && !u.signupRewardClaimed) {
        balanceDelta += 50000;
        updates.signupRewardClaimed = true;
        u.balance = safeNum(u.balance, 0) + 50000;
        u.signupRewardClaimed = true;
        grantedSignupReward = true;
        isUpdated = true;
      }

      if (req.user.email_verified && !u.emailRewardClaimed && !isDisposableEmail(req.user.email)) {
        balanceDelta += 100000;
        updates.emailRewardClaimed = true;
        u.balance = safeNum(u.balance, 0) + 100000;
        u.emailRewardClaimed = true;
        grantedEmailReward = true;
        isUpdated = true;
      }

      if (req.user.email_verified && !u.emailRewardClaimed && isDisposableEmail(req.user.email)) {
        updates.emailRewardBlocked = true; u.emailRewardBlocked = true; isUpdated = true;
      }

      if (u.signupRewardClaimed && !u.signupRewardToastShown) {
        updates.signupRewardToastShown = true; u.signupRewardToastShown = true; toast.signup = true; isUpdated = true;
      }
      if (u.emailRewardClaimed && !u.emailRewardToastShown) {
        updates.emailRewardToastShown = true; u.emailRewardToastShown = true; toast.email = true; isUpdated = true;
      }

      if (balanceDelta > 0) {
        updates.balance = snap.exists ? admin.firestore.FieldValue.increment(balanceDelta) : safeNum(u.balance, 0);
      }

      if (isUpdated) tx.set(uRef, snap.exists ? updates : { ...u, ...updates }, { merge: true });
      return { u, toast, grantedSignupReward, grantedEmailReward };
    });

    Promise.allSettled([
      touchUserActivity(req.user.uid, { scope: 'api_me', login: false }),
      uData.grantedSignupReward ? recordRewardLedger({ uid: req.user.uid, amount: 50000, source: 'signup_reward', referenceId: 'profile_me' }) : Promise.resolve(null),
      uData.grantedSignupReward ? createNotification({ uid: req.user.uid, type: 'reward', title: 'Hoş geldin ödülü', body: 'Kayıt bonusu olarak 50.000 MC hesabına eklendi.' }) : Promise.resolve(null),
      uData.grantedEmailReward ? recordRewardLedger({ uid: req.user.uid, amount: 100000, source: 'email_verify_reward', referenceId: 'profile_me' }) : Promise.resolve(null),
      uData.grantedEmailReward ? createNotification({ uid: req.user.uid, type: 'reward', title: 'E-posta doğrulama ödülü', body: 'E-posta onayı için 100.000 MC hesabına eklendi.' }) : Promise.resolve(null)
    ]).catch(() => null);

    const publicUsername = await resolvePublicUsername(req.user.uid, uData.u);
    const progression = buildProgressionSnapshot(uData.u);
    const safeUser = {
      ...uData.u,
      username: publicUsername,
      fullNameLocked: !!(uData.u.fullNameLocked || cleanStr(uData.u.fullName)),
      usernameChangeLimit: 3,
      usernameChangeRemaining: Math.max(0, 3 - safeNum(uData.u.userChangeCount, 0)),
      seasonRp: safeNum(uData.u.seasonRp, 0),
      monthlyActiveScore: safeNum(uData.u.monthlyActiveScore, 0),
      totalSpentMc: safeNum(uData.u.totalSpentMc, 0),
      totalRounds: safeNum(uData.u.totalRounds, 0),
      chessElo: getSafeCompetitiveElo(uData.u.chessElo, COMPETITIVE_ELO_DEFAULT),
      pistiElo: getSafeCompetitiveElo(uData.u.pistiElo, COMPETITIVE_ELO_DEFAULT),
      unread_messages: safeNum(uData.u.unread_messages, 0),
      accountXp: progression.accountXp,
      accountLevel: progression.accountLevel,
      level: progression.accountLevel,
      accountLevelScore: progression.accountLevelScore,
      competitiveScore: progression.competitiveScore,
      totalRank: progression.totalRank,
      totalRankName: progression.totalRank,
      totalRankClass: progression.totalRankClass,
      totalRankScore: progression.totalRankScore,
      competitiveRankName: progression.competitiveRank,
      competitiveRankClass: progression.competitiveRankClass,
      seasonScore: progression.seasonScore,
      seasonPoints: progression.seasonScore,
      seasonRank: progression.seasonRank,
      seasonRankName: progression.seasonRank,
      seasonRankClass: progression.seasonRankClass,
      monthlyActivity: progression.monthlyActivity,
      activityPassLevel: Math.max(1, Math.floor(safeNum(uData.u.monthlyActiveScore, 0) / 10) + 1),
      vipLevel: progression.vipLevel,
      vipBand: progression.vipBand,
      vipName: progression.vipName,
      vipMembershipTier: progression.vipTier,
      vipLabel: progression.vipLabel,
      vipProgress: progression.vipProgress,
      rankName: progression.rank,
      rankClass: progression.rankClass,
      progression,
      chatPolicy: CHAT_RETENTION_POLICY,
      lastActiveAt: getFirestoreTimestampMs(uData.u.lastActiveAt, nowMs()),
      lastSeen: getFirestoreTimestampMs(uData.u.lastSeen || uData.u.lastActiveAt, nowMs())
    };
    res.json({ ok: true, balance: safeNum(uData.u.balance, 0), user: safeUser, toast: uData.toast });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});


router.get('/me/active-sessions', verifyAuth, async (req, res) => {
  try {
    const sessions = await listActiveSessionsForUid(req.user.uid);
    const items = sessions.map((item) => ({
      ...item,
      resumePath: item.gameType === 'chess' ? './Online Oyunlar/Satranc.html' : './Online Oyunlar/Pisti.html',
      roomKey: `${item.gameType}:${item.roomId}`
    }));
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Aktif oturumlar yüklenemedi.' });
  }
});

// GET /api/check-username
router.get('/check-username', async (req, res) => {
  try {
    const raw = cleanStr(req.query?.username);
    const username = raw.trim().replace(/\s+/g, ' ');
    if (!username) return res.status(400).json({ ok: false, error: 'Kullanıcı adı boş.' });

    if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username)) {
      return res.status(400).json({ ok: false, error: 'Kullanıcı adı geçersiz. (3-20 karakter, harf/sayı/._-)' });
    }

    if (containsBlockedUsername(username)) {
      return res.status(400).json({ ok: false, error: 'Bu kullanıcı adı kullanılamaz.' });
    }

    const key = username.toLowerCase();
    const snap = await db.collection('usernames').doc(key).get();
    return res.json({ ok: true, available: !snap.exists });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Kontrol hatası.' });
  }
});


// POST /api/me/activity/heartbeat - aktiflik ve idle oturumu güncelle
router.post('/me/activity/heartbeat', verifyAuth, async (req, res) => {
  try {
    const status = cleanStr(req.body?.status || 'IDLE', 24).toUpperCase() || 'IDLE';
    const activity = cleanStr(req.body?.activity || 'heartbeat', 80) || 'heartbeat';
    const interactive = req.body?.interactive === true || ['input', 'focus', 'visible', 'pageshow', 'login', 'boot'].some((token) => activity.toLowerCase().includes(token));

    await Promise.allSettled([
      interactive
        ? touchUserActivity(req.user.uid, {
            scope: 'heartbeat',
            sessionId: req.user.sessionId || '',
            status,
            activity
          })
        : touchUserPresence(req.user.uid, {
            sessionId: req.user.sessionId || '',
            status,
            activity
          }),
      interactive && req.user.sessionId
        ? touchServerSession(req.user.sessionId, { ip: req.ip || '', userAgent: req.headers['user-agent'] || '' })
        : Promise.resolve(false)
    ]);
    return res.json({ ok: true, status, activity, interactive, touchedAt: nowMs() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Aktivite güncellenemedi.' });
  }
});

// GET /api/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const viewer = await tryVerifyOptionalAuth(req);
    const [levelTop, seasonTop, activityTop, vipTop, chessTop, pistiTop, selfLevel, selfSeason, selfActivity, selfVip, selfChess, selfPisti] = await Promise.all([
      getLeaderboardTop('accountLevelScore', 5),
      getLeaderboardTop('seasonRp', 5),
      getLeaderboardTop('monthlyActiveScore', 5),
      getVipLeaderboardTop(5),
      getLeaderboardTop('chessElo', 5),
      getLeaderboardTop('pistiElo', 5),
      viewer?.uid ? getLeaderboardSelfEntry(viewer.uid, 'accountLevelScore') : null,
      viewer?.uid ? getLeaderboardSelfEntry(viewer.uid, 'seasonRp') : null,
      viewer?.uid ? getLeaderboardSelfEntry(viewer.uid, 'monthlyActiveScore') : null,
      viewer?.uid ? getVipSelfEntry(viewer.uid) : null,
      viewer?.uid ? getLeaderboardSelfEntry(viewer.uid, 'chessElo') : null,
      viewer?.uid ? getLeaderboardSelfEntry(viewer.uid, 'pistiElo') : null
    ]);

    return res.json({
      ok: true,
      levelTop,
      rankTop: seasonTop,
      seasonTop,
      activityTop,
      monthlyActiveTop: activityTop,
      vipTop,
      chessTop,
      pistiTop,
      self: {
        level: selfLevel,
        rank: selfSeason,
        season: selfSeason,
        activity: selfActivity,
        vip: selfVip,
        chess: selfChess,
        pisti: selfPisti
      }
    });
  } catch (error) { return res.status(500).json({ ok: false, error: 'Liderlik tablosu yüklenemedi.' }); }
});

// GET /api/user-stats/:uid
router.get('/user-stats/:uid', verifyAuth, async (req, res) => {
  try {
    const uid = cleanStr(req.params.uid || '', 128);
    if (!uid || uid === 'undefined' || uid === 'null') return res.status(400).json({ ok: false, error: 'Geçersiz kullanıcı kimliği.' });

    const userDoc = await colUsers().doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı.' });

    const data = userDoc.data() || {};
    const progression = buildProgressionSnapshot(data);
    const chessWins = safeNum(data.chessWins, 0);
    const chessLosses = safeNum(data.chessLosses, 0);
    const pistiWins = safeNum(data.pistiWins, 0);
    const pistiLosses = safeNum(data.pistiLosses, 0);

    return res.json({
      ok: true,
      data: {
        uid,
        username: await resolvePublicUsername(uid, data),
        avatar: isAllowedAvatarValue(data.avatar) ? data.avatar : '',
        level: progression.accountLevel,
        rp: safeNum(data.rp, 0),
        competitiveScore: progression.competitiveScore,
        totalRank: progression.totalRank,
        totalRankClass: progression.totalRankClass,
        createdAt: getFirestoreTimestampMs(data.createdAt, nowMs()),
        lastLogin: getFirestoreTimestampMs(data.lastLogin || data.lastSeen || data.lastActiveAt, nowMs()),
        lastSeen: getFirestoreTimestampMs(data.lastSeen || data.lastActiveAt, nowMs()),
        totalRounds: safeNum(data.totalRounds, chessWins + chessLosses + pistiWins + pistiLosses),
        totalSpentMc: safeNum(data.totalSpentMc, 0),
        chessWins, chessLosses, pistiWins, pistiLosses,
        chessElo: getSafeCompetitiveElo(data.chessElo, COMPETITIVE_ELO_DEFAULT),
        pistiElo: getSafeCompetitiveElo(data.pistiElo, COMPETITIVE_ELO_DEFAULT),
        monthlyActiveScore: safeNum(data.monthlyActiveScore, 0),
        selectedFrame: pickUserSelectedFrame(data),
        seasonRp: progression.seasonScore,
        seasonScore: progression.seasonScore,
        seasonRank: progression.seasonRank,
        seasonRankName: progression.seasonRank,
        seasonRankClass: progression.seasonRankClass,
        vipLabel: progression.vipLabel,
        vipProgress: progression.vipProgress
      }
    });
  } catch (error) { return res.status(500).json({ ok: false, error: 'Sunucu hatası.' }); }
});

// POST /api/profile/update
router.post('/update', verifyAuth, profileLimiter, async (req, res) => {
  try {
    const { fullName, username, avatar, selectedFrame } = req.body || {};
    const uid = req.user.uid;

    await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(uid);
      const snap = await tx.get(uRef);
      const u = snap.exists ? (snap.data() || {}) : { balance: 0, email: req.user.email, createdAt: nowMs(), userChangeCount: 0, rp: 0, rank: 0, competitiveScore: 0, totalRp: 0, totalRank: 'Bronze', totalRankKey: 'bronze', totalRankClass: 'rank-bronze', seasonRp: 0, seasonScore: 0, seasonRank: 'Bronze', seasonRankKey: 'bronze', seasonRankClass: 'rank-bronze', monthlyActiveScore: 0, totalSpentMc: 0, totalRounds: 0, chessElo: COMPETITIVE_ELO_DEFAULT, pistiElo: COMPETITIVE_ELO_DEFAULT };

      const updates = {};
      if (cleanStr(fullName) && !cleanStr(u.fullName)) { updates.fullName = cleanStr(fullName); updates.fullNameLocked = true; }
      if (isAllowedAvatarValue(avatar)) updates.avatar = String(avatar).trim();

      const numericSelectedFrame = Number(selectedFrame);
      if (Number.isFinite(numericSelectedFrame) && numericSelectedFrame > 0) {
        const safeSelectedFrame = Math.max(1, Math.min(100, Math.floor(numericSelectedFrame)));
        const maxUnlockedFrame = getAccountLevel(u);
        if (safeSelectedFrame > maxUnlockedFrame) throw new Error(`Bu çerçeveyi kaydetmek için en az Seviye ${safeSelectedFrame} olmalısın.`);
        updates.selectedFrame = safeSelectedFrame;
      }

      const wanted = cleanStr(username);
      if (wanted && wanted !== cleanStr(u.username)) {
        if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(wanted)) throw new Error("Kullanıcı adı geçersiz. (3-20 karakter, harf/sayı/._-)");
        if (containsBlockedUsername(wanted)) throw new Error("Bu kullanıcı adı kullanılamaz.");
        if (safeNum(u.userChangeCount, 0) >= 3) throw new Error("Kullanıcı adı değiştirme hakkın doldu.");

        const wantedLower = wanted.toLowerCase();
        const usernameRef = db.collection('usernames').doc(wantedLower);
        const uDoc = await tx.get(usernameRef);

        if (uDoc.exists && uDoc.data().uid !== uid) throw new Error("Bu isim kullanımda!");

        if (cleanStr(u.username)) {
          const oldLower = cleanStr(u.username).toLowerCase();
          if (oldLower !== wantedLower) tx.delete(db.collection('usernames').doc(oldLower));
        }

        tx.set(usernameRef, { uid: uid, createdAt: nowMs() }, { merge: true });
        updates.username = wanted;
        updates.userChangeCount = safeNum(u.userChangeCount, 0) + 1;
      }

      const mergedUser = { ...u, ...updates };
      tx.set(uRef, { ...mergedUser, ...normalizeUserRankState(mergedUser) }, { merge: true });
    });

    res.json({ ok: true, selectedFrame: Number.isFinite(Number(selectedFrame)) && Number(selectedFrame) > 0 ? Math.max(1, Math.min(100, Math.floor(Number(selectedFrame)))) : undefined });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/claim-monthly-reward
router.post('/claim-monthly-reward', verifyAuth, async (req, res) => {
  try {
    await colUsers().doc(req.user.uid).set({ pendingReward: admin.firestore.FieldValue.delete() }, { merge: true });
    return res.json({ ok: true });
  } catch (error) { return res.status(500).json({ ok: false, error: 'Ödül onayı işlenemedi.' }); }
});

// POST /api/wheel/spin
router.post('/wheel/spin', verifyAuth, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Çark çevirmek için e-postanızı onaylamalısınız!");

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(colUsers().doc(req.user.uid));
      if (!snap.exists) throw new Error("Kayıt yok!");
      const u = snap.data() || {};
      if ((nowMs() - safeNum(u.lastSpin, 0)) < 86400000) throw new Error("Henüz süre dolmadı.");

      const rewards = [2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000];
      const rnd = crypto.randomInt(0, rewards.length);
      tx.update(colUsers().doc(req.user.uid), { balance: admin.firestore.FieldValue.increment(rewards[rnd]), lastSpin: nowMs() });
      return { index: rnd, prize: rewards[rnd] };
    });
    Promise.allSettled([
      recordRewardLedger({ uid: req.user.uid, amount: out.prize, source: 'wheel_spin', referenceId: `spin:${out.index}` }),
      createNotification({ uid: req.user.uid, type: 'reward', title: 'Günlük çark ödülü', body: `${out.prize} MC hesabına eklendi.`, data: { source: 'wheel_spin', amount: out.prize } })
    ]).catch(() => null);
    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/bonus/claim
router.post('/bonus/claim', verifyAuth, bonusLimiter, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Promosyon kodu kullanmak için e-postanızı onaylamalısınız!");

    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!code) throw new Error("Kod boş.");

    let promoDocId = code;
    const directSnap = await colPromos().doc(promoDocId).get();
    if (!directSnap.exists) {
      const alt = await findPromoDocIdByNormalized(code);
      if (alt) promoDocId = alt;
    }

    const out = await db.runTransaction(async (tx) => {
      const uRef = colUsers().doc(req.user.uid);
      const pRef = colPromos().doc(promoDocId);

      const [uSnap, pSnap] = await Promise.all([tx.get(uRef), tx.get(pRef)]);
      if (!uSnap.exists || !pSnap.exists) throw new Error("Geçersiz işlem.");

      const u = uSnap.data() || {}, p = pSnap.data() || {};
      if (safeNum(p.amount, 0) <= 0) throw new Error("Kod geçersiz veya kullanılmış.");

      if ((u.usedPromos || []).includes(code)) throw new Error("Kod geçersiz veya kullanılmış.");
      if (safeNum(p.limitLeft, -1) === 0) throw new Error("Kod tükenmiş.");

      tx.update(uRef, { balance: admin.firestore.FieldValue.increment(p.amount), usedPromos: admin.firestore.FieldValue.arrayUnion(code) });
      if (safeNum(p.limitLeft, -1) > 0) tx.update(pRef, { limitLeft: admin.firestore.FieldValue.increment(-1) });

      return { amount: p.amount };
    });

    Promise.allSettled([
      recordRewardLedger({ uid: req.user.uid, amount: out.amount, source: 'promo_code', referenceId: code }),
      createNotification({ uid: req.user.uid, type: 'reward', title: 'Promo kod ödülü', body: `${out.amount} MC hesabına eklendi.`, data: { source: 'promo_code', code, amount: out.amount } })
    ]).catch(() => null);
    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/referral/link
router.get('/referral/link', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const uRef = colUsers().doc(uid);
    const snap = await uRef.get();
    if (!snap.exists) throw new Error('Kullanıcı bulunamadı.');
    const u = snap.data() || {};

    let code = u.referralCode;
    if (!code) {
      code = genReferralCode(uid);
      await uRef.set({ referralCode: code }, { merge:true });
    }

    const configuredBase = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    const originHeader = String(req.headers.origin || '').trim().replace(/\/+$/, '');
    const safeBase = configuredBase || originHeader || 'https://playmatrix.com.tr';
    
    res.json({ ok:true, code, link: code ? `${safeBase}/?ref=${code}` : '' });
  } catch(e){ res.json({ ok:false, error:e.message }); }
});

// POST /api/referral/claim
router.post('/referral/claim', verifyAuth, async (req, res) => {
  try {
    if (!req.user.email_verified) throw new Error("Güvenlik: Davet ödülü için önce e-postanızı doğrulamalısınız.");
    if (isDisposableEmail(req.user.email)) throw new Error("Güvenlik: Geçici e-posta ile davet ödülü verilemez.");

    const code = cleanStr((req.body || {}).code).toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(code)) throw new Error("Davet kodu geçersiz.");

    const REF_INVITER_REWARD = 50000;
    const REF_INVITEE_REWARD = 0;

    const out = await db.runTransaction(async (tx) => {
      const uid = req.user.uid;
      const uRef = colUsers().doc(uid);
      const uSnap = await tx.get(uRef);
      if (!uSnap.exists) throw new Error("Kullanıcı bulunamadı.");

      const u = uSnap.data() || {};
      if (u.referredBy || u.referralClaimedAt) throw new Error("Bu hesap zaten bir davet kodu kullanmış.");

      const q = await tx.get(colUsers().where('referralCode', '==', code).limit(1));
      if (q.empty) throw new Error("Davet kodu bulunamadı.");

      const inviterUid = q.docs[0].id;
      if (inviterUid === uid) throw new Error("Kendi davet kodunuz kullanılamaz.");

      tx.set(uRef, { referredBy: inviterUid, referralCodeUsed: code, referralClaimedAt: nowMs() }, { merge: true });

      if (REF_INVITER_REWARD > 0) {
        tx.set(colUsers().doc(inviterUid), { balance: admin.firestore.FieldValue.increment(REF_INVITER_REWARD), referralCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
      }

      if (REF_INVITEE_REWARD > 0) {
        tx.set(uRef, { balance: admin.firestore.FieldValue.increment(REF_INVITEE_REWARD) }, { merge: true });
      }

      return { inviterUid, inviterReward: REF_INVITER_REWARD, inviteeReward: REF_INVITEE_REWARD };
    });

    Promise.allSettled([
      out.inviterReward > 0 ? recordRewardLedger({ uid: out.inviterUid, amount: out.inviterReward, source: 'referral_inviter', referenceId: code, meta: { claimedBy: req.user.uid } }) : Promise.resolve(null),
      out.inviterReward > 0 ? createNotification({ uid: out.inviterUid, type: 'reward', title: 'Davet ödülü', body: `Bir oyuncu davet kodunu kullandı. ${out.inviterReward} MC hesabına eklendi.`, data: { source: 'referral_inviter', amount: out.inviterReward, code, claimedBy: req.user.uid } }) : Promise.resolve(null),
      out.inviteeReward > 0 ? recordRewardLedger({ uid: req.user.uid, amount: out.inviteeReward, source: 'referral_invitee', referenceId: code, meta: { inviterUid: out.inviterUid } }) : Promise.resolve(null),
      out.inviteeReward > 0 ? createNotification({ uid: req.user.uid, type: 'reward', title: 'Davet hoş geldin ödülü', body: `${out.inviteeReward} MC hesabına eklendi.`, data: { source: 'referral_invitee', amount: out.inviteeReward, code, inviterUid: out.inviterUid } }) : Promise.resolve(null)
    ]).catch(() => null);

    res.json({ ok: true, ...out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
