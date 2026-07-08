import { callHomeRuntime } from './widget-contract.js';

export function openAuthModal(mode = 'login') {
  if (mode && typeof window.setAuthMode === 'function') window.setAuthMode(mode);
  return callHomeRuntime('openSheet', 'auth');
}

export function closeAuthModal() {
  return callHomeRuntime('closeSheet');
}
