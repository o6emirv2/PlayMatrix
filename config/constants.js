// config/constants.js
'use strict';

// ---------------------------------------------------------
// SUNUCU & GÜVENLİK AYARLARI
// ---------------------------------------------------------
const PORT = process.env.PORT || 3000;

const FALLBACK_PUBLIC_BACKEND_ORIGIN = 'https://emirhan-siye.onrender.com';
const DEFAULT_PUBLIC_BACKEND_ORIGIN = (process.env.PUBLIC_BACKEND_ORIGIN || process.env.RENDER_EXTERNAL_URL || FALLBACK_PUBLIC_BACKEND_ORIGIN).trim();

const DEFAULT_ALLOWED_ORIGINS = [
  'https://playmatrix.com.tr',
  'https://www.playmatrix.com.tr',
  DEFAULT_PUBLIC_BACKEND_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED_AVATAR_DOMAIN = "https://encrypted-tbn0.gstatic.com/";
const ALLOWED_LOCAL_AVATAR_PATH = /^\/assets\/[a-zA-Z0-9_\-/]+\.(png|jpe?g|webp|gif|svg)$/i;
const DEFAULT_AVATAR_PATH = '/assets/default-avatar.png';
const LOBBY_CHAT_RETENTION_DAYS = Math.max(1, Number(process.env.LOBBY_CHAT_RETENTION_DAYS || 7));
const DIRECT_CHAT_RETENTION_DAYS = Math.max(1, Number(process.env.DIRECT_CHAT_RETENTION_DAYS || 14));
const CHAT_RETENTION_POLICY = Object.freeze({
  lobbyDays: LOBBY_CHAT_RETENTION_DAYS,
  directDays: DIRECT_CHAT_RETENTION_DAYS,
  lobbyLabel: `Global ${LOBBY_CHAT_RETENTION_DAYS} Gün`,
  directLabel: `DM ${DIRECT_CHAT_RETENTION_DAYS} Gün`,
  summaryLabel: `Global ${LOBBY_CHAT_RETENTION_DAYS} Gün · DM ${DIRECT_CHAT_RETENTION_DAYS} Gün`
});

const USERNAME_BAD_WORD_PATTERNS = [
  /amk/i, /aminakoy/i, /amina/i, /orospu/i, /siktir/i,
  /yarrak/i, /yarak/i, /pezevenk/i, /kahpe/i, /ibne/i,
  /pic/i, /gotveren/i
];

// ---------------------------------------------------------
// SOSYAL & SOHBET LİMİTLERİ
// ---------------------------------------------------------
const LOBBY_CHAT_MAX_LENGTH = 280;
const LOBBY_CHAT_HISTORY_LIMIT = 60;
const SOCKET_CHAT_WINDOW_MS = 10 * 1000;
const SOCKET_CHAT_MAX_PER_WINDOW = 6;
const SOCKET_DM_WINDOW_MS = 12 * 1000;
const SOCKET_DM_MAX_PER_WINDOW = 8;
const SOCKET_TYPING_WINDOW_MS = 8 * 1000;
const SOCKET_TYPING_MAX_PER_WINDOW = 24;
const SOCKET_INVITE_WINDOW_MS = 20 * 1000;
const SOCKET_INVITE_MAX_PER_WINDOW = 5;
const PRESENCE_GRACE_MS = 5000;

// ---------------------------------------------------------
// RP & SEZON SİSTEMİ
// ---------------------------------------------------------
const RP_TIERS = [
  { name: 'Bronze', min: 0, max: 999 },
  { name: 'Silver', min: 1000, max: 2999 },
  { name: 'Gold', min: 3000, max: 4999 },
  { name: 'Platinum', min: 5000, max: 9999 },
  { name: 'Diamond', min: 10000, max: 14999 },
  { name: 'Şampiyon', min: 15000, max: Number.POSITIVE_INFINITY }
];

const SEASON_RESET_TIMEZONE = 'Europe/Istanbul';
const SEASON_RESET_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MONTHLY_REWARD_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MONTHLY_REWARD_PRIZES = Object.freeze([50000, 20000, 10000, 5000, 2500]);
const MONTHLY_REWARD_VALUES = MONTHLY_REWARD_PRIZES;
const SEASON_RESET_BATCH_LIMIT = 400;
const SEASON_RESET_STALE_LOCK_MS = 2 * 60 * 60 * 1000;
const SEASON_RESET_PAUSE_MS = 100;

// ---------------------------------------------------------
// REKABETÇİ ELO SİSTEMİ
// ---------------------------------------------------------
const COMPETITIVE_ELO_DEFAULT = 1000;
const COMPETITIVE_ELO_FLOOR = 100;
const COMPETITIVE_ELO_K = 32;

// ---------------------------------------------------------
// OYUN: BLACKJACK
// ---------------------------------------------------------
const BJ_MAX_SPLITS = 3;
const BJ_STALE_SESSION_MS = 5 * 60 * 1000;
const BJ_SIDE_BET_DEFAULTS = Object.freeze({ bb: 0, t3: 0, pp: 0, c7: 0 });
const BJ_UI_BET_DEFAULTS = Object.freeze({ main: 0, bust: 0, '213': 0, perfect: 0, crazy7: 0 });
const BJ_SHOE_COUNT = 8;
const BJ_CUT_CARD_REMAINING = 104;

// ---------------------------------------------------------
// OYUN: CRASH
// ---------------------------------------------------------
const CRASH_MIN_BET = 1.00;
const CRASH_MIN_AUTO = 1.10;
const CRASH_MAX_AUTO = 100.00;
const CRASH_MAX_MULTIPLIER = 10000.00;
const CRASH_TICK_MS = 200;
const CRASH_FULL_STATE_EVERY = 3;
const AUTO_CASHOUT_BATCH_SIZE = 10;
const AUTO_CASHOUT_RETRY_DELAY_MS = 250;

module.exports = {
  PORT,
  FALLBACK_PUBLIC_BACKEND_ORIGIN,
  DEFAULT_PUBLIC_BACKEND_ORIGIN,
  DEFAULT_ALLOWED_ORIGINS,
  ALLOWED_ORIGINS,
  ALLOWED_AVATAR_DOMAIN,
  ALLOWED_LOCAL_AVATAR_PATH,
  DEFAULT_AVATAR_PATH,
  LOBBY_CHAT_RETENTION_DAYS,
  DIRECT_CHAT_RETENTION_DAYS,
  CHAT_RETENTION_POLICY,
  USERNAME_BAD_WORD_PATTERNS,
  LOBBY_CHAT_MAX_LENGTH,
  LOBBY_CHAT_HISTORY_LIMIT,
  SOCKET_CHAT_WINDOW_MS,
  SOCKET_CHAT_MAX_PER_WINDOW,
  SOCKET_DM_WINDOW_MS,
  SOCKET_DM_MAX_PER_WINDOW,
  SOCKET_TYPING_WINDOW_MS,
  SOCKET_TYPING_MAX_PER_WINDOW,
  SOCKET_INVITE_WINDOW_MS,
  SOCKET_INVITE_MAX_PER_WINDOW,
  PRESENCE_GRACE_MS,
  RP_TIERS,
  SEASON_RESET_TIMEZONE,
  SEASON_RESET_CHECK_INTERVAL_MS,
  MONTHLY_REWARD_CHECK_INTERVAL_MS,
  MONTHLY_REWARD_PRIZES,
  MONTHLY_REWARD_VALUES,
  SEASON_RESET_BATCH_LIMIT,
  SEASON_RESET_STALE_LOCK_MS,
  SEASON_RESET_PAUSE_MS,
  COMPETITIVE_ELO_DEFAULT,
  COMPETITIVE_ELO_FLOOR,
  COMPETITIVE_ELO_K,
  BJ_MAX_SPLITS,
  BJ_STALE_SESSION_MS,
  BJ_SIDE_BET_DEFAULTS,
  BJ_UI_BET_DEFAULTS,
  BJ_SHOE_COUNT,
  BJ_CUT_CARD_REMAINING,
  CRASH_MIN_BET,
  CRASH_MIN_AUTO,
  CRASH_MAX_AUTO,
  CRASH_MAX_MULTIPLIER,
  CRASH_TICK_MS,
  CRASH_FULL_STATE_EVERY,
  AUTO_CASHOUT_BATCH_SIZE,
  AUTO_CASHOUT_RETRY_DELAY_MS
};