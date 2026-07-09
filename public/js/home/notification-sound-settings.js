const STORAGE_KEY = 'playmatrix.notificationSoundMode.v1';
const MODES = Object.freeze({ OFF: 'off', ALL: 'all', GIFT: 'gift' });
const VALID_MODES = new Set(Object.values(MODES));
let memoryMode = MODES.ALL;

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : MODES.ALL;
}
function getMode() {
  try { memoryMode = normalizeMode(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
  return memoryMode;
}
function setMode(value) {
  memoryMode = normalizeMode(value);
  try { localStorage.setItem(STORAGE_KEY, memoryMode); } catch (_) {}
  window.dispatchEvent(new CustomEvent('pm:notification-sound-mode', { detail: { mode: memoryMode } }));
  return memoryMode;
}
function isGiftNotification(tone = 'info', context = {}) {
  const normalizedTone = String(tone || 'info').toLowerCase();
  if (context.gift === true || context.reward === true || normalizedTone === 'reward') return true;
  const text = `${context.title || ''} ${context.message || ''}`.toLocaleLowerCase('tr-TR');
  const gift = /(hediye|ödül|odul|promo|promosyon|çark|cark|wheel|bonus|kazandın|kazandin|hesabına eklendi|hesabina eklendi|mc eklendi|xp eklendi|çerçeve hediyesi|cerceve hediyesi|ürün hediyesi|urun hediyesi)/.test(text);
  const purchase = /(satın al|satin al|satın alma|satin alma|harcandı|harcandi|ödeme|odeme|market satın|market satin)/.test(text);
  return gift && !purchase;
}
function shouldPlay(tone = 'info', context = {}) {
  if (context.silent === true) return false;
  const mode = getMode();
  if (mode === MODES.OFF) return false;
  if (mode === MODES.GIFT) return isGiftNotification(tone, context);
  return String(tone || '').toLowerCase() !== 'loading';
}
function labelFor(mode = getMode()) {
  return ({ off: 'Tüm bildirim sesleri kapalı', all: 'Tüm bildirim sesleri açık', gift: 'Sadece hediye bildirim sesleri açık' })[normalizeMode(mode)];
}
window.PMNotificationSoundSettings = Object.freeze({ STORAGE_KEY, MODES, normalizeMode, getMode, setMode, shouldPlay, isGiftNotification, labelFor });
