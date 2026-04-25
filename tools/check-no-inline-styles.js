'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML_STYLE_ATTR_RE = /\sstyle\s*=/i;
const HTML_STYLE_TAG_RE = /<style(?:\s|>)/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '__MACOSX'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && full.endsWith('.html')) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (HTML_STYLE_ATTR_RE.test(line) || HTML_STYLE_TAG_RE.test(line)) failures.push(`${path.relative(ROOT, file)}:${index + 1}`);
  });
}

if (failures.length) {
  console.error('HTML içinde inline style/style tag bulundu:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('check:no-inline-styles OK');
