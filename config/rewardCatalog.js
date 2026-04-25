'use strict';

const REWARD_POLICY_VERSION = 3;

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
  pisti_reward: 'pisti_online_win',
  classic_score_xp: 'classic_score_progress',
  classic_progress: 'classic_score_progress',
  crash_spend_xp: 'crash_spend_progress',
  pisti_spend_xp: 'pisti_spend_progress',
  admin_bulk_reward: 'admin_bulk_grant',
  admin_reward_all: 'admin_bulk_grant'
});

const REWARD_VALUES = Object.freeze({
  signup: 50000,
  emailVerify: 100000,
  referralInviter: 50000,
  referralInvitee: 10000,
  monthlyActiveLadder: Object.freeze([50000, 20000, 10000, 5000, 2500]),
  chessWin: 5000,
  wheelMin: 2500,
  wheelMax: 50000
});

const REWARD_CATALOG = Object.freeze({
  signup_reward: Object.freeze({
    source: 'signup_reward',
    label: 'Kayıt Ödülü',
    category: 'account',
    currency: 'MC',
    grantType: 'fixed',
    amount: REWARD_VALUES.signup,
    cadence: 'once',
    visibility: 'public',
    description: 'Yeni hesap açan oyuncuya verilen başlangıç bakiyesi.',
    order: 10,
    badgeTone: 'success',
    notificationTitle: 'Hoş geldin ödülü',
    notificationTemplate: (amountLabel) => `Kayıt bonusu olarak ${amountLabel} hesabına eklendi.`
  }),
  email_verify_reward: Object.freeze({
    source: 'email_verify_reward',
    label: 'E-posta Doğrulama',
    category: 'account',
    currency: 'MC',
    grantType: 'fixed',
    amount: REWARD_VALUES.emailVerify,
    cadence: 'once',
    visibility: 'public',
    description: 'E-posta doğrulamasını tamamlayan hesaba tek seferlik verilir.',
    order: 20,
    badgeTone: 'success',
    notificationTitle: 'E-posta doğrulama ödülü',
    notificationTemplate: (amountLabel) => `E-posta onayı için ${amountLabel} hesabına eklendi.`
  }),
  wheel_spin: Object.freeze({
    source: 'wheel_spin',
    label: 'Günlük Çark',
    category: 'daily',
    currency: 'MC',
    grantType: 'range',
    amountMin: REWARD_VALUES.wheelMin,
    amountMax: REWARD_VALUES.wheelMax,
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
    amount: REWARD_VALUES.referralInviter,
    cadence: 'per_referral',
    visibility: 'public',
    description: 'Arkadaşını sisteme getiren oyuncuya verilen bonus.',
    order: 50,
    badgeTone: 'success',
    notificationTitle: 'Davet ödülü',
    notificationTemplate: (amountLabel) => `Bir oyuncu davet kodunu kullandı. ${amountLabel} hesabına eklendi.`
  }),
  referral_invitee: Object.freeze({
    source: 'referral_invitee',
    label: 'Davet Katılım Bonusu',
    category: 'social',
    currency: 'MC',
    grantType: 'fixed',
    amount: REWARD_VALUES.referralInvitee,
    cadence: 'per_referral',
    visibility: 'public',
    description: 'Doğrulanan hesapla davet kodu kullanan oyuncuya verilen hoş geldin desteği.',
    order: 60,
    badgeTone: 'accent',
    notificationTitle: 'Davet hoş geldin ödülü',
    notificationTemplate: (amountLabel) => `${amountLabel} hesabına eklendi.`
  }),
  monthly_active_reward: Object.freeze({
    source: 'monthly_active_reward',
    label: 'Aylık Aktiflik',
    category: 'activity',
    currency: 'MC',
    grantType: 'ladder',
    ladder: REWARD_VALUES.monthlyActiveLadder,
    cadence: 'monthly',
    visibility: 'public',
    description: "Her aylık dönem kapanışında aylık aktiflik tablosunda ilk 5'e giren kullanıcılara dağıtılır.",
    order: 70,
    badgeTone: 'warning',
    notificationTitle: 'Aylık aktiflik ödülü',
    notificationTemplate: (amountLabel, meta = {}) => `${meta.monthKey || 'İlgili dönem'} dönemi için ${amountLabel} hesabına eklendi.`
  }),
  activity_pass: Object.freeze({
    source: 'activity_pass',
    label: 'Activity Pass',
    category: 'progression',
    currency: 'MC',
    grantType: 'tiered',
    cadence: 'monthly',
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
    amount: REWARD_VALUES.chessWin,
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
    grantType: 'pot_based',
    cadence: 'per_match',
    visibility: 'public',
    description: 'Online Pişti galibiyetlerinde oda havuzundan dağıtılan ödül.',
    order: 100,
    badgeTone: 'success'
  }),
  classic_score_progress: Object.freeze({
    source: 'classic_score_progress',
    label: 'Klasik Oyun XP',
    category: 'progression',
    currency: 'XP',
    grantType: 'score_based',
    cadence: 'per_valid_run',
    visibility: 'private',
    description: 'Klasik oyun skor gönderimlerinden kazanılan hesap XP, exact XP progression ve audit ledger kaydı.' ,
    order: 105,
    badgeTone: 'accent'
  }),
  crash_spend_progress: Object.freeze({
    source: 'crash_spend_progress',
    label: 'Crash XP',
    category: 'progression',
    currency: 'XP',
    grantType: 'spend_based',
    cadence: 'per_bet',
    visibility: 'private',
    description: 'Crash harcama tabanlı hesap XP, exact XP progression ve audit ledger kaydı.' ,
    order: 106,
    badgeTone: 'accent'
  }),
  pisti_spend_progress: Object.freeze({
    source: 'pisti_spend_progress',
    label: 'Pişti XP',
    category: 'progression',
    currency: 'XP',
    grantType: 'spend_based',
    cadence: 'per_round',
    visibility: 'private',
    description: 'Pişti harcama tabanlı hesap XP, exact XP progression ve audit ledger kaydı.' ,
    order: 107,
    badgeTone: 'accent'
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
  }),
  admin_bulk_grant: Object.freeze({
    source: 'admin_bulk_grant',
    label: 'Toplu Yönetici Ödülü',
    category: 'ops',
    currency: 'MC',
    grantType: 'manual_bulk',
    cadence: 'manual',
    visibility: 'private',
    description: 'Yönetici panelinden tüm kullanıcılara idempotent toplu ödül olarak tanımlanır.',
    order: 111,
    badgeTone: 'warning'
  })
});

