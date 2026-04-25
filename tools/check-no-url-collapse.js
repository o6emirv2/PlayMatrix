#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = [
  'Klasik Oyunlar/PatternMaster.phase4-script-1.js',
  'Klasik Oyunlar/SnakePro.phase4-script-1.js',
  'Klasik Oyunlar/SpacePro.phase4-script-1.js',
  'Online Oyunlar/Pisti.phase4-script-1.js',
  'Online Oyunlar/Satranc.phase4-script-1.js',
  'public/js/games/crash/crash-route-normalizer.js'
];
const failures = [];
for (const rel of targets) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  if (/replaceState\s*\(\s*null\s*,\s*null\s*,\s*['"]\/['"]\s*\)/.test(source)) {
    failures.push(`${rel}: URL'yi / yapan replaceState kaldı`);
  }
  if (/location\.pathname\s*!==\s*['"]\/['"]/.test(source)) {
    failures.push(`${rel}: eski URL collapse guard kaldı`);
  }
}
if (failures.length) {
  console.error('URL collapse kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`URL collapse kontrolü başarılı. Dosya: ${targets.length}`);

process.exit(0);
