import { byId } from "./dom-utils.js";

export function setProgressBar(id, percent) {
  const node = byId(id);
  if (!node) return;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  node.style.setProperty("--pm-progress", `${value}%`);
  node.dataset.progress = String(Math.round(value));
}

export function installProfilePanelGuards() {
  ["profileProgressFill", "topProgressFill", "userProgressFill"].forEach((id) => setProgressBar(id, byId(id)?.dataset.progress || 0));
}
