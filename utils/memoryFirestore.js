'use strict';

const crypto = require('crypto');

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((item) => clone(item));
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      const copied = clone(item);
      if (copied !== undefined) out[key] = copied;
    });
    return out;
  }
  return value;
}

function cleanPath(path = '') {
  return String(path || '').split('/').map((part) => part.trim()).filter(Boolean).join('/');
}

function randomId() {
  return crypto.randomBytes(10).toString('base64url');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !describeSentinel(value);
}

function getNestedValue(source = {}, field = '') {
  const key = normalizeFieldKey(field);
  if (key === '__name__') return source.__name__;
  return String(key || '').split('.').filter(Boolean).reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), source);
}

function setNestedValue(target = {}, field = '', value) {
  const parts = String(field || '').split('.').filter(Boolean);
  if (!parts.length) return target;
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
  return target;
}

function deleteNestedValue(target = {}, field = '') {
  const parts = String(field || '').split('.').filter(Boolean);
  if (!parts.length) return target;
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor || typeof cursor !== 'object') return;
    cursor = cursor[part];
  });
  if (cursor && typeof cursor === 'object') delete cursor[parts[parts.length - 1]];
  return target;
}

function normalizeFieldKey(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  const segments = field._pathSegments || field.segments || field._segments;
  if (Array.isArray(segments) && segments.includes('__name__')) return '__name__';
  const formatted = String(field.formattedName || field._formattedName || field || '');
  if (formatted.includes('__name__')) return '__name__';
  return formatted.replace(/^`|`$/g, '');
}

function describeSentinel(value) {
  if (!value || typeof value !== 'object' || value instanceof Date || Array.isArray(value)) return null;
  const ctor = String(value.constructor?.name || '');
  const method = String(value._methodName || value.methodName || value._delegate?._methodName || '');
  const stringValue = (() => {
    try { return String(value); } catch (_) { return ''; }
  })();
  const fingerprint = `${ctor} ${method} ${stringValue}`.toLowerCase();

  if (/delete/.test(fingerprint)) return { type: 'delete' };
  if (/servertimestamp|server_timestamp|timestamp/.test(fingerprint)) return { type: 'serverTimestamp' };
  if (/increment|numericincrement/.test(fingerprint) || Object.prototype.hasOwnProperty.call(value, '_operand')) {
    return { type: 'increment', operand: Number(value._operand ?? value.operand ?? 0) || 0 };
  }
  if (/arrayunion/.test(fingerprint) || Object.prototype.hasOwnProperty.call(value, '_elements')) {
    return { type: 'arrayUnion', elements: Array.isArray(value._elements) ? value._elements : Array.isArray(value.elements) ? value.elements : [] };
  }
  if (/arrayremove/.test(fingerprint)) {
    return { type: 'arrayRemove', elements: Array.isArray(value._elements) ? value._elements : Array.isArray(value.elements) ? value.elements : [] };
  }
  return null;
}

function valuesEqual(left, right) {
  try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return left === right; }
}

function applyFirestoreData(current = {}, patch = {}, { merge = true } = {}) {
  const next = merge ? clone(current || {}) : {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    const sentinel = describeSentinel(value);
    if (sentinel?.type === 'delete') {
      deleteNestedValue(next, key);
      return;
    }
    if (sentinel?.type === 'serverTimestamp') {
      setNestedValue(next, key, Date.now());
      return;
    }
    if (sentinel?.type === 'increment') {
      const currentValue = Number(getNestedValue(next, key) || 0) || 0;
      setNestedValue(next, key, currentValue + sentinel.operand);
      return;
    }
    if (sentinel?.type === 'arrayUnion') {
      const base = Array.isArray(getNestedValue(next, key)) ? clone(getNestedValue(next, key)) : [];
      sentinel.elements.forEach((item) => {
        if (!base.some((existing) => valuesEqual(existing, item))) base.push(clone(item));
      });
      setNestedValue(next, key, base);
      return;
    }
    if (sentinel?.type === 'arrayRemove') {
      const base = Array.isArray(getNestedValue(next, key)) ? clone(getNestedValue(next, key)) : [];
      setNestedValue(next, key, base.filter((item) => !sentinel.elements.some((existing) => valuesEqual(existing, item))));
      return;
    }

    if (merge && isPlainObject(value) && isPlainObject(getNestedValue(next, key))) {
      setNestedValue(next, key, applyFirestoreData(getNestedValue(next, key), value, { merge: true }));
      return;
    }
    setNestedValue(next, key, clone(value));
  });
  return next;
}

class MemoryDocumentSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this._data = clone(data);
  }

  data() {
    return clone(this._data || {});
  }
}

