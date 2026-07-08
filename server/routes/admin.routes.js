const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireAdmin, strictLimiter } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { listAdminLogs, addAdminLog } = require('../admin/adminRuntimeLogStore');
const { runSafeFirestoreCleanup } = require('../core/firestoreCleanupService');
const { runtimeStore } = require('../core/runtimeStore');
const { getProgression, xpForLevel, normalizeXpBigInt } = require('../core/progressionService');
const { requireAdminReauth, writeAdminAudit } = require('../core/adminReauthService');
const { getWheelConfig, setWheelConfig } = require('../core/wheelRuntimeService');
const { grantWheelRights, getWheelRights } = require('../core/wheelRightsService');
const { recordRecentActivity } = require('../core/recentActivityService');
const { assertDateOfBirthInput, calculateAge } = require('../core/ageGateService');

const router = express.Router();
const now = () => Date.now();
const safe = (value, max = 2000) => String(value || '').trim().slice(0, max).replace(/[<>]/g, '');
const safeMultiline = (value, max = 4000) => String(value || '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '')
  .trim()
  .slice(0, max);
const money = (value) => Math.max(-100_000_000_000, Math.min(100_000_000_000, Math.trunc(Number(value) || 0)));
const nonNegativeMoney = (value) => Math.max(0, Math.min(100_000_000_000, Math.trunc(Number(value) || 0)));
const limitNumber = (value, fallback = 50, max = 200) => Math.max(1, Math.min(max, Math.trunc(Number(value) || fallback)));

function normalizePromoRewardInfo(body = {}) {
  const promoType = safe(body.promoType || body.type || '', 80);
  const amount = promoType && promoType !== 'mc' ? 0 : nonNegativeMoney(body.amount ?? body.mc ?? 0);
  const xp = promoType && promoType !== 'xp' ? 0 : nonNegativeMoney(body.xp ?? body.xpAmount ?? 0);
  const marketItemId = promoType && promoType !== 'market' ? '' : safe(body.marketItemId || body.marketFrameId || body.itemId || '', 80);
  const ticketCount = Math.max(0, Math.min(1000, Math.trunc(Number(body.ticketCount || body.rights || body.count || 0) || 0)));
  const rewards = [];
  if (amount > 0) rewards.push({ type: 'mc', amount });
  if (xp > 0) rewards.push({ type: 'xp', amount: xp });
  if (marketItemId) rewards.push({ type: 'market', itemId: marketItemId });
  if (['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket'].includes(promoType) && ticketCount > 0) rewards.push({ type: 'gameTicket', game: promoType.replace('_bet_ticket', ''), mode: 'bet', count: ticketCount });
  if (promoType === 'wheel_right' && ticketCount > 0) rewards.push({ type: 'wheelRight', count: ticketCount });
  const rewardSummary = rewards.map((r) => r.type === 'mc' ? `${r.amount.toLocaleString('tr-TR')} MC` : r.type === 'xp' ? `${r.amount.toLocaleString('tr-TR')} XP` : r.type === 'market' ? `Market: ${r.itemId}` : r.type === 'gameTicket' ? `${r.game} bahisli oyun hakkı x${r.count}` : `Çark hakkı x${r.count}`).join(' + ');
  return { promoType, amount, xp, marketItemId, ticketCount, rewards, rewardSummary };
}


function normalizeAdminRewardInfo(body = {}) {
  const rewardType = safe(body.rewardType || body.type || 'mc', 80);
  const amount = rewardType === 'mc' ? nonNegativeMoney(body.amount ?? body.mc ?? 0) : 0;
  const xp = rewardType === 'xp' ? nonNegativeMoney(body.xp ?? body.xpAmount ?? 0) : 0;
  const marketItemId = rewardType === 'market' ? safe(body.marketItemId || body.marketFrameId || body.itemId || '', 100) : '';
  const ticketCount = ['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket','wheel_right'].includes(rewardType) ? Math.max(1, Math.min(1000, Math.trunc(Number(body.ticketCount || body.rights || body.count || 1) || 1))) : 0;
  const rewards = [];
  if (amount > 0) rewards.push({ type: 'mc', amount });
  if (xp > 0) rewards.push({ type: 'xp', amount: xp });
  if (marketItemId) rewards.push({ type: 'market', itemId: marketItemId });
  if (['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket'].includes(rewardType) && ticketCount > 0) rewards.push({ type: 'gameTicket', game: rewardType.replace('_bet_ticket', ''), mode: 'bet', count: ticketCount });
  if (rewardType === 'wheel_right' && ticketCount > 0) rewards.push({ type: 'wheelRight', count: ticketCount });
  const rewardSummary = rewards.map((r) => r.type === 'mc' ? `${r.amount.toLocaleString('tr-TR')} MC` : r.type === 'xp' ? `${r.amount.toLocaleString('tr-TR')} XP` : r.type === 'market' ? `Market: ${r.itemId}` : r.type === 'gameTicket' ? `${r.game} bahisli oyun hakkı x${r.count}` : `Çark hakkı x${r.count}`).join(' + ');
  return { rewardType, amount, xp, marketItemId, ticketCount, rewards, rewardSummary };
}

async function applyAdminRewardToUser({ uid, rewardInfo = {}, reason = '', req = null }) {
  const output = { ok: true, amount: 0, xp: 0, marketGranted: [], gameTicketsGranted: [], wheelRightsGranted: 0, rewardSummary: rewardInfo.rewardSummary || '' };
  const { db } = fb();
  if (rewardInfo.amount > 0) {
    const economy = await incrementBalance(uid, rewardInfo.amount, reason || 'admin-matrix-reward', req);
    if (!economy.ok) return economy;
    output.amount = rewardInfo.amount;
    output.balance = economy.balance;
  }
  if (rewardInfo.xp > 0) {
    if (db) {
      const userRef = db.collection('users').doc(String(uid));
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() || {} : {};
        const before = getProgression(data.accountXp ?? data.xp ?? 0);
        const xpToAdd = before.isMaxLevel ? 0 : rewardInfo.xp;
        const next = normalizeXpBigInt(data.accountXp ?? data.xp ?? 0) + BigInt(xpToAdd);
        const progression = getProgression(next);
        tx.set(userRef, { xp: progression.xp, accountXp: progression.currentXp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progression, updatedAt: now() }, { merge: true });
        output.xp = xpToAdd;
        output.progression = progression;
      });
    } else {
      output.xp = rewardInfo.xp;
      output.progression = getProgression(rewardInfo.xp);
    }
  }
  if (rewardInfo.marketItemId) {
    if (db) await db.collection('marketOwnership').doc(`${uid}:${rewardInfo.marketItemId}`).set({ uid, itemId: rewardInfo.marketItemId, source: 'admin-reward', active: true, acquiredAt: now(), reason }, { merge: true });
    output.marketGranted.push(rewardInfo.marketItemId);
  }
  const gameTickets = (rewardInfo.rewards || []).filter((r) => r.type === 'gameTicket');
  const wheelRights = (rewardInfo.rewards || []).filter((r) => r.type === 'wheelRight').reduce((sum, r) => sum + Math.max(0, Number(r.count || 0)), 0);
  if (gameTickets.length && db) {
    const ticketPatch = {};
    gameTickets.forEach((ticket) => { ticketPatch[`${ticket.game}:bet`] = { count: Math.max(1, Math.trunc(Number(ticket.count) || 1)), grantedAt: now(), source: 'admin-reward', reason }; });
    await db.collection('users').doc(String(uid)).set({ gameTickets: ticketPatch, updatedAt: now() }, { merge: true });
  }
  if (wheelRights) {
    const granted = await grantWheelRights({ uid, count: wheelRights, source: 'admin-reward', reason, actor: req ? adminActor(req) : null });
    if (!granted.ok) return granted;
    output.wheelRightsTotal = granted.total || 0;
  }
  gameTickets.forEach((ticket) => output.gameTicketsGranted.push({ game: ticket.game, count: ticket.count }));
  output.wheelRightsGranted = wheelRights;
  output.rewardSummary = output.rewardSummary || [output.amount ? `${output.amount.toLocaleString('tr-TR')} MC` : '', output.xp ? `${output.xp.toLocaleString('tr-TR')} XP` : '', ...output.marketGranted.map((x) => `Market: ${x}`), ...output.gameTicketsGranted.map((x) => `${x.game} bahisli oyun hakkı x${x.count}`), output.wheelRightsGranted ? `Çark hakkı x${output.wheelRightsGranted}` : ''].filter(Boolean).join(' + ');
  return output;
}

