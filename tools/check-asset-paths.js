#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlFiles = [
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
function isExternal(value) { return /^(?:https?:)?\/\//i.test(value) || /^(?:data|blob|mailto):/i.test(value); }
function resolveAsset(htmlRel, value) {
  if (isExternal(value) || value.startsWith('#')) return null;
  const clean = value.split(/[?#]/)[0];
  if (!clean || clean.startsWith('/api/')) return null;
  if (clean.startsWith('/')) return path.join(root, decodeURI(clean.slice(1)));
  return path.resolve(path.dirname(path.join(root, htmlRel)), decodeURI(clean));
}
function extractAssetRefs(html) {
  const refs = [];
  const tagRegex = /<(?:link|script)\b[^>]*>/gi;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(html))) {
    const tag = tagMatch[0];
    const attrMatch = tag.match(/\b(?:href|src)=["']([^"']+)["']/i);
    if (attrMatch) refs.push(attrMatch[1]);
  }
  return refs;
}
for (const rel of htmlFiles) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const ref of extractAssetRefs(html)) {
    const target = resolveAsset(rel, ref);
    if (target && !fs.existsSync(target)) failures.push(`${rel}: asset yok => ${ref}`);
  }
}
if (failures.length) {
  console.error('Asset path kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Asset path kontrolü başarılı. HTML dosyası: ${htmlFiles.length}`);
process.exit(0);
