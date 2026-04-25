#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = '<meta name="viewport" content="width=device-width, initial-scale=0.90, maximum-scale=0.90, minimum-scale=0.90, user-scalable=no, viewport-fit=cover" />';
const targets = [
  'index.html',
  'Online Oyunlar/Crash.html',
  'Online Oyunlar/Pisti.html',
  'Online Oyunlar/Satranc.html',
  'Klasik Oyunlar/SnakePro.html',
  'Klasik Oyunlar/PatternMaster.html',
  'Klasik Oyunlar/SpacePro.html',
  'public/admin/index.html',
  'public/admin/admin.html',
  'public/admin/health.html',
  'Bakım/index.html'
];

const failures = [];
for (const rel of targets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { failures.push(`${rel}: dosya yok`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<meta\s+name=["']viewport["'][^>]*>/i);
  if (!match) failures.push(`${rel}: viewport meta yok`);
  else if (match[0] !== required) failures.push(`${rel}: viewport standard dışı => ${match[0]}`);
}

if (failures.length) {
  console.error('Viewport kontratı başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Viewport kontratı başarılı. Dosya: ${targets.length}`);

process.exit(0);
