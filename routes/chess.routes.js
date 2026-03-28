// routes/chess.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const { Chess } = require('chess.js');

const { db, admin } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { safeNum, cleanStr, nowMs } = require('../utils/helpers');
const { getIstanbulDateKey } = require('../utils/activity');
const { recordRewardLedger } = require('../utils/rewardLedger');
const { createNotification } = require('../utils/notifications');
const { assertNoOtherActiveGame } = require('../utils/gameSession');
const { getTierIndex, applyRpDelta } = require('../utils/rpSystem');
const { applyMatchEloUpdate } = require('../utils/eloSystem');
const { saveMatchHistory } = require('../utils/matchHistory');
const { normalizeUserRankState } = require('../utils/progression');
const { buildTimelineEvent, appendTimelineEntry, bumpStateVersion } = require('../utils/gameFlow');
const { CHESS_DISCONNECT_GRACE_MS, CHESS_RESULT_RETENTION_MS, applyChessCloseWindow } = require('../utils/roomLifecycle');
const { getRewardRuntimeCatalog, getFixedRewardAmount } = require('../utils/rewardCenter');

const colUsers = () => db.collection('users');
const colChess = () => db.collection('chess_rooms');


function scheduleChessRoomRemoval(roomId = '', delayMs = CHESS_RESULT_RETENTION_MS) {
  const safeRoomId = cleanStr(roomId, 160);
  if (!safeRoomId) return 0;
  // Fiziksel silme cron temizliğine bırakılır; process restart durumunda da cleanupAt korunur.
  return Math.max(CHESS_DISCONNECT_GRACE_MS, safeNum(delayMs, CHESS_RESULT_RETENTION_MS));
}



async function getChessRewardConfig() {
  const rewardRuntime = await getRewardRuntimeCatalog({ includePrivate: false });
  return {
    amount: getFixedRewardAmount('chess_win', rewardRuntime.map, 5000),
    dailyCap: Math.max(0, Math.floor(safeNum(rewardRuntime.map.get('chess_win')?.dailyCap, 10)))
  };
}

function pickUserSelectedFrame(user = {}) {
  if (typeof user?.selectedFrame === 'string' && user.selectedFrame.trim()) return user.selectedFrame.trim();
  const numericSelected = Number(user?.selectedFrame);
  if (Number.isFinite(numericSelected) && numericSelected > 0) return Math.floor(numericSelected);
  if (typeof user?.activeFrameClass === 'string' && user.activeFrameClass.trim()) return user.activeFrameClass.trim();
  const numericActive = Number(user?.activeFrame);
  if (Number.isFinite(numericActive) && numericActive > 0) return Math.floor(numericActive);
  return 0;
}

// ---------------------------------------------------------
// SATRANÇ ÖZEL ÖDÜL VE RP MANTIĞI
// ---------------------------------------------------------
async function rewardChessWinner(tx, winnerUid, rewardAmount = 5000, dailyCap = 10) {
    const uSnap = await tx.get(colUsers().doc(winnerUid));
    if (!uSnap.exists) return { amount: 0, limitReached: false };

    const u = uSnap.data() || {};
    const todayStr = getIstanbulDateKey();

    let currentWins = safeNum(u.chessWinCount, 0);
    const lastWinDate = cleanStr(u.chessWinDate || '', 32);

    if (lastWinDate !== todayStr) currentWins = 0;

    if (currentWins < dailyCap) {
        tx.update(colUsers().doc(winnerUid), {
            balance: admin.firestore.FieldValue.increment(rewardAmount),
            chessWinCount: currentWins + 1,
            chessWinDate: todayStr
        });
        return { amount: rewardAmount, limitReached: false, dateKey: todayStr, dailyCap };
    }
    return { amount: 0, limitReached: true, dateKey: todayStr };
}

