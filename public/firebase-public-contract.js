export const PM_CURRENT_FIREBASE_PROJECT_ID = 'playmatrixpro-b18b7';

export const PM_CURRENT_FIREBASE_PUBLIC_CONFIG = Object.freeze({
  apiKey: 'AIzaSyANhKrb7zuSzXouFq03Q_oWQJCQUglCNhE',
  authDomain: 'playmatrixpro-b18b7.firebaseapp.com',
  projectId: PM_CURRENT_FIREBASE_PROJECT_ID,
  storageBucket: 'playmatrixpro-b18b7.firebasestorage.app',
  messagingSenderId: '401147567674',
  appId: '1:401147567674:web:37f609d8527e61a72c5f03',
  measurementId: 'G-HEDD2B0T9H'
});

export function cloneCurrentFirebasePublicConfig() {
  return { ...PM_CURRENT_FIREBASE_PUBLIC_CONFIG };
}

export function normalizeFirebaseWebConfig(config = null) {
  if (!config || typeof config !== 'object') return null;
  const clean = {
    apiKey: String(config.apiKey || '').trim(),
    authDomain: String(config.authDomain || '').trim(),
    projectId: String(config.projectId || '').trim(),
    storageBucket: String(config.storageBucket || '').trim(),
    messagingSenderId: String(config.messagingSenderId || '').trim(),
    appId: String(config.appId || '').trim(),
    measurementId: String(config.measurementId || '').trim()
  };
  return clean.apiKey && clean.authDomain && clean.projectId && clean.appId ? clean : null;
}

export function matchesCurrentFirebasePublicConfig(config = null) {
  const normalized = normalizeFirebaseWebConfig(config);
  if (!normalized) return false;
  return Object.entries(PM_CURRENT_FIREBASE_PUBLIC_CONFIG).every(([key, expected]) => String(normalized[key] || '').trim() === expected);
}
