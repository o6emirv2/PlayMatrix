'use strict';

const { cleanStr } = require('../utils/helpers');

function firstItem(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0] || '';
}

function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => cleanStr(item || '', 200))
    .filter(Boolean);
}

const ADMIN_ROLE_PERMISSIONS = Object.freeze({
  superadmin: ['*']
});

function getPrimaryAdminUid() {
  return firstItem(process.env.ADMIN_UIDS || process.env.ADMIN_UID || process.env.PRIMARY_ADMIN_UID || '');
}

function getPrimaryAdminEmail() {
  return firstItem(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.PRIMARY_ADMIN_EMAIL || '')
    .toLowerCase();
}

function getConfiguredAdminUids() {
  return new Set(parseCsv(process.env.ADMIN_UIDS || process.env.ADMIN_UID || process.env.PRIMARY_ADMIN_UID || ''));
}

function getConfiguredAdminEmails() {
  return new Set(parseCsv(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.PRIMARY_ADMIN_EMAIL || '').map((item) => item.toLowerCase()));
}

function getConfiguredAdminEntries() {
  const uids = parseCsv(process.env.ADMIN_UIDS || process.env.ADMIN_UID || process.env.PRIMARY_ADMIN_UID || '').map((item) => cleanStr(item || '', 160));
  const emails = parseCsv(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.PRIMARY_ADMIN_EMAIL || '').map((item) => cleanStr(item || '', 200).toLowerCase());
  const length = Math.max(uids.length, emails.length);
  const rows = [];
  for (let index = 0; index < length; index += 1) {
    const uid = cleanStr(uids[index] || '', 160);
    const email = cleanStr(emails[index] || '', 200).toLowerCase();
    if (!uid && !email) continue;
    rows.push({ uid, email, index });
  }
  return rows;
}

function normalizeRole(value = '') {
  const role = cleanStr(value || '', 32).toLowerCase();
  return Object.prototype.hasOwnProperty.call(ADMIN_ROLE_PERMISSIONS, role) ? role : '';
}

function normalizePermissions(value) {
  const array = Array.isArray(value) ? value : parseCsv(value || '');
  return Array.from(new Set(array
    .map((item) => cleanStr(item || '', 64).toLowerCase())
    .filter(Boolean)));
}

function mergePermissions(...groups) {
  return Array.from(new Set(groups.flatMap((group) => normalizePermissions(group))));
}

function expandRolePermissions(role = '') {
  return ADMIN_ROLE_PERMISSIONS[normalizeRole(role)] || [];
}

function extractIdentity(user = {}) {
  const claims = user?.claims && typeof user.claims === 'object' ? user.claims : {};
  const uid = cleanStr(user?.uid || claims.uid || '', 160);
  const email = cleanStr(user?.email || claims.email || '', 200).toLowerCase();
  const emailVerified = user?.email_verified === undefined
    ? (claims.email_verified === undefined ? false : claims.email_verified === true)
    : user.email_verified === true;
  return {
    uid,
    email,
    emailVerified,
    claims
  };
}

function resolveClaimRoles(claims = {}) {
  const roles = [];
  const scalarRole = normalizeRole(claims.role || claims.adminRole || claims.admin_role || '');
  if (scalarRole) roles.push(scalarRole);
  if (Array.isArray(claims.roles)) {
    claims.roles.forEach((role) => {
      const safeRole = normalizeRole(role);
      if (safeRole) roles.push(safeRole);
    });
  }
  if ((claims.superadmin === true || claims.isSuperadmin === true) && !roles.includes('superadmin')) {
    roles.push('superadmin');
  }
  return Array.from(new Set(roles));
}

function resolveClaimAdminContext(user = {}) {
  const { uid, email, claims } = extractIdentity(user);
  const roles = resolveClaimRoles(claims);
  const explicitAdmin = claims.admin === true || claims.isAdmin === true || claims.superadmin === true || claims.isSuperadmin === true;
  const permissions = mergePermissions(
    claims.permissions,
    explicitAdmin ? ['*'] : [],
    ...roles.map((role) => expandRolePermissions(role))
  );

  if (!explicitAdmin && roles.length === 0 && permissions.length === 0) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none' };
  }

  const role = roles[0] || 'superadmin';
  const resolvedPermissions = permissions.length ? permissions : mergePermissions(expandRolePermissions(role));
  return {
    isAdmin: true,
    role,
    roles: roles.length ? roles : [role],
    permissions: resolvedPermissions.length ? resolvedPermissions : ['*'],
    source: 'claims',
    uid,
    email
  };
}

