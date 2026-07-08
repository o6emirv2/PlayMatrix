
import { FLAG_AVATARS } from './avatar-sources/flags.js';
import { MALE_PROFILE_AVATARS } from './avatar-sources/male-profile.js';
import { FEMALE_PROFILE_AVATARS } from './avatar-sources/female-profile.js';
import { EMOJI_ANONYMOUS_AVATARS } from './avatar-sources/emoji-anonymous.js';

export const AVATAR_REMOTE_MODE = 'link';
export const AVATAR_FALLBACK = '/public/assets/images/logo.png';

export const AVATAR_ALLOWED_REMOTE_HOSTS = Object.freeze(['playmatrix.com.tr', 'www.playmatrix.com.tr', 'emirhan-siye.onrender.com', 'encrypted-tbn0.gstatic.com']);

// Avatar katalogu uzaktan gelen onaylı kaynakları destekler; varsayılan avatar her zaman lokal PlayMatrix logosudur.
function toSafeString(value = '') {
  return String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

function normalizeLocalAvatarPath(value = '') {
  const raw = toSafeString(value);
  if (raw === AVATAR_FALLBACK) return AVATAR_FALLBACK;
  if (/^\/public\/assets\/(images|avatars|avatar)\/[\w.\-/]+$/i.test(raw)) return raw;
  return '';
}


function normalizeRemoteAvatarUrl(value = '') {
  const raw = toSafeString(value);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (!AVATAR_ALLOWED_REMOTE_HOSTS.includes(url.hostname)) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

export function normalizeAvatarUrl(value = '', fallback = AVATAR_FALLBACK) {
  const raw = toSafeString(value);
  const fallbackValue = fallback === null ? '' : toSafeString(fallback);
  if (!raw) return fallbackValue;

  const local = normalizeLocalAvatarPath(raw);
  if (local) return local;

  const remote = normalizeRemoteAvatarUrl(raw);
  if (remote) return remote;

  return fallbackValue;
}

function normalizeCategoryItems(category) {
  const seen = new Set();
  return category.sources
    .map((src) => normalizeAvatarUrl(src, null))
    .filter(Boolean)
    .filter((src) => {
      if (src === AVATAR_FALLBACK) return false;
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    })
    .map((src, index) => Object.freeze({
      id: `${category.id}-${String(index + 1).padStart(2, '0')}`,
      categoryId: category.id,
      categoryTitle: category.title,
      label: `${category.labelPrefix} ${index + 1}`,
      src
}));
}

const CATEGORY_DEFINITIONS = Object.freeze([
  { id: 'flags', title: 'Bayrak', icon: 'fa-flag', labelPrefix: 'Bayrak', sources: FLAG_AVATARS },
  { id: 'male-profile', title: 'Erkek Profil', icon: 'fa-user', labelPrefix: 'Erkek Profil', sources: MALE_PROFILE_AVATARS },
  { id: 'female-profile', title: 'Kız Profil', icon: 'fa-user', labelPrefix: 'Kız Profil', sources: FEMALE_PROFILE_AVATARS },
  { id: 'emoji-anonymous', title: 'Emoji / Anonymous', icon: 'fa-user-secret', labelPrefix: 'Emoji Anonymous', sources: EMOJI_ANONYMOUS_AVATARS }
]);

export const AVATAR_CATEGORIES = Object.freeze(
  CATEGORY_DEFINITIONS.map((category) => Object.freeze({
    id: category.id,
    title: category.title,
    icon: category.icon,
    items: Object.freeze(normalizeCategoryItems(category))
})).filter((category) => category.items.length > 0)
);

export const AVATAR_ITEMS = Object.freeze(AVATAR_CATEGORIES.flatMap((category) => category.items));
export const AVATARS = Object.freeze(AVATAR_ITEMS.map((item) => item.src));
export const DEFAULT_AVATAR = AVATAR_FALLBACK;

const AVATAR_SRC_SET = new Set(AVATARS);

export function isCatalogAvatarUrl(src = '', { allowFallback = true } = {}) {
  const normalized = normalizeAvatarUrl(src, '');
  if (!normalized) return false;
  if (allowFallback && normalized === AVATAR_FALLBACK) return true;
  return AVATAR_SRC_SET.has(normalized);
}

export function getSafeAvatarSrc(src = '', fallback = DEFAULT_AVATAR) {
  const normalized = normalizeAvatarUrl(src, '');
  if (isCatalogAvatarUrl(normalized)) return normalized;
  return fallback || AVATAR_FALLBACK;
}

export function findAvatarItem(src = '') {
  const normalized = normalizeAvatarUrl(src, '');
  if (!normalized) return null;
  return AVATAR_ITEMS.find((item) => item.src === normalized) || null;
}
