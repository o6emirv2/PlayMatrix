'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getRewardDefinition, listRewardCatalog, buildRewardCatalogSummary } = require('../config/rewardCatalog');
const { describeRewardLedgerItem } = require('../utils/rewardLedger');
const { buildAchievementBoard, buildMissionBoard } = require('../utils/achievementBoard');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('ödül kataloğu sabit ve değişken ödülleri tek merkezde toplar', () => {
  const signup = getRewardDefinition('signup_bonus');
  const wheel = getRewardDefinition('wheel_spin');
  const summary = buildRewardCatalogSummary({ includePrivate: false });

  assert.equal(signup.label, 'Kayıt Ödülü');
  assert.equal(signup.amount, 50000);
  assert.equal(wheel.amountMin, 2500);
  assert.equal(wheel.amountMax, 50000);
  assert.ok(listRewardCatalog({ includePrivate: false }).length >= 9);
  assert.ok(summary.categoryCount >= 5);
});

test('ledger öğeleri katalog metadata ile zenginleşir', () => {
  const item = describeRewardLedgerItem({
    id: 'reward-1',
    uid: 'user-1',
    source: 'chess_disconnect_win',
    amount: 5000,
    currency: 'MC',
    meta: {}
  });

  assert.equal(item.label, 'Satranç Teknik Galibiyet');
  assert.equal(item.category, 'game');
  assert.equal(item.cadence, 'daily_capped');
  assert.equal(item.grantType, 'fixed');
});

test('başarılar ve görev panosu kullanıcı ilerlemesini üretir', () => {
  const achievementBoard = buildAchievementBoard({
    user: { monthlyActiveScore: 30, competitiveScore: 1600 },
    matchSummary: {
      totalMatches: 6,
      wins: 3,
      losses: 2,
      draws: 1,
      byGame: {
        chess: { wins: 1 },
        pisti: { wins: 3 }
      }
    },
    rewardSummary: { itemCount: 6 }
  });
  const missionBoard = buildMissionBoard({
    user: { monthlyActiveScore: 30, competitiveScore: 1600 },
    matchSummary: { totalMatches: 6, wins: 3, byGame: { chess: { wins: 1 }, pisti: { wins: 3 } } },
    rewardSummary: { itemCount: 6 }
  });

  assert.equal(achievementBoard.summary.unlocked >= 5, true);
  assert.equal(missionBoard.summary.completed >= 4, true);
  assert.equal(achievementBoard.items.find((item) => item.key === 'pisti_sharp').unlocked, true);
  assert.equal(missionBoard.items.find((item) => item.key === 'mission_competitive_1500').unlocked, true);
});

test('sosyal merkez kaynak kodu faz 3 endpointlerini ve panellerini içerir', () => {
  const socialRoutes = read('routes/socialcenter.routes.js');
  const script = read('script.js');

  assert.match(socialRoutes, /router\.get\('\/rewards\/catalog'/);
  assert.match(socialRoutes, /router\.get\('\/matches\/history'/);
  assert.match(socialRoutes, /router\.get\('\/achievements'/);
  assert.match(socialRoutes, /router\.get\('\/missions'/);
  assert.match(script, /Görev Panosu/);
  assert.match(script, /Başarılar/);
  assert.match(script, /Maç Merkezi/);
});
