'use strict';

const REWARD_SOURCE_ALIASES = Object.freeze({
  signup_bonus: 'signup_reward',
  email_reward: 'email_verify_reward',
  email_verification_reward: 'email_verify_reward',
  wheel_reward: 'wheel_spin',
  referral_reward: 'referral_inviter',
  referral_bonus: 'referral_inviter',
  referral_inviter_bonus: 'referral_inviter',
  referral_invitee_bonus: 'referral_invitee',
  monthly_reward: 'monthly_active_reward',
  activity_pass_reward: 'activity_pass',
  chess_disconnect_win: 'chess_win',
  chess_leave_win: 'chess_win',
  chess_resign_win: 'chess_win',
  chess_reward: 'chess_win',
  pisti_room_reward: 'pisti_online_win',
  pisti_disconnect_win: 'pisti_online_win',
  pisti_reward: 'pisti_online_win'
});

const REWARD_CATALOG = Object.freeze({
  signup_reward: Object.freeze({
    source: 'signup_reward',
    label: 'Kayıt Ödülü',
    category: 'account',
    currency: 'MC',
    grantType: 'fixed',
    amount: 50000,
    cadence: 'once',
    visibility: 'public',
    description: 'Yeni hesap açan oyuncuya verilen başlangıç bakiyesi.',
    order: 10,
    badgeTone: 'success'
  }),
  email_verify_reward: Object.freeze({
    source: 'email_verify_reward',
    label: 'E-posta Doğrulama',
    category: 'account',
    currency: 'MC',
    grantType: 'fixed',
    amount: 100000,
    cadence: 'once',
    visibility: 'public',
    description: 'E-posta doğrulamasını tamamlayan hesaba tek seferlik verilir.',
    order: 20,
    badgeTone: 'success'
  }),
  wheel_spin: Object.freeze({
    source: 'wheel_spin',
    label: 'Günlük Çark',
    category: 'daily',
    currency: 'MC',
    grantType: 'range',
    amountMin: 2500,
    amountMax: 50000,
    wheelPool: Object.freeze([2500, 5000, 7500, 12500, 20000, 25000, 30000, 50000]),
    cadence: '24h',
    visibility: 'public',
    description: '24 saatte bir çevrilen günlük çark ödülü.',
    order: 30,
    badgeTone: 'accent'
  }),
  promo_code: Object.freeze({
    source: 'promo_code',
    label: 'Promosyon Kodu',
    category: 'campaign',
    currency: 'MC',
    grantType: 'variable',
    cadence: 'campaign',
    visibility: 'public',
    description: 'Promosyon koduna göre değişen kampanya ödülü.',
    order: 40,
    badgeTone: 'accent'
  }),
  referral_inviter: Object.freeze({
    source: 'referral_inviter',
    label: 'Davet Eden Bonusu',
    category: 'social',
    currency: 'MC',
    grantType: 'fixed',
    amount: 50000,
    cadence: 'per_referral',
    visibility: 'public',
    description: 'Arkadaşını sisteme getiren oyuncuya verilen bonus.',
    order: 50,
    badgeTone: 'success'
  }),
  referral_invitee: Object.freeze({
    source: 'referral_invitee',
    label: 'Davet Katılım Bonusu',
    category: 'social',
    currency: 'MC',
    grantType: 'fixed',
    amount: 10000,
    cadence: 'per_referral',
    visibility: 'public',
    description: 'Davet bağlantısıyla gelen ve hesabını doğrulayan oyuncuya verilen hoş geldin bonusu.',
    order: 60,
    badgeTone: 'accent'
  }),
  monthly_active_reward: Object.freeze({
    source: 'monthly_active_reward',
    label: 'Aylık Aktiflik',
    category: 'season',
    currency: 'MC',
    grantType: 'ladder',
    ladder: [50000, 20000, 10000, 5000, 2500],
    cadence: 'monthly',
    visibility: 'public',
    description: "Aylık aktif oyuncu sıralamasında ilk 5'e giren kullanıcılara dağıtılır.",
    order: 70,
    badgeTone: 'warning'
  }),
  activity_pass: Object.freeze({
    source: 'activity_pass',
    label: 'Activity Pass',
    category: 'progression',
    currency: 'MC',
    grantType: 'tiered',
    cadence: 'seasonal',
    tiers: Object.freeze([
      Object.freeze({ level: 1, need: 10, rewardMc: 2500, badge: 'Başlangıç' }),
      Object.freeze({ level: 2, need: 25, rewardMc: 5000, badge: 'Aktif Oyuncu' }),
      Object.freeze({ level: 3, need: 50, rewardMc: 7500, badge: 'Sosyal Usta' }),
      Object.freeze({ level: 4, need: 80, rewardMc: 10000, badge: 'Sezon Koşucusu' }),
      Object.freeze({ level: 5, need: 120, rewardMc: 15000, badge: 'PlayMatrix Elite' })
    ]),
    visibility: 'public',
    description: 'Aylık aktiflik skoruna göre açılan seviye ödülleri.',
    order: 80,
    badgeTone: 'accent'
  }),
  chess_win: Object.freeze({
    source: 'chess_win',
    label: 'Satranç Galibiyeti',
    category: 'game',
    currency: 'MC',
    grantType: 'fixed',
    amount: 5000,
    cadence: 'daily_capped',
    dailyCap: 10,
    visibility: 'public',
    description: 'Satranç galibiyetlerinde verilen ödül. Günlük 10 galibiyet limiti vardır.',
    order: 90,
    badgeTone: 'success'
  }),
  pisti_online_win: Object.freeze({
    source: 'pisti_online_win',
    label: 'Online Pişti',
    category: 'game',
    currency: 'MC',
    grantType: 'variable',
    cadence: 'per_match',
    visibility: 'public',
    description: 'Masadaki toplam pot üzerinden rake düşülerek kazananlara dağıtılır.',
    formula: 'pot - %5 rake',
    order: 100,
    badgeTone: 'success'
  }),
  admin_manual_grant: Object.freeze({
    source: 'admin_manual_grant',
    label: 'Yönetici Ödülü',
    category: 'ops',
    currency: 'MC',
    grantType: 'manual',
    cadence: 'manual',
    visibility: 'private',
    description: 'Operasyon veya destek ekibi tarafından manuel tanımlanır.',
    order: 110,
    badgeTone: 'warning'
  })
});

