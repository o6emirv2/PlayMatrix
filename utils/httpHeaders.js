'use strict';

const CHAR_MAP = Object.freeze({
  'ı': 'i',
  'İ': 'I',
  'ğ': 'g',
  'Ğ': 'G',
  'ş': 's',
  'Ş': 'S',
  'ç': 'c',
  'Ç': 'C',
  'ö': 'o',
  'Ö': 'O',
  'ü': 'u',
  'Ü': 'U'
});

function transliterate(value = '') {
  return String(value == null ? '' : value).replace(/[ıİğĞşŞçÇöÖüÜ]/g, (char) => CHAR_MAP[char] || char);
}

function toSafeHeaderValue(value = '') {
  const raw = transliterate(value);
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^ -~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { toSafeHeaderValue };
