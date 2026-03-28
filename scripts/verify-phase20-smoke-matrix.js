'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
if (!read('routes/admin.routes.js').includes('/admin/ops/smoke-matrix')) throw new Error('VERIFY_FAIL:smoke-route');
if (!read('public/admin/health.html').includes('FAZ 20 · Device / Browser Smoke Matrix')) throw new Error('VERIFY_FAIL:smoke-ui');
if (!fs.existsSync(path.join(root, 'utils/smokeMatrix.js'))) throw new Error('VERIFY_FAIL:smoke-util');
console.log('verify-phase20-smoke-matrix: ok');
