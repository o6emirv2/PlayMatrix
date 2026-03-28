const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
const { buildProfileHub, buildEconomyHub, buildInventoryHub, resolveInventorySlot } = require('../utils/experienceCenter');

function sampleVipCenter() {
  return {
    appearance: {
      selectedTheme: { key: 'obsidian' },
      selectedNameplate: { key: 'signal' },
      selectedBubble: { key: 'glass' },
      selectedBannerPreset: { key: 'mesh' },
      selectedHalo: { key: 'soft' },
      themes: [{ key: 'obsidian', label: 'Obsidyen Pro', unlocked: true, selected: true }],
      nameplates: [{ key: 'signal', label: 'Signal Edge', unlocked: true, selected: true }],
      bubbles: [{ key: 'glass', label: 'Glass Bubble', unlocked: true, selected: true }],
      banners: [{ key: 'mesh', label: 'Midnight Mesh', unlocked: true, selected: true }],
      halos: [{ key: 'soft', label: 'Soft Halo', unlocked: true, selected: true }]
    },
    overview: { unlockedAppearanceKeys: ['obsidian', 'signal', 'glass', 'mesh', 'soft'] }
  };
}

test('inventory hub kuşanılı slotlar ve owned öğeleri üretir', () => {
  const vipCenter = sampleVipCenter();
  const hub = buildInventoryHub({ user: { vipTheme: 'obsidian', vipNameplate: 'signal', vipBubble: 'glass', vipBannerPreset: 'mesh', vipHalo: 'soft', vipTableTheme: 'table_theme_gold' }, vipCenter, featureFlags: { seasonalShop: true }, rewardSummary: { itemCount: 12 } });
  assert.ok(hub.ownedCount >= 5);
  assert.ok(hub.equippedCount >= 5);
  assert.ok(hub.slotCount >= 5);
  assert.ok(hub.equippedItems.some((item) => item.slot === 'theme'));
  assert.ok(hub.slots.some((slot) => slot.slot === 'halo'));
  assert.equal(resolveInventorySlot('table_theme_gold'), 'tableTheme');
});

test('profile ve economy hub detay özetleri üretir', () => {
  const profileHub = buildProfileHub({ user: { customTitle: 'Usta Oyuncu', favoriteGame: 'chess', vipTheme: 'obsidian' }, matchPage: { items: [{ createdAt: Date.now(), outcome: 'win' }] }, matchSummary: { totalMatches: 12, wins: 8, byGame: { chess: { matches: 10, wins: 7, rewardMc: 5000 } } }, rewardPage: { items: [{ source: 'promo_code', label: 'Promo', amount: 1000, createdAt: Date.now() }] }, rewardSummary: { totalMc: 1000 }, achievements: { summary: { total: 5, unlocked: 2, completionPct: 40 }, items: [{ key: 'first_win', label: 'İlk Zafer', icon: '🏆', unlocked: true, progressPct: 100 }] } });
  const economyHub = buildEconomyHub({ user: { coins: 42000, referralCode: 'ABC', referralCount: 2, vipTheme: 'obsidian' }, rewardPage: { items: [{ source: 'promo_code', label: 'Promo', amount: 1000, createdAt: Date.now() }] }, rewardSummary: { totalMc: 1000, itemCount: 1, bySource: [{ label: 'Promo Kod', source: 'promo_code', amount: 1000, count: 1 }] }, vipCenter: sampleVipCenter(), featureFlags: { seasonalShop: true }, rewardCatalog: [{ source: 'signup_reward', label: 'Kayıt Ödülü' }] });
  assert.equal(profileHub.customTitle, 'Usta Oyuncu');
  assert.ok(profileHub.seasonHighlights.current);
  assert.ok(profileHub.achievementShowcase.spotlight.length >= 1);
  assert.equal(economyHub.balanceView.mcBalance, 42000);
  assert.ok(economyHub.rewardLedger.topSources.length >= 1);
  assert.ok(economyHub.cosmeticInventory.ownedCount >= 5);
});

test('social center route ve istemci envanter merkezi görünürlüğünü taşır', () => {
  const routesSrc = read('routes', 'socialcenter.routes.js');
  const scriptSrc = read('script.js');
  assert.match(routesSrc, /inventoryHub/);
  assert.match(routesSrc, /router\.get\('\/inventory-hub'/);
  assert.match(routesSrc, /router\.post\('\/inventory\/equip'/);
  assert.match(scriptSrc, /Envanter Merkezi/);
  assert.match(scriptSrc, /achievementShowcase\?\.spotlight/);
  assert.match(scriptSrc, /rewardLedger\?\.topSources/);
});
