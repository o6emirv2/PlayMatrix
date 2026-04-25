'use strict';

const { nowMs, safeNum } = require('./helpers');

class TtlCache {
  constructor(defaultTtlMs = 15000, maxEntries = 250) {
    this.defaultTtlMs = Math.max(250, safeNum(defaultTtlMs, 15000));
    this.maxEntries = Math.max(10, safeNum(maxEntries, 250));
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(String(key || ''));
    if (!entry) return null;
    if (entry.expiresAt <= nowMs()) {
      this.store.delete(String(key || ''));
      return null;
    }
    entry.lastAccessAt = nowMs();
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    const safeKey = String(key || '');
    if (!safeKey) return value;
    this.prune();
    this.store.set(safeKey, {
      value,
      expiresAt: nowMs() + Math.max(250, safeNum(ttlMs, this.defaultTtlMs)),
      lastAccessAt: nowMs()
    });
    return value;
  }

  delete(key) {
    this.store.delete(String(key || ''));
  }

  clear() {
    this.store.clear();
  }

  prune() {
    const now = nowMs();
    for (const [key, entry] of this.store.entries()) {
      if (!entry || entry.expiresAt <= now) this.store.delete(key);
    }
    while (this.store.size > this.maxEntries) {
      const oldest = [...this.store.entries()].sort((a, b) => (a[1]?.lastAccessAt || 0) - (b[1]?.lastAccessAt || 0))[0];
      if (!oldest) break;
      this.store.delete(oldest[0]);
    }
  }

  async remember(key, loader, ttlMs = this.defaultTtlMs) {
    const cached = this.get(key);
    if (cached !== null) return cached;
    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }
}

module.exports = {
  TtlCache
};
