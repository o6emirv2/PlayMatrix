'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildReleaseSnapshot, readReleaseManifest } = require('../utils/release');

const root = path.join(__dirname, '..');

test('phase0 release manifest okunur ve zorunlu alanlar vardır', () => {
  const manifest = readReleaseManifest();
  assert.ok(manifest);
  assert.ok(typeof manifest.phase === 'string' && manifest.phase.trim().length > 0);
  assert.equal(manifest.rollbackReady, true);
  assert.equal(manifest.secretsSanitized, true);
});

test('phase0 release snapshot package sürümü ve rollback durumunu döner', () => {
  const snapshot = buildReleaseSnapshot();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(snapshot.packageVersion, pkg.version);
  assert.equal(snapshot.rollbackReady, true);
  assert.ok(snapshot.releaseId);
});

test('phase0 dokümanları ve env dosyaları hazırdır', () => {
  const requiredFiles = [
    'docs/PHASE0_FREEZE.md',
    'docs/ROLLBACK.md',
    'env.env',
    '.env.env',
    '.env.example'
  ];
  requiredFiles.forEach((relativePath) => {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} eksik`);
  });
});

test('phase0 freeze verify script başarıyla geçer', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-freeze.js'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.match(output, /FAZ 0 dondurma doğrulaması geçti/);
});

test('server health çıktısı release snapshot içerir', () => {
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(source, /const \{ buildReleaseSnapshot \} = require\('\.\/utils\/release'\);/);
  assert.match(source, /release: buildReleaseSnapshot\(\)/);
});