router.use((req, res, next) => {
  if (!String(req.path || '').startsWith('/admin')) return next('router');
  return requireAuth(req, res, () => requireAdmin(req, res, next));
});

function fb() { return initFirebaseAdmin(); }
function adminActor(req) { return { uid: req.user?.uid || '', email: req.user?.email || '' }; }
function logAdmin(req, event, payload = {}) {
  const row = addAdminLog(event, { ...payload, actor: adminActor(req), path: req.originalUrl, at: now() });
  if (String(event || '').startsWith('admin.')) writeAdminAudit(req, event, payload).catch(() => null);
  return row;
}
function pushMemoryList(key, row, ttl = 30 * 86400000, limit = 80) {
  const current = runtimeStore.temporary.get(key) || [];
  const next = [row, ...current].slice(0, limit);
  runtimeStore.temporary.set(key, next, ttl);
  return next;
}
function pushSystemNotification(title, message, icon = 'fa-bullhorn', extra = {}) {
  const cleanTitle = safe(title, 120);
  const cleanMessage = safeMultiline(message, 4000);
  if (!cleanTitle || !cleanMessage) return null;
  const row = {
    id: `admin_sys_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    type: 'system',
    title: cleanTitle,
    message: cleanMessage,
    icon,
    at: now(),
    source: 'admin-panel',
    read: false,
    ...extra
  };
  pushMemoryList('notify:system', row, 30 * 86400000, 160);
  return row;
}
function pushPersonalNotification(uid, title, message, icon = 'fa-gift', extra = {}) {
  if (!uid) return null;
  const cleanTitle = safe(title, 120);
  const cleanMessage = safeMultiline(message, 4000);
  if (!cleanTitle || !cleanMessage) return null;
  const row = {
    id: `admin_personal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    type: 'personal',
    title: cleanTitle,
    message: cleanMessage,
    icon,
    at: now(),
    source: 'admin-panel',
    read: false,
    ...extra
  };
  pushMemoryList(`notify:personal:${uid}`, row, 30 * 86400000, 160);
  return row;
}

function notificationMode(req, fallback = 'none') {
  const raw = String(req.body?.notificationMode || req.body?.notifyMode || fallback || 'none').trim().toLowerCase();
  if (['all', 'system', 'public'].includes(raw)) return 'all';
  if (['personal', 'user', 'target'].includes(raw)) return 'personal';
  return 'none';
}
function dispatchAdminNotification(req, { mode = 'none', uid = '', systemTitle = '', systemMessage = '', personalTitle = '', personalMessage = '', icon = 'fa-bell', extra = {} } = {}) {
  const selected = ['all', 'personal', 'none'].includes(mode) ? mode : notificationMode(req, mode);
  const customTitle = safe(req.body?.notificationTitle || '', 120);
  const customMessage = safeMultiline(req.body?.notificationMessage || '', 4000);
  const title = customTitle;
  const message = customMessage;
  const sent = { mode: selected, system: false, personal: false, customRequired: selected !== 'none' && (!title || !message) };
  if (selected !== 'none' && (!title || !message)) return sent;
  if (selected === 'all') {
    sent.system = !!pushSystemNotification(title, message, icon, extra);
    if (uid) sent.personal = !!pushPersonalNotification(uid, title, message, icon, extra);
  } else if (selected === 'personal' && uid) {
    sent.personal = !!pushPersonalNotification(uid, title, message, icon, extra);
  }
  return sent;
}
function publicUser(uid, data = {}) {
  const xp = Number(data.accountXp ?? data.xp ?? 0) || 0;
  const progression = getProgression(xp);
  return {
    uid,
    email: data.email || '',
    username: data.username || data.displayName || data.fullName || uid,
    fullName: data.fullName || '',
    dateOfBirth: data.dateOfBirth || '',
    age: data.dateOfBirth ? calculateAge(data.dateOfBirth) : 0,
    ageVerified: !!data.dateOfBirth && calculateAge(data.dateOfBirth) >= 16 && data.ageVerified !== false,
    balance: Number(data.balance || 0),
    accountXp: progression.currentXp,
    accountLevel: progression.accountLevel,
    accountLevelProgressPct: progression.accountLevelProgressPct,
    selectedFrame: Number(data.selectedFrame || 0) || 0,
    avatar: data.avatar || '',
    banned: !!data.banned,
    banReason: data.banReason || '',
    emailVerified: !!data.emailVerified,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    lastSeen: data.lastSeen || data.lastLogin || null
  };
}
async function listUsers({ search = '', limit = 50 } = {}) {
  const { db } = fb();
  if (!db) return [];
  const rows = new Map();
  const max = limitNumber(limit, 50);
  const rawSearch = safe(search, 120);
  const trimmed = rawSearch.toLowerCase();
  const addDoc = (doc) => {
    if (!doc?.exists) return;
    rows.set(doc.id, publicUser(doc.id, doc.data() || {}));
  };
  try {
    if (trimmed) {
      const direct = await db.collection('users').doc(rawSearch).get().catch(() => null);
      addDoc(direct);
      const exactQueries = [
        db.collection('users').where('email', '==', rawSearch).limit(max),
        db.collection('users').where('username', '==', rawSearch).limit(max),
        db.collection('users').where('usernameLower', '==', trimmed).limit(max)
      ];
      for (const query of exactQueries) {
        const snap = await query.get().catch(() => null);
        snap?.forEach?.(addDoc);
      }
    }
    const snap = await db.collection('users').orderBy('createdAt', 'desc').limit(Math.max(max, trimmed ? 200 : max)).get();
    snap.forEach((doc) => {
      const data = doc.data() || {};
      const text = `${doc.id} ${data.email || ''} ${data.username || ''} ${data.usernameLower || ''} ${data.fullName || ''} ${data.displayName || ''}`.toLowerCase();
      if (!trimmed || text.includes(trimmed)) addDoc(doc);
    });
  } catch (error) {
    logAdmin({ user: {} , originalUrl: 'internal:listUsers' }, 'admin.users.list.error', { message: error.message });
  }
  return [...rows.values()].slice(0, max);
}
async function setUserPatch(uid, patch = {}) {
  const { db } = fb();
  if (!db) return { firestore: false };
  await db.collection('users').doc(uid).set({ ...patch, updatedAt: now() }, { merge: true });
  return { firestore: true };
}
async function incrementBalance(uid, amount, reason, req) {
  const { db, admin } = fb();
  if (!uid || !amount) return { ok: false, error: 'UID_AMOUNT_REQUIRED' };
  const safeAmount = Math.trunc(Number(amount) || 0);
  const key = `admin-economy:${uid}:${crypto.randomUUID()}`;
  if (!db || !admin) {
    logAdmin(req, 'admin.balance.local', { uid, amount: safeAmount, reason, key });
    return { ok: true, firestore: false, amount: safeAmount };
  }
  let nextBalance = 0;
  await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const snap = await tx.get(userRef);
    const current = Math.max(0, Number((snap.exists ? snap.data().balance : 0) || 0));
    if (safeAmount < 0 && current + safeAmount < 0) throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { statusCode: 409, current });
    nextBalance = Math.max(0, current + safeAmount);
    const ledgerRef = db.collection('ledger').doc(key);
    tx.set(userRef, { balance: nextBalance, updatedAt: now() }, { merge: true });
    tx.set(ledgerRef, { uid, amount: safeAmount, reason, balanceAfter: nextBalance, actor: adminActor(req), operationType: 'admin-balance', type: 'admin-balance', idempotencyKey: key, createdAt: now(), at: now() }, { merge: true });
  });
  logAdmin(req, 'admin.balance.update', { uid, amount: safeAmount, reason, key, balanceAfter: nextBalance });
  return { ok: true, firestore: true, amount: safeAmount, balance: nextBalance };
}

