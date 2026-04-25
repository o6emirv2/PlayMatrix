#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const checked = [];
const failures = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function stripShebang(source) {
  return String(source || '').replace(/^#!.*\n/, '\n');
}

function checkSyntax(file) {
  checked.push(path.relative(root, file));
  try {
    new vm.Script(stripShebang(fs.readFileSync(file, 'utf8')), { filename: path.relative(root, file) });
  } catch (error) {
    failures.push({ file: path.relative(root, file), message: error.stack || error.message });
  }
}

const targets = [
  path.join(root, 'server.js'),
  ...walk(path.join(root, 'routes')),
  ...walk(path.join(root, 'middlewares')),
  ...walk(path.join(root, 'utils')),
  ...walk(path.join(root, 'config')),
  ...walk(path.join(root, 'crons')),
  ...walk(path.join(root, 'engines')),
  ...walk(path.join(root, 'sockets'))
];

targets.filter((file, index, arr) => arr.indexOf(file) === index).forEach(checkSyntax);

const serverPath = path.join(root, 'server.js');
if (fs.existsSync(serverPath)) {
  const serverSource = fs.readFileSync(serverPath, 'utf8');
  const requireMatches = [...serverSource.matchAll(/require\(['"](\.\/routes\/[^'"]+)['"]\)/g)];
  for (const match of requireMatches) {
    const routeFile = path.join(root, `${match[1]}.js`);
    if (!fs.existsSync(routeFile)) {
      failures.push({ file: 'server.js', message: `Eksik route require hedefi: ${match[1]}.js` });
    }
  }
}

if (failures.length) {
  console.error('Route/server kontrolü başarısız:');
  failures.forEach((failure) => {
    console.error(`\n- ${failure.file}\n${failure.message}`);
  });
  process.exit(1);
}

console.log(`Route/server kontrolü başarılı. Kontrol edilen JS dosyası: ${checked.length}`);
process.exit(0);
