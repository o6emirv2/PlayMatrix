'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REWARD_CATALOG } = require('../config/rewardCatalog');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('referral invitee katalog ödülü varsayılan olarak görünür ve sıfır değildir', () => {
  assert.ok(REWARD_CATALOG.referral_invitee);
  assert.equal(REWARD_CATALOG.referral_invitee.amount, 10000);
  assert.match(REWARD_CATALOG.referral_invitee.description, /hoş geldin bonusu/i);
});

test('referral claim akışı merkezi reward runtime değerlerini kullanır', () => {
  const source = read('routes/profile.routes.js');
  assert.match(source, /getRewardRuntimeCatalog\(\{ includePrivate: false \}\)/);
  assert.match(source, /getFixedRewardAmount\('referral_inviter'/);
  assert.match(source, /getFixedRewardAmount\('referral_invitee'/);
});

test('premium phase5 teması sayfa türü farkındalığı ve faz 6 token katmanını taşır', () => {
  const js = read('public/premium-phase5.js');
  const css = read('public/premium-phase5.css');
  assert.match(js, /resolvePageKind/);
  assert.match(js, /data-pm-page-kind/);
  assert.match(css, /PHASE 6 DESIGN SYSTEM CONSOLIDATION/);
  assert.match(css, /--pm-token-button-h/);
  assert.match(css, /data-pm-page-kind="game"/);
  assert.match(css, /data-pm-page-kind="admin"/);
});

test('style css final avatar normalizer legacy frame halkalarını nötralize eder', () => {
  const css = read('style.css');
  assert.match(css, /PHASE 6 AVATAR SYSTEM FINAL NORMALIZER/);
  assert.match(css, /PHASE 6 AVATAR SYSTEM FINAL NORMALIZER/);
  assert.match(css, /background:transparent !important/);
});

test('varsayılan origin listesi uzak backend fallback adresini tanır', () => {
  const constants = read('config/constants.js');
  assert.match(constants, /emirhan-siye\.onrender\.com/);
});

test('oyun sayfaları interactive-widget viewport desteği taşır', () => {
  for (const rel of [
    'Online Oyunlar/Pisti.html',
    'Online Oyunlar/Satranc.html',
    'Online Oyunlar/Crash.html',
    'Casino/Mines.html',
    'Casino/BlackJack.html',
    'Casino/Pisti.html',
    'Klasik Oyunlar/SpacePro.html',
    'Klasik Oyunlar/SnakePro.html',
    'Klasik Oyunlar/PatternMaster.html'
  ]) {
    const html = read(rel);
    assert.match(html, /interactive-widget=resizes-content/, rel);
  }
});
