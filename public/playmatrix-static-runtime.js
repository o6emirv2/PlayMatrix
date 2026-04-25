(function () {
  'use strict';

  const STATIC_API_BASE = 'https://emirhan-siye.onrender.com';
  const STATIC_SITE_ORIGIN = 'https://playmatrix.com.tr';

  const firebase = Object.freeze({
    apiKey: 'AIzaSyC81Ah46_F2his90zedODoCk07vqsd3vVs',
    authDomain: 'playmatrix-b7df9.firebaseapp.com',
    databaseURL: 'https://playmatrix-b7df9-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'playmatrix-b7df9',
    storageBucket: 'playmatrix-b7df9.firebasestorage.app',
    messagingSenderId: '689686425310',
    appId: '1:689686425310:web:01c9f797b437a770e19c4f',
    measurementId: 'G-BL9ZP43VVW'
  });

  const routes = Object.freeze({
    crash: '/crash',
    pisti: '/pisti',
    chess: '/satranc',
    patternMaster: '/classic-games/pattern-master',
    spacePro: '/classic-games/space-pro',
    snakePro: '/classic-games/snake-pro'
  });

  const assetBases = Object.freeze({
    onlineGames: '/assets/games/online',
    classicGames: '/assets/games/classic',
    public: '/public'
  });

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  function hasUsableFirebaseConfig(config) {
    return !!(config && config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  const apiBase = normalizeBase(STATIC_API_BASE);
  const runtime = Object.freeze({
    environment: 'production',
    siteOrigin: STATIC_SITE_ORIGIN,
    apiBase,
    canonicalApiBase: apiBase,
    routes,
    assetBases,
    firebase: hasUsableFirebaseConfig(firebase) ? firebase : null,
    firebaseReady: hasUsableFirebaseConfig(firebase),
    source: 'static-runtime-fallback'
  });

  window.__PM_STATIC_RUNTIME_CONFIG__ = runtime;
  window.__PM_RUNTIME = Object.assign({}, runtime, window.__PM_RUNTIME || {});
  if (!window.__PM_RUNTIME.apiBase || normalizeBase(window.__PM_RUNTIME.apiBase) === normalizeBase(window.location.origin)) {
    window.__PM_RUNTIME.apiBase = apiBase;
  }
  if (!window.__PM_RUNTIME.canonicalApiBase) {
    window.__PM_RUNTIME.canonicalApiBase = apiBase;
  }
  if (!window.__PM_RUNTIME.routes) {
    window.__PM_RUNTIME.routes = routes;
  }
  if (!window.__PM_RUNTIME.assetBases) {
    window.__PM_RUNTIME.assetBases = assetBases;
  }
  if (!window.__PM_RUNTIME.firebase && runtime.firebase) {
    window.__PM_RUNTIME.firebase = runtime.firebase;
    window.__PM_RUNTIME.firebaseReady = true;
  }
  window.__PLAYMATRIX_API_URL__ = normalizeBase(window.__PM_RUNTIME.apiBase || window.__PLAYMATRIX_API_URL__ || apiBase);
})();
