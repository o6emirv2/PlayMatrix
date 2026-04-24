'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function assertContains(rel, pattern, label) {
  const text = read(rel);
  if (pattern instanceof RegExp ? !pattern.test(text) : !text.includes(pattern)) {
    throw new Error(`${rel}: ${label} bulunamadı.`);
  }
}
function assertNotContains(rel, pattern, label) {
  const text = read(rel);
  if (pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)) {
    throw new Error(`${rel}: ${label} kalmış.`);
  }
}

assertContains('utils/accountBootstrap.js', 'async function bootstrapAccountByAuth', 'merkezi bootstrap fonksiyonu');
assertContains('utils/accountBootstrap.js', 'syncBootstrapRewardArtifacts', 'ledger/bildirim senkronizasyonu');
assertContains('utils/accountBootstrap.js', 'recordRewardLedger', 'ledger kaydı');
assertContains('utils/accountBootstrap.js', 'createNotification', 'bildirim kaydı');
assertContains('utils/accountBootstrap.js', '`signup_reward_${safeUid}`', 'signup ödülü idempotency anahtarı');
assertContains('utils/accountBootstrap.js', 'signupRewardLedgerRecorded', 'signup ledger bayrağı');
assertContains('utils/accountBootstrap.js', 'signupRewardNotificationCreated', 'signup bildirim bayrağı');
assertContains('routes/auth.routes.js', "referenceId: 'auth_session_create'", 'auth session bootstrap referansı');
assertContains('routes/profile.routes.js', "referenceId: 'api_me'", '/api/me bootstrap referansı');
assertContains('routes/profile.routes.js', "referenceId: 'profile_update'", 'profile update bootstrap referansı');
assertNotContains('routes/profile.routes.js', /balance:\s*0,\s*email:\s*req\.user\.email/, '/api/me manuel fallback kullanıcı oluşturma');
assertNotContains('routes/auth.routes.js', /Promise\.allSettled\(\[\s*bootstrap\.grantedSignupReward/s, 'auth route içindeki asenkron signup ödül yan etkisi');

console.log('Bootstrap ödül kontrolü başarılı.');

if (!process.exitCode) process.exit(0);
