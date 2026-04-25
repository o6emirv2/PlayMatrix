const doc = typeof document !== "undefined" ? document : null;

export const qs = (selector, root = doc) => root?.querySelector?.(selector) || null;
export const qsa = (selector, root = doc) => Array.from(root?.querySelectorAll?.(selector) || []);
export const byId = (id) => (doc ? doc.getElementById(id) : null);

export function createElement(tagName, className = "", text = "") {
  const node = doc.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
  return node;
}

export function bindIfPresent(id, eventName, handler, options) {
  const element = byId(id);
  if (!element || typeof handler !== "function") return null;
  element.addEventListener(eventName, handler, options);
  return element;
}

export function setHidden(elementOrId, hidden = true) {
  const element = typeof elementOrId === "string" ? byId(elementOrId) : elementOrId;
  if (!element) return null;
  element.hidden = !!hidden;
  element.classList.toggle("is-hidden", !!hidden);
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
  return element;
}

export function setExpanded(elementOrId, expanded = true) {
  const element = typeof elementOrId === "string" ? byId(elementOrId) : elementOrId;
  if (!element) return null;
  element.setAttribute("aria-expanded", expanded ? "true" : "false");
  return element;
}

export function safeText(value, fallback = "") {
  const normalized = value === undefined || value === null ? fallback : value;
  return String(normalized).replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

export function setText(id, value, fallback = "") {
  const element = byId(id);
  if (!element) return null;
  element.textContent = safeText(value, fallback);
  return element;
}

export function reportHomeError(scope, error, extra = {}) {
  try {
    if (typeof window.__PM_REPORT_CLIENT_ERROR__ === "function") {
      window.__PM_REPORT_CLIENT_ERROR__(scope, error, { source: "home-module", ...extra });
    }
  } catch (_) {}
}