async function applyChessRp(tx, uidA, uidB, outcome) {
  const aRef = colUsers().doc(uidA); const bRef = colUsers().doc(uidB);
  const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
  if (!aSnap.exists || !bSnap.exists) return { applied: false, reason: 'USER_NOT_FOUND' };

  const a = aSnap.data() || {}; const b = bSnap.data() || {};

  const aLast = cleanStr(a.chessLastOppUid || ''); const aStreak = safeNum(a.chessOppStreak, 0);
  const bLast = cleanStr(b.chessLastOppUid || ''); const bStreak = safeNum(b.chessOppStreak, 0);

  const aNextStreak = (aLast === uidB) ? (aStreak + 1) : 1;
  const bNextStreak = (bLast === uidA) ? (bStreak + 1) : 1;
  const boostBlocked = (aNextStreak > 3) || (bNextStreak > 3);

  const aTier = getTierIndex(a.rp); const bTier = getTierIndex(b.rp);
  let aDelta = 0, bDelta = 0;

  if (!boostBlocked) {
    if (outcome === 'A_WIN') { aDelta = (bTier > aTier) ? 35 : 25; bDelta = (bTier === 0) ? 0 : -15; } 
    else if (outcome === 'B_WIN') { bDelta = (aTier > bTier) ? 35 : 25; aDelta = (aTier === 0) ? 0 : -15; } 
    else if (outcome === 'DRAW') { aDelta = 5; bDelta = 5; }
  }

  const nextARp = applyRpDelta(a.rp, aDelta); const nextBRp = applyRpDelta(b.rp, bDelta);
  const nextASeasonRp = applyRpDelta(a.seasonRp, aDelta); const nextBSeasonRp = applyRpDelta(b.seasonRp, bDelta);

  tx.set(aRef, { ...normalizeUserRankState({ rp: nextARp, seasonRp: nextASeasonRp }), chessLastOppUid: uidB, chessOppStreak: aNextStreak, rpUpdatedAt: nowMs() }, { merge: true });
  tx.set(bRef, { ...normalizeUserRankState({ rp: nextBRp, seasonRp: nextBSeasonRp }), chessLastOppUid: uidA, chessOppStreak: bNextStreak, rpUpdatedAt: nowMs() }, { merge: true });

  return { applied: true, boostBlocked, aDelta, bDelta, nextARp, nextBRp, nextASeasonRp, nextBSeasonRp };
}

