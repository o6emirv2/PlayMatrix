'use strict';

const { CHAT_RETENTION_POLICY } = require('../config/constants');
const { safeNum } = require('./helpers');

const DIRECT_MESSAGE_EDIT_WINDOW_HOURS = 24;
const DIRECT_MESSAGE_EDIT_WINDOW_MS = DIRECT_MESSAGE_EDIT_WINDOW_HOURS * 60 * 60 * 1000;

function buildChatLifecycleSnapshot(policy = CHAT_RETENTION_POLICY) {
  const lobbyDays = Math.max(1, safeNum(policy?.lobbyDays, CHAT_RETENTION_POLICY.lobbyDays));
  const directDays = Math.max(1, safeNum(policy?.directDays, CHAT_RETENTION_POLICY.directDays));
  return {
    lobbyDays,
    directDays,
    lobbyLabel: `Global ${lobbyDays} Gün`,
    directLabel: `DM ${directDays} Gün`,
    summaryLabel: `Global ${lobbyDays} Gün · DM ${directDays} Gün`,
    directEditWindowHours: DIRECT_MESSAGE_EDIT_WINDOW_HOURS,
    directEditWindowMs: DIRECT_MESSAGE_EDIT_WINDOW_MS,
    deleteMode: 'soft_delete_then_retention_cleanup',
    cleanupMode: 'scheduled_cron_cleanup',
    notices: [
      `Global mesajlar ${lobbyDays} gün sonra otomatik temizlenir.`,
      `DM mesajları ${directDays} gün sonra otomatik temizlenir.`,
      `DM mesajları gönderildikten sonra ${DIRECT_MESSAGE_EDIT_WINDOW_HOURS} saat içinde düzenlenebilir.`
    ]
  };
}

module.exports = {
  DIRECT_MESSAGE_EDIT_WINDOW_HOURS,
  DIRECT_MESSAGE_EDIT_WINDOW_MS,
  buildChatLifecycleSnapshot
};
