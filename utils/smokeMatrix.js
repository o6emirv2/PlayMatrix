'use strict';

const { cleanStr, safeNum, nowMs } = require('./helpers');

const DEVICE_BROWSER_PROFILES = Object.freeze([
  {
    id: 'ios-safari-390',
    label: 'iPhone 12/13 · Safari',
    browser: 'Safari',
    platform: 'iOS',
    deviceClass: 'mobile',
    priority: 'critical',
    viewport: { width: 390, height: 844, scale: 1 },
    requiredChecks: ['no_horizontal_shift', 'no_double_tap_zoom', 'safe_area_fit', 'stable_fps', 'no_layout_break']
  },
  {
    id: 'ios-safari-430',
    label: 'iPhone Pro Max · Safari',
    browser: 'Safari',
    platform: 'iOS',
    deviceClass: 'mobile',
    priority: 'critical',
    viewport: { width: 430, height: 932, scale: 1 },
    requiredChecks: ['no_horizontal_shift', 'no_double_tap_zoom', 'safe_area_fit', 'stable_fps', 'cta_reachability']
  },
  {
    id: 'android-chrome-412',
    label: 'Android · Chrome',
    browser: 'Chrome',
    platform: 'Android',
    deviceClass: 'mobile',
    priority: 'critical',
    viewport: { width: 412, height: 915, scale: 1 },
    requiredChecks: ['no_horizontal_shift', 'no_double_tap_zoom', 'touch_latency_budget', 'runtime_overlay_safe']
  },
  {
    id: 'android-samsung-360',
    label: 'Android · Samsung Internet',
    browser: 'Samsung Internet',
    platform: 'Android',
    deviceClass: 'mobile',
    priority: 'high',
    viewport: { width: 360, height: 800, scale: 1 },
    requiredChecks: ['no_horizontal_shift', 'no_double_tap_zoom', 'text_scale_safe', 'sheet_scroll_safe']
  },
  {
    id: 'ipad-safari-820',
    label: 'iPad · Safari',
    browser: 'Safari',
    platform: 'iPadOS',
    deviceClass: 'tablet',
    priority: 'high',
    viewport: { width: 820, height: 1180, scale: 1 },
    requiredChecks: ['tablet_grid_fit', 'no_layout_break', 'stable_modal_scroll']
  },
  {
    id: 'desktop-chrome-1440',
    label: 'Desktop · Chrome',
    browser: 'Chrome',
    platform: 'Windows/macOS',
    deviceClass: 'desktop',
    priority: 'critical',
    viewport: { width: 1440, height: 900, scale: 1 },
    requiredChecks: ['hero_grid_fit', 'no_console_break', 'stable_runtime_poll']
  },
  {
    id: 'desktop-edge-1366',
    label: 'Desktop · Edge',
    browser: 'Edge',
    platform: 'Windows',
    deviceClass: 'desktop',
    priority: 'high',
    viewport: { width: 1366, height: 768, scale: 1 },
    requiredChecks: ['hero_grid_fit', 'responsive_nav', 'stable_runtime_poll']
  },
  {
    id: 'desktop-firefox-1440',
    label: 'Desktop · Firefox',
    browser: 'Firefox',
    platform: 'Windows/macOS',
    deviceClass: 'desktop',
    priority: 'high',
    viewport: { width: 1440, height: 900, scale: 1 },
    requiredChecks: ['hero_grid_fit', 'css_fallback_safe', 'stable_modal_scroll']
  }
]);

