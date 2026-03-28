const PM_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyAIOd4DG1jxn4wAV6bz80SJHprNWqBYSS4',
  authDomain: 'playmatrixdestek.firebaseapp.com',
  projectId: 'playmatrixdestek',
  storageBucket: 'playmatrixdestek.firebasestorage.app',
  messagingSenderId: '819006977863',
  appId: '1:819006977863:web:6602ccf4e381008ff3fe62',
  measurementId: 'G-11DLXBM6D8'
});

const PM_ADMIN_AUTH = (() => {
  let initialized = false;
  let auth = null;
  let currentUser = null;
  let authReadyResolve;
  const authReady = new Promise((resolve) => {
    authReadyResolve = resolve;
  });

  function notifyAuthState() {
    window.dispatchEvent(new CustomEvent('pm-admin-auth-state', {
      detail: {
        signedIn: !!currentUser,
        user: currentUser ? {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || ''
        } : null
      }
    }));
  }

  async function init() {
    if (initialized) return authReady;
    initialized = true;

    try {
      const [{ initializeApp, getApps, getApp }, { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')
      ]);

      const app = getApps().length ? getApp() : initializeApp(PM_FIREBASE_CONFIG);
      auth = getAuth(app);

      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (_) {}

      onAuthStateChanged(auth, (user) => {
        currentUser = user || null;
        notifyAuthState();
        authReadyResolve({ auth, user: currentUser });
      }, () => {
        currentUser = null;
        notifyAuthState();
        authReadyResolve({ auth, user: null });
      });
    } catch (error) {
      currentUser = null;
      notifyAuthState();
      authReadyResolve({ auth: null, user: null, error });
    }

    return authReady;
  }

  async function waitForReady() {
    await init();
    return authReady;
  }

  async function getFreshToken(forceRefresh = false) {
    await waitForReady();
    if (!currentUser || typeof currentUser.getIdToken !== 'function') return '';
    return currentUser.getIdToken(!!forceRefresh);
  }

  function getCurrentUser() {
    return currentUser;
  }

  return {
    config: PM_FIREBASE_CONFIG,
    init,
    waitForReady,
    getFreshToken,
    getCurrentUser
  };
})();

window.PM_ADMIN_AUTH = PM_ADMIN_AUTH;