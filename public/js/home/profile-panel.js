import { callHomeRuntime } from './widget-contract.js';

export function loadProfile() {
  return callHomeRuntime('loadProfile');
}

export function openAccountPanel() {
  return callHomeRuntime('openSheet', 'profile');
}
