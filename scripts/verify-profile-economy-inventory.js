'use strict';
const fs = require('node:fs');
const path = require('node:path');
function read(file) { return fs.readFileSync(path.join(process.cwd(), file), 'utf8'); }
const checks = [
  ['utils/experienceCenter.js', /buildInventoryHub/],
  ['utils/experienceCenter.js', /resolveInventorySlot/],
  ['routes/socialcenter.routes.js', /router\.get\('\/inventory-hub'/],
  ['routes/socialcenter.routes.js', /router\.post\('\/inventory\/equip'/],
  ['script.js', /Envanter Merkezi/],
  ['script.js', /achievementShowcase\?\.spotlight/],
  ['script.js', /rewardLedger\?\.topSources/]
];
for (const [file, pattern] of checks) { const src = read(file); if (!pattern.test(src)) { console.error(`FAIL ${file} missing ${pattern}`); process.exit(1); } }
console.log('phase12 profile/economy/inventory verify passed');
