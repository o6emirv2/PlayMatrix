const express = require('express');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { migrateUserProfile } = require('../core/legacyMigrationService');
const { getProgression } = require('../core/progressionService');

const router = express.Router();

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
function canUseFrame(frameLevel = 0, accountLevel = 1) { const tier = frameTierFor(frameLevel); return !tier || tier.min <= normalizeFrameLevel(accountLevel || 1); }
async function readProfile(req) {
  const { db } = initFirebaseAdmin();
  let profile = { uid: req.user.uid, email: req.user.email || '', balance: 0, xp: 0, selectedFrame: 0 };
  if (db) {
    const snap = await db.collection('users').doc(req.user.uid).get();
    if (snap.exists) profile = { ...profile, ...snap.data() };
  }
  profile = await migrateUserProfile(req.user.uid, profile, db);
  const progression = getProgression(profile.accountXp ?? profile.xp ?? 0);
  const selectedFrame = canUseFrame(profile.selectedFrame ?? profile.frame ?? 0, progression.level) ? canonicalSelectedFrame(profile.selectedFrame ?? profile.frame ?? 0) : 0;
  return { db, profile: { ...profile, selectedFrame, xp: progression.xp, accountXp: progression.xp, accountLevel: progression.level, level: progression.level, progressPercent: progression.progressPercent, accountLevelProgressPct: progression.progressPercent, progression } };
}

router.get('/user/me', requireAuth, async (req, res) => {
  const { profile } = await readProfile(req);
  res.json({ ok: true, profile });
});

router.post('/user/frame', requireAuth, async (req, res) => {
  const requested = normalizeFrameLevel(req.body?.frame);
  const { db, profile } = await readProfile(req);
  const selectedFrame = canUseFrame(requested, profile.accountLevel) ? canonicalSelectedFrame(requested) : 0;
  if (db) await db.collection('users').doc(req.user.uid).set({ selectedFrame, marketFrameId: '', marketFrameUrl: '', frameUrl: '', cosmeticSlots: { frame: { source: 'normal', itemId: String(selectedFrame || ''), updatedAt: Date.now() } }, updatedAt: Date.now() }, { merge: true });
  res.json({ ok: true, selectedFrame, frameAssetIndex: frameTierFor(selectedFrame)?.asset || 0, accountLevel: profile.accountLevel });
});

router.post('/user/avatar', requireAuth, async (req, res) => {
  const avatar = String(req.body.avatar || '').slice(0, 1000);
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('users').doc(req.user.uid).set({ avatar, marketAvatarId: '', selectedAvatar: '', cosmeticSlots: { avatar: { source: 'normal', itemId: 'custom-avatar', updatedAt: Date.now() } }, updatedAt: Date.now() }, { merge: true });
  res.json({ ok: true, avatar });
});

module.exports = router;
