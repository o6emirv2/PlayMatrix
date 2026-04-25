#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const requiredRoutes = [
  '/Online Oyunlar/Crash',
  '/Online Oyunlar/Pisti',
  '/Online Oyunlar/Satranc',
  '/Klasik Oyunlar/SnakePro',
  '/Klasik Oyunlar/PatternMaster',
  '/Klasik Oyunlar/SpacePro'
];
const homeFiles = ['index.html', 'public/js/home/fast-home-paint.js', 'public/js/home/legacy-home.runtime.js'];
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const failures = [];

for (const route of requiredRoutes) {
  if (!server.includes(route)) failures.push(`server.js: canonical route eksik: ${route}`);
}
if (!server.includes('CANONICAL_GAME_PAGES')) failures.push('server.js: CANONICAL_GAME_PAGES standardı yok');
if (!server.includes('mountCanonicalGamePage')) failures.push('server.js: mountCanonicalGamePage yok');

const forbiddenHomePatterns = [
  'Online Oyunlar/Crash.html', 'Online Oyunlar/Pisti.html', 'Online Oyunlar/Satranc.html',
  'Klasik Oyunlar/SnakePro.html', 'Klasik Oyunlar/PatternMaster.html', 'Klasik Oyunlar/SpacePro.html'
];
for (const rel of homeFiles) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const forbidden of forbiddenHomePatterns) {
    if (source.includes(forbidden)) failures.push(`${rel}: eski .html oyun yolu kaldı: ${forbidden}`);
  }
  for (const route of requiredRoutes) {
    if (!source.includes(route)) failures.push(`${rel}: canonical oyun yolu eksik: ${route}`);
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '__MACOSX'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:js|html|css|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (rel === 'tools/check-file-path-routes.js') continue;
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('.//Online Oyunlar/') || source.includes('"//Online Oyunlar/') || source.includes("'//Online Oyunlar/") || source.includes('`//Online Oyunlar/')) {
    failures.push(`${rel}: çift slash içeren Online Oyunlar yolu kaldı`);
  }
  if (source.includes('.//Klasik Oyunlar/') || source.includes('"//Klasik Oyunlar/') || source.includes("'//Klasik Oyunlar/") || source.includes('`//Klasik Oyunlar/')) {
    failures.push(`${rel}: çift slash içeren Klasik Oyunlar yolu kaldı`);
  }
}

if (failures.length) {
  console.error('Dosya yolu route kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Dosya yolu route kontrolü başarılı. Canonical route: ${requiredRoutes.length}`);
process.exit(0);
