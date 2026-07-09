'use strict';

const crypto = require('crypto');
const { runtimeStore } = require('./runtimeStore');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');

const TTL_30_DAYS = 30 * 86400000;
const DEFAULT_LIMIT = 120;

function cleanText(value = '', max = 160) {
  return String(value || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);
}
function safeNumber(value = 0) { const n = Number(value || 0); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0; }
function safeMultiplier(value = 0) { const n = Number(value || 0); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0; }
function displayGameName(game = '') {
  const key = String(game || '').toLowerCase();
  if (key === 'crash') return 'Crash';
  if (key === 'chess') return 'Satranç';
  if (key === 'pisti') return 'Pişti';
  if (key === 'snake-pro' || key === 'snake') return 'Snake Pro';
  if (key === 'space-pro' || key === 'space') return 'Space Pro';
  if (key === 'pattern-master' || key === 'pattern') return 'Pattern Master';
  if (key === 'wheel') return 'Günlük Çark';
  if (key === 'promo') return 'Promo';
  return cleanText(game || 'PlayMatrix', 80) || 'PlayMatrix';
}
function normalizeActivity(input = {}) {
  const game = cleanText(input.game || input.source || input.type || 'system', 80);
  const source = cleanText(input.source || game, 80);
  const at = Math.max(0, Number(input.at || input.createdAt || Date.now()) || Date.now());
  const uid = cleanText(input.uid || '', 120);
  const username = cleanText(input.username || input.displayName || input.name || 'Oyuncu', 32) || 'Oyuncu';
  const amount = safeNumber(input.amount || input.winAmount || input.mc || 0);
  const xp = safeNumber(input.xp || input.xpAwarded || input.levelPoints || 0);
  const score = safeNumber(input.score || 0);
  const multiplier = safeMultiplier(input.multiplier || input.cashoutMult || 0);
  const outcome = cleanText(input.outcome || input.result || input.status || '', 80);
  const title = cleanText(input.title || `${displayGameName(game)} Kazancı`, 120);
  const rewardLabel = cleanText(input.rewardLabel || input.rewardSummary || input.message || '', 220);
  const idBase = cleanText(input.id || '', 140);
  const id = idBase || `${source}_${uid || 'anon'}_${at}_${crypto.randomBytes(3).toString('hex')}`;
  return { id, type: cleanText(input.type || source, 80), source, game, gameName: cleanText(input.gameName || displayGameName(game), 80), title, username, uid, amount, xp, score, multiplier, outcome, result: outcome, rewardType: cleanText(input.rewardType || '', 60), rewardLabel, badge: cleanText(input.badge || (outcome ? outcome : 'Canlı'), 80), at, createdAt: at };
}

async function persistUserActivity(row) {
  if (!row?.uid) return false;
  try {
    const { db } = initFirebaseAdmin();
    if (!db) return false;
    await db.collection('users').doc(row.uid).collection('gameHistory').doc(row.id).set({ ...row, memoryOnly: false, updatedAt: Date.now() }, { merge: true });
    return true;
  } catch (_) { return false; }
}

function recordRecentActivity(input = {}, { limit = DEFAULT_LIMIT, ttl = TTL_30_DAYS } = {}) {
  const row = normalizeActivity(input);
  const current = Array.isArray(runtimeStore.temporary.get('home:recentActivities')) ? runtimeStore.temporary.get('home:recentActivities') : [];
  const next = [row, ...current.filter((item) => String(item?.id || '') !== row.id)].sort((a, b) => Number(b.at || b.createdAt || 0) - Number(a.at || a.createdAt || 0)).slice(0, Math.max(5, Math.min(250, Number(limit) || DEFAULT_LIMIT)));
  runtimeStore.temporary.set('home:recentActivities', next, ttl);
  persistUserActivity(row).catch(() => false);
  return { ...row, memoryOnly: true };
}
function listRecentActivities(limit = 60) {
  const rows = Array.isArray(runtimeStore.temporary.get('home:recentActivities')) ? runtimeStore.temporary.get('home:recentActivities') : [];
  return rows.map((item) => ({ ...normalizeActivity(item), memoryOnly: true })).sort((a, b) => Number(b.at || b.createdAt || 0) - Number(a.at || a.createdAt || 0)).slice(0, Math.max(1, Math.min(250, Number(limit) || 60)));
}
async function listUserActivities(uid = '', limit = 30) {
  const safeUid = cleanText(uid, 120);
  const safeLimit = Math.max(1, Math.min(60, Number(limit) || 30));
  const memory = listRecentActivities(250).filter((item) => item.uid === safeUid);
  if (!safeUid) return [];
  let persistent = [];
  try {
    const { db } = initFirebaseAdmin();
    if (db) {
      const snap = await db.collection('users').doc(safeUid).collection('gameHistory').orderBy('at', 'desc').limit(safeLimit).get();
      persistent = snap.docs.map((doc) => ({ id: doc.id, ...normalizeActivity(doc.data() || {}), memoryOnly: false }));
    }
  } catch (_) {}
  const seen = new Set();
  return [...persistent, ...memory]
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
    .slice(0, safeLimit);
}

module.exports = { recordRecentActivity, listRecentActivities, listUserActivities, normalizeActivity, displayGameName };
