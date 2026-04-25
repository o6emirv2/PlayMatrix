#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=0.90, maximum-scale=0.90, minimum-scale=0.90, user-scalable=no, viewport-fit=cover" />';
const htmlFiles = [
  'index.html',
  'Online Oyunlar/Crash.html',
  'Online Oyunlar/Pisti.html',
  'Online Oyunlar/Satranc.html',
  'Klasik Oyunlar/PatternMaster.html',
  'Klasik Oyunlar/SpacePro.html',
  'Klasik Oyunlar/SnakePro.html',
  'public/admin/index.html',
  'public/admin/admin.html',
  'public/admin/health.html'
];
const requiredHomeRoutes = [
  '/Online Oyunlar/Crash',
  '/Online Oyunlar/Satranc',
  '/Online Oyunlar/Pisti',
  '/Klasik Oyunlar/PatternMaster',
  '/Klasik Oyunlar/SpacePro',
  '/Klasik Oyunlar/SnakePro'
];
const requiredServerRoutes = [
  "'/Online Oyunlar/Crash'",
  "'/Online Oyunlar/Pisti'",
  "'/Online Oyunlar/Satranc'",
  "'/Klasik Oyunlar/PatternMaster'",
  "'/Klasik Oyunlar/SpacePro'",
  "'/Klasik Oyunlar/SnakePro'",
  "app.use('/public', express.static(dir, publicStaticOptions))"
];
const localAssetRe = /<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi;
const failures = [];

function fail(message) {
  failures.push(message);
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}
function normalizeUrlToFile(htmlFile, url) {
  const clean = String(url || '').split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('http:') || clean.startsWith('https:') || clean.startsWith('mailto:') || clean.startsWith('tel:') || clean.startsWith('data:') || clean.startsWith('#')) return null;
  let resolved;
  if (clean.startsWith('/')) resolved = clean.slice(1);
  else resolved = path.posix.normalize(path.posix.join(path.posix.dirname(htmlFile), clean));
  return resolved.replace(/^\.\//, '');
}

for (const file of htmlFiles) {
  if (!fileExists(file)) {
    fail(`${file} bulunamadı.`);
    continue;
  }
  const body = read(file);
  if (!body.includes(viewport)) fail(`${file} viewport standardı bozulmuş.`);
  let match;
  localAssetRe.lastIndex = 0;
  while ((match = localAssetRe.exec(body))) {
    const target = normalizeUrlToFile(file, match[1]);
    if (!target) continue;
    if (/\.html?$/i.test(target)) continue;
    if (!/\.(?:css|js|json|png|ico|webmanifest)$/i.test(target)) continue;
    if (!fileExists(target)) fail(`${file} içindeki asset bulunamadı: ${match[1]} -> ${target}`);
  }
}

const index = read('index.html');
for (const route of requiredHomeRoutes) {
  if (!index.includes(`href="${route}"`)) fail(`Ana sayfa dosya yolu yönlendirmesi eksik: ${route}`);
}
if (/href="(?:Online Oyunlar|Klasik Oyunlar)\/[^"#?]+\.html"/.test(index)) {
  fail('Ana sayfada .html oyun yönlendirmesi kaldı. Dosya yolu standardı /Online Oyunlar/Crash biçiminde olmalı.');
}

const server = read('server.js');
for (const needle of requiredServerRoutes) {
  if (!server.includes(needle)) fail(`server.js route/static standardı eksik: ${needle}`);
}

const api = read('public/playmatrix-api.js');
if (!api.includes("const PRODUCTION_API_BASE = ['https://emirhan', '-siye.onrender.com'].join('')")) fail('public/playmatrix-api.js production API base sabiti eksik.');
if (!api.includes('isAllowedProductionBase')) fail('public/playmatrix-api.js stale API base koruması eksik.');

const crashNormalizer = read('public/js/games/crash/crash-route-normalizer.js');
if (crashNormalizer.includes('history.replaceState(null, null, "/")')) fail('Crash route normalizer hâlâ URL\'yi köke çekiyor.');

if (failures.length) {
  console.error('Asset/route path kontrolü başarısız:');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Asset/route path kontrolü başarılı. Dosya yolu route standardı ve asset referansları doğrulandı.');
