#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function mustContain(file, needle, label) {
  const text = read(file);
  if (!text.includes(needle)) failures.push(`${label} eksik: ${file}`);
}

mustContain('utils/env.js', 'getRuntimeEnvReport', 'sanitized runtime env report');
mustContain('utils/env.js', 'SECRET_ENV_KEY_PATTERN', 'secret env key guard');
mustContain('utils/publicRuntime.js', 'assertPublicRuntimeConfigSafe', 'public runtime config leak guard');
mustContain('utils/corsPolicy.js', 'Public routes follow the same exact-origin contract in production', 'production public CORS exact-origin standardı');
mustContain('config/firebase.js', 'FIREBASE_DEGRADED_MODULES', 'Firebase degraded module listesi');
mustContain('config/firebase.js', 'firebase_admin_degraded_mode_enabled', 'Firebase degraded log event');
mustContain('utils/logger.js', 'createRequestId', 'request id sanitizer');
mustContain('utils/logger.js', 'SENSITIVE_VALUE_PATTERN', 'log redaction pattern');
mustContain('middlewares/rateLimiters.js', 'requestId: req.requestId || null', 'rate limit requestId payload');
mustContain('sockets/index.js', 'socket.data.requestId', 'socket requestId propagation');
mustContain('server.js', 'getFirebaseStatus({ exposeError: false })', 'public health sanitized Firebase status');

if (failures.length) {
  console.error('Runtime hardening kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Runtime hardening kontrolü başarılı. Env, CORS, Firebase degraded mode, public runtime, log redaction ve requestId standardı doğrulandı.');
process.exit(0);
