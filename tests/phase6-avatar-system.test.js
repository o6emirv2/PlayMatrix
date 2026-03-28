'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function loadPMAvatar() {
  const code = read('public/avatar-frame.js');
  const context = {
    window: {},
    document: {
      readyState: 'complete',
      documentElement: {},
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement() { return { innerHTML: '', content: { firstElementChild: null } }; }
    },
    MutationObserver: class { observe() {} }
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'avatar-frame.js' });
  return context.window.PMAvatar;
}

test('script legacy frame-lvl class yazımı içermez', () => {
  assert.doesNotMatch(read('script.js'), /className\s*=\s*`avatar-frame frame-lvl-/);
});

test('style legacy frame-lvl dekoratif bloklarını taşımaz', () => {
  const style = read('style.css');
  assert.doesNotMatch(style, /\.frame-lvl-1\s*\{/);
  assert.doesNotMatch(style, /spinFrame/);
  assert.match(style, /PHASE 6 SINGLE AVATAR SYSTEM LOCK/);
});

test('PMAvatar legacy avatar uzlaştırma yardımcılarını dışa açar', () => {
  const PMAvatar = loadPMAvatar();
  assert.equal(typeof PMAvatar.reconcileLegacyAvatarTree, 'function');
  assert.equal(typeof PMAvatar.reconcileLegacyAvatarHost, 'function');
  assert.equal(typeof PMAvatar.upgradeLegacyFrameImage, 'function');
});

test('avatar-frame css legacy wrapperları inert hale getirir', () => {
  const css = read('public/avatar-frame.css');
  assert.match(css, /legacy avatar compatibility lock/i);
  assert.match(css, /\.avatar-frame,[\s\S]*?\.frame-base\s*\{/);
  assert.match(css, /content:\s*none\s*!important;/);
});
