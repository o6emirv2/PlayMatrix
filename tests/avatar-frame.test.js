'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadPMAvatar() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'avatar-frame.js'), 'utf8');
  const context = {
    window: {},
    document: {
      createElement() {
        return {
          innerHTML: '',
          content: { firstElementChild: null }
        };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'avatar-frame.js' });
  return context.window.PMAvatar;
}

test('PMAvatar level ve exactFrameIndex çözümlemesi doğru çalışır', () => {
  const PMAvatar = loadPMAvatar();
  assert.equal(PMAvatar.getFrameAssetIndex(0), 0);
  assert.equal(PMAvatar.getFrameAssetIndex(5), 1);
  assert.equal(PMAvatar.getFrameAssetIndex(100), 20);
  assert.equal(PMAvatar.resolveFrameIndex(75, null), 15);
  assert.equal(PMAvatar.resolveFrameIndex(5, 12), 12);
});

test('PMAvatar buildHTML güvenli fallback avatar ve data attribute üretir', () => {
  const PMAvatar = loadPMAvatar();
  const html = PMAvatar.buildHTML({
    avatarUrl: 'javascript:alert(1)',
    exactFrameIndex: 16,
    sizePx: 48,
    alt: 'Test "oyuncu"'
  });
  assert.match(html, /data-pm-avatar="true"/);
  assert.match(html, /data-frame-index="16"/);
  assert.match(html, /frame-16/);
  assert.match(html, /width:48px/);
  assert.ok(!html.includes('javascript:alert(1)'));
  assert.match(html, /encrypted-tbn0\.gstatic\.com/);
  assert.match(html, /Test &quot;oyuncu&quot;/);
});
