const { TtlStore } = require('../core/runtimeStore');

const toInt = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const LOG_MAX = toInt(process.env.RUNTIME_LOG_MAX, 1500, 100, 5000);
const LOG_RETENTION_HOURS = toInt(process.env.RUNTIME_LOG_RETENTION_HOURS, 168, 1, 168);
const DUPLICATE_WINDOW_MS = toInt(process.env.RUNTIME_LOG_DUPLICATE_WINDOW_MS, 60000, 5000, 600000);
const logs = new TtlStore({ ttlMs: LOG_RETENTION_HOURS * 60 * 60 * 1000, max: LOG_MAX });
const duplicateIndex = new Map();
const SECRET_KEY_PATTERN = /(token|secret|password|pass|private|key|authorization|cookie|serviceAccount|hash|salt|thirdFactor|firebase_key|admin_panel|session)/i;

function clip(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max);
}

function sanitizeString(value, max = 800) {
  return clip(value, max)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[MASKED]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[FIREBASE_API_KEY_MASKED]')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[PRIVATE_KEY_MASKED]')
    .replace(/"private_key"\s*:\s*"[^"]+"/gi, '"private_key":"[MASKED]"')
    .replace(/"client_email"\s*:\s*"[^"]+"/gi, '"client_email":"[MASKED]"');
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[TRUNCATED]';
  if (value == null) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return sanitizeString(value, 800);
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 60)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[MASKED]' : sanitizeValue(entry, depth + 1);
    }
    return out;
  }
  return sanitizeString(value, 200);
}

function normalizeLevel(value) {
  const raw = String(value || 'info').toLowerCase();
  if (raw === 'warn') return 'warning';
  return ['debug', 'info', 'warning', 'error', 'critical'].includes(raw) ? raw : 'info';
}

function dedupeKey(row) {
  return [row.level, row.source, row.category, row.code, row.message].join('|').slice(0, 700);
}

function writeConsole(row, duplicate = false) {
  if (!['warning', 'error', 'critical'].includes(row.level)) return;
  const method = row.level === 'error' || row.level === 'critical' ? console.error : console.warn;
  method('[admin:runtime]', JSON.stringify({
    event: row.event,
    level: row.level,
    source: row.source,
    category: row.category,
    code: row.code,
    message: row.message,
    duplicate,
    count: row.count,
    at: row.at
  }));
}

function addAdminLog(event, payload = {}) {
  const safePayload = sanitizeValue(payload) || {};
  const row = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    event: clip(event || safePayload.event || 'runtime.event', 120),
    level: normalizeLevel(safePayload.level || safePayload.severity),
    source: clip(safePayload.source || safePayload.area || 'system', 80),
    category: clip(safePayload.category || safePayload.scope || event || 'runtime', 120),
    code: clip(safePayload.code || event || 'RUNTIME_LOG', 80),
    message: clip(safePayload.message || safePayload.error || event || 'Runtime log', 500),
    safeContext: safePayload.safeContext || safePayload,
    payload: safePayload,
    count: 1,
    firstAt: Date.now(),
    lastAt: Date.now(),
    at: Date.now(),
    timestamp: new Date().toJSON()
  };
  const key = dedupeKey(row);
  const now = Date.now();
  const duplicate = duplicateIndex.get(key);
  if (duplicate && (now - duplicate.lastAt) <= DUPLICATE_WINDOW_MS) {
    const existing = logs.get(duplicate.id);
    if (existing) {
      existing.count = Number(existing.count || 1) + 1;
      existing.lastAt = now;
      existing.at = now;
      existing.timestamp = new Date().toJSON();
      existing.safeContext = sanitizeValue({ ...(existing.safeContext || {}), duplicateCount: existing.count, lastDuplicateAt: now });
      logs.set(existing.id, existing);
      duplicate.lastAt = now;
      duplicateIndex.set(key, duplicate);
      writeConsole(existing, true);
      return existing;
    }
  }
  logs.set(row.id, row);
  duplicateIndex.set(key, { id: row.id, lastAt: now });
  if (duplicateIndex.size > LOG_MAX * 2) {
    for (const [entryKey, entry] of duplicateIndex) {
      if ((now - entry.lastAt) > DUPLICATE_WINDOW_MS * 5) duplicateIndex.delete(entryKey);
    }
  }
  writeConsole(row, false);
  return row;
}

function listAdminLogs() {
  return logs.values().sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
}

function getRuntimeLogPolicy() {
  return { max: LOG_MAX, retentionHours: LOG_RETENTION_HOURS, duplicateWindowMs: DUPLICATE_WINDOW_MS };
}

module.exports = { addAdminLog, listAdminLogs, sanitizeRuntimeLogPayload: sanitizeValue, getRuntimeLogPolicy };
