const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
const { buildInventoryHub } = require('../utils/experienceCenter');
const { buildSeasonalShopRuntime, getOwnedCosmeticKeys, normalizePurchaseHistory } = require('../utils/seasonalShopCenter');

function sampleVipCenter() {
  return {
    appearance: {
      selectedTheme: { key: 'obsidian' },
      selectedNameplate: { key: 'clean' },
      selectedBubble: { key: 'default' },
      selectedBannerPreset: { key: 'none' },
      selectedHalo: { key: 'none' },
      themes: [{ key: 'obsidian', label: 'Obsidyen Pro', unlocked: true, selected: true }],
      nameplates: [{ key: 'clean', label: 'Clean Plate', unlocked: true, selected: true }],
      bubbles: [{ key: 'default', label: 'Standart Sohbet', unlocked: true, selected: true }],
      banners: [{ key: 'none', label: 'Banner Yok', unlocked: true, selected: true }],
      halos: [{ key: 'none', label: 'Halo Yok', unlocked: true, selected: true }]
    }
  };
}

test('seasonal shop runtime sahiplik, VIP ve bakiye durumlarını üretir', () => {
  const runtime = buildSeasonalShopRuntime({
    user: {
      balance: 26000,
      vipActive: false,
      cosmeticInventoryOwned: ['table_theme_gold'],
      cosmeticPurchaseHistory: [{ key: 'vip_nameplate_obsidian', label: 'Obsidyen İsim Plakası', purchasedAt: Date.now() - 1000 }]
    },
    featureFlags: { seasonalShop: true }
  });
  assert.ok(runtime.itemCount >= 6);
  assert.ok(runtime.ownedCount >= 2);
  assert.ok(runtime.affordableCount >= 1);
  assert.ok(runtime.items.some((item) => item.key === 'table_theme_gold' && item.owned));
  assert.ok(runtime.items.some((item) => item.key === 'vip_banner_nova' && item.vipLocked));
});

test('inventory hub satın alınan seasonal shop öğelerini sahiplik olarak taşır', () => {
  const hub = buildInventoryHub({
    user: {
      cosmeticInventoryOwned: ['table_theme_gold'],
      cosmeticPurchaseHistory: [{ key: 'vip_nameplate_obsidian', label: 'Obsidyen İsim Plakası', purchasedAt: Date.now() }],
      vipTableTheme: 'table_theme_gold'
    },
    vipCenter: sampleVipCenter(),
    featureFlags: { seasonalShop: true },
    rewardSummary: { itemCount: 4 }
  });
  assert.ok(hub.ownedItems.some((item) => item.key === 'table_theme_gold'));
  assert.ok(hub.ownedItems.some((item) => item.key === 'vip_nameplate_obsidian'));
  assert.ok(hub.purchaseHistory.length >= 1);
});

test('route ve istemci seasonal shop görünürlüğünü taşır', () => {
  const routesSrc = read('routes', 'socialcenter.routes.js');
  const scriptSrc = read('script.js');
  assert.match(routesSrc, /router\.get\('\/seasonal-shop'/);
  assert.match(routesSrc, /router\.post\('\/seasonal-shop\/purchase'/);
  assert.match(routesSrc, /seasonalShopHub/);
  assert.match(scriptSrc, /Seasonal Shop/);
});

test('owned keys ve purchase history normalize edilir', () => {
  const keys = getOwnedCosmeticKeys({
    cosmeticInventoryOwned: ['TABLE_THEME_GOLD'],
    cosmeticPurchaseHistory: [{ itemKey: 'VIP_NAMEPLATE_OBSIDIAN', purchasedAt: 1 }],
    vipHalo: 'halo_royal'
  });
  assert.ok(keys.includes('table_theme_gold'));
  assert.ok(keys.includes('vip_nameplate_obsidian'));
  assert.ok(keys.includes('halo_royal'));
  const history = normalizePurchaseHistory([{ itemKey: 'VIP_NAMEPLATE_OBSIDIAN', purchasedAt: 100, priceMc: 15000 }]);
  assert.equal(history[0].key, 'vip_nameplate_obsidian');
});
