#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failures = [];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const crashSource = read('public/js/games/crash/crash-app.js');
for (const token of ["const elBtnRetryBoot = document.getElementById('btnRetryBoot')", "const elLoaderStatus = document.getElementById('loaderStatus')"]) {
  if (!crashSource.includes(token)) failures.push(`public/js/games/crash/crash-app.js: eksik boot binding: ${token}`);
}

const modalHtmlTargets = {
  'Online Oyunlar/Crash.html': ['rulesModal'],
  'Online Oyunlar/Pisti.html': ['matrixModal', 'rulesModal', 'exitConfirmModal', 'createModal', 'joinPrivateModal'],
  'Online Oyunlar/Satranc.html': ['matrixModal', 'confirmModal']
};
for (const [rel, ids] of Object.entries(modalHtmlTargets)) {
  const html = read(rel);
  for (const id of ids) {
    const re = new RegExp(`<div\\s+id=["']${id}["'][^>]*>`, 'i');
    const match = html.match(re);
    if (!match) failures.push(`${rel}: modal yok: ${id}`);
    else {
      const tag = match[0];
      if (!/\bhidden\b/i.test(tag)) failures.push(`${rel}: modal başlangıç hidden değil: ${id}`);
      if (!/aria-hidden=["']true["']/i.test(tag)) failures.push(`${rel}: modal başlangıç aria-hidden=true değil: ${id}`);
    }
  }
}
for (const rel of ['Online Oyunlar/Pisti.phase4-module-1.js', 'Online Oyunlar/Satranc.phase4-module-1.js']) {
  const source = read(rel);
  if (!/el\.hidden\s*=\s*!isActive/.test(source)) failures.push(`${rel}: setModalActive hidden attribute yönetmiyor`);
}
if (!/m\.hidden\s*=\s*false/.test(crashSource) || !/m\.hidden\s*=\s*true/.test(crashSource)) {
  failures.push('public/js/games/crash/crash-app.js: rulesModal hidden attribute yönetimi eksik');
}

if (failures.length) {
  console.error('Boot binding kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log('Boot binding kontrolü başarılı.');

process.exit(0);