function evaluateConfiguredAdminMatch(user = {}) {
  const { uid, email, emailVerified } = extractIdentity(user);
  const entries = getConfiguredAdminEntries();
  const configuredUidSet = getConfiguredAdminUids();
  const configuredEmailSet = getConfiguredAdminEmails();
  const configuredUid = getPrimaryAdminUid();
  const configuredEmail = getPrimaryAdminEmail();

  const pairMatch = entries.find((entry) => {
    const uidOk = entry.uid ? entry.uid === uid : true;
    const emailOk = entry.email ? entry.email === email : true;
    return (entry.uid || entry.email) && uidOk && emailOk;
  }) || null;

  const uidMatch = uid ? configuredUidSet.has(uid) : false;
  const emailMatch = email ? configuredEmailSet.has(email) : false;
  const uidRequired = entries.some((entry) => !!entry.uid);
  const emailRequired = entries.some((entry) => !!entry.email);

  let allowed = false;
  let mode = 'none';
  if (pairMatch) {
    allowed = true;
    if (pairMatch.uid && pairMatch.email) mode = 'pair';
    else if (pairMatch.email) mode = 'email';
    else mode = 'uid';
  } else if (uidMatch) {
    allowed = true;
    mode = 'uid_fallback';
  } else if (emailMatch && emailVerified) {
    allowed = true;
    mode = 'email_fallback';
  }

  return {
    uid,
    email,
    emailVerified,
    configuredUid,
    configuredEmail,
    configuredUidSet,
    configuredEmailSet,
    configuredCount: entries.length,
    uidRequired,
    emailRequired,
    uidMatch,
    emailMatch,
    pairMatch,
    allowed,
    mode
  };
}

function matchesPrimaryAdmin(user = {}) {
  const match = evaluateConfiguredAdminMatch(user);
  return {
    uid: match.uid,
    email: match.email,
    configuredUid: match.configuredUid,
    configuredEmail: match.configuredEmail,
    allowed: match.allowed,
    mode: match.mode,
    emailVerified: match.emailVerified,
    uidMatch: match.uidMatch,
    emailMatch: match.emailMatch,
    pairMatch: !!match.pairMatch
  };
}

function maskValue(value = '', visible = 3) {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.length <= visible) return `${raw}${'*'.repeat(Math.max(0, 4 - raw.length))}`;
  return `${raw.slice(0, visible)}${'*'.repeat(Math.max(4, raw.length - visible))}`;
}

function getAdminMatchDiagnostics(user = {}) {
  const identity = extractIdentity(user);
  const claimContext = resolveClaimAdminContext(user);
  const envMatch = evaluateConfiguredAdminMatch(user);
  const allowed = claimContext.isAdmin || envMatch.allowed;

  const configured = {
    uidConfigured: envMatch.configuredUidSet.size > 0,
    emailConfigured: envMatch.configuredEmailSet.size > 0,
    configuredCount: envMatch.configuredCount,
    uidPreview: maskValue(envMatch.configuredUid),
    emailDomain: envMatch.configuredEmail.includes('@') ? envMatch.configuredEmail.split('@').slice(-1)[0] : ''
  };

  const match = {
    uid: configured.uidConfigured ? envMatch.uidMatch : null,
    email: configured.emailConfigured ? envMatch.emailMatch : null,
    pair: configured.uidConfigured || configured.emailConfigured ? !!envMatch.pairMatch : null,
    source: claimContext.isAdmin ? 'claims' : (envMatch.mode || 'none')
  };

  const reasons = [];
  const codes = [];
  const hints = [];

  if (!identity.uid) { reasons.push('UID eksik.'); codes.push('UID_MISSING'); }
  if (!identity.email) { reasons.push('E-posta eksik.'); codes.push('EMAIL_MISSING'); }
  if (!configured.uidConfigured) { reasons.push('ADMIN_UIDS tanımlı değil.'); codes.push('ADMIN_UIDS_MISSING'); }
  if (!configured.emailConfigured) { reasons.push('ADMIN_EMAILS tanımlı değil.'); codes.push('ADMIN_EMAILS_MISSING'); }

  if (claimContext.isAdmin) {
    hints.push('Firebase custom claim üzerinden admin yetkisi doğrulandı.');
  } else if (envMatch.allowed) {
    if (envMatch.mode === 'pair') hints.push('Allowlist UID ve e-posta birlikte eşleşti.');
    else if (envMatch.mode === 'email' || envMatch.mode === 'email_fallback') hints.push('Allowlist e-posta eşleştiği için admin oturumu açıldı.');
    else if (envMatch.mode === 'uid' || envMatch.mode === 'uid_fallback') hints.push('Allowlist UID eşleştiği için admin oturumu açıldı.');
  } else {
    if (configured.uidConfigured && identity.uid && !envMatch.uidMatch) { reasons.push('UID eşleşmiyor.'); codes.push('UID_MISMATCH'); }
    if (configured.emailConfigured && identity.email && !envMatch.emailMatch) { reasons.push('E-posta eşleşmiyor.'); codes.push('EMAIL_MISMATCH'); }
    if (envMatch.emailMatch && !identity.emailVerified) { reasons.push('Admin e-posta hesabı doğrulanmamış.'); codes.push('EMAIL_NOT_VERIFIED'); }
    hints.push('Allowlistteki UID veya doğrulanmış e-posta ile admin oturumu açılır.');
  }

  return {
    ok: allowed,
    configured,
    user: {
      uid: identity.uid,
      email: identity.email,
      emailVerified: identity.emailVerified
    },
    match,
    reasons,
    codes,
    hints
  };
}

