'use strict';

const { safeNum, cleanStr, nowMs } = require('./helpers');

function buildReleaseGateSnapshot(options = {}) {
  const smokeMatrix = options.smokeMatrix && typeof options.smokeMatrix === 'object' ? options.smokeMatrix : { summary: {} };
  const liveObservation = options.liveObservation && typeof options.liveObservation === 'object' ? options.liveObservation : { status: {}, vitals: {}, severity: {} };
  const opsHealth = options.opsHealth && typeof options.opsHealth === 'object' ? options.opsHealth : { errorSummary: {} };
  const release = options.release && typeof options.release === 'object' ? options.release : {};
  const rollout = options.rollout && typeof options.rollout === 'object' ? options.rollout : {};
  const featureFlags = options.featureFlags && typeof options.featureFlags === 'object' ? options.featureFlags : {};

  const blockers = [];
  const warnings = [];

  if (featureFlags.maintenanceMode === true) blockers.push('Bakım modu açık.');
  if (safeNum(smokeMatrix.summary?.fail, 0) > 0) blockers.push(`${safeNum(smokeMatrix.summary?.fail, 0)} smoke case fail durumda.`);
  if (safeNum(smokeMatrix.summary?.criticalFailed, 0) > 0) blockers.push(`${safeNum(smokeMatrix.summary?.criticalFailed, 0)} kritik smoke case fail durumda.`);
  if (safeNum(liveObservation.severity?.fatal, 0) > 0) blockers.push('Canlı gözlemde fatal hata kaydı var.');
  if (safeNum(liveObservation.vitals?.viewportZoomEvents, 0) > 0) blockers.push('Viewport zoom olayı gözlendi.');
  if (safeNum(liveObservation.vitals?.worstLongTaskMs, 0) >= 1200) blockers.push('Long task bütçesi aşıldı.');
  if (safeNum(opsHealth.errorSummary?.fatal, 0) > 0) blockers.push('Operasyon health fatal hata gösteriyor.');

  if (safeNum(smokeMatrix.summary?.criticalPending, 0) > 0) warnings.push(`${safeNum(smokeMatrix.summary?.criticalPending, 0)} kritik smoke case beklemede.`);
  if (safeNum(smokeMatrix.summary?.warn, 0) > 0) warnings.push(`${safeNum(smokeMatrix.summary?.warn, 0)} smoke case warn durumda.`);
  if (safeNum(liveObservation.severity?.error, 0) > 0) warnings.push('Canlı gözlemde error seviyesi kayıtlar var.');
  if (safeNum(liveObservation.vitals?.cumulativeLayoutShift, 0) >= 0.1) warnings.push('CLS bütçesi eşik seviyede.');
  if (safeNum(liveObservation.vitals?.worstFrameGapMs, 0) >= 250) warnings.push('Frame stall sinyali görüldü.');
  if (safeNum(opsHealth.errorSummary?.error, 0) > 0) warnings.push('Operasyon health error kaydı içeriyor.');

  const locked = blockers.length > 0;
  const mode = cleanStr(rollout.mode || 'canary', 24).toLowerCase() || 'canary';
  const verdict = locked ? 'blocked' : (mode === 'live' ? 'live_ready' : 'canary_ready');
  const score = Math.max(0, 100 - (blockers.length * 30) - (warnings.length * 8));

  return {
    generatedAt: nowMs(),
    locked,
    verdict,
    label: locked ? 'Regresyon kilidi aktif' : (mode === 'live' ? 'Canlıya uygun' : 'Canary için uygun'),
    score,
    releaseId: cleanStr(release.releaseId || '', 120),
    phase: cleanStr(release.phase || '', 80),
    blockers,
    warnings,
    rolloutMode: mode,
    smokeSummary: smokeMatrix.summary || {},
    liveStatus: liveObservation.status || {},
    recommendation: locked
      ? 'Smoke matrisi, canlı gözlem ve operasyon health temizlenmeden rollout artırılmamalı.'
      : (mode === 'live' ? 'Tam canlı geçiş öncesi son smoke turu tekrar çalıştırılmalı.' : 'Önce canary kohortunda gerçek trafik gözlemi yapılmalı.')
  };
}

module.exports = {
  buildReleaseGateSnapshot
};
