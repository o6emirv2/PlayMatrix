(function () {
  'use strict';

  const GAMES = [
    { name: 'Crash', category: 'online', access: 'auth', url: '/crash', color: '69,162,255', icon: 'fa-arrow-trend-up', desc: 'Gerçek para içermeyen, refleks ve zamanlama odaklı hızlı tempo multiplier oyunu.', tags: ['Canlı Oyun', 'Rekabet', 'Hızlı Tur'] },
    { name: 'Satranç', category: 'online', access: 'auth', url: '/satranc', color: '104,178,255', icon: 'fa-chess', desc: 'Klasik satranç deneyimini modern arayüz ve giriş tabanlı rekabet akışıyla oyna.', tags: ['PvP', 'Strateji', 'Arena'] },
    { name: 'Pişti', category: 'online', access: 'auth', url: '/pisti', color: '93,95,254', icon: 'fa-layer-group', desc: 'Kart takibi ve tempo yönetimi isteyen online pişti deneyimi.', tags: ['Kart', 'Online', 'Klasik'] },
    { name: 'Pattern Master', category: 'classic', access: 'free', url: '/classic-games/pattern-master', color: '97,220,176', icon: 'fa-shapes', desc: 'Dikkat ve görsel hafıza odaklı ücretsiz pattern oyunu.', tags: ['Ücretsiz', 'Zeka', 'Refleks'] },
    { name: 'Space Pro', category: 'classic', access: 'free', url: '/classic-games/space-pro', color: '103,170,255', icon: 'fa-user-astronaut', desc: 'Tarayıcıda anında açılan hafif ve hızlı klasik arcade uzay oyunu.', tags: ['Arcade', 'Retro', 'Ücretsiz'] },
    { name: 'Snake Pro', category: 'classic', access: 'free', url: '/classic-games/snake-pro', color: '85,214,140', icon: 'fa-wave-square', desc: 'Retro hisli, akıcı ve ücretsiz snake deneyimi.', tags: ['Retro', 'Arcade', 'Ücretsiz'] }
  ];

  const qs = (selector, root) => (root || document).querySelector(selector);

  function icon(className) {
    const node = document.createElement('i');
    node.className = `fa-solid ${className || 'fa-gamepad'}`;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function text(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null ? '' : String(value);
    return node;
  }

  function getGameAccentClass(game) {
    const key = String(game?.name || '').toLowerCase();
    if (key.includes('crash')) return 'game-card--crash';
    if (key.includes('satran')) return 'game-card--chess';
    if (key.includes('pişti') || key.includes('pisti')) return 'game-card--pisti';
    if (key.includes('pattern')) return 'game-card--pattern';
    if (key.includes('space')) return 'game-card--space';
    if (key.includes('snake')) return 'game-card--snake';
    return 'game-card--default';
  }

  function renderGameCard(game) {
    const card = document.createElement('article');
    card.className = `game-card fade-up fast-painted ${getGameAccentClass(game)}`;
    card.dataset.fastPaint = '1';

    const top = document.createElement('div');
    top.className = 'game-top';

    const gameIcon = document.createElement('div');
    gameIcon.className = 'game-icon';
    gameIcon.appendChild(icon(game.icon));

    const tagStack = document.createElement('div');
    tagStack.className = 'tag-stack';
    const category = text('span', 'mini-tag', game.category === 'online' ? 'Online' : 'Klasik');
    if (game.category === 'online') category.prepend(text('span', 'live-dot', ''));
    const access = text('span', 'mini-tag', game.access === 'auth' ? 'Giriş Gerekir' : 'Ücretsiz');
    tagStack.append(category, access);
    top.append(gameIcon, tagStack);

    const body = document.createElement('div');
    body.className = 'game-body';
    body.append(text('h3', 'game-title', game.name), text('div', 'game-desc', game.desc));

    const features = document.createElement('div');
    features.className = 'feature-list';
    game.tags.forEach((tag) => features.appendChild(text('span', 'feature-pill', tag)));
    body.appendChild(features);

    const foot = document.createElement('div');
    foot.className = 'game-foot';
    const button = document.createElement('a');
    button.className = 'play-btn';
    button.href = game.url;
    button.append(text('span', '', game.access === 'auth' ? 'Giriş Yap ve Oyna' : 'Hemen Oyna'), icon('fa-arrow-right'));
    foot.appendChild(button);

    card.append(top, body, foot);
    return card;
  }

  function fastPaintGames() {
    const grid = qs('#gamesGrid');
    const empty = qs('#gamesEmpty');
    const metric = qs('#metricGamesCount');
    if (!grid || grid.dataset.fastPainted === '1') return;

    const fragment = document.createDocumentFragment();
    GAMES.forEach((game) => fragment.appendChild(renderGameCard(game)));
    grid.replaceChildren(fragment);
    grid.classList.remove('is-loading');
    grid.dataset.fastPainted = '1';
    if (empty) empty.hidden = true;
    if (metric) metric.textContent = String(GAMES.length);
  }

  function fastPaintLeaderboard() {
    const area = qs('#leaderboardListArea');
    if (!area || area.dataset.fastPainted === '1') return;
    const fragment = document.createDocumentFragment();
    ['Hesap seviyesi verileri yükleniyor', 'Aylık aktiflik verileri yükleniyor', 'Oyuncu sıralaması hazırlanıyor'].forEach((label, index) => {
      const row = document.createElement('div');
      row.className = 'lb-item fast-lb-item';
      const rank = text('span', 'lb-rank', `#${index + 1}`);
      const main = document.createElement('div');
      main.className = 'lb-main';
      main.append(text('strong', '', label), text('small', '', 'Sunucu verisi gelince otomatik güncellenir.'));
      row.append(rank, main);
      fragment.appendChild(row);
    });
    area.replaceChildren(fragment);
    area.dataset.fastPainted = '1';
  }

  function paint() {
    try {
      fastPaintGames();
      fastPaintLeaderboard();
      document.documentElement.classList.add('pm-fast-painted');
    } catch (error) {
      console.warn('[PlayMatrix] fast home paint skipped', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paint, { once: true });
  } else {
    paint();
  }
})();
