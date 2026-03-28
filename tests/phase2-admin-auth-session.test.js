'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function read(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
}

test('faz2 auth route admin diagnostics ve security alanlarını içerir', () => {
  const source = read('routes', 'auth.routes.js');
  assert.match(source, /router\.get\('\/auth\/admin\/diagnostics'/);
  assert.match(source, /function buildAdminSecurityState/);
  assert.match(source, /manualTokenPersistence: 'memory_only'/);
  assert.match(source, /recommendedMode:/);
});

test('admin index session persistence kullanır ve legacy localStorage token izlerini temizler', () => {
  const source = read('public', 'admin', 'index.html');
  assert.match(source, /browserSessionPersistence/);
  assert.doesNotMatch(source, /browserLocalPersistence/);
  assert.match(source, /clearLegacy\(\)/);
  assert.match(source, /adminSessionStore\.set\(ADMIN_SESSION_KEYS\.apiBase/);
});

test('admin health manual tokeni localStoragea yazmaz ve session persistence kullanır', () => {
  const source = read('public', 'admin', 'health.html');
  assert.match(source, /browserSessionPersistence/);
  assert.doesNotMatch(source, /browserLocalPersistence/);
  assert.doesNotMatch(source, /localStorage\.setItem\('pm_admin_manual_token'/);
  assert.match(source, /state\.manualToken = ''/);
  assert.match(source, /adminSessionStore\.set\(ADMIN_SESSION_KEYS\.apiBase/);
});

test('faz2 dokümanı ve verify scripti mevcut', () => {
  const doc = read('docs', 'PHASE2_ADMIN_AUTH.md');
  const script = read('scripts', 'verify-admin-auth.js');
  assert.match(doc, /FAZ 2/);
  assert.match(script, /admin auth doğrulaması geçti/);
});

test('faz2 verify script başarıyla geçer', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-admin-auth.js'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });
  assert.match(output, /FAZ 2 admin auth doğrulaması geçti/);
});
