#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
  html: path.join(root, 'index.html'),
  script: path.join(root, 'script.js'),
  picker: path.join(root, 'public', 'js', 'profile', 'frame-picker.js'),
  avatarRuntime: path.join(root, 'public', 'avatar-frame.js'),
  css: path.join(root, 'public', 'avatar-frame.css'),
  profileRoute: path.join(root, 'routes', 'profile.routes.js'),
  accountState: path.join(root, 'utils', 'accountState.js')
};

function fail(message) {
  console.error(`[check:frames] ${message}`);
  process.exit(1);
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function readDirText(dir) {
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => read(path.join(dir, name)))
    .join('\n');
}

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) fail(`${name} dosyası bulunamadı: ${path.relative(root, file)}`);
}

const html = read(files.html);
const clientScript = [
  read(files.script),
  readDirText(path.join(root, 'public', 'js', 'home')),
  readDirText(path.join(root, 'public', 'js', 'profile')),
].join('\n');
const picker = read(files.picker);
const avatarRuntime = read(files.avatarRuntime);
const css = read(files.css);
const profileRoute = read(files.profileRoute);
const accountState = read(files.accountState);

for (const required of [
  'framePickerModal',
  'framePickerContainer',
  'openFrameSelectionBtn',
  'Çerçevenizi Seçin',
]) {
  if (!html.includes(required)) fail(`index.html içinde ${required} eksik.`);
}

for (const required of [
  'createFramePicker',
  'openFramePicker',
  'closeFramePicker',
  'renderFrameOptions',
  'window.openFramePicker',
  'window.closeFramePicker',
  'window.renderFrameOptions',
]) {
  if (!clientScript.includes(required)) fail(`modüler client kaynaklarında ${required} eksik.`);
}

for (const required of [
  'Şuanda Aktif Değil',
  'Kullanımda',
  'Seç',
  'isFrameUnlocked',
  'getSafeSelectedFrame',
  'card.disabled = isLocked',
  'card.dataset.frameLocked',
  'aria-disabled',
  'for (let level = 0; level <= 100; level += 1)',
]) {
  if (!picker.includes(required)) fail(`frame-picker.js içinde ${required} eksik.`);
}

for (const required of [
  'window.PMAvatar',
  'buildHTML',
  'createNode',
  'mount',
  'isFrameUnlocked',
  'getSafeSelectedFrame',
]) {
  if (!avatarRuntime.includes(required)) fail(`public/avatar-frame.js içinde ${required} eksik.`);
}

for (const required of [
  '.frame-picker-card:disabled',
  'opacity: 1 !important',
  '.frame-picker-card.is-locked',
  '.frame-picker-card-status',
  '[data-frame-locked="true"]',
]) {
  if (!css.includes(required)) fail(`public/avatar-frame.css içinde ${required} eksik.`);
}

for (const required of [
  'normalizeSelectedFrameLevel',
  'isSelectedFrameUnlocked',
  'buildFrameState',
  'frameLevel <= 0',
  'return isSelectedFrameUnlocked(resolved, accountLevel) ? resolved : 0',
]) {
  if (!accountState.includes(required)) fail(`utils/accountState.js içinde ${required} eksik.`);
}

for (const required of [
  'normalizeSelectedFrameLevel(numericSelectedFrame)',
  'isSelectedFrameUnlocked(safeSelectedFrame, maxUnlockedFrame)',
  'updates.selectedFrame = safeSelectedFrame',
  'buildFrameState',
]) {
  if (!profileRoute.includes(required)) fail(`routes/profile.routes.js içinde ${required} eksik.`);
}

console.log('[check:frames] OK - tek PMAvatar render kontratı, çerçevesiz seçim, kilitli çerçeve pasifliği ve server seviye doğrulaması aktif.');
if (!process.exitCode) process.exit(0);
