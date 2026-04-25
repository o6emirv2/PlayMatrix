'use strict';

const crypto = require('crypto');
const { db, admin, isFirebaseReady, getFirebaseStatus } = require('../config/firebase');
const { 
  CRASH_MIN_AUTO, CRASH_MAX_AUTO, CRASH_MAX_MULTIPLIER, 
  CRASH_TICK_MS, CRASH_FULL_STATE_EVERY, AUTO_CASHOUT_BATCH_SIZE, AUTO_CASHOUT_RETRY_DELAY_MS,
  GAME_RESULT_CODES, GAME_SETTLEMENT_STATUS
} = require('../config/constants');
const { safeFloat, safeNum, clamp, nowMs, cleanStr } = require('../utils/helpers');
const { saveMatchHistory } = require('../utils/matchHistory');
const { recordGameAudit } = require('../utils/gameAudit');

const colUsers = () => db.collection('users');


const colCrashBets = () => db.collection('crash_bets');

let crashDbUnavailableLogged = false;

function isCrashDbReady() {
  return typeof isFirebaseReady === 'function' && isFirebaseReady();
}

function logCrashDbUnavailable(context = 'crash-db') {
  if (crashDbUnavailableLogged) return;
  crashDbUnavailableLogged = true;
  const status = typeof getFirebaseStatus === 'function' ? getFirebaseStatus() : {};
  const reason = cleanStr(status?.error || 'Firebase Admin hazır değil.', 260);
  console.warn(`[PlayMatrix][crash] Firebase Admin hazır değil; ${context} kalıcı Firestore işlemleri bu süreçte atlanıyor. ${reason}`);
}

function buildCrashHistoryEntry({ betId = '', uid = '', roundId = '', amount = 0, payout = 0, resultCode = '', crashPoint = 0, cashoutMult = 0, createdAt = 0 } = {}) {
  const safeBetId = cleanStr(betId || '', 180);
  const safeUid = cleanStr(uid || '', 160);
  if (!safeBetId || !safeUid) return null;
  const rewardMc = Math.floor(Number.isFinite(Number(payout)) ? Number(payout) : 0);
  const stakeMc = Math.floor(Number.isFinite(Number(amount)) ? Number(amount) : 0);
  const netMc = rewardMc - stakeMc;
  return {
    id: `crash_${safeBetId}`,
    gameType: 'crash',
    roomId: cleanStr(roundId || safeBetId, 160),
    status: 'finished',
    result: resultCode === GAME_RESULT_CODES.CRASH_CRASHED_LOSS ? 'crashed_loss' : (resultCode === GAME_RESULT_CODES.CRASH_CASHOUT_AUTO ? 'auto_cashout' : 'cashout'),
    winnerUid: netMc > 0 ? safeUid : '',
    loserUid: netMc < 0 ? safeUid : '',
    participants: [safeUid],
    rewards: { mc: rewardMc, stakeMc, netMc },
    meta: {
      resultCode: cleanStr(resultCode || '', 64),
      roundId: cleanStr(roundId || '', 160),
      crashPoint: safeFloat(crashPoint),
      cashoutMult: safeFloat(cashoutMult)
    },
    createdAt: createdAt || nowMs()
  };
}

async function persistCrashSettlementArtifacts({ uid = '', betId = '', roundId = '', amount = 0, payout = 0, resultCode = '', crashPoint = 0, cashoutMult = 0, meta = {}, idempotencyKey = '' } = {}) {
  const historyEntry = buildCrashHistoryEntry({ betId, uid, roundId, amount, payout, resultCode, crashPoint, cashoutMult, createdAt: nowMs() });
  const tasks = [];
  if (historyEntry) tasks.push(saveMatchHistory(historyEntry));
  tasks.push(recordGameAudit({
    gameType: 'crash',
    entityType: 'bet',
    entityId: betId,
    roomId: roundId,
    roundId,
    betId,
    eventType: 'bet_settled',
    resultCode,
    reason: cleanStr(meta?.reason || '', 48),
    status: GAME_SETTLEMENT_STATUS.SETTLED,
    actorUid: uid,
    subjectUid: uid,
    amount,
    payout,
    meta,
    idempotencyKey
  }));
  await Promise.allSettled(tasks);
}

