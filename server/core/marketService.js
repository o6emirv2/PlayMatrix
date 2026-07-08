const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');
const { debitBalance, creditBalance, DEFAULT_BALANCE } = require('./economyService');

const DEFAULT_CATEGORIES = Object.freeze([
  'frames',
  'badges',
  'animated-name-effects',
  'stats-card-themes'
]);
const PASSIVE_INFRA_CATEGORIES = Object.freeze([
  'avatars',
  'profile-backgrounds',
  'game-table-themes'
]);

const CATEGORY_META = Object.freeze({
  frames: Object.freeze({ label: 'Çerçeve', type: 'frame', basePrice: 500000, target: 'profile-frame' }),
  avatars: Object.freeze({ label: 'Avatar', type: 'avatar', basePrice: 50000, target: 'avatar' }),
  'profile-backgrounds': Object.freeze({ label: 'Profil Arka Planı', type: 'profile-background', basePrice: 50000, target: 'profile-background' }),
  badges: Object.freeze({ label: 'Rozet', type: 'badge', basePrice: 50000, target: 'badge' }),
  'animated-name-effects': Object.freeze({ label: 'Animasyonlu İsim Efekti', type: 'name-effect', basePrice: 50000, target: 'name-effect' }),
  'stats-card-themes': Object.freeze({ label: 'İstatistik Kart Teması', type: 'stats-card-theme', basePrice: 50000, target: 'stats-card-theme' }),
  'game-table-themes': Object.freeze({ label: 'Oyun İçi Masa / Tahta Teması', type: 'game-table-theme', basePrice: 50000, target: 'game-table-theme' })
});

const QUALITY_TIERS = Object.freeze([
  Object.freeze({ key: 'normal', label: 'Normal', multiplier: 1, stock: 100, rarity: 'Normal' }),
  Object.freeze({ key: 'orta', label: 'Orta', multiplier: 2, stock: 80, rarity: 'Orta' }),
  Object.freeze({ key: 'profesyonel', label: 'Profesyonel', multiplier: 3, stock: 60, rarity: 'Profesyonel' }),
  Object.freeze({ key: 'cok-profesyonel', label: 'Çok Profesyonel', multiplier: 4, stock: 45, rarity: 'Çok Profesyonel' }),
  Object.freeze({ key: 'ultra-profesyonel', label: 'Ultra Profesyonel', multiplier: 5, stock: 30, rarity: 'Ultra Profesyonel' }),
  Object.freeze({ key: 'ultra-mega-profesyonel', label: 'Ultra Mega Profesyonel', multiplier: 6, stock: 18, rarity: 'Ultra Mega Profesyonel' })
]);

const MARKET_FRAME_DIR = path.resolve(__dirname, '../../public/assets/market/frames');
const DEFAULT_MARKET_FRAME_STOCK = 50;
const MARKET_STATUS_KEY = 'market:global:status';
const MARKET_CATALOG_CACHE_KEY = 'market:catalog:base:v2';
const MARKET_CATALOG_CACHE_MS = 15000;
const MARKET_FIRESTORE_TIMEOUT_MS = 1800;
const MARKET_OWNERSHIP_CACHE_MS = 12000;
function withTimeout(promise, ms = MARKET_FIRESTORE_TIMEOUT_MS, label = 'TIMEOUT') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), Math.max(250, Number(ms) || MARKET_FIRESTORE_TIMEOUT_MS)))
  ]);
}
const memoryCatalog = new Map();
const memoryOwnership = new Map();
const now = () => Date.now();

