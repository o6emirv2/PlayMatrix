const express = require('express');
const crypto = require('crypto');
const env = require('../config/env');
const { requireAuth, strictLimiter } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { issueAdminAccess, clearAdminAccess, adminAccessCookie, clearAdminAccessCookie, getRequestAdminAccessToken, readAdminAccess } = require('../core/adminAccessService');
const { getProgression } = require('../core/progressionService');
const { runOnce } = require('../core/idempotencyService');
const { normalizeBoolean, normalizeBooleanMap } = require('../core/boolean');
const { readAvatarFrameSettings } = require('../core/avatarFrameSettingsService');
const { listUserActivities } = require('../core/recentActivityService');
const { normalizeBirthDate, validateBirthDate } = require('../core/dateOfBirthService');
const { ensureProfileDates } = require('../core/profileDateService');
const router = express.Router();

const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27%23111827%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Arial%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23fff%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E';
const now = () => Date.now();
const s = (v, max = 200) => String(v || '').trim().slice(0, max);
const sanitizeText = (v, max = 500) => s(v, max).replace(/[<>]/g, '');
function splitFullName(value = '') { const parts = s(value, 120).split(/\s+/).filter(Boolean); return { firstName: parts.shift() || '', lastName: parts.join(' ') || '' }; }
function joinName(firstName = '', lastName = '') { return [s(firstName, 60), s(lastName, 60)].filter(Boolean).join(' ').trim(); }
const uidOf = (req) => s(req.user?.uid || req.headers['x-playmatrix-user'] || req.body?.uid || req.query?.uid || '', 160);

const USERNAME_RULE_MESSAGE = 'Kullanıcı adı 5-20 karakter olmalı; harf, sayı, nokta (.), alt çizgi (_) ve tire (-) kullanılabilir.';
const PERSON_NAME_RULE_MESSAGE = 'İsim ve soyisim ayrı ayrı 3-50 karakter olmalı ve yalnızca Türkçe harflerden oluşmalı.';
const RESERVED_USERNAMES = new Set(['admin','administrator','support','moderator','system','playmatrix','root','owner','official','staff','yonetici','yönetici','destek','sistem']);
function normalizeUsername(value = '') { return s(value, 80).replace(/\s+/g, '').slice(0, 20); }
function usernameState(value = '') {
  const username = normalizeUsername(value);
  if (username.length < 5 || username.length > 20) return { ok:false, username, message: USERNAME_RULE_MESSAGE };
  if (!/^[\p{L}\p{N}._-]+$/u.test(username)) return { ok:false, username, message: USERNAME_RULE_MESSAGE };
  if (RESERVED_USERNAMES.has(username.toLocaleLowerCase('tr-TR'))) return { ok:false, username, message: 'Bu kullanıcı adı sistem tarafından ayrılmıştır. Lütfen farklı bir kullanıcı adı seç.' };
  return { ok:true, username, message:'' };
}
function isValidPersonName(value = '') {
  const raw = s(value, 80);
  return raw.length >= 3 && raw.length <= 50 && /^[\p{L}]{3,50}$/u.test(raw);
}
async function checkUsernameAvailability(username = '', exceptUid = '') {
  const state = usernameState(username);
  if (!state.ok) return { ok: true, available: false, username: state.username, message: state.message, code: 'INVALID_USERNAME' };
  const { db } = fb();
  if (!db) return { ok: true, available: true, username: state.username, firestore: false };
  const lower = state.username.toLocaleLowerCase('tr-TR');
  const snap = await db.collection('users').where('usernameLower', '==', lower).limit(3).get();
  const takenByOther = snap.docs.some((doc) => String(doc.id || '') !== String(exceptUid || ''));
  return { ok: true, available: !takenByOther, username: state.username, code: takenByOther ? 'USERNAME_TAKEN' : '', message: takenByOther ? 'Bu kullanıcı adı kullanılıyor.' : '' };
}

const fb = () => initFirebaseAdmin();
function emailVerified(req) { return !!(req.user?.email_verified || req.user?.emailVerified); }
const MARKET_FRAME_ASSET_COUNT = 32;
function resolveMarketFramePath(value = '', fallback = '') {
  const raw = s(value || fallback || '', 800).replace(/\\/g, '/');
  const direct = raw.match(/^\/?public\/assets\/market\/frames\/market[-_]?0*(\d{1,3})\.(png|webp|jpg|jpeg|svg)$/i);
  const match = direct || raw.match(/market(?:[-_]?frame)?[-_]?0*(\d{1,3})(?:\D|$)/i) || raw.match(/(?:^|[-_])0*(\d{1,3})(?:\.(?:png|webp|jpg|jpeg|svg))?$/i);
  const frameNo = match ? Math.trunc(Number(match[1]) || 0) : 0;
  return frameNo >= 1 && frameNo <= MARKET_FRAME_ASSET_COUNT ? `/public/assets/market/frames/market-${frameNo}.png` : '';
}

const FRAME_TIERS = Object.freeze([
  Object.freeze({ min: 1, max: 15, asset: 1 }), Object.freeze({ min: 16, max: 30, asset: 2 }),
  Object.freeze({ min: 31, max: 40, asset: 3 }), Object.freeze({ min: 41, max: 50, asset: 4 }),
  Object.freeze({ min: 51, max: 60, asset: 5 }), Object.freeze({ min: 61, max: 80, asset: 6 }),
  Object.freeze({ min: 81, max: 85, asset: 7 }), Object.freeze({ min: 86, max: 90, asset: 8 }),
  Object.freeze({ min: 91, max: 91, asset: 9 }), Object.freeze({ min: 92, max: 92, asset: 10 }),
  Object.freeze({ min: 93, max: 93, asset: 11 }), Object.freeze({ min: 94, max: 94, asset: 12 }),
  Object.freeze({ min: 95, max: 95, asset: 13 }), Object.freeze({ min: 96, max: 96, asset: 14 }),
  Object.freeze({ min: 97, max: 97, asset: 15 }), Object.freeze({ min: 98, max: 98, asset: 16 }),
  Object.freeze({ min: 99, max: 99, asset: 17 }), Object.freeze({ min: 100, max: 100, asset: 18 })
]);
function normalizeFrameLevel(value = 0) { const n = Math.floor(Number(value) || 0); return Math.max(0, Math.min(100, n)); }
function frameTierFor(level = 0) { const safe = normalizeFrameLevel(level); return safe > 0 ? FRAME_TIERS.find((tier) => safe >= tier.min && safe <= tier.max) || FRAME_TIERS[FRAME_TIERS.length - 1] : null; }
function canonicalSelectedFrame(value = 0) { const tier = frameTierFor(value); return tier ? tier.min : 0; }
function safeSelectedFrameForLevel(value = 0, accountLevel = 1) { const tier = frameTierFor(value); return !tier || tier.min > normalizeFrameLevel(accountLevel || 1) ? 0 : tier.min; }

