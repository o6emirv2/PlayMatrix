#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const backend = require(path.join(root, 'utils', 'progression'));

function fail(message) {
  console.error(`[check:progression] ${message}`);
  process.exit(1);
}

function nearlyEqual(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Object.is(a, b);
  const diff = Math.abs(a - b);
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return diff / scale < 1e-12;
}

(async () => {
  const frontendSource = fs.readFileSync(path.join(root, 'public', 'data', 'progression-policy.js'), 'utf8');
  const frontend = await import(`data:text/javascript;base64,${Buffer.from(frontendSource, 'utf8').toString('base64')}`);

  if (backend.ACCOUNT_PROGRESSION_VERSION !== 5) fail('Backend progression version 5 değil.');
  if (frontend.ACCOUNT_PROGRESSION_VERSION !== 5) fail('Frontend progression version 5 değil.');
  if (backend.ACCOUNT_LEVEL_CURVE_MODE !== 'MD_FACTORIAL_OPTION_A') fail('Backend MD Option A curve mode değil.');
  if (frontend.ACCOUNT_LEVEL_CURVE_MODE !== 'MD_FACTORIAL_OPTION_A') fail('Frontend MD Option A curve mode değil.');
  if (backend.ACCOUNT_BASE_XP !== 120 || frontend.ACCOUNT_BASE_XP !== 120) fail('Base XP 120 değil.');

  let expectedStep = backend.ACCOUNT_BASE_XP;
  for (let level = 1; level < backend.ACCOUNT_LEVEL_CAP; level += 1) {
    if (level === 1) expectedStep = backend.ACCOUNT_BASE_XP;
    else expectedStep *= level;
    const backendStep = backend.getXpStepForLevel(level);
    const frontendStep = frontend.getXpStepForLevel(level);
    if (!nearlyEqual(backendStep, expectedStep)) fail(`Backend L${level}->L${level + 1} step MD formülüne uymuyor.`);
    if (!nearlyEqual(frontendStep, expectedStep)) fail(`Frontend L${level}->L${level + 1} step MD formülüne uymuyor.`);
    if (!nearlyEqual(frontend.ACCOUNT_LEVEL_STEPS[level], backendStep)) fail(`Frontend/backend step mismatch: L${level}`);
  }

  for (let level = 1; level <= backend.ACCOUNT_LEVEL_CAP; level += 1) {
    const backendThreshold = backend.deriveXpFromLevel(level);
    const frontendThreshold = frontend.deriveXpFromLevel(level);
    if (!nearlyEqual(backendThreshold, frontendThreshold)) fail(`Frontend/backend threshold mismatch: L${level}`);
  }

  const checkpoints = [
    [1, 0],
    [2, 120],
    [3, 360],
    [4, 1080],
    [5, 3960],
    [6, 18360],
    [7, 104760],
    [8, 709560],
    [9, 5547960],
    [10, 49093560]
  ];
  checkpoints.forEach(([level, xp]) => {
    if (!nearlyEqual(backend.deriveXpFromLevel(level), xp)) fail(`Beklenen L${level} threshold ${xp} değil.`);
  });

  if (backend.getAccountLevel({ accountXp: 3959, accountProgressionVersion: 5, accountLevelCurveMode: 'MD_FACTORIAL_OPTION_A' }) !== 4) fail('3959 XP seviye 4 olmalı.');
  if (backend.getAccountLevel({ accountXp: 3960, accountProgressionVersion: 5, accountLevelCurveMode: 'MD_FACTORIAL_OPTION_A' }) !== 5) fail('3960 XP seviye 5 olmalı.');
  if (backend.getAccountLevel({ accountXp: backend.LEGACY_V4_LEVEL_THRESHOLDS[5], accountProgressionVersion: 4 }) !== 5) fail('Legacy v4 L5 migrasyonu L5 korumuyor.');

  console.log('[check:progression] OK - MD Seçenek A eğrisi backend/frontend aynı, v5 policy aktif, v4 migration seviye koruyor.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

if (!process.exitCode) process.exit(0);
