'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('vip merkezi yardımcıları tema ve ayrıcalık katalogu üretir', () => {
  const { buildVipCenterSnapshot, buildVipCatalog } = require('../utils/vipCenter');
  const snapshot = buildVipCenterSnapshot({
    user: {
      vipTier: 6,
      vipPoints: 24000,
      totalSpentMc: 320000,
      vipTheme: 'royal',
      vipNameplate: 'monarch',
      vipBubble: 'pulse',
      vipBannerPreset: 'arc'
    },
    progression: {
      vipTier: 6,
      vipLevel: 6,
      vipLabel: 'Gold 6',
      vipShort: 'GLD',
      vipBand: 3,
      nextVipLabel: 'Platinum 7',
      vipProgress: {
        tier: 6,
        currentXp: 24000,
        currentSpend: 320000,
        xpProgressPct: 36,
        spendProgressPct: 28
      }
    },
    showcase: {
      vipTheme: 'royal',
      vipNameplate: 'monarch',
      vipBubble: 'pulse',
      vipBannerPreset: 'arc'
    }
  });

  const catalog = buildVipCatalog();
  assert.equal(snapshot.label, 'Gold 6');
  assert.equal(snapshot.appearance.selectedTheme.key, 'royal');
  assert.equal(snapshot.appearance.selectedNameplate.key, 'monarch');
  assert.ok(snapshot.perks.unlocked.length >= 4);
  assert.ok(Array.isArray(catalog.themes) && catalog.themes.length >= 4);
  assert.ok(Array.isArray(catalog.perks) && catalog.perks.length >= 6);
});

test('ana sayfa vip kulübü bölümünü ve profesyonel görünüm kimliklerini içerir', () => {
  const indexHtml = read('index.html');
  assert.match(indexHtml, /VIP Kulübü ve Profesyonel Görünüm/);
  assert.match(indexHtml, /id="vipHeroCard"/);
  assert.match(indexHtml, /id="vipLandingTier"/);
  assert.match(indexHtml, /id="vipLandingPerks"/);
});

test('script vip merkezi endpointini, landing renderını ve vitrin vip alanlarını kullanır', () => {
  const script = read('script.js');
  assert.match(script, /fetchPrivate\('\/api\/vip\/center'\)/);
  assert.match(script, /function renderVipLandingSection/);
  assert.match(script, /scVipTheme/);
  assert.match(script, /scVipNameplate/);
  assert.match(script, /scVipBubble/);
  assert.match(script, /scVipBannerPreset/);
});

test('social center route vip merkezi özetini ve katalog endpointlerini döner', () => {
  const routeSource = read('routes/socialcenter.routes.js');
  assert.match(routeSource, /vipCenter: buildVipCenterSnapshot|const vipCenter = buildVipCenterSnapshot/);
  assert.match(routeSource, /router\.get\('\/vip\/center'/);
  assert.match(routeSource, /router\.get\('\/vip\/catalog'/);
  assert.match(routeSource, /vipTheme/);
  assert.match(routeSource, /vipNameplate/);
  assert.match(routeSource, /vipBubble/);
});

test('faz 4 stilleri vip hero, metrikler ve overscroll koruması içerir', () => {
  const style = read('style.css');
  const premium = read('public/premium-phase5.css');
  assert.match(style, /\.pm-vip-hero/);
  assert.match(style, /\.pm-vip-metrics/);
  assert.match(style, /\.pm-vip-showcase-grid/);
  assert.match(premium, /overscroll-behavior-x:none/);
  assert.match(premium, /touch-action:pan-y/);
});