const SMOKE_SURFACES = Object.freeze([
  { id: 'home', label: 'Ana sayfa', path: '/', critical: true, categories: ['all'] },
  { id: 'auth-session', label: 'Oturum / Profil', path: '/api/auth/session/status', critical: true, categories: ['all'] },
  { id: 'admin-health', label: 'Admin Health', path: '/ops/health', critical: true, categories: ['admin', 'desktop', 'tablet'] },
  { id: 'crash', label: 'Crash', path: '/Online Oyunlar/Crash.html', critical: true, categories: ['games', 'all'] },
  { id: 'chess', label: 'Satranç', path: '/Online Oyunlar/Satranc.html', critical: true, categories: ['games', 'all'] },
  { id: 'pisti-online', label: 'Online Pişti', path: '/Online Oyunlar/Pisti.html', critical: true, categories: ['games', 'all'] },
  { id: 'mines', label: 'Mines', path: '/Casino/Mines.html', critical: true, categories: ['games', 'all'] },
  { id: 'blackjack', label: 'BlackJack', path: '/Casino/BlackJack.html', critical: true, categories: ['games', 'all'] },
  { id: 'pattern-master', label: 'Pattern Master', path: '/Klasik Oyunlar/PatternMaster.html', critical: false, categories: ['classic', 'all'] },
  { id: 'snake-pro', label: 'Snake Pro', path: '/Klasik Oyunlar/SnakePro.html', critical: false, categories: ['classic', 'all'] },
  { id: 'space-pro', label: 'Space Pro', path: '/Klasik Oyunlar/SpacePro.html', critical: false, categories: ['classic', 'all'] },
  { id: 'matrix-2048', label: 'Matrix 2048', path: '/Klasik Oyunlar/Matrix2048.html', critical: false, categories: ['classic', 'all'] },
  { id: 'memory-flip', label: 'Memory Flip', path: '/Klasik Oyunlar/MemoryFlip.html', critical: false, categories: ['classic', 'all'] },
  { id: 'tic-tac-arena', label: 'TicTac Arena', path: '/Klasik Oyunlar/TicTacArena.html', critical: false, categories: ['classic', 'all'] }
]);

const DEFAULT_SMOKE_MATRIX_CONFIG = Object.freeze({
  cases: {},
  updatedAt: 0,
  updatedBy: ''
});

function sanitizeStatus(value = '', fallback = 'pending') {
  const normalized = cleanStr(value || '', 16).toLowerCase();
  return ['pass', 'warn', 'fail', 'pending'].includes(normalized) ? normalized : fallback;
}

function sanitizeCaseUpdate(value = {}, actorUid = '') {
  if (!value || typeof value !== 'object') return null;
  return {
    status: sanitizeStatus(value.status, 'pending'),
    note: cleanStr(value.note || value.notes || '', 280),
    testedAt: safeNum(value.testedAt || nowMs(), nowMs()),
    testedBy: cleanStr(value.testedBy || actorUid || '', 160),
    build: cleanStr(value.build || '', 120)
  };
}

function normalizeSmokeMatrixConfig(input = {}, actorUid = '') {
  const cases = {};
  Object.entries(input?.cases && typeof input.cases === 'object' ? input.cases : {}).forEach(([caseId, value]) => {
    const safeCaseId = cleanStr(caseId || '', 120);
    const update = sanitizeCaseUpdate(value, actorUid);
    if (safeCaseId && update) cases[safeCaseId] = update;
  });
  return {
    cases,
    updatedAt: safeNum(input.updatedAt, 0),
    updatedBy: cleanStr(input.updatedBy || actorUid || '', 160)
  };
}

function classifyObservationProfile(row = {}) {
  const ua = String(row?.userAgent || '').toLowerCase();
  const width = safeNum(row?.viewport?.width, 0);
  if (ua.includes('samsungbrowser')) return 'android-samsung-360';
  if ((ua.includes('iphone') || ua.includes('ios')) && !ua.includes('crios') && !ua.includes('edgios')) {
    return width >= 428 ? 'ios-safari-430' : 'ios-safari-390';
  }
  if (ua.includes('ipad')) return 'ipad-safari-820';
  if (ua.includes('android') && ua.includes('chrome')) return 'android-chrome-412';
  if (ua.includes('firefox')) return 'desktop-firefox-1440';
  if (ua.includes('edg')) return 'desktop-edge-1366';
  if (ua.includes('chrome')) return 'desktop-chrome-1440';
  if (ua.includes('safari')) return width >= 700 ? 'ipad-safari-820' : 'ios-safari-390';
  return width >= 700 ? 'desktop-chrome-1440' : 'android-chrome-412';
}

function createDefaultMatrixCases() {
  const cases = [];
  DEVICE_BROWSER_PROFILES.forEach((profile) => {
    SMOKE_SURFACES.forEach((surface) => {
      if (surface.id === 'admin-health' && !['desktop', 'tablet'].includes(profile.deviceClass)) return;
      const caseId = `${profile.id}::${surface.id}`;
      cases.push({
        caseId,
        profileId: profile.id,
        surfaceId: surface.id,
        profileLabel: profile.label,
        surfaceLabel: surface.label,
        browser: profile.browser,
        platform: profile.platform,
        deviceClass: profile.deviceClass,
        priority: surface.critical || profile.priority === 'critical' ? 'critical' : profile.priority,
        path: surface.path,
        checks: profile.requiredChecks.slice(0, 8),
        critical: !!surface.critical
      });
    });
  });
  return cases;
}

