'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'public', 'data', 'avatar-catalog.js');
const manifestPath = path.join(root, 'public', 'data', 'avatar-manifest.json');
const fallbackPath = path.join(root, 'assets', 'avatars', 'system', 'fallback.svg');
const sourceDir = path.join(root, 'public', 'data', 'avatar-sources');

function fail(message) {
  console.error(`[check:avatars] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(catalogPath)) fail('public/data/avatar-catalog.js bulunamadı.');
if (!fs.existsSync(manifestPath)) fail('public/data/avatar-manifest.json bulunamadı.');
if (!fs.existsSync(fallbackPath)) fail('assets/avatars/system/fallback.svg bulunamadı.');
if (!fs.existsSync(sourceDir)) fail('public/data/avatar-sources klasörü bulunamadı.');

const sourceFiles = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.js')).sort();
if (sourceFiles.length < 8) fail('Avatar kaynak dosyalarının tamamı bulunamadı.');

const allUrls = [];
for (const file of sourceFiles) {
  const filePath = path.join(sourceDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  if (!/^export const [A-Z0-9_]+ = Object\.freeze\(\[/m.test(content)) {
    fail(`${file} export const Object.freeze array yapısında değil.`);
  }

  const urls = [...content.matchAll(/https?:\/\/[^"'\s,]+/g)].map((match) => match[0]);
  if (!urls.length) fail(`${file} içinde URL bulunamadı.`);
  if (!content.trim().endsWith(']);')) fail(`${file} array kapanışı hatalı.`);

  allUrls.push(...urls);
}

const uniqueUrls = new Set(allUrls);
if (uniqueUrls.size !== allUrls.length) fail('Avatar kaynaklarında tekrar eden URL var.');

let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`avatar-manifest.json okunamadı: ${error.message}`);
}

if (manifest.mode !== 'link') fail('Avatar manifest mode link olmalı.');
if (manifest.fallback !== '/assets/avatars/system/fallback.svg') fail('Fallback avatar yolu hatalı.');
if (!Array.isArray(manifest.avatars) || manifest.avatars.length !== uniqueUrls.size) {
  fail('Manifest avatar sayısı kaynak dosyalarla uyuşmuyor.');
}
if (!Array.isArray(manifest.categories) || manifest.categories.length !== sourceFiles.length) {
  fail('Manifest kategori sayısı kaynak dosyalarla uyuşmüyor.');
}

const manifestUrlSet = new Set(manifest.avatars);
for (const url of uniqueUrls) {
  if (!manifestUrlSet.has(url)) fail(`Manifest içinde eksik avatar URL'i var: ${url}`);
}

const allowedHosts = new Set(manifest.allowedRemoteHosts || []);
for (const url of manifest.avatars) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') fail(`Avatar URL https değil: ${url}`);
  if (!allowedHosts.has(parsed.hostname)) fail(`Avatar host manifest allowlist içinde değil: ${parsed.hostname}`);
}

const catalogContent = fs.readFileSync(catalogPath, 'utf8');
for (const required of [
  'AVATAR_REMOTE_MODE',
  'AVATAR_FALLBACK',
  'normalizeAvatarUrl',
  'isCatalogAvatarUrl',
  'AVATAR_CATEGORIES',
  'AVATAR_ITEMS',
  'DEFAULT_AVATAR'
]) {
  if (!catalogContent.includes(required)) fail(`avatar-catalog.js içinde ${required} eksik.`);
}

for (const file of sourceFiles) {
  const expectedImport = `./avatar-sources/${file}`;
  if (!catalogContent.includes(expectedImport)) fail(`avatar-catalog.js içinde ${expectedImport} importu eksik.`);
}

console.log(`[check:avatars] OK - ${sourceFiles.length} kaynak dosyası, ${uniqueUrls.size} link tabanlı tekil avatar, yerel fallback SVG aktif.`);

if (!process.exitCode) process.exit(0);
