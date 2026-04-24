'use strict';

const PORT = process.env.PORT || 3000;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://playmatrix.com.tr',
  'https://www.playmatrix.com.tr',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED_AVATAR_DOMAIN = "https://encrypted-tbn0.gstatic.com/";
const ALLOWED_AVATAR_DOMAINS = Object.freeze([
  ALLOWED_AVATAR_DOMAIN,
  "https://www.shutterstock.com/shutterstock/videos/"
]);
const ALLOWED_LOCAL_AVATAR_PATH = /^\/assets\/avatars\/[a-zA-Z0-9_\-/]+\.(png|jpe?g|webp|svg)$/i;
const DEFAULT_AVATAR_DATA_URI = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%20role%3D%27img%27%20aria-label%3D%27PlayMatrix%20Avatar%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27pmg%27%20x1%3D%270%27%20x2%3D%271%27%20y1%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%23111827%27%2F%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%231f2937%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27url%28%23pmg%29%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%20fill-opacity%3D%27.94%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%20fill-opacity%3D%27.92%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Inter%2CArial%2Csans-serif%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23f9fafb%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E';
const LOBBY_CHAT_RETENTION_DAYS = Math.max(1, Number(process.env.LOBBY_CHAT_RETENTION_DAYS || 7));
const DIRECT_CHAT_RETENTION_DAYS = Math.max(1, Number(process.env.DIRECT_CHAT_RETENTION_DAYS || 14));
const DIRECT_MESSAGE_EDIT_WINDOW_HOURS = Math.max(1, Number(process.env.DIRECT_MESSAGE_EDIT_WINDOW_HOURS || 24));
const DIRECT_MESSAGE_EDIT_WINDOW_MS = DIRECT_MESSAGE_EDIT_WINDOW_HOURS * 60 * 60 * 1000;
const CHAT_RETENTION_POLICY = Object.freeze({
  lobbyDays: LOBBY_CHAT_RETENTION_DAYS,
  directDays: DIRECT_CHAT_RETENTION_DAYS,
  lobbyLabel: `Global ${LOBBY_CHAT_RETENTION_DAYS} Gün`,
  directLabel: `DM ${DIRECT_CHAT_RETENTION_DAYS} Gün`,
  summaryLabel: `Global ${LOBBY_CHAT_RETENTION_DAYS} Gün · DM ${DIRECT_CHAT_RETENTION_DAYS} Gün`,
  manualDeleteLabel: 'Kullanıcı tarafından silindi',
  cleanupLabel: 'Saklama süresi dolduğu için temizlendi',
  lobbyDisclosure: `Global sohbet mesajları ${LOBBY_CHAT_RETENTION_DAYS} gün saklanır.`,
  directDisclosure: `Özel mesajlar ${DIRECT_CHAT_RETENTION_DAYS} gün saklanır.`,
  tombstoneDisclosure: 'Silinen mesajların içeriği boş gösterilir; manuel silme ve saklama süresi temizliği ayrı etiketlenir.',
  searchDisclosure: 'Mesaj arama silinmiş veya saklama süresi dolmuş mesaj içeriklerini sonuçlara dahil etmez.',
  editWindowLabel: `Özel mesajlar ilk ${DIRECT_MESSAGE_EDIT_WINDOW_HOURS} saat içinde düzenlenebilir.`,
  transparencyNote: 'Global ve DM saklama süreleri ayrı izlenir.',
  deleteModes: Object.freeze({
    manual: 'manual_delete',
    retention: 'retention_cleanup'
  }),
  editWindowHours: DIRECT_MESSAGE_EDIT_WINDOW_HOURS,
  directMessageMaxLength: 280,
  lobbyMessageMaxLength: 280,
});

const USERNAME_BAD_WORD_PATTERNS = [
  /amk/i, /aminakoy/i, /amina/i, /orospu/i, /siktir/i,
  /yarrak/i, /yarak/i, /pezevenk/i, /kahpe/i, /ibne/i,
  /pic/i, /gotveren/i
];

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
const SOCKET_PING_INTERVAL_MS = Math.max(15000, Number(process.env.SOCKET_PING_INTERVAL_MS || 25000));
const SOCKET_STALE_TIMEOUT_MS = Math.max(SOCKET_PING_INTERVAL_MS * 2, Number(process.env.SOCKET_STALE_TIMEOUT_MS || 70000));
const SOCKET_MEMORY_SWEEP_INTERVAL_MS = Math.max(30000, Number(process.env.SOCKET_MEMORY_SWEEP_INTERVAL_MS || 60000));
const PARTY_MEMBER_LIMIT = Math.max(2, Number(process.env.PARTY_MEMBER_LIMIT || 4));
const PARTY_INVITE_TTL_MS = Math.max(60 * 1000, Number(process.env.PARTY_INVITE_TTL_MS || 5 * 60 * 1000));
const PARTY_REMATCH_GRACE_MS = Math.max(60 * 1000, Number(process.env.PARTY_REMATCH_GRACE_MS || 15 * 60 * 1000));


