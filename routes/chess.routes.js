'use strict';

const express = require('express');
const router = express.Router();
const { Chess } = require('chess.js');

const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { safeNum, cleanStr, nowMs } = require('../utils/helpers');
const { getIstanbulDateKey } = require('../utils/activity');
const { applyRewardGrantInTransaction, createRewardNotificationForGrant } = require('../utils/rewardService');
const { assertNoOtherActiveGame } = require('../utils/gameSession');
const { saveMatchHistory } = require('../utils/matchHistory');
const { normalizeUserRankState, getAccountXp, buildProgressionSnapshot } = require('../utils/progression');
const { getCanonicalSelectedFrame, buildCanonicalUserState } = require('../utils/accountState');
const { assertGamesAllowed } = require('../utils/userRestrictions');
const { buildTimelineEvent, appendTimelineEntry, bumpStateVersion, applySettlement, isRecordSettled } = require('../utils/gameFlow');
const { recordGameAudit } = require('../utils/gameAudit');
const {
  CHESS_DISCONNECT_GRACE_MS,
  CHESS_RESULT_RETENTION_MS,
  GAME_SETTLEMENT_STATUS,
  GAME_RESULT_CODES
} = require('../config/constants');

const colUsers = () => db.collection('users');
const colChess = () => db.collection('chess_rooms');

function applyChessCloseWindow(room = {}, delayMs = CHESS_RESULT_RETENTION_MS) {
  const cleanupAt = nowMs() + Math.max(CHESS_DISCONNECT_GRACE_MS, safeNum(delayMs, CHESS_RESULT_RETENTION_MS));
  room.cleanupAt = cleanupAt;
  room.resumeAvailableUntil = cleanupAt;
  return room;
}

function scheduleChessRoomRemoval(roomId = '', delayMs = CHESS_RESULT_RETENTION_MS) {
  const safeRoomId = cleanStr(roomId, 160);
  if (!safeRoomId) return;
  setTimeout(() => colChess().doc(safeRoomId).delete().catch(() => null), Math.max(CHESS_DISCONNECT_GRACE_MS, safeNum(delayMs, CHESS_RESULT_RETENTION_MS)));
}

function pickUserSelectedFrame(user = {}) {
  return getCanonicalSelectedFrame(user, { defaultFrame: 0 });
}

function resolveWinnerUid(room = {}) {
  if (cleanStr(room.winner || '', 16) === 'white') return cleanStr(room.host?.uid || '', 160);
  if (cleanStr(room.winner || '', 16) === 'black') return cleanStr(room.guest?.uid || '', 160);
  return '';
}

function resolveLoserUid(room = {}) {
  const winnerUid = resolveWinnerUid(room);
  if (!winnerUid) return '';
  return winnerUid === cleanStr(room.host?.uid || '', 160)
    ? cleanStr(room.guest?.uid || '', 160)
    : cleanStr(room.host?.uid || '', 160);
}