function isCrashBetAlreadySettled(record = {}) {
  const settlementStatus = cleanStr(record.settlementStatus || '', 24);
  return safeNum(record.settledAt, 0) > 0 || settlementStatus === GAME_SETTLEMENT_STATUS.SETTLED || record.cashed === true;
}

async function settleSingleCrashLoss({ uid = '', bet = {}, boxKey = '', roundId = '', crashPoint = 0, settledAt = nowMs() } = {}) {
  if (!uid || !bet?.betId) return null;
  return db.runTransaction(async (tx) => {
    const betRef = colCrashBets().doc(bet.betId);
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists) return null;
    const betDoc = betSnap.data() || {};
    if (isCrashBetAlreadySettled(betDoc)) return null;
    if (cleanStr(betDoc.uid || '', 160) !== cleanStr(uid || '', 160)) return null;
    if (cleanStr(betDoc.roundId || '', 160) !== cleanStr(roundId || bet.roundId || '', 160)) return null;

    tx.update(betRef, {
      status: 'settled',
      settlementStatus: GAME_SETTLEMENT_STATUS.SETTLED,
      resultCode: GAME_RESULT_CODES.CRASH_CRASHED_LOSS,
      resultReason: 'crashed_loss',
      settledAt,
      updatedAt: settledAt,
      cashoutSource: '',
      win: 0,
      cashoutMult: 0,
      crashPoint: safeFloat(crashPoint)
    });

    return {
      uid,
      betId: bet.betId,
      amount: bet.bet,
      payout: 0,
      resultCode: GAME_RESULT_CODES.CRASH_CRASHED_LOSS,
      cashoutMult: 0,
      crashPoint: safeFloat(crashPoint),
      meta: { box: bet.box || (boxKey === 'box2' ? 2 : 1), reason: 'crashed_loss' },
      idempotencyKey: `crash:${bet.betId}:crashed_loss`
    };
  });
}

async function settleCrashRoundLosses(roundId = '', crashPoint = 0) {
  const safeRoundId = cleanStr(roundId || '', 160);
  if (!safeRoundId) return;
  if (!isCrashDbReady()) {
    logCrashDbUnavailable('round-loss settlement');
    return;
  }
  const settledAt = nowMs();
  const candidates = [];
  Object.entries(engineState.crashState.players || {}).forEach(([uid, player]) => {
    ['box1', 'box2'].forEach((boxKey) => {
      const bet = player && player[boxKey];
      if (!bet || !bet.betId || bet.cashed || bet.cashingOut) return;
      candidates.push({ uid, bet, boxKey, roundId: safeRoundId, crashPoint, settledAt });
    });
  });
  if (!candidates.length) return;

  const settled = await Promise.allSettled(candidates.map((item) => settleSingleCrashLoss(item)));
  const artifacts = settled
    .filter((item) => item.status === 'fulfilled' && item.value)
    .map((item) => item.value);
  await Promise.allSettled(artifacts.map((item) => persistCrashSettlementArtifacts({ ...item, roundId: safeRoundId })));
}

