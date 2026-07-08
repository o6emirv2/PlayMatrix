export const HOME_GAME_ROUTES = Object.freeze({
  crash: "/games/crash",
  chess: "/games/chess",
  satranc: "/games/chess",
  pisti: "/games/pisti",
  pattern: "/games/pattern-master",
  patternmaster: "/games/pattern-master",
  space: "/games/space-pro",
  spacepro: "/games/space-pro",
  snake: "/games/snake-pro",
  snakepro: "/games/snake-pro",
});

export const HOME_GAMES = Object.freeze([
  { key: "crash", name: "Crash", category: "online", access: "auth", url: HOME_GAME_ROUTES.crash, color: "255,127,76", icon: "fa-rocket", image: "/public/assets/home/games/crash.jpg", provider: "PlayMatrix Originals", badge: "Canlı", desc: "Hızlı tempo, profesyonel arayüz ve güvenli oyun akışına sahip Crash deneyimi.", tags: ["Canlı Oyun", "Multiplier", "Hızlı Tur"], keywords: "crash multiplier online rocket roket çarpan" },
  { key: "satranc", name: "Satranç", category: "online", access: "auth", url: HOME_GAME_ROUTES.satranc, color: "103,179,255", icon: "fa-chess-king", image: "/public/assets/home/games/chess.jpg", provider: "PlayMatrix Strategy", badge: "PvP", desc: "Modern satranç akışı, güçlü görünüm ve hızlı giriş kontrolüyle profesyonel masa deneyimi.", tags: ["Strateji", "PvP", "Arena"], keywords: "chess online pvp satranç" },
  { key: "pisti", name: "Pişti", category: "online", access: "auth", url: HOME_GAME_ROUTES.pisti, color: "113,134,255", icon: "fa-clone", image: "/public/assets/home/games/pisti.jpg", provider: "PlayMatrix Cards", badge: "Kart", desc: "Akıcı kart masası görünümü ve kontrollü oyun akışıyla klasik Pişti deneyimi.", tags: ["Kart", "Online", "Klasik"], keywords: "card kart multiplayer online pisti pişti" },
  { key: "patternmaster", name: "Pattern Master", category: "classic", access: "auth", url: HOME_GAME_ROUTES.patternmaster, color: "122,240,184", icon: "fa-shapes", image: "/public/assets/home/games/pattern-master.jpg", provider: "PlayMatrix Mind", badge: "Zeka", desc: "Dikkat ve görsel hafızayı öne çıkaran premium görünümlü pattern oyunu.", tags: ["Zeka", "Refleks", "Desen"], keywords: "arcade pattern master ücretsiz zeka" },
  { key: "spacepro", name: "Space Pro", category: "classic", access: "auth", url: HOME_GAME_ROUTES.spacepro, color: "82,175,255", icon: "fa-user-astronaut", image: "/public/assets/home/games/space-pro.jpg", provider: "PlayMatrix Arcade", badge: "Uzay", desc: "Yüksek enerjili uzay temasıyla klasik arcade aksiyonunu modern kart sunumunda oyna.", tags: ["Arcade", "Uzay", "Klasik"], keywords: "arcade pro space uzay" },
  { key: "snakepro", name: "Snake Pro", category: "classic", access: "auth", url: HOME_GAME_ROUTES.snakepro, color: "112,227,151", icon: "fa-staff-snake", image: "/public/assets/home/games/snake-pro.jpg", provider: "PlayMatrix Arcade", badge: "Retro", desc: "Yılan temasını profesyonel neon kimlikle sunan modern Snake Pro deneyimi.", tags: ["Retro", "Arcade", "Akıcı"], keywords: "arcade pro retro snake yılan" }
]);

