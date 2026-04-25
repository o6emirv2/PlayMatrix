import { normalizeSocialStatus } from "./social-state.js";

export function createPresencePayload(status = "online", extra = {}) {
  return { status: normalizeSocialStatus(status), visible: document.visibilityState === "visible", at: Date.now(), ...extra };
}
