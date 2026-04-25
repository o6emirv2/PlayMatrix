'use strict';

const { cleanStr } = require('../utils/helpers');

function parseCsv(value = '', maxLen = 120) {
  return String(value || '')
    .split(',')
    .map((item) => cleanStr(item || '', maxLen))
    .filter(Boolean);
}

function parseEmailCsv(value = '') {
  return parseCsv(value || '', 200).map((item) => item.toLowerCase());
}

const ADMIN_ROLE_PERMISSIONS = Object.freeze({
  superadmin: ['*'],
  admin: ['admin.read', 'users.read', 'users.write', 'rewards.read', 'rewards.write', 'moderation.write', 'support.read', 'support.write', 'system.read'],
  moderator: ['admin.read', 'users.read', 'moderation.write', 'support.read', 'support.write'],
  support: ['admin.read', 'users.read', 'support.read', 'support.write'],
  rewards: ['admin.read', 'users.read', 'rewards.read', 'rewards.write'],
  ops: ['admin.read', 'users.read', 'system.read']
});

const ROLE_ALIASES = Object.freeze({
  owner: 'superadmin',
  root: 'superadmin',
  operator: 'ops'
});

function getPrimaryAdminUid() {
  return parseCsv(process.env.ADMIN_UIDS || process.env.ADMIN_UID || process.env.PRIMARY_ADMIN_UID || '', 160)[0] || '';
}

function getPrimaryAdminEmail() {
  return parseEmailCsv(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.PRIMARY_ADMIN_EMAIL || '')[0] || '';
}

function getConfiguredAdminUids() {
  return new Set(parseCsv(process.env.ADMIN_UIDS || process.env.ADMIN_UID || process.env.PRIMARY_ADMIN_UID || '', 160));
}

function getConfiguredAdminEmails() {
  return new Set(parseEmailCsv(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.PRIMARY_ADMIN_EMAIL || ''));
}

function getConfiguredAdminEntries() {
  const uids = parseCsv(process.env.ADMIN_UIDS || process.env.ADMIN_UID || process.env.PRIMARY_ADMIN_UID || '', 160);
  const emails = parseEmailCsv(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.PRIMARY_ADMIN_EMAIL || '');
  const size = Math.max(uids.length, emails.length);
  return Array.from({ length: size }, (_, index) => ({
    index,
    uid: cleanStr(uids[index] || '', 160),
    email: cleanStr(emails[index] || '', 200).toLowerCase()
  })).filter((entry) => entry.uid || entry.email);
}

function normalizeRole(value = '') {
  const normalized = cleanStr(value || '', 32).toLowerCase();
  const aliased = ROLE_ALIASES[normalized] || normalized;
  return Object.prototype.hasOwnProperty.call(ADMIN_ROLE_PERMISSIONS, aliased) ? aliased : '';
}

function normalizePermissions(value) {
  const array = Array.isArray(value) ? value : parseCsv(value || '', 96);
  return Array.from(new Set(array
    .map((item) => cleanStr(item || '', 96).toLowerCase())
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
  return {
    uid: cleanStr(user?.uid || claims.uid || '', 160),
    email: cleanStr(user?.email || claims.email || '', 200).toLowerCase(),
    claims
  };
}

function matchesPrimaryAdmin(user = {}) {
  const { uid, email } = extractIdentity(user);
  const configuredUid = getPrimaryAdminUid();
  const configuredEmail = getPrimaryAdminEmail();
  const uidOk = configuredUid ? uid === configuredUid : true;
  const emailOk = configuredEmail ? email === configuredEmail : true;

  return {
    uid,
    email,
    configuredUid,
    configuredEmail,
    allowed: !!uid && !!email && uidOk && emailOk
  };
}

function buildContext({ uid = '', email = '', role = '', roles = [], permissions = [], source = 'none', metadata = {} } = {}) {
  const normalizedRole = normalizeRole(role || roles[0] || '');
  const normalizedRoles = Array.from(new Set((Array.isArray(roles) ? roles : [roles])
    .map((item) => normalizeRole(item))
    .filter(Boolean)));
  const mergedRoles = Array.from(new Set([normalizedRole, ...normalizedRoles].filter(Boolean)));
  const mergedPermissions = mergePermissions(
    ...mergedRoles.map((item) => expandRolePermissions(item)),
    permissions
  );

  if (!mergedRoles.length && !mergedPermissions.length) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  }

  const resolutionChain = Array.from(new Set((Array.isArray(metadata?.resolutionChain) ? metadata.resolutionChain : [source])
    .map((item) => cleanStr(item || '', 96))
    .filter(Boolean)));

  return {
    isAdmin: true,
    uid,
    email,
    role: mergedRoles[0] || 'admin',
    roles: mergedRoles.length ? mergedRoles : ['admin'],
    permissions: mergedPermissions,
    source,
    metadata: {
      ...metadata,
      resolutionChain
    }
  };
}

function matchConfiguredEntry(identity = {}, entry = {}) {
  if (!entry?.uid && !entry?.email) return false;
  if (entry.uid && identity.uid !== entry.uid) return false;
  if (entry.email && identity.email !== entry.email) return false;
  return true;
}

function extractEnvAdminContext(user = {}) {
  const primary = matchesPrimaryAdmin(user);
  if (primary.allowed) {
    return buildContext({
      uid: primary.uid,
      email: primary.email,
      role: 'superadmin',
      source: 'env:primary',
      metadata: {
        configuredUid: primary.configuredUid,
        configuredEmail: primary.configuredEmail,
        resolutionChain: ['env:primary']
      }
    });
  }

  const identity = extractIdentity(user);
  if (!identity.uid && !identity.email) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  }

  const matchedEntry = getConfiguredAdminEntries().find((entry) => matchConfiguredEntry(identity, entry));
  if (!matchedEntry) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  }

  return buildContext({
    uid: identity.uid,
    email: identity.email,
    role: matchedEntry.index === 0 ? 'superadmin' : 'admin',
    source: matchedEntry.index === 0 ? 'env:primary' : 'env:list',
    metadata: {
      entryIndex: matchedEntry.index,
      configuredUid: matchedEntry.uid,
      configuredEmail: matchedEntry.email,
      resolutionChain: [matchedEntry.index === 0 ? 'env:primary' : 'env:list']
    }
  });
}