function addProgression(profile) {
  const xpRaw = profile.accountXp ?? profile.xp ?? profile.accountLevelScore ?? '0';
  const progression = getProgression(xpRaw);
  const selectedFrame = safeSelectedFrameForLevel(profile.selectedFrame ?? profile.frame ?? 0, progression.level);
  return {
    ...profile,
    selectedFrame,
    xp: progression.xp,
    accountXp: progression.xp,
    currentXp: progression.currentXp,
    accountLevel: progression.level,
    level: progression.level,
    accountLevelProgressPct: progression.progressPercent,
    progressPercent: progression.progressPercent,
    currentLevelStartXp: progression.currentLevelStartXp,
    nextLevelXp: progression.nextLevelXp,
    xpIntoLevel: progression.xpIntoLevel,
    xpToNextLevel: progression.xpToNextLevel,
    isMaxLevel: progression.isMaxLevel,
    formattedXp: progression.formattedXp,
    formattedNextLevelXp: progression.formattedNextLevelXp,
    formattedXpToNextLevel: progression.formattedXpToNextLevel,
    progression
  };
}
function defaultProfile(req, uid, seed = {}) {
  const email = s(req.user?.email || req.user?.firebase?.identities?.email?.[0] || seed.email || '', 160);
  const username = s(seed.username || req.user?.name || req.user?.displayName || `Oyuncu-${String(uid).slice(0,5)}`, 32);
  return addProgression({ uid, email, username, firstName: seed.firstName || '', lastName: seed.lastName || '', birthDate: normalizeBirthDate(seed.birthDate || ''), fullName: seed.fullName || joinName(seed.firstName || '', seed.lastName || ''), displayName: username, avatar: seed.avatar || DEFAULT_AVATAR, selectedFrame: Number(seed.selectedFrame || 0) || 0, balance: Number(seed.balance ?? 50000) || 0, signupBonusClaimed: true, usernameChangeLimit: 3, usernameChangesUsed: 0, xp: 0, accountXp: 0, monthlyActiveScore: 0, totalRounds: 0, createdAt: now(), lastLogin: now(), lastSeen: now(), gameStats: { total: { rounds: 0, wins: 0, losses: 0, winRatePct: 0 }, chess: {}, pisti: {}, crash: {}, classic: {} } });
}
async function grantEmailVerifyRewardIfNeeded(req, uid, profile = {}) {
  if (!uid || !emailVerified(req) || profile.emailVerifyRewardClaimed) return profile;
  const { db, admin } = fb();
  if (!db || !admin) return { ...profile, emailVerified: true, emailVerifyRewardClaimed: true, balance: Number(profile.balance || 0) + 100000 };
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : {};
    if (current.emailVerifyRewardClaimed) return;
    tx.set(ref, { emailVerified: true, emailVerifyRewardClaimed: true, emailVerifyRewardAt: now(), balance: admin.firestore.FieldValue.increment(100000), updatedAt: now() }, { merge: true });
    tx.set(db.collection('audit').doc(`email_verify_${uid}`), { uid, amount: 100000, reason: 'email-verified-reward', at: now() }, { merge: true });
  });
  const fresh = await ref.get().catch(() => null);
  return fresh?.exists ? { ...profile, ...fresh.data(), uid } : { ...profile, emailVerified: true, emailVerifyRewardClaimed: true };
}
async function readProfile(req, uid = uidOf(req), seed = {}) {
  const safeUid = uid || 'guest';
  let profile = defaultProfile(req, safeUid, seed);
  const { db, auth: authAdmin } = fb();
  if (db && uid) {
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (snap.exists) profile = { ...profile, ...snap.data(), uid };
    else await ref.set(profile, { merge: true }).catch(() => null);
    const authEmail = s(req.user?.email || '', 160);
    const authEmailVerified = !!(req.user?.email_verified || req.user?.emailVerified);
    const syncPatch = {};
    if (authEmail && profile.email !== authEmail) { syncPatch.email = authEmail; profile.email = authEmail; }
    if (profile.emailVerified !== authEmailVerified) { syncPatch.emailVerified = authEmailVerified; profile.emailVerified = authEmailVerified; if (authEmailVerified) syncPatch.emailVerifiedAt = now(); }
    if (authEmailVerified && profile.pendingEmail && String(profile.pendingEmail).toLowerCase() === String(authEmail).toLowerCase()) { syncPatch.pendingEmail = ''; profile.pendingEmail = ''; }
    if (Object.keys(syncPatch).length) await ref.set({ ...syncPatch, updatedAt: now() }, { merge: true }).catch(() => null);
  }
  const memoryBalance = runtimeStore.temporary.get(`balance:${safeUid}`);
  if (typeof memoryBalance === 'number') profile.balance = memoryBalance;
  const memoryStats = runtimeStore.temporary.get(`gameStats:${safeUid}`);
  if (memoryStats && typeof memoryStats === 'object') {
    profile.gameStats = { ...(profile.gameStats || {}), ...memoryStats, total: { ...((profile.gameStats || {}).total || {}), ...(memoryStats.total || {}) } };
    profile.totalRounds = Number(profile.gameStats.total?.rounds || profile.totalRounds || 0);
  }
  profile = await grantEmailVerifyRewardIfNeeded(req, uid, profile);
  profile = await ensureProfileDates({ uid, profile, db, auth: authAdmin, touch: true });
  const split = splitFullName(profile.fullName || profile.name || '');
  profile.firstName = s(profile.firstName || split.firstName, 60);
  profile.lastName = s(profile.lastName || split.lastName, 60);
  profile.fullName = s(profile.fullName || joinName(profile.firstName, profile.lastName), 120);
  profile.usernameChangeLimit = Math.max(0, Number(profile.usernameChangeLimit ?? 3) || 3);
  profile.usernameChangesUsed = Math.max(0, Number(profile.usernameChangesUsed ?? profile.usernameChangeCount ?? 0) || 0);
  profile.usernameChangesLeft = Math.max(0, profile.usernameChangeLimit - profile.usernameChangesUsed);
  profile.birthDate = normalizeBirthDate(profile.birthDate || profile.dateOfBirth || '');
  delete profile.dateOfBirth;
  return addProgression(profile);
}
async function writeProfile(uid, patch) { const { db } = fb(); if (db && uid) await db.collection('users').doc(uid).set({ ...patch, updatedAt: now() }, { merge: true }); }
async function addBalance(uid, amount, reason, key) {
  const { db, admin } = fb();
  const safeAmount = Math.floor(Number(amount) || 0);
  if (!uid || !safeAmount) return { ok: true, amount: safeAmount, reason, firestore: false };
  if (!db || !admin) {
    const current = Math.max(0, Number(runtimeStore.temporary.get(`balance:${uid}`) ?? 50000) || 0);
    if (safeAmount < 0 && current + safeAmount < 0) return { ok:false, error:'INSUFFICIENT_BALANCE', balance: current };
    const next = Math.max(0, current + safeAmount);
    runtimeStore.temporary.set(`balance:${uid}`, next, 30 * 86400000);
    return { ok: true, amount: safeAmount, reason, firestore: false, balance: next };
  }
  return runOnce({ key, db, execute: async () => {
    const userRef = db.collection('users').doc(uid);
    let nextBalance = 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const current = Math.max(0, Number((snap.exists ? snap.data().balance : 0) || 0));
      if (safeAmount < 0 && current + safeAmount < 0) throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { statusCode: 409, current });
      nextBalance = Math.max(0, current + safeAmount);
      tx.set(userRef, { balance: nextBalance, updatedAt: now() }, { merge: true });
      tx.set(db.collection('audit').doc(`economy_${crypto.randomUUID()}`), { uid, amount: safeAmount, reason, balanceAfter: nextBalance, at: now() }, { merge: true });
    });
    return { ok: true, amount: safeAmount, reason, balance: nextBalance };
  }});
}
function runtimePayload() { return { ok: true, runtime: { version: 8, environment: env.nodeEnv, publicBaseUrl: env.publicBaseUrl, canonicalOrigin: env.canonicalOrigin, apiBase: env.publicApiBase || env.publicBackendOrigin, expectedFirebaseProjectId: env.firebase.publicConfig.projectId, firebase: env.firebase.publicConfig, firebaseReady: true, source: 'render-env-contract' }, apiBase: env.publicApiBase || env.publicBackendOrigin, canonicalOrigin: env.canonicalOrigin, firebase: env.firebase.publicConfig }; }
const LEADERBOARD_CACHE_KEY = 'home:leaderboard:v8';
const LEADERBOARD_CACHE_TTL_MS = 60 * 1000;
const LEADERBOARD_SELECT_FIELDS = ['username','displayName','avatar','selectedFrame','frameUrl','marketFrameUrl','marketFrameId','marketEquipped','equippedMarket','cosmeticSlots','accountXp','xp','accountLevel','level','monthlyActiveScore'];
async function leaderboardQuery(field = 'accountXp', limit = 10) {
  const { db } = fb();
  if (!db) return [];
  const safeLimit = Math.max(10, Math.min(50, Math.trunc(Number(limit) || 10)));
  let query = db.collection('users').orderBy(field, 'desc').limit(safeLimit);
  try {
    const snap = await query.select(...LEADERBOARD_SELECT_FIELDS).get();
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (_) {
    const snap = await query.get();
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  }
}
async function leaderboardFallbackProfiles(limit = 10) {
  const { db } = fb();
  if (!db) return [];
  try {
    const safeLimit = Math.max(30, Math.min(120, Math.trunc(Number(limit) || 10) * 6));
    let query = db.collection('users').limit(safeLimit);
    let snap;
    try {
      snap = await query.select(...LEADERBOARD_SELECT_FIELDS).get();
    } catch (_) {
      snap = await query.get();
    }
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch { return []; }
}
async function leaderboardProfiles(limit = 10) {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(Number(limit) || 10)));
  const cached = runtimeStore.temporary.get(LEADERBOARD_CACHE_KEY);
  if (cached && typeof cached === 'object' && Array.isArray(cached.level) && Array.isArray(cached.activity)) return cached;
  try {
    const [levelRows, activityRows] = await Promise.all([
      leaderboardQuery('accountXp', safeLimit),
      leaderboardQuery('monthlyActiveScore', safeLimit)
    ]);
    const payload = {
      level: [...levelRows].sort((a,b)=> xpBig(b.accountXp ?? b.xp) > xpBig(a.accountXp ?? a.xp) ? 1 : xpBig(b.accountXp ?? b.xp) < xpBig(a.accountXp ?? a.xp) ? -1 : 0).slice(0, safeLimit),
      activity: [...activityRows].sort((a,b)=>Number(b.monthlyActiveScore||0)-Number(a.monthlyActiveScore||0)).slice(0, safeLimit),
      source: 'indexed'
    };
    runtimeStore.temporary.set(LEADERBOARD_CACHE_KEY, payload, LEADERBOARD_CACHE_TTL_MS);
    return payload;
  } catch {
    const rows = await leaderboardFallbackProfiles(safeLimit);
    const payload = {
      level: [...rows].sort((a,b)=> xpBig(b.accountXp ?? b.xp) > xpBig(a.accountXp ?? a.xp) ? 1 : xpBig(b.accountXp ?? b.xp) < xpBig(a.accountXp ?? a.xp) ? -1 : 0).slice(0, safeLimit),
      activity: [...rows].sort((a,b)=>Number(b.monthlyActiveScore||0)-Number(a.monthlyActiveScore||0)).slice(0, safeLimit),
      source: 'fallback'
    };
    runtimeStore.temporary.set(LEADERBOARD_CACHE_KEY, payload, LEADERBOARD_CACHE_TTL_MS);
    return payload;
  }
}
function xpBig(value = 0) { try { const raw = String(value ?? '0').replace(/[^0-9]/g, ''); return raw ? BigInt(raw) : 0n; } catch { return 0n; } }
function safeMetricNumber(value = 0) { const big = xpBig(value); return big > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(big); }
function activeMarketFrameForProfile(p = {}) { const slot = p.cosmeticSlots?.frame || {}; const id = s(p.marketFrameId || p.marketEquipped?.frame || p.marketEquipped?.frames || p.equippedMarket?.frame || p.equippedMarket?.frames || (slot.source === 'market' ? slot.itemId : ''), 140); return id ? resolveMarketFramePath(p.marketFrameUrl || p.frameUrl || '', id) : ''; }
function lbItems(list, metric) {
  return list.map((raw, i) => {
    const p = addProgression(raw);
    const xpExact = String(p.accountXp || p.xp || '0');
    const marketFrameUrl = activeMarketFrameForProfile(p);
    return {
      username: s(p.username || p.displayName || 'Oyuncu', 32),
      avatar: s(p.avatar || DEFAULT_AVATAR, 500),
      selectedFrame: marketFrameUrl ? 0 : (Number(p.selectedFrame || 0) || 0),
      marketFrameUrl,
      frameUrl: marketFrameUrl,
      marketFrameId: marketFrameUrl ? s(p.marketFrameId || p.marketEquipped?.frames || p.cosmeticSlots?.frame?.itemId || '', 140) : '',
      accountXp: safeMetricNumber(xpExact),
      accountXpExact: xpExact,
      accountLevel: Math.max(1, Math.min(100, Number(p.accountLevel || 1) || 1)),
      monthlyActiveScore: Math.max(0, Number(p.monthlyActiveScore || 0) || 0),
      leaderboard: {
        rank: i + 1,
        metricKey: metric === 'activity' ? 'monthlyActiveScore' : 'accountXp',
        metricLabel: metric === 'activity' ? 'Aylık Aktiflik' : 'Hesap XP',
        metricValue: metric === 'activity' ? Math.max(0, Number(p.monthlyActiveScore || 0) || 0) : safeMetricNumber(xpExact),
        metricValueExact: metric === 'activity' ? String(Math.max(0, Number(p.monthlyActiveScore || 0) || 0)) : xpExact
      }
    };
  });
}

