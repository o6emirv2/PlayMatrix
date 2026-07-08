const env = require('../config/env');
let client = null;
let connectPromise = null;
let redisModule = null;
let disabledReason = '';

function isProductionRequired() {
  return env.nodeEnv === 'production' && env.redis?.requiredInProduction !== false;
}
function safeJson(value) { try { return JSON.stringify(value); } catch (_) { return '{}'; } }
async function getRedisClient({ connect = true } = {}) {
  if (!env.redis?.url) { disabledReason = 'REDIS_URL_MISSING'; return null; }
  if (client?.isOpen) return client;
  if (!redisModule) {
    try { redisModule = require('redis'); } catch (_) { disabledReason = 'REDIS_MODULE_MISSING'; return null; }
  }
  if (!client) {
    client = redisModule.createClient({ url: env.redis.url });
    client.on('error', (error) => { disabledReason = error?.code || error?.message || 'REDIS_ERROR'; console.error('[redis:error]', JSON.stringify({ message: disabledReason })); });
  }
  if (!connect) return client;
  if (!connectPromise) connectPromise = client.connect().then(() => { disabledReason = ''; return client; }).catch((error) => { disabledReason = error?.code || error?.message || 'REDIS_CONNECT_FAILED'; return null; }).finally(() => { connectPromise = null; });
  return connectPromise;
}
async function isRedisReady() { const c = await getRedisClient(); return !!(c && c.isOpen); }
function redisUnavailablePayload() { return { ok: false, code: 'REDIS_UNAVAILABLE', error: 'REDIS_UNAVAILABLE', message: '', data: null, reason: disabledReason || (!env.redis?.url ? 'REDIS_URL_MISSING' : 'REDIS_NOT_READY') }; }
async function requireRedisReady() { if (!isProductionRequired()) return { ok: true, required: false }; if (await isRedisReady()) return { ok: true, required: true }; return redisUnavailablePayload(); }
async function setJson(key, value, ttlMs = 60000) { const c = await getRedisClient(); if (!c) return false; const ttlSec = Math.max(1, Math.ceil(Number(ttlMs || 0) / 1000)); await c.set(String(key), safeJson(value), { EX: ttlSec }); return true; }
async function getJson(key) { const c = await getRedisClient(); if (!c) return null; const raw = await c.get(String(key)); if (!raw) return null; try { return JSON.parse(raw); } catch (_) { return null; } }
async function del(key) { const c = await getRedisClient(); if (!c) return false; await c.del(String(key)); return true; }
async function setLock(key, ttlMs = 60000) { const c = await getRedisClient(); if (!c) return false; const ttlSec = Math.max(1, Math.ceil(Number(ttlMs || 0) / 1000)); const result = await c.set(String(key), '1', { NX: true, EX: ttlSec }); return result === 'OK'; }
module.exports = { getRedisClient, isRedisReady, requireRedisReady, redisUnavailablePayload, setJson, getJson, del, setLock };
