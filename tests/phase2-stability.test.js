'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHAT_RETENTION_POLICY } = require('../config/constants');
const { normalizeUserRankState, buildProgressionSnapshot } = require('../utils/progression');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('chat retention politikası global 7 gün ve DM 14 gün özetini üretir', () => {
  assert.equal(CHAT_RETENTION_POLICY.lobbyDays, 7);
  assert.equal(CHAT_RETENTION_POLICY.directDays, 14);
  assert.equal(CHAT_RETENTION_POLICY.summaryLabel, 'Global 7 Gün · DM 14 Gün');
});

test('normalizeUserRankState totalRank seasonRank ve competitiveScore alanlarını senkron tutar', () => {
  const normalized = normalizeUserRankState({ rp: 4200, seasonRp: 1250 });
  assert.equal(normalized.competitiveScore, 4200);
  assert.equal(normalized.totalRank, 'Gold');
  assert.equal(normalized.totalRankClass, 'rank-gold');
  assert.equal(normalized.seasonScore, 1250);
  assert.equal(normalized.seasonRank, 'Silver');
  assert.equal(normalized.seasonRankClass, 'rank-silver');
});

test('progression snapshot total rank ve sezon rank ayrımını korur', () => {
  const snapshot = buildProgressionSnapshot({ rp: 9800, seasonRp: 800 });
  assert.equal(snapshot.totalRank, 'Platinum');
  assert.equal(snapshot.totalRankScore, 9800);
  assert.equal(snapshot.seasonRank, 'Bronze');
  assert.equal(snapshot.seasonRankScore, 800);
});

test('script total rank etiketini ve dinamik retention özetini kullanır', () => {
  const source = read('script.js');
  assert.match(source, /function getChatPolicySummary\(data = \{\}\)/);
  assert.match(source, /headerRankText"\)\.textContent = `\$\{totalRankName\} · \$\{formatNumber\(competitiveScore\)\} RP`/);
  assert.match(source, /setOverviewText\('retentionBadge', getChatPolicySummary\(data\)\);/);
});

test('chat policy endpoint ve yeni puan alanları kaynak kodda yer alır', () => {
  const chatRoutes = read('routes/chat.routes.js');
  const rpSystem = read('utils/rpSystem.js');
  const chessRoutes = read('routes/chess.routes.js');
  const crons = read('crons/tasks.js');

  assert.match(chatRoutes, /router\.get\('\/chat\/policy'/);
  assert.match(chatRoutes, /policy: CHAT_RETENTION_POLICY/);
  assert.match(rpSystem, /competitiveScore: admin\.firestore\.FieldValue\.increment\(safeDelta\)/);
  assert.match(rpSystem, /seasonScore: admin\.firestore\.FieldValue\.increment\(safeDelta\)/);
  assert.match(chessRoutes, /normalizeUserRankState\(\{ rp: nextARp, seasonRp: nextASeasonRp \}\)/);
  assert.match(crons, /seasonScore: 0, seasonRank: 'Bronze'/);
});