function gameProfileFromReq(req, fallbackName = 'Oyuncu') { const u = req.__pmProfile || {}; const marketFrameUrl = activeMarketFrameForProfile(u); return { uid: uidOf(req), username: u.username || u.displayName || fallbackName, avatar: u.avatar || DEFAULT_AVATAR, selectedFrame: marketFrameUrl ? 0 : (Number(u.selectedFrame || 0) || 0), marketFrameUrl, frameUrl: marketFrameUrl, marketFrameId: marketFrameUrl ? s(u.marketFrameId || u.marketEquipped?.frame || u.marketEquipped?.frames || u.cosmeticSlots?.frame?.itemId || '', 140) : '' }; }
async function attachProfile(req, _res, next) { try { req.__pmProfile = await readProfile(req, uidOf(req)); } catch (_) { req.__pmProfile = defaultProfile(req, uidOf(req) || 'guest'); } next(); }

function matrixSecret() {
  return [process.env.ADMIN_PANEL_SECOND_FACTOR_HASH_HEX || '', process.env.ADMIN_PANEL_SECOND_FACTOR_SALT_HEX || '', process.env.ADMIN_PANEL_THIRD_FACTOR_NAME || '', process.env.ADMIN_UIDS || '', process.env.ADMIN_EMAILS || '', process.env.FIREBASE_PROJECT_ID || '', 'playmatrix_admin_matrix_v2'].join('|');
}
function b64(v=''){ return Buffer.from(String(v),'utf8').toString('base64url'); }
function unb64(v=''){ try { return Buffer.from(String(v),'base64url').toString('utf8'); } catch { return ''; } }
function signMatrix(payload={}){ const body=b64(JSON.stringify(payload)); const sig=crypto.createHmac('sha256', matrixSecret()).update(body).digest('base64url'); return `${body}.${sig}`; }
function verifyMatrixToken(token='') { const raw=String(token||'').trim(); const i=raw.lastIndexOf('.'); if(i<=0)return null; const body=raw.slice(0,i), sig=raw.slice(i+1); const expected=crypto.createHmac('sha256', matrixSecret()).update(body).digest('base64url'); const a=Buffer.from(sig), b=Buffer.from(expected); if(a.length!==b.length || !crypto.timingSafeEqual(a,b))return null; try{return JSON.parse(unb64(body));}catch{return null;} }
function primaryAdmin(){ return { uid: env.adminUids[0] || '', email: env.adminEmails[0] || '' }; }
function isConfiguredAdmin(email='', uid=''){ const e=String(email||'').trim().toLowerCase(); const u=String(uid||'').trim(); return (!!e && env.adminEmails.includes(e)) || (!!u && env.adminUids.includes(u)); }
function compareHex(a='',b=''){ const x=String(a||'').toLowerCase(), y=String(b||'').toLowerCase(); if(!x||!y||x.length!==y.length)return false; return crypto.timingSafeEqual(Buffer.from(x),Buffer.from(y)); }
function verifySecondFactor(password=''){ const raw=String(process.env.ADMIN_PANEL_SECOND_FACTOR||''); if(raw && String(password||'')===raw)return true; const stored=String(process.env.ADMIN_PANEL_SECOND_FACTOR_HASH_HEX||'').toLowerCase(); const saltHex=String(process.env.ADMIN_PANEL_SECOND_FACTOR_SALT_HEX||''); if(!stored)return false; const pwd=Buffer.from(String(password||''),'utf8'); const salt=/^[0-9a-f]+$/i.test(saltHex)&&saltHex.length%2===0?Buffer.from(saltHex,'hex'):Buffer.from(saltHex,'utf8'); const candidates=Array.from(new Set([crypto.createHash('sha256').update(Buffer.concat([salt,pwd])).digest('hex'),crypto.createHash('sha256').update(Buffer.concat([pwd,salt])).digest('hex'),crypto.createHash('sha256').update(`${saltHex}${String(password||'')}`).digest('hex'),crypto.createHash('sha256').update(`${String(password||'')}${saltHex}`).digest('hex'),crypto.createHmac('sha256',salt).update(pwd).digest('hex')])); return candidates.some(x=>compareHex(x,stored)); }
function verifyThirdFactor(name=''){ const expected=String(process.env.ADMIN_PANEL_THIRD_FACTOR_NAME||'').trim(); const value=String(name||'').trim(); if(!expected||!value)return false; const a=Buffer.from(value.normalize('NFKC')); const b=Buffer.from(expected.normalize('NFKC')); return a.length===b.length && crypto.timingSafeEqual(a,b); }
function issueClientKey(payload={}){ return signMatrix({ typ:'pm_admin_client_key', ...payload, issuedAt:now(), expiresAt:now()+12*3600000, nonce:crypto.randomBytes(10).toString('hex') }); }
function verifyClientKey(key=''){ const payload=verifyMatrixToken(key); if(!payload||payload.typ!=='pm_admin_client_key')return {ok:false,code:'INVALID_CLIENT_KEY'}; if(Number(payload.expiresAt||0)<now())return {ok:false,code:'CLIENT_KEY_EXPIRED'}; return {ok:true,payload}; }
function adminContext(uid='',email=''){ return { isAdmin:true, uid, email, role:'owner', roles:['owner'], permissions:['admin.read','users.read','users.write','rewards.write','rewards.read','system.read','moderation.write'], source:'env', resolutionChain:['env:ADMIN_EMAILS','env:ADMIN_UIDS'] }; }
function adminAccessFromReq(req){ const token=getRequestAdminAccessToken(req); if(!token)return null; const access=readAdminAccess(token); return access?.uid?{token,...access}:null; }
router.get('/auth/admin/matrix/identity', requireAuth, (req,res)=>{ const uid=String(req.user?.uid||''); const email=String(req.user?.email||'').trim().toLowerCase(); if(!isConfiguredAdmin(email,uid))return res.status(403).json({ok:false,authenticated:true,admin:false,user:{uid,email},error:'ADMIN_REQUIRED'}); return res.json({ok:true,authenticated:true,admin:true,user:{uid,email},adminContext:adminContext(uid,email)}); });
router.post('/auth/admin/matrix/step-email', requireAuth, strictLimiter, (req,res)=>{ const email=String(req.user?.email||'').trim().toLowerCase(); const uid=String(req.user?.uid||'').trim(); if(!email||!isConfiguredAdmin(email,uid))return res.status(403).json({ok:false,error:'ADMIN_REQUIRED'}); res.json({ok:true,boundToSession:true,manualFallback:false,email,ticket:signMatrix({typ:'pm_admin_step',uid,email,stage:2,issuedAt:now(),expiresAt:now()+7*60000,nonce:crypto.randomBytes(12).toString('hex')}),admin:adminContext(uid,email)}); });
router.post('/auth/admin/matrix/step-password',strictLimiter,(req,res)=>{ const payload=verifyMatrixToken(req.body?.ticket||''); if(!payload||payload.typ!=='pm_admin_step'||Number(payload.stage)!==2||Number(payload.expiresAt||0)<now())return res.status(401).json({ok:false,error:'Güvenlik oturumu geçersiz.'}); if(!verifySecondFactor(req.body?.password||''))return res.status(403).json({ok:false,error:'Güvenlik şifresi doğrulanamadı.'}); res.json({ok:true,ticket:signMatrix({...payload,stage:3,prev:'identity+password',issuedAt:now(),expiresAt:now()+7*60000})}); });
router.post('/auth/admin/matrix/step-name',strictLimiter,(req,res)=>{ const payload=verifyMatrixToken(req.body?.ticket||''); if(!payload||payload.typ!=='pm_admin_step'||Number(payload.stage)!==3||Number(payload.expiresAt||0)<now())return res.status(401).json({ok:false,error:'Güvenlik oturumu geçersiz.'}); if(!verifyThirdFactor(req.body?.adminName||req.body?.name||''))return res.status(403).json({ok:false,error:'Son güvenlik doğrulaması başarısız oldu.'}); if(!isConfiguredAdmin(payload.email,payload.uid))return res.status(403).json({ok:false,error:'Yönetici yetkisi doğrulanamadı.'}); const access=issueAdminAccess({ uid:payload.uid, email:payload.email, scope:'admin', source:'admin_matrix', req }); const clientKey=issueClientKey({uid:payload.uid,email:payload.email,sessionId:access.accessId}); res.setHeader('Set-Cookie',adminAccessCookie(access.accessToken)); res.json({ok:true,redirectTo:'/admin/admin.html',clientKey,admin:adminContext(payload.uid,payload.email)}); });
router.get('/auth/admin/matrix/status', async (req,res)=>{
  const presentedKey = String(req.headers['x-admin-client-key'] || '').trim();
  const keyState = verifyClientKey(presentedKey);
  let access = adminAccessFromReq(req);

  if (!access && keyState.ok && isConfiguredAdmin(keyState.payload?.email, keyState.payload?.uid)) {
    const uid = String(keyState.payload.uid || '').trim();
    const email = String(keyState.payload.email || '').trim().toLowerCase();
    const refreshedAccess = issueAdminAccess({ uid, email, scope:'admin', source:'client_key_resume', req });
    const clientKey = issueClientKey({ uid, email, sessionId:refreshedAccess.accessId || '' });
    res.setHeader('Set-Cookie', adminAccessCookie(refreshedAccess.accessToken));
    return res.json({ ok:true, authenticated:true, user:{ uid, email }, admin:adminContext(uid,email), clientKey });
  }

  // Dashboard access is issued only after the full matrix gate completes.
  // Firebase admin allowlist alone must never bootstrap dashboard access.

  if(!access || !isConfiguredAdmin(access.email,access.uid)) return res.status(401).json({ok:false,authenticated:false,redirectTo:'/admin/index.html',error:'Yönetici erişimi bulunamadı.'});
  if(!keyState.ok) {
    const clientKey = issueClientKey({ uid:access.uid, email:access.email, sessionId:access.accessId || '' });
    return res.json({ok:true,authenticated:true,user:{uid:access.uid,email:access.email},admin:adminContext(access.uid,access.email),clientKey});
  }
  res.json({ok:true,authenticated:true,user:{uid:access.uid,email:access.email},admin:adminContext(access.uid,access.email),clientKey:issueClientKey({uid:access.uid,email:access.email,sessionId:access.accessId||''})});
});
router.post('/auth/admin/bootstrap', requireAuth, strictLimiter, (req,res)=>{
  const uid=String(req.user?.uid||'');
  const email=String(req.user?.email||'').trim().toLowerCase();
  if(!isConfiguredAdmin(email,uid))return res.status(403).json({ok:false,error:'ADMIN_REQUIRED'});
  return res.status(403).json({ ok:false, error:'ADMIN_MATRIX_GATE_REQUIRED', redirectTo:'/admin/index.html', message:'Yönetici paneli için güvenlik adımlarını tamamlaman gerekiyor.' });
});
router.post('/auth/admin/matrix/logout',(req,res)=>{ const token=getRequestAdminAccessToken(req); if(token)clearAdminAccess(token); res.setHeader('Set-Cookie',clearAdminAccessCookie()); res.json({ok:true}); });

