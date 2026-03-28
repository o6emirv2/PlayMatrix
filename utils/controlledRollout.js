'use strict';

const { cleanStr, safeNum, clamp, nowMs } = require('./helpers');

const DEFAULT_CONTROLLED_ROLLOUT = Object.freeze({
  enabled: true,
  mode: 'canary',
  publicTrafficPercent: 10,
  stage: 'internal',
  blockOnRegressionLock: true,
  allowVip: true,
  allowBeta: true,
  allowInternal: true,
  notes: [
    'Önce iç ekip ve beta kohortu ile doğrula.',
    'Smoke matrisi ve regresyon kilidi temiz olmadan yüzde artırma yapma.'
  ],
  updatedAt: 0,
  updatedBy: ''
});

function sanitizeMode(value = '', fallback = 'canary') {
  const normalized = cleanStr(value || '', 24).toLowerCase();
  return ['internal', 'canary', 'gradual', 'live', 'paused'].includes(normalized) ? normalized : fallback;
}

function sanitizeStage(value = '', fallback = 'internal') {
  const normalized = cleanStr(value || '', 24).toLowerCase();
  return ['internal', 'beta', 'vip', 'public'].includes(normalized) ? normalized : fallback;
}

function sanitizeControlledRollout(input = {}, actorUid = '') {
  const notes = Array.isArray(input.notes) ? input.notes : DEFAULT_CONTROLLED_ROLLOUT.notes;
  return {
    enabled: input.enabled !== false,
    mode: sanitizeMode(input.mode, DEFAULT_CONTROLLED_ROLLOUT.mode),
    publicTrafficPercent: Math.round(clamp(safeNum(input.publicTrafficPercent, DEFAULT_CONTROLLED_ROLLOUT.publicTrafficPercent), 0, 100)),
    stage: sanitizeStage(input.stage, DEFAULT_CONTROLLED_ROLLOUT.stage),
    blockOnRegressionLock: input.blockOnRegressionLock !== false,
    allowVip: input.allowVip !== false,
    allowBeta: input.allowBeta !== false,
    allowInternal: input.allowInternal !== false,
    notes: notes.map((note) => cleanStr(note || '', 160)).filter(Boolean).slice(0, 8),
    updatedAt: safeNum(input.updatedAt || nowMs(), 0),
    updatedBy: cleanStr(input.updatedBy || actorUid || '', 160)
  };
}

function buildControlledRolloutSnapshot(options = {}) {
  const config = sanitizeControlledRollout(options.config || DEFAULT_CONTROLLED_ROLLOUT, options.actorUid || '');
  const gate = options.gate && typeof options.gate === 'object' ? options.gate : {};
  const release = options.release && typeof options.release === 'object' ? options.release : {};
  const locked = !!gate.locked && config.blockOnRegressionLock;
  const stageLabel = config.stage === 'public' ? 'Genel Trafik' : config.stage === 'vip' ? 'VIP + İç Kohort' : config.stage === 'beta' ? 'Beta Kohortu' : 'İç Ekip';
  const modeLabel = config.mode === 'live'
    ? 'Tam Canlı'
    : config.mode === 'gradual'
      ? 'Kademeli Açılış'
      : config.mode === 'paused'
        ? 'Durduruldu'
        : config.mode === 'internal'
          ? 'İç Doğrulama'
          : 'Canary';
  return {
    ...config,
    releaseId: cleanStr(release.releaseId || '', 120),
    phase: cleanStr(release.phase || '', 80),
    locked,
    modeLabel,
    stageLabel,
    exposureLabel: `${config.publicTrafficPercent}% kamu trafiği`,
    summaryLabel: locked
      ? 'Regresyon kilidi nedeniyle rollout bloklu.'
      : `${modeLabel} · ${stageLabel} · ${config.publicTrafficPercent}% trafik`,
    cohorts: {
      internal: !!config.allowInternal,
      beta: !!config.allowBeta,
      vip: !!config.allowVip,
      public: config.publicTrafficPercent > 0
    }
  };
}

module.exports = {
  DEFAULT_CONTROLLED_ROLLOUT,
  sanitizeMode,
  sanitizeStage,
  sanitizeControlledRollout,
  buildControlledRolloutSnapshot
};
