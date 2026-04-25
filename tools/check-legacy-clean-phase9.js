#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['node_modules', '.git']);
const ignoredFiles = new Set(['package-lock.json']);

const t = (...parts) => parts.join('');
const rx = (parts, flags = 'g') => new RegExp(t(...parts), flags);

const forbiddenPathPatterns = [
  rx(['(?:^|[\\\\/])', 'Ca', 'sino', '(?:[\\\\/]|$)'], 'i'),
  rx(['(?:^|[\\\\/])', 'Mines', '\\.html$'], 'i'),
  rx(['(?:^|[\\\\/])', 'Black', 'Jack', '\\.html$'], 'i'),
  rx(['(?:^|[\\\\/])', 'pre', 'mium', '-phase5\\.(?:js|css)$'], 'i')
];

const forbiddenContentPatterns = [
  { name: 'legacy-level-1', regex: rx(['\\bV', 'IP\\b|\\bV', 'ip\\b|\\bv', 'ip\\b|V', 'İP']) },
  { name: 'legacy-shell-name', regex: rx(['pre', 'miumUi|pre', 'mium-phase5|pm-', 'pre', 'mium-|Pre', 'mium']) },
  { name: 'legacy-rating-name', regex: rx(['chess', 'Elo|pisti', 'Elo|Satranç\\s*E', 'LO|Pişti\\s*E', 'LO|E', 'LO\\s*Puan(?:\\s*Sistemi)?|\\bE', 'LO\\b']) },
  { name: 'legacy-period-name', regex: rx(['sea', 'sonScore|sea', 'sonRp|public', 'Sea', 'sonWidget|sea', 'sonRank|sea', 'sonKey|last', 'Sea', 'son|Sea', 'son|sea', 'son|Se', 'zon|se', 'zon']) },
  { name: 'legacy-game-path', regex: rx(['Ca', 'sino|Mines\\.html|Black', 'Jack\\.html']) }
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push({ full, rel });
  }
  return out;
}

function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  return ['.js', '.json', '.html', '.css', '.md', '.txt', '.env', '.example', '.svg', '.webmanifest'].includes(ext)
    || path.basename(file).startsWith('.env');
}

const files = walk(root);
const failures = [];

for (const { full, rel } of files) {
  for (const pattern of forbiddenPathPatterns) {
    if (pattern.test(rel)) failures.push({ file: rel, issue: 'forbidden legacy path' });
  }

  if (!isTextFile(full) || ignoredFiles.has(rel)) continue;
  let text = '';
  try { text = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }

  for (const item of forbiddenContentPatterns) {
    item.regex.lastIndex = 0;
    const match = item.regex.exec(text);
    if (match) {
      const before = text.slice(0, match.index);
      const line = before.split(/\r?\n/).length;
      failures.push({ file: rel, line, issue: item.name, match: match[0] });
    }
  }
}

if (failures.length) {
  console.error('FAZ 9 eski kalıntı kontrolü başarısız:');
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line || 1} ${failure.issue} (${failure.match || 'path'})`);
  }
  process.exit(1);
}

console.log('FAZ 9 eski kalıntı kontrolü başarılı.');

if (!process.exitCode) process.exit(0);