function extractInlineAdminContext(user = {}) {
  const claimContext = resolveClaimAdminContext(user);
  if (claimContext.isAdmin) return claimContext;

  const envMatch = evaluateConfiguredAdminMatch(user);
  if (!envMatch.allowed) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none' };
  }

  const role = 'superadmin';
  return {
    isAdmin: true,
    role,
    roles: [role],
    permissions: mergePermissions(expandRolePermissions(role)),
    source: envMatch.mode || 'env',
    uid: envMatch.uid,
    email: envMatch.email
  };
}

async function resolveAdminContext(user = {}) {
  return extractInlineAdminContext(user);
}

function hasAdminPermission(context = {}, permission = '') {
  const safePermission = cleanStr(permission || '', 64).toLowerCase();
  if (!context?.isAdmin) return false;
  const permissions = normalizePermissions(context?.permissions || []);
  if (permissions.includes('*')) return true;
  if (!safePermission) return true;
  if (permissions.includes(safePermission)) return true;

  const prefix = safePermission.split('.')[0];
  if (prefix && permissions.includes(`${prefix}.*`)) return true;
  return false;
}

function hasEveryPermission(context = {}, requiredPermissions = []) {
  const required = normalizePermissions(requiredPermissions);
  if (!required.length) return !!context?.isAdmin;
  return required.every((permission) => hasAdminPermission(context, permission));
}

function isPrimaryAdmin(user = {}) {
  return matchesPrimaryAdmin(user).allowed;
}

function isAdminUser(user = {}) {
  return extractInlineAdminContext(user).isAdmin;
}

function createAdminGuard(requiredPermissions = []) {
  const normalizedRequired = normalizePermissions(requiredPermissions);
  return async function adminGuard(req, res, next) {
    const { verifyAuth } = require('./auth.middleware');

    await verifyAuth(req, res, async () => {
      const context = await resolveAdminContext(req.user);
      req.adminContext = context;

      if (!context?.isAdmin) {
        return res.status(403).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
      }

      if (!hasEveryPermission(context, normalizedRequired)) {
        return res.status(403).json({
          ok: false,
          error: 'Bu işlem için yeterli yönetici yetkiniz yok.',
          requiredPermissions: normalizedRequired,
          role: context.role || 'superadmin'
        });
      }

      return next();
    });
  };
}

const verifyAdmin = createAdminGuard();
const requireAdminPermission = (...permissions) => createAdminGuard(permissions);

module.exports = {
  ADMIN_ROLE_PERMISSIONS,
  get PRIMARY_ADMIN_UID() {
    return getPrimaryAdminUid();
  },
  get PRIMARY_ADMIN_EMAIL() {
    return getPrimaryAdminEmail();
  },
  normalizeRole,
  normalizePermissions,
  expandRolePermissions,
  extractInlineAdminContext,
  resolveAdminContext,
  getAdminMatchDiagnostics,
  hasAdminPermission,
  hasEveryPermission,
  isPrimaryAdmin,
  isAdminUser,
  createAdminGuard,
  verifyAdmin,
  requireAdminPermission
};
