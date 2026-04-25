export const HOME_GAME_ROUTES = Object.freeze({
  crash: "/Online Oyunlar/Crash",
  chess: "/Online Oyunlar/Satranc",
  satranc: "/Online Oyunlar/Satranc",
  pisti: "/Online Oyunlar/Pisti",
  pattern: "/Klasik Oyunlar/PatternMaster",
  patternmaster: "/Klasik Oyunlar/PatternMaster",
  space: "/Klasik Oyunlar/SpacePro",
  spacepro: "/Klasik Oyunlar/SpacePro",
  snake: "/Klasik Oyunlar/SnakePro",
  snakepro: "/Klasik Oyunlar/SnakePro"
});

export const HOME_GAMES = Object.freeze([
  { key: "crash", name: "Crash", category: "online", access: "auth", url: HOME_GAME_ROUTES.crash, icon: "fa-arrow-trend-up" },
  { key: "satranc", name: "Satranç", category: "online", access: "auth", url: HOME_GAME_ROUTES.satranc, icon: "fa-chess" },
  { key: "pisti", name: "Pişti", category: "online", access: "auth", url: HOME_GAME_ROUTES.pisti, icon: "fa-layer-group" },
  { key: "patternmaster", name: "Pattern Master", category: "classic", access: "free", url: HOME_GAME_ROUTES.patternmaster, icon: "fa-shapes" },
  { key: "spacepro", name: "Space Pro", category: "classic", access: "free", url: HOME_GAME_ROUTES.spacepro, icon: "fa-user-astronaut" },
  { key: "snakepro", name: "Snake Pro", category: "classic", access: "free", url: HOME_GAME_ROUTES.snakepro, icon: "fa-wave-square" }
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
