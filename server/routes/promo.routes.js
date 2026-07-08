const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../core/security');
const { requireAgeGate } = require('../core/ageGateService');
const { requireAdminReauth, writeAdminAudit } = require('../core/adminReauthService');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { creditBalance } = require('../core/economyService');
const { getProgression, normalizeXpBigInt } = require('../core/progressionService');
const { grantWheelRights } = require('../core/wheelRightsService');
const { recordRecentActivity } = require('../core/recentActivityService');
const { runtimeStore } = require('../core/runtimeStore');
const router = express.Router();
function isEmailVerified(user = {}) { return !!(user.email_verified || user.emailVerified); }
const normalizeCode = (v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);

const cleanText = (v, max = 120) => String(v || '').replace(/[<>]/g, '').trim().slice(0, max);
function normalizePromoRewards(body = {}) {
  const promoType = cleanText(body.promoType || body.type || '', 80);
  const amount = promoType && promoType !== 'mc' ? 0 : Math.max(0, Math.trunc(Number(body.amount ?? body.mc ?? 0) || 0));
  const xp = promoType && promoType !== 'xp' ? 0 : Math.max(0, Math.trunc(Number(body.xp ?? body.xpAmount ?? 0) || 0));
  const marketItemId = promoType && promoType !== 'market' ? '' : cleanText(body.marketItemId || body.marketFrameId || body.itemId || '', 80);
  const ticketCount = Math.max(0, Math.min(1000, Math.trunc(Number(body.ticketCount || body.rights || body.count || 0) || 0)));
  const rewards = [];
  if (amount > 0) rewards.push({ type: 'mc', amount, label: `${amount.toLocaleString('tr-TR')} MC` });
  if (xp > 0) rewards.push({ type: 'xp', amount: xp, label: `${xp.toLocaleString('tr-TR')} XP` });
  if (marketItemId) rewards.push({ type: 'market', itemId: marketItemId, label: `Market ürünü: ${marketItemId}` });
  if (['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket'].includes(promoType) && ticketCount > 0) rewards.push({ type: 'gameTicket', game: promoType.replace('_bet_ticket', ''), mode: 'bet', count: ticketCount, label: `${promoType.replace('_bet_ticket', '')} bahisli oyun hakkı x${ticketCount}` });
  if (promoType === 'wheel_right' && ticketCount > 0) rewards.push({ type: 'wheelRight', count: ticketCount, label: `Çark hakkı x${ticketCount}` });
  return { promoType, amount, xp, marketItemId, ticketCount, rewards, rewardSummary: rewards.map((r) => r.label).join(' + ') };
}
async function validatePromoAvailability({ promo = {}, uid = '', db = null }) {
  const ts = Date.now();
  if (promo.active === false) return { ok:false, status:409, error:'PROMO_INACTIVE' };
  if (Number(promo.startsAt || 0) > ts) return { ok:false, status:409, error:'PROMO_NOT_STARTED' };
  if (Number(promo.expiresAt || 0) && Number(promo.expiresAt || 0) <= ts) return { ok:false, status:409, error:'PROMO_EXPIRED' };
  const maxClaims = Math.max(1, Math.trunc(Number(promo.maxClaims || promo.usageLimit || 1)));
  const claimedCount = Math.max(0, Math.trunc(Number(promo.claimedCount || 0)));
  if (claimedCount >= maxClaims) return { ok:false, status:409, error:'PROMO_LIMIT_REACHED' };
  const minLevel = Math.max(0, Math.trunc(Number(promo.minLevel || 0) || 0));
  const maxLevel = Math.max(0, Math.trunc(Number(promo.maxLevel || 0) || 0));
  if ((minLevel || maxLevel) && db && uid) {
    const userSnap = await db.collection('users').doc(String(uid)).get().catch(() => null);
    const data = userSnap?.exists ? (userSnap.data() || {}) : {};
    const level = Number(data.accountLevel || data.level || getProgression(data.accountXp ?? data.xp ?? 0).accountLevel || 1);
    if (minLevel && level < minLevel) return { ok:false, status:403, error:'PROMO_LEVEL_TOO_LOW' };
    if (maxLevel && level > maxLevel) return { ok:false, status:403, error:'PROMO_LEVEL_TOO_HIGH' };
  }
  return { ok:true };
}

