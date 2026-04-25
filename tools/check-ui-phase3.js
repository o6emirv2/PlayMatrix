#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const rel = (...parts) => path.join(root, ...parts);
const read = (file) => fs.readFileSync(rel(file), 'utf8');
const exists = (file) => fs.existsSync(rel(file));

function fail(message) {
  failures.push(message);
}

function mustContain(file, needle, label = needle) {
  const source = read(file);
  if (!source.includes(needle)) fail(`${file}: eksik -> ${label}`);
}

const gameHtml = [
  'Online Oyunlar/Crash.html',
  'Online Oyunlar/Pisti.html',
  'Online Oyunlar/Satranc.html',
  'Klasik Oyunlar/PatternMaster.html',
  'Klasik Oyunlar/SnakePro.html',
  'Klasik Oyunlar/SpacePro.html'
];
const htmlFiles = ['index.html', ...gameHtml, 'public/admin/index.html', 'public/admin/admin.html', 'public/admin/health.html'].filter(exists);

for (const file of htmlFiles) {
  const source = read(file);
  if (/initial-scale=0\.90|minimum-scale=0\.90|maximum-scale=0\.90/.test(source)) {
    fail(`${file}: initial-scale=0.90 viewport hilesi kaldı.`);
  }
  if (!/name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/.test(source)) {
    fail(`${file}: standart viewport yok.`);
  }
}

for (const file of gameHtml) {
  if (!exists(file)) {
    fail(`${file}: oyun HTML dosyası yok.`);
    continue;
  }
  mustContain(file, '/public/shell-enhancements.css', 'ortak shell CSS');
  mustContain(file, '/public/shell-enhancements.js', 'ortak shell JS');
  mustContain(file, '/public/avatar-frame.css', 'ortak avatar/çerçeve CSS');
  mustContain(file, '/public/avatar-frame.js', 'ortak avatar/çerçeve JS');
}

for (const file of ['public/admin/index.html', 'public/admin/admin.html']) {
  if (exists(file)) {
    mustContain(file, '../shell-enhancements.css', 'admin shell CSS');
    mustContain(file, '../shell-enhancements.js', 'admin shell JS');
  }
}

if (!exists('public/css/components/playmatrix-shell.css')) fail('public/css/components/playmatrix-shell.css yok.');
mustContain('public/shell-enhancements.css', '@import url("/public/css/components/playmatrix-shell.css")', 'modüler shell import');

const shellCss = read('public/css/components/playmatrix-shell.css');
for (const needle of [
  '--pm-shell-bg-0',
  '--pm-shell-radius-xl',
  '--pm-shell-motion',
  'safe-area-inset-bottom',
  '.top-bar-full',
  '.modal-overlay',
  '.pm-avatar',
  'overflow-x: clip',
  'transform: translateZ(0)',
  'prefers-reduced-motion'
]) {
  if (!shellCss.includes(needle)) fail(`playmatrix-shell.css içinde ${needle} eksik.`);
}

const shellJs = read('public/shell-enhancements.js');
for (const needle of [
  'requestAnimationFrame',
  'pm-shell-ready',
  'pm-game-page',
  'pm-admin-page',
  'MutationObserver',
  '--app-height'
]) {
  if (!shellJs.includes(needle)) fail(`shell-enhancements.js içinde ${needle} eksik.`);
}

const server = read('server.js');
if (!server.includes("mountStaticAlias('/public', path.join(__dirname, 'public')")) {
  fail('server.js /public statik alias eksik.');
}

if (failures.length) {
  console.error('[check:ui-phase3] Ortak shell/mobil/modal kontrolü başarısız:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check:ui-phase3] OK - ortak shell, viewport, modal, topbar, avatar/çerçeve ve /public alias kontrolleri başarılı.');