function canonicalizeRewardSource(source = '') {
  const raw = String(source || '').trim().toLowerCase();
  if (!raw) return 'reward';
  return REWARD_SOURCE_ALIASES[raw] || raw;
}

function getRewardDefinition(source = '') {
  const key = canonicalizeRewardSource(source);
  return REWARD_CATALOG[key] || null;
}

function listRewardCatalog({ includePrivate = true } = {}) {
  return Object.values(REWARD_CATALOG)
    .filter((item) => includePrivate || item.visibility !== 'private')
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function buildRewardCatalogSummary({ includePrivate = true, items = null } = {}) {
  const safeItems = Array.isArray(items) ? items.slice() : listRewardCatalog({ includePrivate });
  const categories = new Map();
  const sources = [];
  safeItems.forEach((item) => {
    categories.set(item.category, (categories.get(item.category) || 0) + 1);
    sources.push(String(item?.source || '').trim());
  });
  return {
    total: safeItems.length,
    itemCount: safeItems.length,
    categoryCount: categories.size,
    categories: Array.from(categories.entries()).map(([key, count]) => ({ key, count })),
    sources: sources.filter(Boolean)
  };
}

module.exports = {
  REWARD_SOURCE_ALIASES,
  REWARD_CATALOG,
  canonicalizeRewardSource,
  getRewardDefinition,
  listRewardCatalog,
  buildRewardCatalogSummary
};
