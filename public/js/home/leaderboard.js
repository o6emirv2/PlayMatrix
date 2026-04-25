import { byId, createElement } from "./dom-utils.js";

export function createLeaderboardEmptyState(message = "Liderlik verisi bekleniyor.") {
  const node = createElement("div", "empty-state", message);
  node.dataset.component = "leaderboard-empty";
  return node;
}

export function installLeaderboardGuards() {
  const area = byId("leaderboardListArea");
  if (!area) return;
  area.setAttribute("aria-live", "polite");
  area.dataset.module = "leaderboard";
}
