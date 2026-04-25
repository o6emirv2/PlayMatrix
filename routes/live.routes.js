'use strict';

const express = require('express');

const { db } = require('../config/firebase');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { cleanStr, safeNum } = require('../utils/helpers');
const { touchUserActivity, IDLE_TIMEOUT_MS } = require('../utils/activity');

const router = express.Router();
const colChess = () => db.collection('chess_rooms');
const colOnlinePisti = () => db.collection('pisti_online_rooms');
const colMatchHistory = () => db.collection('match_history');

async function findLiveSession(uid) {
  const [chessSnap, pistiSnap] = await Promise.all([
    colChess().orderBy('updatedAt', 'desc').limit(40).get(),
    colOnlinePisti().orderBy('updatedAt', 'desc').limit(40).get()
  ]);

  const chessDoc = chessSnap.docs.find((doc) => {
    const data = doc.data() || {};
    const status = cleanStr(data.status || '', 24);
    if (!['waiting', 'playing'].includes(status)) return false;
    return cleanStr(data.host?.uid || '', 160) === uid || cleanStr(data.guest?.uid || '', 160) === uid;
  });

  if (chessDoc) {
    const data = chessDoc.data() || {};
    return {
      ok: true,
      session: {
        gameType: 'chess',
        roomId: chessDoc.id,
        gamePath: '/Online Oyunlar/Satranc.html',
        role: cleanStr(data.host?.uid || '', 160) === uid ? 'host' : 'guest',
        status: cleanStr(data.status || '', 24)
      }
    };
  }


  const pistiDoc = pistiSnap.docs.find((doc) => {
    const data = doc.data() || {};
    const status = cleanStr(data.status || '', 24);
    return ['waiting', 'playing'].includes(status) && Array.isArray(data.players) && data.players.some((player) => cleanStr(player?.uid || '', 160) === uid);
  });

  if (pistiDoc) {
    const data = pistiDoc.data() || {};
    const roleIndex = Array.isArray(data.players) ? data.players.findIndex((player) => cleanStr(player?.uid || '', 160) === uid) : -1;
    return {
      ok: true,
      session: {
        gameType: 'pisti',
        roomId: pistiDoc.id,
        gamePath: '/Online Oyunlar/Pisti.html',
        role: roleIndex === 0 ? 'host' : 'guest',
        status: cleanStr(data.status || '', 24)
      }
    };
  }

  return { ok: true, session: null };
}

router.get('/me/live-session', verifyAuth, async (req, res) => {
  try {
    const result = await findLiveSession(req.user.uid);
    res.json(result);
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Aktif oturum bilgisi alınamadı.' });
  }
});

router.get('/me/match-history', verifyAuth, async (req, res) => {
  try {
    const [customSnap] = await Promise.all([
      colMatchHistory().where('participants', 'array-contains', req.user.uid).orderBy('createdAt', 'desc').limit(30).get().catch(() => ({ docs: [] }))
    ]);

    const matchHistory = customSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const combined = [...matchHistory]
      .sort((a, b) => safeNum(b.createdAt, 0) - safeNum(a.createdAt, 0))
      .slice(0, 40);

    res.json({ ok: true, history: combined });
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Maç geçmişi yüklenemedi.' });
  }
});

module.exports = router;
