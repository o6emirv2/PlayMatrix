#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const MAX_LINES = 2000;
const MAX_BYTES = 1024 * 1024;
const suspiciousPatterns = [
  { name: 'Firebase private key marker', regex: new RegExp('-----BEGIN ' + 'PRIVATE KEY-----', 'i') },
  { name: 'Raw private_key JSON field', regex: /"private_key"\s*:/i },
  { name: 'Password-like assignment', regex: /(?:password|passwd|secret|token)\s*[=:]\s*['"][^'"\n]{12,}/i }
];
const ignoredDirs = new Set(['node_modules', '.git']);
const largeFileAllowlist = new Set(['public/js/home/legacy-home.runtime.js']);
const suspiciousAllowlist = new Set(['Online Oyunlar/Pisti.phase4-module-1.js']);
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}

function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  return ['.js', '.json', '.html', '.css', '.md', '.txt', '.env', '.example', '.svg', '.webmanifest'].includes(ext) || path.basename(file).startsWith('.env');
}

function isMarkdownSecretRisk(rel = '', text = '') {
  const normalized = rel.replace(/\\/g, '/');
  const isApprovedSecurityDoc = normalized.startsWith('docs/');
  const privateNoteName = /(^|\/)(PROTOKOL\+.*F[İI]REBASE.*RENDER|.*FIREBASE.*RENDER|.*SECRET.*|.*PRIVATE.*KEY.*)\.md$/i.test(normalized);
  const rawSecretBody = /"private_key"\s*:/i.test(text)
    || /-----BEGIN [^-]+ PRIVATE KEY-----/i.test(text)
    || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com/i.test(text)
    || /AIza[0-9A-Za-z_\-]{20,}/.test(text);
  return rawSecretBody || (!isApprovedSecurityDoc && privateNoteName);
}

walk(root);

const largeFiles = [];
const suspicious = [];
const markdownSecrets = [];

for (const file of files) {
  const rel = path.relative(root, file);
  const stat = fs.statSync(file);
  const isGeneratedLock = rel === 'package-lock.json';
  if (!isGeneratedLock && !largeFileAllowlist.has(rel.replace(/\\/g, '/')) && stat.size > MAX_BYTES) largeFiles.push({ file: rel, size: stat.size, reason: '1MB üzeri' });
  if (!isTextFile(file)) continue;
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
  const lines = text.split(/\r?\n/).length;
  if (!isGeneratedLock && !largeFileAllowlist.has(rel.replace(/\\/g, '/')) && lines > MAX_LINES) largeFiles.push({ file: rel, lines, reason: `${MAX_LINES}+ satır` });
  for (const pattern of suspiciousPatterns) {
    if (!suspiciousAllowlist.has(rel.replace(/\\/g, '/')) && pattern.regex.test(text)) suspicious.push({ file: rel, pattern: pattern.name });
  }
  if (/\.md$/i.test(rel) && isMarkdownSecretRisk(rel, text)) {
    markdownSecrets.push(rel);
  }
}

console.log('Repo audit özeti');
console.log(`- Toplam dosya: ${files.length}`);
console.log(`- Büyük dosya uyarısı: ${largeFiles.length}`);
if (largeFiles.length) {
  console.error(`\nAudit büyük dosya uyarısı verdi. ${MAX_LINES}+ satır veya ${Math.round(MAX_BYTES / 1024)}KB üstü dosyalar modülerleştirilmeli.`);
}
largeFiles.slice(0, 20).forEach((item) => {
  console.log(`  • ${item.file} (${item.lines ? `${item.lines} satır` : `${Math.round(item.size / 1024)}KB`}) - ${item.reason}`);
});
console.log(`- Hassas kalıp uyarısı: ${suspicious.length}`);
suspicious.slice(0, 20).forEach((item) => console.log(`  • ${item.file} - ${item.pattern}`));
console.log(`- MD hassas içerik uyarısı: ${markdownSecrets.length}`);
markdownSecrets.slice(0, 20).forEach((file) => console.log(`  • ${file}`));

if (suspicious.length || markdownSecrets.length) {
  console.error('\nAudit güvenlik uyarısı verdi. Gerçek secret değerleri repo dışında tutulmalı.');
  process.exit(1);
}
if (largeFiles.length) {
  process.exit(1);
}
process.exit(0);
