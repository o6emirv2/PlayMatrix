'use strict';

const rateLimit = require('express-rate-limit');

function buildLimiter(windowMs, max, message, overrides = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    requestPropertyName: 'rateLimitInfo',
    skip: (req) => {
      if (typeof overrides.skip === 'function' && overrides.skip(req)) return true;
      return false;
    },
    keyGenerator: overrides.keyGenerator,
    message,
    ...overrides
  });
}

const authPathMatcher = /^\/api\/auth(?:\/|$)/i;
const healthPathMatcher = /^(?:\/healthz|\/api\/healthz)(?:\/|$)?/i;

const apiLimiter = buildLimiter(
  60 * 1000,
  240,
  { ok: false, error: 'API istek limiti aşıldı.' },
  {
    skip: (req) => healthPathMatcher.test(String(req.path || req.originalUrl || ''))
  }
);

const authLimiter = buildLimiter(
  15 * 60 * 1000,
  50,
  { ok: false, error: 'Giriş / oturum işlemi limiti aşıldı.' },
  {
    skip: (req) => !authPathMatcher.test(String(req.baseUrl || '') + String(req.path || ''))
  }
);

const bjActionLimiter = buildLimiter(10 * 1000, 25, { ok: false, error: 'Spam engellendi.' });
const bonusLimiter = buildLimiter(15 * 60 * 1000, 5, { ok: false, error: 'Limit aşıldı.' });
const profileLimiter = buildLimiter(60 * 1000, 12, { ok: false, error: 'Çok fazla profil işlemi yaptınız, 1 dakika bekleyin.' });
const supportLimiter = buildLimiter(5 * 60 * 1000, 10, { ok: false, error: 'Destek isteği limiti aşıldı.' });
const adminLimiter = buildLimiter(60 * 1000, 180, { ok: false, error: 'Yönetici işlem limiti aşıldı.' });

module.exports = {
  apiLimiter,
  authLimiter,
  bjActionLimiter,
  bonusLimiter,
  profileLimiter,
  supportLimiter,
  adminLimiter
};
