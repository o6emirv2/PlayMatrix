'use strict';

const fs = require('fs');
const path = require('path');
const { CRITICAL_API_ENDPOINTS, buildCriticalApiSnapshot } = require('../utils/criticalApiMatrix');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

const root = path.join(__dirname, '..');
const serverText = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const profileText = fs.readFileSync(path.join(root, 'routes', 'profile.routes.js'), 'utf8');
const authText = fs.readFileSync(path.join(root, 'routes', 'auth.routes.js'), 'utf8');
const adminText = fs.readFileSync(path.join(root, 'routes', 'admin.routes.js'), 'utf8');
const socialCenterText = fs.readFileSync(path.join(root, 'routes', 'socialcenter.routes.js'), 'utf8');

assert(Array.isArray(CRITICAL_API_ENDPOINTS) && CRITICAL_API_ENDPOINTS.length >= 10, 'Kritik endpoint matrisi eksik.');
assert(buildCriticalApiSnapshot().responseContract.successFields.includes('requestId'), 'Response kontratı requestId içermiyor.');
assert(serverText.includes('/api/critical-api-status'), 'Server kritik API durum endpointini yayınlamıyor.');
assert(profileText.includes('LEADERBOARD_LOAD_FAILED'), 'Leaderboard hata kodu sabitlenmemiş.');
assert(profileText.includes('USER_STATS_LOAD_FAILED'), 'User stats hata kodu sabitlenmemiş.');
assert(authText.includes('ADMIN_DIAGNOSTICS_FAILED'), 'Admin diagnostics hata kodu sabitlenmemiş.');
assert(adminText.includes('ADMIN_OVERVIEW_LOAD_FAILED'), 'Admin overview hata kodu sabitlenmemiş.');
assert(socialCenterText.includes('SOCIAL_CENTER_SUMMARY_FAILED'), 'Sosyal merkez hata kodu sabitlenmemiş.');

console.log('✅ Faz 3 kritik API doğrulaması geçti.');