async function reservePromoClaimFirestore({ db, admin, uid, code, claimKey, promoCodeRef, legacyPromoRef }) {
  const claimRef = db.collection('promoClaims').doc(claimKey);
  const attemptId = crypto.randomBytes(8).toString('hex');
  let output = { ok: false, status: 409, error: 'PROMO_ALREADY_CLAIMED' };
  await db.runTransaction(async (tx) => {
    const [claimSnap, codeSnap, legacySnap] = await Promise.all([tx.get(claimRef), tx.get(promoCodeRef), tx.get(legacyPromoRef)]);
    if (claimSnap.exists && claimSnap.data()?.status !== 'failed') {
      output = { ok: false, status: 409, error: 'PROMO_ALREADY_CLAIMED' };
      return;
    }
    const promo = codeSnap.exists ? (codeSnap.data() || {}) : legacySnap.exists ? (legacySnap.data() || {}) : null;
    if (!promo) { output = { ok: false, status: 404, error: 'PROMO_NOT_FOUND' }; return; }
    const availability = await validatePromoAvailability({ promo, uid, db: null });
    if (!availability.ok) { output = availability; return; }
    const maxClaims = Math.max(1, Math.trunc(Number(promo.maxClaims || promo.usageLimit || 1)));
    const claimedCount = Math.max(0, Math.trunc(Number(promo.claimedCount || 0)));
    const reservedCount = Math.max(0, Math.trunc(Number(promo.reservedCount || 0)));
    if (claimedCount + reservedCount >= maxClaims) { output = { ok:false, status:409, error:'PROMO_LIMIT_REACHED' }; return; }
    const nowTs = Date.now();
    const pending = { uid, code, status: 'pending', attemptId, createdAt: nowTs, updatedAt: nowTs };
    tx.set(claimRef, pending, { merge: false });
    const patch = { code, reservedCount: admin.firestore.FieldValue.increment(1), updatedAt: nowTs };
    tx.set(promoCodeRef, patch, { merge: true });
    tx.set(legacyPromoRef, patch, { merge: true });
    output = { ok: true, promo, claimRef, attemptId };
  });
  return output;
}
async function finalizePromoClaimFirestore({ db, admin = null, uid, code, claimKey, rewards, attemptId, status = 'claimed', promoCodeRef = null, legacyPromoRef = null }) {
  const claimRef = db.collection('promoClaims').doc(claimKey);
  await db.runTransaction(async (tx) => {
    const refs = [claimRef];
    if (promoCodeRef) refs.push(promoCodeRef);
    if (legacyPromoRef) refs.push(legacyPromoRef);
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const claimSnap = snaps[0];
    const existing = claimSnap.exists ? (claimSnap.data() || {}) : {};
    if (existing.status === 'claimed' && status === 'claimed') return;
    const nowTs = Date.now();
    tx.set(claimRef, { uid, code, status, attemptId, amount: rewards.amount || 0, xp: rewards.xp || 0, marketGranted: rewards.marketGranted || [], badgesGranted: rewards.badgesGranted || [], nameEffectsGranted: rewards.nameEffectsGranted || [], gameTicketsGranted: rewards.gameTicketsGranted || [], wheelRightsGranted: rewards.wheelRightsGranted || 0, rewardSummary: rewards.rewardSummary || '', finalizedAt: nowTs, updatedAt: nowTs }, { merge: true });
    if (promoCodeRef && legacyPromoRef) {
      const writeRefs = [promoCodeRef, legacyPromoRef];
      const writeSnaps = snaps.slice(1);
      writeRefs.forEach((ref, index) => {
        const data = writeSnaps[index]?.exists ? (writeSnaps[index].data() || {}) : {};
        const reservedCount = Math.max(0, Math.trunc(Number(data.reservedCount || 0)));
        const patch = { code, reservedCount: Math.max(0, reservedCount - 1), updatedAt: nowTs };
        if (status === 'claimed' && admin?.firestore?.FieldValue) patch.claimedCount = admin.firestore.FieldValue.increment(1);
        tx.set(ref, patch, { merge: true });
      });
    }
  });
}
async function applyPromoRewards({ uid, promo, code, claimKey }) {
  const { db } = initFirebaseAdmin();
  const rewardInfo = normalizePromoRewards(promo || {});
  const output = { ok: true, code, amount: 0, xp: 0, marketGranted: [], badgesGranted: [], nameEffectsGranted: [], gameTicketsGranted: [], wheelRightsGranted: 0, rewardSummary: rewardInfo.rewardSummary || '' };
  if (rewardInfo.amount > 0) {
    const economy = await creditBalance({ uid, amount: rewardInfo.amount, reason: `promo:${code}`, idempotencyKey: `${claimKey}:mc` });
    if (!economy.ok) return economy;
    output.amount = rewardInfo.amount;
    output.balance = economy.balance;
  }
  if (rewardInfo.xp > 0) {
    if (db) {
      const userRef = db.collection('users').doc(String(uid));
      const xpIdemRef = db.collection('idempotency').doc(`${claimKey}:xp`);
      await db.runTransaction(async (tx) => {
        const idem = await tx.get(xpIdemRef);
        if (idem.exists) { const stored = idem.data()?.result || {}; output.xp = Number(stored.xp || stored.xpAwarded || 0); output.progression = stored.progression || null; return; }
        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() || {} : {};
        const before = getProgression(data.accountXp ?? data.xp ?? 0);
        const xpToAdd = before.isMaxLevel ? 0 : rewardInfo.xp;
        const next = normalizeXpBigInt(data.accountXp ?? data.xp ?? 0) + BigInt(xpToAdd);
        const progression = getProgression(next);
        tx.set(userRef, { xp: progression.xp, accountXp: progression.currentXp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progression, updatedAt: Date.now() }, { merge: true });
        output.xp = xpToAdd;
        output.progression = progression;
        tx.set(xpIdemRef, { key: `${claimKey}:xp`, type: 'promo-xp', uid, code, createdAt: Date.now(), result: { xp: xpToAdd, progression } }, { merge: false });
      });
    } else {
      output.xp = rewardInfo.xp;
      output.progression = getProgression(rewardInfo.xp);
    }
  }
  if (db && rewardInfo.marketItemId) {
    const ownKey = `${uid}:${rewardInfo.marketItemId}`;
    await db.collection('marketOwnership').doc(ownKey).set({ uid, itemId: rewardInfo.marketItemId, source: 'promo', code, active: true, acquiredAt: Date.now() }, { merge: true });
    output.marketGranted.push(rewardInfo.marketItemId);
  } else if (rewardInfo.marketItemId) output.marketGranted.push(rewardInfo.marketItemId);
  if (db && rewardInfo.badgeId) await db.collection('users').doc(String(uid)).set({ promoBadges: { [rewardInfo.badgeId]: { code, grantedAt: Date.now() } }, updatedAt: Date.now() }, { merge: true });
  if (rewardInfo.badgeId) output.badgesGranted.push(rewardInfo.badgeId);
  if (db && rewardInfo.nameEffectId) await db.collection('users').doc(String(uid)).set({ promoNameEffects: { [rewardInfo.nameEffectId]: { code, grantedAt: Date.now() } }, nameEffectId: rewardInfo.nameEffectId, updatedAt: Date.now() }, { merge: true });
  if (rewardInfo.nameEffectId) output.nameEffectsGranted.push(rewardInfo.nameEffectId);
  const gameTickets = (rewardInfo.rewards || []).filter((r) => r.type === 'gameTicket');
  const wheelRights = (rewardInfo.rewards || []).filter((r) => r.type === 'wheelRight').reduce((sum, r) => sum + Math.max(0, Number(r.count || 0)), 0);
  if (gameTickets.length && db) {
    const ticketPatch = {};
    gameTickets.forEach((ticket) => { ticketPatch[`${ticket.game}:bet`] = { count: Math.max(1, Math.trunc(Number(ticket.count) || 1)), code, grantedAt: Date.now(), source: 'promo' }; });
    await db.collection('users').doc(String(uid)).set({ gameTickets: ticketPatch, updatedAt: Date.now() }, { merge: true });
  }
  if (wheelRights) {
    const granted = await grantWheelRights({ uid, count: wheelRights, source: 'promo', code });
    if (!granted.ok) return granted;
    output.wheelRightsTotal = granted.total || 0;
  }
  gameTickets.forEach((ticket) => output.gameTicketsGranted.push({ game: ticket.game, count: ticket.count }));
  output.wheelRightsGranted = wheelRights;
  output.rewardSummary = output.rewardSummary || [output.amount ? `${output.amount.toLocaleString('tr-TR')} MC` : '', output.xp ? `${output.xp.toLocaleString('tr-TR')} XP` : '', ...output.marketGranted.map((x) => `Market: ${x}`), ...output.badgesGranted.map((x) => `Rozet: ${x}`), ...output.nameEffectsGranted.map((x) => `Efekt: ${x}`), ...output.gameTicketsGranted.map((x) => `${x.game} bahisli oyun hakkı x${x.count}`), output.wheelRightsGranted ? `Çark hakkı x${output.wheelRightsGranted}` : ''].filter(Boolean).join(' + ');
  return output;
}

