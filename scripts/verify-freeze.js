'use strict';

const fs = require('fs');
const path = require('path');
const { readReleaseManifest, buildReleaseSnapshot } = require('../utils/release');

const root = path.join(__dirname, '..');
const filesToCheck = ['env.env', '.env.env', '.env.example'];
const secretPatterns = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /AIza[0-9A-Za-z\-_]{20,}/,
  /[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/,
  /"type"\s*:\s*"service_account"/
];

function fail(message) {
  console.error(`FREEZE_VERIFY_FAILED: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

const manifest = readReleaseManifest();
if (!manifest) {
  fail('release/manifest.json bulunamadı.');
} else {
  const snapshot = buildReleaseSnapshot();
  if (!snapshot.releaseId || !snapshot.phase || !snapshot.packageVersion) {
    fail('release manifest zorunlu alanları eksik.');
  } else {
    ok(`release manifest hazır (${snapshot.releaseId})`);
  }
}

filesToCheck.forEach((fileName) => {
  const absPath = path.join(root, fileName);
  if (!fs.existsSync(absPath)) {
    fail(`${fileName} bulunamadı.`);
    return;
  }
  const content = fs.readFileSync(absPath, 'utf8');
  const matched = secretPatterns.find((pattern) => pattern.test(content));
  if (matched) {
    fail(`${fileName} içinde secret benzeri içerik bulundu.`);
  } else {
    ok(`${fileName} sırsız.`);
  }
});

['docs/PHASE0_FREEZE.md', 'docs/ROLLBACK.md'].forEach((relativePath) => {
  const absPath = path.join(root, relativePath);
  if (!fs.existsSync(absPath)) fail(`${relativePath} bulunamadı.`);
  else ok(`${relativePath} hazır.`);
});

if (!process.exitCode) {
  ok('FAZ 0 dondurma doğrulaması geçti.');
}
