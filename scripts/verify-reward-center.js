'use strict';

const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

const checks = [
  ['utils/rewardCenter.js', /getRewardRuntimeCatalog/],
  ['routes/profile.routes.js', /getWheelRewardPool\(rewardRuntime\.map\)/],
  ['routes/profile.routes.js', /getFixedRewardAmount\('referral_inviter'/],
  ['routes/socialcenter.routes.js', /getActivityPassMilestones/],
  ['crons/tasks.js', /getRewardLadder\('monthly_active_reward'/],
  ['routes/chess.routes.js', /getChessRewardConfig/]
];

for (const [file, pattern] of checks) {
  const content = read(file);
  if (!pattern.test(content)) {
    throw new Error(`Verify failed: ${file} does not match ${pattern}`);
  }
}

console.log('verify-reward-center: ok');
