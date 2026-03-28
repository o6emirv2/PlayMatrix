'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const mustExist = [
  'utils/socialHub.js',
  'docs/PHASE18_SOCIAL_LAYER.md',
  'tests/phase18-social-layer.test.js'
];
for (const rel of mustExist) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`missing:${rel}`);
    process.exit(1);
  }
}
const routeFile = fs.readFileSync(path.join(root, 'routes/socialcenter.routes.js'), 'utf8');
if (!routeFile.includes("router.get('/social-hub'")) {
  console.error('missing social-hub route');
  process.exit(1);
}
const scriptFile = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
if (!scriptFile.includes('Birleşik Bildirimler') || !scriptFile.includes('Arkadaş Notları')) {
  console.error('missing social ui strings');
  process.exit(1);
}
console.log('phase18 social layer verified');
