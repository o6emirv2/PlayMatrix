import { callHomeRuntime } from './widget-contract.js';

export function loadLeaderboard() {
  return callHomeRuntime('loadLeaderboard');
}

export function openPlayerStats(uid) {
  if (typeof window.openPlayerProfile === 'function') return window.openPlayerProfile(uid);
  return null;
}
