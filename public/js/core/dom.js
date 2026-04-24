/* PlayMatrix FAZ 3 modular architecture. */
export const $ = (id, root = document) => root.getElementById ? root.getElementById(id) : root.querySelector(`#${CSS.escape(id)}`);
export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
export function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[m] || m)); }
export function stripHtml(value = "") { const el = document.createElement("div"); el.innerHTML = String(value || ""); return el.textContent || el.innerText || ""; }
export function createTextElement(tagName, className = "", text = "") { const el = document.createElement(tagName); if (className) el.className = className; el.textContent = text; return el; }
export function bindIfPresent(id, eventName, handler, options) { const el = document.getElementById(id); if (!el) return null; el.addEventListener(eventName, handler, options); return el; }
export function safeUrl(value = "") { try { const u = new URL(String(value), window.location.origin); return ["http:", "https:", "data:", "blob:"].includes(u.protocol) ? u.href : ""; } catch (_) { return ""; } }