router.get('/admin/summary', async (req, res) => {
  const { db, enabled } = fb();
  let users = 0, banned = 0, totalBalance = 0;
  if (db) {
    try {
      const snap = await db.collection('users').limit(200).get();
      users = snap.size;
      snap.forEach((doc) => { const data = doc.data() || {}; if (data.banned) banned += 1; totalBalance += Number(data.balance || 0); });
    } catch (error) { logAdmin(req, 'admin.summary.error', { message: error.message }); }
  }
  res.json({ ok: true, firebaseEnabled: !!enabled, metrics: { users, banned, totalBalance, runtimeLogs: listAdminLogs().length, runtimeStores: Object.fromEntries(Object.entries(runtimeStore).map(([key, store]) => [key, typeof store.size === 'function' ? store.size() : 0])) }, actor: adminActor(req), at: now() });
});

router.get('/admin/users', async (req, res) => {
  const users = await listUsers({ search: req.query.search, limit: req.query.limit });
  res.json({ ok: true, users, count: users.length, at: now() });
});

router.get('/admin/users/:uid', async (req, res) => {
  const uid = safe(req.params.uid, 160);
  const { db } = fb();
  if (!db) return res.json({ ok: true, user: publicUser(uid, { uid }), firestore: false });
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
  res.json({ ok: true, user: publicUser(uid, snap.data() || {}) });
});

router.post('/admin/users/balance', strictLimiter, requireAdminReauth, async (req, res) => {
  const uid = safe(req.body.uid, 160);
  const amount = money(req.body.amount);
  const reason = safe(req.body.reason || 'admin-adjustment', 120);
  try {
    const result = await incrementBalance(uid, amount, reason, req);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ ok:false, error:error.message || 'BALANCE_UPDATE_FAILED', current:error.current });
  }
});

router.post('/admin/users/ban', strictLimiter, requireAdminReauth, async (req, res) => {
  const uid = safe(req.body.uid, 160);
  if (!uid) return res.status(400).json({ ok: false, error: 'UID_REQUIRED' });
  const banned = req.body.banned !== false;
  const reason = safe(req.body.reason || (banned ? 'admin-ban' : 'admin-unban'), 220);
  await setUserPatch(uid, { banned, banReason: banned ? reason : '', bannedAt: banned ? now() : null, unbannedAt: banned ? null : now(), banActor: adminActor(req) });
  logAdmin(req, banned ? 'admin.user.ban' : 'admin.user.unban', { uid, reason });
  res.json({ ok: true, uid, banned, reason });
});

router.post('/admin/users/email', strictLimiter, requireAdminReauth, async (req, res) => {
  const uid = safe(req.body.uid, 160);
  const email = safe(req.body.email, 254).toLowerCase();
  if (!uid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok:false, error:'UID_EMAIL_REQUIRED' });
  const { db, auth } = fb();
  if (auth) await auth.updateUser(uid, { email, emailVerified: false });
  if (db) await db.collection('users').doc(uid).set({ email, emailVerified: false, updatedAt: now() }, { merge:true });
  logAdmin(req, 'admin.email.update', { uid, emailMasked: email.replace(/^(.{2}).*(@.*)$/,'$1***$2') });
  res.json({ ok:true, uid, emailSynced: true, authUpdated: !!auth, firestoreUpdated: !!db });
});

router.get('/admin/payments', async (_req, res) => {
  const { db } = fb();
  const payments = [];
  if (db) {
    try { const snap = await db.collection('payments').orderBy('createdAt', 'desc').limit(50).get(); snap.forEach(d => payments.push({ id: d.id, ...d.data() })); } catch (_) {}
  }
  res.json({ ok: true, payments, count: payments.length });
});

router.get('/admin/promos', async (_req, res) => {
  const { db } = fb();
  const promos = [];
  if (db) { try { const snap = await db.collection('promos').limit(100).get(); snap.forEach(d => promos.push({ id: d.id, ...d.data() })); } catch (_) {} }
  res.json({ ok: true, promos });
});

router.post('/admin/promos', strictLimiter, requireAdminReauth, async (req, res) => {
  const code = safe(req.body.code, 40).toUpperCase();
  const amount = Math.max(1, Math.min(1_000_000, Math.trunc(Number(req.body.amount) || 0)));
  const maxClaims = Math.max(1, Math.min(100000, Math.trunc(Number(req.body.maxClaims) || 1)));
  if (!code || !amount) return res.status(400).json({ ok:false, error:'PROMO_CODE_AMOUNT_REQUIRED' });
  const { db } = fb();
  const promo = { code, amount, maxClaims, active: req.body.active !== false, createdAt: now(), actor: adminActor(req) };
  if (db) await Promise.all([db.collection('promos').doc(code).set(promo, { merge: true }), db.collection('promoCodes').doc(code).set(promo, { merge: true })]);
  logAdmin(req, 'admin.promo.save', { code, amount, maxClaims });
  res.json({ ok: true, promo, firestore: !!db });
});

router.get('/admin/notifications', (_req, res) => {
  res.json({ ok: true, notifications: [], receiptPolicyDays: 30, persistentReceipts: true });
});

router.post('/admin/notifications/send', strictLimiter, requireAdminReauth, (req, res) => {
  const title = safe(req.body.title || req.body.notificationTitle || '', 120);
  const message = safeMultiline(req.body.message || req.body.description || req.body.text || req.body.notificationMessage || '', 4000);
  if (!title || !message) return res.status(400).json({ ok:false, error:'TITLE_AND_MESSAGE_REQUIRED' });
  const notification = { id: `admin_${Date.now()}`, title, message, audience: safe(req.body.audience || 'all', 80), targetUid: safe(req.body.uid || req.body.targetUid || '', 160), at: now(), source: 'admin-panel', actor: adminActor(req) };
  runtimeStore.temporary.set(`adminNotification:${notification.id}`, notification, 24 * 3600000);
  const mode = notification.targetUid ? 'personal' : (notification.audience === 'none' ? 'none' : 'all');
  const reqForDispatch = { ...req, body: { ...req.body, notificationTitle: title, notificationMessage: message, notificationMode: mode } };
  const sent = dispatchAdminNotification(reqForDispatch, { mode, uid: notification.targetUid, icon: 'fa-bullhorn', extra: { actionText: 'Bilgilendirme', notificationId: notification.id, source: 'admin-panel' } });
  logAdmin(req, 'admin.notification.send', { ...notification, notification: sent });
  res.json({ ok: true, notification, sent });
});

router.get('/admin/games', (_req, res) => {
  res.json({ ok: true, games: [
    { slug:'crash', title:'Crash', status:'online', backend:'/server/games/crash/index.js', data:'in-memory-rounds-risk-table' },
    { slug:'chess', title:'Satranç', status:'online', backend:'/server/games/chess/index.js', data:'room-state-move-validation' },
    { slug:'pisti', title:'Pişti', status:'online', backend:'/server/games/pisti/index.js', data:'room-card-validation' },
    { slug:'pattern-master', title:'Pattern Master', status:'online', backend:'/server/games/pattern-master/index.js', data:'score-xp-validation' },
    { slug:'space-pro', title:'Space Pro', status:'online', backend:'/server/games/space-pro/index.js', data:'score-xp-validation' },
    { slug:'snake-pro', title:'Snake Pro', status:'online', backend:'/server/games/snake-pro/index.js', data:'score-xp-validation' }
  ] });
});



async function resolveUserIdentifier(identifier = '') {
  const raw = safe(identifier, 160);
  if (!raw) return { ok: false, error: 'IDENTIFIER_REQUIRED' };
  const { db } = fb();
  if (!db) return { ok: false, error: 'FIRESTORE_DISABLED' };

  const direct = await db.collection('users').doc(raw).get().catch(() => null);
  if (direct?.exists) return { ok: true, uid: direct.id, user: publicUser(direct.id, direct.data() || {}), match: 'uid' };

  const lower = raw.toLowerCase();
  const candidates = [];
  const pushSnap = async (query, match) => {
    try {
      const snap = await query.limit(2).get();
      snap.forEach((doc) => candidates.push({ uid: doc.id, data: doc.data() || {}, match }));
    } catch (_) {}
  };
  if (lower.includes('@')) {
    await pushSnap(db.collection('users').where('email', '==', lower), 'email');
  }
  await pushSnap(db.collection('users').where('username', '==', raw), 'username');
  await pushSnap(db.collection('users').where('displayName', '==', raw), 'displayName');

  const unique = new Map();
  candidates.forEach((item) => { if (!unique.has(item.uid)) unique.set(item.uid, item); });
  const matches = [...unique.values()];
  if (matches.length === 1) {
    const item = matches[0];
    return { ok: true, uid: item.uid, user: publicUser(item.uid, item.data), match: item.match };
  }
  if (matches.length > 1) return { ok: false, error: 'MULTIPLE_USERS_MATCH', matches: matches.map((item) => ({ uid: item.uid, username: item.data.username || '', email: item.data.email || '', match: item.match })) };
  return { ok: false, error: 'USER_NOT_FOUND' };
}