router.get('/healthz', (_req, res) => res.json({ ok: true, service: 'playmatrix-api', at: now() }));
router.post('/auth/resolve-login', strictLimiter, async (req, res) => { const id = s(req.body?.identifier || req.body?.email || req.body?.username, 160); if (!id) return res.status(400).json({ ok: false, error: 'IDENTIFIER_REQUIRED' }); if (id.includes('@')) return res.json({ ok: true, email: id.toLowerCase() }); const { db } = fb(); if (!db) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' }); const q = await db.collection('users').where('usernameLower', '==', id.toLowerCase()).limit(1).get(); if (q.empty || !q.docs[0].data().email) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' }); res.json({ ok: true, email: q.docs[0].data().email }); });
router.get('/me', requireAuth, async (req, res) => res.json({ ok: true, user: await readProfile(req) }));
router.post('/me/activity/heartbeat', requireAuth, async (req, res) => { const uid = uidOf(req); runtimeStore.presence.set(uid, { uid, status: 'online', activity: s(req.body?.activity, 40), at: now() }, 180000); res.json({ ok: true, at: now() }); });
router.post('/me/showcase', requireAuth, async (req, res) => { const uid = uidOf(req); const showcase = { title: s(req.body?.title, 60), bio: sanitizeText(req.body?.bio || '', 180), updatedAt: now() }; await writeProfile(uid, { showcase }); res.json({ ok: true, showcase }); });
router.get('/user-stats/:uid', requireAuth, async (req, res) => {
  const requestedUid = s(req.params.uid, 128);
  const currentUid = uidOf(req);
  if (!requestedUid || requestedUid !== currentUid) return res.status(403).json({ ok: false, error: 'PROFILE_ACCESS_DENIED' });
  return res.json({ ok: true, data: await readProfile(req, currentUid) });
});
router.get('/leaderboard', async (req, res) => { const limit = Math.min(10, Math.max(1, Number(req.query?.limit || 10) || 10)); const profiles = await leaderboardProfiles(limit); const byLevel = Array.isArray(profiles?.level) ? profiles.level : []; const byActivity = Array.isArray(profiles?.activity) ? profiles.activity : []; const totalRows = byLevel.length + byActivity.length; res.setHeader('Cache-Control','public, max-age=15, stale-while-revalidate=45'); res.json({ ok: true, generatedAt: now(), limit, empty: totalRows < 1, source: profiles?.source || 'indexed', tabs: { level: { label: 'En Yüksek Hesap Seviyesi', metricKey: 'accountXp', items: lbItems(byLevel.slice(0,limit), 'level') }, activity: { label: 'En Çok Aktif Oyuncular', metricKey: 'monthlyActiveScore', items: lbItems(byActivity.slice(0,limit), 'activity') } } }); });
async function checkUsernameRoute(req, res) {
  const result = await checkUsernameAvailability(req.query.username, req.query.exceptUid || '');
  res.json(result);
}
router.get('/check-username', strictLimiter, checkUsernameRoute);
router.get('/auth/check-username', strictLimiter, checkUsernameRoute);
router.post('/profile/update', requireAuth, async (req, res) => {
  const uid = uidOf(req);
  const current = await readProfile(req, uid);
  const body = req.body || {};
  const currentFirst = s(current.firstName, 60);
  const currentLast = s(current.lastName, 60);
  const requestedFirst = s(body.firstName, 60);
  const requestedLast = s(body.lastName, 60);
  const requestedFullName = s(body.fullName, 120);
  const currentBirthDate = normalizeBirthDate(current.birthDate || current.dateOfBirth || '');
  const requestedBirthRaw = body.birthDate ?? body.dateOfBirth;
  const requestedBirth = requestedBirthRaw === undefined ? '' : normalizeBirthDate(requestedBirthRaw);
  if (requestedBirthRaw !== undefined && !requestedBirth) return res.status(400).json({ ok:false, error:'BIRTH_DATE_INVALID', message:'Geçerli bir doğum tarihi seçmelisin.' });
  if (currentBirthDate && requestedBirth && requestedBirth !== currentBirthDate) return res.status(409).json({ ok:false, error:'BIRTH_DATE_LOCKED', message:'Doğum tarihi kullanıcı tarafından tekrar değiştirilemez.' });
  const split = splitFullName(requestedFullName);
  const finalFirst = currentFirst || requestedFirst || split.firstName;
  const finalLast = currentLast || requestedLast || split.lastName;
  const usernameCheck = usernameState(body.username);
  const requestedUsername = usernameCheck.username;
  if (!usernameCheck.ok) return res.status(400).json({ ok:false, error:'INVALID_USERNAME', message:usernameCheck.message });
  if (!finalFirst || !finalLast) return res.status(400).json({ ok:false, error:'PROFILE_REQUIRED_FIELDS', message:'İsim, soyisim ve kullanıcı adı zorunludur.' });
  if (!isValidPersonName(finalFirst) || !isValidPersonName(finalLast)) return res.status(400).json({ ok:false, error:'INVALID_PERSON_NAME', message:PERSON_NAME_RULE_MESSAGE });
  const currentUsername = s(current.username, 32);
  const usernameChanged = !!currentUsername && requestedUsername.toLowerCase() !== currentUsername.toLowerCase();
  const usernameChangeLimit = Math.max(0, Number(current.usernameChangeLimit ?? 3) || 3);
  const usernameChangesUsed = Math.max(0, Number(current.usernameChangesUsed ?? current.usernameChangeCount ?? 0) || 0);
  if (usernameChanged && usernameChangesUsed >= usernameChangeLimit) {
    return res.status(409).json({ ok:false, error:'USERNAME_CHANGE_LIMIT_REACHED', message:'Kullanıcı adı değiştirme hakkın doldu.' });
  }
  const availability = await checkUsernameAvailability(requestedUsername, uid);
  if (availability.available === false) {
    return res.status(409).json({ ok:false, error: availability.code || 'USERNAME_TAKEN', message: availability.message || 'Bu kullanıcı adı kullanılıyor.' });
  }
  const patch = {
    username: requestedUsername,
    usernameLower: requestedUsername.toLowerCase(),
    avatar: s(body.avatar, 1000),
    usernameChangeLimit
  };
  if (usernameChanged) {
    patch.usernameChangesUsed = usernameChangesUsed + 1;
    patch.lastUsernameChangedAt = now();
  } else if (current.usernameChangesUsed === undefined) {
    patch.usernameChangesUsed = usernameChangesUsed;
  }
  if (!currentFirst && finalFirst) patch.firstName = finalFirst;
  if (!currentLast && finalLast) patch.lastName = finalLast;
  if (!currentBirthDate && requestedBirth) { patch.birthDate = requestedBirth; patch.birthDateSetAt = now(); }
  if (!s(current.fullName, 120) && (finalFirst || finalLast)) patch.fullName = joinName(finalFirst, finalLast);
  if (Object.prototype.hasOwnProperty.call(body, 'selectedFrame')) {
    patch.selectedFrame = safeSelectedFrameForLevel(body.selectedFrame, current.accountLevel);
    patch.marketFrameId = '';
    patch.marketFrameUrl = '';
    patch.frameUrl = '';
    patch.cosmeticSlots = { ...(current.cosmeticSlots || {}), frame: { source: 'normal', itemId: String(patch.selectedFrame || ''), updatedAt: Date.now() } };
  }
  Object.keys(patch).forEach(k => { if (patch[k] === undefined) delete patch[k]; });
  await writeProfile(uid, patch);
  memoryTransaction(uid, { title: 'Profil Güncellendi', message: 'Hesap bilgileri güvenli şekilde güncellendi.', icon: 'fa-user-gear' });
  const fresh = await readProfile(req, uid);
  res.json({ ok: true, user: fresh });
});
router.post('/activity-pass/claim', requireAuth, (_req, res) => res.json({ ok: true, claimed: false }));
function pushMemoryList(key, row, ttl = 30 * 86400000, limit = 30) {
  const current = runtimeStore.temporary.get(key) || [];
  const next = [row, ...current].slice(0, limit);
  runtimeStore.temporary.set(key, next, ttl);
  return next;
}
function personalNotification(uid, title, message, icon = 'fa-gift', extra = {}) {
  if (!uid) return null;
  const row = { id: `pn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, type: 'personal', title: sanitizeText(title, 100), message: sanitizeText(message, 240), icon, at: now(), ...extra };
  pushMemoryList(`notify:personal:${uid}`, row, 30 * 86400000, 60);
  return row;
}
function memoryTransaction(uid, row) {
  if (!uid) return null;
  const normalized = { id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, at: now(), icon: 'fa-receipt', ...row };
  const result = pushMemoryList(`account:tx:${uid}`, normalized, 30 * 86400000, 60);
  try {
    const { db } = fb();
    if (db) db.collection('users').doc(uid).collection('transactions').doc(normalized.id).set({ ...normalized, updatedAt: now() }, { merge: true }).catch(() => null);
  } catch (_) {}
  return result;
}
function memoryGame(uid, row) {
  if (!uid) return null;
  return pushMemoryList(`account:game:${uid}`, { id: `gm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, at: now(), icon: 'fa-gamepad', ...row }, 30 * 86400000, 60);
}


