'use strict';

const { cleanStr, safeNum, nowMs } = require('./helpers');

function formatRelativeWindow(timestamp = 0, now = nowMs()) {
  const value = safeNum(timestamp, 0);
  if (!value) return 'Kayıt yok';
  const delta = Math.max(0, now - value);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return 'Bu hafta';
}

function buildFriendNotesDigest(friends = []) {
  const items = (Array.isArray(friends) ? friends : [])
    .filter((item) => cleanStr(item?.note || '', 180))
    .map((item) => ({
      uid: cleanStr(item?.uid || '', 160),
      username: cleanStr(item?.username || 'Oyuncu', 40) || 'Oyuncu',
      note: cleanStr(item?.note || '', 180),
      pinned: !!item?.pinned,
      online: !!item?.online,
      updatedAt: safeNum(item?.lastPlayedAt || item?.lastSeen, 0)
    }))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Number(!!b.online) - Number(!!a.online) || (b.updatedAt - a.updatedAt));
  return {
    total: items.length,
    highlighted: items.slice(0, 6),
    summaryLabel: items.length ? `${items.length} arkadaş notu kayıtlı` : 'Arkadaş notu kaydı yok'
  };
}

function buildLastPlayedTogether(friends = [], recentPlayers = [], recentMatches = []) {
  const recentPlayerMap = new Map((Array.isArray(recentPlayers) ? recentPlayers : []).map((item) => [cleanStr(item?.uid || '', 160), item]));
  const items = (Array.isArray(friends) ? friends : [])
    .map((friend) => {
      const uid = cleanStr(friend?.uid || '', 160);
      const recent = recentPlayerMap.get(uid) || {};
      const lastPlayedAt = safeNum(friend?.lastPlayedAt || recent?.lastPlayedAt || 0, 0);
      return {
        uid,
        username: cleanStr(friend?.username || recent?.username || 'Oyuncu', 40) || 'Oyuncu',
        lastPlayedAt,
        lastPlayedLabel: formatRelativeWindow(lastPlayedAt),
        online: !!friend?.online,
        favoriteGame: cleanStr(recent?.favoriteGame || '', 24),
        seasonRp: safeNum(friend?.seasonRp || recent?.seasonRp, 0)
      };
    })
    .filter((item) => item.uid && item.lastPlayedAt > 0)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
    .slice(0, 6);
  const matchCount = Array.isArray(recentMatches) ? recentMatches.length : 0;
  return {
    items,
    summaryLabel: items.length ? `Son ${items.length} eşleşme görünür` : 'Henüz birlikte oynanan maç görünmüyor',
    matchCount
  };
}

function buildPartyVoiceSummary(partyVoice = {}, party = null) {
  const enabled = partyVoice?.enabled !== false;
  const roomId = cleanStr(partyVoice?.roomId || party?.id || '', 160);
  return {
    enabled,
    provider: cleanStr(partyVoice?.provider || 'placeholder', 24) || 'placeholder',
    roomId,
    status: cleanStr(partyVoice?.status || (party ? 'ready' : 'idle'), 24) || 'idle',
    label: cleanStr(partyVoice?.label || (party ? 'Parti ses odası hazır' : 'Parti kurulduğunda ses alanı görünür'), 120),
    summaryLabel: enabled ? (party ? 'Parti ses alanı hazır' : 'Parti sesi etkin, oda bekliyor') : 'Parti sesi kapalı'
  };
}

