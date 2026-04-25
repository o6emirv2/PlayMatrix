const PM_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyC81Ah46_F2his90zedODoCk07vqsd3vVs',
  authDomain: 'playmatrix-b7df9.firebaseapp.com',
  projectId: 'playmatrix-b7df9',
  storageBucket: 'playmatrix-b7df9.firebasestorage.app',
  messagingSenderId: '689686425310',
  appId: '1:689686425310:web:01c9f797b437a770e19c4f',
  measurementId: 'G-BL9ZP43VVW'
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
      const [{ initializeApp, getApps, getApp }, { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')
      ]);

      const app = getApps().length ? getApp() : initializeApp(PM_FIREBASE_CONFIG);
      auth = getAuth(app);

      try {
        await setPersistence(auth, browserLocalPersistence);
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