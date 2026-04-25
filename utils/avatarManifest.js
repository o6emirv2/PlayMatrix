'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.resolve(__dirname, '..', 'public', 'data', 'avatar-manifest.json');

function readManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return {
      version: 0,
      mode: 'link',
      fallback: '/assets/avatars/system/fallback.svg',
      defaultAvatar: '/assets/avatars/system/fallback.svg',
      allowedRemoteHosts: [],
      avatars: [],
      categories: []
    };
  }
}

const manifest = readManifest();
const AVATAR_FALLBACK = String(manifest.fallback || '/assets/avatars/system/fallback.svg');
const DEFAULT_AVATAR = String(manifest.defaultAvatar || AVATAR_FALLBACK);
const ALLOWED_REMOTE_HOSTS = Object.freeze(Array.isArray(manifest.allowedRemoteHosts) ? manifest.allowedRemoteHosts : []);
const AVATAR_SET = new Set(Array.isArray(manifest.avatars) ? manifest.avatars : []);
AVATAR_SET.add(AVATAR_FALLBACK);

const LOCAL_AVATAR_PATH = /^\/assets\/avatars\/[a-zA-Z0-9_\-/]+\.(png|jpe?g|webp|svg)$/i;

function toSafeString(value = '') {
  return String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

function normalizeLocalAvatarPath(value = '') {
  const raw = toSafeString(value);
  if (!raw) return '';
  const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\.\//, '')}`;
  if (!LOCAL_AVATAR_PATH.test(normalized)) return '';
  return normalized.replace(/\/+/g, '/');
}

function normalizeRemoteAvatarUrl(value = '') {
  const raw = toSafeString(value);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    if (!ALLOWED_REMOTE_HOSTS.includes(parsed.hostname)) return '';
    return parsed.href;
  } catch (_) {
    return '';
  }
}

function normalizeAvatarUrl(value = '', fallback = DEFAULT_AVATAR) {
  const raw = toSafeString(value);
  const fallbackValue = fallback === null ? '' : toSafeString(fallback);
  if (!raw) return fallbackValue;

  const local = normalizeLocalAvatarPath(raw);
  if (local) return local;

  const remote = normalizeRemoteAvatarUrl(raw);
  if (remote) return remote;

  return fallbackValue;
}

function isAllowedAvatarValue(value = '') {
  const normalized = normalizeAvatarUrl(value, '');
  return !!normalized && AVATAR_SET.has(normalized);
}

function sanitizeAvatarForStorage(value = '') {
  const normalized = normalizeAvatarUrl(value, '');
  if (!normalized) return '';
  return AVATAR_SET.has(normalized) ? normalized : '';
}

function getAvatarManifestSummary() {
  return Object.freeze({
    version: manifest.version || 0,
    mode: manifest.mode || 'link',
    categoryCount: Array.isArray(manifest.categories) ? manifest.categories.length : 0,
    avatarCount: AVATAR_SET.size,
    fallback: AVATAR_FALLBACK,
    defaultAvatar: DEFAULT_AVATAR
  });
}

module.exports = {
  AVATAR_FALLBACK,
  DEFAULT_AVATAR,
  ALLOWED_REMOTE_HOSTS,
  normalizeAvatarUrl,
  isAllowedAvatarValue,
  sanitizeAvatarForStorage,
  getAvatarManifestSummary
};