async function collectUserDocs(limit = 5000) {
  const { db } = fb();
  if (!db) return { ok: false, error: 'FIRESTORE_DISABLED', docs: [] };
  const snap = await db.collection('users').limit(Math.max(1, Math.min(5000, Number(limit) || 5000))).get();
  return { ok: true, docs: snap.docs || [] };
}

async function writeUserBatch(updates = []) {
  const { db } = fb();
  if (!db) return { ok: false, error: 'FIRESTORE_DISABLED', affected: 0 };
  let affected = 0;
  for (let i = 0; i < updates.length; i += 450) {
    const batch = db.batch();
    updates.slice(i, i + 450).forEach(({ ref, patch }) => { batch.set(ref, { ...patch, updatedAt: now() }, { merge: true }); affected += 1; });
    await batch.commit();
  }
  return { ok: true, affected };
}

async function deleteCollectionDocs(collectionRef, { batchSize = 300, maxPasses = 20 } = {}) {
  const { db } = fb();
  if (!db || !collectionRef) return 0;
  let deleted = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const snap = await collectionRef.limit(batchSize).get().catch(() => null);
    if (!snap || snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => { batch.delete(doc.ref); deleted += 1; });
    await batch.commit();
    if (snap.size < batchSize) break;
  }
  return deleted;
}

function resetSubcollectionNames(fields = []) {
  const selected = new Set(fields);
  const names = new Set();
  if (selected.has('userCollections')) ['promoClaims','promoRedemptions','wheelRights','wheelSpins','dailyWheel','gameDailyRights','classicXpCaps','classicRuns','notifications','notificationHistory','transactions','recentActivity','marketInventory','crashBets','rooms','matches'].forEach((name) => names.add(name));
  if (selected.has('promoHistory')) ['promoClaims','promoRedemptions','promos'].forEach((name) => names.add(name));
  if (selected.has('dailyWheelRights')) ['wheelRights','wheelSpins','dailyWheel'].forEach((name) => names.add(name));
  if (selected.has('gameDailyRights')) ['gameDailyRights','gameRights'].forEach((name) => names.add(name));
  if (selected.has('classicXpCaps')) ['classicXpCaps','classicRuns'].forEach((name) => names.add(name));
  if (selected.has('notificationHistory')) ['notifications','notificationHistory'].forEach((name) => names.add(name));
  if (selected.has('crashActiveBets')) ['crashBets'].forEach((name) => names.add(name));
  if (selected.has('openRooms')) ['rooms','matches'].forEach((name) => names.add(name));
  return [...names];
}

function valueContainsUid(value, uidSet) {
  if (value == null || !uidSet.size) return false;
  if (typeof value === 'string') return uidSet.has(value) || [...uidSet].some((uid) => value.includes(uid));
  if (Array.isArray(value)) return value.some((item) => valueContainsUid(item, uidSet));
  if (typeof value === 'object') return Object.values(value).some((item) => valueContainsUid(item, uidSet));
  return false;
}

function resetRuntimeStoresForUsers(uids = [], fields = []) {
  const uidSet = new Set(uids.filter(Boolean));
  const selected = new Set(fields);
  const stats = { temporary: 0, notifications: 0, crashBets: 0, crashQueuedBets: 0, chessRooms: 0, pistiRooms: 0 };
  const shouldClearRuntime = selected.has('runtimeUserState') || selected.has('notificationHistory') || selected.has('crashActiveBets') || selected.has('openRooms') || selected.has('userCollections');
  if (!uidSet.size || !shouldClearRuntime) return stats;
  if (selected.has('runtimeUserState') || selected.has('notificationHistory') || selected.has('userCollections')) {
    for (const [key, value] of runtimeStore.temporary.entries()) {
      if (valueContainsUid(key, uidSet) || valueContainsUid(value, uidSet)) { runtimeStore.temporary.delete(key); stats.temporary += 1; }
    }
    for (const [key, value] of runtimeStore.notifications.entries()) {
      if (valueContainsUid(key, uidSet) || valueContainsUid(value, uidSet)) { runtimeStore.notifications.delete(key); stats.notifications += 1; }
    }
  }
  if (selected.has('crashActiveBets') || selected.has('userCollections')) {
    try {
      const crash = require('../games/crash')._state;
      if (crash?.bets) for (const [key, bet] of crash.bets.entries()) if (uidSet.has(String(bet?.uid || ''))) { crash.bets.delete(key); stats.crashBets += 1; }
      if (crash?.queuedBets) for (const [key, bet] of crash.queuedBets.entries()) if (uidSet.has(String(bet?.uid || ''))) { crash.queuedBets.delete(key); stats.crashQueuedBets += 1; }
    } catch (_) {}
  }
  if (selected.has('openRooms') || selected.has('userCollections')) {
    try {
      const chessRooms = require('../games/chess')._rooms;
      if (chessRooms) for (const [roomId, room] of chessRooms.entries()) if ((room?.players || []).some((p) => uidSet.has(String(p?.uid || '')))) { chessRooms.delete(roomId); stats.chessRooms += 1; }
    } catch (_) {}
    try {
      const pistiRooms = require('../games/pisti')._rooms;
      if (pistiRooms) for (const [roomId, room] of pistiRooms.entries()) if ((room?.players || []).some((p) => uidSet.has(String(p?.uid || '')))) { pistiRooms.delete(roomId); stats.pistiRooms += 1; }
    } catch (_) {}
  }
  return stats;
}

async function applyDeepResetForUsers(docs = [], fields = []) {
  const subcollections = resetSubcollectionNames(fields);
  let subcollectionDeletes = 0;
  for (const doc of docs) {
    for (const name of subcollections) subcollectionDeletes += await deleteCollectionDocs(doc.ref.collection(name));
  }
  const runtime = resetRuntimeStoresForUsers(docs.map((doc) => doc.id), fields);
  return { subcollectionDeletes, runtime, subcollections };
}

function resetPatchForFields(fields = []) {
  const allowed = new Set(Array.isArray(fields) ? fields : []);
  const patch = {};
  if (allowed.has('balance')) patch.balance = 0;
  if (allowed.has('accountLevel')) { patch.accountLevel = 1; patch.level = 1; }
  if (allowed.has('accountXp')) { patch.accountXp = 0; patch.xp = 0; patch.accountLevelProgressPct = 0; }
  if (allowed.has('avatar') || allowed.has('avatarFrame')) { patch.avatar = ''; patch.selectedAvatar = ''; patch.marketAvatarId = ''; }
  if (allowed.has('selectedFrame') || allowed.has('avatarFrame')) { patch.selectedFrame = 0; patch.frameLevel = 0; patch.frameUrl = ''; patch.marketFrameId = ''; patch.marketFrameUrl = ''; }
  if (allowed.has('marketActiveProducts')) { patch.activeMarketItems = {}; patch.activeFrameId = ''; patch.activeBadgeId = ''; patch.nameEffectId = ''; patch.gameTableThemeId = ''; }
  if (allowed.has('monthlyActiveScore')) patch.monthlyActiveScore = 0;
  if (allowed.has('activityScore')) patch.activityScore = 0;
  if (allowed.has('leaderboard')) { patch.leaderboardScore = 0; patch.rank = null; }
  if (allowed.has('dailyWheelRights')) { patch.dailyWheel = {}; patch.wheelRights = 0; }
  if (allowed.has('promoHistory')) { patch.usedPromos = {}; patch.promoClaims = {}; }
  if (allowed.has('gameDailyRights')) patch.dailyGameRights = {};
  if (allowed.has('classicXpCaps')) patch.classicXpCaps = {};
  if (allowed.has('crashActiveBets')) patch.crashActiveBets = {};
  if (allowed.has('openRooms')) { patch.activeRoomId = ''; patch.activeChessRoom = ''; patch.activePistiRoom = ''; }
  if (allowed.has('notificationHistory')) patch.notificationState = {};
  if (allowed.has('runtimeUserState')) patch.runtimeStateResetAt = now();
  if (allowed.has('userCollections')) patch.userCollectionsResetRequestedAt = now();
  return patch;
}
function isTestUserDoc(doc) {
  const d = doc?.data?.() || {};
  const text = `${doc?.id || ''} ${d.email || ''} ${d.username || ''} ${d.displayName || ''}`.toLowerCase();
  return !!(d.isTest || d.testUser || /(^|[^a-z])test([^a-z]|$)|playmatrix-test|@test\./i.test(text));
}
async function resolveResetDocs({ scope = 'all', identifiers = [], excludeTestUsers = true, limit = 5000 } = {}) {
  const { db } = fb();
  if (!db) return { docs: [], firestore: false };
  const docMap = new Map();
  const add = (doc) => { if (doc?.exists && (!excludeTestUsers || !isTestUserDoc(doc))) docMap.set(doc.id, doc); };
  if (scope === 'single' || scope === 'selected') {
    const list = (Array.isArray(identifiers) ? identifiers : [identifiers]).map((x) => safe(x, 160)).filter(Boolean).slice(0, 250);
    for (const id of list) {
      const resolved = await resolveUserIdentifier(id).catch(() => null);
      if (resolved?.ok) {
        const snap = await db.collection('users').doc(resolved.uid).get().catch(() => null);
        add(snap);
      }
    }
  } else {
    const snap = await db.collection('users').limit(limitNumber(limit, 5000, 5000)).get();
    snap.forEach(add);
  }
  return { docs: [...docMap.values()], firestore: true };
}

function maintenanceFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined || value === '') return false;
  const normalized = String(value).trim().toLocaleLowerCase('tr-TR');
  if (['true', '1', 'on', 'yes', 'evet', 'aktif', 'active', 'enabled'].includes(normalized)) return true;
  if (['false', '0', 'off', 'no', 'hayır', 'hayir', 'pasif', 'inactive', 'disabled'].includes(normalized)) return false;
  return false;
}
function normalizeMaintenancePayload(body = {}) {
  const source = body && typeof body === 'object' ? body : {};
  const keys = ['general', 'system', 'crash', 'chess', 'pisti', 'classic', 'pattern-master', 'space-pro', 'snake-pro', 'market', 'wheel', 'promo'];
  const out = {};
  keys.forEach((key) => { out[key] = maintenanceFlag(source[key]); });
  return out;
}

function currentMaintenance() {
  const stored = runtimeStore.temporary.get('admin:maintenance');
  return normalizeMaintenancePayload(stored?.games || stored || {});
}

async function currentMaintenanceAsync({ force = false } = {}) {
  const cached = currentMaintenance();
  const { db } = fb();
  if (!db) return cached;
  if (!force && Object.values(cached).some(Boolean)) return cached;
  try {
    const snap = await db.collection('gameConfig').doc('maintenance').get();
    if (!snap.exists) return cached;
    const data = snap.data() || {};
    const games = normalizeMaintenancePayload(data.games && typeof data.games === 'object' ? data.games : data);
    runtimeStore.temporary.set('admin:maintenance', { games, at: Number(data.at || now()), actor: data.actor || { source: 'admin-read' } }, 30 * 86400000);
    return games;
  } catch (error) {
    logAdmin({ admin: { email: 'system' } }, 'admin.matrix.maintenance.read.error', { message: error.message });
    return cached;
  }
}

async function rewardAllUsers({ amount, reason, req, limit = 5000 }) {
  const { db, admin } = fb();
  if (!db || !admin) {
    logAdmin(req, 'admin.matrix.reward-all.runtime-only', { amount, reason, affected: 0, firestore: false });
    return { ok: true, affected: 0, amount, firestore: false, memoryOnly: true };
  }
  const docs = (await collectUserDocs(limit)).docs;
  let affected = 0;
  for (let i = 0; i < docs.length; i += 240) {
    const batch = db.batch();
    docs.slice(i, i + 240).forEach((doc) => {
      const ledgerRef = db.collection('ledger').doc(`admin_reward_all_${doc.id}_${crypto.randomUUID()}`);
      batch.set(doc.ref, { balance: admin.firestore.FieldValue.increment(amount), updatedAt: now() }, { merge: true });
      batch.set(ledgerRef, { uid: doc.id, amount, reason, operationType: 'admin-reward-all', type: 'admin-reward-all', actor: adminActor(req), createdAt: now(), at: now() }, { merge: true });
      affected += 1;
    });
    await batch.commit();
  }
  return { ok: true, affected, amount, firestore: true };
}



router.get('/admin/matrix/user-info', async (req, res) => {
  const resolved = await resolveUserIdentifier(req.query?.identifier || req.query?.uid || '');
  if (!resolved.ok) return res.status(resolved.error === 'MULTIPLE_USERS_MATCH' ? 409 : 404).json(resolved);
  const { db } = fb();
  let raw = resolved.user || {};
  if (db) {
    const snap = await db.collection('users').doc(resolved.uid).get().catch(() => null);
    raw = snap?.exists ? { uid: resolved.uid, ...(snap.data() || {}) } : raw;
  }
  const extraWheelRights = await getWheelRights(resolved.uid).catch(() => 0);
  res.json({ ok: true, uid: resolved.uid, match: resolved.match, user: publicUser(resolved.uid, raw), raw: { uid: resolved.uid, ...raw, extraWheelRights } });
});

router.patch('/admin/matrix/user-info', strictLimiter, requireAdminReauth, async (req, res) => {
  const resolved = await resolveUserIdentifier(req.body?.uid || req.body?.identifier || '');
  if (!resolved.ok) return res.status(resolved.error === 'MULTIPLE_USERS_MATCH' ? 409 : 404).json(resolved);
  const uid = resolved.uid;
  const body = req.body || {};
  const patch = {};
  const authPatch = {};
  if (body.email !== undefined) {
    const email = safe(body.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok:false, error:'EMAIL_INVALID' });
    patch.email = email;
    authPatch.email = email;
  }
  if (body.emailVerified !== undefined) {
    const verified = body.emailVerified === true || body.emailVerified === 'true' || body.emailVerified === '1';
    patch.emailVerified = verified;
    patch.emailVerifiedAt = verified ? now() : null;
    authPatch.emailVerified = verified;
  }
  if (body.username !== undefined) { patch.username = safe(body.username, 32); patch.usernameLower = safe(body.username, 32).toLowerCase(); }
  if (body.fullName !== undefined) patch.fullName = safe(body.fullName, 120);
  if (body.dateOfBirth !== undefined) {
    const dob = assertDateOfBirthInput(body.dateOfBirth);
    if (!dob.ok) return res.status(dob.code === 'AGE_RESTRICTED' ? 403 : 400).json({ ok:false, data:null, message:'', code:dob.code || 'INVALID_DATE_OF_BIRTH', error:dob.code || 'INVALID_DATE_OF_BIRTH' });
    patch.dateOfBirth = dob.dateOfBirth;
    patch.ageVerified = true;
    patch.ageLocked = false;
    patch.accountLocked = false;
    patch.age = dob.age;
    patch.ageVerifiedAt = now();
    patch.ageAdminUpdatedAt = now();
  }
  if (body.firstName !== undefined) patch.firstName = safe(body.firstName, 60);
  if (body.lastName !== undefined) patch.lastName = safe(body.lastName, 60);
  if (body.balance !== undefined) patch.balance = nonNegativeMoney(body.balance);
  if (body.accountLevel !== undefined) {
    const level = Math.max(1, Math.min(100, Math.trunc(Number(body.accountLevel) || 1)));
    patch.accountXp = xpForLevel(level);
    patch.xp = patch.accountXp;
    patch.accountLevel = level;
  } else if (body.accountXp !== undefined) {
    const xp = String(body.accountXp || '0').replace(/[^0-9]/g, '') || '0';
    const progression = getProgression(xp);
    patch.accountXp = xp;
    patch.xp = xp;
    patch.accountLevel = progression.accountLevel;
  }
  if (body.selectedFrame !== undefined) patch.selectedFrame = Math.max(0, Math.min(100, Math.trunc(Number(body.selectedFrame) || 0)));
  if (body.avatar !== undefined) patch.avatar = safe(body.avatar, 1000);
  if (body.banned !== undefined) patch.banned = body.banned === true || body.banned === 'true' || body.banned === '1';
  if (body.banReason !== undefined) patch.banReason = safe(body.banReason, 220);
  if (!Object.keys(patch).length && !Object.keys(authPatch).length) return res.status(400).json({ ok:false, error:'NO_VALID_FIELDS' });
  const { db, auth } = fb();
  if (auth && Object.keys(authPatch).length) await auth.updateUser(uid, authPatch);
  if (db && Object.keys(patch).length) await db.collection('users').doc(uid).set({ ...patch, updatedAt: now(), adminUpdatedBy: adminActor(req) }, { merge: true });
  logAdmin(req, 'admin.matrix.user-info.update', { uid, fields: Object.keys(patch).map((field) => field === 'dateOfBirth' ? 'dateOfBirthChanged' : field), authFields: Object.keys(authPatch) });
  const sent = dispatchAdminNotification(req, {
    mode: notificationMode(req, 'none'),
    uid,
    systemTitle: 'Kullanıcı Bilgileri Güncellendi',
    systemMessage: `${resolved.match || uid} kullanıcısının hesap bilgileri admin panelinden güncellendi.`,
    personalTitle: 'Hesap Bilgilerin Güncellendi',
    personalMessage: 'Hesap bilgilerinde admin panelinden güncelleme yapıldı.',
    icon: 'fa-user-pen',
    extra: { targetUid: uid, fields: Object.keys(patch) }
  });
  res.json({ ok:true, uid, firestoreUpdated: !!db, authUpdated: !!auth && Object.keys(authPatch).length > 0, patch, notification: sent });
});

