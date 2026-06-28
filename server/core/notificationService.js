const { runtimeStore } = require('./runtimeStore');
async function shouldShowNotification({ userId, notificationId, db }) {
  const key = `${userId}:${notificationId}`;
  if (runtimeStore.notifications.get(key)) return false;
  if (db) {
    const snap = await db.collection('notificationReceipts').doc(key).get();
    if (snap.exists) { runtimeStore.notifications.set(key, true); return false; }
  }
  return true;
}
async function markNotificationShown({ userId, notificationId, type = 'generic', db }) {
  const key = `${userId}:${notificationId}`;
  runtimeStore.notifications.set(key, true, 30 * 86400000);
  if (db) await db.collection('notificationReceipts').doc(key).set({ userId, notificationId, type, shownAt: Date.now(), expiresAt: Date.now() + 30 * 86400000 }, { merge: true });
  return { ok: true };
}
module.exports = { shouldShowNotification, markNotificationShown };
