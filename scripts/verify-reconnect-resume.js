'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks = [
  [/utils\/gameSession\.js/, /includeBlackjack = options && options\.includeBlackjack === true/],
  [/public\/playmatrix-runtime\.js/, /pm-game-runtime-dock/],
  [/Online Oyunlar\/Satranc\.html/, /__PM_GAME_RUNTIME__/],
  [/Online Oyunlar\/Pisti\.html/, /__PM_GAME_RUNTIME__/],
  [/Casino\/BlackJack\.html/, /Masaya Dön/]
];
for (const [fileRx, pattern] of checks) {
  const file = [
    'utils/gameSession.js',
    'public/playmatrix-runtime.js',
    'Online Oyunlar/Satranc.html',
    'Online Oyunlar/Pisti.html',
    'Casino/BlackJack.html'
  ].find((item) => fileRx.test(item));
  const source = read(file);
  if (!pattern.test(source)) throw new Error(`verify failed: ${file}`);
}
console.log('phase9 reconnect/resume verify ok');
