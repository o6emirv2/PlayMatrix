'use strict';

const { cleanStr, safeNum, nowMs } = require('./helpers');

function normalizeGameKey(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('sat') || raw === 'chess') return 'chess';
  if (raw.includes('pist') || raw === 'pisti') return 'pisti';
  return '';
}

function sanitizeUidList(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => cleanStr(item || '', 160)).filter(Boolean)));
}

function buildTimelineEvent(type = '', payload = {}) {
  const meta = payload && typeof payload.meta === 'object' && payload.meta ? payload.meta : {};
  const participantUids = sanitizeUidList(payload.participantUids);
  return {
    type: cleanStr(type || 'system', 48).toLowerCase() || 'system',
    actorUid: cleanStr(payload.actorUid || payload.uid || '', 160),
    targetUid: cleanStr(payload.targetUid || '', 160),
    roomId: cleanStr(payload.roomId || '', 160),
    gameKey: normalizeGameKey(payload.gameKey || ''),
    reason: cleanStr(payload.reason || '', 48),
    status: cleanStr(payload.status || '', 24),
    participantUids,
    createdAt: safeNum(payload.createdAt, nowMs()),
    meta
  };
}

function appendTimelineEntry(record = {}, event = {}, options = {}) {
  const field = cleanStr(options.field || 'timeline', 32) || 'timeline';
  const limit = Math.max(1, Math.min(50, Math.floor(safeNum(options.limit, 24))));
  const current = Array.isArray(record[field]) ? record[field].filter(Boolean) : [];
  const normalized = buildTimelineEvent(event.type || 'system', event);
  record[field] = [...current.slice(-(limit - 1)), normalized];
  return record;
}

function bumpStateVersion(record = {}) {
  record.stateVersion = Math.max(1, Math.floor(safeNum(record.stateVersion, 0)) + 1);
  return record;
}

function evaluateInviteRoomState(room = {}, invite = {}, targetUid = '') {
  const safeTargetUid = cleanStr(targetUid || invite?.targetUid || '', 160);
  const gameKey = normalizeGameKey(invite?.gameKey || invite?.gameType || invite?.game || '');
  const status = cleanStr(room?.status || 'waiting', 24).toLowerCase() || 'waiting';

  if (!gameKey) {
    return { ok: false, code: 'INVALID_GAME', message: 'Davet oyunu geçersiz.', status, participantUids: [] };
  }

  if (gameKey === 'chess') {
    const hostUid = cleanStr(room?.host?.uid || '', 160);
    const guestUid = cleanStr(room?.guest?.uid || '', 160);
    const participantUids = sanitizeUidList([hostUid, guestUid]);
    if (!hostUid) return { ok: false, code: 'ROOM_INVALID', message: 'Satranç odası geçersiz.', status, participantUids };
    if (!['waiting', 'playing'].includes(status)) return { ok: false, code: 'ROOM_CLOSED', message: 'Satranç odası artık aktif değil.', status, participantUids };
    if (guestUid && guestUid !== safeTargetUid) return { ok: false, code: 'ROOM_FULL', message: 'Bu satranç odası artık dolu.', status, participantUids };
    if (!guestUid && status !== 'waiting') return { ok: false, code: 'ROOM_NOT_JOINABLE', message: 'Satranç odası artık davete uygun değil.', status, participantUids };
    return { ok: true, code: 'OK', message: '', status, participantUids };
  }

  const players = Array.isArray(room?.players) ? room.players : [];
  const participantUids = sanitizeUidList(players.map((player) => player?.uid || ''));
  const hasTarget = participantUids.includes(safeTargetUid);
  const maxPlayers = Math.max(0, Math.floor(safeNum(room?.maxPlayers, 0)));
  if (!participantUids.length) return { ok: false, code: 'ROOM_INVALID', message: 'Pişti odası geçersiz.', status, participantUids };
  if (hasTarget && ['waiting', 'playing'].includes(status)) return { ok: true, code: 'OK', message: '', status, participantUids };
  if (status !== 'waiting') return { ok: false, code: 'ROOM_NOT_JOINABLE', message: 'Bu Pişti odası artık davete uygun değil.', status, participantUids };
  if (maxPlayers > 0 && participantUids.length >= maxPlayers) return { ok: false, code: 'ROOM_FULL', message: 'Bu Pişti odası artık dolu.', status, participantUids };
  return { ok: true, code: 'OK', message: '', status, participantUids };
}

module.exports = {
  normalizeGameKey,
  sanitizeUidList,
  buildTimelineEvent,
  appendTimelineEntry,
  bumpStateVersion,
  evaluateInviteRoomState
};
