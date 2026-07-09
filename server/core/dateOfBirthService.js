'use strict';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeBirthDate(value = '') {
  const raw = String(value || '').trim();
  const match = DATE_RE.exec(raw);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  const todayIstanbul = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const [todayYear, todayMonth, todayDay] = todayIstanbul.split('-').map(Number);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  if (date.getTime() > todayUtc) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validateBirthDate(value = '') {
  const birthDate = normalizeBirthDate(value);
  return birthDate
    ? { ok: true, birthDate }
    : { ok: false, birthDate: '', error: 'BIRTH_DATE_INVALID', message: 'Geçerli bir doğum tarihi seçmelisin.' };
}

function formatBirthDateTr(value = '') {
  const normalized = normalizeBirthDate(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

module.exports = { normalizeBirthDate, validateBirthDate, formatBirthDateTr };
