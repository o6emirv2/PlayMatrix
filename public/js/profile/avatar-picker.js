// Video-style avatar picker for PlayMatrix profile photo selection.
// Data source: /public/data/avatar-catalog.js

function safeText(value = '') {
  return String(value ?? '').trim();
}

function pickerLoadingMarkup(text = 'Avatarlar hazırlanıyor.') {
  const clean = String(text || 'Avatarlar hazırlanıyor.').replace(/[<>&]/g, '');
  return `<div class="pm-modal-loading pm-picker-loading"><span class="pm-loading-spinner" aria-hidden="true"></span><span class="pm-modal-loading-copy"><strong>Yükleniyor...</strong><span>${clean}</span></span></div>`;
}

function setImageFallback(img, fallbackSrc = '') {
  img.addEventListener('error', () => {
    if (!fallbackSrc || img.dataset.fallbackApplied === 'true') return;
    img.dataset.fallbackApplied = 'true';
    img.src = fallbackSrc;
  }, { once: false });
}

export function createAvatarPicker({
  documentRef = document,
  categories = [],
  normalizeAvatarUrl = (value) => String(value || ''),
  defaultAvatar = '',
  fallbackAvatar = defaultAvatar,
  getSelectedAvatar = () => '',
  onSelect = async () => {},
  openModal = () => {},
  closeModal = () => {},
  rootId = 'avatarPickerModal',
  containerId = 'avatarCategoryContainer',
} = {}) {
  const getRoot = () => documentRef.getElementById(rootId);
  const getContainer = () => documentRef.getElementById(containerId);
  let avatarPickerRenderedOnce = false;
  let selectingAvatar = false;

  function setPickerStatus() {}

  function ensureAvatarPickerHero() {
    const root = getRoot();
    const container = getContainer();
    if (!root || !container || root.querySelector('[data-avatar-picker-hero]')) return;
    const hero = documentRef.createElement('div');
    hero.className = 'avatar-picker-hero';
    hero.dataset.avatarPickerHero = 'true';
    hero.innerHTML = '<div><strong>Profil Avatarını Seç</strong><p>Kategoriye göre düzenlenmiş avatarlar. Seçimin hesabına güvenle uygulanır.</p></div>';
    container.before(hero);
  }

  function getCatalogItem(categoryId, avatarId) {
    const category = categories.find((entry) => entry.id === categoryId);
    if (!category) return null;
    return category.items.find((item) => item.id === avatarId) || null;
  }

  function updateActiveSelection() {
    const root = getRoot();
    if (!root) return;
    const selected = normalizeAvatarUrl(getSelectedAvatar() || defaultAvatar, defaultAvatar);
    root.querySelectorAll('[data-avatar-picker-item="true"]').forEach((button) => {
      const isActive = normalizeAvatarUrl(button.dataset.avatarSrc || '', '') === selected;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      const status = button.querySelector('.avatar-picker-status');
      if (status) status.textContent = isActive ? 'Seçili' : 'Seç';
    });
  }

  function createCategoryHeader(category) {
    const header = documentRef.createElement('div');
    header.className = 'avatar-picker-category-title';

    const icon = documentRef.createElement('i');
    icon.className = `fa-solid ${safeText(category.icon || 'fa-user')}`;
    icon.setAttribute('aria-hidden', 'true');

    const title = documentRef.createElement('span');
    title.textContent = safeText(category.title || 'Avatar');

    header.append(icon, title);
    return header;
  }

  function createAvatarButton(category, item) {
    const normalizedSrc = normalizeAvatarUrl(item.src, defaultAvatar);
    const selected = normalizeAvatarUrl(getSelectedAvatar() || defaultAvatar, defaultAvatar);
    const isActive = normalizedSrc === selected;

    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = `avatar-picker-item ${isActive ? 'is-active' : ''}`;
    button.dataset.avatarPickerItem = 'true';
    button.dataset.categoryId = category.id;
    button.dataset.avatarId = item.id;
    button.dataset.avatarSrc = normalizedSrc;
    button.setAttribute('aria-label', `${category.title} avatarı seç`);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');

    const ring = documentRef.createElement('span');
    ring.className = 'avatar-picker-ring';

    const img = documentRef.createElement('img');
    img.src = normalizedSrc;
    img.alt = safeText(item.label || `${category.title} avatar`);
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    setImageFallback(img, fallbackAvatar || defaultAvatar);

    const status = documentRef.createElement('span');
    status.className = 'avatar-picker-status';
    status.textContent = isActive ? 'Seçili' : 'Seç';

    ring.append(img);
    button.append(ring, status);
    button.addEventListener('click', () => selectAvatarFromCatalog(category.id, item.id));
    return button;
  }

  function renderAvatarCategories({ force = false } = {}) {
    const container = getContainer();
    if (!container) return;
    ensureAvatarPickerHero();
    if (avatarPickerRenderedOnce && !force) { updateActiveSelection(); return; }
    avatarPickerRenderedOnce = true;
    container.replaceChildren();

    const availableCategories = categories.filter((category) => Array.isArray(category.items) && category.items.length > 0);
    if (!availableCategories.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'avatar-picker-empty';
      empty.textContent = 'Avatar kataloğu şu anda boş görünüyor.';
      container.appendChild(empty);
      return;
    }

    const fragment = documentRef.createDocumentFragment();
    availableCategories.forEach((category) => {
      const section = documentRef.createElement('section');
      section.className = 'avatar-picker-category';
      section.dataset.avatarCategory = category.id;
      const grid = documentRef.createElement('div');
      grid.className = 'avatar-picker-grid';
      const items = documentRef.createDocumentFragment();
      category.items.forEach((item) => items.appendChild(createAvatarButton(category, item)));
      grid.appendChild(items);
      section.append(createCategoryHeader(category), grid);
      fragment.appendChild(section);
    });
    container.appendChild(fragment);
    updateActiveSelection();
  }

  
  async function selectAvatarFromCatalog(categoryId, avatarId) {
    if (selectingAvatar) return null;
    const item = getCatalogItem(categoryId, avatarId);
    if (!item) return null;
    selectingAvatar = true;
    const root = getRoot();
    const button = root?.querySelector(`[data-category-id="${categoryId}"][data-avatar-id="${avatarId}"]`);
    button?.classList.add('is-saving');
    setPickerStatus('Avatar seçimin uygulanıyor.', 'info');
    try {
      await onSelect({ categoryId, avatarId, item, src: normalizeAvatarUrl(item.src, defaultAvatar) });
      updateActiveSelection();
      setPickerStatus('Avatar seçimi kaydedildi.', 'success');
      return item;
    } catch (error) {
      setPickerStatus('Avatar kaydedilemedi. Tekrar dene.', 'error');
      throw error;
    } finally {
      selectingAvatar = false;
      button?.classList.remove('is-saving');
      window.setTimeout(() => setPickerStatus('', 'info'), 1600);
    }
  }

  function openAvatarPicker() {
    const container = getContainer();
    if (container && !avatarPickerRenderedOnce) container.innerHTML = pickerLoadingMarkup('Avatarlar hazırlanıyor.');
    openModal(rootId);
    window.requestAnimationFrame(() => renderAvatarCategories({ force: false }));
    const root = getRoot();
    const firstActive = root?.querySelector('.avatar-picker-item.is-active') || root?.querySelector('.avatar-picker-item');
    if (firstActive && typeof firstActive.focus === 'function') {
      window.requestAnimationFrame(() => firstActive.focus({ preventScroll: true }));
    }
  }

  function closeAvatarPicker() {
    closeModal(rootId);
  }

  const root = getRoot();
  if (root) {
    root.addEventListener('click', (event) => {
      if (event.target === root) closeAvatarPicker();
    });
  }

  return Object.freeze({
    openAvatarPicker,
    closeAvatarPicker,
    renderAvatarCategories,
    selectAvatarFromCatalog,
    updateActiveSelection,
  });
}
