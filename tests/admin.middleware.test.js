'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function loadModuleFresh() {
  delete require.cache[require.resolve('../middlewares/admin.middleware')];
  return require('../middlewares/admin.middleware');
}

test('uid ve email birlikte eşleşirse admin kabul edilir', () => {
  process.env.ADMIN_UIDS = 'TAwee0MuAuPKEP156leMcSIHjzh2';
  process.env.ADMIN_EMAILS = 'o6emirv2@gmail.com';

  const { isAdminUser } = loadModuleFresh();

  assert.equal(
    isAdminUser({
      uid: 'TAwee0MuAuPKEP156leMcSIHjzh2',
      email: 'o6emirv2@gmail.com',
      email_verified: true
    }),
    true
  );
});

test('allowlist e-postası doğrulanmışsa uid değişse bile admin kabul edilir', () => {
  process.env.ADMIN_UIDS = 'TAwee0MuAuPKEP156leMcSIHjzh2';
  process.env.ADMIN_EMAILS = 'o6emirv2@gmail.com';

  const { isAdminUser, getAdminMatchDiagnostics } = loadModuleFresh();
  const user = {
    uid: 'firebase-new-uid',
    email: 'o6emirv2@gmail.com',
    email_verified: true
  };

  assert.equal(isAdminUser(user), true);
  const diagnostics = getAdminMatchDiagnostics(user);
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.match.email, true);
  assert.equal(diagnostics.match.source, 'email_fallback');
});

test('allowlist uid eşleşirse email boş olsa bile admin kabul edilir', () => {
  process.env.ADMIN_UIDS = 'TAwee0MuAuPKEP156leMcSIHjzh2';
  process.env.ADMIN_EMAILS = 'o6emirv2@gmail.com';

  const { isAdminUser, getAdminMatchDiagnostics } = loadModuleFresh();
  const user = {
    uid: 'TAwee0MuAuPKEP156leMcSIHjzh2',
    email: '',
    email_verified: false
  };

  assert.equal(isAdminUser(user), true);
  const diagnostics = getAdminMatchDiagnostics(user);
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.match.uid, true);
  assert.equal(diagnostics.match.source, 'uid_fallback');
});

test('custom claims ile verilen admin yetkisi kabul edilir', () => {
  process.env.ADMIN_UIDS = '';
  process.env.ADMIN_EMAILS = '';

  const { isAdminUser } = loadModuleFresh();

  assert.equal(
    isAdminUser({
      uid: 'claim-admin',
      email: 'claim@example.com',
      claims: { admin: true }
    }),
    true
  );
});

test('başka kullanıcı reddedilir', () => {
  process.env.ADMIN_UIDS = 'TAwee0MuAuPKEP156leMcSIHjzh2';
  process.env.ADMIN_EMAILS = 'o6emirv2@gmail.com';

  const { isAdminUser } = loadModuleFresh();

  assert.equal(
    isAdminUser({
      uid: 'someone-else',
      email: 'someone@test.com',
      email_verified: true
    }),
    false
  );
});

test('diagnostics eşleşmeyen alanları raporlar', () => {
  process.env.ADMIN_UIDS = 'TAwee0MuAuPKEP156leMcSIHjzh2';
  process.env.ADMIN_EMAILS = 'o6emirv2@gmail.com';

  const { getAdminMatchDiagnostics } = loadModuleFresh();
  const diagnostics = getAdminMatchDiagnostics({
    uid: 'wrong-uid',
    email: 'wrong@example.com',
    email_verified: true
  });

  assert.equal(diagnostics.ok, false);
  assert.equal(diagnostics.match.uid, false);
  assert.equal(diagnostics.match.email, false);
  assert.ok(diagnostics.reasons.length >= 2);
});
