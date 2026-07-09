'use strict';

const TRUE_VALUES = new Set(['1', 'true', 'on', 'active', 'enabled', 'evet', 'yes']);
const FALSE_VALUES = new Set(['', '0', 'false', 'off', 'pasif', 'inactive', 'disabled', 'hayır', 'hayir', 'no', 'null', 'undefined']);

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  const normalized = String(value).trim().toLocaleLowerCase('tr-TR');
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return !!fallback;
}

function normalizeBooleanMap(input = {}, keys = [], fallback = false) {
  const source = input && typeof input === 'object' ? input : {};
  return keys.reduce((output, key) => {
    output[key] = normalizeBoolean(source[key], fallback);
    return output;
  }, {});
}

module.exports = { normalizeBoolean, normalizeBooleanMap, TRUE_VALUES, FALSE_VALUES };