function formatFixedAmountLabel(amount = 0, currency = 'MC') {
  const safeAmount = Number(amount || 0) || 0;
  return `${safeAmount.toLocaleString('tr-TR')} ${currency || 'MC'}`;
}

function canonicalizeRewardSource(source = '') {
  const raw = String(source || '').trim().toLowerCase();
  if (!raw) return 'reward';
  return REWARD_SOURCE_ALIASES[raw] || raw;
}

function getRewardDefinition(source = '') {
  const key = canonicalizeRewardSource(source);
  return REWARD_CATALOG[key] || null;
}

function getRewardAmount(source = '', fallback = 0) {
  const definition = getRewardDefinition(source);
  const amount = Number(definition?.amount || 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : (Number(fallback || 0) || 0);
}

function getRewardLadder(source = '', fallback = []) {
  const definition = getRewardDefinition(source);
  const ladder = Array.isArray(definition?.ladder) ? definition.ladder : fallback;
  return ladder.map((amount) => Number(amount || 0) || 0).filter((amount) => amount >= 0);
}

function buildRewardGrantMessage(source = '', options = {}) {
  const definition = getRewardDefinition(source) || {};
  const resolvedAmount = Number.isFinite(Number(options.amount)) ? Number(options.amount) : getRewardAmount(source, 0);
  const currency = options.currency || definition.currency || 'MC';
  const amountLabel = formatFixedAmountLabel(resolvedAmount, currency);
  const title = options.title || definition.notificationTitle || definition.label || 'Ödül';
  const template = typeof definition.notificationTemplate === 'function'
    ? definition.notificationTemplate
    : ((label) => `${label} hesabına eklendi.`);
  return {
    source: definition.source || canonicalizeRewardSource(source),
    title,
    amount: resolvedAmount,
    amountLabel,
    body: template(amountLabel, options.meta || {}, definition),
    currency
  };
}

function buildRewardFlowOverview(options = {}) {
  const verified = !!options.verified;
  const disposableEmail = !!options.disposableEmail;
  const signup = getRewardDefinition('signup_reward') || {};
  const email = getRewardDefinition('email_verify_reward') || {};
  const wheel = getRewardDefinition('wheel_spin') || {};
  const promo = getRewardDefinition('promo_code') || {};
  const referral = getRewardDefinition('referral_inviter') || {};
  const referralInvitee = getRewardDefinition('referral_invitee') || {};
  const monthlyActive = getRewardDefinition('monthly_active_reward') || {};
  const signupLabel = formatFixedAmountLabel(signup.amount, signup.currency || 'MC');
  const emailLabel = formatFixedAmountLabel(email.amount, email.currency || 'MC');
  const referralInviterLabel = formatFixedAmountLabel(referral.amount, referral.currency || 'MC');
  const referralInviteeLabel = formatFixedAmountLabel(referralInvitee.amount, referralInvitee.currency || 'MC');
  const registrationFlowLabel = `${signupLabel} + ${emailLabel}`;
  const pendingSummary = disposableEmail
    ? 'Kayıt bonusu anında tanımlanır. Geçici e-posta ile doğrulama ödülü açılmaz. Günlük çark ve promosyon merkezi doğrulanan hesaplarda aktiftir.'
    : `Kayıt bonusu anında tanımlanır. E-posta doğrulamasından sonra ${emailLabel}, günlük çark ve promosyon merkezi açılır.`;
  const verifiedSummary = disposableEmail
    ? 'Kayıt bonusu aktif. Geçici e-posta nedeniyle doğrulama ödülü kapalı. Günlük çark ve promosyon merkezi açık.'
    : 'E-posta doğrulandı. Günlük çark, promo merkezi ve davet akışı aktif.';

  return {
    signupAmount: Number(signup.amount || 0) || 0,
    emailVerifyAmount: Number(email.amount || 0) || 0,
    signupLabel,
    emailVerifyLabel: emailLabel,
    registrationFlowLabel,
    rewardFlowBadge: verified ? 'Çark + Promo Aktif' : registrationFlowLabel,
    rewardFlowMeta: verified ? verifiedSummary : pendingSummary,
    verified,
    disposableEmail,
    wheel: {
      cadence: wheel.cadence || '24h',
      label: wheel.label || 'Günlük Çark',
      amountMin: Number(wheel.amountMin || 0) || 0,
      amountMax: Number(wheel.amountMax || 0) || 0,
      summaryLabel: wheel.amountMin || wheel.amountMax
        ? `${formatFixedAmountLabel(wheel.amountMin || 0, wheel.currency || 'MC')} - ${formatFixedAmountLabel(wheel.amountMax || 0, wheel.currency || 'MC')}`
        : ''
    },
    promo: {
      cadence: promo.cadence || 'campaign',
      label: promo.label || 'Promosyon Kodu'
    },
    referral: {
      inviterAmount: Number(referral.amount || 0) || 0,
      inviteeAmount: Number(referralInvitee.amount || 0) || 0,
      inviterLabel: referralInviterLabel,
      inviteeLabel: referralInviteeLabel,
      label: referral.label || 'Davet Eden Bonusu'
    },
    monthlyActive: {
      label: monthlyActive.label || 'Aylık Aktiflik',
      cadence: monthlyActive.cadence || 'monthly',
      ladder: Array.isArray(monthlyActive.ladder) ? monthlyActive.ladder.map((amount) => Number(amount || 0) || 0) : [],
      summaryLabel: Array.isArray(monthlyActive.ladder) && monthlyActive.ladder.length
        ? monthlyActive.ladder.map((amount, index) => `${index + 1}. ${formatFixedAmountLabel(amount, monthlyActive.currency || 'MC')}`).join(' · ')
        : ''
    }
  };
}

function listRewardCatalog({ includePrivate = true } = {}) {
  return Object.values(REWARD_CATALOG)
    .filter((item) => includePrivate || item.visibility !== 'private')
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function buildRewardCatalogSummary({ includePrivate = true } = {}) {
  const items = listRewardCatalog({ includePrivate });
  const categories = new Map();
  items.forEach((item) => {
    categories.set(item.category, (categories.get(item.category) || 0) + 1);
  });
  return {
    version: REWARD_POLICY_VERSION,
    total: items.length,
    itemCount: items.length,
    sources: items.map((item) => item.source),
    categoryCount: categories.size,
    categories: Array.from(categories.entries()).map(([key, count]) => ({ key, count })),
    fixedAmounts: {
      signup: REWARD_VALUES.signup,
      emailVerify: REWARD_VALUES.emailVerify,
      referralInviter: REWARD_VALUES.referralInviter,
      referralInvitee: REWARD_VALUES.referralInvitee
    },
    registrationFlow: buildRewardFlowOverview({ verified: false, disposableEmail: false })
  };
}

module.exports = {
  REWARD_POLICY_VERSION,
  REWARD_CATALOG,
  REWARD_VALUES,
  canonicalizeRewardSource,
  getRewardDefinition,
  getRewardAmount,
  getRewardLadder,
  listRewardCatalog,
  buildRewardCatalogSummary,
  buildRewardGrantMessage,
  formatFixedAmountLabel,
  buildRewardFlowOverview
};