router.get('/admin/matrix/dashboard', async (req, res) => {
  const { db } = fb();
  let userCount = 0, deletedCount = 0, mutedCount = 0, totalBalance = 0, dailyMcSpend = 0, dailyMcInflow = 0, dailyMcOutflow = 0, openRoomCount = 0;
  if (db) {
    try {
      const snap = await db.collection('users').limit(1000).get();
      userCount = snap.size;
      snap.forEach((doc) => {
        const d = doc.data() || {};
        totalBalance += Math.max(0, Number(d.balance || 0));
        if (d.deleted || d.deletedAt) deletedCount += 1;
        if (d.muted || d.banned || d.restrictions || d.gameRestricted) mutedCount += 1;
      });
    } catch (error) { logAdmin(req, 'admin.matrix.dashboard.users.error', { message: error.message }); }
    try {
      const since = now() - 24 * 3600000;
      const audit = await db.collection('audit').where('at', '>=', since).limit(800).get();
      audit.forEach((doc) => {
        const d = doc.data() || {};
        const amount = Number(d.amount || 0) || 0;
        dailyMcSpend += Math.abs(amount);
        if (amount < 0) dailyMcInflow += Math.abs(amount);
        if (amount > 0) dailyMcOutflow += amount;
      });
    } catch (error) { logAdmin(req, 'admin.matrix.dashboard.audit.error', { message: error.message }); }
  }
  try {
    openRoomCount = runtimeStore.rooms.size()
      + runtimeStore.temporary.values().filter((x) => x && typeof x === 'object' && /room|match/i.test(String(x.id || x.type || x.roomId || ''))).length;
  } catch (_) { openRoomCount = 0; }
  res.json({ ok:true, metrics:{ userCount, dailyMcSpend, totalLoss:dailyMcOutflow, totalProfit:dailyMcInflow, totalBalance, openRoomCount, deletedCount, mutedCount }, maintenance: await currentMaintenanceAsync(), at:now() });
});

router.get('/admin/matrix/promos', async (_req, res) => {
  const { db } = fb();
  const items = [];
  const toPromoItem = (id, x = {}) => ({
    id,
    code: x.code || id,
    amount: x.amount || 0,
    xp: x.xp || 0,
    marketItemId: x.marketItemId || '',
    badgeId: x.badgeId || '',
    nameEffectId: x.nameEffectId || '',
    rewardSummary: x.rewardSummary || '',
    rewards: Array.isArray(x.rewards) ? x.rewards : [],
    limitLeft: Math.max(0, Number(x.maxClaims || x.usageLimit || 0) - Number(x.claimedCount || 0)),
    expiresAt: x.expiresAt || 0
  });
  if (db) {
    try {
      const snap = await db.collection('promos').limit(120).get();
      snap.forEach(d => { const x = d.data() || {}; if (x.deleted || x.active === false) return; items.push(toPromoItem(d.id, x)); });
    } catch (_) {}
  } else {
    for (const [key, value] of runtimeStore.temporary.entries()) {
      if (!String(key).startsWith('promo:') || !value || value.active === false || value.deleted) continue;
      items.push(toPromoItem(value.code || String(key).slice(6), value));
    }
  }
  res.json({ ok:true, items });
});

router.get('/admin/matrix/issues', (_req, res) => {
  const rawIssues = runtimeStore.errors.values().sort((a,b)=>(b.createdAt || b.at || 0) - (a.createdAt || a.at || 0));
  const seenIssueKeys = new Set();
  const all = [];
  for (const item of rawIssues) {
    const status = Number(item.status || 0) || 0;
    const text = `${item.message || item.error || ''} ${item.scope || ''} ${item.path || ''} ${item.endpoint || ''}`.toLowerCase();
    if ((status === 401 || status === 403) && text.includes('/api/me')) continue;
    if (/low-value-client-noise|expected-session-check|low-value-ui-noise|expected-game-flow|maintenance-api-noise/.test(text)) continue;
    if (/data-pm-action|home\.promise_rejection|classic\.start|classic\.submit/.test(text) && !/typeerror|referenceerror|syntaxerror|cannot read|is not a function|undefined is not/.test(text)) continue;
    if (status === 503 && /\/api\/(crash|chess|pisti|games\/)/.test(text) && /maintenance|bakım|game_maintenance/.test(text)) continue;
    if (status === 409 && /\/api\/chess\/(draw|create|join|move|resign|leave)/.test(text)) continue;
    const key = [item.game || 'system', item.scope || item.event || '', item.path || item.endpoint || '', status, item.message || item.error || ''].join('|').slice(0, 500);
    if (seenIssueKeys.has(key)) continue;
    seenIssueKeys.add(key);
    all.push(item);
    if (all.length >= 120) break;
  }
  const GAME_AREAS = new Set(['home', 'crash', 'chess', 'pisti', 'snake-pro', 'space-pro', 'pattern-master']);
  const gameTitle = (game) => ({ home: 'AnaSayfa', crash: 'Crash', chess: 'Satranç', pisti: 'Pişti', 'snake-pro': 'Snake Pro', 'space-pro': 'Space Pro', 'pattern-master': 'Pattern Master' }[String(game || '').toLowerCase()] || 'Sistem');
  const resolveIssueSolution = (x = {}, game = '', message = '', scope = '') => {
    const text = `${message} ${scope} ${x.path || ''} ${x.endpoint || ''} ${x.source || ''}`.toLowerCase();
    if (game === 'home' && text.includes('oturum bulunamadı')) return 'AnaSayfa private widget oturum hazır olmadan çalışmamalı; auth state hazır değilse giriş gerekli görünümü gösterilmeli.';
    if (game === 'home' && (text.includes('http_405') || Number(x.status || 0) === 405)) return 'Client endpoint methodu ve API base fallback sırası kontrol edilmeli; eski cache/script kaynağı temizlenmeli.';
    if (game === 'home' && text.includes('network-request-failed')) return 'Firebase Auth network erişimi ve authorized domain ayarları kontrol edilmeli.';
    if (game === 'crash') return 'Crash API route, risk/round state, bet/cashout transaction ve client payload birlikte kontrol edilmeli.';
    if (game === 'chess') return 'Satranç room stateVersion, socket ACK, hamle payload ve backend oda durumu birlikte kontrol edilmeli.';
    if (game === 'pisti') return 'Pişti lobby/state/socket, masa lifecycle, oyuncu schema ve ekonomi transaction akışı birlikte kontrol edilmeli.';
    if (['snake-pro', 'space-pro', 'pattern-master'].includes(game)) return 'Klasik oyun start/submit runId sözleşmesi, skor sınırı, XP sonucu ve frontend endpoint akışı birlikte kontrol edilmeli.';
    return 'Sistem kaydı kaynak, endpoint, status ve güvenli stack bilgisiyle ayrıca incelenmeli.';
  };
  const normalizeIssue = (x = {}) => {
    const game = String(x.game || '').toLowerCase();
    const message = String(x.message || x.error || x.reason || JSON.stringify(x.details || x.payload || {})).slice(0, 360) || 'Kayıt';
    const path = String(x.path || x.endpoint || '').slice(0, 180);
    const scope = String(x.scope || x.event || 'runtime').slice(0, 100);
    return { createdAt: x.createdAt || x.at || Date.now(), game: game || 'system', scope, area: x.area || gameTitle(game), error: x.error || message, reason: x.reason || (x.status ? `HTTP ${x.status} / ${scope}${path ? ` / ${path}` : ''}` : scope), solution: x.solution || resolveIssueSolution(x, game, message, scope), message, path, status: x.status || '', severity: x.severity || 'info', title: `${gameTitle(game)} = ${scope}`, body: `${message}${path ? ` • ${path}` : ''}` };
  };
  const normalized = all.map(normalizeIssue).filter((x) => {
    const text = `${x.message || ''} ${x.reason || ''} ${x.path || ''} ${x.scope || ''}`.toLowerCase();
    if (Number(x.status || 0) === 0 && /^işlem kaydı oluştu|^kayıt$|^frontend hata kaydı$/.test(text)) return false;
    return true;
  });
  const frontend = normalized.filter((x) => /frontend|client|home|modal|ui|browser|script|css/i.test(`${x.scope} ${x.source || ''} ${x.path || ''} ${x.game || ''}`)).slice(0, 70);
  const backend = normalized.filter((x) => !frontend.includes(x)).slice(0, 70);
  const gameIssues = normalized.filter(x => GAME_AREAS.has(String(x.game || '').toLowerCase())).slice(0, 60);
  const systemIssues = normalized.filter(x => !GAME_AREAS.has(String(x.game || '').toLowerCase())).slice(0, 30);
  res.json({ ok:true, frontend, backend, games:gameIssues, systems:systemIssues, recentErrors:normalized.slice(0, 70) });
});