class MemoryQuerySnapshot {
  constructor(docs = []) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

class MemoryCountSnapshot {
  constructor(count) {
    this._count = count;
  }

  data() {
    return { count: this._count };
  }
}

class MemoryDocumentRef {
  constructor(store, path) {
    this._store = store;
    this.path = cleanPath(path);
    const parts = this.path.split('/');
    this.id = parts[parts.length - 1] || '';
  }

  get parent() {
    const parts = this.path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return new MemoryCollectionRef(this._store, parts.slice(0, -1).join('/'));
  }

  collection(name) {
    return new MemoryCollectionRef(this._store, `${this.path}/${cleanPath(name)}`);
  }

  async get() {
    return new MemoryDocumentSnapshot(this, this._store._documents.get(this.path));
  }

  async set(data = {}, options = {}) {
    const current = this._store._documents.get(this.path) || {};
    const next = applyFirestoreData(current, data, { merge: !!options.merge });
    this._store._documents.set(this.path, next);
    return { writeTime: Date.now() };
  }

  async update(data = {}) {
    const current = this._store._documents.get(this.path) || {};
    const next = applyFirestoreData(current, data, { merge: true });
    this._store._documents.set(this.path, next);
    return { writeTime: Date.now() };
  }

  async delete() {
    this._store._documents.delete(this.path);
    return { writeTime: Date.now() };
  }
}

class MemoryQuery {
  constructor(store, collectionPath, filters = [], order = [], limitValue = 0, startAfterValue = undefined) {
    this._store = store;
    this._collectionPath = cleanPath(collectionPath);
    this._filters = filters;
    this._order = order;
    this._limitValue = limitValue;
    this._startAfterValue = startAfterValue;
  }

  where(field, op, value) {
    return new MemoryQuery(this._store, this._collectionPath, [...this._filters, { field: normalizeFieldKey(field), op: String(op || '=='), value }], this._order, this._limitValue, this._startAfterValue);
  }

  orderBy(field, direction = 'asc') {
    return new MemoryQuery(this._store, this._collectionPath, this._filters, [...this._order, { field: normalizeFieldKey(field), direction: String(direction || 'asc').toLowerCase() }], this._limitValue, this._startAfterValue);
  }

  limit(value) {
    return new MemoryQuery(this._store, this._collectionPath, this._filters, this._order, Math.max(0, Number(value) || 0), this._startAfterValue);
  }

  startAfter(value) {
    return new MemoryQuery(this._store, this._collectionPath, this._filters, this._order, this._limitValue, value);
  }

  count() {
    return { get: async () => new MemoryCountSnapshot((await this.get()).size) };
  }

  _collectionDocs() {
    const prefix = this._collectionPath ? `${this._collectionPath}/` : '';
    const baseDepth = this._collectionPath ? this._collectionPath.split('/').length : 0;
    const docs = [];
    for (const [path, data] of this._store._documents.entries()) {
      if (!path.startsWith(prefix)) continue;
      const parts = path.split('/');
      if (parts.length !== baseDepth + 1) continue;
      const ref = new MemoryDocumentRef(this._store, path);
      const payload = clone(data || {});
      payload.__name__ = ref.id;
      docs.push({ ref, data: payload });
    }
    return docs;
  }

  _matches(data = {}) {
    return this._filters.every(({ field, op, value }) => {
      const current = field === '__name__' ? data.__name__ : getNestedValue(data, field);
      if (op === '==') return valuesEqual(current, value);
      if (op === '!=') return !valuesEqual(current, value);
      if (op === '>') return current > value;
      if (op === '>=') return current >= value;
      if (op === '<') return current < value;
      if (op === '<=') return current <= value;
      if (op === 'array-contains') return Array.isArray(current) && current.some((item) => valuesEqual(item, value));
      if (op === 'in') return Array.isArray(value) && value.some((item) => valuesEqual(current, item));
      return false;
    });
  }

