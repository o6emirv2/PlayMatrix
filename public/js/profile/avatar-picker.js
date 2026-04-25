// Video-style avatar picker for PlayMatrix profile photo selection.
// Data source: public/data/avatar-catalog.js

function safeText(value = '') {
  return String(value ?? '').trim();
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

    const check = documentRef.createElement('span');
    check.className = 'avatar-picker-check';
    check.setAttribute('aria-hidden', 'true');
    const checkIcon = documentRef.createElement('i');
    checkIcon.className = 'fa-solid fa-check';
    check.appendChild(checkIcon);

    const status = documentRef.createElement('span');
    status.className = 'avatar-picker-status';
    status.textContent = isActive ? 'Seçili' : 'Seç';

    ring.append(img, check);
    button.append(ring, status);
    button.addEventListener('click', () => selectAvatarFromCatalog(category.id, item.id));
    return button;
  }

  function renderAvatarCategories() {
    const container = getContainer();
    if (!container) return;
    container.replaceChildren();

    const fragment = documentRef.createDocumentFragment();
    categories.forEach((category) => {
      if (!Array.isArray(category.items) || category.items.length === 0) return;

      const section = documentRef.createElement('section');
      section.className = 'avatar-picker-category';
      section.dataset.avatarCategory = category.id;

      const grid = documentRef.createElement('div');
      grid.className = 'avatar-picker-grid';
      category.items.forEach((item) => grid.appendChild(createAvatarButton(category, item)));

      section.append(createCategoryHeader(category), grid);
      fragment.appendChild(section);
    });

    if (!fragment.childNodes.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'avatar-picker-empty';
      empty.textContent = 'Avatar kataloğu şu anda boş görünüyor.';
      fragment.appendChild(empty);
    }

    container.appendChild(fragment);
    updateActiveSelection();
  }

  async function selectAvatarFromCatalog(categoryId, avatarId) {
    const item = getCatalogItem(categoryId, avatarId);
    if (!item) return null;
    await onSelect({ categoryId, avatarId, item, src: normalizeAvatarUrl(item.src, defaultAvatar) });
    updateActiveSelection();
    return item;
  }

  function openAvatarPicker() {
    renderAvatarCategories();
    openModal(rootId);
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
