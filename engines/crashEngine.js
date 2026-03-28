// engines/crashEngine.js
'use strict';

const crypto = require('crypto');
const { db, admin } = require('../config/firebase');
const { 
  CRASH_MIN_AUTO, CRASH_MAX_AUTO, CRASH_MAX_MULTIPLIER, 
  CRASH_TICK_MS, CRASH_FULL_STATE_EVERY, AUTO_CASHOUT_BATCH_SIZE, AUTO_CASHOUT_RETRY_DELAY_MS 
} = require('../config/constants');
const { safeFloat, clamp, nowMs } = require('../utils/helpers');

const colUsers = () => db.collection('users');

// ---------------------------------------------------------
// BOT VERİLERİ VE YARDIMCILAR
// ---------------------------------------------------------
const botAvatarLinks = [
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRQwyXlGFYmEebbJwy3udOoiY1aHks5DHDL-LjNe-O2rw&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQujzeT1nbxD37pbAAGFoEQYZfH7nHKNHebtVxjQZo1vA&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQyFK0ZyigAzwNoA3Ku85fCYQ0jjn9pD4bXb3udeMJoQQ&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfv2hkYWw-qOtoeyAoimv98hwJKq2ubPB5c8oWfw1MNg&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRPSbtgxOwnNkjU2HDU-8GsHnbDLDNuVIFhkcrd4iESTQ&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx70i0T3WFYg6FiwX64UMM_-SJg1FH7yNS7zcZtwadsg&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSts7yln9JS21-O6gYkcGbTQbqfLkiam1QjzipI20T04A&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQLNV6oPg2G3u8toCGbfgTzFOzoRDwsdR5krfpPKD97Jw&s=10"
]; // Uzunluğu kısaltıldı, sen tam listeyi buraya ekleyebilirsin.

const botUsernames = [
  "AhmetBey", "GizemliOyuncu", "Mehmet34", "Kral1903", "ZeynepX", "YusufEfe",
  "CryptoEmre", "CanerVIP", "AyseNur", "ProOyuncu", "EfsaneTR", "ElifK",
  "AliK", "VipGamer", "LuckyStrike", "DarkKnight", "CetinBaba", "Fenerli1907"
];

function normalizeAutoCashout(value) {
  if (value === undefined || value === null || value === '' || isNaN(Number(value))) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return safeFloat(clamp(numeric, CRASH_MIN_AUTO, CRASH_MAX_AUTO));
}

function pickBotCount() {
  const packs = [12, 18, 24, 30, 36, 42, 48, 60];
  return packs[Math.floor(Math.random() * packs.length)];
}

function getBotVipLevelByBet(bet) {
  const roll = Math.random();
  if (roll < 0.005 && safeFloat(bet) >= 2500) return 6;
  if (roll < 0.03 && safeFloat(bet) >= 1000) return 5;
  if (roll < 0.10 && safeFloat(bet) >= 500) return 4;
  if (safeFloat(bet) >= 500) return 3;
  if (safeFloat(bet) >= 150) return 2;
  return 1;
}

function uniqueBotUsername(used) {
  let tries = 0;
  while (tries < 20) {
      const candidate = `${botUsernames[Math.floor(Math.random() * botUsernames.length)]}${Math.floor(Math.random() * 990 + 10)}`;
      if (!used.has(candidate)) { used.add(candidate); return candidate; }
      tries++;
  }
  return `Oyuncu${Math.floor(Math.random() * 9000 + 1000)}`;
}

function generateBotAutoCashout() {
  const roll = Math.random();
  if (roll < 0.44) return safeFloat(1.10 + Math.random() * 1.4);
  if (roll < 0.72) return safeFloat(2.00 + Math.random() * 3.0);
  if (roll < 0.88) return safeFloat(5.00 + Math.random() * 5.0);
  if (roll < 0.96) return safeFloat(10.00 + Math.random() * 90.0);
  const spikes = [2, 3, 5, 10, 25, 50, 75, 100];
  return safeFloat(spikes[Math.floor(Math.random() * spikes.length)]);
}

function generateBots() {
  const generatedBots = [];
  const usedNames = new Set();
  const numBots = pickBotCount();
  const betPool = [1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 1500, 2500, 5000];

  for (let i = 0; i < numBots; i++) {
      const bBet = betPool[Math.floor(Math.random() * betPool.length)];
      const vipLevel = getBotVipLevelByBet(bBet);
      const rp = [480, 1450, 3550, 7200, 11800, 15000][vipLevel - 1];

      generatedBots.push({
          uid: `bot_${nowMs()}_${i}`,
          username: uniqueBotUsername(usedNames),
          avatar: botAvatarLinks[i % botAvatarLinks.length],
          bet: safeFloat(bBet),
          autoCashout: safeFloat(clamp(generateBotAutoCashout(), CRASH_MIN_AUTO, CRASH_MAX_AUTO)),
          cashed: false,
          cashingOut: false,
          win: 0,
          cashoutMult: 0,
          isBot: true,
          vipLevel,
          rp
      });
  }
  return generatedBots;
}

