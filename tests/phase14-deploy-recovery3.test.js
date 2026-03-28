
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('index carries remote backend hint and CSP allows remote API', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /playmatrix-remote-api-url/);
  assert.match(html, /window\.__PLAYMATRIX_REMOTE_API_URL__/);
  assert.match(html, /https:\/\/emirhan-siye\.onrender\.com/);
  assert.match(html, /connect-src[^"]*https:\/\/emirhan-siye\.onrender\.com/);
});

test('admin pages and main script include remote backend fallback hint', () => {
  for (const file of ['public/admin/index.html', 'public/admin/health.html', 'script.js']) {
    const content = fs.readFileSync(file, 'utf8');
    assert.match(content, /emirhan-siye\.onrender\.com/);
  }
});

test('cron cleanup falls back when firestore returns FAILED_PRECONDITION', () => {
  const source = fs.readFileSync('crons/tasks.js', 'utf8');
  assert.match(source, /cleanupDirectChatMessagesWithoutCollectionGroup/);
  assert.match(source, /numericCode === 9/);
  assert.match(source, /failed_precondition/);
});
