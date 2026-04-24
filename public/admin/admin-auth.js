const PM_ADMIN_AUTH = (() => {
  let initialized = false;
  let auth = null;
  let currentUser = null;
  let runtimeError = null;
  let authReadyResolve;
  const authReady = new Promise((resolve) => {
    authReadyResolve = resolve;
  });

  function serializeUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || ''
    };
  }

  function notifyAuthState() {
    window.dispatchEvent(new CustomEvent('pm-admin-auth-state', {
      detail: {
        signedIn: !!currentUser,
        user: serializeUser(currentUser),
        error: runtimeError ? String(runtimeError.message || runtimeError) : ''
      }
    }));
  }

  async function init() {
    if (initialized) return authReady;
    initialized = true;

    try {
      const [runtimeModule, firebaseAppModule, firebaseAuthModule] = await Promise.all([
        import('../firebase-runtime.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')
      ]);

      const config = await runtimeModule.loadFirebaseWebConfig({ required: true, scope: 'admin' });
      const { initializeApp, getApps, getApp } = firebaseAppModule;
      const { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence } = firebaseAuthModule;

      const app = getApps().length ? getApp() : initializeApp(config);
      auth = getAuth(app);

      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (_) {}

      onAuthStateChanged(auth, (user) => {
        currentUser = user || null;
        runtimeError = null;
        notifyAuthState();
        authReadyResolve({ auth, user: currentUser, error: null });
      }, (error) => {
        currentUser = null;
        runtimeError = error || new Error('ADMIN_AUTH_STATE_ERROR');
        notifyAuthState();
        authReadyResolve({ auth, user: null, error: runtimeError });
      });
    } catch (error) {
      currentUser = null;
      runtimeError = error || new Error('PUBLIC_FIREBASE_CONFIG_MISSING');
      notifyAuthState();
      authReadyResolve({ auth: null, user: null, error: runtimeError });
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

  function getLastError() {
    return runtimeError;
  }

  return {
    init,
    waitForReady,
    getFreshToken,
    getCurrentUser,
    getLastError
  };
})();

window.PM_ADMIN_AUTH = PM_ADMIN_AUTH;
