import { bindIfPresent, byId, setText } from "./dom-utils.js";

const AUTH_HELP_ID = "authHelp";
const AUTH_SUBMIT_ID = "authSubmitBtn";

export function setAuthBusy(isBusy, label = "İşleniyor…") {
  const button = byId(AUTH_SUBMIT_ID);
  if (!button) return;
  button.disabled = !!isBusy;
  button.dataset.busy = isBusy ? "1" : "0";
  if (isBusy) button.dataset.idleLabel = button.textContent || "Giriş Yap";
  button.textContent = isBusy ? label : (button.dataset.idleLabel || button.textContent || "Giriş Yap");
}

export function setAuthHelp(message = "", tone = "") {
  const help = setText(AUTH_HELP_ID, message);
  if (!help) return;
  help.className = `field-help${tone ? ` is-${tone}` : ""}`;
}

export function installAuthModalGuards() {
  bindIfPresent("authEmail", "input", () => setAuthHelp(""));
  bindIfPresent("authPassword", "input", () => setAuthHelp(""));
  bindIfPresent("authFullName", "input", () => setAuthHelp(""));
  bindIfPresent("authUsername", "input", () => setAuthHelp(""));
}
