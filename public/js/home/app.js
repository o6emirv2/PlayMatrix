import './auth-modal.js?v=pm-v14-render-dob-games-admin';
import './game-catalog.js?v=pm-v14-render-dob-games-admin';
import './leaderboard.js?v=pm-v14-render-dob-games-admin';
import './profile-panel.js?v=pm-v14-render-dob-games-admin';
import './reward-ui.js?v=pm-v14-render-dob-games-admin';
import './market.js?v=pm-v14-render-dob-games-admin';
import './wheel.js?v=pm-v14-render-dob-games-admin';
import { getHomeRuntime } from './widget-contract.js?v=pm-v14-render-dob-games-admin';

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
