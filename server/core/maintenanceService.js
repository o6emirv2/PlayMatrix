'use strict';

const MAINTENANCE_KEYS = Object.freeze([
  'general', 'system', 'crash', 'chess', 'pisti', 'classic',
  'pattern-master', 'space-pro', 'snake-pro', 'market', 'wheel', 'promo'
]);

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'active', 'enabled', 'evet', 'aktif', 'açık', 'acik', 'bakim', 'bakım']);
const FALSE_VALUES = new Set(['', '0', 'false', 'no', 'off', 'inactive', 'disabled', 'hayir', 'hayır', 'pasif', 'kapali', 'kapalı', 'null', 'undefined']);

function normalizeMaintenanceFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'active')) return normalizeMaintenanceFlag(value.active);
    if (Object.prototype.hasOwnProperty.call(value, 'enabled')) return normalizeMaintenanceFlag(value.enabled);
    if (Object.prototype.hasOwnProperty.call(value, 'maintenance')) return normalizeMaintenanceFlag(value.maintenance);
    return false;
  }
  const normalized = String(value).trim().toLocaleLowerCase('tr-TR');
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  return false;
}

function unwrapMaintenanceSource(data = {}) {
  if (!data || typeof data !== 'object') return {};
  if (data.games && typeof data.games === 'object') return data.games;
  if (data.maintenance && typeof data.maintenance === 'object') return data.maintenance;
  return data;
}

function normalizeMaintenanceGames(data = {}) {
  const source = unwrapMaintenanceSource(data);
  const result = {};
  for (const key of MAINTENANCE_KEYS) result[key] = normalizeMaintenanceFlag(source[key]);
  return result;
}

function normalizeGameSlug(value = '') {
  const raw = decodeURIComponent(String(value || '')).toLocaleLowerCase('tr-TR');
  if (/crash/.test(raw)) return 'crash';
  if (/chess|satranc|satranç/.test(raw)) return 'chess';
  if (/pisti|pişti/.test(raw)) return 'pisti';
  if (/snake/.test(raw)) return 'snake-pro';
  if (/space/.test(raw)) return 'space-pro';
  if (/pattern/.test(raw)) return 'pattern-master';
  return '';
}

function isGameMaintenanceActive(games = {}, gameKey = '') {
  const normalized = normalizeMaintenanceGames(games);
  const key = normalizeGameSlug(gameKey) || String(gameKey || '').toLocaleLowerCase('tr-TR');
  if (normalized.general || normalized.system) return true;
  if (normalized[key]) return true;
  return normalized.classic && ['pattern-master', 'space-pro', 'snake-pro'].includes(key);
}

function areGamesEnabled(games = {}) {
  const normalized = normalizeMaintenanceGames(games);
  const gameKeys = ['general', 'system', 'crash', 'chess', 'pisti', 'classic', 'pattern-master', 'space-pro', 'snake-pro'];
  return !gameKeys.some((key) => normalized[key]);
}

module.exports = {
  MAINTENANCE_KEYS,
  normalizeMaintenanceFlag,
  normalizeMaintenanceGames,
  normalizeGameSlug,
  isGameMaintenanceActive,
  areGamesEnabled
};
