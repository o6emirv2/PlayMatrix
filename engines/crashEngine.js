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
  // --- MEVCUT İSİMLER ---
  "AhmetBey", "GizemliOyuncu", "Mehmet34", "Kral1903", "ZeynepX", "YusufEfe",
  "CryptoEmre", "CanerVIP", "AyseNur", "ProOyuncu", "EfsaneTR", "ElifK",
  "AliK", "VipGamer", "LuckyStrike", "DarkKnight", "CetinBaba", "Fenerli1907",

  // --- İSİM + PLAKA / DOĞUM YILI (En Sık Rastlananlar) ---
  "Burak99", "Merve35", "Okan_06", "Ceren1998", "Hakan34", "Volkan88",
  "Emirhan55", "Selin07", "Tarik1923", "Berkay41", "Arda2005", "Buse_16",
  "Tolga_01", "Yasin.61", "Gokhan27", "Asli_34", "Cemal.55", "Deniz_1905",
  "Tugay_42", "Esra1995", "Halil.63", "Kaan2001", "Busra_09", "Ozgur.35",

  // --- TÜRK OYUNCU KÜLTÜRÜ LAKAPLARI ---
  "KemalReis", "SinanKaptan", "RizaBaba", "UgurHoca", "TugbaHanim",
  "YasarDayi", "CemBaskan", "KadirAga", "DeliEmin", "SariMuzo",
  "GaddarKerim", "DoktorAli", "Usta_Kemal", "SoforRiza", "Kral_Saban",
  "Dayi_06", "TeyzeOglu", "Asabi_Genç", "Kralice", "Pasa_Kemal",

  // --- CASİNO, KRİPTO & OYUN TEMALI (Gerçekçi) ---
  "SlotKrali", "Btc_Kadir", "Katlayici", "Riskci_34", "ParaBabasi", 
  "JackpotAvcisi", "RuletEfsanesi", "All_In_Ahmet", "Batakci", "OkeyPro", 
  "Zar_Tutan", "Blofcu", "Banko_Cemal", "KriptoKral", "Vip_Eren", 
  "KasaKatlayan", "Aviator_Pro", "Crash_Uzmani", "SanalAlem", "Carkci",
  "KasaHerZamanKazanir", "Vurguncu_06", "X_Avcisi", "Katlama_Pro",

  // --- GÜNLÜK / SIRADAN (İsim + Soyisim Baş Harfi) ---
  "Yunus_E", "Fatma_K", "AliCan_S", "Umut_D", "Erdem_T", "Gizem_Y",
  "Batu_B", "Ozan_C", "Caner_A", "Derya_M", "Furkan_K", "Ilayda_S",
  "Kaan_Y", "Melis_B", "Omer_F", "Sarp_D", "Tugce_A", "Veli_K",
  "Onur_H", "Cagla_E", "Burcu_S", "Emre_C", "Kerem_A", "Pelin_D",

  // --- FUTBOL / TARAFTAR TEMALI ---
  "AslanGS", "KartalBjk", "Goztepeli35", "Trabzon61", "TexasliBursa",
  "Carsi_34", "Ultraslan", "GencFenerli", "BordoMavi", "KafKaf_35",
  "Esesli_26", "Timsah_16", "DemirBakan", "KirmiziKara", "Bozbaykus",
  "Kanarya1907", "Cimbomlu", "Karakartal", "Tatanga54", "Yigido58",

  // --- OYUN İÇİ "HAVALI" NİCKLER (Edgy / Klasik) ---
  "GeceKusu", "YalnizKurt", "SonVurus", "Karanlik", "Bela_34",
  "Zehir_X", "RuzgarinOglu", "Suskun", "Vurguncu", "Golgeler",
  "Kaos_Beyi", "Kizil_Elma", "DemirYumruk", "Sessiz_Firtina", "AyYildiz",
  "SokakKedisi", "Kabus", "Mermi", "Hedef", "Efsane_X",

  // --- RASTGELE SAYILI (Otomatik atanmış gibi duranlar) ---
  "User98341", "Guest_772", "Oyuncu_5490", "Ahmet7382", "Ali_991",
  "Can9283", "Pro_1123", "Gamer445", "X_Kullanici", "Anonim_99"
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