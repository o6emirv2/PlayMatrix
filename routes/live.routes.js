'use strict';

const express = require('express');

const { db } = require('../config/firebase');
const { verifyAuth, tryVerifyOptionalAuth } = require('../middlewares/auth.middleware');
const { cleanStr, safeNum } = require('../utils/helpers');

const { touchUserActivity, IDLE_TIMEOUT_MS } = require('../utils/activity');
const { storeClientObservationEnvelope } = require('../utils/liveObservationStore');
const { buildLiveObservationSnapshot } = require('../utils/liveObservation');

const router = express.Router();
const colChess = () => db.collection('chess_rooms');
const colOnlinePisti = () => db.collection('pisti_online_rooms');
const colBjHistory = () => db.collection('bj_history');
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


router.post('/live/observe/client', async (req, res) => {
  try {
    const authUser = await tryVerifyOptionalAuth(req).catch(() => null);
    const rows = await storeClientObservationEnvelope(req.body || {}, {
      uid: cleanStr(authUser?.uid || '', 180),
      page: cleanStr(req.body?.page || req.body?.pathname || '', 120),
      pathname: cleanStr(req.body?.pathname || '', 160),
      route: cleanStr(req.body?.route || req.originalUrl || '', 160),
      pageLabel: cleanStr(req.body?.pageLabel || '', 80),
      appVersion: cleanStr(req.body?.appVersion || '', 80),
      releaseId: cleanStr(req.headers['x-playmatrix-release-id'] || req.body?.releaseId || '', 120),
      requestId: cleanStr(req.requestId || '', 120),
      sessionId: cleanStr(req.body?.sessionId || '', 120),
      userAgent: cleanStr(req.headers['user-agent'] || '', 240),
      networkState: cleanStr(req.body?.networkState || '', 40),
      visibilityState: cleanStr(req.body?.visibilityState || '', 40),
      viewport: req.body?.viewport && typeof req.body.viewport === 'object' ? req.body.viewport : {},
      context: req.body?.context && typeof req.body.context === 'object' ? req.body.context : {}
    });

    const snapshot = buildLiveObservationSnapshot({ rows, lookbackMs: 60 * 60 * 1000, recentLimit: 5 });
    return res.status(202).json({ ok: true, ingested: rows.length, summary: snapshot.status, requestId: req.requestId || null });
  } catch (_error) {
    return res.status(400).json({ ok: false, error: 'Canlı gözlem verisi alınamadı.' });
  }
});

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
    const [customSnap, bjSnap] = await Promise.all([
      colMatchHistory().where('participants', 'array-contains', req.user.uid).orderBy('createdAt', 'desc').limit(30).get().catch(() => ({ docs: [] })),
      colBjHistory().where('uid', '==', req.user.uid).orderBy('createdAt', 'desc').limit(20).get().catch(() => ({ docs: [] }))
    ]);

    const matchHistory = customSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const bjHistory = bjSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}), gameType: 'blackjack' }));
    const combined = [...matchHistory, ...bjHistory]
      .sort((a, b) => safeNum(b.createdAt, 0) - safeNum(a.createdAt, 0))
      .slice(0, 40);

    res.json({ ok: true, history: combined });
  } catch (_error) {
    res.status(500).json({ ok: false, error: 'Maç geçmişi yüklenemedi.' });
  }
});

module.exports = router;