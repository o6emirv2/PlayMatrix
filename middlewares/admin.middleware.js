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
    .map((item) => cleanStr(item || '', 120))
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

function matchesPrimaryAdmin(user = {}) {
  const claims = user?.claims && typeof user.claims === 'object' ? user.claims : {};
  const uid = cleanStr(user?.uid || claims.uid || '', 160);
  const email = cleanStr(user?.email || claims.email || '', 200).toLowerCase();

  const configuredUid = getPrimaryAdminUid();
  const configuredEmail = getPrimaryAdminEmail();

  const uidOk = configuredUid ? uid === configuredUid : true;
  const emailOk = configuredEmail ? email === configuredEmail : true;

  return {
    uid,
    email,
    configuredUid,
    configuredEmail,
    allowed: !!uid && uidOk && emailOk
  };
}

function extractInlineAdminContext(user = {}) {
  const primary = matchesPrimaryAdmin(user);
  if (!primary.allowed) {
    return { isAdmin: false, role: '', roles: [], permissions: [], source: 'none' };
  }

  const role = 'superadmin';
  return {
    isAdmin: true,
    role,
    roles: [role],
    permissions: mergePermissions(expandRolePermissions(role)),
    source: 'env',
    uid: primary.uid,
    email: primary.email
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
  hasAdminPermission,
  hasEveryPermission,
  isPrimaryAdmin,
  isAdminUser,
  createAdminGuard,
  verifyAdmin,
  requireAdminPermission
};
