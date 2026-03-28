'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStatsCenterSnapshot, buildResetScheduleSnapshot } = require('../utils/statsCenter');
const { buildProgressionSnapshot } = require('../utils/progression');
const fs = require('node:fs');
const path = require('node:path');

test('stats center canonical alanları progression ile uyumlu döner', () => {
  const user = { rp: 3200, seasonRp: 1450, monthlyActiveScore: 88, level: 12, accountXp: 14400 };
  const progression = buildProgressionSnapshot(user);
  const stats = buildStatsCenterSnapshot(user, { progression });
  assert.equal(stats.competitiveScore, progression.competitiveScore);
  assert.equal(stats.totalRank, progression.totalRank);
  assert.equal(stats.seasonRank, progression.seasonRank);
  assert.equal(stats.canonical.competitiveScore, progression.competitiveScore);
  assert.equal(stats.legacyCompat.seasonRp, progression.seasonScore);
});

test('reset schedule aylık reset ve retention özetini döner', () => {
  const schedule = buildResetScheduleSnapshot(new Date('2026-03-27T12:00:00Z'));
  assert.equal(schedule.timezone, 'Europe/Istanbul');
  assert.ok(schedule.nextSeasonResetAt > 0);
  assert.ok(/TSİ/.test(schedule.nextSeasonResetLabel));
  assert.ok(schedule.chatRetention.summaryLabel.includes('Gün'));
});

test('profile ve social center route kaynakları stats center endpointlerini içerir', () => {
  const profileSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'profile.routes.js'), 'utf8');
  const socialCenterSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'socialcenter.routes.js'), 'utf8');
  assert.match(profileSource, /router\.get\('\/stats-center'/);
  assert.match(profileSource, /router\.get\('\/reward-center'/);
  assert.match(profileSource, /statsCenter/);
  assert.match(socialCenterSource, /resetSchedule/);
  assert.match(socialCenterSource, /statsCenter/);
});


test('user-stats route local stats center ve reset schedule üretir', () => {
  const profileSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'profile.routes.js'), 'utf8');
  assert.match(profileSource, /const statsCenter = buildStatsCenterSnapshot\(data, \{ progression \}\);/);
  assert.match(profileSource, /const resetSchedule = buildResetScheduleSnapshot\(new Date\(\), \{ chatRetention: chatRetentionPolicy \}\);/);
  assert.match(profileSource, /router\.get\('\/user-stats\/:uid'/);
});
