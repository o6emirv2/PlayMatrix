#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readTree = (dir, ext) => {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return '';
  const chunks = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(ext)) chunks.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(abs);
  return chunks.join('\n');
};
const fail = (message) => {
  console.error(`[FAZ10] ${message}`);
  process.exitCode = 1;
};
const mustContain = (content, sourceLabel, needle, label = needle) => {
  if (!content.includes(needle)) fail(`${sourceLabel} içinde zorunlu kalıp yok: ${label}`);
};
const mustNotMatch = (file, regex, label = String(regex)) => {
  const content = read(file);
  if (regex.test(content)) fail(`${file} içinde yasaklı kalıp bulundu: ${label}`);
};

const homeJs = [read('script.js'), readTree('public/js/home', '.js'), readTree('public/js/core', '.js'), readTree('public/js/profile', '.js')].join('\n');
const css = [read('style.css'), readTree('public/css', '.css')].join('\n');
const indexHtml = read('index.html');

mustContain(indexHtml, 'index.html', 'name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"', 'FAZ 3 standart mobil viewport');
mustContain(indexHtml, 'index.html', 'id="ddLevel"', 'profil dropdown seviye id');
mustContain(indexHtml, 'index.html', 'id="profileStatsGrid"', 'profil istatistik grid');
mustContain(indexHtml, 'index.html', 'promo-stack--enhanced', 'yenilenmiş promo isimlendirmesi');

mustContain(homeJs, 'modüler ana sayfa JS', 'function renderProfileStats', 'profil istatistik render fonksiyonu');
mustContain(homeJs, 'modüler ana sayfa JS', 'function appendSafeInlineMarkup', 'güvenli sınırlı markup yardımcı fonksiyonu');
mustContain(homeJs, 'modüler ana sayfa JS', 'document.createElement', 'DOM tabanlı güvenli render');

mustContain(css, 'modüler CSS', 'profile-stats-grid', 'profil istatistik responsive grid');
mustContain(css, 'modüler CSS', 'pm-phase10-responsive-guard', 'faz 10 responsive guard');
mustContain(css, 'modüler CSS', 'sheet-shell.is-social .pm-social-layout', 'sosyal merkez mobil override');

const profileRoutes = read('routes/profile.routes.js');
mustContain(profileRoutes, 'routes/profile.routes.js', 'statistics: {', 'backend istatistik nesnesi');
mustContain(profileRoutes, 'routes/profile.routes.js', 'pistiWins', 'Pişti istatistik alanı');
mustContain(profileRoutes, 'routes/profile.routes.js', 'crashRounds', 'Crash istatistik alanı');
mustContain(profileRoutes, 'routes/profile.routes.js', 'sanitizeAvatarForStorage(data.avatar) || DEFAULT_AVATAR', 'liderlik/profil avatar sanitize');

const socialRoutes = read('routes/social.routes.js');
mustContain(socialRoutes, 'routes/social.routes.js', 'sanitizeAvatarForStorage(userData.avatar) || DEFAULT_AVATAR', 'sosyal avatar sanitize');
mustContain(socialRoutes, 'routes/social.routes.js', 'stats: {', 'sosyal üye istatistikleri');
const socialCenterRoutes = read('routes/socialcenter.routes.js');
mustContain(socialCenterRoutes, 'routes/socialcenter.routes.js', 'sanitizeAvatarForStorage(data.avatar) || DEFAULT_AVATAR', 'sosyal merkez avatar sanitize');
mustContain(socialCenterRoutes, 'routes/socialcenter.routes.js', 'stats: {', 'sosyal merkez üye istatistikleri');

mustNotMatch('public/admin/matrix-dashboard.js', /\b(?:innerHTML|insertAdjacentHTML|outerHTML)\b/, 'admin dashboard XSS riskli HTML API kullanımı');
mustNotMatch('public/admin/health.html', /\b(?:innerHTML|insertAdjacentHTML|outerHTML)\b/, 'admin health XSS riskli HTML API kullanımı');
mustContain(read('public/admin/matrix-dashboard.css'), 'public/admin/matrix-dashboard.css', 'FAZ 10 — Admin panel mobil taşma koruması', 'admin panel responsive guard');

if (!process.exitCode) console.log('[FAZ10] Ana sayfa/profil/liderlik/istatistik kontrolleri başarılı.');
if (!process.exitCode) process.exit(0);
