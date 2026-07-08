import './auth-modal.js?v=pm-final-mobile-v21';
import './game-catalog.js?v=pm-final-mobile-v21';
import './leaderboard.js?v=pm-final-mobile-v21';
import './profile-panel.js?v=pm-final-mobile-v21';
import './reward-ui.js?v=pm-final-mobile-v21';
import './market.js?v=pm-final-mobile-v21';
import './wheel.js?v=pm-final-mobile-v21';
import { getHomeRuntime } from './widget-contract.js?v=pm-final-mobile-v21';

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
