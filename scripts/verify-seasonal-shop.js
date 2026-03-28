'use strict';
const fs = require('node:fs');
const path = require('node:path');
function read(file) { return fs.readFileSync(path.join(process.cwd(), file), 'utf8'); }
const checks = [
  ['utils/seasonalShopCenter.js', /buildSeasonalShopRuntime/],
  ['utils/seasonalShopCenter.js', /purchaseSeasonalShopItem/],
  ['routes/socialcenter.routes.js', /router\.get\('\/seasonal-shop'/],
  ['routes/socialcenter.routes.js', /router\.post\('\/seasonal-shop\/purchase'/],
  ['utils/experienceCenter.js', /collectUserOwnedInventoryKeys/],
  ['script.js', /Seasonal Shop/]
];
for (const [file, pattern] of checks) {
  const src = read(file);
  if (!pattern.test(src)) {
    console.error(`FAIL ${file} missing ${pattern}`);
    process.exit(1);
  }
}
console.log('phase13 seasonal shop verify passed');
