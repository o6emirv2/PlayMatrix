'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntimeEnv } = require('../utils/env');

test('validateRuntimeEnv geçerli admin ve retention ayarlarını kabul eder', () => {
  const result = validateRuntimeEnv({
    ADMIN_UIDS: 'abc123',
    ADMIN_EMAILS: 'admin@example.com',
    LOBBY_CHAT_RETENTION_DAYS: '7',
    DIRECT_CHAT_RETENTION_DAYS: '7',
    ALLOWED_ORIGINS: 'https://example.com,https://playmatrix.com.tr'
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('validateRuntimeEnv bozuk ALLOWED_ORIGINS ve retention değerlerini reddeder', () => {
  const result = validateRuntimeEnv({
    ALLOWED_ORIGINS: 'not-a-url',
    LOBBY_CHAT_RETENTION_DAYS: '0'
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes('ALLOWED_ORIGINS')));
  assert.ok(result.errors.some((item) => item.includes('LOBBY_CHAT_RETENTION_DAYS')));
});