// ---------------------------------------------------------
// API UÇ NOKTALARI
// ---------------------------------------------------------
router.get('/lobby', verifyAuth, async (req, res) => {
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
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/create', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        await assertNoOtherActiveGame(uid, { allowGameType: 'chess' });
        const roomData = await db.runTransaction(async (tx) => {
            const uSnap = await tx.get(colUsers().doc(uid));
            if (!uSnap.exists) throw new Error("Kullanıcı bulunamadı.");
            const u = uSnap.data();

            const activeRooms = await tx.get(colChess().where('host.uid', '==', uid).where('status', '==', 'waiting'));
            if (!activeRooms.empty) throw new Error("Zaten bekleyen bir odanız var.");

            const newRoomRef = colChess().doc();
            const newRoom = { host: { uid: uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: nowMs() }, guest: null, status: 'waiting', bet: 0, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', turn: 'w', winner: null, cleanupAt: 0, resumeAvailableUntil: 0, createdAt: nowMs(), updatedAt: nowMs(), stateVersion: 1, timeline: [buildTimelineEvent('room_created', { actorUid: uid, roomId: newRoomRef.id, gameKey: 'chess', status: 'waiting', participantUids: [uid] })] };
            
            tx.set(newRoomRef, newRoom); return { id: newRoomRef.id, ...newRoom };
        });
        res.json({ ok: true, room: roomData });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/join', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const roomId = req.body.roomId ? cleanStr(req.body.roomId) : null;
        await assertNoOtherActiveGame(uid, { allowGameType: 'chess', allowRoomId: roomId || '' });

        const roomData = await db.runTransaction(async (tx) => {
            const uSnap = await tx.get(colUsers().doc(uid)); const u = uSnap.data();
            if (roomId) {
                const rSnap = await tx.get(colChess().doc(roomId));
                if (!rSnap.exists) throw new Error("Oda bulunamadı.");
                let r = rSnap.data();

                const isHost = r.host && r.host.uid === uid; const isGuest = r.guest && r.guest.uid === uid;

                if (isHost || isGuest) {
                    if (isHost) r.host = { ...r.host, username: u.username || r.host?.username || 'Oyuncu', avatar: u.avatar || r.host?.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: nowMs() };
                    if (isGuest) r.guest = { ...r.guest, username: u.username || r.guest?.username || 'Oyuncu', avatar: u.avatar || r.guest?.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: nowMs() };
                    r.updatedAt = nowMs(); bumpStateVersion(r); tx.update(colChess().doc(roomId), r); return { id: roomId, ...r };
                }

                if (r.status !== 'waiting') throw new Error("Bu oda artık müsait değil.");
                r.guest = { uid: uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: nowMs() };
                r.status = 'playing'; r.updatedAt = nowMs(); appendTimelineEntry(r, buildTimelineEvent('match_started', { actorUid: uid, targetUid: cleanStr(r.host?.uid || '', 160), roomId, gameKey: 'chess', status: 'playing', participantUids: [cleanStr(r.host?.uid || '', 160), uid] })); bumpStateVersion(r); tx.update(colChess().doc(roomId), r); return { id: roomId, ...r };
            } else {
                const snap = await tx.get(colChess().where('status', '==', 'waiting'));
                if (snap.empty) throw new Error("Müsait oda bulunamadı. Lütfen yeni oda kurun.");
                
                let docToJoin = null; snap.forEach(doc => { if (doc.data().host.uid !== uid && !docToJoin) docToJoin = doc; });
                if (!docToJoin) throw new Error("Şu an sadece kendi kurduğunuz oda var.");

                let r = docToJoin.data();
                r.guest = { uid: uid, username: u.username || 'Oyuncu', avatar: u.avatar || null, selectedFrame: pickUserSelectedFrame(u), lastPing: nowMs() };
                r.status = 'playing'; r.updatedAt = nowMs(); appendTimelineEntry(r, buildTimelineEvent('match_started', { actorUid: uid, targetUid: cleanStr(r.host?.uid || '', 160), roomId: docToJoin.id, gameKey: 'chess', status: 'playing', participantUids: [cleanStr(r.host?.uid || '', 160), uid] })); bumpStateVersion(r); tx.update(docToJoin.ref, r); return { id: docToJoin.id, ...r };
            }
        });
        res.json({ ok: true, room: roomData });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.get('/state/:id', verifyAuth, async (req, res) => {
    try {
        const roomId = cleanStr(req.params.id); const snap = await colChess().doc(roomId).get();
        if (!snap.exists) throw new Error("Oda bulunamadı.");
        const room = snap.data() || {};
        const isPlayer = cleanStr(room.host?.uid || '', 160) === req.user.uid || cleanStr(room.guest?.uid || '', 160) === req.user.uid;
        if (!isPlayer) return res.status(403).json({ ok: false, error: 'Bu odanın durumunu görüntüleme yetkiniz yok.' });
        res.json({ ok: true, room: { id: roomId, ...room } });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/ping', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const roomId = cleanStr(req.body.roomId);
        if (!roomId) throw new Error("Oda ID yok");

        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(colChess().doc(roomId));
            if (!snap.exists) throw new Error("Oda Yok");
            let r = snap.data();

            if (r.status === 'finished' || r.status === 'abandoned') return { status: r.status, message: "Oyun bitti." };

            const isHost = r.host && r.host.uid === uid; const isGuest = r.guest && r.guest.uid === uid;
            if (isHost) r.host.lastPing = nowMs(); if (isGuest) r.guest.lastPing = nowMs();

            if (r.status === 'playing') {
                const hostDrop = nowMs() - (r.host.lastPing || 0) > CHESS_DISCONNECT_GRACE_MS;
                const guestDrop = nowMs() - (r.guest.lastPing || 0) > CHESS_DISCONNECT_GRACE_MS;

                if (hostDrop || guestDrop) {
                    if (hostDrop && guestDrop) {
                        r.status = 'abandoned'; r.winner = 'none'; r.updatedAt = nowMs(); applyChessCloseWindow(r); appendTimelineEntry(r, buildTimelineEvent('match_abandoned', { actorUid: uid, roomId, gameKey: 'chess', reason: 'double_disconnect', status: 'abandoned', participantUids: [cleanStr(r.host?.uid || '', 160), cleanStr(r.guest?.uid || '', 160)] })); bumpStateVersion(r); tx.update(colChess().doc(roomId), r);
                        scheduleChessRoomRemoval(roomId);
                        return { room: { id: roomId, ...r }, status: 'abandoned', message: "Her iki oyuncunun bağlantısı koptu. Oyun iptal edildi." };
                    }

                    const loserIsHost = hostDrop;
                    const winnerUid = loserIsHost ? r.guest?.uid : r.host?.uid;
                    const loserUid = loserIsHost ? r.host?.uid : r.guest?.uid;
                    r.status = 'finished';
                    r.winner = loserIsHost ? 'black' : 'white';
                    r.updatedAt = nowMs();
                    applyChessCloseWindow(r);
                    appendTimelineEntry(r, buildTimelineEvent('match_finished', { actorUid: uid, roomId, gameKey: 'chess', reason: 'disconnect', status: 'finished', participantUids: [cleanStr(r.host?.uid || '', 160), cleanStr(r.guest?.uid || '', 160)], meta: { winner: loserIsHost ? cleanStr(r.guest?.uid || '', 160) : cleanStr(r.host?.uid || '', 160) } }));
                    bumpStateVersion(r);

                    const rewardConfig = await getChessRewardConfig();
                    let reward = { amount: 0, limitReached: false };
                    let eloSummary = null;
                    if (winnerUid) {
                        reward = await rewardChessWinner(tx, winnerUid, rewardConfig.amount, rewardConfig.dailyCap);
                        if (loserUid) {
                            await applyChessRp(tx, winnerUid, loserUid, 'A_WIN');
                            eloSummary = await applyMatchEloUpdate(tx, winnerUid, loserUid, 'chess', 1, 0);
                        }
                    }

                    tx.update(colChess().doc(roomId), r);
                    return {
                        room: { id: roomId, ...r },
                        status: 'finished',
                        message: reward.limitReached ? "Rakibin bağlantısı koptu. Günlük ödül limitin dolu." : "Rakibin bağlantısı koptu. Galibiyet işlendi.",
                        disconnectWin: true,
                        winAmount: reward.amount,
                        eloSummary
                    };
                }
            }
            tx.update(colChess().doc(roomId), r); return { room: { id: roomId, ...r }, status: r.status, message: "" };
        });
        const io = req.app.get('io');
        if (result?.disconnectWin && result?.room) {
            const winnerUid = result.room.winner === 'white' ? result.room.host?.uid : result.room.guest?.uid;
            const loserUid = winnerUid ? (winnerUid === result.room.host?.uid ? result.room.guest?.uid : result.room.host?.uid) : '';
            saveMatchHistory({
                id: `chess_${roomId}_${result.room.updatedAt || nowMs()}`,
                gameType: 'chess',
                roomId,
                status: result.room.status,
                result: 'disconnect_win',
                winnerUid,
                loserUid,
                participants: [result.room.host?.uid, result.room.guest?.uid],
                rewards: { mc: safeNum(result.winAmount, 0) },
                meta: { reason: 'disconnect' },
                createdAt: result.room.updatedAt || nowMs()
            }).catch(() => null);

            if (result.eloSummary?.applied && io) {
                const { buildEloSocketPayload } = require('../utils/eloSystem');
                [result.eloSummary.playerA?.uid, result.eloSummary.playerB?.uid].filter(Boolean).forEach((u) => {
                    const payload = buildEloSocketPayload(result.eloSummary, u);
                    if (payload) io.to(`user_${u}`).emit('game:elo_update', payload);
                });
            }
            if (result.winAmount > 0 && winnerUid) {
                Promise.allSettled([
                    recordRewardLedger({ uid: winnerUid, amount: result.winAmount, source: 'chess_win', referenceId: roomId, meta: { reason: 'disconnect' }, idempotencyKey: `chess:${roomId}:win:${winnerUid}:disconnect` }),
                    createNotification({ uid: winnerUid, type: 'reward', title: 'Satranç galibiyet ödülü', body: `${result.winAmount} MC hesabına eklendi.`, data: { source: 'chess_win', roomId, amount: result.winAmount, reason: 'disconnect' } })
                ]).catch(() => null);
            }
            scheduleChessRoomRemoval(roomId);
        }
        res.json({ ok: true, room: result?.room || result, status: result?.status, message: result?.message || "" });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/move', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const { roomId, from, to, promotion } = req.body;

        const result = await db.runTransaction(async (tx) => {
            const rSnap = await tx.get(colChess().doc(roomId));
            if (!rSnap.exists) throw new Error("Oda bulunamadı.");
            let r = rSnap.data();

            if (r.status !== 'playing') throw new Error("Oyun aktif değil.");
            let isWhite = r.host.uid === uid; let isBlack = r.guest.uid === uid;
            if (!isWhite && !isBlack) throw new Error("Bu odada oyuncu değilsiniz.");
            if ((r.turn === 'w' && !isWhite) || (r.turn === 'b' && !isBlack)) throw new Error("Sıra sizde değil.");

            const chess = new Chess(r.fen); 
            const move = chess.move({ from: from, to: to, promotion: promotion || 'q' });
            if (move === null) throw new Error("Geçersiz hamle! Kural dışı oynanamaz.");

            r.fen = chess.fen(); r.turn = chess.turn(); r.updatedAt = nowMs(); bumpStateVersion(r);
            let winAmount = 0; let gameOverMessage = null; let eloSummary = null;

            if (chess.in_checkmate()) {
                r.status = 'finished'; r.winner = isWhite ? 'white' : 'black'; applyChessCloseWindow(r);
                const winnerUid = isWhite ? r.host.uid : r.guest.uid;
                const loserUid = isWhite ? r.guest.uid : r.host.uid;

                const rewardConfig = await getChessRewardConfig();
                const reward = await rewardChessWinner(tx, winnerUid, rewardConfig.amount, rewardConfig.dailyCap);
                winAmount = reward.amount;

                const rpOut = await applyChessRp(tx, winnerUid, loserUid, 'A_WIN');
                eloSummary = await applyMatchEloUpdate(tx, winnerUid, loserUid, 'chess', 1, 0);

                if (rpOut?.boostBlocked) gameOverMessage = "ŞAH MAT! (Boost Engeli: Aynı rakiple 3 maç limiti aşıldı, RP işlenmedi)";
                else if (reward.limitReached) gameOverMessage = "ŞAH MAT! (Günlük Kredi Kazanma Limitiniz Doldu)";
                else gameOverMessage = `ŞAH MAT! ${reward.amount.toLocaleString('tr-TR')} MC KAZANDINIZ!`;
            } else if (chess.in_draw() || chess.in_stalemate() || chess.in_threefold_repetition()) {
                r.status = 'finished'; r.winner = 'draw'; applyChessCloseWindow(r);
                const aUid = r.host.uid; const bUid = r.guest.uid;
                const rpOut = await applyChessRp(tx, aUid, bUid, 'DRAW');
                eloSummary = await applyMatchEloUpdate(tx, aUid, bUid, 'chess', 0.5, 0.5);
                gameOverMessage = rpOut?.boostBlocked ? "BERABERE! (Boost Engeli: RP işlenmedi)" : "BERABERE!";
            }

            if (r.status === 'finished') {
                appendTimelineEntry(r, buildTimelineEvent('match_finished', { actorUid: uid, roomId, gameKey: 'chess', reason: r.winner === 'draw' ? 'draw' : 'checkmate', status: 'finished', participantUids: [cleanStr(r.host?.uid || '', 160), cleanStr(r.guest?.uid || '', 160)], meta: { winner: cleanStr(r.winner || '', 16) } }));
            }

            tx.update(colChess().doc(roomId), r);
            return { room: { id: roomId, ...r }, moveStr: move.san, winAmount, gameOverMessage, eloSummary };
        });

        if (result.room.status === 'finished') {
            const winnerUid = result.room.winner === 'white' ? result.room.host?.uid : result.room.winner === 'black' ? result.room.guest?.uid : '';
            const loserUid = winnerUid ? (winnerUid === result.room.host?.uid ? result.room.guest?.uid : result.room.host?.uid) : '';
            saveMatchHistory({
                id: `chess_${roomId}_${result.room.updatedAt || nowMs()}` ,
                gameType: 'chess',
                roomId,
                status: result.room.status,
                result: result.room.winner === 'draw' ? 'draw' : 'win',
                winnerUid,
                loserUid,
                participants: [result.room.host?.uid, result.room.guest?.uid],
                rewards: { mc: safeNum(result.winAmount, 0) },
                meta: { winner: result.room.winner, move: result.moveStr || '' },
                createdAt: result.room.updatedAt || nowMs()
            }).catch(() => null);
        }

        const io = req.app.get('io');
        if (result.eloSummary?.applied && io) {
             const { buildEloSocketPayload } = require('../utils/eloSystem');
             [result.eloSummary.playerA?.uid, result.eloSummary.playerB?.uid].filter(Boolean).forEach((u) => {
                 const payload = buildEloSocketPayload(result.eloSummary, u);
                 if (payload) io.to(`user_${u}`).emit('game:elo_update', payload);
             });
        }
        if (result.winAmount > 0) {
            const winnerUid = result.room.winner === 'white' ? result.room.host?.uid : result.room.winner === 'black' ? result.room.guest?.uid : '';
            Promise.allSettled([
                winnerUid ? recordRewardLedger({ uid: winnerUid, amount: result.winAmount, source: 'chess_win', referenceId: roomId, meta: { reason: 'normal' }, idempotencyKey: `chess:${roomId}:win:${winnerUid}:normal` }) : Promise.resolve(null),
                winnerUid ? createNotification({ uid: winnerUid, type: 'reward', title: 'Satranç galibiyet ödülü', body: `${result.winAmount} MC hesabına eklendi.`, data: { source: 'chess_win', roomId, amount: result.winAmount, reason: 'normal' } }) : Promise.resolve(null)
            ]).catch(() => null);
        }
        if (result.room.status === 'finished') scheduleChessRoomRemoval(roomId);
        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/leave', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const roomId = cleanStr(req.body?.roomId || '');
        if (!roomId) throw new Error("Oda ID gerekli.");

        const result = await db.runTransaction(async (tx) => {
            const roomRef = colChess().doc(roomId); const roomSnap = await tx.get(roomRef);
            if (!roomSnap.exists) return { deleted: true };

            const room = roomSnap.data() || {};
            const isHost = room.host?.uid === uid; const isGuest = room.guest?.uid === uid;
            if (!isHost && !isGuest) throw new Error("Bu odada yetkiniz yok.");

            if (room.status === 'waiting') { tx.delete(roomRef); return { deleted: true, waiting: true }; }
            if (room.status === 'finished' || room.status === 'abandoned') return { room: { id: roomId, ...room }, alreadyClosed: true };

            room.status = 'finished'; room.winner = isHost ? 'black' : 'white'; room.updatedAt = nowMs(); applyChessCloseWindow(room); appendTimelineEntry(room, buildTimelineEvent('match_finished', { actorUid: uid, roomId, gameKey: 'chess', reason: 'leave', status: 'finished', participantUids: [cleanStr(room.host?.uid || '', 160), cleanStr(room.guest?.uid || '', 160)] })); bumpStateVersion(room);

            const winnerUid = isHost ? room.guest?.uid : room.host?.uid;
            const loserUid = isHost ? room.host?.uid : room.guest?.uid;
            const rewardConfig = await getChessRewardConfig();
            let reward = { amount: 0, limitReached: false }; let eloSummary = null;

            if (winnerUid) {
                reward = await rewardChessWinner(tx, winnerUid, rewardConfig.amount, rewardConfig.dailyCap);
                if (loserUid) {
                    await applyChessRp(tx, winnerUid, loserUid, 'A_WIN');
                    eloSummary = await applyMatchEloUpdate(tx, winnerUid, loserUid, 'chess', 1, 0);
                }
            }
            tx.update(roomRef, room);
            return { room: { id: roomId, ...room }, winAmount: reward.amount, gameOverMessage: reward.limitReached ? "Rakip masadan ayrıldı. (Günlük limit dolu)" : `Rakip masadan ayrıldı. ${reward.amount.toLocaleString('tr-TR')} MC KAZANDINIZ!`, eloSummary };
        });

        if (result?.room && !result.waiting && !result.alreadyClosed) {
            const winnerUid = result.room.winner === 'white' ? result.room.host?.uid : result.room.winner === 'black' ? result.room.guest?.uid : '';
            const loserUid = winnerUid ? (winnerUid === result.room.host?.uid ? result.room.guest?.uid : result.room.host?.uid) : '';
            saveMatchHistory({
                id: `chess_${roomId}_${result.room.updatedAt || nowMs()}` ,
                gameType: 'chess',
                roomId,
                status: result.room.status,
                result: 'leave_win',
                winnerUid,
                loserUid,
                participants: [result.room.host?.uid, result.room.guest?.uid],
                rewards: { mc: safeNum(result.winAmount, 0) },
                meta: { reason: 'leave' },
                createdAt: result.room.updatedAt || nowMs()
            }).catch(() => null);
        }

        const io = req.app.get('io');
        if (result?.eloSummary?.applied && io) {
             const { buildEloSocketPayload } = require('../utils/eloSystem');
             [result.eloSummary.playerA?.uid, result.eloSummary.playerB?.uid].filter(Boolean).forEach((u) => {
                 const payload = buildEloSocketPayload(result.eloSummary, u);
                 if (payload) io.to(`user_${u}`).emit('game:elo_update', payload);
             });
        }
        if (result?.winAmount > 0) {
            const winnerUid = result.room.winner === 'white' ? result.room.host?.uid : result.room.winner === 'black' ? result.room.guest?.uid : '';
            Promise.allSettled([
                winnerUid ? recordRewardLedger({ uid: winnerUid, amount: result.winAmount, source: 'chess_win', referenceId: roomId, meta: { reason: 'leave' }, idempotencyKey: `chess:${roomId}:win:${winnerUid}:leave` }) : Promise.resolve(null),
                winnerUid ? createNotification({ uid: winnerUid, type: 'reward', title: 'Satranç galibiyet ödülü', body: `${result.winAmount} MC hesabına eklendi.`, data: { source: 'chess_win', roomId, amount: result.winAmount, reason: 'leave' } }) : Promise.resolve(null)
            ]).catch(() => null);
        }
        if (result?.room) scheduleChessRoomRemoval(roomId);
        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/resign', verifyAuth, async (req, res) => {
    try {
        const uid = req.user.uid; const { roomId } = req.body;
        const result = await db.runTransaction(async (tx) => {
            const rSnap = await tx.get(colChess().doc(roomId));
            if (!rSnap.exists) throw new Error("Oda bulunamadı.");
            let r = rSnap.data();

            if (r.status !== 'playing') throw new Error("Oyun aktif değil.");
            let isWhite = r.host.uid === uid; let isBlack = r.guest.uid === uid;
            if (!isWhite && !isBlack) throw new Error("Yetkiniz yok.");

            r.status = 'finished'; r.winner = isWhite ? 'black' : 'white'; r.updatedAt = nowMs(); applyChessCloseWindow(r); appendTimelineEntry(r, buildTimelineEvent('match_finished', { actorUid: uid, roomId, gameKey: 'chess', reason: 'resign', status: 'finished', participantUids: [cleanStr(r.host?.uid || '', 160), cleanStr(r.guest?.uid || '', 160)] })); bumpStateVersion(r);
            const winnerUid = isWhite ? r.guest.uid : r.host.uid;
            const loserUid = isWhite ? r.host.uid : r.guest.uid;

            const rewardConfig = await getChessRewardConfig();
            const reward = await rewardChessWinner(tx, winnerUid, rewardConfig.amount, rewardConfig.dailyCap);
            const eloSummary = await applyMatchEloUpdate(tx, winnerUid, loserUid, 'chess', 1, 0);
            await applyChessRp(tx, winnerUid, loserUid, 'A_WIN');

            let winAmount = reward.amount;
            let gameOverMessage = reward.limitReached ? "Rakip Pes Etti. (Günlük Limitiniz Doldu)" : `Rakip Pes Etti. ${reward.amount.toLocaleString('tr-TR')} MC KAZANDINIZ!`;

            tx.update(colChess().doc(roomId), r);
            return { room: { id: roomId, ...r }, winAmount, gameOverMessage, eloSummary };
        });

        saveMatchHistory({
            id: `chess_${roomId}_${result.room.updatedAt || nowMs()}`,
            gameType: 'chess',
            roomId,
            status: result.room.status,
            result: 'resign_win',
            winnerUid: result.room.winner === 'white' ? result.room.host?.uid : result.room.guest?.uid,
            loserUid: result.room.winner === 'white' ? result.room.guest?.uid : result.room.host?.uid,
            participants: [result.room.host?.uid, result.room.guest?.uid],
            rewards: { mc: safeNum(result.winAmount, 0) },
            meta: { reason: 'resign' },
            createdAt: result.room.updatedAt || nowMs()
        }).catch(() => null);

        const io = req.app.get('io');
        if (result?.eloSummary?.applied && io) {
             const { buildEloSocketPayload } = require('../utils/eloSystem');
             [result.eloSummary.playerA?.uid, result.eloSummary.playerB?.uid].filter(Boolean).forEach((u) => {
                 const payload = buildEloSocketPayload(result.eloSummary, u);
                 if (payload) io.to(`user_${u}`).emit('game:elo_update', payload);
             });
        }
        if (result.winAmount > 0) {
            const winnerUid = result.room.winner === 'white' ? result.room.host?.uid : result.room.guest?.uid;
            Promise.allSettled([
                winnerUid ? recordRewardLedger({ uid: winnerUid, amount: result.winAmount, source: 'chess_win', referenceId: roomId, meta: { reason: 'resign' }, idempotencyKey: `chess:${roomId}:win:${winnerUid}:resign` }) : Promise.resolve(null),
                winnerUid ? createNotification({ uid: winnerUid, type: 'reward', title: 'Satranç galibiyet ödülü', body: `${result.winAmount} MC hesabına eklendi.`, data: { source: 'chess_win', roomId, amount: result.winAmount, reason: 'resign' } }) : Promise.resolve(null)
            ]).catch(() => null);
        }
        scheduleChessRoomRemoval(roomId);
        res.json({ ok: true, ...result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