function cleanId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, 100);
}
function cleanText(value, max = 180) {
  return String(value || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);
}
function cleanAsset(value, max = 700) {
  const raw = cleanText(value, max);
  if (!raw) return '';
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw.replace(/\/+/g, '/');
  if (/^(public|assets)\//i.test(raw)) return `/${raw}`.replace(/\/+/g, '/');
  return '';
}
function money(value) {
  return Math.max(0, Math.min(100_000_000_000, Math.trunc(Number(value) || 0)));
}
function ownKey(uid, itemId) {
  return `${uid}:${itemId}`;
}
function marketStatusFromMemory() {
  const stored = runtimeStore.temporary.get(MARKET_STATUS_KEY);
  if (stored && typeof stored === 'object') return { enabled: stored.enabled !== false, updatedAt: stored.updatedAt || now(), updatedBy: stored.updatedBy || '' };
  return { enabled: true, updatedAt: 0, updatedBy: '' };
}

async function getMarketStatus() {
  const { db } = initFirebaseAdmin();
  if (!db) return marketStatusFromMemory();
  const snap = await db.collection('runtimeConfig').doc('market').get().catch(() => null);
  if (!snap?.exists) return { enabled: true, updatedAt: 0, updatedBy: '' };
  const data = snap.data() || {};
  return { enabled: data.enabled !== false, updatedAt: data.updatedAt || 0, updatedBy: data.updatedBy || '' };
}

async function setMarketStatus({ enabled = true, adminUid = '' } = {}) {
  const status = { enabled: enabled !== false, updatedAt: now(), updatedBy: String(adminUid || '') };
  runtimeStore.temporary.set(MARKET_STATUS_KEY, status, 365 * 86400000);
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('runtimeConfig').doc('market').set(status, { merge: true });
  return { ok: true, ...status };
}

async function ensureMarketEnabled() {
  const status = await getMarketStatus();
  if (status.enabled === false) return { ok: false, error: 'MARKET_OFFLINE', message: 'Market şu anda çevrim dışı.', status };
  return { ok: true, status };
}

function frameTier(index = 1) {
  const n = Math.max(1, Math.trunc(Number(index) || 1));
  if (n <= 8) return { price: 500000 + (n - 1) * 500000, rarity: 'Market Çerçevesi', stock: 50 };
  if (n <= 16) return { price: 4_500_000 + (n - 9) * 750000, rarity: 'Profesyonel Çerçeve', stock: 38 };
  if (n <= 24) return { price: 10_500_000 + (n - 17) * 1_000_000, rarity: 'Ultra Çerçeve', stock: 26 };
  return { price: 20_000_000 + (n - 25) * 1_250_000, rarity: 'Ultra Mega Çerçeve', stock: 18 };
}
function titleFromFrameFile(filename = '', frameNo = 1) {
  const base = String(filename || '').replace(/\.[a-z0-9]+$/i, '').replace(/^(market|frame)[-_\s]*/i, '').trim();
  if (!base || /^\d+$/.test(base)) return `Market Çerçevesi ${String(frameNo).padStart(3, '0')}`;
  const title = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (m) => m.toLocaleUpperCase('tr-TR'));
  return `${title} Çerçeve`;
}
function marketFrameAssetFiles() {
  try {
    if (!fs.existsSync(MARKET_FRAME_DIR)) return [];
    return fs.readdirSync(MARKET_FRAME_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(png|webp|jpg|jpeg|svg)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => {
        const an = Number((a.match(/(\d+)/) || [])[1] || 0);
        const bn = Number((b.match(/(\d+)/) || [])[1] || 0);
        if (an && bn && an !== bn) return an - bn;
        return a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
      });
  } catch (_) { return []; }
}
function resolveMarketFrameAssetPath(value = '', fallback = '') {
  const raw = cleanText(value || fallback || '', 700).replace(/\\/g, '/');
  const files = marketFrameAssetFiles();
  const fileSet = new Set(files);
  const direct = raw.match(/(?:^|\/)public\/assets\/market\/frames\/([^/]+)$/i);
  if (direct && fileSet.has(direct[1])) return `/public/assets/market/frames/${direct[1]}`;
  const match = raw.match(/market(?:[-_]?frame)?[-_]?0*(\d{1,3})(?:\D|$)/i) || raw.match(/frame[-_]?0*(\d{1,3})(?:\D|$)/i) || raw.match(/(?:^|[-_])0*(\d{1,3})(?:\.(?:png|webp|jpg|jpeg|svg))?$/i);
  const frameNo = match ? Math.trunc(Number(match[1]) || 0) : 0;
  if (frameNo > 0) {
    const candidate = files.find((name) => {
      const n = Number((String(name).match(/(\d+)/) || [])[1] || 0);
      return n === frameNo;
    });
    if (candidate) return `/public/assets/market/frames/${candidate}`;
  }
  return '';
}
function staticMarketFrameItems() {
  return marketFrameAssetFiles().map((filename, index) => {
    const frameNo = index + 1;
    const tier = frameTier(frameNo);
    const asset = `/public/assets/market/frames/${filename}`;
    const title = titleFromFrameFile(filename, frameNo);
    return normalizeItem(`market-frame-${String(frameNo).padStart(3, '0')}`, {
      title,
      name: title,
      category: 'frames',
      categoryLabel: CATEGORY_META.frames.label,
      type: CATEGORY_META.frames.type,
      price: tier.price,
      active: true,
      visible: true,
      stock: tier.stock || DEFAULT_MARKET_FRAME_STOCK,
      asset: '',
      preview: '',
      frameUrl: asset,
      frameIndex: frameNo,
      quality: tier.rarity,
      rarity: tier.rarity,
      premium: true,
      staticSeed: true,
      description: `${tier.rarity}. Satın alındıktan sonra profil, AnaSayfa ve oyunlarda kullanılabilir.`
    });
  });
}
function generatedMarketItems() {
  const categories = DEFAULT_CATEGORIES.filter((category) => category !== 'frames');
  const items = [];
  for (const category of categories) {
    const meta = CATEGORY_META[category] || CATEGORY_META.badges;
    const id = `market-${category}-coming-soon`;
    items.push(normalizeItem(id, {
      title: `${meta.label} Yakında`,
      name: `${meta.label} Yakında`,
      category,
      categoryLabel: meta.label,
      type: meta.type,
      quality: 'Yakında',
      rarity: 'Yakında',
      price: 0,
      stock: 0,
      active: false,
      visible: true,
      purchasable: false,
      comingSoon: true,
      asset: '',
      preview: '',
      image: '',
      effectClass: '',
      themeKey: '',
      premium: false,
      staticSeed: true,
      description: `${meta.label} kategorisi yakında aktif olacak. Şu anda yalnızca çerçeveler satın alınabilir.`
    }));
  }
  return items;
}
function defaultItems() {
  return [...staticMarketFrameItems(), ...generatedMarketItems()];
}

