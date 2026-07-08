import './auth-modal.js?v=pm-v13-live-refresh-session-speed';
import './game-catalog.js?v=pm-v13-live-refresh-session-speed';
import './leaderboard.js?v=pm-v13-live-refresh-session-speed';
import './profile-panel.js?v=pm-v13-live-refresh-session-speed';
import './reward-ui.js?v=pm-v13-live-refresh-session-speed';
import './market.js?v=pm-v13-live-refresh-session-speed';
import './wheel.js?v=pm-v13-live-refresh-session-speed';
import { getHomeRuntime } from './widget-contract.js?v=pm-v13-live-refresh-session-speed';

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
