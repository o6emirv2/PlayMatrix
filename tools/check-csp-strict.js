'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const failures = [];

if (!/const strictCsp\s*=\s*envFlag\('SECURITY_CSP_STRICT',\s*false\)/.test(serverSource)) {
  failures.push('server.js SECURITY_CSP_STRICT flag standardı bulunamadı.');
}
if (!/if \(!strictCsp\) \{[\s\S]*scriptSrc\.splice\(1, 0, "'unsafe-inline'"\)/.test(serverSource)) {
  failures.push('server.js unsafe-inline yalnız strictCsp kapalıyken eklenmiyor gibi görünüyor.');
}
if (!/scriptSrcAttr:\s*\["'none'"\]/.test(serverSource)) {
  failures.push('server.js script-src-attr none değil.');
}
if (!/const styleSrcAttr\s*=\s*strictCsp \? \["'none'"\] : \["'unsafe-inline'"\]/.test(serverSource)) {
  failures.push('server.js style-src-attr strict geçişi tanımlı değil.');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '__MACOSX'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && full.endsWith('.html')) out.push(full);
  }
  return out;
}

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, 'utf8');
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(source);
  const inlineStyle = /<style(?:\s|>)[\s\S]*?<\/style>|\sstyle\s*=/i.test(source);
  const inlineEvent = /\son[a-z]+\s*=/i.test(source);
  if (inlineScript) failures.push(`${rel}: inline script block`);
  if (inlineStyle) failures.push(`${rel}: inline style/style attr`);
  if (inlineEvent) failures.push(`${rel}: inline event attr`);
}

if (failures.length) {
  console.error('Strict CSP hazırlık kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('check:csp-strict OK');
