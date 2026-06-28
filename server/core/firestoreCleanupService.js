const { LEGACY_FIELDS } = require('./legacyMigrationService');
async function runSafeFirestoreCleanup({ db, dryRun = true, limit = 100 } = {}) {
  if (!db) return { ok: true, skipped: true, reason: 'FIRESTORE_UNAVAILABLE' };
  const report = { ok: true, dryRun, scanned: 0, patched: 0, legacyFields: LEGACY_FIELDS };
  const snap = await db.collection('users').limit(limit).get();
  const batch = db.batch();
  snap.forEach(doc => {
    report.scanned += 1;
    const data = doc.data() || {};
    const patch = {};
    for (const field of LEGACY_FIELDS) if (Object.prototype.hasOwnProperty.call(data, field)) patch[field] = FirebaseDelete();
    if (Object.keys(patch).length) { report.patched += 1; if (!dryRun) batch.set(doc.ref, patch, { merge: true }); }
  });
  if (!dryRun && report.patched) await batch.commit();
  return report;
}
function FirebaseDelete(){ const admin = require('firebase-admin'); return admin.firestore.FieldValue.delete(); }
module.exports = { runSafeFirestoreCleanup };
