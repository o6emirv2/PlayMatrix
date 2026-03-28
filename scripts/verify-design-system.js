'use strict';
const fs = require('node:fs');
const path = require('node:path');
function read(file) { return fs.readFileSync(path.join(process.cwd(), file), 'utf8'); }
const checks = [
  ['public/design-system.css', /--pm-ds-grid:8px/],
  ['public/design-system.css', /\.pm-card-grid/],
  ['public/design-system.css', /body\.pm-phase14-system/],
  ['public/design-system.css', /prefers-reduced-motion/],
  ['public/premium-phase5.js', /pm-phase14-system/],
  ['index.html', /\/design-system\.css/],
  ['public\/admin\/index.html', /\/design-system\.css/]
];
for (const [file, pattern] of checks) {
  const src = read(file);
  if (!pattern.test(src)) {
    console.error(`FAIL ${file} missing ${pattern}`);
    process.exit(1);
  }
}
console.log('phase14 design system verify passed');
