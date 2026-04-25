/* PlayMatrix FAZ 2: real home orchestrator. Each imported module owns one UI responsibility; legacy runtime remains the compatibility layer until later phases remove the final monolith. */
import { reportHomeError } from "./dom-utils.js";
import { installGameRouteNormalizer } from "./game-catalog.js";
import { installAuthModalGuards } from "./auth-modal.js";
import { installProfilePanelGuards } from "./profile-panel.js";
import { installLeaderboardGuards } from "./leaderboard.js";
import { installStatsGuards } from "./stats.js";
import { installSocialEntryGuards } from "./social-entry.js";
import { installHeroSliderGuards } from "./hero-slider.js";
import { installModalSafety } from "./modal.js";
import { installRewardUiGuards } from "./reward-ui.js";
import { installInviteUiGuards } from "./invite-ui.js";
import "./legacy-home.runtime.js";

let booted = false;

const MODULES = Object.freeze([
  ["routes", installGameRouteNormalizer],
  ["modal", installModalSafety],
  ["auth", installAuthModalGuards],
  ["profile", installProfilePanelGuards],
  ["leaderboard", installLeaderboardGuards],
  ["stats", installStatsGuards],
  ["social", installSocialEntryGuards],
  ["hero", installHeroSliderGuards],
  ["reward", installRewardUiGuards],
  ["invite", installInviteUiGuards]
]);

function runModule(name, installer) {
  try {
    installer(document);
    return true;
  } catch (error) {
    console.error(`[PlayMatrix] home module failed: ${name}`, error);
    reportHomeError(`home.${name}`, error);
    return false;
  }
}

export async function bootHomeApplication() {
  if (booted) return true;
  booted = true;
  const results = MODULES.map(([name, installer]) => [name, runModule(name, installer)]);
  window.__PM_HOME_MODULES__ = Object.freeze(Object.fromEntries(results));
  return results.every(([, ok]) => ok);
}

export const homeModuleInfo = Object.freeze({ phase: 2, strategy: "static-esm-modules-plus-compat-runtime", cspSafe: true, fastBoot: true, modules: MODULES.map(([name]) => name) });
