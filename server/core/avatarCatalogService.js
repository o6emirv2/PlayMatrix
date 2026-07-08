const fs = require('fs');
const path = require('path');
const manifestPath = path.join(__dirname, '..', '..', 'public', 'data', 'avatar-manifest.json');
let cache = null;
function loadAllowedAvatars() {
  if (cache) return cache;
  const allowed = new Set();
  const fallback = '/public/assets/images/logo.png';
  allowed.add(fallback);
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (data.fallback) allowed.add(String(data.fallback));
    if (data.defaultAvatar) allowed.add(String(data.defaultAvatar));
    for (const category of Array.isArray(data.categories) ? data.categories : []) for (const item of Array.isArray(category.items) ? category.items : []) if (item?.src) allowed.add(String(item.src));
  } catch (_) {}
  cache = { allowed, fallback };
  return cache;
}
function normalizeAvatarSelection(value = '') { const raw = String(value || '').trim(); const { allowed, fallback } = loadAllowedAvatars(); return allowed.has(raw) ? raw : fallback; }
function isAllowedAvatar(value = '') { return loadAllowedAvatars().allowed.has(String(value || '').trim()); }
module.exports = { normalizeAvatarSelection, isAllowedAvatar, loadAllowedAvatars };
