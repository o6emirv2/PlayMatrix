
function pickerLoadingMarkup(text = 'Çerçeveler hazırlanıyor.') {
  const clean = String(text || 'Çerçeveler hazırlanıyor.').replace(/[<>&]/g, '');
  return `<div class="pm-modal-loading pm-picker-loading"><span class="pm-loading-spinner" aria-hidden="true"></span><span class="pm-modal-loading-copy"><strong>Yükleniyor...</strong><span>${clean}</span></span></div>`;
}
const DEFAULT_ROOT_ID = 'framePickerModal';
const DEFAULT_CONTAINER_ID = 'framePickerContainer';
const DEFAULT_FALLBACK_AVATAR = '/public/assets/images/logo.png';
const FRAME_MAX_LEVEL = 100;

const FALLBACK_FRAME_RANGES = Object.freeze([
  Object.freeze({ min: 1, max: 15, asset: 1 }),
  Object.freeze({ min: 16, max: 30, asset: 2 }),
  Object.freeze({ min: 31, max: 40, asset: 3 }),
  Object.freeze({ min: 41, max: 50, asset: 4 }),
  Object.freeze({ min: 51, max: 60, asset: 5 }),
  Object.freeze({ min: 61, max: 80, asset: 6 }),
  Object.freeze({ min: 81, max: 85, asset: 7 }),
  Object.freeze({ min: 86, max: 90, asset: 8 }),
  Object.freeze({ min: 91, max: 91, asset: 9 }),
  Object.freeze({ min: 92, max: 92, asset: 10 }),
  Object.freeze({ min: 93, max: 93, asset: 11 }),
  Object.freeze({ min: 94, max: 94, asset: 12 }),
  Object.freeze({ min: 95, max: 95, asset: 13 }),
  Object.freeze({ min: 96, max: 96, asset: 14 }),
  Object.freeze({ min: 97, max: 97, asset: 15 }),
  Object.freeze({ min: 98, max: 98, asset: 16 }),
  Object.freeze({ min: 99, max: 99, asset: 17 }),
  Object.freeze({ min: 100, max: 100, asset: 18 })
]);

function normalizeFrameLevel(value = 0) {
  const parsed = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(FRAME_MAX_LEVEL, parsed));
}

function getFrameRanges() {
  if (window.PMAvatar && typeof window.PMAvatar.getFrameRanges === 'function') return window.PMAvatar.getFrameRanges();
  return FALLBACK_FRAME_RANGES.map((range) => ({ ...range }));
}

function getFrameRangeForLevel(level = 0) {
  const normalized = normalizeFrameLevel(level);
  if (normalized <= 0) return null;
  return getFrameRanges().find((range) => normalized >= range.min && normalized <= range.max) || getFrameRanges().at(-1) || null;
}

function getFrameCardKey(value = 0) {
  const normalized = normalizeFrameLevel(value);
  const range = getFrameRangeForLevel(normalized);
  return range ? normalizeFrameLevel(range.min) : 0;
}

function getFrameAssetIndex(level = 0) {
  if (window.PMAvatar && typeof window.PMAvatar.getFrameAssetIndex === 'function') return window.PMAvatar.getFrameAssetIndex(level);
  return getFrameRangeForLevel(level)?.asset || 0;
}

function getFrameLabel(level = 0) {
  if (level <= 0) return 'Çerçevesiz';
  const range = getFrameRangeForLevel(level);
  if (!range) return 'Çerçevesiz';
  return range.min === range.max ? `Seviye ${range.min}` : `Seviye ${range.min}-${range.max}`;
}

function isFrameUnlocked(frameLevel = 0, accountLevel = 1) {
  const key = getFrameCardKey(frameLevel);
  if (key <= 0) return true;
  return key <= Math.max(1, normalizeFrameLevel(accountLevel));
}

function getSafeSelectedFrame(rawSelectedFrame = 0, currentLevel = 1) {
  const key = getFrameCardKey(rawSelectedFrame);
  return isFrameUnlocked(key, currentLevel) ? key : 0;
}

function createElement(tagName, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  return element;
}

function mountFramePreview(host, { avatar = DEFAULT_FALLBACK_AVATAR, frameLevel = 0, exactFrameIndex = null, size = 64, extraClass = 'pm-avatar--picker' } = {}) {
  if (!host) return null;
  const key = JSON.stringify({ avatar, frameLevel: normalizeFrameLevel(frameLevel), exactFrameIndex, size, extraClass });
  if (host.dataset.pmFramePreviewKey === key && host.firstElementChild) return host.firstElementChild;
  if (window.PMAvatar?.mount) {
    const node = window.PMAvatar.mount(host, {
      avatarUrl: avatar || DEFAULT_FALLBACK_AVATAR,
      level: normalizeFrameLevel(frameLevel),
      exactFrameIndex,
      sizePx: size,
      extraClass,
      alt: 'Çerçeve önizlemesi',
      sizeTag: 'frame-picker'
    });
    host.dataset.pmFramePreviewKey = key;
    return node;
  }
  const img = document.createElement('img');
  img.src = avatar || DEFAULT_FALLBACK_AVATAR;
  img.alt = 'Çerçeve önizlemesi';
  img.className = 'pm-frame-picker-fallback-img';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    if (img.dataset.fallbackApplied === 'true') return;
    img.dataset.fallbackApplied = 'true';
    img.src = DEFAULT_FALLBACK_AVATAR;
  });
  host.replaceChildren(img);
  host.dataset.pmFramePreviewKey = key;
  return img;
}