function buildUnifiedNotificationsCenter(notifications = [], context = {}) {
  const baseItems = (Array.isArray(notifications) ? notifications : []).slice(0, 12).map((item) => ({
    id: cleanStr(item?.id || '', 180),
    type: cleanStr(item?.type || 'system', 40) || 'system',
    title: cleanStr(item?.title || 'Bildirim', 140) || 'Bildirim',
    body: cleanStr(item?.body || '', 240),
    createdAt: safeNum(item?.createdAt || item?.timestamp, 0),
    read: item?.read === true,
    source: 'notifications'
  }));
  const derived = [];
  const inviteCenter = context?.inviteCenter || {};
  if (safeNum(inviteCenter?.pendingCount, 0) > 0) {
    derived.push({
      id: 'derived-invite-pending',
      type: 'invite',
      title: 'Bekleyen oyun davetleri',
      body: cleanStr(inviteCenter?.summaryLabel || 'Davetler yanıt bekliyor.', 240),
      createdAt: nowMs(),
      read: false,
      source: 'social'
    });
  }
  const partyCenter = context?.partyCenter || {};
  if (safeNum(partyCenter?.counts?.incoming, 0) > 0 || safeNum(partyCenter?.counts?.outgoing, 0) > 0) {
    derived.push({
      id: 'derived-party-center',
      type: 'party',
      title: 'Parti merkezi aktif',
      body: cleanStr(partyCenter?.summaryLabel || 'Parti davetleri hareketli.', 240),
      createdAt: nowMs() - 1,
      read: false,
      source: 'social'
    });
  }
  const voice = context?.partyVoice || {};
  if (voice?.enabled) {
    derived.push({
      id: 'derived-party-voice',
      type: 'voice',
      title: 'Parti sesi hazır',
      body: cleanStr(voice?.label || 'Parti ses alanı erişilebilir.', 240),
      createdAt: nowMs() - 2,
      read: true,
      source: 'voice'
    });
  }
  const items = [...derived, ...baseItems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
  const unreadCount = items.reduce((sum, item) => sum + (item.read ? 0 : 1), 0);
  const categories = Array.from(new Set(items.map((item) => item.type).filter(Boolean)));
  return {
    unreadCount,
    items,
    categories,
    summaryLabel: unreadCount ? `${unreadCount} okunmamış / aksiyon gereken bildirim` : 'Bildirim merkezi temiz',
    actions: {
      hasUnread: unreadCount > 0,
      hasParty: items.some((item) => item.type === 'party'),
      hasInvite: items.some((item) => item.type === 'invite'),
      hasVoice: items.some((item) => item.type === 'voice')
    }
  };
}

function buildSocialHubSnapshot(payload = {}) {
  const friends = Array.isArray(payload?.friends) ? payload.friends : [];
  const recentPlayers = Array.isArray(payload?.recentPlayers) ? payload.recentPlayers : [];
  const recentMatches = Array.isArray(payload?.recentMatches) ? payload.recentMatches : [];
  const notificationsCenter = buildUnifiedNotificationsCenter(payload?.notifications || [], payload);
  const notes = buildFriendNotesDigest(friends);
  const lastPlayedTogether = buildLastPlayedTogether(friends, recentPlayers, recentMatches);
  const partyVoice = buildPartyVoiceSummary(payload?.partyVoice || {}, payload?.party || null);
  const pinnedFriends = friends.filter((item) => item?.pinned).slice(0, 6).map((item) => ({
    uid: cleanStr(item?.uid || '', 160),
    username: cleanStr(item?.username || 'Oyuncu', 40) || 'Oyuncu',
    online: !!item?.online,
    note: cleanStr(item?.note || '', 180),
    lastPlayedAt: safeNum(item?.lastPlayedAt, 0),
    lastPlayedLabel: formatRelativeWindow(item?.lastPlayedAt)
  }));
  return {
    pinnedFriends,
    notes,
    lastPlayedTogether,
    partyVoice,
    notificationsCenter,
    overview: {
      friendCount: friends.length,
      pinnedCount: pinnedFriends.length,
      noteCount: notes.total,
      onlineCount: friends.filter((item) => item?.online).length,
      summaryLabel: `${friends.length} arkadaş · ${notes.total} not · ${notificationsCenter.unreadCount} bildirim`
    }
  };
}

module.exports = {
  formatRelativeWindow,
  buildFriendNotesDigest,
  buildLastPlayedTogether,
  buildPartyVoiceSummary,
  buildUnifiedNotificationsCenter,
  buildSocialHubSnapshot
};
