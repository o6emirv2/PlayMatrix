const PROFILE_CACHE_KEY = 'pm_profile_cache_v1';
const AUTH_PERSISTENCE_KEY = 'pm_login_persistence';

function storage(name) {
  try { return window?.[name] || null; } catch (_) { return null; }
}

export function readStoredAuthPersistenceMode() {
  const local = storage('localStorage');
  const session = storage('sessionStorage');
  try { if (local?.getItem(AUTH_PERSISTENCE_KEY) === 'local') return 'local'; } catch (_) {}
  try { if (session?.getItem(AUTH_PERSISTENCE_KEY) === 'session') return 'session'; } catch (_) {}
  return '';
}

export function rememberFlagFromStoredPersistence() {
  return readStoredAuthPersistenceMode() === 'local';
}

export function persistAuthPersistenceMode(mode = 'session') {
  const safeMode = mode === 'local' ? 'local' : 'session';
  const local = storage('localStorage');
  const session = storage('sessionStorage');
  try {
    if (safeMode === 'local') {
      local?.setItem(AUTH_PERSISTENCE_KEY, 'local');
      session?.removeItem(AUTH_PERSISTENCE_KEY);
    } else {
      session?.setItem(AUTH_PERSISTENCE_KEY, 'session');
      local?.removeItem(AUTH_PERSISTENCE_KEY);
    }
  } catch (_) {}
}

export function readProfileSnapshot() {
  const candidates = [storage('sessionStorage'), storage('localStorage')];
  for (const target of candidates) {
    try {
      const parsed = JSON.parse(target?.getItem(PROFILE_CACHE_KEY) || 'null');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }
  return null;
}

export function writeProfileSnapshot(payload = {}, { persistent = false } = {}) {
  if (!payload || typeof payload !== 'object') return false;
  const local = storage('localStorage');
  const session = storage('sessionStorage');
  const target = persistent ? local : session;
  const other = persistent ? session : local;
  if (!target) return false;
  try {
    target.setItem(PROFILE_CACHE_KEY, JSON.stringify(payload));
    other?.removeItem(PROFILE_CACHE_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

export function clearProfileSnapshot() {
  try { storage('localStorage')?.removeItem(PROFILE_CACHE_KEY); } catch (_) {}
  try { storage('sessionStorage')?.removeItem(PROFILE_CACHE_KEY); } catch (_) {}
}