  async get() {
    let docs = this._collectionDocs().filter((entry) => this._matches(entry.data));
    const order = this._order.length ? this._order : [{ field: '__name__', direction: 'asc' }];
    docs.sort((left, right) => {
      for (const item of order) {
        const l = item.field === '__name__' ? left.ref.id : getNestedValue(left.data, item.field);
        const r = item.field === '__name__' ? right.ref.id : getNestedValue(right.data, item.field);
        if (l === r) continue;
        const result = l > r ? 1 : -1;
        return item.direction === 'desc' ? -result : result;
      }
      return left.ref.id.localeCompare(right.ref.id);
    });
    if (this._startAfterValue !== undefined && this._startAfterValue !== null) {
      const marker = typeof this._startAfterValue === 'string'
        ? this._startAfterValue
        : this._startAfterValue.id || this._startAfterValue.ref?.id || '';
      if (marker) {
        const idx = docs.findIndex((entry) => entry.ref.id === marker);
        if (idx >= 0) docs = docs.slice(idx + 1);
      }
    }
    if (this._limitValue > 0) docs = docs.slice(0, this._limitValue);
    return new MemoryQuerySnapshot(docs.map((entry) => new MemoryDocumentSnapshot(entry.ref, entry.data)));
  }
}

class MemoryCollectionRef extends MemoryQuery {
  constructor(store, path) {
    super(store, cleanPath(path));
    this.path = cleanPath(path);
    const parts = this.path.split('/');
    this.id = parts[parts.length - 1] || '';
  }

  get parent() {
    const parts = this.path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return new MemoryDocumentRef(this._store, parts.slice(0, -1).join('/'));
  }

  doc(id = '') {
    const safeId = cleanPath(id || randomId());
    return new MemoryDocumentRef(this._store, `${this.path}/${safeId}`);
  }

  async add(data = {}) {
    const ref = this.doc();
    await ref.set(data, { merge: false });
    return ref;
  }

  async listDocuments() {
    const snap = await this.get();
    return snap.docs.map((doc) => doc.ref);
  }
}

class MemoryCollectionGroupQuery extends MemoryQuery {
  constructor(store, collectionId, filters = [], order = [], limitValue = 0, startAfterValue = undefined) {
    super(store, collectionId, filters, order, limitValue, startAfterValue);
    this._collectionGroupId = String(collectionId || '').trim();
  }

  where(field, op, value) {
    return new MemoryCollectionGroupQuery(this._store, this._collectionGroupId, [...this._filters, { field: normalizeFieldKey(field), op: String(op || '=='), value }], this._order, this._limitValue, this._startAfterValue);
  }

  orderBy(field, direction = 'asc') {
    return new MemoryCollectionGroupQuery(this._store, this._collectionGroupId, this._filters, [...this._order, { field: normalizeFieldKey(field), direction: String(direction || 'asc').toLowerCase() }], this._limitValue, this._startAfterValue);
  }

  limit(value) {
    return new MemoryCollectionGroupQuery(this._store, this._collectionGroupId, this._filters, this._order, Math.max(0, Number(value) || 0), this._startAfterValue);
  }

  startAfter(value) {
    return new MemoryCollectionGroupQuery(this._store, this._collectionGroupId, this._filters, this._order, this._limitValue, value);
  }

  _collectionDocs() {
    const docs = [];
    for (const [path, data] of this._store._documents.entries()) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length < 2 || parts.length % 2 !== 0) continue;
      const parentCollectionId = parts[parts.length - 2];
      if (parentCollectionId !== this._collectionGroupId) continue;
      const ref = new MemoryDocumentRef(this._store, path);
      const payload = clone(data || {});
      payload.__name__ = ref.id;
      docs.push({ ref, data: payload });
    }
    return docs;
  }
}

class MemoryTransaction {
  constructor(store) {
    this._store = store;
  }

  async get(refOrQuery) {
    return refOrQuery.get();
  }

  set(ref, data, options = {}) {
    return ref.set(data, options);
  }

  update(ref, data) {
    return ref.update(data);
  }

  delete(ref) {
    return ref.delete();
  }
}

class MemoryBatch {
  constructor() {
    this._ops = [];
  }

  set(ref, data, options = {}) {
    this._ops.push(() => ref.set(data, options));
    return this;
  }

  update(ref, data) {
    this._ops.push(() => ref.update(data));
    return this;
  }

  delete(ref) {
    this._ops.push(() => ref.delete());
    return this;
  }

  async commit() {
    for (const op of this._ops) await op();
    return [];
  }
}

class MemoryFirestore {
  constructor() {
    this.__degraded = true;
    this._documents = new Map();
  }

  collection(path) {
    return new MemoryCollectionRef(this, path);
  }

  collectionGroup(collectionId) {
    return new MemoryCollectionGroupQuery(this, collectionId);
  }

  doc(path) {
    return new MemoryDocumentRef(this, path);
  }

  batch() {
    return new MemoryBatch();
  }

  async runTransaction(callback) {
    return callback(new MemoryTransaction(this));
  }
}

function createMemoryFirestore() {
  return new MemoryFirestore();
}

module.exports = {
  createMemoryFirestore,
  MemoryFirestore,
  applyFirestoreData,
  describeSentinel
};
