'use strict';

const crypto = require('crypto');
const { db } = require('../config/firebase');
const { cleanStr, safeNum, nowMs } = require('./helpers');
const { writeLine } = require('./logger');
const { normalizeObservationEvent, buildServerErrorObservation } = require('./liveObservation');

const colLiveObservations = () => db.collection('ops_live_observations');

function withEnvelopeDefaults(envelope = {}) {
  return {
    createdAt: nowMs(),
    uid: cleanStr(envelope.uid || '', 180),
    page: cleanStr(envelope.page || envelope.pathname || '', 120),
    pathname: cleanStr(envelope.pathname || '', 160),
    route: cleanStr(envelope.route || '', 160),
    pageLabel: cleanStr(envelope.pageLabel || '', 80),
    appVersion: cleanStr(envelope.appVersion || '', 80),
    releaseId: cleanStr(envelope.releaseId || '', 120),
    requestId: cleanStr(envelope.requestId || '', 120),
    sessionId: cleanStr(envelope.sessionId || '', 120),
    userAgent: cleanStr(envelope.userAgent || '', 240),
    networkState: cleanStr(envelope.networkState || '', 40),
    visibilityState: cleanStr(envelope.visibilityState || '', 40),
    viewport: envelope.viewport && typeof envelope.viewport === 'object' ? envelope.viewport : {},
    context: envelope.context && typeof envelope.context === 'object' ? envelope.context : {}
  };
}

async function writeObservationRows(rows = []) {
  const normalizedRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!normalizedRows.length) return [];

  const batch = db.batch();
  normalizedRows.forEach((row) => {
    const docRef = colLiveObservations().doc(crypto.randomUUID());
    batch.set(docRef, row, { merge: false });
  });
  await batch.commit();
  return normalizedRows;
}

async function storeClientObservationEnvelope(payload = {}, envelope = {}) {
  const base = withEnvelopeDefaults(envelope);
  const rawEvents = Array.isArray(payload?.events)
    ? payload.events
    : (payload?.event && typeof payload.event === 'object' ? [payload.event] : []);
  const events = rawEvents.slice(0, 25).map((event) => normalizeObservationEvent(event, base));
  if (!events.length) return [];
  await writeObservationRows(events);
  writeLine('warn', 'client_observation_ingested', {
    scope: 'live_observation',
    count: events.length,
    uid: base.uid || null,
    page: base.page || base.pathname || null
  });
  return events;
}

async function storeServerErrorObservation(error, envelope = {}) {
  const row = buildServerErrorObservation(error, envelope);
  await writeObservationRows([row]);
  return row;
}

async function listLiveObservationRows(options = {}) {
  const limit = Math.max(1, Math.min(240, safeNum(options.limit, 120)));
  const lookbackMs = Math.max(60 * 1000, safeNum(options.lookbackMs, 6 * 60 * 60 * 1000));
  const since = nowMs() - lookbackMs;
  try {
    const snap = await colLiveObservations()
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  } catch (error) {
    writeLine('warn', 'live_observation_list_failed', { error: { message: error?.message || 'UNKNOWN' } });
    return [];
  }
}

module.exports = {
  storeClientObservationEnvelope,
  storeServerErrorObservation,
  listLiveObservationRows
};
