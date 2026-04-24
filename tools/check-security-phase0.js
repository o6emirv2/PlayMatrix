'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const failures = [];
const warnings = [];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cache', 'tmp', '.tmp']);
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.html', '.css', '.md', '.txt', '.env', '.example', '.yml', '.yaml']);

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function readText(file) {
  const ext = path.extname(file).toLowerCase();
  const name = path.basename(file).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext) && !name.startsWith('.env')) return '';
  try {
    const stat = fs.statSync(file);
    if (stat.size > 1024 * 1024) return '';
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

const files = walk(ROOT);
const forbiddenFilePatterns = [
  /^\.env$/i,
  /^\.env\.(?!example$).+/i,
  /(^|\/)env\.env$/i,
  /(^|\/)\.env\.env$/i,
  /service-account.*\.json$/i,
  /firebase-adminsdk.*\.json$/i,
  /(^|\/)(secrets?|\.private)(\/|$)/i,
  /PROTOKOL\+.*F[İI]REBASE.*RENDER.*\.md$/i,
  /FIREBASE.*RENDER.*\.md$/i,
  /(^|\/)__MACOSX(\/|$)/i,
  /(^|\/)\._/i
];

files.forEach((file) => {
  const relative = rel(file);
  if (relative === '.env.example') return;
  if (forbiddenFilePatterns.some((pattern) => pattern.test(relative))) {
    fail(`Repo içinde yasak/gizli dosya bulundu: ${relative}`);
  }
});

const secretPatterns = [
  { name: 'Raw private_key JSON field', regex: /"private_key"\s*:\s*"-----BEGIN [^-]+ PRIVATE KEY-----/i },
  { name: 'PEM private key block', regex: /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/i },
  { name: 'Firebase Admin client email with private key context', regex: /"client_email"\s*:\s*"[^"@]+@[^"@]+\.iam\.gserviceaccount\.com"[\s\S]{0,500}"private_key"/i },
  { name: 'Long raw admin second factor assignment', regex: /ADMIN_PANEL_SECOND_FACTOR[ \t]*=[ \t]*[^\r\n#]{12,}/i }
];

files.forEach((file) => {
  const relative = rel(file);
  if (relative === 'tools/check-security-phase0.js') return;
  const text = readText(file);
  if (!text) return;
  secretPatterns.forEach(({ name, regex }) => {
    if (regex.test(text)) fail(`${name} algılandı: ${relative}`);
  });
});


function mustNotContain(file, needle, label) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return;
  const text = fs.readFileSync(abs, 'utf8');
  if (text.includes(needle)) fail(`${label} kaldırılmalı: ${file}`);
}

function mustContain(file, needle, label) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return fail(`${label} eksik: ${file}`);
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.includes(needle)) fail(`${label} bulunamadı: ${file}`);
}


const blockedRenderOrigin = ['https://emirhan', '-siye.onrender.com'].join('');
const blockedFirebaseApiKeyPrefix = ['AIza', 'Sy'].join('');
['public/firebase-runtime.js', 'public/playmatrix-api.js'].forEach((file) => {
  mustNotContain(file, blockedRenderOrigin, 'Hardcoded production backend origin');
});
mustNotContain('public/firebase-runtime.js', 'PM_DEFAULT_PUBLIC_FIREBASE_CONFIG', 'Hardcoded Firebase web config fallback');
mustNotContain('public/firebase-runtime.js', 'PM_DEFAULT_BACKEND_ORIGIN', 'Hardcoded backend origin fallback');
mustNotContain('public/firebase-runtime.js', blockedFirebaseApiKeyPrefix, 'Hardcoded Firebase API key fallback');

files.forEach((file) => {
  const relative = rel(file);
  if (relative === 'tools/check-security-phase0.js') return;
  const text = readText(file);
  if (!text) return;
  if (/\.html$/i.test(relative) && text.includes(blockedRenderOrigin)) {
    fail(`HTML içinde hardcoded production backend origin bulundu: ${relative}`);
  }
});

mustContain('.env.example', 'FIREBASE_KEY_BASE64=', '.env.example güvenli Firebase base64 alanı');
mustContain('.env.example', 'FIREBASE_KEY_PATH=', '.env.example güvenli Firebase file path alanı');
mustContain('.env.example', 'SECURITY_CSP_STRICT=0', '.env.example CSP strict bayrağı');
mustContain('.env.example', 'ADMIN_PANEL_SECOND_FACTOR_HASH_HEX=', '.env.example admin hash alanı');
mustContain('utils/env.js', 'Legacy raw FIREBASE_KEY üretimde algılandı', 'Firebase legacy raw key uyarısı');
mustContain('config/firebase.js', 'Legacy raw FIREBASE_KEY algılandı', 'Firebase legacy raw key compatibility uyarısı');
mustContain('server.js', 'SECURITY_CSP_STRICT', 'server CSP strict bayrağı');
mustContain('docs/SECURITY_CHECKLIST.md', 'Firebase / Render Secret Rotate', 'güvenlik checklist dokümanı');
mustContain('docs/CSP_MIGRATION_PLAN.md', 'unsafe-inline', 'CSP migration planı');
mustContain('docs/SECRET_ROTATION_RUNBOOK.md', 'Service Account Rotate', 'secret rotation runbook');
mustContain('utils/corsPolicy.js', 'Production private/admin CORS must be controlled only by explicit ALLOWED_ORIGINS', 'production exact CORS standardı');
mustContain('utils/corsPolicy.js', 'if (isProductionRuntime()) return false;', 'production preview wildcard kapatma kontrolü');

const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
['.env', 'service-account.json', 'firebase-adminsdk', 'secrets/', '__MACOSX/', '._*'].forEach((needle) => {
  if (!gitignore.includes(needle)) fail(`.gitignore içinde ${needle} koruması yok.`);
});

if (warnings.length) {
  console.warn('Security Phase 0 uyarıları:');
  warnings.forEach((item) => console.warn(`- ${item}`));
}

if (failures.length) {
  console.error('Security Phase 0 kontrolü başarısız:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Security Phase 0 kontrolü başarılı. Secret dosya/ham private key/hardcoded runtime fallback bulunmadı; güvenlik dokümanları ve env sertleştirmeleri mevcut.');

process.exit(0);