function applyChessProgression(tx, uidA, uidB, outcome) {
  const aRef = colUsers().doc(uidA);
  const bRef = colUsers().doc(uidB);
  return Promise.all([tx.get(aRef), tx.get(bRef)]).then(([aSnap, bSnap]) => {
    if (!aSnap.exists || !bSnap.exists) return { applied: false, reason: 'USER_NOT_FOUND' };

    const a = aSnap.data() || {};
    const b = bSnap.data() || {};
    const aLast = cleanStr(a.chessLastOppUid || '');
    const aStreak = safeNum(a.chessOppStreak, 0);
    const bLast = cleanStr(b.chessLastOppUid || '');
    const bStreak = safeNum(b.chessOppStreak, 0);
    const aNextStreak = (aLast === uidB) ? (aStreak + 1) : 1;
    const bNextStreak = (bLast === uidA) ? (bStreak + 1) : 1;
    const boostBlocked = (aNextStreak > 3) || (bNextStreak > 3);

    const scoring = outcome === 'A_WIN'
      ? { aXp: 180, bXp: 60, aActivity: 16, bActivity: 8 }
      : (outcome === 'B_WIN'
        ? { aXp: 60, bXp: 180, aActivity: 8, bActivity: 16 }
        : { aXp: 110, bXp: 110, aActivity: 10, bActivity: 10 });

    const applyUserState = (ref, current, opponentUid, nextStreak, xpGain, activityGain) => {
      const nextActivity = Math.max(0, safeNum(current.monthlyActiveScore, 0) + (boostBlocked ? 0 : activityGain));
      const nextRounds = Math.max(0, safeNum(current.totalRounds, 0) + 1);
      const nextXp = Math.max(0, getAccountXp(current) + (boostBlocked ? 0 : xpGain));
      const nextUser = { ...current, accountXp: nextXp, monthlyActiveScore: nextActivity, totalRounds: nextRounds };
      const canonical = buildCanonicalUserState(nextUser, { defaultFrame: 0 });
      const normalized = normalizeUserRankState({ ...nextUser, ...canonical, monthlyActiveScore: nextActivity });
      tx.set(ref, {
        ...canonical,
        ...normalized,
        totalRounds: nextRounds,
        monthlyActiveScore: nextActivity,
        activityUpdatedAt: nowMs(),
        chessLastOppUid: opponentUid,
        chessOppStreak: nextStreak,
        lastGameProgressSource: 'CHESS_MATCH',
        lastGameXpEarned: boostBlocked ? 0 : xpGain
      }, { merge: true });
    };

    applyUserState(aRef, a, uidB, aNextStreak, scoring.aXp, scoring.aActivity);
    applyUserState(bRef, b, uidA, bNextStreak, scoring.bXp, scoring.bActivity);
    return {
      applied: true,
      boostBlocked,
      aXpEarned: boostBlocked ? 0 : scoring.aXp,
      bXpEarned: boostBlocked ? 0 : scoring.bXp,
      aActivityEarned: boostBlocked ? 0 : scoring.aActivity,
      bActivityEarned: boostBlocked ? 0 : scoring.bActivity
    };
  });
}

function serializeChessRoom(roomId = '', room = {}) {
  const cleanupAt = safeNum(room.cleanupAt, 0);
  const resumeAvailableUntil = safeNum(room.resumeAvailableUntil, cleanupAt);
  const status = cleanStr(room.status || '', 24);
  return {
    id: cleanStr(roomId || room.id || '', 160),
    ...room,
    cleanupAt,
    resumeAvailableUntil,
    resultCode: cleanStr(room.resultCode || '', 64),
    resultReason: cleanStr(room.resultReason || '', 48),
    settlementStatus: cleanStr(room.settlementStatus || '', 24),
    settledAt: safeNum(room.settledAt, 0),
    canResume: ['waiting', 'playing'].includes(status),
    canReview: ['finished', 'abandoned'].includes(status) && resumeAvailableUntil > Date.now()
  };
}

function finalizeChessRoom(room = {}, { actorUid = '', winner = 'draw', resultCode = '', reason = '', status = 'finished', meta = {} } = {}) {
  const safeActorUid = cleanStr(actorUid || '', 160);
  const now = nowMs();
  room.status = cleanStr(status || 'finished', 24) || 'finished';
  room.winner = winner;
  room.updatedAt = now;
  room.lastActivityAt = now;
  applyChessCloseWindow(room);
  const winnerUid = winner === 'white' ? cleanStr(room.host?.uid || '', 160) : winner === 'black' ? cleanStr(room.guest?.uid || '', 160) : '';
  const loserUid = winnerUid ? (winnerUid === cleanStr(room.host?.uid || '', 160) ? cleanStr(room.guest?.uid || '', 160) : cleanStr(room.host?.uid || '', 160)) : '';
  applySettlement(room, {
    status: room.status === 'abandoned' ? GAME_SETTLEMENT_STATUS.ABANDONED : GAME_SETTLEMENT_STATUS.SETTLED,
    resultCode,
    reason,
    settledAt: now,
    actorUid: safeActorUid,
    winnerUid,
    loserUid,
    meta
  });
  appendTimelineEntry(room, buildTimelineEvent(
    room.status === 'abandoned' ? 'match_abandoned' : 'match_finished',
    {
      actorUid: safeActorUid,
      roomId: cleanStr(room.id || '', 160),
      gameKey: 'chess',
      reason,
      status: room.status,
      participantUids: [cleanStr(room.host?.uid || '', 160), cleanStr(room.guest?.uid || '', 160)],
      meta: { ...meta, winner: cleanStr(room.winner || '', 16), resultCode: cleanStr(resultCode || '', 64) }
    }
  ));
  bumpStateVersion(room);
  return room;
}