router.post('/admin/matrix/reset-nuclear', strictLimiter, requireAdminReauth, async (req, res) => {
  const fields = Array.isArray(req.body?.fields) ? req.body.fields.map((x) => safe(x, 80)).filter(Boolean) : [];
  const patch = resetPatchForFields(fields);
  if (!Object.keys(patch).length) return res.status(400).json({ ok:false, error:'NO_VALID_FIELDS' });
  const scope = safe(req.body?.scope || 'all', 40);
  const identifiers = Array.isArray(req.body?.identifiers) ? req.body.identifiers : String(req.body?.identifiers || '').split(/[,;\n]+/);
  const excludeTestUsers = req.body?.excludeTestUsers !== false;
  const resolved = await resolveResetDocs({ scope, identifiers, excludeTestUsers, limit: 5000 });
  if (!resolved.firestore) return res.status(503).json({ ok:false, error:'FIRESTORE_DISABLED' });
  const sample = resolved.docs.slice(0, 8).map((doc) => doc.id);
  if (req.body?.dryRun === true || req.body?.dryRun === 'true') {
    return res.json({ ok:true, dryRun:true, affected: resolved.docs.length, fields, scope, sample, deepResetPlanned: { subcollections: resetSubcollectionNames(fields), runtime: fields.filter((field) => ['runtimeUserState','notificationHistory','crashActiveBets','openRooms','userCollections'].includes(field)) } });
  }
  const result = await writeUserBatch(resolved.docs.map((doc) => ({ ref: doc.ref, patch })));
  const deepReset = await applyDeepResetForUsers(resolved.docs, fields);
  if (fields.includes('runtimeUserState') || fields.includes('notificationHistory') || fields.includes('crashActiveBets') || fields.includes('openRooms') || fields.includes('userCollections')) {
    runtimeStore.temporary.set('admin:lastBulkRuntimeReset', { fields, scope, affected: result.affected, deepReset, at: now(), actor: adminActor(req) }, 7 * 86400000);
  }
  logAdmin(req, 'admin.matrix.reset.applied', { fields, scope, affected: result.affected, deepReset, notificationMode: notificationMode(req, 'none') });
  const sent = dispatchAdminNotification(req, { mode: notificationMode(req, 'none'), icon: 'fa-rotate-left', extra: { fields, affected: result.affected, scope, deepReset } });
  res.json({ ok:true, dryRun:false, affected: result.affected, fields, scope, sample, deepReset, notification: sent });
});

router.get('/admin/matrix/maintenance', async (_req, res) => res.json({ ok:true, maintenance: await currentMaintenanceAsync({ force: true }) }));
router.patch('/admin/matrix/maintenance', strictLimiter, requireAdminReauth, async (req, res) => {
  const games = normalizeMaintenancePayload(req.body || {});
  const payload = { games, at:now(), updatedAt: now(), actor:adminActor(req), version: 'pm-maintenance-v2' };
  const { db } = fb();
  let persisted = false;
  if (db) {
    try {
      await db.collection('gameConfig').doc('maintenance').set(payload, { merge:false });
      persisted = true;
    } catch (error) {
      logAdmin(req, 'admin.matrix.maintenance.persist.error', { message:error.message });
      return res.status(503).json({ ok:false, error:'MAINTENANCE_PERSIST_FAILED', message:'Bakım ayarı kalıcı olarak kaydedilemedi. Lütfen tekrar dene.' });
    }
  }
  runtimeStore.temporary.set('admin:maintenance', payload, 30*86400000);
  logAdmin(req, 'admin.matrix.maintenance', { games, notificationMode: notificationMode(req, 'none'), persisted });
  const activeGames = Object.entries(games).filter(([,value]) => value).map(([key]) => key).join(', ') || 'bakımda oyun yok';
  const sent = dispatchAdminNotification(req, { mode: notificationMode(req, 'none'), systemTitle: 'Bakım Modu Güncellendi', systemMessage: `Oyun bakım ayarları kaydedildi. Aktif bakım: ${activeGames}`, icon: 'fa-screwdriver-wrench', extra: { games, actionText: 'Bilgilendirme' } });
  res.json({ ok:true, maintenance:games, activeGames, persisted, notification: sent });
});

router.post('/admin/matrix/restrict-user', strictLimiter, requireAdminReauth, async (req, res) => {
  const resolved = await resolveUserIdentifier(req.body?.identifier || '');
  if (!resolved.ok) return res.status(resolved.error === 'MULTIPLE_USERS_MATCH' ? 409 : 404).json(resolved);
  const action = safe(req.body?.action, 80);
  const durationMinutes = Math.max(0, Math.trunc(Number(req.body?.durationMinutes || 0)));
  const expiresAt = durationMinutes > 0 ? now() + durationMinutes * 60000 : 0;
  const reason = safe(req.body?.reason || `admin-${action}`, 220);
  const patch = { restrictions: { ...(resolved.user.restrictions || {}), [action]: { active:true, reason, expiresAt, actor:adminActor(req), at:now() } } };
  if (action === 'ban') Object.assign(patch, { banned:true, banReason:reason, bannedAt:now(), banActor:adminActor(req) });
  if (action === 'games_mute') { patch.gameRestricted = true; patch.gameRestrictedUntil = expiresAt || 0; }
  await setUserPatch(resolved.uid, patch);
  logAdmin(req, 'admin.matrix.restrict-user.applied', { uid: resolved.uid, action, durationMinutes, reason });
  const durationText = durationMinutes > 0 ? `${durationMinutes} dakika` : 'süresiz';
  const sent = dispatchAdminNotification(req, { mode: notificationMode(req, 'none'), uid: resolved.uid, personalTitle: 'Hesap Kısıtlaması', personalMessage: `${action} kısıtlaması uygulandı. Süre: ${durationText}. Açıklama: ${reason}`, systemTitle: 'Kullanıcı Kısıtlaması', systemMessage: `${resolved.match || resolved.uid} için ${action} kısıtlaması uygulandı. Süre: ${durationText}. Açıklama: ${reason}`, icon: 'fa-ban', extra: { targetUid: resolved.uid, action, reason, expiresAt, actionText: 'Detay' } });
  res.json({ ok:true, uid: resolved.uid, match: resolved.match, action, expiresAt, notification: sent });
});

