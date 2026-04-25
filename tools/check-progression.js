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

function toBig(value) {
  const raw = String(value ?? '0').trim();
  if (/^\d+$/.test(raw)) return BigInt(raw);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0n;
  return BigInt(Math.floor(parsed));
}

(async () => {
  const frontendSource = fs.readFileSync(path.join(root, 'public', 'data', 'progression-policy.js'), 'utf8');
  const frontend = await import(`data:text/javascript;base64,${Buffer.from(frontendSource, 'utf8').toString('base64')}`);

  if (backend.ACCOUNT_PROGRESSION_VERSION !== 6) fail('Backend progression version 6 değil.');
  if (frontend.ACCOUNT_PROGRESSION_VERSION !== 6) fail('Frontend progression version 6 değil.');
  if (backend.ACCOUNT_LEVEL_CURVE_MODE !== 'MD_FACTORIAL_OPTION_A_BIGINT') fail('Backend BigInt curve mode değil.');
  if (frontend.ACCOUNT_LEVEL_CURVE_MODE !== 'MD_FACTORIAL_OPTION_A_BIGINT') fail('Frontend BigInt curve mode değil.');
  if (backend.ACCOUNT_BASE_XP !== 120 || frontend.ACCOUNT_BASE_XP !== 120) fail('Base XP 120 değil.');

  let expectedStep = BigInt(backend.ACCOUNT_BASE_XP);
  for (let level = 1; level < backend.ACCOUNT_LEVEL_CAP; level += 1) {
    if (level === 1) expectedStep = BigInt(backend.ACCOUNT_BASE_XP);
    else expectedStep *= BigInt(level);
    const backendStepExact = backend.getXpStepExactForLevel(level);
    const frontendStepExact = frontend.getXpStepExactForLevel(level);
    if (toBig(backendStepExact) !== expectedStep) fail(`Backend L${level}->L${level + 1} exact step MD formülüne uymuyor.`);
    if (toBig(frontendStepExact) !== expectedStep) fail(`Frontend L${level}->L${level + 1} exact step MD formülüne uymuyor.`);
    if (frontend.ACCOUNT_LEVEL_STEPS_EXACT[level] !== backendStepExact) fail(`Frontend/backend exact step mismatch: L${level}`);
  }

  for (let level = 1; level <= backend.ACCOUNT_LEVEL_CAP; level += 1) {
    const backendThreshold = backend.deriveXpExactFromLevel(level);
    const frontendThreshold = frontend.deriveXpExactFromLevel(level);
    if (backendThreshold !== frontendThreshold) fail(`Frontend/backend exact threshold mismatch: L${level}`);
  }

  const checkpoints = [
    [1, '0'], [2, '120'], [3, '360'], [4, '1080'], [5, '3960'], [6, '18360'], [7, '104760'], [8, '709560'], [9, '5547960'], [10, '49093560']
  ];
  checkpoints.forEach(([level, xp]) => {
    if (backend.deriveXpExactFromLevel(level) !== xp) fail(`Beklenen L${level} exact threshold ${xp} değil.`);
  });

  if (backend.getAccountLevel({ accountXpExact: '3959', accountProgressionVersion: 6, accountLevelCurveMode: 'MD_FACTORIAL_OPTION_A_BIGINT' }) !== 4) fail('3959 XP seviye 4 olmalı.');
  if (backend.getAccountLevel({ accountXpExact: '3960', accountProgressionVersion: 6, accountLevelCurveMode: 'MD_FACTORIAL_OPTION_A_BIGINT' }) !== 5) fail('3960 XP seviye 5 olmalı.');
  if (backend.getAccountLevel({ accountXp: backend.LEGACY_V4_LEVEL_THRESHOLDS[5], accountProgressionVersion: 4 }) !== 5) fail('Legacy v4 L5 migrasyonu L5 korumuyor.');
  const l99 = backend.deriveXpExactFromLevel(99);
  if (!/^\d{20,}$/.test(l99)) fail('L99 exact XP decimal string olarak saklanmıyor.');
  if (backend.getAccountLevel({ accountXpExact: l99, accountProgressionVersion: 6, accountLevelCurveMode: 'MD_FACTORIAL_OPTION_A_BIGINT' }) !== 99) fail('L99 exact XP seviye 99 üretmiyor.');

  console.log('[check:progression] OK - MD Seçenek A BigInt eğrisi backend/frontend aynı, v6 policy aktif, exact XP string güvenli.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