function generateRoundProvablyFair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const h = parseInt(hash.slice(0, 13), 16);
  const e = Math.pow(2, 52);

  if (h % 100 === 0) return { serverSeed, hash, crashPoint: 1.00 };

  const rawCrash = Math.max(1.00, Math.floor((100 * e - h) / (e - h)) / 100);
  const cappedCrash = clamp(rawCrash, 1.00, CRASH_MAX_MULTIPLIER);
  return { serverSeed, hash, crashPoint: safeFloat(cappedCrash) };
}

// ---------------------------------------------------------
// OYUN DURUMU (STATE)
// ---------------------------------------------------------
const engineState = {
  crashState: {
    phase: 'COUNTDOWN',
    startTime: nowMs() + 6000,
    crashPoint: 1.00,
    serverSeed: '',
    hash: '',
    endTime: 0,
    history: [],
    players: {},
    bots: generateBots(),
    roundId: Date.now(),
    currentMult: 1.00
  },
  forceStateUpdate: false,
  triggerUpdate: () => { engineState.forceStateUpdate = true; },
  normalizeAutoCashout
};

async function initCrashDb() {
  try {
      const snap = await db.collection('server_data').doc('crash_global').get();
      if (snap.exists) {
          engineState.crashState.history = Array.isArray(snap.data().history) ? snap.data().history : [];
          engineState.crashState.roundId = Date.now();
      }
      const pf = generateRoundProvablyFair();
      engineState.crashState.crashPoint = pf.crashPoint;
      engineState.crashState.serverSeed = pf.serverSeed;
      engineState.crashState.hash = pf.hash;
  } catch (e) { console.error('initCrashDb error:', e); }
}
initCrashDb();

async function saveCrashHistory() {
  try { await db.collection('server_data').doc('crash_global').set({ history: engineState.crashState.history }, { merge: true }); } 
  catch (e) { console.error('saveCrashHistory error:', e); }
}

// ---------------------------------------------------------
// OTOMATİK ÇEKİM (AUTO CASHOUT) SİSTEMİ
// ---------------------------------------------------------
const autoCashoutQueue = new Map();
let autoCashoutFlushRunning = false;

function enqueueAutoCashoutPersist(uid, boxKey, betData, finalMult, finalWin) {
  if (!betData?.betId) return;
  autoCashoutQueue.set(betData.betId, { uid, boxKey, betId: betData.betId, finalMult, finalWin, retryCount: 0 });
  scheduleAutoCashoutFlush();
}

function scheduleAutoCashoutFlush() {
  if (autoCashoutFlushRunning) return;
  autoCashoutFlushRunning = true;
  setTimeout(() => {
      flushAutoCashoutQueue().catch(e => console.error('flushAutoCashoutQueue error:', e)).finally(() => {
          autoCashoutFlushRunning = false;
          if (autoCashoutQueue.size > 0) scheduleAutoCashoutFlush();
      });
  }, 0);
}

async function flushAutoCashoutQueue() {
  const entries = Array.from(autoCashoutQueue.values()).slice(0, AUTO_CASHOUT_BATCH_SIZE);
  for (const item of entries) {
      try {
          const batch = db.batch();
          batch.update(db.collection('crash_bets').doc(item.betId), { cashed: true, win: item.finalWin, cashoutMult: item.finalMult });
          batch.update(colUsers().doc(item.uid), { balance: admin.firestore.FieldValue.increment(item.finalWin) });
          await batch.commit();
          
          autoCashoutQueue.delete(item.betId);
          const player = engineState.crashState.players[item.uid];
          if (player && player[item.boxKey]) player[item.boxKey].cashingOut = false;
          engineState.triggerUpdate();
      } catch (e) {
          item.retryCount += 1;
          if (item.retryCount >= 5) {
              autoCashoutQueue.delete(item.betId);
              const player = engineState.crashState.players[item.uid];
              if (player && player[item.boxKey]) {
                  player[item.boxKey].cashed = false; player[item.boxKey].cashingOut = false;
                  player[item.boxKey].win = 0; player[item.boxKey].cashoutMult = 0;
              }
          } else { autoCashoutQueue.set(item.betId, item); }
          engineState.triggerUpdate();
          await new Promise(resolve => setTimeout(resolve, AUTO_CASHOUT_RETRY_DELAY_MS));
      }
  }
}

