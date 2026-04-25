// config/firebase.js
'use strict';

require('../utils/env').loadEnvFiles({ cwd: require('path').join(__dirname, '..') });

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function resolveFirebaseKeyString() {
  const direct = String(process.env.FIREBASE_KEY || '').trim();
  if (direct) return direct;

  const base64Value = String(process.env.FIREBASE_KEY_BASE64 || '').trim();
  if (base64Value) {
    try {
      return Buffer.from(base64Value, 'base64').toString('utf8');
    } catch (_) {}
  }

  const candidatePaths = [
    process.env.FIREBASE_KEY_PATH,
    path.join(__dirname, '..', 'firebase-service-account.json'),
    path.join(__dirname, '..', 'service-account.json')
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    try {
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
      return fs.readFileSync(candidate, 'utf8');
    } catch (_) {}
  }

  return '';
}

function buildFirebaseAdminOptions(serviceAccount) {
  const options = {
    credential: admin.credential.cert(serviceAccount)
  };

  const projectId = String(process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || '').trim();
  const databaseURL = String(process.env.FIREBASE_DATABASE_URL || '').trim();
  const storageBucket = String(process.env.FIREBASE_STORAGE_BUCKET || serviceAccount.storage_bucket || '').trim();

  if (projectId) options.projectId = projectId;
  if (databaseURL) options.databaseURL = databaseURL;
  if (storageBucket) options.storageBucket = storageBucket;

  return options;
}

(function initFirebase() {
  if (admin.apps.length) return;

  const rawKey = resolveFirebaseKeyString();
  if (!rawKey) {
    throw new Error('FIREBASE_KEY / FIREBASE_KEY_BASE64 / FIREBASE_KEY_PATH bulunamadı.');
  }

  try {
    const serviceAccount = JSON.parse(rawKey);
    admin.initializeApp(buildFirebaseAdminOptions(serviceAccount));
    console.log('✅ Firebase Admin başarıyla bağlandı.');
  } catch (error) {
    throw new Error(`FIREBASE_KEY parse edilemedi: ${error.message}`);
  }
})();

const db = admin.firestore();
const auth = admin.auth();

module.exports = {
  admin,
  db,
  auth
};
