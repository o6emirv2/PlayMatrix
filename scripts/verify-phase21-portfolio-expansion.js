'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
['Klasik Oyunlar/Matrix2048.html', 'Klasik Oyunlar/MemoryFlip.html', 'Klasik Oyunlar/TicTacArena.html'].forEach((file) => {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`VERIFY_FAIL:${file}`);
});
const catalog = fs.readFileSync(path.join(root, 'config/gameCatalog.js'), 'utf8');
if (!catalog.includes('matrix-2048') || !catalog.includes('memory-flip') || !catalog.includes('tic-tac-arena')) throw new Error('VERIFY_FAIL:catalog');
console.log('verify-phase21-portfolio-expansion: ok');
