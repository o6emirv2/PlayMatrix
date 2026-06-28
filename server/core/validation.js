function asString(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function asEmail(value) { const email = asString(value, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('EMAIL_INVALID'); return email; }
function asNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) { const n = Number(value); if (!Number.isFinite(n) || n < min || n > max) throw new Error('NUMBER_INVALID'); return n; }
module.exports = { asString, asEmail, asNumber };
