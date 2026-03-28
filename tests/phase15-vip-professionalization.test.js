const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

test('vip config profesyonel kimlik kataloglarini disa aktarir', () => {
  const src = read('config', 'vip.js');
  assert.match(src, /VIP_ENTRANCE_EFFECTS/);
  assert.match(src, /VIP_PARTY_BANNER_PRESETS/);
  assert.match(src, /VIP_EMOTE_PACKS/);
  assert.match(src, /VIP_STICKER_PACKS/);
  assert.match(src, /VIP_LOUNGE_BACKDROPS/);
  assert.match(src, /VIP_SEASON_PASS_SKINS/);
  assert.match(src, /getVipPrestigeScore/);
});

test('vip center kimlik, konfor ve erisim snapshoti uretir', () => {
  const src = read('utils', 'vipCenter.js');
  assert.match(src, /identity:/);
  assert.match(src, /selectedEntranceFx/);
  assert.match(src, /selectedPartyBanner/);
  assert.match(src, /comfort:/);
  assert.match(src, /missions:/);
  assert.match(src, /exclusiveAccess/);
  assert.match(src, /prestigeScore/);
});

test('vitrin kaydetme akisi yeni vip secim alanlarini tasir', () => {
  const route = read('routes', 'socialcenter.routes.js');
  const script = read('script.js');
  assert.match(route, /vipEntranceFx/);
  assert.match(route, /vipPartyBanner/);
  assert.match(route, /vipEmotePack/);
  assert.match(route, /vipSeasonPassSkin/);
  assert.match(script, /scVipEntranceFx/);
  assert.match(script, /scVipPartyBanner/);
  assert.match(script, /scVipEmotePack/);
  assert.match(script, /scVipSeasonPassSkin/);
});

test('vip landing html yeni profesyonel kart alanlarini icerir', () => {
  const html = read('index.html');
  assert.match(html, /vipIdentityEntrance/);
  assert.match(html, /vipComfortList/);
  assert.match(html, /vipMissionStatus/);
  assert.match(html, /vipExclusiveAccess/);
});
