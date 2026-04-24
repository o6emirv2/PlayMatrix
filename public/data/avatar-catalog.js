import { CAR_AVATARS } from './avatar-sources/cars.js';
import { FLAG_AVATARS } from './avatar-sources/flags.js';
import { FOOTBALL_TEAM_AVATARS } from './avatar-sources/football-teams.js';
import { MALE_PROFILE_AVATARS } from './avatar-sources/male-profile.js';
import { FEMALE_PROFILE_AVATARS } from './avatar-sources/female-profile.js';
import { MARVEL_PLAYER_AVATARS } from './avatar-sources/marvel-players.js';
import { EMOJI_ANONYMOUS_AVATARS } from './avatar-sources/emoji-anonymous.js';
import { FLOWER_AVATARS } from './avatar-sources/flowers.js';

export const AVATAR_REMOTE_MODE = 'link';
export const AVATAR_FALLBACK = '/assets/avatars/system/fallback.svg';

export const AVATAR_ALLOWED_REMOTE_HOSTS = Object.freeze([
  'encrypted-tbn0.gstatic.com',
  'www.shutterstock.com',
]);

const LOCAL_AVATAR_PATH = /^(?:\.\/|\/)?assets\/avatars\/[a-z0-9_./-]+\.(?:png|jpe?g|webp|svg)$/i;

function toSafeString(value = '') {
  return String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

function normalizeLocalAvatarPath(value = '') {
  const raw = toSafeString(value);
  if (!LOCAL_AVATAR_PATH.test(raw)) return '';
  const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\.\//, '')}`;
  return normalized.replace(/\/+/g, '/');
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
      src,
    }));
}

const CATEGORY_DEFINITIONS = Object.freeze([
  { id: 'cars', title: 'Araba', icon: 'fa-car', labelPrefix: 'Araba', sources: CAR_AVATARS },
  { id: 'flags', title: 'Bayrak', icon: 'fa-flag', labelPrefix: 'Bayrak', sources: FLAG_AVATARS },
  { id: 'football-teams', title: 'Takım', icon: 'fa-futbol', labelPrefix: 'Takım', sources: FOOTBALL_TEAM_AVATARS },
  { id: 'male-profile', title: 'Erkek Profil', icon: 'fa-user', labelPrefix: 'Erkek Profil', sources: MALE_PROFILE_AVATARS },
  { id: 'female-profile', title: 'Kız Profil', icon: 'fa-user', labelPrefix: 'Kız Profil', sources: FEMALE_PROFILE_AVATARS },
  { id: 'marvel-players', title: 'Film Karakterleri', icon: 'fa-mask', labelPrefix: 'Film Karakteri', sources: MARVEL_PLAYER_AVATARS },
  { id: 'emoji-anonymous', title: 'Emoji / Anonymous', icon: 'fa-user-secret', labelPrefix: 'Emoji Anonymous', sources: EMOJI_ANONYMOUS_AVATARS },
  { id: 'flowers', title: 'Çiçek', icon: 'fa-spa', labelPrefix: 'Çiçek', sources: FLOWER_AVATARS },
]);

export const AVATAR_CATEGORIES = Object.freeze(
  CATEGORY_DEFINITIONS.map((category) => Object.freeze({
    id: category.id,
    title: category.title,
    icon: category.icon,
    items: Object.freeze(normalizeCategoryItems(category)),
  })).filter((category) => category.items.length > 0)
);

export const AVATAR_ITEMS = Object.freeze(AVATAR_CATEGORIES.flatMap((category) => category.items));
export const AVATARS = Object.freeze(AVATAR_ITEMS.map((item) => item.src));
export const DEFAULT_AVATAR = AVATARS[0] || AVATAR_FALLBACK;

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
