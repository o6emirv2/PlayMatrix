'use strict';

const { SOCKET_INVITE_WINDOW_MS, SOCKET_INVITE_MAX_PER_WINDOW } = require('../config/constants');
const { cleanStr, nowMs, safeNum } = require('./helpers');

const PARTY_INVITE_TTL_MS = 5 * 60 * 1000;

function sanitizeInviteItem(item = {}, fallbackGameKey = 'invite', ts = nowMs()) {
  const expiresAt = safeNum(item.expiresAt, 0);
  const expiresInMs = Math.max(0, expiresAt - ts);
  const deliveryStatus = cleanStr(item.deliveryStatus || 'pending', 40) || 'pending';
  const closeReason = cleanStr(item.closeReason || '', 40);
  const statusMessage = cleanStr(item.statusMessage || '', 220);
  let stateLabel = 'Yanıt bekleniyor';
  if (deliveryStatus === 'queued_offline') stateLabel = 'Çevrimdışı sırada';
  else if (deliveryStatus === 'delivered_realtime') stateLabel = 'Gerçek zamanlı iletildi';
  else if (deliveryStatus === 'accepted') stateLabel = 'Kabul edildi';
  else if (deliveryStatus === 'declined') stateLabel = 'Reddedildi';
  else if (deliveryStatus === 'expired' || closeReason === 'expired' || closeReason === 'ttl_expired') stateLabel = 'Süresi doldu';
  else if (deliveryStatus === 'reused') stateLabel = 'Mevcut davet güncellendi';
  else if (deliveryStatus === 'synced') stateLabel = 'Senkronize edildi';
  const severity = deliveryStatus === 'queued_offline'
    ? 'warn'
    : deliveryStatus === 'expired' || closeReason === 'expired' || closeReason === 'ttl_expired'
      ? 'muted'
      : 'info';
  return {
    inviteId: cleanStr(item.id || item.inviteId || '', 160),
    gameKey: cleanStr(item.gameKey || fallbackGameKey, 24) || fallbackGameKey,
    roomId: cleanStr(item.roomId || '', 160),
    targetUid: cleanStr(item.targetUid || '', 160),
    targetName: cleanStr(item.targetName || item.targetMember?.username || item.targetMember?.name || '', 40),
    fromUid: cleanStr(item.fromUid || '', 160),
    fromName: cleanStr(item.fromMember?.username || item.hostName || '', 40),
    deliveryStatus,
    statusMessage,
    closeReason,
    expiresAt,
    expiresInMs,
    stateLabel,
    severity,
    restartRecovered: item.restartRecovered === true,
    canRetrySoon: expiresInMs <= SOCKET_INVITE_WINDOW_MS,
    createdAt: safeNum(item.createdAt, 0)
  };
}

function buildInviteCooldownSnapshot(outgoingInvites = [], options = {}) {
  const ts = safeNum(options.now, nowMs());
  const rows = (Array.isArray(outgoingInvites) ? outgoingInvites : []).map((item) => sanitizeInviteItem(item, item?.gameKey || 'invite', ts));
  const nextExpiryAt = rows.reduce((max, item) => Math.max(max, safeNum(item.expiresAt, 0)), 0);
  const queuedCount = rows.filter((item) => item.deliveryStatus === 'queued_offline').length;
  const realtimeCount = rows.filter((item) => item.deliveryStatus === 'delivered_realtime').length;
  const reusedCount = rows.filter((item) => item.deliveryStatus === 'reused').length;
  const nextReadyInMs = rows.length >= SOCKET_INVITE_MAX_PER_WINDOW
    ? Math.max(0, Math.min(...rows.map((item) => safeNum(item.expiresInMs, SOCKET_INVITE_WINDOW_MS))))
    : 0;
  const incomingPartyInvites = Array.isArray(options.incomingPartyInvites) ? options.incomingPartyInvites : [];
  const outgoingPartyInvites = Array.isArray(options.outgoingPartyInvites) ? options.outgoingPartyInvites : [];
  return {
    cooldownWindowMs: SOCKET_INVITE_WINDOW_MS,
    maxPerWindow: SOCKET_INVITE_MAX_PER_WINDOW,
    pendingCount: rows.length,
    nextExpiryAt,
    nextReadyInMs,
    summaryLabel: rows.length
      ? `${rows.length} bekleyen oyun daveti var`
      : 'Bekleyen oyun daveti yok',
    diagnostics: {
      realtimeCount,
      queuedCount,
      reusedCount,
      limitReached: rows.length >= SOCKET_INVITE_MAX_PER_WINDOW,
      nextReadyInMs
    },
    party: {
      incomingCount: incomingPartyInvites.length,
      outgoingCount: outgoingPartyInvites.length,
      ttlMs: PARTY_INVITE_TTL_MS,
      hasActiveParty: !!options.party
    },
    items: rows
  };
}

function buildPartyInviteSnapshot({ incomingInvites = [], outgoingInvites = [], party = null } = {}) {
  const ts = nowMs();
  const mapParty = (item = {}, direction = 'incoming') => {
    const expiresAt = safeNum(item.expiresAt, 0);
    const expiresInMs = Math.max(0, expiresAt - ts);
    const fromName = cleanStr(item?.fromMember?.username || '', 40) || 'Arkadaşın';
    const targetName = cleanStr(item?.targetMember?.username || '', 40) || 'Arkadaşın';
    return {
      id: cleanStr(item.id || '', 160),
      direction,
      partyId: cleanStr(item.partyId || '', 160),
      fromUid: cleanStr(item.fromUid || '', 160),
      targetUid: cleanStr(item.targetUid || '', 160),
      fromName,
      targetName,
      status: cleanStr(item.status || 'pending', 24) || 'pending',
      deliveryStatus: cleanStr(item.deliveryStatus || 'pending', 24) || 'pending',
      statusMessage: cleanStr(item.statusMessage || (direction === 'incoming' ? 'Parti daveti seni bekliyor.' : 'Yanıt bekleniyor.'), 180),
      expiresAt,
      expiresInMs,
      stateLabel: direction === 'incoming'
        ? `${fromName} seni partisine çağırıyor`
        : `${targetName} için parti daveti beklemede`
    };
  };
  const incoming = (Array.isArray(incomingInvites) ? incomingInvites : []).map((item) => mapParty(item, 'incoming'));
  const outgoing = (Array.isArray(outgoingInvites) ? outgoingInvites : []).map((item) => mapParty(item, 'outgoing'));
  const nextExpiryAt = [...incoming, ...outgoing].reduce((max, item) => Math.max(max, safeNum(item.expiresAt, 0)), 0);
  return {
    incoming,
    outgoing,
    counts: {
      incoming: incoming.length,
      outgoing: outgoing.length,
      total: incoming.length + outgoing.length
    },
    ttlMs: PARTY_INVITE_TTL_MS,
    nextExpiryAt,
    summaryLabel: party
      ? `Parti açık · ${party.members?.length || 0} üye`
      : (incoming.length || outgoing.length)
        ? 'Parti davetleri aktif'
        : 'Henüz aktif parti yok',
    notices: [
      `Parti davetleri ${Math.round(PARTY_INVITE_TTL_MS / 60000)} dakika içinde yanıtlanmalı.`,
      outgoing.length ? 'Bekleyen davetler hedef oyuncu cevap verene kadar görünür.' : 'Gönderilen parti davetleri burada izlenir.'
    ]
  };
}

module.exports = {
  PARTY_INVITE_TTL_MS,
  sanitizeInviteItem,
  buildInviteCooldownSnapshot,
  buildPartyInviteSnapshot
};
