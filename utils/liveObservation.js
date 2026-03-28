'use strict';

const { cleanStr, safeNum, nowMs, clamp, sha256Hex } = require('./helpers');

const OBSERVATION_TYPES = new Set([
  'server_error',
  'js_error',
  'promise_rejection',
  'resource_error',
  'layout_shift',
  'long_task',
  'frame_stall',
  'viewport_zoom',
  'network',
  'lifecycle',
  'custom'
]);

function normalizeType(value = '') {
  const normalized = cleanStr(value || 'custom', 40).toLowerCase().replace(/[^a-z0-9_:-]+/g, '_');
  return OBSERVATION_TYPES.has(normalized) ? normalized : 'custom';
}

function normalizeSeverity(value = '', fallbackType = 'custom') {
  const normalized = cleanStr(value || '', 16).toLowerCase();
  if (['fatal', 'error', 'warn', 'info'].includes(normalized)) return normalized;
  if (fallbackType === 'server_error') return 'error';
  if (fallbackType === 'js_error' || fallbackType === 'promise_rejection' || fallbackType === 'resource_error') return 'error';
  if (fallbackType === 'viewport_zoom' || fallbackType === 'layout_shift' || fallbackType === 'long_task' || fallbackType === 'frame_stall' || fallbackType === 'network') return 'warn';
  return 'info';
}

function sanitizeSample(value = '', maxLen = 180) {
  return cleanStr(value || '', maxLen);
}

function safeObject(value = {}, limit = 12) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.entries(value).slice(0, Math.max(1, Math.min(20, limit))).forEach(([rawKey, rawValue]) => {
    const key = cleanStr(rawKey || '', 60);
    if (!key) return;
    if (typeof rawValue === 'boolean' || typeof rawValue === 'number') {
      out[key] = rawValue;
      return;
    }
    if (typeof rawValue === 'string') {
      out[key] = sanitizeSample(rawValue, 300);
      return;
    }
    if (rawValue && typeof rawValue === 'object') {
      try {
        out[key] = JSON.parse(JSON.stringify(rawValue, (_k, v) => typeof v === 'string' ? sanitizeSample(v, 160) : v));
      } catch (_) {
        out[key] = sanitizeSample(String(rawValue), 200);
      }
    }
  });
  return out;
}

function clampRounded(value, max = 100000) {
  return Number(clamp(safeNum(value, 0), 0, max).toFixed(4));
}

function buildObservationSignatureParts(row = {}) {
  return [
    row.type || 'custom',
    row.page || '',
    row.name || '',
    row.selector || '',
    row.source || '',
    row.message || ''
  ].map((part) => sanitizeSample(part, 160));
}

function buildObservationSignature(row = {}) {
  return sha256Hex(buildObservationSignatureParts(row).join('|')).slice(0, 24);
}

function normalizeObservationEvent(event = {}, envelope = {}) {
  const type = normalizeType(event.type || envelope.type || 'custom');
  const page = sanitizeSample(event.page || envelope.page || envelope.pathname || '', 120);
  const message = sanitizeSample(event.message || event.reason || event.detail || '', 500);
  const source = sanitizeSample(event.source || event.file || event.url || '', 220);
  const name = sanitizeSample(event.name || '', 120);
  const selector = sanitizeSample(event.selector || '', 180);
  const route = sanitizeSample(envelope.route || '', 160);
  const pathname = sanitizeSample(envelope.pathname || page || route || '', 160);
  const userAgent = sanitizeSample(envelope.userAgent || '', 240);
  const viewport = safeObject(event.viewport || envelope.viewport || {}, 6);
  const context = safeObject({
    ...(envelope.context && typeof envelope.context === 'object' ? envelope.context : {}),
    ...(event.context && typeof event.context === 'object' ? event.context : {})
  }, 16);

  const row = {
    type,
    severity: normalizeSeverity(event.severity, type),
    createdAt: safeNum(event.createdAt || envelope.createdAt, nowMs()),
    page,
    route,
    pathname,
    name,
    message,
    source,
    selector,
    line: safeNum(event.line, 0),
    column: safeNum(event.column, 0),
    count: Math.max(1, safeNum(event.count, 1)),
    durationMs: clampRounded(event.durationMs || event.duration),
    frameGapMs: clampRounded(event.frameGapMs),
    longTaskMs: clampRounded(event.longTaskMs || event.durationMs || event.duration),
    shiftScore: clampRounded(event.shiftScore || event.value || event.layoutShift, 1000),
    zoomScale: clampRounded(event.zoomScale || event.scale || 1, 10),
    networkState: sanitizeSample(event.networkState || envelope.networkState || '', 40),
    visibilityState: sanitizeSample(event.visibilityState || envelope.visibilityState || '', 40),
    pageLabel: sanitizeSample(event.pageLabel || envelope.pageLabel || '', 80),
    appVersion: sanitizeSample(event.appVersion || envelope.appVersion || '', 80),
    releaseId: sanitizeSample(event.releaseId || envelope.releaseId || '', 120),
    requestId: sanitizeSample(event.requestId || envelope.requestId || '', 120),
    sessionId: sanitizeSample(event.sessionId || envelope.sessionId || '', 120),
    uid: sanitizeSample(event.uid || envelope.uid || '', 180),
    userAgent,
    viewport,
    context
  };

  row.signature = buildObservationSignature(row);
  row.issueKey = `${row.type}:${row.signature}`;
  return row;
}