router.post('/admin/matrix/reward-user', strictLimiter, requireAdminReauth, async (req, res) => {
  const rewardInfo = normalizeAdminRewardInfo(req.body || {});
  if (!rewardInfo.rewards.length) return res.status(400).json({ ok:false, error:'ADMIN_REWARD_REQUIRED' });
  const resolved = await resolveUserIdentifier(req.body?.identifier || '');
  if (!resolved.ok) return res.status(resolved.error === 'MULTIPLE_USERS_MATCH' ? 409 : 404).json(resolved);
  const reason = safe(req.body?.reason || 'admin-matrix-reward', 160);
  const result = await applyAdminRewardToUser({ uid: resolved.uid, rewardInfo, reason, req }).catch(error => ({ ok:false, error:error.message }));
  if (result.ok) {
    const sent = dispatchAdminNotification(req, { mode: notificationMode(req, 'none'), uid: resolved.uid, personalTitle: 'Admin Ödülü', personalMessage: `${rewardInfo.rewardSummary || 'Ödül'} hesabına tanımlandı. Açıklama: ${reason}`, systemTitle: 'Kullanıcıya Ödül', systemMessage: `${resolved.match || resolved.uid} kullanıcısına ${rewardInfo.rewardSummary || 'ödül'} tanımlandı. Açıklama: ${reason}`, icon: 'fa-gift', extra: { rewardTypes: rewardInfo.rewards.map((r) => r.type), amount: rewardInfo.amount, xp: rewardInfo.xp, marketItemId: rewardInfo.marketItemId, ticketCount: rewardInfo.ticketCount, reason, targetUid: resolved.uid, actionText: 'Hesabımı Gör' } });
    result.notification = sent;
    recordRecentActivity({ id: `admin_reward:${resolved.uid}:${Date.now()}`, source: 'admin-reward', game: rewardInfo.rewardType === 'wheel_right' ? 'wheel' : 'promo', title: 'Admin Ödülü', username: resolved.user?.username || resolved.user?.displayName || resolved.user?.email || 'Oyuncu', uid: resolved.uid, amount: result.amount || 0, xp: result.xp || 0, rewardLabel: result.rewardSummary || rewardInfo.rewardSummary || 'Ödül', rewardType: rewardInfo.rewardType || '' });
    logAdmin(req, 'admin.matrix.reward-user.applied', { uid: resolved.uid, rewardTypes: rewardInfo.rewards.map((r) => r.type), rewardSummary: rewardInfo.rewardSummary, reason, notificationMode: notificationMode(req, 'none') });
  }
  res.json({ ok:!!result.ok, uid:resolved.uid, match:resolved.match, reward: rewardInfo, result });
});

router.post('/admin/matrix/reward-all', strictLimiter, requireAdminReauth, async (req, res) => {
  const amount = nonNegativeMoney(req.body?.amount);
  const reason = safe(req.body?.reason || 'admin-matrix-reward-all',160);
  if (!amount) return res.status(400).json({ ok:false, error:'AMOUNT_REQUIRED' });
  const result = await rewardAllUsers({ amount, reason, req, limit: 5000 });
  if (!result.ok) return res.status(503).json(result);
  const sent = dispatchAdminNotification(req, { mode: notificationMode(req, 'none'), systemTitle: 'Toplu MC Dağıtımı', systemMessage: `${Number(result.affected || 0).toLocaleString('tr-TR')} kullanıcıya ${amount.toLocaleString('tr-TR')} MC dağıtıldı. Açıklama: ${reason}`, icon: 'fa-coins', extra: { amount, reason, affected: result.affected, actionText: 'Detay' } });
  logAdmin(req, 'admin.matrix.reward-all.applied', { amount, reason, affected:result.affected, notificationMode: notificationMode(req, 'none') });
  res.json({ ok:true, dryRun:false, affected:result.affected, amount, notification: sent });
});

router.post('/admin/matrix/promo-codes', strictLimiter, requireAdminReauth, async (req, res) => {
  const code = safe(req.body.code, 40).toUpperCase();
  const rewardInfo = normalizePromoRewardInfo(req.body || {});
  const usageLimit = Math.max(1, Math.min(100000, Math.trunc(Number(req.body.usageLimit || req.body.maxClaims) || 1)));
  if (!code || !rewardInfo.rewards.length) return res.status(400).json({ ok:false, error:'PROMO_REWARD_REQUIRED' });
  const { db } = fb();
  const durationHours = Math.max(1, Number(req.body.durationHours || 24));
  const startsAt = Math.max(0, Number(req.body.startsAt || req.body.startAt || 0) || 0);
  const expiresAt = Math.max(now() + durationHours * 3600000, Number(req.body.expiresAt || req.body.endAt || 0) || 0);
  const promo = { code, ...rewardInfo, usageLimit, maxClaims:usageLimit, onePerAccount:req.body.onePerAccount !== false, description:safe(req.body.description,200), startsAt, expiresAt, minLevel: Math.max(0, Math.trunc(Number(req.body.minLevel || 0) || 0)), maxLevel: Math.max(0, Math.trunc(Number(req.body.maxLevel || 0) || 0)), active:true, createdAt:now(), actor:adminActor(req) };
  if (db) await Promise.all([db.collection('promos').doc(code).set(promo, { merge:true }), db.collection('promoCodes').doc(code).set(promo, { merge:true })]);
  else runtimeStore.temporary.set(`promo:${code}`, promo, Math.max(1, Number(req.body.durationHours || 24))*3600000);
  const sent = dispatchAdminNotification(req, { mode: notificationMode(req, 'none'), systemTitle: 'Promosyon Kodu Oluşturuldu', systemMessage: `${code} kodu ${rewardInfo.rewardSummary || 'özel ödül'} ile aktif edildi. Limit: ${usageLimit}.`, icon: 'fa-ticket', extra: { code, amount: rewardInfo.amount, xp: rewardInfo.xp, usageLimit, actionText:'Promo' } });
  logAdmin(req, 'admin.matrix.promo.create', { code, rewardTypes: rewardInfo.rewards.map((r) => r.type), usageLimit, notificationMode: notificationMode(req, 'none') });
  res.json({ ok:true, promo, notification: sent });
});

router.delete('/admin/matrix/promo-codes/:code', strictLimiter, requireAdminReauth, async (req, res) => {
  const code = safe(req.params.code || req.body?.code, 40).toUpperCase();
  if (!code) return res.status(400).json({ ok:false, error:'PROMO_CODE_REQUIRED' });
  const { db } = fb();
  if (db) await Promise.all([
    db.collection('promos').doc(code).set({ active:false, deleted:true, deletedAt:now(), actor:adminActor(req) }, { merge:true }),
    db.collection('promoCodes').doc(code).set({ active:false, deleted:true, deletedAt:now(), actor:adminActor(req) }, { merge:true })
  ]);
  runtimeStore.temporary.delete(`promo:${code}`);
  const sent = dispatchAdminNotification(req, { mode: notificationMode(req, 'none'), systemTitle: 'Promosyon Kodu İptal Edildi', systemMessage: `${code} promosyon kodu admin panelinden iptal edildi/silindi.`, icon: 'fa-ticket-simple', extra: { code, actionText:'Bilgilendirme' } });
  logAdmin(req, 'admin.matrix.promo.delete', { code, notificationMode: notificationMode(req, 'none') });
  res.json({ ok:true, code, deleted:true, active:false, notification: sent });
});



router.get('/admin/wheel/config', async (_req, res) => {
  const config = await getWheelConfig();
  res.json({ ok: true, config, rewards: config.rewards, active: config.active !== false, source: config.source || 'runtime' });
});

router.post('/admin/wheel/config', strictLimiter, requireAdminReauth, async (req, res) => {
  const result = await setWheelConfig(req.body || {}, { actor: adminActor(req) });
  if (!result.ok) return res.status(400).json(result);
  logAdmin(req, 'admin.wheel.config.update', { active: result.config.active, rewardCount: result.config.rewards.length });
  res.json(result);
});

router.get('/admin/runtime-logs', (_req, res) => res.json({ ok:true, logs:listAdminLogs() }));

router.post('/admin/cleanup/firestore', strictLimiter, requireAdminReauth, async (req,res) => {
  const { db } = fb();
  const report = await runSafeFirestoreCleanup({ db, dryRun:req.body?.dryRun !== false });
  logAdmin(req, 'admin.cleanup.firestore', report);
  res.json(report);
});

module.exports = router;
