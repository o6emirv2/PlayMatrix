const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

test('design system stylesheet semantic tokenları ve utility sınıfları içerir', () => {
  const css = read('public', 'design-system.css');
  assert.match(css, /--pm-ds-grid:8px/);
  assert.match(css, /--pm-ds-radius-3:24px/);
  assert.match(css, /--pm-ds-shadow-3:/);
  assert.match(css, /--pm-ds-font-display:/);
  assert.match(css, /\.pm-card-grid/);
  assert.match(css, /\.pm-stack-md/);
  assert.match(css, /\.pm-field/);
  assert.match(css, /prefers-reduced-motion/);
});

test('premium bootstrap body üzerine phase14 tasarım sınıfını işler', () => {
  const js = read('public', 'premium-phase5.js');
  assert.match(js, /pm-phase14-system/);
  assert.match(js, /data-pm-design-system/);
});

test('ana yüzeyler design system stylesheetini yükler', () => {
  const targets = [
    read('index.html'),
    read('public', 'admin', 'index.html'),
    read('Online Oyunlar', 'Satranc.html'),
    read('Casino', 'BlackJack.html'),
    read('Klasik Oyunlar', 'PatternMaster.html')
  ];
  for (const html of targets) {
    assert.match(html, /\/design-system\.css/);
  }
});
