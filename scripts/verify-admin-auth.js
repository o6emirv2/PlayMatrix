'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const authRoutes = fs.readFileSync(path.join(root, 'routes', 'auth.routes.js'), 'utf8');
const adminIndex = fs.readFileSync(path.join(root, 'public', 'admin', 'index.html'), 'utf8');
const healthPage = fs.readFileSync(path.join(root, 'public', 'admin', 'health.html'), 'utf8');

assert.match(authRoutes, /router\.get\('\/auth\/admin\/diagnostics'/, 'Admin diagnostics endpoint eksik.');
assert.match(authRoutes, /buildAdminSecurityState/, 'Admin security helper eksik.');
assert.match(adminIndex, /browserSessionPersistence/, 'Admin index session persistence kullanmalı.');
assert.doesNotMatch(adminIndex, /browserLocalPersistence/, 'Admin index local persistence kullanmamalı.');
assert.match(healthPage, /browserSessionPersistence/, 'Admin health session persistence kullanmalı.');
assert.doesNotMatch(healthPage, /localStorage\.setItem\('pm_admin_manual_token'/, 'Manual token localStoragea yazılmamalı.');
console.log('FAZ 2 admin auth doğrulaması geçti.');
