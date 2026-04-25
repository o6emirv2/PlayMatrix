'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

function assertIncludes(file, needle, label) {
  const body = read(file);
  if (!body.includes(needle)) failures.push(`${label}: ${file} içinde bulunamadı -> ${needle}`);
}

function assertNotIncludesInWindowClosedBranch(file) {
  const body = read(file);
  const monthlyBranch = body.match(/if \(!resetMeta\.isMonthlyRewardWindowOpen\)[\s\S]*?\n    }\n\n    const topSnap/);
  const activityBranch = body.match(/if \(!resetMeta\.isActivityResetWindowOpen\)[\s\S]*?\n    }\n    await resetActivityPresentationForNewPeriod/);
  if (!monthlyBranch || monthlyBranch[0].includes('lastProcessedPeriodKey')) failures.push('monthly reward pencere kapalı branch içinde lastProcessedPeriodKey yazmamalı.');
  if (!activityBranch || activityBranch[0].includes('lastProcessedPeriodKey')) failures.push('activity reset pencere kapalı branch içinde lastProcessedPeriodKey yazmamalı.');
}

assertIncludes('utils/rewardService.js', 'applyRewardGrantInTransaction', 'Merkezi reward service');
assertIncludes('utils/rewardService.js', 'buildLedgerDocId', 'Ledger idempotency');
assertIncludes('utils/rewardService.js', 'grantRewardToAllUsers', 'Toplu reward service');
assertIncludes('utils/economyCore.js', 'applyProgressionPatchInTransaction', 'Merkezi XP progression transaction helper');
assertIncludes('utils/economyCore.js', 'buildProgressionPatch', 'Merkezi progression patch builder');
assertIncludes('utils/rewardService.js', "grant.currency === 'XP'", 'Reward service XP ledger/progression currency support');
assertIncludes('utils/progression.js', 'ACCOUNT_LEVEL_STEPS_EXACT', 'BigInt exact XP step table');
assertIncludes('utils/progression.js', 'accountXpExact', 'Exact XP field support');
assertIncludes('public/data/progression-policy.js', 'ACCOUNT_LEVEL_STEPS_EXACT', 'Frontend exact XP policy');
assertIncludes('utils/helpers.js', 'sanitizerEngine', 'xss fallback warning spam kapalı');
assertIncludes('crons/tasks.js', "require('../utils/rewardService')", 'Cron merkezi reward service kullanımı');
assertIncludes('crons/tasks.js', "idempotencyKey: `monthly_active_reward:${rewardMonthKey}:${item.doc.id}`", 'Aylık reward idempotency');
assertNotIncludesInWindowClosedBranch('crons/tasks.js');
assertIncludes('routes/admin.routes.js', 'grantRewardToAllUsers', 'Admin reward-all merkezi service');
assertIncludes('routes/admin.routes.js', 'ledgerId: grant.id', 'Admin tekil ödül ledger cevabı');
assertIncludes('routes/profile.routes.js', 'applyRewardGrantInTransaction', 'Wheel/promo transaction reward service');
assertIncludes('routes/profile.routes.js', 'promo_code:${code}:${req.user.uid}', 'Promo duplicate guard');
assertIncludes('routes/profile.routes.js', 'referral_inviter:${code}', 'Referral duplicate guard');
assertIncludes('config/rewardCatalog.js', 'classic_score_progress', 'Classic XP catalog');
assertIncludes('config/rewardCatalog.js', 'crash_spend_progress', 'Crash XP catalog');
assertIncludes('config/rewardCatalog.js', 'pisti_spend_progress', 'Pisti XP catalog');
assertIncludes('config/rewardCatalog.js', 'admin_bulk_grant', 'Admin bulk reward catalog');
assertIncludes('routes/admin.routes.js', "source: 'admin_bulk_grant'", 'Admin reward-all bulk source');
assertIncludes('routes/classic.routes.js', "currency: 'XP'", 'Classic XP ledger');
assertIncludes('routes/crash.routes.js', "source: 'crash_spend_progress'", 'Crash XP ledger');
assertIncludes('routes/pisti.routes.js', "source: 'pisti_spend_progress'", 'Pişti XP ledger');
assertIncludes('routes/pisti.routes.js', "recordPistiProgressLedger(uid, progressReward, `pisti_online:${roomData.id}:${uid}:open`", 'Pişti play-open ledger roomData.id standardı');
assertIncludes('routes/pisti.routes.js', "progressReward = applySpendProgression(tx, uRef, uSnap.data() || {}, bet, 'PISTI_ONLINE_BET')", 'Pişti özel oda XP transaction dönüşü');
assertIncludes('routes/pisti.routes.js', "return sendPistiError(res, e)", 'Pişti HTTP hata statüsü standardı');
assertIncludes('routes/pisti.routes.js', 'applyPistiPotRewardsInTransaction', 'Pişti pot reward transaction');
assertIncludes('routes/crash.routes.js', 'alreadySettled', 'Crash manuel cashout idempotency guard');
assertIncludes('engines/crashEngine.js', 'isCrashBetAlreadySettled', 'Crash auto/loss settlement idempotency guard');
assertIncludes('engines/crashEngine.js', 'settleSingleCrashLoss', 'Crash loss settlement transaction guard');
assertIncludes('routes/chess.routes.js', 'applyRewardGrantInTransaction', 'Satranç ödül transaction ledger standardı');
assertIncludes('routes/chess.routes.js', 'createRewardNotificationForGrant(result.rewardGrant', 'Satranç ödül notification ledger bağlantısı');



const pistiBody = read('routes/pisti.routes.js');
if (pistiBody.includes('pisti_online:${roomId}:${uid}:join')) failures.push('Pişti play-open içinde dış scope roomId ledger referansı kalmamalı.');
if (pistiBody.includes('progressReward = progressReward =')) failures.push('Pişti progressReward çift ataması kalmamalı.');

const adminBody = read('routes/admin.routes.js');
const rewardAllRoute = adminBody.split("router.post('/admin/matrix/reward-all'")[1]?.split("router.post('/admin/matrix/promo-codes'")[0] || '';
if (rewardAllRoute.includes('FieldValue.increment(amount)')) failures.push('Admin reward-all içinde doğrudan balance increment kalmamalı.');

if (failures.length) {
  console.error('Faz 2 ekonomi ve veri bütünlüğü kontrolü başarısız:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Faz 2 ekonomi ve veri bütünlüğü kontrolü başarılı.');
if (!process.exitCode) process.exit(0);
