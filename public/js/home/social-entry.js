import { byId } from "./dom-utils.js";

export const SOCIAL_RETENTION = Object.freeze({ globalDays: 7, directDays: 14 });

export function installSocialEntryGuards() {
  const shell = byId("sheetShell");
  if (shell) shell.dataset.socialRetention = `${SOCIAL_RETENTION.globalDays}/${SOCIAL_RETENTION.directDays}`;
  const stream = byId("psChatStream");
  if (stream) stream.setAttribute("aria-live", "polite");
}
