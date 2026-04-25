'use strict';

function clean(value = '') {
  return String(value || '').trim();
}

function getFirebaseWebApiKey(env = process.env) {
  return clean(env.PUBLIC_FIREBASE_API_KEY || env.FIREBASE_WEB_API_KEY || env.FIREBASE_API_KEY || '');
}

async function verifyIdTokenWithFirebaseRest(idToken = '', options = {}) {
  const token = clean(idToken);
  if (!token) {
    const error = new Error('ID_TOKEN_REQUIRED');
    error.code = 'AUTH_TOKEN_REQUIRED';
    throw error;
  }

  const apiKey = clean(options.apiKey || getFirebaseWebApiKey());
  if (!apiKey) {
    const error = new Error('Firebase Web API key yok; REST token doğrulaması yapılamaz.');
    error.code = 'PUBLIC_FIREBASE_API_KEY_MISSING';
    error.statusCode = 503;
    throw error;
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
  } catch (networkError) {
    const error = new Error(`Firebase REST doğrulama bağlantısı kurulamadı: ${networkError.message || networkError}`);
    error.code = 'FIREBASE_REST_AUTH_NETWORK';
    error.statusCode = 503;
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = clean(payload?.error?.message || payload?.error || `HTTP_${response.status}`);
    const error = new Error(`Firebase REST token doğrulaması reddedildi: ${code}`);
    error.code = code.includes('INVALID_ID_TOKEN') || code.includes('TOKEN_EXPIRED') ? 'INVALID_ID_TOKEN' : 'FIREBASE_REST_AUTH_FAILED';
    error.statusCode = response.status === 400 || response.status === 401 ? 401 : 503;
    throw error;
  }

  const user = Array.isArray(payload.users) ? payload.users[0] : null;
  if (!user?.localId) {
    const error = new Error('Firebase REST token doğrulaması kullanıcı döndürmedi.');
    error.code = 'FIREBASE_REST_AUTH_EMPTY';
    error.statusCode = 401;
    throw error;
  }

  return {
    uid: clean(user.localId),
    user_id: clean(user.localId),
    sub: clean(user.localId),
    email: clean(user.email || '').toLowerCase(),
    email_verified: !!user.emailVerified,
    emailVerified: !!user.emailVerified,
    name: clean(user.displayName || ''),
    picture: clean(user.photoUrl || ''),
    provider_id: clean(user.providerUserInfo?.[0]?.providerId || ''),
    firebase: {
      sign_in_provider: clean(user.providerUserInfo?.[0]?.providerId || 'password') || 'password'
    },
    auth_time: Math.floor(Date.now() / 1000),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    restVerified: true
  };
}

module.exports = {
  getFirebaseWebApiKey,
  verifyIdTokenWithFirebaseRest
};
