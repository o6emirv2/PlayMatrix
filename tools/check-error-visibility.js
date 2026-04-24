#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function read(file) {
  const abs = path.join(root, file);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
}
function readTree(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return '';
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) out.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(abs);
  return out.join('\n');
}

const clientSources = [
  read('script.js'),
  readTree('public/js'),
  read('public/playmatrix-runtime.js'),
].join('\n');

const required = [
  ['server.js', '/api/client-errors', read('server.js')],
  ['server.js', 'captureClientError', read('server.js')],
  ['utils/logger.js', 'logCaughtError', read('utils/logger.js')],
  ['utils/logger.js', 'redactSensitiveValue', read('utils/logger.js')],
  ['utils/errorMonitor.js', 'captureClientError', read('utils/errorMonitor.js')],
  ['public/playmatrix-runtime.js', 'window.__PM_REPORT_CLIENT_ERROR__', read('public/playmatrix-runtime.js')],
  ['public/playmatrix-runtime.js', "window.addEventListener('error'", read('public/playmatrix-runtime.js')],
  ['public/playmatrix-runtime.js', "window.addEventListener('unhandledrejection'", read('public/playmatrix-runtime.js')],
  ['modüler client kaynakları', 'reportClientError', clientSources],
  ['routes/admin.routes.js', '/admin/ops/errors', read('routes/admin.routes.js')],
];
const missing = [];
for (const [file, needle, content] of required) {
  if (!content.includes(needle)) missing.push(file + ': ' + needle);
}
if (missing.length) {
  console.error('Faz 7 log kontrolü başarısız:');
  missing.forEach((item) => console.error('- ' + item));
  process.exit(1);
}
console.log('Faz 7 log/hata görünürlüğü kontrolü başarılı.');
if (!process.exitCode) process.exit(0);
