#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

function must(file, needle, label) {
  const body = read(file);
  if (!body.includes(needle)) failures.push(`${label}: ${file} içinde bulunamadı -> ${needle}`);
}

function mustNot(file, needle, label) {
  const body = read(file);
  if (body.includes(needle)) failures.push(`${label}: ${file} içinde kalmamalı -> ${needle}`);
}

must('utils/progression.js', 'ACCOUNT_LEVEL_STEPS_EXACT', 'Exact XP step tablosu');
must('utils/progression.js', 'BigInt(ACCOUNT_BASE_XP)', 'BigInt XP üretimi');
must('utils/progression.js', 'accountXpExact', 'Exact XP kullanıcı alanı');
must('public/data/progression-policy.js', 'ACCOUNT_LEVEL_THRESHOLDS_EXACT', 'Frontend exact XP policy');
must('utils/economyCore.js', 'applyProgressionPatchInTransaction', 'Merkezi progression transaction helper');
must('utils/economyCore.js', 'buildBalanceDebitPatch', 'Merkezi MC debit patch helper');
must('utils/economyCore.js', 'buildBalanceCreditPatch', 'Merkezi MC credit patch helper');
must('utils/rewardService.js', "grant.currency === 'XP'", 'Reward service XP currency desteği');
must('utils/rewardService.js', 'buildProgressionPatch(userSnap.data()', 'Reward service XP progression patch');
must('utils/rewardLedger.js', 'buildLedgerDocId', 'Ledger idempotency key standardı');
must('utils/accountState.js', 'accountXpExact', 'Canonical user exact XP');
must('routes/classic.routes.js', 'applyProgressionPatchInTransaction', 'Classic merkezi progression helper');
must('routes/crash.routes.js', 'applyProgressionPatchInTransaction', 'Crash merkezi progression helper');
must('routes/pisti.routes.js', 'applyProgressionPatchInTransaction', 'Pişti merkezi progression helper');
must('routes/chess.routes.js', 'applyProgressionPatchInTransaction', 'Satranç merkezi progression helper');
must('routes/profile.routes.js', "source: 'wheel_spin'", 'Çark reward ledger standardı');
must('routes/profile.routes.js', "source: 'promo_code'", 'Promo reward ledger standardı');
must('routes/profile.routes.js', "source: 'referral_inviter'", 'Referral inviter reward standardı');
must('routes/profile.routes.js', "source: 'referral_invitee'", 'Referral invitee reward standardı');
must('utils/helpers.js', "sanitizerEngine", 'xss fallback sessiz sanitizer metadata');
mustNot('utils/helpers.js', "console.warn(\"⚠️ 'xss'", 'xss missing warning spam');

if (failures.length) {
  console.error('[check:economy-phase5] başarısız:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('[check:economy-phase5] OK - exact XP, merkezi progression helper, reward ledger ve xss warning standardı doğrulandı.');
