class TtlStore {
  constructor({ ttlMs = 60000, max = 1000 } = {}) { this.ttlMs = ttlMs; this.max = max; this.map = new Map(); }
  set(key, value, ttlMs = this.ttlMs) { this.prune(); this.map.set(String(key), { value, expiresAt: Date.now() + ttlMs, createdAt: Date.now() }); if (this.map.size > this.max) this.prune(true); return value; }
  get(key) { const item = this.map.get(String(key)); if (!item) return null; if (item.expiresAt <= Date.now()) { this.map.delete(String(key)); return null; } return item.value; }
  delete(key) { return this.map.delete(String(key)); }
  values() { this.prune(); return [...this.map.values()].map(x => x.value); }
  entries() { this.prune(); return [...this.map.entries()].map(([key, item]) => [key, item.value]); }
  push(key, value, ttlMs = this.ttlMs) { const arr = this.get(key) || []; arr.push(value); return this.set(key, arr.slice(-this.max), ttlMs); }
  prune(force = false) { const now = Date.now(); for (const [key, item] of this.map) if (force || item.expiresAt <= now) { this.map.delete(key); if (!force && this.map.size <= this.max) continue; if (force && this.map.size <= this.max) break; } }
  size() { this.prune(); return this.map.size; }
}
const runtimeStore = {
  temporary: new TtlStore({ ttlMs: 10 * 60 * 1000, max: 2500 }),
  rooms: new TtlStore({ ttlMs: 2 * 60 * 60 * 1000, max: 1000 }),
  presence: new TtlStore({ ttlMs: 3 * 60 * 1000, max: 10000 }),
  notifications: new TtlStore({ ttlMs: 30 * 60 * 1000, max: 10000 }),
  errors: new TtlStore({ ttlMs: 7 * 24 * 60 * 60 * 1000, max: 1500 }),
  crashRounds: new TtlStore({ ttlMs: 60 * 60 * 1000, max: 20 })
};
module.exports = { TtlStore, runtimeStore };
