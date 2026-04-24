/* PlayMatrix FAZ 3 modular architecture. */
export function getRuntimeAuth() { return window.__PM_RUNTIME?.auth || null; }
export function getRuntimeUser() { return getRuntimeAuth()?.currentUser || null; }
export async function getRuntimeIdToken(forceRefresh = false) { if (typeof window.__PM_RUNTIME?.getIdToken === "function") return window.__PM_RUNTIME.getIdToken(forceRefresh); return null; }
