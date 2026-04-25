'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXTENSIONS = new Set(['.js', '.css', '.html']);
const IGNORE = new Set(['package-lock.json']);
const MAX_LINES = 2000;
const DEFAULT_MAX_BYTES_BY_EXT = new Map([
  ['.js', 180 * 1024],
  ['.css', 180 * 1024],
  ['.html', 180 * 1024]
]);
const FILE_BYTE_LIMITS = new Map([
  ['public/js/home/legacy-home.runtime.js', 320 * 1024]
]);
const forbiddenPlaceholderTerms = ['reserved modular extension layer', 'phase3-ready'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '__MACOSX'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function normalizedRel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

const failures = [];
for (const file of walk(ROOT)) {
  const rel = normalizedRel(file);
  if (IGNORE.has(rel)) continue;
  const ext = path.extname(file).toLowerCase();
  if (!EXTENSIONS.has(ext)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/).length;
  const bytes = Buffer.byteLength(source);
  if (lines > MAX_LINES) failures.push(`${rel}: ${lines} satır > ${MAX_LINES}`);
  const maxBytes = FILE_BYTE_LIMITS.get(rel) || DEFAULT_MAX_BYTES_BY_EXT.get(ext) || (180 * 1024);
  if (bytes > maxBytes) failures.push(`${rel}: ${bytes} byte > ${maxBytes} byte`);
  if (!rel.startsWith('tools/')) {
    for (const term of forbiddenPlaceholderTerms) {
      if (source.toLowerCase().includes(term)) failures.push(`${rel}: placeholder/reserved modül kalıntısı bulundu (${term})`);
    }
  }
}

if (failures.length) {
  console.error('Büyük/dağınık dosya kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('check:large-files OK');
