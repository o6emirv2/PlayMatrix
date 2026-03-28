'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { toSafeHeaderValue } = require('../utils/httpHeaders');

test('header values are sanitized to visible ASCII only', () => {
  const value = toSafeHeaderValue('FAZ 14 — Tasarım Token / Tema / Component Sistemi');
  assert.equal(value, 'FAZ 14 Tasarim Token / Tema / Component Sistemi');
  assert.match(value, /^[\x20-\x7E]+$/);
});

test('admin client contains request URL fallback helper', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');
  assert.match(html, /buildRequestUrls\(base, path\)/);
});

test('main client uses requestWithApiFallback for leaderboard', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  assert.match(script, /requestWithApiFallback\('\/api\/leaderboard'/);
});