router.get('/account/memory', requireAuth, async (req, res) => {
  const uid = uidOf(req);
  const memoryTransactions = runtimeStore.temporary.get(`account:tx:${uid}`) || [];
  let persistentTransactions = [];
  try {
    const { db } = fb();
    if (db) {
      const snap = await db.collection('users').doc(uid).collection('transactions').orderBy('at', 'desc').limit(30).get();
      persistentTransactions = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}), memoryOnly: false }));
    }
  } catch (_) {}
  const seen = new Set();
  const transactions = [...persistentTransactions, ...memoryTransactions].sort((a,b) => Number(b.at || 0) - Number(a.at || 0)).filter((item) => { const id = String(item.id || ''); if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 30);
  const games = await listUserActivities(uid, 30);
  res.json({ ok: true, transactions, games, memoryOnly: false });
});

router.post('/account/memory/transaction', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const row = { title: sanitizeText(req.body?.title || 'İşlem', 100), message: sanitizeText(req.body?.message || req.body?.detail || 'Hesap işlemi', 240), amount: Number(req.body?.amount || 0), icon: s(req.body?.icon || 'fa-receipt', 40) };
  memoryTransaction(uid, row);
  res.json({ ok: true, row });
});

router.get('/notifications/memory', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const personal = (runtimeStore.temporary.get(`notify:personal:${uid}`) || []).map((item) => ({ ...item, read: !!item.read }));
  const system = (runtimeStore.temporary.get('notify:system') || []).map((item) => ({ ...item, read: !!item.read }));
  const unreadPersonal = personal.filter((item) => !item.read).length;
  const unreadSystem = system.filter((item) => !item.read).length;
  res.json({ ok: true, personal, system, counts: { personal: personal.length, system: system.length, unreadPersonal, unreadSystem, unread: unreadPersonal + unreadSystem }, memoryOnly: true });
});


