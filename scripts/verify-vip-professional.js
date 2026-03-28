'use strict';
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const checks = [
  ['config/vip.js', /VIP_ENTRANCE_EFFECTS/],
  ['config/vip.js', /VIP_PARTY_BANNER_PRESETS/],
  ['config/vip.js', /VIP_SEASON_PASS_SKINS/],
  ['utils/vipCenter.js', /selectedEntranceFx/],
  ['utils/vipCenter.js', /missions:/],
  ['routes/socialcenter.routes.js', /vipEntranceFx/],
  ['script.js', /vipIdentityEntrance/],
  ['script.js', /scVipSeasonPassSkin/],
  ['index.html', /vipComfortList/]
];
for (const [file, pattern] of checks) {
  const src = read(file);
  if (!pattern.test(src)) {
    console.error(`FAIL ${file} missing ${pattern}`);
    process.exit(1);
  }
}
console.log('phase15 vip professional verify passed');
