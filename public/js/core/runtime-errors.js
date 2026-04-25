/* PlayMatrix FAZ 3 modular architecture. */
export function reportClientError(scope, error, extra = {}) { try { if (typeof window.__PM_REPORT_CLIENT_ERROR__ === "function") window.__PM_REPORT_CLIENT_ERROR__(scope, error, extra); } catch (_) {} }
export function toErrorMessage(error, fallback = "İşlem tamamlanamadı.") { return error?.message || String(error || fallback); }