export function normalizeGameRoute(rawUrl = "") {
  const normalized = String(rawUrl || "").trim().replace(/\.html(?:$|[?#])/i, "");
  const lower = decodeURIComponent(normalized).toLowerCase();
  if (lower.includes("crash")) return HOME_GAME_ROUTES.crash;
  if (lower.includes("satranc") || lower.includes("chess")) return HOME_GAME_ROUTES.satranc;
  if (lower.includes("pisti") || lower.includes("pişti")) return HOME_GAME_ROUTES.pisti;
  if (lower.includes("patternmaster")) return HOME_GAME_ROUTES.patternmaster;
  if (lower.includes("spacepro")) return HOME_GAME_ROUTES.spacepro;
  if (lower.includes("snakepro")) return HOME_GAME_ROUTES.snakepro;
  return normalized || "/";
}

export function installGameRouteNormalizer(root = document) {
  root.querySelectorAll?.('a[href*="Oyunlar/"]').forEach((anchor) => {
    const nextRoute = normalizeGameRoute(anchor.getAttribute("href"));
    if (nextRoute && nextRoute !== anchor.getAttribute("href")) anchor.setAttribute("href", nextRoute);
  });
  loadHomeMaintenanceState({ force: true }).catch(() => null);
  installOnlineGameAuthGuard(root);
}

export function getGameAccentClass(game = {}) {
  const key = String(game.key || game.name || "").toLowerCase();
  if (key.includes("crash")) return "game-card--crash";
  if (key.includes("satran") || key.includes("chess")) return "game-card--chess";
  if (key.includes("pişti") || key.includes("pisti")) return "game-card--pisti";
  if (key.includes("pattern")) return "game-card--pattern";
  if (key.includes("space")) return "game-card--space";
  if (key.includes("snake")) return "game-card--snake";
  return "game-card--default";
}


function getCurrentHomeUser() {
  try {
    return window.__PM_RUNTIME?.auth?.currentUser
      || window.__PM_RUNTIME?.sessionUser
      || window.__PM_RUNTIME?.user
      || window.__PM_ONLINE_CORE__?.sessionUser
      || window.__PM_ONLINE_CORE__?.auth?.currentUser
      || null;
  } catch (_) { return null; }
}

function openHomeAuthSheet(gameName = 'Online oyun') {
  try { if (typeof window.setAuthMode === 'function') window.setAuthMode('login'); } catch (_) {}
  try {
    const sheetOpener = typeof window.openPlayMatrixSheet === 'function' ? window.openPlayMatrixSheet : window.openSheet;
    if (typeof sheetOpener === 'function') {
      sheetOpener('auth', 'Hesabına giriş yap', `${gameName} için önce hesabına giriş yapmalısın.`);
      return;
    }
  } catch (_) {}
  const loginButton = document.getElementById('loginBtn');
  if (loginButton && typeof loginButton.click === 'function') loginButton.click();
}



function normalizeMaintenanceFlag(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === '0' || raw === 'false' || raw === 'off' || raw === 'no' || raw === 'hayir' || raw === 'hayır' || raw === 'pasif' || raw === 'inactive') return false;
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes' || raw === 'evet' || raw === 'aktif' || raw === 'active';
}

function normalizeMaintenanceState(value = {}) {
  const src = value && typeof value === 'object' && value.games && typeof value.games === 'object' ? value.games : value;
  const keys = ['general','system','crash','chess','pisti','classic','pattern-master','space-pro','snake-pro','market','wheel','promo'];
  const out = {};
  keys.forEach((key) => { out[key] = normalizeMaintenanceFlag(src?.[key]); });
  return out;
}

let homeMaintenanceState = null;
let homeMaintenanceLoadedAt = 0;

function gameKeyFromRoute(route = '') {
  const lower = String(route || '').toLowerCase();
  if (lower.includes('/games/crash')) return 'crash';
  if (lower.includes('/games/chess')) return 'chess';
  if (lower.includes('/games/pisti')) return 'pisti';
  if (lower.includes('/games/pattern-master')) return 'pattern-master';
  if (lower.includes('/games/space-pro')) return 'space-pro';
  if (lower.includes('/games/snake-pro')) return 'snake-pro';
  return '';
}

export async function loadHomeMaintenanceState(options = {}) {
  const force = options === true || options?.force === true;
  if (!force && homeMaintenanceState && Date.now() - homeMaintenanceLoadedAt < 60000) return homeMaintenanceState;
  try {
    const res = await fetch('/api/platform/control-public', { credentials: 'same-origin', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    homeMaintenanceState = normalizeMaintenanceState(data?.maintenance || data?.games || {});
  } catch (_) {
    homeMaintenanceState = {};
  }
  homeMaintenanceLoadedAt = Date.now();
  return homeMaintenanceState;
}

export function isGameInMaintenance(route = '') {
  const key = gameKeyFromRoute(route);
  const maintenance = normalizeMaintenanceState(homeMaintenanceState || {});
  if (!key) return false;
  if (maintenance.general || maintenance.system) return true;
  if (maintenance[key] === true) return true;
  return maintenance.classic === true && ['pattern-master','space-pro','snake-pro'].includes(key);
}

function showMaintenanceNotice(gameName = 'Oyun') {
  const message = 'Bu oyun şu an bakımda. Daha sonra tekrar deneyin.';
  try {
    if (typeof window.showPlayMatrixInfo === 'function') {
      window.showPlayMatrixInfo('Bakım Modu', message, 'warning');
      return;
    }
  } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent('playmatrix:tools-message', { detail: { title: 'Bakım Modu', message, type: 'warning' } }));
  } catch (_) {}

}

function installOnlineGameAuthGuard(root = document) {
  if (document.body?.dataset.onlineGameAuthGuardBound === '1') return;
  if (document.body) document.body.dataset.onlineGameAuthGuardBound = '1';
  root.addEventListener('click', async (event) => {
    const trigger = event.target?.closest?.('[data-access="auth"], [data-requires-auth="true"]');
    if (!trigger) return;
    const href = trigger.getAttribute?.('href') || trigger.dataset.href || '';
    if (!href && trigger.dataset.requiresAuth !== 'true') return;
    const normalized = normalizeGameRoute(href);
    const isProtectedGame = /\/games\/(crash|chess|pisti|pattern-master|space-pro|snake-pro)$/i.test(normalized);
    if (!isProtectedGame && trigger.dataset.requiresAuth !== 'true' && trigger.dataset.access !== 'auth') return;
    const gameName = trigger.dataset.gameName || trigger.closest?.('.game-card')?.querySelector?.('.game-card-title, .game-title')?.textContent || 'Oyun';

    // Bakım kararını tıklama anında serverdan yenile. Ağ hatası bakım olarak yorumlanmaz.
    event.preventDefault();
    event.stopPropagation();
    if (trigger.dataset.pmNavigationPending === '1') return;
    trigger.dataset.pmNavigationPending = '1';
    trigger.setAttribute('aria-busy', 'true');
    try {
      if (isProtectedGame) await loadHomeMaintenanceState({ force: true });
      if (isProtectedGame && isGameInMaintenance(normalized)) {
        showMaintenanceNotice(gameName);
        return;
      }
      if (!getCurrentHomeUser()) {
        openHomeAuthSheet(gameName);
        return;
      }
      if (normalized) window.location.assign(normalized);
    } finally {
      delete trigger.dataset.pmNavigationPending;
      trigger.removeAttribute('aria-busy');
    }
  }, true);
}