function buildChessHistoryEntry({ roomId = '', room = {}, resultCode = '', winAmount = 0, createdAt = 0 } = {}) {
  const winnerUid = resolveWinnerUid(room);
  const loserUid = resolveLoserUid(room);
  return {
    id: `chess_${roomId}_${safeNum(createdAt || room.settledAt || room.updatedAt, nowMs())}`,
    gameType: 'chess',
    roomId,
    status: cleanStr(room.status || 'finished', 24),
    result: cleanStr(resultCode || '', 64) === GAME_RESULT_CODES.CHESS_DRAW ? 'draw' : cleanStr(resultCode || '', 64).replace(/^chess_/, ''),
    winnerUid,
    loserUid,
    participants: [cleanStr(room.host?.uid || '', 160), cleanStr(room.guest?.uid || '', 160)].filter(Boolean),
    rewards: { mc: safeNum(winAmount, 0) },
    meta: {
      resultCode: cleanStr(resultCode || '', 64),
      reason: cleanStr(room.resultReason || '', 48),
      winner: cleanStr(room.winner || '', 16)
    },
    createdAt: safeNum(createdAt || room.settledAt || room.updatedAt, nowMs())
  };
}

async function persistChessSettlementArtifacts({ roomId = '', room = {}, resultCode = '', winAmount = 0 } = {}) {
  const winnerUid = resolveWinnerUid(room);
  const loserUid = resolveLoserUid(room);
  const reason = cleanStr(room.resultReason || '', 48);
  const tasks = [
    saveMatchHistory(buildChessHistoryEntry({ roomId, room, resultCode, winAmount, createdAt: safeNum(room.settledAt || room.updatedAt, nowMs()) })),
    recordGameAudit({
      gameType: 'chess',
      entityType: 'match',
      entityId: cleanStr(roomId || '', 160),
      roomId,
      eventType: 'match_settled',
      resultCode,
      reason,
      status: cleanStr(room.settlementStatus || GAME_SETTLEMENT_STATUS.SETTLED, 24),
      actorUid: cleanStr(room.settledByUid || '', 160),
      subjectUid: winnerUid || loserUid,
      amount: safeNum(winAmount, 0),
      payout: safeNum(winAmount, 0),
      meta: { winnerUid, loserUid, status: cleanStr(room.status || '', 24) },
      idempotencyKey: `chess:${roomId}:settlement:${cleanStr(resultCode || '', 64)}`
    })
  ];


  await Promise.allSettled(tasks);

  return { winnerUid, loserUid };
}

async function rewardChessWinner(tx, winnerUid, options = {}) {
  const safeWinnerUid = cleanStr(winnerUid || '', 160);
  if (!safeWinnerUid) return { amount: 0, limitReached: false, grant: null };
  const uRef = colUsers().doc(safeWinnerUid);
  const uSnap = await tx.get(uRef);
  if (!uSnap.exists) return { amount: 0, limitReached: false, grant: null };

  const u = uSnap.data() || {};
  const todayStr = getIstanbulDateKey();

  let currentWins = safeNum(u.chessWinCount, 0);
  const lastWinDate = cleanStr(u.chessWinDate || '', 32);

  if (lastWinDate !== todayStr) currentWins = 0;
  if (currentWins >= 10) return { amount: 0, limitReached: true, dateKey: todayStr, grant: null };

  const reason = cleanStr(options.reason || 'win', 48) || 'win';
  const resultCode = cleanStr(options.resultCode || '', 64);
  const roomId = cleanStr(options.roomId || '', 160);
  const amount = 5000;
  const grant = await applyRewardGrantInTransaction(tx, {
    uid: safeWinnerUid,
    amount,
    source: 'chess_win',
    referenceId: roomId || todayStr,
    idempotencyKey: `chess:${roomId || todayStr}:win:${safeWinnerUid}:${reason || resultCode || 'normal'}`,
    meta: { roomId, reason, resultCode, dateKey: todayStr },
    userRef: uRef
  });

  if (!grant.duplicated) {
    tx.update(uRef, {
      chessWinCount: currentWins + 1,
      chessWinDate: todayStr
    });
  }

  return { amount: grant.duplicated ? 0 : amount, limitReached: false, dateKey: todayStr, duplicated: !!grant.duplicated, grant };
}

