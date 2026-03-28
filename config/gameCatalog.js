'use strict';

const GAME_CATALOG = Object.freeze([
  {
    key: 'crash',
    name: 'Crash',
    category: 'online',
    access: 'auth',
    url: 'Online Oyunlar/Crash.html',
    color: '69,162,255',
    icon: 'fa-arrow-trend-up',
    desc: 'Gerçek para içermeyen, refleks ve zamanlama odaklı hızlı tempo multiplier oyunu.',
    tags: ['Canlı Oyun', 'Rekabet', 'Hızlı Tur'],
    keywords: 'casino crash multiplier online rocket roket çarpan'
  },
  {
    key: 'satranc',
    name: 'Satranç',
    category: 'online',
    access: 'auth',
    url: 'Online Oyunlar/Satranc.html',
    color: '104,178,255',
    icon: 'fa-chess',
    desc: 'Klasik satranç deneyimini modern arayüz ve giriş tabanlı rekabet akışıyla oyna.',
    tags: ['PvP', 'Strateji', 'ELO'],
    keywords: 'chess elo mmr online pvp satranç'
  },
  {
    key: 'pisti-online',
    name: 'Pişti',
    category: 'online',
    access: 'auth',
    url: 'Online Oyunlar/Pisti.html',
    color: '93,95,254',
    icon: 'fa-layer-group',
    desc: 'Kart takibi ve tempo yönetimi isteyen online pişti deneyimi.',
    tags: ['Kart', 'Online', 'Klasik'],
    keywords: 'card kart multiplayer online pisti pişti'
  },
  {
    key: 'mines',
    name: 'Mines',
    category: 'casino',
    access: 'auth',
    url: 'Casino/Mines.html',
    color: '255,114,140',
    icon: 'fa-bomb',
    desc: 'Risk yönetimi ve seçim stratejisi üzerine kurulu premium görünüşlü mayın modu.',
    tags: ['Risk', 'Seçim', 'Premium'],
    keywords: 'casino mayın mine mines risk'
  },
  {
    key: 'blackjack',
    name: 'BlackJack',
    category: 'casino',
    access: 'auth',
    url: 'Casino/BlackJack.html',
    color: '255,192,84',
    icon: 'fa-crown',
    desc: '21 mantığını ücretsiz, modern ve hızlı arayüzle deneyimle.',
    tags: ['21', 'Kart', 'Premium'],
    keywords: '21 bj blackjack casino kart'
  },
  {
    key: 'casino-pisti',
    name: 'Casino Pişti',
    category: 'casino',
    access: 'auth',
    url: 'Casino/Pisti.html',
    color: '177,118,255',
    icon: 'fa-clover',
    desc: 'Kart oyunu mekaniğini premium casino teması içinde oynayabileceğin sürüm.',
    tags: ['Kart', 'Tema', 'Hızlı'],
    keywords: 'card kart casino pisti pişti'
  },
  {
    key: 'pattern-master',
    name: 'Pattern Master',
    category: 'classic',
    access: 'free',
    url: 'Klasik Oyunlar/PatternMaster.html',
    color: '97,220,176',
    icon: 'fa-shapes',
    desc: 'Dikkat ve görsel hafıza odaklı ücretsiz pattern oyunu.',
    tags: ['Ücretsiz', 'Zeka', 'Refleks'],
    keywords: 'arcade pattern master ücretsiz zeka'
  },
  {
    key: 'space-pro',
    name: 'Space Pro',
    category: 'classic',
    access: 'free',
    url: 'Klasik Oyunlar/SpacePro.html',
    color: '103,170,255',
    icon: 'fa-user-astronaut',
    desc: 'Tarayıcıda anında açılan hafif ve hızlı klasik arcade uzay oyunu.',
    tags: ['Arcade', 'Retro', 'Ücretsiz'],
    keywords: 'arcade pro space uzay'
  },
  {
    key: 'snake-pro',
    name: 'Snake Pro',
    category: 'classic',
    access: 'free',
    url: 'Klasik Oyunlar/SnakePro.html',
    color: '85,214,140',
    icon: 'fa-wave-square',
    desc: 'Retro hisli, akıcı ve ücretsiz snake deneyimi.',
    tags: ['Retro', 'Arcade', 'Ücretsiz'],
    keywords: 'arcade pro retro snake yılan'
  }

,{
  key: 'matrix-2048',
  name: 'Matrix 2048',
  category: 'classic',
  access: 'free',
  url: 'Klasik Oyunlar/Matrix2048.html',
  color: '124,170,255',
  icon: 'fa-table-cells-large',
  desc: 'Kaydırma tabanlı, mobil uyumlu ve yüksek okunabilirlikli 2048 varyantı.',
  tags: ['Bulmaca', 'Mobil', 'Ücretsiz'],
  keywords: '2048 merge puzzle sayı birleştirme matrix'
}
,{
  key: 'memory-flip',
  name: 'Memory Flip',
  category: 'classic',
  access: 'free',
  url: 'Klasik Oyunlar/MemoryFlip.html',
  color: '104,225,208',
  icon: 'fa-clone',
  desc: 'Kısa turlu hafıza eşleştirme oyunu; temiz grid ve dokunmatik dostu akış.',
  tags: ['Hafıza', 'Grid', 'Ücretsiz'],
  keywords: 'memory flip eşleştirme kart hafıza ücretsiz'
}
,{
  key: 'tic-tac-arena',
  name: 'TicTac Arena',
  category: 'classic',
  access: 'free',
  url: 'Klasik Oyunlar/TicTacArena.html',
  color: '255,145,167',
  icon: 'fa-grip',
  desc: 'Akıcı, kısa oturumlu ve cihazlar arası stabil klasik XOX deneyimi.',
  tags: ['XOX', 'Kısa Tur', 'Ücretsiz'],
  keywords: 'tictactoe xox arena klasik ücretsiz'
}
]);

const CATEGORY_LABELS = Object.freeze({
  online: 'Online',
  casino: 'Premium Casino',
  classic: 'Klasik'
});

function cloneGame(game = {}) {
  return {
    ...game,
    tags: Array.isArray(game.tags) ? [...game.tags] : []
  };
}

function getPublicGameCatalog() {
  return GAME_CATALOG.map((game) => cloneGame(game));
}

function buildGameCatalogSummary(items = []) {
  const catalog = Array.isArray(items) ? items : [];
  const byCategory = { online: 0, casino: 0, classic: 0 };
  const byAccess = { auth: 0, free: 0 };

  catalog.forEach((game) => {
    const category = String(game?.category || '').trim();
    const access = String(game?.access || '').trim();
    if (Object.prototype.hasOwnProperty.call(byCategory, category)) byCategory[category] += 1;
    if (Object.prototype.hasOwnProperty.call(byAccess, access)) byAccess[access] += 1;
  });

  return {
    total: catalog.length,
    byCategory,
    byAccess,
    categoryLabels: { ...CATEGORY_LABELS },
    headline: `${catalog.length} oyun vitrinde hazır`,
    detailLine: `${byCategory.online} online · ${byCategory.casino} premium casino · ${byCategory.classic} klasik`,
    accessLine: `${byAccess.auth} giriş gerektirir · ${byAccess.free} ücretsiz`
  };
}

module.exports = {
  GAME_CATALOG,
  CATEGORY_LABELS,
  getPublicGameCatalog,
  buildGameCatalogSummary
};