const botAvatarLinks = [
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS5zAeu-cciaZQRBbbgfvokkXU8IauErIJ3WaeoXtHtVg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRKLBdAAxI0eLkwSo408HEo38rFAu632wNxoZByHpOVdQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRQwyXlGFYmEebbJwy3udOoiY1aHks5DHDL-LjNe-O2rw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQujzeT1nbxD37pbAAGFoEQYZfH7nHKNHebtVxjQZo1vA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQyFK0ZyigAzwNoA3Ku85fCYQ0jjn9pD4bXb3udeMJoQQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfv2hkYWw-qOtoeyAoimv98hwJKq2ubPB5c8oWfw1MNg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRPSbtgxOwnNkjU2HDU-8GsHnbDLDNuVIFhkcrd4iESTQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx70i0T3WFYg6FiwX64UMM_-SJg1FH7yNS7zcZtwadsg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSts7yln9JS21-O6gYkcGbTQbqfLkiam1QjzipI20T04A&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQLNV6oPg2G3u8toCGbfgTzFOzoRDwsdR5krfpPKD97Jw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTxqVQMssyTEjhvvlW-PgtiqLpT4oCaDm-Id3MPQREMWg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQei0ZKwLg5Tyg-f5Sope2grwo5LeEJlWqkExgqFKhfmw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRGMuRVXVYxLWMkkyjeWK7JmV53JqI16cjHj7xNGOlWvg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRUb54Rad9zWY5E48FqRhZMt5S0mHZNaz3OKJWjZMJigg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_c3uXckZSTzTAfxgS91bBi9jAI8ziYxwog5JFcHjrPw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSV5Uqs-Ejf2-NPS-OTW5DxQVgw2u5WC00k9rvZXCKa2g&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSuJUz4-MtW2ViSrxDwyHegScKo-s0WM5kXLsILioDUCQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTSMlISgSABKv7QYgkrkeKtMSjqCwhhEYNGFOo5GKIFRg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS0YFgG9f5cH2RIgXD2tdoxiSxA2bsUz6nzlqs7KmAYWw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQBqSnyU1y5NQSFuJtc_lZCS3FmrifSjuil-q_GRL_Ajw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSdbKHNqaa4UCgCtfFm4kYvNJtjq_rHerAkhO4iQBgQYQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTPFO-uIM0sut0SRGPAC51ZA7iIIFE9EhTKNxP35tSxWQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQYYTa3n-sus0cCQ5LJ4TZBLIy8K94pFO4w58SIjKPclA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTBIbzqIbWMEQPmtSbSSkaWeoMh3VZ47NVFpPHakdFEpw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTTpSBZkR3HgNCA_-524jPIqcwrqJoXSUKQMMJhse31mg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQUiIxmxizRJHG2HFAwJKv_XpFL_XUoFi5F9q7zM0hWvQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSSA9lRNgiMSJGOmxCjBJEyVoRSzGYENROgjZxnxpq7-Q&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQmZLPJh6tcUqmgXIsb4Tz-DmRxY9-bq1ek8E9guTvG7Q&s",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSGZN7SsBmNH54g7G1C9SWPw3UbPGTNjb0ByMgR0AIjvA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTbvZW1rEjuLmnYriVBZNE0vGNs4268YnQg0BMbXZk8pg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSgq6Xyxt8CLLSIxhpd9QJae0hMS2AKi2p39hVv3romrg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRXHgLyBUzoeFroco2SqaL2sPY5TWpX0lE9rOZYRsFQtw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPb-Dr4J10JlfhSc56Ke8g7_RbfTjL9QNZxXm5Gm_blw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQIWTfu0frhcTzfbIJFM1gLNFmcC7IzJH5uizjhOekddw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgQeuu0DFnj-aZz_t9kHGW-tUQtMEHX2ajGBvpKDZUkg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSou61ywJlYUbCK1nE1N8y5DM7wp9Y6zzln_ugOr9ykQA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSqYSHeJelBA3A1P-wIyynv072vVXxE3KaOPgQiuiUm0g&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQraYro-KL9yr7ZDfUiUQ_qvp3UA5QfWIAFV6L0awsJxw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUvpCGTVq4Z9csDgHpWBo6O5CoCaktfaLJ_I-nynKehw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSqdYmJjcQyhY4xb6XJj59DiB3VkmtEo5WYk7jeKlFSlA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSgD3nnC2ZQL7XS8t5EyLjEtK86__E6cwG64fOlXzpADw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRNaJDmyz6zCgrr0pZ1RzrJikk-cOCxnTTUy8mTIXr_6Q&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTSl1CMVO7hB7RbYIJSsFAF-gUMmXS1y4MyzKBZqRSwPg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSgWjKIUU7BHfK5dFhIMj9UkwTdPt78jdj0JrdbJqe41Q&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVVQZ5d58pVDpDzlWGuu_sHX5bwZM_o48wxjLNdRqAqg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQsDS_emd7Q4lgthhFmkwVOJRUV7muWnMRRJhgQRepjVw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSZyxCQe1ktpTGjHWy6g0yzpDqb4jjGOgDeS3wDoXErsw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSfGyJQYvPP6iCLIpSd0v2JMQxgxA3dUEjyLmW4F82zYQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQKNQZDgKhgQChE_EnvSmGhGAXfRlgJjFhj3F9O0XBb5Q&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQFRlNKYel2FBw6U_Zu0g-YDMVtQfOXDQgSWKZ63J6X1A&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR25F5lDK08NhXotGOwkSzKIUy0WHunag4GfMclyQWlIg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEUvyk_3eStp1CjovPdR0SZXHN3LPaR0vsV2b4Sz0c2w&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjMnegdIlZyzrUtiCsteIkUSyZP6x5M1w7wvLiRosJiw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT1sBhoIVU0Xxztm5-2I5-Gv8gpANd4Ue1R92gMAeQZ7g&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmB7IdDI1qOqq9ZKcw9_Bnf4dSGetEAH4mBLQxLXhc2A&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQYQJPH6vHsuefKsWLgu-bb0BCDUZS8Ci_MnUzJm-e0rg&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSNGeyxwWfsLhJDiyajr4k1T8y2XpWBvFpQOxvnIB5TUw&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSRQAxVMN5FtGl10VHdrElVwAZhcUWbuAsHmFPDT9tfCQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQj63hJsea31ysMRtOsBPvpUrfC4ZcKEdf5gJJhwNT089Iy5YuNv5jmeuo&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQnIbjW9K_Oaimj6nFW3lSCyCg93RZJLJ1T0KiQdfLBAQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ1bg0PPaLsIYwIzjydGruOate9HajDtD75fYj7NE1bLQ&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSwhoElr8UjyV6zSFEo5mRRmgdSgk3EFDho26joYQNLzA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTeEfmqn4x4i13G-hLWNJ32sXYP_JWp6BYiWzYCcKGCkA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSIZYEWydwVudKtrX3H1rqtVZ9C9UtU5B5M-t8zjEknqA&s=10",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPnkz3R7ZMWGhnu5Ro4U_Z7qE3NHublXhkUYP09oIyCA&s=10"
    ];

