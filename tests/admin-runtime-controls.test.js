'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeChatRetentionPolicy, mergeRewardCatalog } = require('../utils/adminConfig');
const { summarizeRooms } = require('../utils/roomHealth');
const { listRewardCatalog } = require('../config/rewardCatalog');

test('runtime retention policy güvenli sınırlar içinde normalize edilir', () => {
  const policy = normalizeChatRetentionPolicy({ lobbyDays: 0, directDays: 999 });
  assert.equal(policy.lobbyDays, 1);
  assert.equal(policy.directDays, 90);
  assert.match(policy.summaryLabel, /Global 1 Gün/);
});

test('reward catalog override yalnız tanımlı alanları güvenli biçimde birleştirir', () => {
  const base = listRewardCatalog({ includePrivate: false });
  const merged = mergeRewardCatalog(base, [{ source: 'chess_win', amount: 7777, enabled: false }]);
  const chess = merged.find((item) => item.source === 'chess_win');
  assert.equal(chess.amount, 7777);
  assert.equal(chess.enabled, false);
});

test('room health özetleyici stale ve resumable sayaçlarını üretir', () => {
  const now = 1_000_000;
  const summary = summarizeRooms([
    { state: 'waiting', createdAt: now - 10_000 },
    { state: 'playing', cleanupAt: now - 1, resumeAvailableUntil: now + 5_000, disconnectAt: now - 2_000 }
  ], now);
  assert.equal(summary.total, 2);
  assert.equal(summary.waiting, 1);
  assert.equal(summary.playing, 1);
  assert.equal(summary.stale, 1);
  assert.equal(summary.resumable, 1);
  assert.equal(summary.disconnectMarked, 1);
});

test('admin panel tanı, retention, reward ve room health bölümlerini içerir', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');
  assert.match(source, /Admin Tanı Ekranı/);
  assert.match(source, /Retention Kontrolü/);
  assert.match(source, /Ödül Yönetimi/);
  assert.match(source, /Room Health \/ Live Ops/);
  assert.match(source, /featureFlagsSaveBtn/);
});

test('admin routes retention, reward catalog ve room health endpointlerini içerir', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.routes.js'), 'utf8');
  assert.match(source, /router\.get\('\/admin\/retention-policy'/);
  assert.match(source, /router\.patch\('\/admin\/retention-policy'/);
  assert.match(source, /router\.get\('\/admin\/reward-catalog'/);
  assert.match(source, /router\.patch\('\/admin\/reward-catalog'/);
  assert.match(source, /router\.get\('\/admin\/rooms\/health'/);
});
