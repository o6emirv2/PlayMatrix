
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const required = [
  'utils/gameProductCenter.js',
  'docs/PHASE17_GAME_PRODUCT_FEATURES.md',
  'tests/phase17-game-product-features.test.js'
];
for (const rel of required) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`Missing required phase17 file: ${rel}`);
    process.exit(1);
  }
}
const experience = fs.readFileSync(path.join(root, 'utils/experienceCenter.js'), 'utf8');
if (!experience.includes('postGameAnalytics') || !experience.includes('spectatorMode')) {
  console.error('Phase17 experience center hooks missing.');
  process.exit(1);
}
console.log('phase17 game product verification passed');
