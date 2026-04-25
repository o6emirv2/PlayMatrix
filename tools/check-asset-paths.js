#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlFiles = [
  'index.html',
  'Online Oyunlar/Crash.html',
  'Online Oyunlar/Pisti.html',
  'Online Oyunlar/Satranc.html',
  'Klasik Oyunlar/PatternMaster.html',
  'Klasik Oyunlar/SpacePro.html',
  'Klasik Oyunlar/SnakePro.html'
];

const failures = [];

function cleanUrl(value = '') {
  return String(value || '').trim().replace(/[?#].*$/, '');
}

function isExternalOrVirtual(value = '') {
  const raw = String(value || '').trim();
  return !raw
    || raw.startsWith('#')
    || raw.startsWith('data:')
    || raw.startsWith('blob:')
    || raw.startsWith('mailto:')
    || raw.startsWith('tel:')
    || /^https?:\/\//i.test(raw)
    || raw.startsWith('/api/')
    || raw.startsWith('/socket.io/')
    || raw === '/crash'
    || raw === '/satranc'
    || raw === '/pisti'
    || raw.startsWith('/classic-games/');
}

function resolveLocalPath(url, fromFile) {
  const clean = decodeURIComponent(cleanUrl(url));
  if (!clean || isExternalOrVirtual(clean)) return null;
  if (clean.startsWith('/assets/games/classic/')) return path.join(root, 'Klasik Oyunlar', clean.slice('/assets/games/classic/'.length));
  if (clean.startsWith('/assets/games/online/')) return path.join(root, 'Online Oyunlar', clean.slice('/assets/games/online/'.length));
  if (clean.startsWith('/public/')) return path.join(root, clean.slice(1));
  if (clean.startsWith('/Cerceve/')) return path.join(root, clean.slice(1));
  if (clean.startsWith('/Çerçeve/')) return path.join(root, 'Cerceve', clean.slice('/Çerçeve/'.length));
  if (clean.startsWith('/')) return path.join(root, clean.slice(1));
  return path.resolve(path.dirname(path.join(root, fromFile)), clean);
}

function collectAssets(source) {
  const urls = [];
  for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    urls.push(match[1]);
  }
  return urls;
}

for (const rel of htmlFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}: HTML dosyası yok.`);
    continue;
  }
  const source = fs.readFileSync(abs, 'utf8');
  if (/\.\.\/public\//.test(source)) failures.push(`${rel}: ../public yolu kaldı.`);
  if (/\b(?:src|href)=["'](?:Pisti|Satranc|SnakePro|SpacePro|PatternMaster)\./.test(source)) failures.push(`${rel}: göreli oyun phase asset yolu kaldı.`);
  for (const url of collectAssets(source)) {
    const target = resolveLocalPath(url, rel);
    if (!target) continue;
    const normalized = path.normalize(target);
    if (!normalized.startsWith(root)) {
      failures.push(`${rel}: kök dışına çıkan asset yolu: ${url}`);
      continue;
    }
    if (!fs.existsSync(normalized)) failures.push(`${rel}: bulunamayan asset: ${url} -> ${path.relative(root, normalized)}`);
  }
}

const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
for (const needle of [
  "mountStaticAlias('/public'",
  "mountStaticAlias('/assets/games/online'",
  "mountStaticAlias('/assets/games/classic'",
  'const SATRANC_PAGE_ROUTES',
  'const SNAKE_PRO_PAGE_ROUTES'
]) {
  if (!serverSource.includes(needle)) failures.push(`server.js: gerekli route/asset standardı eksik: ${needle}`);
}

if (failures.length) {
  console.error('Asset/route path kontrolü başarısız:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Asset/route path kontrolü başarılı. HTML asset yolları canonical resolver üzerinden geçiyor.');