function summarizeObservationSignals(rows = []) {
  const signals = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const profileId = classifyObservationProfile(row);
    const bucket = signals.get(profileId) || {
      profileId,
      zoomEvents: 0,
      layoutShiftEvents: 0,
      longTaskEvents: 0,
      severeEvents: 0,
      lastSeenAt: 0
    };
    const type = String(row?.type || '').toLowerCase();
    const severity = String(row?.severity || '').toLowerCase();
    if (type === 'viewport_zoom') bucket.zoomEvents += 1;
    if (type === 'layout_shift') bucket.layoutShiftEvents += 1;
    if (type === 'long_task' || type === 'frame_stall') bucket.longTaskEvents += 1;
    if (severity === 'fatal' || severity === 'error') bucket.severeEvents += 1;
    bucket.lastSeenAt = Math.max(bucket.lastSeenAt, safeNum(row?.createdAt, 0));
    signals.set(profileId, bucket);
  });
  return Object.fromEntries(Array.from(signals.entries()));
}

function deriveAutoStatus(caseItem = {}, signal = null) {
  if (!signal) return 'pending';
  if (signal.severeEvents > 0 || signal.zoomEvents > 0) return 'warn';
  if (signal.layoutShiftEvents > 0 || signal.longTaskEvents > 1) return 'warn';
  return 'pending';
}

function buildSmokeMatrixSnapshot(options = {}) {
  const config = normalizeSmokeMatrixConfig(options.config || DEFAULT_SMOKE_MATRIX_CONFIG);
  const observationSignals = summarizeObservationSignals(options.observations || []);
  const cases = createDefaultMatrixCases().map((item) => {
    const override = config.cases[item.caseId] || null;
    const signal = observationSignals[item.profileId] || null;
    const status = override?.status || deriveAutoStatus(item, signal);
    return {
      ...item,
      status,
      note: cleanStr(override?.note || '', 280),
      testedAt: safeNum(override?.testedAt, 0),
      testedBy: cleanStr(override?.testedBy || '', 160),
      build: cleanStr(override?.build || '', 120),
      autoSignal: signal
    };
  });

  const summary = cases.reduce((acc, item) => {
    acc.total += 1;
    acc[item.status] += 1;
    if (item.priority === 'critical') {
      acc.criticalTotal += 1;
      if (item.status === 'pass') acc.criticalPassed += 1;
      if (item.status === 'pending') acc.criticalPending += 1;
      if (item.status === 'fail') acc.criticalFailed += 1;
      if (item.status === 'warn') acc.criticalWarn += 1;
    }
    return acc;
  }, {
    total: 0,
    pass: 0,
    warn: 0,
    fail: 0,
    pending: 0,
    criticalTotal: 0,
    criticalPassed: 0,
    criticalPending: 0,
    criticalFailed: 0,
    criticalWarn: 0
  });

  summary.coveragePct = summary.total ? Math.round((summary.pass / summary.total) * 100) : 0;
  summary.criticalCoveragePct = summary.criticalTotal ? Math.round((summary.criticalPassed / summary.criticalTotal) * 100) : 0;
  summary.status = summary.fail > 0
    ? 'blocked'
    : summary.warn > 0
      ? 'attention'
      : summary.pending > 0
        ? 'pending'
        : 'ready';
  summary.label = summary.status === 'blocked'
    ? 'Smoke matrisi bloklu'
    : summary.status === 'attention'
      ? 'Smoke matrisi dikkat istiyor'
      : summary.status === 'pending'
        ? 'Smoke matrisi tamamlanmayı bekliyor'
        : 'Smoke matrisi hazır';

  return {
    generatedAt: nowMs(),
    profiles: DEVICE_BROWSER_PROFILES.map((item) => ({ ...item })),
    surfaces: SMOKE_SURFACES.map((item) => ({ ...item })),
    summary,
    observationSignals,
    cases,
    configMeta: {
      updatedAt: safeNum(config.updatedAt, 0),
      updatedBy: cleanStr(config.updatedBy || '', 160)
    }
  };
}

module.exports = {
  DEVICE_BROWSER_PROFILES,
  SMOKE_SURFACES,
  DEFAULT_SMOKE_MATRIX_CONFIG,
  sanitizeStatus,
  sanitizeCaseUpdate,
  normalizeSmokeMatrixConfig,
  classifyObservationProfile,
  summarizeObservationSignals,
  buildSmokeMatrixSnapshot
};
