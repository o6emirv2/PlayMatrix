'use strict';

const express = require('express');

const profileRoutes = require('./profile.routes');
const socialRoutes = require('./social.routes');
const supportRoutes = require('./support.routes');
const adminRoutes = require('./admin.routes');
const liveRoutes = require('./live.routes');
const blackjackRoutes = require('./blackjack.routes');
const crashRoutes = require('./crash.routes');
const minesRoutes = require('./mines.routes');
const chessRoutes = require('./chess.routes');
const pistiRoutes = require('./pisti.routes');
const chatRoutes = require('./chat.routes');
const partyRoutes = require('./party.routes');
const socialCenterRoutes = require('./socialcenter.routes');
const { DEFAULT_FEATURE_FLAGS } = require('../config/featureFlags');
const { getPublicFeatureFlags } = require('../utils/featureFlags');

const router = express.Router();

router.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'PlayMatrix API',
    uptimeSec: Math.round(process.uptime()),
    timestamp: Date.now(),
    featureFlags: getPublicFeatureFlags(DEFAULT_FEATURE_FLAGS)
  });
});

router.use('/me', (req, res, next) => {
  if (req.path === '/') {
    req.url = '/';
    return profileRoutes(req, res, next);
  }
  return next();
});

router.use('/', profileRoutes);
router.use('/profile', profileRoutes);

router.use('/', socialRoutes);
router.use('/', supportRoutes);
router.use('/', liveRoutes);
router.use('/', adminRoutes);
router.use('/', chatRoutes);
router.use('/', partyRoutes);
router.use('/', socialCenterRoutes);

router.use('/bj', blackjackRoutes);
router.use('/crash', crashRoutes);
router.use('/mines', minesRoutes);
router.use('/chess', chessRoutes);
router.use('/pisti', pistiRoutes);
router.use('/pisti-online', (req, res, next) => {
  req.url = `/online${req.url}`;
  return pistiRoutes(req, res, next);
});

module.exports = router;
