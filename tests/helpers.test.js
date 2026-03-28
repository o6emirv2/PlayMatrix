'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanStr, containsBlockedUsername, checkProfanity, decodeHtmlEntities } = require('../utils/helpers');

test('cleanStr script taglerini temizler', () => {
  const value = cleanStr('<script>alert(1)</script>Merhaba');
  assert.equal(value, 'Merhaba');
});

test('engellenen kullanıcı adını yakalar', () => {
  assert.equal(containsBlockedUsername('orospu123'), true);
  assert.equal(containsBlockedUsername('TemizKullanici'), false);
});

test('küfür filtresi çalışır', () => {
  assert.equal(checkProfanity('selam amk'), true);
  assert.equal(checkProfanity('iyi oyunlar'), false);
});

test('html entity decode sanitize zinciri script entity saldırısını temizler', () => {
  const value = cleanStr('&lt;script&gt;alert(1)&lt;/script&gt;Merhaba');
  assert.equal(value, 'Merhaba');
});

test('decodeHtmlEntities temel entity çözümlemesini yapar', () => {
  assert.equal(decodeHtmlEntities('&lt;b&gt;Test&lt;/b&gt; &amp; OK'), '<b>Test</b> & OK');
});
