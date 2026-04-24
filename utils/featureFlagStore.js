'use strict';

const { db, admin } = require('../config/firebase');
const { cleanStr } = require('./helpers');
const { DEFAULT_FEATURE_FLAGS } = require('../config/featureFlags');
const { sanitizeFeatureFlags } = require('./featureFlags');

const refFeatureFlags = () => db.collection('system').doc('feature_flags');
let cacheValue = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5000;

async function getFeatureFlagsDocument(options = {}) {
  const force = options.force === true;
  const now = Date.now();
  if (!force && cacheValue && (now - cacheAt) < CACHE_TTL_MS) return { ...cacheValue };
  const snap = await refFeatureFlags().get().catch(() => null);
  const data = snap?.exists ? (snap.data() || {}) : {};
  const flags = sanitizeFeatureFlags(data, DEFAULT_FEATURE_FLAGS);
  cacheValue = flags;
  cacheAt = now;
  return { ...flags };
}

async function setFeatureFlagsDocument(nextFlags = {}, actorUid = '') {
  const safeFlags = sanitizeFeatureFlags(nextFlags, DEFAULT_FEATURE_FLAGS);
  await refFeatureFlags().set({
    ...safeFlags,
    updatedAt: Date.now(),
    updatedBy: cleanStr(actorUid || '', 160),
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  cacheValue = { ...safeFlags };
  cacheAt = Date.now();
  return { ...safeFlags };
}

module.exports = {
  getFeatureFlagsDocument,
  setFeatureFlagsDocument
};
