'use strict';

const { ACTIVITY_RESET_TIMEZONE } = require('../config/constants');

function getActivityCalendarParts(date = new Date(), timezone = ACTIVITY_RESET_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  const year = Number(parts.year || date.getUTCFullYear());
  const month = Number(parts.month || (date.getUTCMonth() + 1));
  const day = Number(parts.day || date.getUTCDate());

  return {
    year,
    month,
    day,
    periodKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
  };
}

function getPreviousActivityPeriodKey(currentPeriodKey = '') {
  const raw = String(currentPeriodKey || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return raw;

  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month <= 0) {
    year -= 1;
    month = 12;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function normalizePeriodClaimMap(rawValue, currentPeriodKey = '') {
  const claimed = rawValue && typeof rawValue === 'object' ? { ...rawValue } : {};
  const claimedPeriodKey = String(claimed.__periodKey || '').trim();
  if (!currentPeriodKey || !claimedPeriodKey || claimedPeriodKey === currentPeriodKey) return claimed;
  return { __periodKey: currentPeriodKey };
}

module.exports = {
  getActivityCalendarParts,
  getPreviousActivityPeriodKey,
  normalizePeriodClaimMap
};
