'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const pkgPath = path.join(root, 'package.json');
const bakımPath = path.join(root, 'Bakım', 'index.html');
const shellJs = path.join(root, 'public', 'shell-enhancements.js');
const shellCss = path.join(root, 'public', 'shell-enhancements.css');
const staleStem = ['pre', 'mium', '-phase5'].join('');
const staleJs = `${staleStem}.js`;
const staleCss = `${staleStem}.css`;
const staleAssetRe = new RegExp(`${staleStem}\\.(?:js|css)`);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

if (!fs.existsSync(serverPath)) fail('server.js bulunamadı.');
const rootEntries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const brokenMaintenanceDirs = rootEntries.filter((name) => /^Bak/i.test(name) && name !== 'Bakım');
if (brokenMaintenanceDirs.length) fail(`Bakım klasör encoding sorunu: ${brokenMaintenanceDirs.join(', ')}. Tek geçerli klasör adı Bakım olmalı.`);
if (!fs.existsSync(bakımPath)) fail('Bakım/index.html bulunamadı veya klasör adı bozuk.');
if (!fs.existsSync(shellJs)) fail('public/shell-enhancements.js bulunamadı.');
if (!fs.existsSync(shellCss)) fail('public/shell-enhancements.css bulunamadı.');
if (fs.existsSync(path.join(root, 'public', staleJs))) fail(`public/${staleJs} hâlâ duruyor.`);
if (fs.existsSync(path.join(root, 'public', staleCss))) fail(`public/${staleCss} hâlâ duruyor.`);
if (fs.existsSync(path.join(root, 'maintenance'))) fail('maintenance/ klasörü oluşturulmamalı; Bakım/ korunmalı.');

const server = read(serverPath);
if (!server.includes("MAINTENANCE_PUBLIC_PATH = '/Bakım/index.html'")) fail('Bakım public path sabiti eksik.');
if (!server.includes("MAINTENANCE_REDIRECT_PATH = '/Bak%C4%B1m/index.html'")) fail('Encoded Bakım redirect path eksik.');
if (!server.includes('resolveMaintenanceFile')) fail('Bakım dosya çözümleyici eksik.');
if (!server.includes("mountGameHtmlAliases('Bakım/index.html'")) fail('Bakım route alias mount eksik.');
if (!server.includes('scriptSrcAttr')) fail('CSP script-src-attr sıkılaştırması eksik.');
if (!server.includes('manifestSrc')) fail('CSP manifest-src eksik.');
if (server.includes(staleJs) || server.includes(staleCss)) fail('server.js içinde eski shell referansı kaldı.');
if (server.includes('catch (_)')) fail('server.js içinde sessiz catch (_) kaldı.');

const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.html$/i.test(entry.name)) htmlFiles.push(full);
  }
}
walk(root);
const staleRefs = htmlFiles.filter((file) => staleAssetRe.test(read(file)));
if (staleRefs.length) fail(`HTML içinde eski shell referansı kaldı: ${staleRefs.map((f) => path.relative(root, f)).join(', ')}`);

const pkg = JSON.parse(read(pkgPath));
if (pkg.scripts?.['check:maintenance'] !== 'node tools/check-maintenance-route.js') {
  fail('package.json check:maintenance scripti eksik.');
}

console.log('✅ Bakım route, server ve shell enhancement kontrolü başarılı.');

if (!process.exitCode) process.exit(0);