const botUsernames = [
  "AhmetBey", "GizemliOyuncu", "Mehmet34", "Kral1903", "ZeynepX", "YusufEfe",
  "CanerTR", "AyseNur", "ProOyuncu", "EfsaneTR", "ElifK", "AliK",
  "Burak99", "Merve35", "Okan_06", "Ceren1998", "Hakan34", "Volkan88",
  "Emirhan55", "Selin07", "Tarik1923", "Berkay41", "Arda2005", "Buse_16",
  "Tolga_01", "Yasin61", "Gokhan27", "Asli_34", "Cemal55", "Deniz1905",
  "Tugay42", "Esra1995", "Halil63", "Kaan2001", "Busra09", "Ozgur35",
  "KemalReis", "SinanKaptan", "RizaBaba", "UgurHoca", "TugbaHanim",
  "YasarDayi", "CemBaskan", "KadirAga", "DeliEmin", "SariMuzo",
  "DoktorAli", "UstaKemal", "SoforRiza", "KralSaban", "Dayi06",
  "AslanGS", "KartalBjk", "Goztepeli35", "Trabzon61", "TexasliBursa",
  "Carsi34", "Ultraslan", "GencFenerli", "BordoMavi", "KafKaf35",
  "Esesli26", "Timsah16", "DemirBakan", "KirmiziKara", "Bozbaykus",
  "Kanarya1907", "Cimbomlu", "Karakartal", "Tatanga54", "Yigido58",
  "GeceKusu", "YalnizKurt", "SonVurus", "Karanlik", "Bela34",
  "ZehirX", "RuzgarinOglu", "Suskun", "Golgeler", "KaosBeyi",
  "KizilElma", "DemirYumruk", "SessizFirtina", "AyYildiz", "SokakKedisi",
  "Kabus", "Mermi", "Hedef", "EfsaneX", "Oyuncu5490",
  "User98341", "Guest772", "Ahmet7382", "Ali991", "Can9283",
  "Pro1123", "Gamer445", "KullaniciX", "Anonim99", "MasaUstasi"
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

function getBotLevelBandByBet(bet) {
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
      const levelBand = getBotLevelBandByBet(bBet);
      const accountLevel = [4, 8, 14, 22, 32, 45][levelBand - 1];

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
          levelBand,
          accountLevel
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
  const pf = generateRoundProvablyFair();
  engineState.crashState.crashPoint = pf.crashPoint;
  engineState.crashState.serverSeed = pf.serverSeed;
  engineState.crashState.hash = pf.hash;

  if (!isCrashDbReady()) {
    logCrashDbUnavailable('startup history read');
    return;
  }

  try {
    const snap = await db.collection('server_data').doc('crash_global').get();
    if (snap.exists) {
      engineState.crashState.history = Array.isArray(snap.data().history) ? snap.data().history : [];
      engineState.crashState.roundId = Date.now();
    }
  } catch (e) {
    console.error('initCrashDb error:', e);
  }
}
initCrashDb();

async function saveCrashHistory() {
  if (!isCrashDbReady()) {
    logCrashDbUnavailable('history write');
    return false;
  }

  try {
    await db.collection('server_data').doc('crash_global').set({ history: engineState.crashState.history }, { merge: true });
    return true;
  } catch (e) {
    console.error('saveCrashHistory error:', e);
    return false;
  }
}

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
  if (!isCrashDbReady()) {
    logCrashDbUnavailable('auto-cashout settlement');
    Array.from(autoCashoutQueue.values()).forEach((item) => {
      const player = engineState.crashState.players[item.uid];
      if (player && player[item.boxKey]) player[item.boxKey].cashingOut = false;
    });
    autoCashoutQueue.clear();
    engineState.triggerUpdate();
    return;
  }

  const entries = Array.from(autoCashoutQueue.values()).slice(0, AUTO_CASHOUT_BATCH_SIZE);
  for (const item of entries) {
      try {
          const settledAt = nowMs();
          const settlement = await db.runTransaction(async (tx) => {
            const betRef = colCrashBets().doc(item.betId);
            const betSnap = await tx.get(betRef);
            if (!betSnap.exists) throw new Error('AUTO_CASHOUT_BET_NOT_FOUND');
            const betDoc = betSnap.data() || {};
            if (isCrashBetAlreadySettled(betDoc)) {
              return {
                duplicated: true,
                resultCode: cleanStr(betDoc.resultCode || '', 64),
                win: safeFloat(betDoc.win || 0),
                cashoutMult: safeFloat(betDoc.cashoutMult || 0),
                cashoutSource: cleanStr(betDoc.cashoutSource || '', 32)
              };
            }
            if (cleanStr(betDoc.uid || '', 160) !== cleanStr(item.uid || '', 160)) throw new Error('AUTO_CASHOUT_UID_MISMATCH');

            tx.update(betRef, {
              cashed: true,
              win: item.finalWin,
              cashoutMult: item.finalMult,
              updatedAt: settledAt,
              status: 'settled',
              settlementStatus: GAME_SETTLEMENT_STATUS.SETTLED,
              resultCode: GAME_RESULT_CODES.CRASH_CASHOUT_AUTO,
              resultReason: 'cashout_auto',
              settledAt,
              cashoutSource: 'auto'
            });
            tx.update(colUsers().doc(item.uid), { balance: admin.firestore.FieldValue.increment(item.finalWin) });
            return { duplicated: false, resultCode: GAME_RESULT_CODES.CRASH_CASHOUT_AUTO, win: item.finalWin, cashoutMult: item.finalMult, cashoutSource: 'auto' };
          });

          autoCashoutQueue.delete(item.betId);
          const player = engineState.crashState.players[item.uid];
          if (player && player[item.boxKey]) {
            player[item.boxKey].cashingOut = false;
            player[item.boxKey].cashed = true;
            player[item.boxKey].win = settlement.win;
            player[item.boxKey].cashoutMult = settlement.cashoutMult;
            if (!settlement.duplicated) {
              await persistCrashSettlementArtifacts({
                uid: item.uid,
                betId: item.betId,
                roundId: cleanStr(player[item.boxKey].roundId || engineState.crashState.roundId || '', 160),
                amount: player[item.boxKey].bet,
                payout: item.finalWin,
                resultCode: GAME_RESULT_CODES.CRASH_CASHOUT_AUTO,
                cashoutMult: item.finalMult,
                meta: { box: player[item.boxKey].box || (item.boxKey === 'box2' ? 2 : 1), reason: 'cashout_auto' },
                idempotencyKey: `crash:${item.betId}:cashout_auto`
              }).catch(() => null);
            }
          }
          engineState.triggerUpdate();
      } catch (e) {
          item.retryCount = Math.min(10, Math.floor(safeNum(item.retryCount, 0) + 1));
          item.lastError = cleanStr(e?.message || e || 'auto_cashout_failed', 120);
          item.lastRetryAt = nowMs();
          autoCashoutQueue.set(item.betId, item);
          const player = engineState.crashState.players[item.uid];
          if (player && player[item.boxKey]) player[item.boxKey].cashingOut = false;
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
            settleCrashRoundLosses(String(state.roundId || ''), safeFloat(state.crashPoint)).catch(() => null);
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