const ACTIVITY_RESET_TIMEZONE = 'Europe/Istanbul';
const ACTIVITY_RESET_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MONTHLY_REWARD_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const ACTIVITY_RESET_WINDOW_HOURS = Math.max(1, Number(process.env.ACTIVITY_RESET_WINDOW_HOURS || 6));
const MONTHLY_REWARD_WINDOW_HOURS = Math.max(1, Number(process.env.MONTHLY_REWARD_WINDOW_HOURS || ACTIVITY_RESET_WINDOW_HOURS));
const MONTHLY_REWARD_PRIZES = Object.freeze([50000, 20000, 10000, 5000, 2500]);
const ACTIVITY_RESET_BATCH_LIMIT = 400;
const ACTIVITY_RESET_STALE_LOCK_MS = 2 * 60 * 60 * 1000;
const ACTIVITY_RESET_PAUSE_MS = 100;

const GAME_SETTLEMENT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
  ABANDONED: 'abandoned'
});

const GAME_RESULT_CODES = Object.freeze({
  CHESS_CHECKMATE_WIN: 'chess_checkmate_win',
  CHESS_DRAW: 'chess_draw',
  CHESS_DISCONNECT_WIN: 'chess_disconnect_win',
  CHESS_LEAVE_WIN: 'chess_leave_win',
  CHESS_RESIGN_WIN: 'chess_resign_win',
  CHESS_ABANDONED_DOUBLE_DISCONNECT: 'chess_abandoned_double_disconnect',
  CHESS_WAITING_CANCELLED: 'chess_waiting_cancelled',
  CRASH_BET_PLACED: 'crash_bet_placed',
  CRASH_CASHOUT_MANUAL: 'crash_cashout_manual',
  CRASH_CASHOUT_AUTO: 'crash_cashout_auto',
  CRASH_CRASHED_LOSS: 'crash_crashed_loss'
});

const CHESS_DISCONNECT_GRACE_MS = Math.max(30 * 1000, Number(process.env.CHESS_DISCONNECT_GRACE_MS || 90 * 1000));
const CHESS_RESULT_RETENTION_MS = Math.max(60 * 1000, Number(process.env.CHESS_RESULT_RETENTION_MS || 2 * 60 * 1000));

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
  DEFAULT_ALLOWED_ORIGINS,
  ALLOWED_ORIGINS,
  ALLOWED_AVATAR_DOMAIN,
  ALLOWED_AVATAR_DOMAINS,
  ALLOWED_LOCAL_AVATAR_PATH,
  DEFAULT_AVATAR_DATA_URI,
  LOBBY_CHAT_RETENTION_DAYS,
  DIRECT_CHAT_RETENTION_DAYS,
  DIRECT_MESSAGE_EDIT_WINDOW_HOURS,
  DIRECT_MESSAGE_EDIT_WINDOW_MS,
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
  SOCKET_PING_INTERVAL_MS,
  SOCKET_STALE_TIMEOUT_MS,
  SOCKET_MEMORY_SWEEP_INTERVAL_MS,
  PARTY_MEMBER_LIMIT,
  PARTY_INVITE_TTL_MS,
  PARTY_REMATCH_GRACE_MS,
  ACTIVITY_RESET_TIMEZONE,
  ACTIVITY_RESET_CHECK_INTERVAL_MS,
  MONTHLY_REWARD_CHECK_INTERVAL_MS,
  ACTIVITY_RESET_WINDOW_HOURS,
  MONTHLY_REWARD_WINDOW_HOURS,
  MONTHLY_REWARD_PRIZES,
  ACTIVITY_RESET_BATCH_LIMIT,
  ACTIVITY_RESET_STALE_LOCK_MS,
  ACTIVITY_RESET_PAUSE_MS,
  GAME_SETTLEMENT_STATUS,
  GAME_RESULT_CODES,
  CHESS_DISCONNECT_GRACE_MS,
  CHESS_RESULT_RETENTION_MS,
  CRASH_MIN_BET,
  CRASH_MIN_AUTO,
  CRASH_MAX_AUTO,
  CRASH_MAX_MULTIPLIER,
  CRASH_TICK_MS,
  CRASH_FULL_STATE_EVERY,
  AUTO_CASHOUT_BATCH_SIZE,
  AUTO_CASHOUT_RETRY_DELAY_MS
};