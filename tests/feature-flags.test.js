'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeFeatureFlags, getPublicFeatureFlags } = require('../utils/featureFlags');

test('sanitizeFeatureFlags boolean ve string değerleri normalize eder', () => {
  const flags = sanitizeFeatureFlags({ premiumUi: 'false', maintenanceMode: 'true' });
  assert.equal(flags.premiumUi, false);
  assert.equal(flags.maintenanceMode, true);
});

test('getPublicFeatureFlags sadece public anahtarları döner', () => {
  const flags = getPublicFeatureFlags({ premiumUi: true, adminHealthDashboard: false, maintenanceMode: true });
  assert.equal(flags.premiumUi, true);
  assert.equal(flags.maintenanceMode, true);
  assert.equal(Object.prototype.hasOwnProperty.call(flags, 'adminHealthDashboard'), false);
});