router.post('/notifications/memory/read', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const id = s(req.body?.id || req.body?.notificationId || '', 120);
  if (!id) return res.status(400).json({ ok: false, error: 'NOTIFICATION_ID_REQUIRED' });
  const key = tab === 'personal' ? `notify:personal:${uid}` : 'notify:system';
  const current = runtimeStore.temporary.get(key) || [];
  const next = current.map((item) => String(item.id || item.key || '') === id ? { ...item, read: true, readAt: now() } : item);
  runtimeStore.temporary.set(key, next, 30 * 86400000);
  res.json({ ok: true, marked: current.length, tab });
});

router.post('/notifications/memory/read-all', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const key = tab === 'personal' ? `notify:personal:${uid}` : 'notify:system';
  const current = runtimeStore.temporary.get(key) || [];
  const unreadBefore = current.filter((item) => !item.read).length;
  const next = current.map((item) => ({ ...item, read: true, readAt: now() }));
  runtimeStore.temporary.set(key, next, 30 * 86400000);
  res.json({ ok: true, marked: unreadBefore, total: next.length, tab });
});
router.post('/notifications/memory/clear', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const key = tab === 'personal' ? `notify:personal:${uid}` : 'notify:system';
  const count = (runtimeStore.temporary.get(key) || []).length;
  runtimeStore.temporary.set(key, [], 30 * 86400000);
  res.json({ ok: true, cleared: true, count, tab });
});

