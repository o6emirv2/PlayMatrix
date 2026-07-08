const { getProgression } = require('./progressionService');
const LEGACY_FIELDS = ['vip','vipTier','rp','seasonRp','seasonScore','selectedFrameLegacy'];
async function migrateUserProfile(uid, profile = {}, db = null) {
  const xp = Number(profile.xp ?? profile.accountXp ?? 0) || 0;
  const progression = getProgression(xp);
  const patch = { progression, accountLevel: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct };
  if (profile.selectedFrame === undefined || profile.selectedFrame === null) patch.selectedFrame = 0;
  if (db) await db.collection('users').doc(uid).set(patch, { merge: true });
  return { ...profile, ...patch };
}
module.exports = { LEGACY_FIELDS, migrateUserProfile };