function extractClaimsAdminContext(user = {}) {
  const { uid, email, claims } = extractIdentity(user);
  const claimRoles = [];
  if (claims.adminRole) claimRoles.push(claims.adminRole);
  if (Array.isArray(claims.adminRoles)) claimRoles.push(...claims.adminRoles);
  if (Array.isArray(claims.roles)) claimRoles.push(...claims.roles);
  const normalizedRoles = claimRoles.map((item) => normalizeRole(item)).filter(Boolean);
  const permissions = mergePermissions(claims.adminPermissions, claims.permissions);
  const explicitAdminFlag = claims.admin === true || claims.isAdmin === true;
  const flagged = explicitAdminFlag || normalizedRoles.length > 0 || permissions.length > 0;
  if (!uid || !email || !flagged) return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  return buildContext({
    uid,
    email,
    role: normalizedRoles[0] || (explicitAdminFlag ? 'admin' : ''),
    roles: normalizedRoles,
    permissions,
    source: 'claims',
    metadata: {
      explicitAdminFlag,
      resolutionChain: ['claims']
    }
  });
}

function extractStoredSourceContext(identity = {}, sourceName = '', data = {}) {
  const uid = cleanStr(identity.uid || '', 160);
  const email = cleanStr(identity.email || '', 200).toLowerCase();
  if (!uid || !email || !data || typeof data !== 'object') {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  }

  const active = data.active !== false && data.disabled !== true && data.revoked !== true && data.isAdmin !== false;
  if (!active) return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };

  const recordEmail = cleanStr(data.email || '', 200).toLowerCase();
  if (recordEmail && recordEmail !== email) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  }

  const explicitAdminFlag = data.admin === true || data.isAdmin === true || data.adminEnabled === true || data.adminActive === true;
  const rawRoles = [];
  if (data.adminRole) rawRoles.push(data.adminRole);
  if (Array.isArray(data.adminRoles)) rawRoles.push(...data.adminRoles);

  if (sourceName === 'admin_members') {
    if (data.role) rawRoles.push(data.role);
    if (Array.isArray(data.roles)) rawRoles.push(...data.roles);
  } else if (explicitAdminFlag) {
    if (data.role) rawRoles.push(data.role);
    if (Array.isArray(data.roles)) rawRoles.push(...data.roles);
  }

  const permissions = mergePermissions(data.adminPermissions, data.permissions);
  const normalizedRoles = rawRoles.map((item) => normalizeRole(item)).filter(Boolean);
  const role = normalizedRoles[0] || (explicitAdminFlag ? 'admin' : '');

  if (!role && permissions.length === 0 && !explicitAdminFlag) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  }

  return buildContext({
    uid,
    email,
    role,
    roles: normalizedRoles,
    permissions,
    source: `firestore:${sourceName}`,
    metadata: {
      resolutionChain: [`firestore:${sourceName}`],
      recordEmail: recordEmail || email
    }
  });
}

async function resolveStoredAdminContext(user = {}) {
  const identity = extractIdentity(user);
  if (!identity.uid || !identity.email) return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };

  try {
    const { db } = require('../config/firebase');
    const [memberSnap, userSnap] = await Promise.all([
      db.collection('admin_members').doc(identity.uid).get().catch(() => null),
      db.collection('users').doc(identity.uid).get().catch(() => null)
    ]);

    const memberContext = memberSnap?.exists
      ? extractStoredSourceContext(identity, 'admin_members', memberSnap.data() || {})
      : { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
    if (memberContext.isAdmin) return memberContext;

    const userContext = userSnap?.exists
      ? extractStoredSourceContext(identity, 'users', userSnap.data() || {})
      : { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
    if (userContext.isAdmin) return userContext;
  } catch (_) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
  }

  return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
}

function extractInlineAdminContext(user = {}) {
  const envContext = extractEnvAdminContext(user);
  if (envContext.isAdmin) return envContext;
  const claimsContext = extractClaimsAdminContext(user);
  if (claimsContext.isAdmin) return claimsContext;
  return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none', metadata: {} };
}

async function resolveAdminContext(user = {}) {
  const inline = extractInlineAdminContext(user);
  if (inline.isAdmin) return inline;
  return resolveStoredAdminContext(user);
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
          role: context.role || 'admin'
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
  getConfiguredAdminUids,
  getConfiguredAdminEmails,
  getConfiguredAdminEntries,
  normalizeRole,
  normalizePermissions,
  expandRolePermissions,
  extractInlineAdminContext,
  resolveAdminContext,
  hasAdminPermission,
  hasEveryPermission,
  isPrimaryAdmin,
  isAdminUser,
  createAdminGuard,
  verifyAdmin,
  requireAdminPermission
};