router.post('/notifications/delete', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const id = s(req.body?.id || req.body?.notificationId || '', 120);
  if (!id) return res.status(400).json({ ok: false, error: 'NOTIFICATION_ID_REQUIRED' });
  const key = tab === 'personal' ? `notify:personal:${uid}` : 'notify:system';
  const current = runtimeStore.temporary.get(key) || [];
  const next = current.filter((item) => String(item.id || item.key || '') !== id);
  runtimeStore.temporary.set(key, next, 30 * 86400000);
  res.json({ ok: true, deleted: current.length - next.length, tab });
});

router.post('/notifications/clear', requireAuth, (req, res) => {
  const uid = uidOf(req);
  const tab = req.body?.tab === 'personal' ? 'personal' : 'system';
  const key = tab === 'personal' ? `notify:personal:${uid}` : 'notify:system';
  const count = (runtimeStore.temporary.get(key) || []).length;
  runtimeStore.temporary.set(key, [], 30 * 86400000);
  res.json({ ok: true, cleared: true, count, tab });
});


router.get('/avatar-frame/settings', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  const config = await readAvatarFrameSettings().catch(() => ({ version: 1, variants: {}, frames: {}, updatedAt: 0 }));
  const publicConfig = { version: Number(config.version || 1), variants: config.variants || {}, frames: config.frames || {}, updatedAt: Number(config.updatedAt || 0) || 0 };
  res.json({ ok: true, config: publicConfig });
});

