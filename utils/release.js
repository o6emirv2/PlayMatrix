'use strict';

const fs = require('fs');
const path = require('path');

const RELEASE_MANIFEST_PATH = path.join(__dirname, '..', 'release', 'manifest.json');
const PACKAGE_PATH = path.join(__dirname, '..', 'package.json');

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function readPackageMetadata() {
  const pkg = safeReadJson(PACKAGE_PATH, {});
  return {
    name: pkg?.name || 'playmatrix-backend',
    version: pkg?.version || '0.0.0',
    description: pkg?.description || ''
  };
}

function readReleaseManifest() {
  return safeReadJson(RELEASE_MANIFEST_PATH, null);
}

function buildReleaseSnapshot() {
  const pkg = readPackageMetadata();
  const manifest = readReleaseManifest();
  const release = manifest && typeof manifest === 'object' ? manifest : {};

  return {
    packageName: pkg.name,
    packageVersion: pkg.version,
    phase: release.phase || null,
    releaseId: release.releaseId || null,
    channel: release.channel || null,
    createdAt: release.createdAt || null,
    rollbackTag: release.rollbackTag || null,
    rollbackReady: Boolean(release.rollbackReady),
    secretsSanitized: release.secretsSanitized !== false,
    notes: Array.isArray(release.notes) ? release.notes.slice(0, 6) : []
  };
}

module.exports = {
  RELEASE_MANIFEST_PATH,
  readPackageMetadata,
  readReleaseManifest,
  buildReleaseSnapshot
};
