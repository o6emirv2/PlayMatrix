'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildVipCatalog } = require('../utils/vipCenter');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('vip katalogu kontrollü halo ve ileri vip ayrıcalıkları içerir', () => {
  const catalog = buildVipCatalog();
  assert.ok(Array.isArray(catalog.halos) && catalog.halos.some((item) => item.key === 'royal'));
  const perks = Array.isArray(catalog.perks) ? catalog.perks.map((item) => item.key) : [];
  for (const key of ['avatar_halo', 'party_banner', 'vip_emote_pack', 'vip_missions', 'vip_season_pass', 'vip_tournament_access']) {
    assert.ok(perks.includes(key), key);
  }
});

test('premium phase5 stili design token, skeleton, empty/error ve halo sınıflarını taşır', () => {
  const css = read('public/premium-phase5.css');
  assert.match(css, /--pm-grid-unit:8px/);
  assert.match(css, /--pm-radius-md/);
  assert.match(css, /\.pm-skeleton/);
  assert.match(css, /\.pm-empty-state/);
  assert.match(css, /\.pm-error-state/);
  assert.match(css, /\.pm-vip-halo-royal/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('social center showcase kaydı vip halo alanını da içerir', () => {
  const routeSource = read('routes/socialcenter.routes.js');
  const scriptSource = read('script.js');
  assert.match(routeSource, /vipHalo/);
  assert.match(scriptSource, /scVipHalo/);
  assert.match(scriptSource, /applyVipHaloToCurrentUserAvatars/);
});

test('invite akışı detaylı gönderim ve kapanış teşhisi içerir', () => {
  const socketSource = read('sockets/index.js');
  const rtSource = read('utils/realtimeState.js');
  const scriptSource = read('script.js');
  assert.match(socketSource, /deliveryStatus/);
  assert.match(socketSource, /mapInviteErrorPayload/);
  assert.match(socketSource, /game:invite_sent/);
  assert.match(rtSource, /closeReason/);
  assert.match(rtSource, /ttl_expired/);
  assert.match(scriptSource, /formatInviteCloseReason/);
});

test('admin panel manuel tokeni kalıcı depoya yazmadan tanı bilgisini detaylı gösterir', () => {
  const adminHtml = read('public/admin/index.html');
  assert.match(adminHtml, /manuel token tarayıcı depolamasına yazılmaz/);
  assert.doesNotMatch(adminHtml, /pm_admin_manual_token/);
  assert.match(adminHtml, /Cookie bootstrap/);
  const adminMw = read('middlewares/admin.middleware.js');
  assert.match(adminMw, /UID_MISMATCH/);
  assert.match(adminMw, /EMAIL_MISMATCH/);
});

test('sayfalar sabit onrender fallback yerine mevcut origini kullanır', () => {
  for (const rel of ['Casino/Mines.html', 'Casino/Pisti.html', 'Casino/BlackJack.html']) {
    const source = read(rel);
    assert.doesNotMatch(source, /emirhan-siye\.onrender\.com/);
  }
});