function processAutoCashout(uid, boxKey, targetMult) {
  const player = engineState.crashState.players[uid];
  if (!player || !player[boxKey]) return false;
  const betData = player[boxKey];
  if (!betData.autoCashoutEnabled || betData.cashed || betData.cashingOut || targetMult > engineState.crashState.crashPoint) return false;

  const finalMult = safeFloat(clamp(targetMult, CRASH_MIN_AUTO, CRASH_MAX_AUTO));
  const finalWin = safeFloat(betData.bet * finalMult);

  betData.cashingOut = true; betData.cashed = true; betData.win = finalWin; betData.cashoutMult = finalMult;
  engineState.triggerUpdate();
  enqueueAutoCashoutPersist(uid, boxKey, betData, finalMult, finalWin);
  return true;
}

// ---------------------------------------------------------
// MOTORU BAŞLATMA
// ---------------------------------------------------------
function initCrashEngine(io) {
  let tickCounter = 0;

  function broadcastCrashState(isFull = false) {
    let payload;
    if (isFull || engineState.forceStateUpdate) {
        const allBets = [];
        Object.values(engineState.crashState.players).forEach(p => { if (p.box1) allBets.push(p.box1); if (p.box2) allBets.push(p.box2); });
        engineState.crashState.bots.forEach(b => allBets.push(b));

        payload = {
            type: 'STATE', phase: engineState.crashState.phase, startTime: engineState.crashState.startTime,
            serverNow: nowMs(), history: engineState.crashState.history, hash: engineState.crashState.hash,
            seed: engineState.crashState.phase === 'CRASHED' ? engineState.crashState.serverSeed : null,
            crashPoint: engineState.crashState.phase === 'CRASHED' ? engineState.crashState.crashPoint : null,
            currentMult: safeFloat(engineState.crashState.currentMult), roundId: engineState.crashState.roundId,
            activePlayers: allBets 
        };
        engineState.forceStateUpdate = false;
    } else {
        payload = { type: 'TICK', phase: engineState.crashState.phase, currentMult: safeFloat(engineState.crashState.currentMult), serverNow: nowMs(), startTime: engineState.crashState.startTime, roundId: engineState.crashState.roundId };
    }

    if (io) io.to('crash').emit('crash:update', payload);
  }

  setInterval(() => {
    const now = nowMs();
    tickCounter++;
    const state = engineState.crashState;

    if (state.phase === 'COUNTDOWN') {
        state.currentMult = 1.00;
        if (now >= state.startTime) { state.phase = 'FLYING'; state.startTime = now; engineState.triggerUpdate(); }
    } else if (state.phase === 'FLYING') {
        const elapsedMs = now - state.startTime;
        state.currentMult = clamp(Math.max(1.00, Math.pow(Math.E, 0.00008 * Math.max(0, elapsedMs))), 1.00, CRASH_MAX_MULTIPLIER);

        Object.keys(state.players).forEach((uid) => {
            const p = state.players[uid];
            ['box1', 'box2'].forEach((b) => {
                if (p[b] && !p[b].cashed && !p[b].cashingOut && p[b].autoCashoutEnabled && p[b].autoCashout >= CRASH_MIN_AUTO) {
                    if (state.currentMult >= p[b].autoCashout && p[b].autoCashout <= state.crashPoint) processAutoCashout(uid, b, p[b].autoCashout);
                }
            });
        });

        state.bots.forEach((bot) => {
            if (!bot.cashed && !bot.cashingOut && bot.autoCashout <= state.crashPoint && state.currentMult >= bot.autoCashout) {
                bot.cashingOut = true; bot.cashed = true; bot.cashoutMult = safeFloat(bot.autoCashout); bot.win = safeFloat(bot.bet * bot.autoCashout); bot.cashingOut = false;
                engineState.triggerUpdate();
            }
        });

        if (state.currentMult >= state.crashPoint) {
            state.phase = 'CRASHED'; state.endTime = now; state.currentMult = safeFloat(state.crashPoint);
            state.history.unshift(safeFloat(state.crashPoint));
            if (state.history.length > 15) state.history.pop();
            saveCrashHistory(); engineState.triggerUpdate();
        }
    } else if (state.phase === 'CRASHED') {
        if (now >= state.endTime + 4000) {
            state.phase = 'COUNTDOWN'; state.startTime = now + 6000;
            const pf = generateRoundProvablyFair();
            state.crashPoint = pf.crashPoint; state.serverSeed = pf.serverSeed; state.hash = pf.hash;
            state.roundId = nowMs(); state.players = {}; state.bots = generateBots(); state.currentMult = 1.00;
            engineState.triggerUpdate();
        }
    }

    broadcastCrashState(tickCounter % CRASH_FULL_STATE_EVERY === 0);
  }, CRASH_TICK_MS);
}

module.exports = { engineState, initCrashEngine };