router.get('/rewards/center', requireAuth, (req, res) => res.json({ ok: true, dailyWheel: true, promo: true, emailVerifyReward: 100000, signupReward: 50000, notifications: { receiptDays: 30 }, claimable: [] }));
router.get('/rewards/catalog', requireAuth, (_req, res) => res.json({ ok: true, items: [{ id: 'signup', title: 'Kayıt Ödülü', amount: 50000 }, { id: 'email-verify', title: 'E-posta Onay Ödülü', amount: 100000 }, { id: 'daily-wheel', title: 'Günlük Çark' }, { id: 'promo', title: 'Promo Kod' }] }));
router.get('/matches/history', requireAuth, async (req, res) => { const items = await listUserActivities(uidOf(req), Math.min(60, Math.max(1, Number(req.query?.limit || 30) || 30))); res.json({ ok: true, items, nextCursor: '', empty: items.length === 0 }); });
router.get('/achievements', requireAuth, async (req, res) => { const profile = await readProfile(req); const stats = profile.gameStats?.total || {}; const items = []; if (Number(stats.rounds || 0) >= 1) items.push({ id:'first-game', title:'İlk Oyun', description:'İlk oyununu tamamladın.', earned:true }); if (Number(stats.wins || 0) >= 1) items.push({ id:'first-win', title:'İlk Galibiyet', description:'İlk galibiyetini kazandın.', earned:true }); res.json({ ok:true, items, generatedFrom:'verified-profile-stats', empty:items.length===0 }); });
router.get('/missions', requireAuth, async (req, res) => { const profile = await readProfile(req); res.json({ ok:true, items:[], available:false, message:'Aktif görev bulunmuyor.', accountLevel:Number(profile.accountLevel || 1) }); });

function normalizeCompatMaintenanceGames(games = {}) {
  const raw = games && typeof games === 'object' ? games : {};
  const normalized = normalizeBooleanMap(raw, ['crash', 'chess', 'pisti', 'market', 'wheel', 'promo', 'classic', 'space-pro', 'snake-pro'], false);
  normalized.general = normalizeBoolean(raw.general, false) || normalizeBoolean(raw.system, false);
  return normalized;
}
async function readCompatMaintenanceControl(source = 'control-public') {
  const stored = runtimeStore.temporary.get('admin:maintenance');
  let games = stored?.games || stored || {};
  try {
    const { db } = fb();
    if (db) {
      const snap = await db.collection('gameConfig').doc('maintenance').get();
      if (snap.exists) {
        const data = snap.data() || {};
        games = data.games && typeof data.games === 'object' ? data.games : data;
        runtimeStore.temporary.set('admin:maintenance', { games, at: Number(data.at || Date.now()), actor: data.actor || { source } }, 30 * 86400000);
      }
    }
  } catch (error) {
    console.warn('[compat:maintenance:read:failed]', error?.message || error);
  }
  const maintenance = normalizeCompatMaintenanceGames(games);
  return { ok: true, maintenance, gamesEnabled: !Object.values(maintenance).some(Boolean) };
}
router.get('/platform/control-public', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json(await readCompatMaintenanceControl('control-public'));
});
router.get('/platform/control', requireAuth, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json(await readCompatMaintenanceControl('control-compat'));
});
router.get('/me/match-history', requireAuth, async (req, res) => { const items = await listUserActivities(uidOf(req), Math.min(60, Math.max(1, Number(req.query?.limit || 30) || 30))); res.json({ ok:true, items, empty:items.length===0 }); });
router.post('/classic/submit', requireAuth, (_req, res) => {
  res.status(410).json({ ok: false, error: 'CLASSIC_LEGACY_ENDPOINT_DISABLED', message: 'Klasik oyun sonucu yalnızca güvenli oyun oturumu üzerinden gönderilebilir.' });
});
router.post('/update', requireAuth, async (req, res) => {
  const uid = uidOf(req);
  const current = await readProfile(req, uid);
  const requestedUsername = s(req.body?.username, 32);
  const currentUsername = s(current.username, 32);
  const usernameChanged = !!requestedUsername && !!currentUsername && requestedUsername.toLowerCase() !== currentUsername.toLowerCase();
  const usernameChangeLimit = Math.max(0, Number(current.usernameChangeLimit ?? 3) || 3);
  const usernameChangesUsed = Math.max(0, Number(current.usernameChangesUsed ?? 0) || 0);
  if (usernameChanged && usernameChangesUsed >= usernameChangeLimit) return res.status(409).json({ ok:false, error:'USERNAME_CHANGE_LIMIT_REACHED' });
  const patch = { username: requestedUsername, avatar: s(req.body?.avatar, 1000), usernameChangeLimit };
  if (usernameChanged) patch.usernameChangesUsed = usernameChangesUsed + 1;
  const requestedFullName = s(req.body?.fullName, 80);
  if (requestedFullName && !s(current.fullName, 80)) patch.fullName = requestedFullName;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'selectedFrame')) {
    patch.selectedFrame = safeSelectedFrameForLevel(req.body?.selectedFrame, current.accountLevel);
    patch.marketFrameId = '';
    patch.marketFrameUrl = '';
    patch.frameUrl = '';
    patch.cosmeticSlots = { ...(current.cosmeticSlots || {}), frame: { source: 'normal', itemId: String(patch.selectedFrame || ''), updatedAt: Date.now() } };
  }
  if (patch.username) patch.usernameLower = patch.username.toLowerCase();
  Object.keys(patch).forEach(k => { if (patch[k] === undefined) delete patch[k]; });
  await writeProfile(uid, patch);
  memoryTransaction(uid, { title: 'Profil Güncellendi', message: 'Hesap bilgileri güvenli şekilde güncellendi.', icon: 'fa-user-gear' });
  res.json({ ok: true, user: await readProfile(req, uid) });
});
router.post('/email/update/request-code', requireAuth, (_req, res) => {
  res.status(410).json({ ok: false, error: 'EMAIL_LINK_FLOW_REQUIRED', message: 'E-posta güvenliği bağlantı sistemiyle çalışır.' });
});
router.post('/email/update/verify-code', requireAuth, (_req, res) => {
  res.status(410).json({ ok: false, error: 'EMAIL_LINK_FLOW_REQUIRED', message: 'E-posta güvenliği bağlantı sistemiyle çalışır.' });
});

module.exports = router;