router.post('/admin/promo', requireAuth, requireAdmin, requireAdminReauth, async (req, res) => {
  const code = normalizeCode(req.body.code);
  const rewardInfo = normalizePromoRewards(req.body || {});
  if (!code || !rewardInfo.rewards.length) return res.status(400).json({ ok:false, error:'PROMO_REWARD_REQUIRED', message:'Promo için en az bir ödül seçmelisin.' });
  const durationHours = Math.max(1, Number(req.body.durationHours || 24));
  const payload = { code, ...rewardInfo, active: req.body.active !== false, maxClaims: Math.max(1, Math.trunc(Number(req.body.maxClaims || req.body.usageLimit) || 1)), onePerAccount: req.body.onePerAccount !== false, description: cleanText(req.body.description, 200), startsAt: Math.max(0, Number(req.body.startsAt || req.body.startAt || 0) || 0), expiresAt: Math.max(Date.now() + durationHours * 3600000, Number(req.body.expiresAt || req.body.endAt || 0) || 0), minLevel: Math.max(0, Math.trunc(Number(req.body.minLevel || 0) || 0)), maxLevel: Math.max(0, Math.trunc(Number(req.body.maxLevel || 0) || 0)), createdBy: req.user.uid, updatedAt: Date.now() };
  const { db } = initFirebaseAdmin();
  if (db) { await Promise.all([db.collection('promoCodes').doc(code).set(payload, { merge: true }), db.collection('promos').doc(code).set(payload, { merge: true })]); }
  else runtimeStore.temporary.set(`promo:${code}`, payload, 30 * 86400000);
  try { await writeAdminAudit(req, 'promo.create', { code, rewards: rewardInfo.rewards.map((x) => x.type) }); } catch (_) {}
  res.json({ ok:true, promo: payload });
});
router.get('/promo/status', requireAuth, requireAgeGate, (_req, res) => {
  const stored = runtimeStore.temporary.get('admin:maintenance');
  const games = stored?.games || stored || {};
  const active = !(games.general || games.system || games.promo);
  res.json({ ok: true, enabled: active, active, source: 'maintenance-runtime' });
});