function marketFramePathErrorPayload() {
  return {
    ok: false,
    error: 'MARKET_FRAME_PATH_NOT_FOUND',
    message: 'Çerçeve yolu bulunamadı. Örnek: /public/assets/market/frames/market-1.png'
  };
}

function normalizeItem(id, data = {}) {
  const normalizedId = cleanId(id || data.id || data.key);
  const category = cleanId(data.category || data.type || 'frames') || 'frames';
  if (!DEFAULT_CATEGORIES.includes(category)) return null;
  const meta = CATEGORY_META[category] || { label: category, type: category };
  const stockRaw = data.stock;
  const stock = stockRaw === null || stockRaw === undefined || stockRaw === '' ? null : Math.max(0, Math.trunc(Number(stockRaw) || 0));
  const price = Number(data.price);
  const active = data.active === true || data.active === 'true' || data.active === undefined;
  const visible = data.visible !== false && data.visibility !== false && data.hidden !== true;
  let asset = cleanAsset(data.asset || data.src || data.image || data.preview || data.frameUrl || '');
  let preview = cleanAsset(data.preview || data.image || data.asset || data.src || data.frameUrl || '');
  let frameUrl = cleanAsset(data.frameUrl || (category === 'frames' ? asset : ''), 700);
  if (category === 'frames') {
    frameUrl = resolveMarketFrameAssetPath(data.frameUrl || data.asset || data.preview || data.image || data.src || normalizedId || data.frameIndex, data.frameIndex || normalizedId);
    if (!frameUrl) return null;
    asset = frameUrl;
    preview = frameUrl;
  }
  return {
    id: normalizedId,
    key: normalizedId,
    title: cleanText(data.title || data.name || normalizedId, 120),
    name: cleanText(data.name || data.title || normalizedId, 120),
    description: cleanText(data.description || data.desc || '', 320),
    category,
    categoryLabel: cleanText(data.categoryLabel || data.categoryTitle || meta.label || category, 80),
    type: cleanId(data.type || meta.type || category),
    price: Number.isFinite(price) ? money(price) : 0,
    active,
    visible,
    purchasable: data.purchasable !== false && category === 'frames' && active && visible,
    comingSoon: data.comingSoon === true || (category !== 'frames'),
    stock,
    stockUnlimited: stock === null,
    asset,
    preview,
    image: category === 'frames' ? frameUrl : (preview || asset),
    frameUrl,
    frameIndex: data.frameIndex == null ? null : Math.max(0, Math.trunc(Number(data.frameIndex) || 0)),
    quality: cleanText(data.quality || data.rarity || '', 60),
    rarity: cleanText(data.rarity || data.quality || '', 60),
    effectClass: cleanId(data.effectClass || ''),
    themeKey: cleanId(data.themeKey || ''),
    premium: !!data.premium,
    staticSeed: !!data.staticSeed,
    updatedAt: data.updatedAt || null
  };
}
function mergeItems(baseItems, overrideItems) {
  const map = new Map();
  for (const item of baseItems) if (item && item.id) map.set(item.id, item);
  for (const item of overrideItems) {
    if (!item || !item.id) continue;
    const base = map.get(item.id) || {};
    map.set(item.id, { ...base, ...item, staticSeed: !!base.staticSeed && item.staticSeed !== false });
  }
  return [...map.values()].sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a.category);
    const bi = DEFAULT_CATEGORIES.indexOf(b.category);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return String(a.id).localeCompare(String(b.id), 'tr', { numeric: true });
  });
}
async function listMarketItems({ includeHidden = false } = {}) {
  const cacheKey = `${MARKET_CATALOG_CACHE_KEY}:${includeHidden ? 'all' : 'visible'}`;
  const cached = runtimeStore.temporary.get(cacheKey);
  if (Array.isArray(cached) && cached.length) return cached;
  const staticItems = defaultItems();
  const { db } = initFirebaseAdmin();
  let overrideItems = [...memoryCatalog.entries()].map(([id, data]) => normalizeItem(id, data)).filter(Boolean);
  if (db) {
    try {
      const snap = await withTimeout(db.collection('marketItems').limit(800).get(), MARKET_FIRESTORE_TIMEOUT_MS, 'MARKET_CATALOG_TIMEOUT');
      overrideItems = snap.docs.map((doc) => normalizeItem(doc.id, doc.data())).filter(Boolean);
    } catch (error) {
      // Market kullanıcısını bekletmemek için Firestore gecikmesi durumunda güvenli statik katalog döndürülür.
    }
  }
  const items = mergeItems(staticItems, overrideItems);
  const output = includeHidden ? items : items.filter((item) => item.visible !== false);
  runtimeStore.temporary.set(cacheKey, output, MARKET_CATALOG_CACHE_MS);
  return output;
}
async function upsertMarketItem(item = {}) {
  const category = cleanId(item.category || item.type || 'frames') || 'frames';
  if (category === 'frames') {
    const frameSource = item.frameUrl || item.asset || item.preview || item.image || item.src || item.frameIndex || item.id || item.key || '';
    if (!resolveMarketFrameAssetPath(frameSource, item.frameIndex || item.id || item.key || '')) return marketFramePathErrorPayload();
  }
  const normalized = normalizeItem(item.id, { active: item.active !== false, visible: item.visible !== false, ...item });
  if (!normalized || !normalized.id) {
    if (category === 'frames') return marketFramePathErrorPayload();
    return { ok: false, error: 'ITEM_ID_REQUIRED_OR_CATEGORY_DISABLED', message: 'Market ürünü kaydedilemedi. Lütfen ürün bilgilerini kontrol et.' };
  }
  const payload = { ...normalized, updatedAt: now() };
  runtimeStore.temporary.delete(`${MARKET_CATALOG_CACHE_KEY}:all`);
  runtimeStore.temporary.delete(`${MARKET_CATALOG_CACHE_KEY}:visible`);
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('marketItems').doc(normalized.id).set(payload, { merge: true });
  else memoryCatalog.set(normalized.id, payload);
  return { ok: true, item: payload };
}
async function getItemByNameOrId(value = '') {
  const id = cleanId(value);
  if (!id) return null;
  const items = await listMarketItems({ includeHidden: true });
  return items.find((item) => item.id === id || cleanId(item.name) === id || cleanId(item.title) === id) || null;
}
async function getItem(itemId) {
  return getItemByNameOrId(itemId);
}
async function readOwnershipSet(uid) {
  const safeUid = String(uid || '').trim();
  if (!safeUid) return new Set();
  const cacheKey = `market:ownership:set:${safeUid}`;
  const cached = runtimeStore.temporary.get(cacheKey);
  if (Array.isArray(cached)) return new Set(cached);
  const { db } = initFirebaseAdmin();
  if (!db) {
    const ids = [];
    for (const [key, row] of memoryOwnership.entries()) {
      if (key.startsWith(`${safeUid}:`) && row?.active !== false) ids.push(cleanId(row.itemId || key.slice(safeUid.length + 1)));
    }
    runtimeStore.temporary.set(cacheKey, ids, MARKET_OWNERSHIP_CACHE_MS);
    return new Set(ids);
  }
  try {
    const snap = await withTimeout(db.collection('marketOwnership').where('uid', '==', safeUid).limit(800).get(), 1400, 'MARKET_OWNERSHIP_TIMEOUT');
    const ids = [];
    snap.forEach((doc) => { const data = doc.data() || {}; if (data.active !== false) ids.push(cleanId(data.itemId || String(doc.id).split(':').pop())); });
    runtimeStore.temporary.set(cacheKey, ids, MARKET_OWNERSHIP_CACHE_MS);
    return new Set(ids);
  } catch (_) {
    return new Set();
  }
}
function invalidateOwnershipCache(uid) {
  if (uid) runtimeStore.temporary.delete(`market:ownership:set:${String(uid).trim()}`);
}
async function hasOwnership(uid, itemId) {
  const id = cleanId(itemId);
  if (!uid || !id) return false;
  const owned = await readOwnershipSet(uid);
  if (owned.has(id)) return true;
  const { db } = initFirebaseAdmin();
  if (!db) return memoryOwnership.has(ownKey(uid, id));
  try {
    const snap = await withTimeout(db.collection('marketOwnership').doc(ownKey(uid, id)).get(), 1000, 'MARKET_OWNERSHIP_DOC_TIMEOUT');
    return snap.exists && snap.data().active !== false;
  } catch (_) { return false; }
}
async function readEquippedMarketState(uid) {
  if (!uid) return {};
  const memoryKey = `market:equipped:${uid}`;
  const memoryValue = runtimeStore.temporary.get(memoryKey);
  if (memoryValue && typeof memoryValue === 'object') return { ...(memoryValue.items || memoryValue) };
  if (typeof memoryValue === 'string') return { frames: cleanId(memoryValue) };
  const { db } = initFirebaseAdmin();
  if (!db) return {};
  const snap = await db.collection('marketEquipped').doc(String(uid)).get().catch(() => null);
  if (!snap?.exists) return {};
  const data = snap.data() || {};
  if (data.items && typeof data.items === 'object') return { ...data.items };
  return data.itemId ? { [data.category || 'frames']: cleanId(data.itemId) } : {};
}
async function readEquippedMarketItemId(uid) {
  const state = await readEquippedMarketState(uid);
  return state.frames || Object.values(state)[0] || '';
}