router.get('/lobby', verifyAuth, async (_req, res) => {
  try {
    const [snapWait, snapPlay] = await Promise.all([
      colChess().where('status', '==', 'waiting').orderBy('createdAt', 'desc').limit(20).get(),
      colChess().where('status', '==', 'playing').orderBy('createdAt', 'desc').limit(20).get()
    ]);

    const rooms = [];
    snapWait.forEach((doc) => {
      const d = doc.data() || {};
      rooms.push({ id: doc.id, hostUid: d.host?.uid || '', host: d.host?.username || 'Oyuncu', guest: null, status: d.status, createdAt: safeNum(d.createdAt, 0) });
    });
    snapPlay.forEach((doc) => {
      const d = doc.data() || {};
      rooms.push({ id: doc.id, hostUid: d.host?.uid || '', host: d.host?.username || 'Oyuncu', guest: d.guest ? d.guest.username : 'Bilinmeyen', status: d.status, createdAt: safeNum(d.createdAt, 0) });
    });

    rooms.sort((a, b) => safeNum(b.createdAt, 0) - safeNum(a.createdAt, 0));
    res.json({ ok: true, rooms: rooms.slice(0, 20) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/create', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    await assertNoOtherActiveGame(uid, { allowGameType: 'chess' });
    const roomData = await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(colUsers().doc(uid));
      if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı.');
      const u = uSnap.data() || {};

      const activeRooms = await tx.get(colChess().where('host.uid', '==', uid).where('status', '==', 'waiting'));
      if (!activeRooms.empty) throw new Error('Zaten bekleyen bir odanız var.');

      const createdAt = nowMs();
      const newRoomRef = colChess().doc();
      const newRoom = {
        id: newRoomRef.id,
        host: { uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: createdAt },
        guest: null,
        status: 'waiting',
        bet: 0,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        winner: null,
        cleanupAt: 0,
        resumeAvailableUntil: 0,
        createdAt,
        updatedAt: createdAt,
        lastActivityAt: createdAt,
        stateVersion: 1,
        settlementStatus: GAME_SETTLEMENT_STATUS.ACTIVE,
        resultCode: '',
        resultReason: '',
        settledAt: 0,
        timeline: [buildTimelineEvent('room_created', { actorUid: uid, roomId: newRoomRef.id, gameKey: 'chess', status: 'waiting', participantUids: [uid] })]
      };
      tx.set(newRoomRef, newRoom);
      return serializeChessRoom(newRoomRef.id, newRoom);
    });
    res.json({ ok: true, room: roomData });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/join', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const roomId = req.body.roomId ? cleanStr(req.body.roomId) : null;
    await assertNoOtherActiveGame(uid, { allowGameType: 'chess', allowRoomId: roomId || '' });

    const roomData = await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(colUsers().doc(uid));
      if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı.');
      const u = uSnap.data() || {};
      const now = nowMs();
      if (roomId) {
        const roomRef = colChess().doc(roomId);
        const rSnap = await tx.get(roomRef);
        if (!rSnap.exists) throw new Error('Oda bulunamadı.');
        const r = rSnap.data() || {};

        const isHost = cleanStr(r.host?.uid || '', 160) === uid;
        const isGuest = cleanStr(r.guest?.uid || '', 160) === uid;

        if (isHost || isGuest) {
          if (isHost) r.host = { ...r.host, username: u.username || r.host?.username || 'Oyuncu', avatar: u.avatar || r.host?.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: now };
          if (isGuest) r.guest = { ...r.guest, username: u.username || r.guest?.username || 'Oyuncu', avatar: u.avatar || r.guest?.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: now };
          r.updatedAt = now;
          r.lastActivityAt = now;
          r.resumeAvailableUntil = Math.max(safeNum(r.resumeAvailableUntil, 0), now + CHESS_DISCONNECT_GRACE_MS);
          bumpStateVersion(r);
          tx.update(roomRef, r);
          return serializeChessRoom(roomId, r);
        }

        if (cleanStr(r.status || '', 24) !== 'waiting') throw new Error('Bu oda artık müsait değil.');
        r.guest = { uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: now };
        r.status = 'playing';
        r.updatedAt = now;
        r.lastActivityAt = now;
        r.resumeAvailableUntil = now + CHESS_DISCONNECT_GRACE_MS;
        appendTimelineEntry(r, buildTimelineEvent('match_started', { actorUid: uid, targetUid: cleanStr(r.host?.uid || '', 160), roomId, gameKey: 'chess', status: 'playing', participantUids: [cleanStr(r.host?.uid || '', 160), uid] }));
        bumpStateVersion(r);
        tx.update(roomRef, r);
        return serializeChessRoom(roomId, r);
      }

      const snap = await tx.get(colChess().where('status', '==', 'waiting'));
      if (snap.empty) throw new Error('Müsait oda bulunamadı. Lütfen yeni oda kurun.');
      let docToJoin = null;
      snap.forEach((doc) => {
        if (cleanStr(doc.data()?.host?.uid || '', 160) !== uid && !docToJoin) docToJoin = doc;
      });
      if (!docToJoin) throw new Error('Şu an sadece kendi kurduğunuz oda var.');

      const r = docToJoin.data() || {};
      r.guest = { uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: now };
      r.status = 'playing';
      r.updatedAt = now;
      r.lastActivityAt = now;
      r.resumeAvailableUntil = now + CHESS_DISCONNECT_GRACE_MS;
      appendTimelineEntry(r, buildTimelineEvent('match_started', { actorUid: uid, targetUid: cleanStr(r.host?.uid || '', 160), roomId: docToJoin.id, gameKey: 'chess', status: 'playing', participantUids: [cleanStr(r.host?.uid || '', 160), uid] }));
      bumpStateVersion(r);
      tx.update(docToJoin.ref, r);
      return serializeChessRoom(docToJoin.id, r);
    });
    res.json({ ok: true, room: roomData });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.get('/state/:id', verifyAuth, async (req, res) => {
  try {
    const roomId = cleanStr(req.params.id);
    const snap = await colChess().doc(roomId).get();
    if (!snap.exists) throw new Error('Oda bulunamadı.');
    const room = snap.data() || {};
    const isPlayer = cleanStr(room.host?.uid || '', 160) === req.user.uid || cleanStr(room.guest?.uid || '', 160) === req.user.uid;
    if (!isPlayer) return res.status(403).json({ ok: false, error: 'Bu odanın durumunu görüntüleme yetkiniz yok.' });
    res.json({ ok: true, room: serializeChessRoom(roomId, room) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/ping', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const roomId = cleanStr(req.body.roomId);
    if (!roomId) throw new Error('Oda ID yok');

    const result = await db.runTransaction(async (tx) => {
      const roomRef = colChess().doc(roomId);
      const snap = await tx.get(roomRef);
      if (!snap.exists) throw new Error('Oda Yok');
      const r = snap.data() || {};
      if (cleanStr(r.status || '', 24) === 'finished' || cleanStr(r.status || '', 24) === 'abandoned') {
        return { room: serializeChessRoom(roomId, r), status: r.status, message: 'Oyun bitti.', resultCode: cleanStr(r.resultCode || '', 64) };
      }

      const now = nowMs();
      const isHost = cleanStr(r.host?.uid || '', 160) === uid;
      const isGuest = cleanStr(r.guest?.uid || '', 160) === uid;
      if (isHost) r.host.lastPing = now;
      if (isGuest) r.guest.lastPing = now;
      r.updatedAt = now;
      r.lastActivityAt = now;

      if (cleanStr(r.status || '', 24) === 'playing') {
        const hostDrop = now - safeNum(r.host?.lastPing, 0) > CHESS_DISCONNECT_GRACE_MS;
        const guestDrop = now - safeNum(r.guest?.lastPing, 0) > CHESS_DISCONNECT_GRACE_MS;

        if (hostDrop || guestDrop) {
          if (isRecordSettled(r)) {
            return { room: serializeChessRoom(roomId, r), status: r.status, message: 'Oyun zaten sonuçlandı.', resultCode: cleanStr(r.resultCode || '', 64) };
          }
          if (hostDrop && guestDrop) {
            finalizeChessRoom(r, { actorUid: uid, winner: 'none', status: 'abandoned', resultCode: GAME_RESULT_CODES.CHESS_ABANDONED_DOUBLE_DISCONNECT, reason: 'double_disconnect' });
            tx.update(roomRef, r);
            return { room: serializeChessRoom(roomId, r), status: 'abandoned', message: 'Her iki oyuncunun bağlantısı koptu. Oyun iptal edildi.', resultCode: GAME_RESULT_CODES.CHESS_ABANDONED_DOUBLE_DISCONNECT };
          }

          const loserIsHost = hostDrop;
          const winnerUid = loserIsHost ? cleanStr(r.guest?.uid || '', 160) : cleanStr(r.host?.uid || '', 160);
          const loserUid = loserIsHost ? cleanStr(r.host?.uid || '', 160) : cleanStr(r.guest?.uid || '', 160);
          finalizeChessRoom(r, {
            actorUid: uid,
            winner: loserIsHost ? 'black' : 'white',
            resultCode: GAME_RESULT_CODES.CHESS_DISCONNECT_WIN,
            reason: 'disconnect'
          });

          let reward = { amount: 0, limitReached: false };
          if (winnerUid) {
            reward = await rewardChessWinner(tx, winnerUid, { roomId, resultCode: GAME_RESULT_CODES.CHESS_DISCONNECT_WIN, reason: 'disconnect' });
            if (loserUid) {
              await applyChessProgression(tx, winnerUid, loserUid, 'A_WIN');
            }
          }
          tx.update(roomRef, r);
          return {
            room: serializeChessRoom(roomId, r),
            status: r.status,
            message: reward.limitReached ? 'Rakibin bağlantısı koptu. Günlük ödül limitin dolu.' : 'Rakibin bağlantısı koptu. Galibiyet işlendi.',
            resultCode: GAME_RESULT_CODES.CHESS_DISCONNECT_WIN,
            winAmount: reward.amount,
            rewardGrant: reward.grant || null
          };
        }
      }

      tx.update(roomRef, r);
      return { room: serializeChessRoom(roomId, r), status: r.status, message: '', resultCode: cleanStr(r.resultCode || '', 64) };
    });

    const io = req.app.get('io');
    if (cleanStr(result?.resultCode || '', 64) === GAME_RESULT_CODES.CHESS_DISCONNECT_WIN && result?.room) {
      await persistChessSettlementArtifacts({ roomId, room: result.room, resultCode: GAME_RESULT_CODES.CHESS_DISCONNECT_WIN, winAmount: safeNum(result.winAmount, 0) });
      createRewardNotificationForGrant(result.rewardGrant, { data: { source: 'chess_win', roomId, amount: safeNum(result.winAmount, 0), reason: 'disconnect' } }).catch(() => null);
      scheduleChessRoomRemoval(roomId);
    } else if (cleanStr(result?.resultCode || '', 64) === GAME_RESULT_CODES.CHESS_ABANDONED_DOUBLE_DISCONNECT) {
      await persistChessSettlementArtifacts({ roomId, room: result.room, resultCode: GAME_RESULT_CODES.CHESS_ABANDONED_DOUBLE_DISCONNECT, winAmount: 0 });
      scheduleChessRoomRemoval(roomId);
    }

    res.json({ ok: true, room: result?.room || result, status: result?.status, message: result?.message || '', resultCode: result?.resultCode || '' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/move', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { roomId, from, to, promotion } = req.body;

    const result = await db.runTransaction(async (tx) => {
      const roomRef = colChess().doc(roomId);
      const rSnap = await tx.get(roomRef);
      if (!rSnap.exists) throw new Error('Oda bulunamadı.');
      const r = rSnap.data() || {};

      if (cleanStr(r.status || '', 24) !== 'playing') throw new Error('Oyun aktif değil.');
      if (isRecordSettled(r)) throw new Error('Bu maç zaten sonuçlandı.');
      const isWhite = cleanStr(r.host?.uid || '', 160) === uid;
      const isBlack = cleanStr(r.guest?.uid || '', 160) === uid;
      if (!isWhite && !isBlack) throw new Error('Bu odada oyuncu değilsiniz.');
      if ((r.turn === 'w' && !isWhite) || (r.turn === 'b' && !isBlack)) throw new Error('Sıra sizde değil.');

      const chess = new Chess(r.fen);
      const move = chess.move({ from, to, promotion: promotion || 'q' });
      if (move === null) throw new Error('Geçersiz hamle! Kural dışı oynanamaz.');

      const now = nowMs();
      r.fen = chess.fen();
      r.turn = chess.turn();
      r.updatedAt = now;
      r.lastActivityAt = now;
      if (isWhite) r.host.lastPing = now;
      if (isBlack) r.guest.lastPing = now;
      bumpStateVersion(r);
      let winAmount = 0;
      let gameOverMessage = null;
      let resultCode = '';
      let rewardGrant = null;

      if (chess.in_checkmate()) {
        const winnerUid = isWhite ? cleanStr(r.host?.uid || '', 160) : cleanStr(r.guest?.uid || '', 160);
        const loserUid = isWhite ? cleanStr(r.guest?.uid || '', 160) : cleanStr(r.host?.uid || '', 160);
        finalizeChessRoom(r, {
          actorUid: uid,
          winner: isWhite ? 'white' : 'black',
          resultCode: GAME_RESULT_CODES.CHESS_CHECKMATE_WIN,
          reason: 'checkmate',
          meta: { move: move.san }
        });
        const reward = await rewardChessWinner(tx, winnerUid, { roomId, resultCode: GAME_RESULT_CODES.CHESS_CHECKMATE_WIN, reason: 'checkmate' });
        winAmount = reward.amount;
        rewardGrant = reward.grant || null;
        const progressOut = await applyChessProgression(tx, winnerUid, loserUid, 'A_WIN');
        resultCode = GAME_RESULT_CODES.CHESS_CHECKMATE_WIN;
        if (progressOut?.boostBlocked) gameOverMessage = 'ŞAH MAT! (Aynı rakiple üst üste eşleşme sınırı nedeniyle ilerleme puanı işlenmedi)';
        else if (reward.limitReached) gameOverMessage = 'ŞAH MAT! (Günlük Kredi Kazanma Limitiniz Doldu)';
        else gameOverMessage = 'ŞAH MAT! 5000 MC KAZANDINIZ!';
      } else if (chess.in_draw() || chess.in_stalemate() || chess.in_threefold_repetition()) {
        const aUid = cleanStr(r.host?.uid || '', 160);
        const bUid = cleanStr(r.guest?.uid || '', 160);
        finalizeChessRoom(r, {
          actorUid: uid,
          winner: 'draw',
          resultCode: GAME_RESULT_CODES.CHESS_DRAW,
          reason: 'draw',
          meta: { move: move.san }
        });
        const progressOut = await applyChessProgression(tx, aUid, bUid, 'DRAW');
        resultCode = GAME_RESULT_CODES.CHESS_DRAW;
        gameOverMessage = progressOut?.boostBlocked ? 'BERABERE! (İlerleme puanı bu eşleşmede işlenmedi)' : 'BERABERE!';
      }

      tx.update(roomRef, r);
      return { room: serializeChessRoom(roomId, r), moveStr: move.san, winAmount, gameOverMessage, resultCode, rewardGrant };
    });

    const io = req.app.get('io');
    if (result.room.status === 'finished' || result.room.status === 'abandoned') {
      await persistChessSettlementArtifacts({ roomId, room: result.room, resultCode: result.resultCode, winAmount: result.winAmount });
      createRewardNotificationForGrant(result.rewardGrant, { data: { source: 'chess_win', roomId, amount: safeNum(result.winAmount, 0), reason: cleanStr(result.room?.resultReason || '', 48) } }).catch(() => null);
      scheduleChessRoomRemoval(roomId);
    }
    res.json({ ok: true, ...result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/leave', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const guardSnap = await colUsers().doc(uid).get();
    assertGamesAllowed(guardSnap.data() || {});
    const roomId = cleanStr(req.body?.roomId || '');
    if (!roomId) throw new Error('Oda ID gerekli.');

    const result = await db.runTransaction(async (tx) => {
      const roomRef = colChess().doc(roomId);
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists) return { deleted: true };

      const room = roomSnap.data() || {};
      const isHost = cleanStr(room.host?.uid || '', 160) === uid;
      const isGuest = cleanStr(room.guest?.uid || '', 160) === uid;
      if (!isHost && !isGuest) throw new Error('Bu odada yetkiniz yok.');

      if (cleanStr(room.status || '', 24) === 'waiting') {
        tx.delete(roomRef);
        return { deleted: true, waiting: true, resultCode: GAME_RESULT_CODES.CHESS_WAITING_CANCELLED };
      }
      if (cleanStr(room.status || '', 24) === 'finished' || cleanStr(room.status || '', 24) === 'abandoned' || isRecordSettled(room)) {
        return { room: serializeChessRoom(roomId, room), alreadyClosed: true, resultCode: cleanStr(room.resultCode || '', 64) };
      }

      const winnerUid = isHost ? cleanStr(room.guest?.uid || '', 160) : cleanStr(room.host?.uid || '', 160);
      const loserUid = isHost ? cleanStr(room.host?.uid || '', 160) : cleanStr(room.guest?.uid || '', 160);
      finalizeChessRoom(room, {
        actorUid: uid,
        winner: isHost ? 'black' : 'white',
        resultCode: GAME_RESULT_CODES.CHESS_LEAVE_WIN,
        reason: 'leave'
      });
      let reward = { amount: 0, limitReached: false };
      if (winnerUid) {
        reward = await rewardChessWinner(tx, winnerUid, { roomId, resultCode: GAME_RESULT_CODES.CHESS_LEAVE_WIN, reason: 'leave' });
        if (loserUid) {
          await applyChessProgression(tx, winnerUid, loserUid, 'A_WIN');
        }
      }
      tx.update(roomRef, room);
      return {
        room: serializeChessRoom(roomId, room),
        winAmount: reward.amount,
        gameOverMessage: reward.limitReached ? 'Rakip masadan ayrıldı. (Günlük limit dolu)' : 'Rakip masadan ayrıldı. 5000 MC KAZANDINIZ!',
        resultCode: GAME_RESULT_CODES.CHESS_LEAVE_WIN,
        rewardGrant: reward.grant || null
      };
    });

    if (result.waiting) {
      await recordGameAudit({
        gameType: 'chess',
        entityType: 'match',
        entityId: roomId,
        roomId,
        eventType: 'waiting_room_cancelled',
        resultCode: GAME_RESULT_CODES.CHESS_WAITING_CANCELLED,
        reason: 'leave',
        status: GAME_SETTLEMENT_STATUS.CANCELLED,
        actorUid: uid,
        subjectUid: uid,
        idempotencyKey: `chess:${roomId}:waiting_cancelled`
      }).catch(() => null);
    } else if (result?.room && !result.alreadyClosed) {
      await persistChessSettlementArtifacts({ roomId, room: result.room, resultCode: GAME_RESULT_CODES.CHESS_LEAVE_WIN, winAmount: result.winAmount });
      createRewardNotificationForGrant(result.rewardGrant, { data: { source: 'chess_win', roomId, amount: safeNum(result.winAmount, 0), reason: 'leave' } }).catch(() => null);
      scheduleChessRoomRemoval(roomId);
    }
    res.json({ ok: true, ...result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.post('/resign', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const roomId = cleanStr(req.body?.roomId || '');
    if (!roomId) throw new Error('Oda ID gerekli.');
    const result = await db.runTransaction(async (tx) => {
      const roomRef = colChess().doc(roomId);
      const rSnap = await tx.get(roomRef);
      if (!rSnap.exists) throw new Error('Oda bulunamadı.');
      const r = rSnap.data() || {};

      if (cleanStr(r.status || '', 24) !== 'playing') throw new Error('Oyun aktif değil.');
      if (isRecordSettled(r)) throw new Error('Bu maç zaten sonuçlandı.');
      const isWhite = cleanStr(r.host?.uid || '', 160) === uid;
      const isBlack = cleanStr(r.guest?.uid || '', 160) === uid;
      if (!isWhite && !isBlack) throw new Error('Yetkiniz yok.');

      const winnerUid = isWhite ? cleanStr(r.guest?.uid || '', 160) : cleanStr(r.host?.uid || '', 160);
      const loserUid = isWhite ? cleanStr(r.host?.uid || '', 160) : cleanStr(r.guest?.uid || '', 160);
      finalizeChessRoom(r, {
        actorUid: uid,
        winner: isWhite ? 'black' : 'white',
        resultCode: GAME_RESULT_CODES.CHESS_RESIGN_WIN,
        reason: 'resign'
      });
      const reward = await rewardChessWinner(tx, winnerUid, { roomId, resultCode: GAME_RESULT_CODES.CHESS_RESIGN_WIN, reason: 'resign' });
      await applyChessProgression(tx, winnerUid, loserUid, 'A_WIN');
      tx.update(roomRef, r);
      return {
        room: serializeChessRoom(roomId, r),
        winAmount: reward.amount,
        gameOverMessage: reward.limitReached ? 'Rakip Pes Etti. (Günlük Limitiniz Doldu)' : 'Rakip Pes Etti. 5000 MC KAZANDINIZ!',
        resultCode: GAME_RESULT_CODES.CHESS_RESIGN_WIN,
        rewardGrant: reward.grant || null
      };
    });

    await persistChessSettlementArtifacts({ roomId, room: result.room, resultCode: GAME_RESULT_CODES.CHESS_RESIGN_WIN, winAmount: result.winAmount });
    createRewardNotificationForGrant(result.rewardGrant, { data: { source: 'chess_win', roomId, amount: safeNum(result.winAmount, 0), reason: 'resign' } }).catch(() => null);
    scheduleChessRoomRemoval(roomId);
    res.json({ ok: true, ...result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
