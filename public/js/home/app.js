import './auth-modal.js?v=pm-v15-matrix-siege';
import './game-catalog.js?v=pm-v15-matrix-siege';
import './leaderboard.js?v=pm-v15-matrix-siege';
import './profile-panel.js?v=pm-v15-matrix-siege';
import './reward-ui.js?v=pm-v15-matrix-siege';
import './market.js?v=pm-v15-matrix-siege';
import './wheel.js?v=pm-v15-matrix-siege';
import { getHomeRuntime } from './widget-contract.js?v=pm-v15-matrix-siege';

let booted = false;

export async function bootHomeApplication() {
  if (booted) return true;
  booted = true;
  const runtime = getHomeRuntime();
  if (runtime && typeof runtime.boot === 'function') {
    await runtime.boot();
  }
  return true;
}

export const homeModuleInfo = Object.freeze({
  version: 'home-modular-production-2',
  strategy: 'modular-bootstrap',
  cspSafe: true,
  fastBoot: true
});
