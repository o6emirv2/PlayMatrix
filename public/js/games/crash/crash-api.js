export async function crashApiFetch(endpoint, options = {}) {
  const api = window.__PM_API__;
  if (api && typeof api.fetchJson === "function") return api.fetchJson(endpoint, options);
  const base = String(window.__PLAYMATRIX_API_URL__ || window.location.origin).replace(/\/+$/, "");
  const response = await fetch(`${base}${endpoint}`, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Crash API hatası (${response.status})`);
  return payload;
}