router.post('/promo/claim', requireAuth, requireAgeGate, async (req, res) => {
  if (!isEmailVerified(req.user)) return res.status(403).json({ ok:false, error:'EMAIL_VERIFICATION_REQUIRED' });
  const uid = req.user.uid;
  const code = normalizeCode(req.body.code);
  if (!code) return res.status(400).json({ ok:false, error:'CODE_REQUIRED' });
  const claimKey = `promo:${code}:${uid}`;
  const { db } = initFirebaseAdmin();
  let promo = null;
  if (db) {
    const promoCodeRef = db.collection('promoCodes').doc(code);
    const legacyPromoRef = db.collection('promos').doc(code);
    let promoSnap = await promoCodeRef.get();
    if (!promoSnap.exists) promoSnap = await legacyPromoRef.get();
    if (!promoSnap.exists) return res.status(404).json({ ok:false, error:'PROMO_NOT_FOUND' });
    promo = promoSnap.data();
    const availability = await validatePromoAvailability({ promo, uid, db });
    if (!availability.ok) return res.status(availability.status || 409).json({ ok:false, error: availability.error });
    const admin = require('firebase-admin');
    const reservation = await reservePromoClaimFirestore({ db, admin, uid, code, claimKey, promoCodeRef, legacyPromoRef });
    if (!reservation.ok) return res.status(reservation.status || 409).json({ ok:false, error: reservation.error || 'PROMO_ALREADY_CLAIMED' });
    promo = reservation.promo || promo;
    const rewards = await applyPromoRewards({ uid, promo, code, claimKey });
    if (!rewards.ok) {
      await finalizePromoClaimFirestore({ db, admin, uid, code, claimKey, rewards, attemptId: reservation.attemptId, status: 'failed', promoCodeRef, legacyPromoRef }).catch(() => null);
      return res.status(400).json(rewards);
    }
    await finalizePromoClaimFirestore({ db, admin, uid, code, claimKey, rewards, attemptId: reservation.attemptId, status: 'claimed', promoCodeRef, legacyPromoRef });
    recordRecentActivity({ id: `promo:${code}:${uid}`, source: 'promo', game: 'promo', title: 'Promo Kazancı', username: req.user?.username || req.user?.displayName || 'Oyuncu', uid, amount: rewards.amount || 0, xp: rewards.xp || 0, rewardType: promo.promoType || promo.type || 'promo', rewardLabel: rewards.rewardSummary || 'Promo ödülü', outcome: 'claimed' });
    return res.json({ ok:true, ...rewards });
  }
  promo = runtimeStore.temporary.get(`promo:${code}`);
  if (!promo) return res.status(404).json({ ok:false, error:'PROMO_NOT_FOUND' });
  const availability = await validatePromoAvailability({ promo, uid, db: null });
  if (!availability.ok) return res.status(availability.status || 409).json({ ok:false, error: availability.error });
  if (runtimeStore.temporary.get(claimKey)) return res.status(409).json({ ok:false, error:'PROMO_ALREADY_CLAIMED' });
  const rewards = await applyPromoRewards({ uid, promo, code, claimKey });
  if (!rewards.ok) return res.status(400).json(rewards);
  runtimeStore.temporary.set(claimKey, true, 30*86400000);
  recordRecentActivity({ id: `promo:${code}:${uid}`, source: 'promo', game: 'promo', title: 'Promo Kazancı', username: req.user?.username || req.user?.displayName || 'Oyuncu', uid, amount: rewards.amount || 0, xp: rewards.xp || 0, rewardType: promo.promoType || promo.type || 'promo', rewardLabel: rewards.rewardSummary || 'Promo ödülü', outcome: 'claimed' });
  res.json({ ok:true, ...rewards });
});
module.exports = router;