function slotForCategory(category = '') {
  const map = {
    frames: 'frame',
    avatars: 'avatar',
    'profile-backgrounds': 'profileBackground',
    badges: 'badge',
    'animated-name-effects': 'nameEffect',
    'stats-card-themes': 'statsCardTheme',
    'game-table-themes': 'gameTableTheme'
  };
  return map[String(category || '')] || String(category || 'custom');
}
function cosmeticSlotPatch(item, source = 'market', clear = false) {
  if (!item) return {};
  const slot = slotForCategory(item.category);
  return { cosmeticSlots: { [slot]: clear ? { source: '', itemId: '', updatedAt: now() } : { source, itemId: item.id, category: item.category, updatedAt: now() } } };
}

function equippedPatchForItem(item, clear = false) {
  const blank = clear ? '' : null;
  if (!item) return {};
  const asset = clear ? '' : (item.asset || item.preview || item.frameUrl || '');
  switch (item.category) {
    case 'frames':
      return { marketFrameId: clear ? '' : item.id, marketFrameUrl: clear ? '' : (item.frameUrl || asset), frameUrl: clear ? '' : (item.frameUrl || asset), selectedFrame: clear ? 0 : 0, ...cosmeticSlotPatch(item, 'market', clear) };
    case 'avatars':
      return { marketAvatarId: clear ? '' : item.id, avatar: clear ? '' : asset, selectedAvatar: clear ? '' : '', ...cosmeticSlotPatch(item, 'market', clear) };
    case 'profile-backgrounds':
      return { profileBackgroundId: clear ? '' : item.id, profileBackgroundUrl: asset, ...cosmeticSlotPatch(item, 'market', clear) };
    case 'badges':
      return { profileBadgeId: clear ? '' : item.id, profileBadgeUrl: asset, ...cosmeticSlotPatch(item, 'market', clear) };
    case 'animated-name-effects':
      return { nameEffectId: clear ? '' : item.id, nameEffectClass: clear ? '' : (item.effectClass || item.id), ...cosmeticSlotPatch(item, 'market', clear) };
    case 'stats-card-themes':
      return { statsCardThemeId: clear ? '' : item.id, statsCardThemeUrl: asset, ...cosmeticSlotPatch(item, 'market', clear) };
    case 'game-table-themes':
      return { gameTableThemeId: clear ? '' : item.id, gameTableThemeUrl: asset, ...cosmeticSlotPatch(item, 'market', clear) };
    default:
      return blank === '' ? { [`market_${item.category}`]: '' } : { [`market_${item.category}`]: item.id };
  }
}
async function persistEquippedMarketItem(uid, item) {
  if (!uid || !item?.id) return { ok: false, error: 'UID_ITEM_REQUIRED' };
  const category = item.category || 'frames';
  const state = await readEquippedMarketState(uid);
  const nextState = { ...state, [category]: item.id };
  const memoryKey = `market:equipped:${uid}`;
  runtimeStore.temporary.set(memoryKey, { items: nextState, updatedAt: now() }, 90 * 86400000);
  const patch = equippedPatchForItem(item, false);
  const { db } = initFirebaseAdmin();
  if (db) {
    await Promise.all([
      db.collection('marketEquipped').doc(String(uid)).set({ uid, items: nextState, updatedAt: now() }, { merge: true }),
      db.collection('users').doc(String(uid)).set({ marketEquipped: nextState, ...patch, updatedAt: now() }, { merge: true })
    ]);
  }
  return { ok: true, equippedItemId: item.id, equippedItems: nextState, patch };
}
async function decorateMarketItemsForUser(items = [], uid = '') {
  const [equippedItems, ownedSet] = await Promise.all([readEquippedMarketState(uid), uid ? readOwnershipSet(uid) : Promise.resolve(new Set())]);
  return (Array.isArray(items) ? items : []).map((item) => {
    const owned = uid ? ownedSet.has(item.id) : false;
    const equipped = !!equippedItems[item.category] && equippedItems[item.category] === item.id;
    return { ...item, owned, equipped, usable: owned, equippedItems };
  });
}
async function equipItem({ uid, itemId }) {
  const marketState = await ensureMarketEnabled();
  if (!marketState.ok) return marketState;
  const item = await getItem(itemId);
  if (!uid) return { ok: false, error: 'AUTH_REQUIRED' };
  if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };
  if (item.category !== 'frames') return { ok: false, error: 'ITEM_COMING_SOON', message: 'Bu kategori yakında açılacak.' };
  if (!(await hasOwnership(uid, item.id))) return { ok: false, error: 'OWNERSHIP_REQUIRED' };
  const equipped = await persistEquippedMarketItem(uid, item);
  const items = await decorateMarketItemsForUser(await listMarketItems(), uid);
  return { ok: true, item: { ...item, owned: true, equipped: true, usable: true }, equippedItemId: item.id, equippedItems: equipped.equippedItems, profilePatch: equipped.patch, items };
}
function pushMemoryList(key, row, ttl = 30 * 86400000, limit = 80) {
  const current = runtimeStore.temporary.get(key) || [];
  const next = [row, ...current].slice(0, limit);
  runtimeStore.temporary.set(key, next, ttl);
  return next;
}
async function purchaseItem({ uid, itemId, idempotencyKey = '' }) {
  const marketState = await ensureMarketEnabled();
  if (!marketState.ok) return marketState;
  const item = await getItem(itemId);
  if (!uid) return { ok: false, error: 'AUTH_REQUIRED' };
  if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };
  if (item.category !== 'frames' || item.purchasable === false || item.comingSoon) return { ok: false, error: 'ITEM_COMING_SOON', message: 'Bu kategori yakında açılacak. Şu anda yalnızca çerçeveler satın alınabilir.' };
  const stockAvailable = item.stock === null || Number(item.stock) > 0;
  if (!item.active || item.visible === false || !Number.isFinite(item.price) || item.price <= 0 || !stockAvailable) return { ok: false, error: 'ITEM_UNAVAILABLE' };
  const key = idempotencyKey || `market:${uid}:${item.id}:purchase`;
  const { db, admin } = initFirebaseAdmin();
  const ownershipId = ownKey(uid, item.id);
  const ownership = { uid, itemId: item.id, itemName: item.name || item.title, category: item.category, active: true, purchasedAt: now(), price: item.price, asset: item.asset, preview: item.preview, frameUrl: item.frameUrl || '', frameIndex: item.frameIndex || null };
  let balance = null;
  if (!db || !admin) {
    if (memoryOwnership.get(ownershipId)?.active !== false && memoryOwnership.has(ownershipId)) {
      const items = await decorateMarketItemsForUser(await listMarketItems(), uid);
      const ownedItem = items.find((entry) => entry.id === item.id) || { ...item, owned: true };
      return { ok: true, owned: true, item: ownedItem, items };
    }
    const charge = await debitBalance({ uid, amount: item.price, reason: `market:${item.id}`, idempotencyKey: key, metadata: { itemId: item.id, category: item.category } });
    if (!charge.ok) return charge;
    balance = charge.balance;
    memoryOwnership.set(ownershipId, ownership);
  } else {
    const userRef = db.collection('users').doc(String(uid));
    const itemRef = db.collection('marketItems').doc(item.id);
    const ownershipRef = db.collection('marketOwnership').doc(ownershipId);
    const idemRef = db.collection('idempotency').doc(key);
    let output = null;
    await db.runTransaction(async (tx) => {
      const [idemSnap, ownedSnap, itemSnap, userSnap] = await Promise.all([tx.get(idemRef), tx.get(ownershipRef), tx.get(itemRef), tx.get(userRef)]);
      if (idemSnap.exists) { output = { ok: true, duplicate: true, ...(idemSnap.data()?.result || {}) }; return; }
      if (ownedSnap.exists && ownedSnap.data()?.active !== false) {
        output = { ok: true, owned: true, item: { ...item, owned: true }, purchase: { itemId: item.id, price: 0 } };
        tx.set(idemRef, { key, type: 'market-purchase', uid, itemId: item.id, createdAt: now(), result: output }, { merge: false });
        return;
      }
      const liveItem = itemSnap.exists ? normalizeItem(itemSnap.id, { ...item, ...(itemSnap.data() || {}) }) || item : item;
      const liveStock = liveItem.stock === null ? null : Math.max(0, Math.trunc(Number(liveItem.stock ?? item.stock ?? 0) || 0));
      if (!liveItem.active || liveItem.visible === false || liveItem.category !== 'frames' || liveItem.purchasable === false || liveItem.comingSoon || !Number.isFinite(liveItem.price) || liveItem.price <= 0 || (liveStock !== null && liveStock <= 0)) {
        output = { ok: false, error: 'ITEM_UNAVAILABLE' };
        return;
      }
      const data = userSnap.exists ? (userSnap.data() || {}) : {};
      const currentBalance = Math.max(0, Number(data.balance ?? DEFAULT_BALANCE) || 0);
      if (currentBalance < liveItem.price) {
        output = { ok: false, error: 'INSUFFICIENT_BALANCE', balance: currentBalance };
        return;
      }
      balance = currentBalance - liveItem.price;
      const purchase = { ...ownership, itemName: liveItem.name || liveItem.title, price: liveItem.price, asset: liveItem.asset, preview: liveItem.preview, frameUrl: liveItem.frameUrl || '', frameIndex: liveItem.frameIndex || null, purchasedAt: now() };
      tx.set(userRef, { balance, updatedAt: now() }, { merge: true });
      tx.set(ownershipRef, purchase, { merge: true });
      if (liveStock !== null) tx.set(itemRef, { ...liveItem, stock: liveStock - 1, updatedAt: now() }, { merge: true });
      const ledgerId = `ledger_${crypto.randomUUID()}`;
      tx.set(db.collection('ledger').doc(ledgerId), { uid, operationType: `market:${liveItem.id}`, type: 'market-purchase', amount: -liveItem.price, balanceAfter: balance, idempotencyKey: key, createdAt: now(), at: now() }, { merge: false });
      output = { ok: true, item: { ...liveItem, owned: true }, balance, purchase: { itemId: liveItem.id, price: liveItem.price }, ledgerId };
      tx.set(idemRef, { key, type: 'market-purchase', uid, itemId: liveItem.id, createdAt: now(), result: output }, { merge: false });
    });
    if (!output?.ok) return output || { ok: false, error: 'MARKET_PURCHASE_FAILED' };
    if (output.owned || output.duplicate) {
      invalidateOwnershipCache(uid);
      const items = await decorateMarketItemsForUser(await listMarketItems(), uid);
      const ownedItem = items.find((entry) => entry.id === item.id) || { ...item, owned: true };
      return { ...output, item: ownedItem, items, balance: output.balance ?? balance };
    }
    balance = output.balance;
    runtimeStore.temporary.delete(`${MARKET_CATALOG_CACHE_KEY}:all`);
    runtimeStore.temporary.delete(`${MARKET_CATALOG_CACHE_KEY}:visible`);
  }
  invalidateOwnershipCache(uid);
  pushMemoryList(`notify:personal:${uid}`, { id: `market_${Date.now()}_${Math.random().toString(36).slice(2)}`, type: 'market', title: 'Market Satın Alma', message: `${item.title} satın alındı.`, icon: 'fa-store', itemId: item.id, amount: item.price, at: now() });
  pushMemoryList(`account:tx:${uid}`, { id: `market_tx_${Date.now()}`, title: 'Market Satın Alma', message: `${item.title} için ${item.price.toLocaleString('tr-TR')} MC harcandı.`, icon: 'fa-store', amount: -item.price, at: now() });
  const decorated = await decorateMarketItemsForUser(await listMarketItems(), uid);
  const purchasedItem = decorated.find((entry) => entry.id === item.id) || { ...item, owned: true };
  return { ok: true, item: purchasedItem, items: decorated, balance, purchase: { itemId: item.id, price: item.price } };
}
async function resolveUserIdentifier(identifier = '') {
  const raw = cleanText(identifier, 254);
  if (!raw) return { ok: false, error: 'USER_IDENTIFIER_REQUIRED' };
  const { db } = initFirebaseAdmin();
  if (!db) return { ok: true, uid: raw, match: raw, firestore: false };
  const rows = new Map();
  const addDoc = (doc) => { if (doc?.exists) rows.set(doc.id, { uid: doc.id, data: doc.data() || {} }); };
  addDoc(await db.collection('users').doc(raw).get().catch(() => null));
  const lower = raw.toLowerCase();
  const queries = [
    db.collection('users').where('email', '==', raw).limit(3),
    db.collection('users').where('username', '==', raw).limit(3),
    db.collection('users').where('usernameLower', '==', lower).limit(3)
  ];
  for (const query of queries) {
    const snap = await query.get().catch(() => null);
    snap?.forEach?.(addDoc);
  }
  const matches = [...rows.values()];
  if (matches.length < 1) return { ok: false, error: 'USER_NOT_FOUND' };
  if (matches.length > 1) return { ok: false, error: 'MULTIPLE_USERS_MATCH', matches: matches.map((x) => ({ uid: x.uid, email: x.data.email || '', username: x.data.username || '' })) };
  const match = matches[0];
  return { ok: true, uid: match.uid, match: match.data.username || match.data.email || match.uid, user: match.data, firestore: true };
}
async function refundItem({ adminUid = '', uid = '', identifier = '', itemId = '', productName = '', idempotencyKey = '' }) {
  const resolved = uid ? { ok: true, uid } : await resolveUserIdentifier(identifier || uid);
  if (!resolved.ok) return resolved;
  const item = await getItem(itemId || productName);
  if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };
  const targetUid = resolved.uid;
  const ownershipId = ownKey(targetUid, item.id);
  if (!(await hasOwnership(targetUid, item.id))) return { ok: false, error: 'OWNERSHIP_NOT_FOUND' };
  const refund = await creditBalance({ uid: targetUid, amount: item.price, reason: `market-refund:${item.id}`, idempotencyKey: idempotencyKey || `refund:${ownershipId}:${crypto.randomUUID()}`, metadata: { adminUid, itemId: item.id } });
  if (!refund.ok) return refund;
  const state = await readEquippedMarketState(targetUid);
  const shouldClearEquipped = state[item.category] === item.id;
  if (shouldClearEquipped) delete state[item.category];
  const clearPatch = shouldClearEquipped ? equippedPatchForItem(item, true) : {};
  const { db } = initFirebaseAdmin();
  if (!db) {
    memoryOwnership.delete(ownershipId);
    invalidateOwnershipCache(targetUid);
    if (shouldClearEquipped) runtimeStore.temporary.set(`market:equipped:${targetUid}`, { items: state, updatedAt: now() }, 90 * 86400000);
  } else {
    const writes = [db.collection('marketOwnership').doc(ownershipId).set({ active: false, refundedAt: now(), refundedBy: adminUid }, { merge: true })];
    if (shouldClearEquipped) {
      writes.push(db.collection('marketEquipped').doc(String(targetUid)).set({ uid: targetUid, items: state, updatedAt: now() }, { merge: true }));
      writes.push(db.collection('users').doc(String(targetUid)).set({ marketEquipped: state, ...clearPatch, updatedAt: now() }, { merge: true }));
    }
    await Promise.all(writes);
    invalidateOwnershipCache(targetUid);
  }
  pushMemoryList(`account:tx:${targetUid}`, { id: `market_refund_${Date.now()}`, title: 'Market İadesi', message: `${item.title} iadesi yapıldı.`, icon: 'fa-rotate-left', amount: item.price, at: now() });
  return { ok: true, uid: targetUid, match: resolved.match || targetUid, item, balance: refund.balance, clearedEquipped: shouldClearEquipped };
}

module.exports = {
  DEFAULT_CATEGORIES,
  PASSIVE_INFRA_CATEGORIES,
  CATEGORY_META,
  QUALITY_TIERS,
  listMarketItems,
  decorateMarketItemsForUser,
  upsertMarketItem,
  purchaseItem,
  equipItem,
  refundItem,
  hasOwnership,
  getMarketStatus,
  setMarketStatus,
  ensureMarketEnabled,
  readEquippedMarketState,
  readEquippedMarketItemId,
  getItem
};
