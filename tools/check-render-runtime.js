#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const failures = [];
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
function mustContain(file, needle, label) { if (!read(file).includes(needle)) failures.push(`${label} eksik: ${file}`); }
function mustNotContain(file, needle, label) { if (read(file).includes(needle)) failures.push(`${label} bulundu: ${file}`); }

mustContain('config/firebase.js', 'tryResolveCredentialCandidate', 'Firebase credential candidate validation');
mustContain('config/firebase.js', 'privateKeyPem', 'alternate private key field support');
mustContain('config/firebase.js', 'private_key_base64', 'private key base64 support');
mustContain('config/firebase.js', 'serializeStartupError', 'stack-free Firebase startup error');
mustNotContain('config/firebase.js', 'error: serializeError(firebaseInitError)', 'Firebase degraded stack logging');
mustContain('server.js', 'startup env summary', 'compact runtime startup summary');
mustNotContain('server.js', 'sanitized env report:', 'verbose public env dump');
mustNotContain('utils/env.js', 'SECURITY_CSP_STRICT=1 henüz aktif değil', 'production CSP warning spam');
mustContain('routes/profile.routes.js', 'buildFallbackUserStats', 'profile stats degraded fallback');
mustContain('routes/profile.routes.js', 'profile.leaderboard', 'leaderboard error logging');

if (failures.length) {
  console.error('Render runtime kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log('check:render-runtime OK');
