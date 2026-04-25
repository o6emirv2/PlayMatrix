'use strict';

const { cleanStr } = require('./helpers');
const { DEFAULT_FEATURE_FLAGS, PUBLIC_FEATURE_FLAG_KEYS, FEATURE_FLAG_LABELS } = require('../config/featureFlags');

function parseFlagValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const raw = cleanStr(String(value ?? ''), 32).toLowerCase();
  if (!raw) return !!fallback;
  if (['1', 'true', 'yes', 'on', 'enabled', 'enable', 'aktif'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled', 'disable', 'pasif'].includes(raw)) return false;
  return !!fallback;
}

function sanitizeFeatureFlags(input = {}, baseFlags = DEFAULT_FEATURE_FLAGS) {
  const normalizedBase = { ...DEFAULT_FEATURE_FLAGS, ...(baseFlags && typeof baseFlags === 'object' ? baseFlags : {}) };
  const out = {};
  Object.keys(normalizedBase).forEach((key) => {
    const hasOwn = input && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, key);
    out[key] = hasOwn ? parseFlagValue(input[key], normalizedBase[key]) : !!normalizedBase[key];
  });
  return out;
}

function mergeFeatureFlags(baseFlags = DEFAULT_FEATURE_FLAGS, overrideFlags = {}) {
  return sanitizeFeatureFlags({ ...(baseFlags || {}), ...(overrideFlags || {}) }, baseFlags);
}

function getPublicFeatureFlags(flags = DEFAULT_FEATURE_FLAGS) {
  const normalized = sanitizeFeatureFlags(flags);
  return PUBLIC_FEATURE_FLAG_KEYS.reduce((acc, key) => {
    acc[key] = !!normalized[key];
    return acc;
  }, {});
}

function buildFeatureFlagRows(flags = DEFAULT_FEATURE_FLAGS) {
  const normalized = sanitizeFeatureFlags(flags);
  return Object.keys(normalized).map((key) => ({
    key,
    label: FEATURE_FLAG_LABELS[key] || key,
    enabled: !!normalized[key]
  }));
}

module.exports = {
  parseFlagValue,
  sanitizeFeatureFlags,
  mergeFeatureFlags,
  getPublicFeatureFlags,
  buildFeatureFlagRows
};
