'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('invite center yardımcı modülü cooldown ve party snapshot üretir', () => {
  const src = read('utils/inviteCenter.js');
  assert.match(src, /SOCKET_INVITE_WINDOW_MS/);
  assert.match(src, /buildInviteCooldownSnapshot/);
  assert.match(src, /buildPartyInviteSnapshot/);
  assert.match(src, /nextReadyInMs/);
});

test('party route gelen ve giden davetler için diagnostics döndürür', () => {
  const src = read('routes/party.routes.js');
  assert.match(src, /outgoingInvites/);
  assert.match(src, /diagnostics: buildPartyInviteSnapshot/);
  assert.match(src, /statusMessage: 'Parti daveti gönderildi\. Yanıt bekleniyor\.'/);
});

test('social center summary partyCenter ve inviteCenter meta taşır', () => {
  const src = read('routes/socialcenter.routes.js');
  assert.match(src, /getOutgoingPartyInvites/);
  assert.match(src, /const inviteCenter = buildInviteCooldownSnapshot/);
  assert.match(src, /const partyCenter = buildPartyInviteSnapshot/);
  assert.match(src, /partyOutgoingInvites:/);
});

test('istemci tarafı parti ekranında giden davetler ve cooldown görünürlüğü sunar', () => {
  const src = read('script.js');
  assert.match(src, /formatRemainingShort/);
  assert.match(src, /Gönderilen Parti Davetleri/);
  assert.match(src, /Davet \/ Cooldown Özeti/);
  assert.match(src, /payload\.inviteCenter\?\.diagnostics\?\.limitReached/);
});

test('socket invite error payload cooldown tekrar bilgisini taşıyabilir', () => {
  const src = read('sockets/index.js');
  assert.match(src, /INVITE_RATE_LIMIT/);
  assert.match(src, /retryAfterMs: SOCKET_INVITE_WINDOW_MS/);
  assert.match(src, /statusMessage: inviteConflict\.message/);
});