function buildServerErrorObservation(error, envelope = {}) {
  const err = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
  return normalizeObservationEvent({
    type: 'server_error',
    severity: envelope.fatal ? 'fatal' : 'error',
    name: err.name || 'Error',
    message: err.message || 'Unknown error',
    source: envelope.scope || 'server',
    context: {
      stack: sanitizeSample(err.stack || '', 1200),
      ...safeObject(envelope.context || {}, 18)
    }
  }, {
    page: envelope.path || envelope.scope || 'server',
    pathname: envelope.path || '',
    route: envelope.path || '',
    pageLabel: envelope.scope || 'server',
    appVersion: envelope.appVersion || '',
    releaseId: envelope.releaseId || '',
    requestId: envelope.requestId || '',
    uid: envelope.uid || '',
    userAgent: envelope.userAgent || 'server'
  });
}

function buildTypeCounts(rows = []) {
  return rows.reduce((acc, row) => {
    const key = normalizeType(row?.type || 'custom');
    acc[key] = safeNum(acc[key], 0) + 1;
    return acc;
  }, {});
}

function buildSeverityCounts(rows = []) {
  return rows.reduce((acc, row) => {
    const key = normalizeSeverity(row?.severity || '', row?.type || 'custom');
    acc[key] = safeNum(acc[key], 0) + 1;
    return acc;
  }, { fatal: 0, error: 0, warn: 0, info: 0 });
}

function topPages(rows = [], limit = 6) {
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = sanitizeSample(row?.page || row?.pathname || row?.route || 'unknown', 120) || 'unknown';
    const bucket = grouped.get(key) || { page: key, count: 0, errorCount: 0, warnCount: 0, lastSeenAt: 0 };
    bucket.count += 1;
    if (['fatal', 'error'].includes(normalizeSeverity(row?.severity, row?.type))) bucket.errorCount += 1;
    else if (normalizeSeverity(row?.severity, row?.type) === 'warn') bucket.warnCount += 1;
    bucket.lastSeenAt = Math.max(bucket.lastSeenAt, safeNum(row?.createdAt, 0));
    grouped.set(key, bucket);
  });
  return Array.from(grouped.values()).sort((a, b) => (b.errorCount - a.errorCount) || (b.count - a.count) || (b.lastSeenAt - a.lastSeenAt)).slice(0, limit);
}

function buildIssueBuckets(rows = [], limit = 10) {
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = sanitizeSample(row?.issueKey || row?.signature || buildObservationSignature(row), 60);
    if (!key) return;
    const bucket = grouped.get(key) || {
      issueKey: key,
      type: normalizeType(row?.type || 'custom'),
      severity: normalizeSeverity(row?.severity || '', row?.type || 'custom'),
      count: 0,
      firstSeenAt: 0,
      lastSeenAt: 0,
      message: sanitizeSample(row?.message || '', 280),
      page: sanitizeSample(row?.page || row?.pathname || '', 120),
      source: sanitizeSample(row?.source || '', 180),
      selector: sanitizeSample(row?.selector || '', 160),
      sample: row
    };
    bucket.count += Math.max(1, safeNum(row?.count, 1));
    const createdAt = safeNum(row?.createdAt, 0);
    bucket.firstSeenAt = bucket.firstSeenAt ? Math.min(bucket.firstSeenAt, createdAt) : createdAt;
    bucket.lastSeenAt = Math.max(bucket.lastSeenAt, createdAt);
    if (bucket.severity !== 'fatal' && normalizeSeverity(row?.severity, row?.type) === 'fatal') bucket.severity = 'fatal';
    else if (!['fatal', 'error'].includes(bucket.severity) && normalizeSeverity(row?.severity, row?.type) === 'error') bucket.severity = 'error';
    if (!bucket.message) bucket.message = sanitizeSample(row?.message || '', 280);
    grouped.set(key, bucket);
  });
  return Array.from(grouped.values())
    .sort((a, b) => {
      const severityRank = { fatal: 4, error: 3, warn: 2, info: 1 };
      return (severityRank[b.severity] - severityRank[a.severity]) || (b.count - a.count) || (b.lastSeenAt - a.lastSeenAt);
    })
    .slice(0, limit)
    .map((bucket) => ({
      issueKey: bucket.issueKey,
      type: bucket.type,
      severity: bucket.severity,
      count: bucket.count,
      firstSeenAt: bucket.firstSeenAt,
      lastSeenAt: bucket.lastSeenAt,
      message: bucket.message,
      page: bucket.page,
      source: bucket.source,
      selector: bucket.selector
    }));
}

