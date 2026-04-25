'use strict';

const { cleanStr, safeNum, nowMs } = require('./helpers');

function restrictionSnapshot(user = {}, ts = nowMs()) {
  const now = safeNum(ts, nowMs());
  const gamesUntil = safeNum(user.gamesRestrictedUntil, 0);
  const globalUntil = safeNum(user.globalChatMutedUntil, 0);
  const dmUntil = safeNum(user.dmChatMutedUntil, 0);
  const banned = !!user.isBanned;
  const muted = !!user.isMuted;
  return {
    now,
    isBanned: banned,
    gamesBlocked: banned || gamesUntil > now,
    gamesRestrictedUntil: gamesUntil,
    globalChatBlocked: banned || muted || globalUntil > now,
    globalChatMutedUntil: globalUntil,
    dmBlocked: banned || muted || dmUntil > now,
    dmChatMutedUntil: dmUntil,
    reason: cleanStr(user.moderationReason || '', 500)
  };
}

function assertGamesAllowed(user = {}, message = 'Oyun erişiminiz geçici olarak kısıtlandı.') {
  const snap = restrictionSnapshot(user);
  if (snap.gamesBlocked) {
    const error = new Error(snap.isBanned ? 'Hesabınız tüm oyunlara kapatıldı.' : message);
    error.code = snap.isBanned ? 'ACCOUNT_BANNED' : 'GAMES_RESTRICTED';
    error.restrictions = snap;
    throw error;
  }
  return snap;
}

function formatRestrictionMessage(type = 'global', user = {}) {
  const snap = restrictionSnapshot(user);
  if (snap.isBanned) return 'Hesabınız kullanıma kapatıldı.';
  if (type === 'games' && snap.gamesBlocked) return 'Oyun erişiminiz geçici olarak kısıtlandı.';
  if (type === 'dm' && snap.dmBlocked) return 'DM gönderiminiz geçici olarak kısıtlandı.';
  if (type === 'global' && snap.globalChatBlocked) return 'Global sohbet erişiminiz geçici olarak kısıtlandı.';
  return 'Erişiminiz kısıtlandı.';
}

module.exports = {
  restrictionSnapshot,
  assertGamesAllowed,
  formatRestrictionMessage
};
