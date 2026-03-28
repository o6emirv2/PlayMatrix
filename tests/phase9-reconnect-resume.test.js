'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('game session merkezi blackjack resume ve zengin session meta üretir', () => {
  const src = read('utils/gameSession.js');
  assert.match(src, /includeBlackjack = options && options\.includeBlackjack === true/);
  assert.match(src, /const colBJ = \(\) => db\.collection\('bj_sessions'\);/);
  assert.match(src, /resumePath: '\/Casino\/BlackJack\.html\?resume=1'/);
  assert.match(src, /antiStallThresholdMs: 14000/);
});

test('experience hub reconnect overlay ve anti-stall meta döndürür', () => {
  const src = read('utils/experienceCenter.js');
  assert.match(src, /strategy: 'socket_poll_resume'/);
  assert.match(src, /graceWindowMs: 15000/);
  assert.match(src, /antiStallTimerUi:/);
  assert.match(src, /thresholdMs: 15000/);
  assert.match(src, /sessionSummary:/);
});

test('runtime dosyası oyun yaşam döngüsü docku ve provider kaydı içerir', () => {
  const src = read('public/playmatrix-runtime.js');
  assert.match(src, /pm-game-runtime-dock/);
  assert.match(src, /registerProvider\(fn\)/);
  assert.match(src, /renderGameLifecycleDock/);
  assert.match(src, /window\.dispatchEvent\(new CustomEvent\('pm-runtime-ready'\)\)/);
});

test('satranç, pişti ve blackjack sayfaları runtime bridge ile reconnect/resume durumunu besler', () => {
  const chess = read('Online Oyunlar/Satranc.html');
  const pisti = read('Online Oyunlar/Pisti.html');
  const bj = read('Casino/BlackJack.html');
  assert.match(chess, /const pmGameRuntimeState = window\.__PM_GAME_RUNTIME__/);
  assert.match(chess, /pmMarkRuntimeSync\(/);
  assert.match(pisti, /const pmGameRuntimeState = window\.__PM_GAME_RUNTIME__/);
  assert.match(pisti, /pmMarkRuntimeSync\(/);
  assert.match(bj, /let pmBjRuntimeState = window\.__PM_GAME_RUNTIME__/);
  assert.match(bj, /pmMarkRuntimeSync\(/);
});

test('social center ve profile aktif sessionları blackjack dahil isteyebilir', () => {
  const social = read('routes/socialcenter.routes.js');
  const profile = read('routes/profile.routes.js');
  assert.match(social, /listActiveSessionsForUid\(uid, \{ includeBlackjack: true \}\)/);
  assert.match(social, /listActiveSessionsForUid\(req\.user\.uid, \{ includeBlackjack: true \}\)/);
  assert.match(profile, /listActiveSessionsForUid\(req\.user\.uid, \{ includeBlackjack: true \}\)/);
});