function buildVitals(rows = []) {
  const vitals = {
    layoutShiftEvents: 0,
    cumulativeLayoutShift: 0,
    longTaskEvents: 0,
    worstLongTaskMs: 0,
    frameStallEvents: 0,
    worstFrameGapMs: 0,
    viewportZoomEvents: 0,
    worstZoomScale: 1,
    serverErrors: 0,
    clientErrors: 0
  };

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const type = normalizeType(row?.type || 'custom');
    if (type === 'layout_shift') {
      vitals.layoutShiftEvents += 1;
      vitals.cumulativeLayoutShift = Number((vitals.cumulativeLayoutShift + clampRounded(row?.shiftScore, 1000)).toFixed(4));
    }
    if (type === 'long_task') {
      vitals.longTaskEvents += 1;
      vitals.worstLongTaskMs = Math.max(vitals.worstLongTaskMs, clampRounded(row?.longTaskMs || row?.durationMs, 100000));
    }
    if (type === 'frame_stall') {
      vitals.frameStallEvents += 1;
      vitals.worstFrameGapMs = Math.max(vitals.worstFrameGapMs, clampRounded(row?.frameGapMs, 100000));
    }
    if (type === 'viewport_zoom') {
      vitals.viewportZoomEvents += 1;
      vitals.worstZoomScale = Math.max(vitals.worstZoomScale, clampRounded(row?.zoomScale || 1, 10));
    }
    if (type === 'server_error') vitals.serverErrors += 1;
    if (['js_error', 'promise_rejection', 'resource_error'].includes(type)) vitals.clientErrors += 1;
  });

  return vitals;
}

function buildStatus(severityCounts = {}, vitals = {}) {
  if (safeNum(severityCounts.fatal, 0) > 0) return { tone: 'error', label: 'Kritik' };
  if (safeNum(severityCounts.error, 0) > 0 || safeNum(vitals.worstLongTaskMs, 0) >= 800 || safeNum(vitals.viewportZoomEvents, 0) > 0) {
    return { tone: 'error', label: 'Müdahale gerekli' };
  }
  if (safeNum(severityCounts.warn, 0) > 0 || safeNum(vitals.cumulativeLayoutShift, 0) >= 0.12 || safeNum(vitals.worstFrameGapMs, 0) >= 250) {
    return { tone: 'warn', label: 'İzleniyor' };
  }
  return { tone: 'ok', label: 'Stabil' };
}

function buildLiveObservationSnapshot(options = {}) {
  const currentTs = safeNum(options.now, nowMs());
  const lookbackMs = Math.max(60 * 1000, safeNum(options.lookbackMs, 6 * 60 * 60 * 1000));
  const rows = (Array.isArray(options.rows) ? options.rows : [])
    .filter((row) => row && safeNum(row.createdAt, 0) >= (currentTs - lookbackMs))
    .sort((a, b) => safeNum(b.createdAt, 0) - safeNum(a.createdAt, 0));

  const severity = buildSeverityCounts(rows);
  const byType = buildTypeCounts(rows);
  const vitals = buildVitals(rows);
  const issues = buildIssueBuckets(rows, 12);
  const pages = topPages(rows, 8);
  const status = buildStatus(severity, vitals);

  return {
    ok: true,
    generatedAt: currentTs,
    lookbackMs,
    count: rows.length,
    status,
    severity,
    byType,
    vitals,
    topPages: pages,
    issues,
    recent: rows.slice(0, Math.max(1, Math.min(60, safeNum(options.recentLimit, 30))))
  };
}

module.exports = {
  normalizeType,
  normalizeSeverity,
  buildObservationSignature,
  normalizeObservationEvent,
  buildServerErrorObservation,
  buildLiveObservationSnapshot
};
