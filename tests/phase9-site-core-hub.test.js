const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

test('sosyal merkez profil, ekonomi ve oyun hub endpointlerini ve özet alanlarını taşır', () => {
  const src = read('routes', 'socialcenter.routes.js');
  assert.match(src, /pinnedFriends:/);
  assert.match(src, /inviteCenter\b/);
  assert.match(src, /profileHub\b/);
  assert.match(src, /economyHub\b/);
  assert.match(src, /gameHub\b/);
  assert.match(src, /router\.get\('\/profile-hub'/);
  assert.match(src, /router\.get\('\/economy-hub'/);
  assert.match(src, /router\.get\('\/game-hub'/);
  assert.match(src, /router\.patch\('\/preferences'/);
  assert.match(src, /router\.patch\('\/friends\/:uid\/preferences'/);
});

test('admin runtime merkezi görünümü ve requestId sinyali kaynaklarda bulunur', () => {
  const adminHtml = read('public', 'admin', 'index.html');
  const runtimeJs = read('public', 'premium-phase5.js');
  assert.match(adminHtml, /Runtime \/ Ops Merkezi/);
  assert.match(adminHtml, /crossOriginAuthBox/);
  assert.match(adminHtml, /moderationQueueBody/);
  assert.match(adminHtml, /balanceAnomalyBody/);
  assert.match(adminHtml, /rewardAbuseBody/);
  assert.match(adminHtml, /playmatrix:request-meta/);
  assert.match(adminHtml, /renderRuntimeCenter/);
  assert.match(runtimeJs, /playmatrix:request-meta/);
  assert.match(runtimeJs, /pm-runtime-dock/);
  assert.match(runtimeJs, /navigator\.onLine/);
  assert.match(runtimeJs, /Tekrar Dene/);
});

test('deneyim merkezleri sezon mağazası, ödül geçmişi ve kozmetik envanteri üretir', () => {
  const exp = read('utils', 'experienceCenter.js');
  const shop = read('config', 'seasonalShop.js');
  assert.match(exp, /buildProfileHub/);
  assert.match(exp, /buildEconomyHub/);
  assert.match(exp, /buildGameExperienceHub/);
  assert.match(exp, /rewardHistory/);
  assert.match(exp, /favoriteGameStats/);
  assert.match(exp, /cosmeticInventory/);
  assert.match(shop, /BASE_SEASONAL_SHOP_ITEMS/);
  assert.match(shop, /halo_royal/);
  assert.match(shop, /buildSeasonalShop/);
});
