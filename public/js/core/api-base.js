/* PlayMatrix FAZ 3 modular architecture. */
export function normalizeApiBase(value = "") { return String(value || "").trim().replace(/\/+$/, "").replace(/\/api$/i, ""); }
export function joinApiPath(base = "", endpoint = "") { const cleanBase = normalizeApiBase(base); const cleanEndpoint = `/${String(endpoint || "").replace(/^\/+/, "")}`; return cleanBase ? `${cleanBase}${cleanEndpoint}` : cleanEndpoint; }
export function getRuntimeApiBase() { return normalizeApiBase(window.__PLAYMATRIX_API_URL__ || window.__PM_RUNTIME?.apiBase || ""); }
