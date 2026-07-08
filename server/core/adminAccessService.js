const crypto = require('crypto');
const { runtimeStore } = require('./runtimeStore');
const COOKIE_NAME = 'pm_admin_access';
const TTL_MS = 6 * 60 * 60 * 1000;
function now(){ return Date.now(); }
function safe(v='',max=160){ return String(v||'').trim().slice(0,max); }
function issueAdminAccess({ uid='', email='', scope='admin', source='admin_matrix' } = {}) {
  const accessToken = `adm_${crypto.randomUUID()}`;
  const accessId = `admin_${crypto.randomUUID()}`;
  const access = { uid:safe(uid), email:safe(email,180), scope:safe(scope,40), source:safe(source,80), accessId, accessToken, createdAt:now(), expiresAt:now()+TTL_MS };
  runtimeStore.temporary.set(`adminAccess:${accessToken}`, access, TTL_MS);
  return access;
}
function readAdminAccess(token=''){ return runtimeStore.temporary.get(`adminAccess:${safe(token,220)}`) || null; }
function clearAdminAccess(token=''){ runtimeStore.temporary.delete(`adminAccess:${safe(token,220)}`); }
function getRequestAdminAccessToken(req){
  const cookie = String(req?.headers?.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE_NAME}=`));
  return safe(req?.headers?.['x-admin-access'] || (cookie ? decodeURIComponent(cookie.slice(COOKIE_NAME.length+1)) : '') || '', 220);
}
function adminAccessCookie(token=''){ return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${Math.floor(TTL_MS/1000)}`; }
function clearAdminAccessCookie(){ return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`; }
module.exports = { issueAdminAccess, readAdminAccess, clearAdminAccess, getRequestAdminAccessToken, adminAccessCookie, clearAdminAccessCookie };
