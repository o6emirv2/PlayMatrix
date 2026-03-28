'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('topbar dropdown mobilde kırpılmaz ve görünür taşabilir', () => {
  const css = read('style.css');
  assert.match(css, /\.topbar\{\n  overflow:visible;\n\}/);
  assert.match(css, /\.dropdown\{[\s\S]*top:calc\(100% \+ 10px\);/);
  assert.match(css, /\.top-user\{[^\n]*overflow:visible/);
});

test('profil menüsü mobil pointer ve keyboard ile güvenli toggle edilir', () => {
  const js = read('script.js');
  assert.match(js, /function setUserDropdownOpen\(nextOpen\)/);
  assert.match(js, /function toggleUserDropdown\(event\)/);
  assert.match(js, /profileTrigger\.addEventListener\("pointerup", toggleUserDropdown\)/);
  assert.match(js, /profileTrigger\.addEventListener\("keydown", toggleUserDropdown\)/);
  assert.match(js, /closeUserDropdown\(\); openProfileSheet\(\);/);
});
