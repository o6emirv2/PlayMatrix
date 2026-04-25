#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failures = [];
const htmlFiles = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '__MACOSX'].includes(entry.name)) continue;
      walk(full);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      htmlFiles.push(full);
    }
  }
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

walk(root);

for (const file of htmlFiles) {
  const rel = path.relative(root, file);
  const html = fs.readFileSync(file, 'utf8');
  const checks = [
    { label: 'inline <script>', regex: /<script\b(?![^>]*\bsrc=)[^>]*>/gi },
    { label: 'inline <style>', regex: /<style\b[^>]*>/gi },
    { label: 'inline event handler', regex: /\s(on(?:click|input|error|change|submit|load|mouseover|mouseout|keydown|keyup))\s*=/gi },
    { label: 'inline style attribute', regex: /\sstyle\s*=/gi }
  ];

  for (const check of checks) {
    let match;
    while ((match = check.regex.exec(html))) {
      failures.push(`${rel}:${lineOf(html, match.index)} ${check.label}`);
    }
  }
}

if (failures.length) {
  console.error('CSP inline HTML kontrolü başarısız:');
  failures.slice(0, 120).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 120) console.error(`... ${failures.length - 120} ek bulgu`);
  process.exit(1);
}

console.log(`CSP inline HTML kontrolü başarılı. HTML dosyası: ${htmlFiles.length}`);
process.exit(0);