export function createFramePicker({
  documentRef = document,
  rootId = DEFAULT_ROOT_ID,
  containerId = DEFAULT_CONTAINER_ID,
  fallbackAvatar = DEFAULT_FALLBACK_AVATAR,
  getSelectedFrame = () => 0,
  getCurrentLevel = () => 1,
  getCurrentAvatar = () => fallbackAvatar,
  onSelect = null,
  openModal = null,
  closeModal = null,
} = {}) {
  const root = () => documentRef.getElementById(rootId);
  const container = () => documentRef.getElementById(containerId);
  let renderToken = 0;
  function setFramePickerStatus() {}

  function closeFramePicker() {
    renderToken += 1;
    if (typeof closeModal === 'function') closeModal(rootId);
    else root()?.classList.remove('active');
  }

  function getCardStatus(level, selectedFrame, currentLevel) {
    if (!isFrameUnlocked(level, currentLevel)) return 'Kilitli';
    if (getFrameCardKey(level) === getFrameCardKey(selectedFrame)) return 'Kullanımda';
    return 'Seç';
  }

  function refreshSummary(host, selectedFrame, currentLevel, avatar) {
    const safeSelected = getSafeSelectedFrame(selectedFrame, currentLevel);
    const title = host?.querySelector('[data-frame-summary-title]');
    const text = host?.querySelector('[data-frame-summary-text]');
    const preview = host?.querySelector('[data-frame-summary-preview]');
    const assetIndex = getFrameAssetIndex(safeSelected);
    if (title) title.textContent = safeSelected > 0 ? `${getFrameLabel(safeSelected)} Çerçevesi` : 'Çerçevesiz Görünüm';
    if (text) text.textContent = `Mevcut seviyen: ${currentLevel}. Kullanılabilir çerçeveler seviye aralığına göre açılır; avatar netliği korunur.`;
    if (preview) mountFramePreview(preview, { avatar, frameLevel: safeSelected, exactFrameIndex: assetIndex || null, size: 66, extraClass: 'pm-avatar--picker' });
  }

  function updateOneCard(card, selectedFrame, currentLevel) {
    const level = normalizeFrameLevel(card.dataset.frameLevel);
    const assetIndex = getFrameAssetIndex(level);
    const locked = !isFrameUnlocked(level, currentLevel);
    const selected = getFrameCardKey(level) === getFrameCardKey(selectedFrame);
    card.classList.toggle('is-locked', locked);
    card.dataset.frameLocked = locked ? 'true' : 'false';
    card.classList.toggle('is-selected', selected);
    card.disabled = false;
    card.tabIndex = locked ? -1 : 0;
    card.setAttribute('aria-disabled', locked ? 'true' : 'false');
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    card.dataset.frameAssetIndex = String(assetIndex);
    const status = card.querySelector('.frame-picker-card-status');
    if (status) status.textContent = getCardStatus(level, selectedFrame, currentLevel);
  }

  function buildFrameCard(option, selectedFrame, currentLevel, avatar) {
    const normalizedLevel = normalizeFrameLevel(option.level);
    const frameAssetIndex = Number(option.asset || getFrameAssetIndex(normalizedLevel)) || 0;
    const isLocked = !isFrameUnlocked(normalizedLevel, currentLevel);
    const isSelected = getFrameCardKey(normalizedLevel) === getFrameCardKey(selectedFrame);
    const card = createElement('button', 'frame-picker-card');
    card.type = 'button';
    card.dataset.frameLevel = String(normalizedLevel);
    card.dataset.frameAssetIndex = String(frameAssetIndex);
    card.classList.toggle('is-locked', isLocked);
    card.dataset.frameLocked = isLocked ? 'true' : 'false';
    card.classList.toggle('is-selected', isSelected);
    card.disabled = false;
    card.tabIndex = isLocked ? -1 : 0;
    card.setAttribute('aria-disabled', isLocked ? 'true' : 'false');
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    card.setAttribute('aria-label', normalizedLevel === 0 ? 'Çerçevesiz profil görünümü' : `${getFrameLabel(normalizedLevel)} çerçevesi`);
    if (isLocked) card.setAttribute('title', `${getFrameLabel(normalizedLevel)} kilitli. Açmak için hesap seviyen en az ${normalizedLevel} olmalı.`);

    const preview = createElement('span', 'frame-picker-preview');
    mountFramePreview(preview, { avatar, frameLevel: normalizedLevel, exactFrameIndex: frameAssetIndex || null, size: normalizedLevel === 0 ? 58 : 64 });

    const meta = createElement('span', 'frame-picker-meta');
    const title = createElement('strong', 'frame-picker-card-title');
    title.textContent = normalizedLevel === 0 ? 'Çerçevesiz' : getFrameLabel(normalizedLevel);
    const asset = createElement('span', 'frame-picker-card-asset');
    asset.textContent = normalizedLevel === 0 ? 'Standart profil görünümü' : 'Seviye aralığına göre açılır';
    const status = createElement('span', 'frame-picker-card-status');
    status.textContent = getCardStatus(normalizedLevel, selectedFrame, currentLevel);
    meta.append(title, asset, status);
    card.append(preview, meta);

    if (!isLocked) {
      card.addEventListener('click', async () => {
        if (card.classList.contains('is-locked') || card.classList.contains('is-saving')) return;
        const scrollHost = container();
        const previousScrollTop = scrollHost ? scrollHost.scrollTop : 0;
        card.classList.add('is-saving');
        setFramePickerStatus('Çerçeve seçimi kaydediliyor...', 'info');
        try {
          if (typeof onSelect === 'function') await onSelect(normalizedLevel);
          updateActiveSelection();
          setFramePickerStatus('Çerçeve seçimi kaydedildi.', 'success');
          if (scrollHost) scrollHost.scrollTop = previousScrollTop;
        } catch (error) {
          setFramePickerStatus('Çerçeve kaydedilemedi. Tekrar dene.', 'error');
          throw error;
        } finally {
          card.classList.remove('is-saving');
          window.setTimeout(() => setFramePickerStatus('', 'info'), 1600);
        }
      });
    }
    return card;
  }

  function renderFrameOptions() {
    const host = container();
    if (!host) return null;
    const token = ++renderToken;
    const currentLevel = normalizeFrameLevel(getCurrentLevel());
    const selectedFrame = getSafeSelectedFrame(getSelectedFrame(), currentLevel);
    const avatar = getCurrentAvatar() || fallbackAvatar;
    const previousScrollTop = host.scrollTop || 0;
    host.replaceChildren();

    const summary = createElement('div', 'frame-picker-summary');
    const summaryPreview = createElement('div', 'frame-picker-summary-preview');
    summaryPreview.dataset.frameSummaryPreview = 'true';
    const summaryCopy = createElement('div', 'frame-picker-summary-copy');
    const summaryTitle = createElement('strong');
    summaryTitle.dataset.frameSummaryTitle = 'true';
    const summaryText = createElement('span');
    summaryText.dataset.frameSummaryText = 'true';
    summaryCopy.append(summaryTitle, summaryText);
    summary.append(summaryPreview, summaryCopy);

    const grid = createElement('div', 'frame-picker-grid frame-picker-grid--tiered');
    host.append(summary, grid);
    refreshSummary(host, selectedFrame, currentLevel, avatar);

    const options = [{ level: 0, asset: 0 }, ...getFrameRanges().map((range) => ({ level: range.min, asset: range.asset }))];
    const fragment = documentRef.createDocumentFragment();
    options.forEach((option) => fragment.appendChild(buildFrameCard(option, selectedFrame, currentLevel, avatar)));
    if (token !== renderToken) return host;
    grid.appendChild(fragment);
    host.scrollTop = previousScrollTop;
    return host;
  }

  function openFramePicker() {
    const host = container();
    if (host && !host.dataset.renderedOnce) host.innerHTML = pickerLoadingMarkup('Çerçeveler hazırlanıyor.');
    if (typeof openModal === 'function') openModal(rootId);
    else root()?.classList.add('active');
    window.requestAnimationFrame(() => { renderFrameOptions(); const h = container(); if (h) h.dataset.renderedOnce = 'true'; });
    window.setTimeout(() => container()?.focus?.(), 30);
    return root();
  }

  function updateActiveSelection() {
    const host = container();
    if (!host) return;
    const currentLevel = normalizeFrameLevel(getCurrentLevel());
    const selectedFrame = getSafeSelectedFrame(getSelectedFrame(), currentLevel);
    const avatar = getCurrentAvatar() || fallbackAvatar;
    refreshSummary(host, selectedFrame, currentLevel, avatar);
    host.querySelectorAll('.frame-picker-card').forEach((card) => updateOneCard(card, selectedFrame, currentLevel));
  }

  return Object.freeze({ openFramePicker, closeFramePicker, renderFrameOptions, updateActiveSelection });
}
