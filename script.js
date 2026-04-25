import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import {
      getAuth, onAuthStateChanged, signOut,
      signInWithEmailAndPassword, createUserWithEmailAndPassword,
      sendEmailVerification, sendPasswordResetEmail,
      verifyBeforeUpdateEmail, getIdToken, reload
    } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

    const $ = (id) => document.getElementById(id);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const formatNumber = (n) => Number(n || 0).toLocaleString('tr-TR');

    const firebaseConfig = {
      apiKey: "AIzaSyC81Ah46_F2his90zedODoCk07vqsd3vVs",
      authDomain: "playmatrix-b7df9.firebaseapp.com",
      projectId: "playmatrix-b7df9",
      storageBucket: "playmatrix-b7df9.firebasestorage.app",
      messagingSenderId: "689686425310",
      appId: "1:689686425310:web:01c9f797b437a770e19c4f",
      measurementId: "G-BL9ZP43VVW"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.auth = auth;
    window.__PM_RUNTIME.signOut = signOut;
    window.__PM_RUNTIME.getIdToken = async (forceRefresh = false) => {
      if (!auth.currentUser) throw new Error('NO_USER');
      return getIdToken(auth.currentUser, forceRefresh);
    };

    const PLAYMATRIX_API_META = (document.querySelector('meta[name="playmatrix-api-url"]')?.content || "").trim();
    const PLAYMATRIX_RUNTIME_API = (window.__PLAYMATRIX_API_URL__ || "").trim();
    const PLAYMATRIX_DEFAULT_REMOTE_API = "https://emirhan-siye.onrender.com";

    const API_CANDIDATES = (() => {
      const list = [];
      const push = (value) => {
        const normalized = String(value || "").trim().replace(/\/+$/, "");
        if (!normalized || list.includes(normalized)) return;
        list.push(normalized);
      };

      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        push("http://localhost:3000");
        return list;
      }

      push(PLAYMATRIX_RUNTIME_API);
      push(PLAYMATRIX_API_META);
      push(PLAYMATRIX_DEFAULT_REMOTE_API);
      push(window.location.origin);
      return list;
    })();

    let API_URL = API_CANDIDATES[0] || window.location.origin.replace(/\/+$/, "");

    function setResolvedApiBase(base) {
      const normalized = String(base || "").trim().replace(/\/+$/, "");
      if (!normalized) return API_URL;
      API_URL = normalized;
      window.__PM_RUNTIME = window.__PM_RUNTIME || {};
      window.__PM_RUNTIME.apiBase = normalized;
      window.__PLAYMATRIX_API_URL__ = normalized;
      return API_URL;
    }

    async function probeApiBase(base) {
      const normalized = String(base || "").trim().replace(/\/+$/, "");
      if (!normalized) return false;
      for (const probePath of ["/api/healthz", "/healthz"]) {
        try {
          const response = await fetch(`${normalized}${probePath}`, {
            method: "GET",
            headers: { "Accept": "application/json" },
            credentials: "omit",
            cache: "no-store"
          });
          if (response.ok) return true;
        } catch (_) {}
      }
      return false;
    }

    function getFallbackApiBases(currentBase = "") {
      const current = String(currentBase || "").trim().replace(/\/+$/, "");
      return API_CANDIDATES
        .map((value) => String(value || "").trim().replace(/\/+$/, ""))
        .filter((value, index, arr) => value && arr.indexOf(value) === index && value !== current);
    }

    async function resolveApiBase() {
      for (const base of API_CANDIDATES) {
        if (await probeApiBase(base)) return setResolvedApiBase(base);
      }
      const preferred = PLAYMATRIX_RUNTIME_API || PLAYMATRIX_API_META || PLAYMATRIX_DEFAULT_REMOTE_API || API_CANDIDATES[0] || "";
      return setResolvedApiBase(preferred);
    }

    const apiBaseReady = resolveApiBase();

    async function requestWithApiFallback(endpoint, fetchOptions = {}, retryableStatuses = [404, 405, 502, 503, 504]) {
      await apiBaseReady;
      const orderedBases = [API_URL, ...getFallbackApiBases(API_URL)];
      let lastNetworkError = null;

      for (let index = 0; index < orderedBases.length; index += 1) {
        const base = orderedBases[index];
        try {
          const response = await fetch(`${base}${endpoint}`, { ...fetchOptions, cache: "no-store" });
          const canRetry = retryableStatuses.includes(response.status) && index < orderedBases.length - 1;
          if (response.ok || !canRetry) {
            if (base !== API_URL) setResolvedApiBase(base);
            return response;
          }
        } catch (error) {
          lastNetworkError = error;
          if (index >= orderedBases.length - 1) throw error;
        }
      }

      if (lastNetworkError) throw lastNetworkError;
      throw new Error("Sunucuyla bağlantı kurulamadı.");
    }

    const REF_STORAGE_KEY = "pm_pending_referral_code";

    const REWARDS = [
      { label:"2.500 MC", val:2500, color:"rgba(255,255,255,0.14)" },
      { label:"5.000 MC", val:5000, color:"rgba(255,255,255,0.09)" },
      { label:"7.500 MC", val:7500, color:"rgba(255,255,255,0.14)" },
      { label:"12.500 MC", val:12500, color:"rgba(255,255,255,0.09)" },
      { label:"20.000 MC", val:20000, color:"rgba(255,255,255,0.14)" },
      { label:"25.000 MC", val:25000, color:"rgba(255,255,255,0.09)" },
      { label:"30.000 MC", val:30000, color:"rgba(255,255,255,0.14)" },
      { label:"50.000 MC", val:50000, color:"rgba(255,255,255,0.09)" }
    ];

    const AVATARS = [
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

    const GAMES = [
      {
        name: "Crash",
        category: "online",
        access: "auth",
        url: "Online Oyunlar/Crash.html",
        color: "69,162,255",
        icon: "fa-arrow-trend-up",
        desc: "Gerçek para içermeyen, refleks ve zamanlama odaklı hızlı tempo multiplier oyunu.",
        tags: ["Canlı Oyun", "Rekabet", "Hızlı Tur"],
        keywords: "casino crash multiplier online rocket roket çarpan"
      },
      {
        name: "Satranç",
        category: "online",
        access: "auth",
        url: "Online Oyunlar/Satranc.html",
        color: "104,178,255",
        icon: "fa-chess",
        desc: "Klasik satranç deneyimini modern arayüz ve giriş tabanlı rekabet akışıyla oyna.",
        tags: ["PvP", "Strateji", "ELO"],
        keywords: "chess elo mmr online pvp satranç"
      },
      {
        name: "Pişti",
        category: "online",
        access: "auth",
        url: "Online Oyunlar/Pisti.html",
        color: "93,95,254",
        icon: "fa-layer-group",
        desc: "Kart takibi ve tempo yönetimi isteyen online pişti deneyimi.",
        tags: ["Kart", "Online", "Klasik"],
        keywords: "card kart multiplayer online pisti pişti"
      },
      {
        name: "Mines",
        category: "casino",
        access: "auth",
        url: "Casino/Mines.html",
        color: "255,114,140",
        icon: "fa-bomb",
        desc: "Risk yönetimi ve seçim stratejisi üzerine kurulu premium görünüşlü mayın modu.",
        tags: ["Risk", "Seçim", "Premium"],
        keywords: "casino mayın mine mines risk"
      },
      {
        name: "BlackJack",
        category: "casino",
        access: "auth",
        url: "Casino/BlackJack.html",
        color: "255,192,84",
        icon: "fa-crown",
        desc: "21 mantığını ücretsiz, modern ve hızlı arayüzle deneyimle.",
        tags: ["21", "Kart", "Premium"],
        keywords: "21 bj blackjack casino kart"
      },
      {
        name: "Casino Pişti",
        category: "casino",
        access: "auth",
        url: "Casino/Pisti.html",
        color: "177,118,255",
        icon: "fa-clover",
        desc: "Kart oyunu mekaniğini premium casino teması içinde oynayabileceğin sürüm.",
        tags: ["Kart", "Tema", "Hızlı"],
        keywords: "card kart casino pisti pişti"
      },
      {
        name: "Pattern Master",
        category: "classic",
        access: "free",
        url: "Klasik Oyunlar/PatternMaster.html",
        color: "97,220,176",
        icon: "fa-shapes",
        desc: "Dikkat ve görsel hafıza odaklı ücretsiz pattern oyunu.",
        tags: ["Ücretsiz", "Zeka", "Refleks"],
        keywords: "arcade pattern master ücretsiz zeka"
      },
      {
        name: "Space Pro",
        category: "classic",
        access: "free",
        url: "Klasik Oyunlar/SpacePro.html",
        color: "103,170,255",
        icon: "fa-user-astronaut",
        desc: "Tarayıcıda anında açılan hafif ve hızlı klasik arcade uzay oyunu.",
        tags: ["Arcade", "Retro", "Ücretsiz"],
        keywords: "arcade pro space uzay"
      },
      {
        name: "Snake Pro",
        category: "classic",
        access: "free",
        url: "Klasik Oyunlar/SnakePro.html",
        color: "85,214,140",
        icon: "fa-wave-square",
        desc: "Retro hisli, akıcı ve ücretsiz snake deneyimi.",
        tags: ["Retro", "Arcade", "Ücretsiz"],
        keywords: "arcade pro retro snake yılan"
      },
    ];


    const createSocialState = () => ({
      activeTab: "hub",
      selectedKey: "hub:overview",
      directMessages: {},
      unreadDirect: {},
      mobilePanelOpen: false,
      currentActiveDmUid: null,
      directHistoryLoadedAt: {},
      directHistoryPending: {},
      typingTimerId: 0,
      pendingInviteNavigation: null,
      pendingMatchmaking: null,
      matchmakingToastEl: null,
      centerSummary: null,
      centerLoading: false,
      centerError: "",
      partySnapshot: null,
      partyInvites: [],
      partyLoading: false,
      partyError: "",
      dmSettings: {},
      dmSearchQuery: "",
      dmSearchResults: [],
      dmSearchLoading: false,
      dmSearchTargetUid: ""
    });

    const state = {
      currentSheet: null,
      authMode: "login",
      userData: null,
      selectedAvatar: AVATARS[0],
      selectedFrame: (() => {
        const stored = Number(localStorage.getItem("pm_selected_frame"));
        return Number.isFinite(stored) && stored > 0 ? Math.max(1, Math.min(100, Math.round(stored))) : 1;
      })(),
      soundEnabled: localStorage.getItem("pm_ui_sound") !== "off",
      wheelRotation: 0,
      drag: { active:false, startY:0, deltaY:0 },
      activeFilter: "all",
      usernameDebounce: null,
      socket: null,
      socketScriptPromise: null,
      realtimeConnected: false,
      lobbyMessages: [],
      friends: { accepted: [], incoming: [], outgoing: [], counts: { accepted:0, incoming:0, outgoing:0, online:0 } },
      inviteToasts: new Map(),
      social: createSocialState(),
      vipCenter: null,
      vipCatalog: null,
      vipCenterLoading: false,
      monthlyRewardShownKey: ""
    };

        let currentLeaderboardData = null;
    let currentLeaderboardTab = "level";

    const LOBBY_DOM_MESSAGE_LIMIT = 120;
    const PENDING_REWARD_SESSION_KEY = "pm_pending_reward_seen";
    const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
    let activityHeartbeatTimer = 0;
    let activityHeartbeatListenersBound = false;

    function escapeHtml(value){
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "\'":"&#39;" }[char] || char));
    }

    function safeUrl(value){
      const fallback = AVATARS[0];
      if (!value || typeof value !== "string") return fallback;
      const raw = value.trim();
      if (!raw) return fallback;

      if (/^(\/assets\/|assets\/|\.\/assets\/)/i.test(raw)) {
        return raw.startsWith('/') ? raw : `/${raw.replace(/^\.?\//, '')}`;
      }

      try {
        const url = new URL(raw, window.location.origin);
        const isSameOrigin = url.origin === window.location.origin;
        const isAllowedExternal = url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleusercontent.com") || url.hostname === "firebasestorage.googleapis.com" || url.hostname === "playmatrix-b7df9.firebasestorage.app" || url.hostname === "playmatrix.com.tr" || url.hostname === "www.playmatrix.com.tr";
        if (isSameOrigin || isAllowedExternal) return url.href;
      } catch(_) {}
      return fallback;
    }


    async function resolveLoginIdentifier(identifier){
      const raw = String(identifier || "").trim();
      if (!raw) throw new Error("E-posta veya kullanıcı adı zorunlu.");
      if (raw.includes("@")) return raw;
      const response = await fetchPublic("/api/auth/resolve-login", "POST", { identifier: raw });
      if (!response?.email) throw new Error("Hatalı kullanıcı adı veya şifre.");
      return String(response.email).trim();
    }

    async function bootstrapServerSession(){
      if (!auth.currentUser) return null;
      try {
        return await fetchPrivate("/api/auth/session/create", "POST", {});
      } catch (_) {
        return null;
      }
    }

    async function endServerSession(){
      try {
        await fetch(`${API_URL}/api/auth/session/logout`, { method: "POST", cache: "no-store", credentials: "same-origin" });
      } catch (_) {}
    }

    async function forceSecureLogout(reasonMessage = "Oturum süren doldu.") {
      try { await endServerSession(); } catch (_) {}
      try { if (auth.currentUser) await signOut(auth); } catch (_) {}
      stopActivityHeartbeat();
      showToast("Oturum kapatıldı", reasonMessage, "warning");
      closeSheet();
      setTimeout(() => { window.location.hash = "#hero"; }, 50);
      return false;
    }

    async function sendActivityHeartbeat(reason = "active"){
      if (!auth.currentUser) return false;
      try {
        await fetchPrivate("/api/me/activity/heartbeat", "POST", {
          activity: String(reason || "heartbeat").trim() || "heartbeat",
          interactive: ["input", "focus", "visible", "pageshow", "login", "boot", "click", "pointerdown", "mousemove", "keydown", "touchstart"].some((token) => String(reason || "").toLowerCase().includes(token))
        });
        return true;
      } catch (error) {
        const message = String(error?.message || "");
        if (message.includes("Oturum") || message.includes("zaman aşım") || message.includes("Geçersiz token") || message.includes("Geçersiz oturum")) {
          await forceSecureLogout("Güvenlik nedeniyle oturumun kapatıldı. Tekrar giriş yapman gerekiyor.");
          return false;
        }
        return false;
      }
    }

    function stopActivityHeartbeat(){
      if (activityHeartbeatTimer) {
        window.clearInterval(activityHeartbeatTimer);
        activityHeartbeatTimer = 0;
      }
    }

    function startActivityHeartbeat(){
      stopActivityHeartbeat();
      if (!auth.currentUser) return;
      sendActivityHeartbeat("boot").catch(() => null);
      activityHeartbeatTimer = window.setInterval(() => {
        sendActivityHeartbeat(document.visibilityState === "visible" ? "visible" : "idle").catch(() => null);
      }, HEARTBEAT_INTERVAL_MS);

      if (!activityHeartbeatListenersBound) {
        activityHeartbeatListenersBound = true;
        ["visibilitychange", "focus", "pageshow"].forEach((eventName) => {
          window.addEventListener(eventName, () => {
            if (!auth.currentUser) return;
            sendActivityHeartbeat(eventName).catch(() => null);
          }, { passive: true });
        });

        ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
          window.addEventListener(eventName, () => {
            if (!auth.currentUser) return;
            sendActivityHeartbeat(eventName).catch(() => null);
          }, { passive: true });
        });
      }
    }

    // --- SEVİYE (LEVEL) VE 100 ÇERÇEVE SİSTEMİ ---
    function getVipFrameLabel(level = 1){
      return `Seviye ${level} Çerçevesi`;
    }

    function normalizeVipLevel(level = 1){
      return Math.max(1, Math.min(100, Math.round(Number(level) || 1)));
    }

    function calculateLevelFromRp(rp) {
        const safeRp = Math.max(0, Number(rp) || 0);
        const level = Math.floor(Math.sqrt(safeRp / 10)) + 1;
        return normalizeVipLevel(level);
    }

    function getUserLevel(userData) {
        const explicit = Number(userData?.accountLevel ?? userData?.level);
        if (Number.isFinite(explicit) && explicit > 0) return normalizeVipLevel(explicit);
        return calculateLevelFromRp(userData?.rp || 0);
    }

    function getProgressionData(userData = {}) {
      return userData?.progression && typeof userData.progression === 'object' ? userData.progression : {};
    }

    const VIP_LANDING_FALLBACK = Object.freeze({
      label: 'Standart',
      short: 'STD',
      progress: { xpProgressPct: 0, spendProgressPct: 0, combinedPct: 0, nextLabel: 'Classic 1', isMax: false },
      appearance: {
        selectedTheme: { key: 'obsidian', label: 'Obsidyen Pro', badge: 'Profesyonel' },
        selectedNameplate: { key: 'clean', label: 'Clean Plate' },
        selectedBubble: { key: 'default', label: 'Standart Sohbet' },
        selectedBannerPreset: { key: 'none', label: 'Banner Yok' }
      },
      perks: {
        unlocked: [{ label: 'Stabil arayüz koruması' }, { label: 'Çerçeve ve profil vitrini' }],
        nextUnlocks: [{ label: 'Öncelikli destek kuyruğu' }, { label: 'Gelişmiş profil vitrini' }, { label: 'Animasyonlu isim plakası' }]
      },
      overview: { activePerkCount: 2, appearanceUnlockCount: 1, readinessLabel: 'Classic 1 için ilerleme sürüyor', spotlight: 'Temiz ve profesyonel görünüm aktif' }
    });

    function createOptionHtml(items = [], selectedKey = '') {
      return (Array.isArray(items) ? items : []).map((item) => {
        const selected = String(item?.key || '') === String(selectedKey || '') ? ' selected' : '';
        const lockMark = item?.unlocked === false ? ' 🔒' : '';
        return `<option value="${escapeHtml(item?.key || '')}"${selected}>${escapeHtml(item?.label || item?.key || 'Seçenek')}${lockMark}</option>`;
      }).join('');
    }

    function getVipCenterData(source = null) {
      const raw = source && typeof source === 'object'
        ? source
        : (state.vipCenter && typeof state.vipCenter === 'object' ? state.vipCenter : null);
      if (!raw) return VIP_LANDING_FALLBACK;
      return {
        ...VIP_LANDING_FALLBACK,
        ...raw,
        progress: { ...VIP_LANDING_FALLBACK.progress, ...(raw.progress || {}) },
        appearance: { ...VIP_LANDING_FALLBACK.appearance, ...(raw.appearance || {}) },
        perks: { ...VIP_LANDING_FALLBACK.perks, ...(raw.perks || {}) },
        overview: { ...VIP_LANDING_FALLBACK.overview, ...(raw.overview || {}) }
      };
    }

    function renderVipLandingSection(source = null) {
      const data = getVipCenterData(source);
      const hero = $('vipHeroCard');
      const tierEl = $('vipLandingTier');
      const readinessEl = $('vipLandingReadiness');
      const progressFill = $('vipLandingProgressFill');
      const progressText = $('vipLandingProgressText');
      const xpFill = $('vipLandingXpFill');
      const spendFill = $('vipLandingSpendFill');
      const themeEl = $('vipAppearanceTheme');
      const plateEl = $('vipAppearancePlate');
      const bubbleEl = $('vipAppearanceBubble');
      const bannerEl = $('vipAppearanceBanner');
      const spotlightEl = $('vipSpotlightLabel');
      const metricPerk = $('vipMetricPerks');
      const metricCosmetic = $('vipMetricCosmetics');
      const metricNext = $('vipMetricNext');
      const activeList = $('vipLandingPerks');
      const nextList = $('vipLandingNext');

      if (hero) hero.dataset.vipTheme = String(data?.appearance?.selectedTheme?.key || 'obsidian');
      if (tierEl) tierEl.textContent = String(data.label || 'Standart');
      if (readinessEl) readinessEl.textContent = String(data?.overview?.readinessLabel || 'VIP hazırlığı sürüyor');
      if (progressFill) progressFill.style.width = `${Math.max(0, Math.min(100, Number(data?.progress?.combinedPct || 0)))}%`;
      if (progressText) progressText.textContent = `%${Math.max(0, Math.min(100, Number(data?.progress?.combinedPct || 0))).toFixed(0)} · ${String(data?.progress?.nextLabel || 'Bir sonraki kademe')}`;
      if (xpFill) xpFill.style.width = `${Math.max(0, Math.min(100, Number(data?.progress?.xpProgressPct || 0)))}%`;
      if (spendFill) spendFill.style.width = `${Math.max(0, Math.min(100, Number(data?.progress?.spendProgressPct || 0)))}%`;
      if (themeEl) themeEl.textContent = String(data?.appearance?.selectedTheme?.label || 'Obsidyen Pro');
      if (plateEl) plateEl.textContent = String(data?.appearance?.selectedNameplate?.label || 'Clean Plate');
      if (bubbleEl) bubbleEl.textContent = String(data?.appearance?.selectedBubble?.label || 'Standart Sohbet');
      if (bannerEl) bannerEl.textContent = String(data?.appearance?.selectedBannerPreset?.label || 'Banner Yok');
      if (spotlightEl) spotlightEl.textContent = String(data?.overview?.spotlight || 'Profesyonel görünüm aktif');
      if (metricPerk) metricPerk.textContent = String(data?.overview?.activePerkCount || 0);
      if (metricCosmetic) metricCosmetic.textContent = String(data?.overview?.appearanceUnlockCount || 0);
      if (metricNext) metricNext.textContent = String(data?.progress?.nextLabel || '-');

      if (activeList) {
        activeList.innerHTML = '';
        (data?.perks?.unlocked || []).slice(0, 4).forEach((item) => {
          const li = document.createElement('li');
          li.textContent = String(item?.label || 'VIP ayrıcalığı');
          activeList.appendChild(li);
        });
      }
      if (nextList) {
        nextList.innerHTML = '';
        (data?.perks?.nextUnlocks || []).slice(0, 3).forEach((item) => {
          const li = document.createElement('li');
          li.textContent = String(item?.label || 'Yakında açılacak');
          nextList.appendChild(li);
        });
      }
    }

    function getCurrentVipLevel(){
      return getUserLevel(state.userData);
    }

    function getSelectedFrameLevel(){
      const serverFrame = Number(state.userData?.selectedFrame);
      if (Number.isFinite(serverFrame) && serverFrame > 0) {
        return normalizeVipLevel(serverFrame);
      }
      return normalizeVipLevel(state.selectedFrame || localStorage.getItem("pm_selected_frame") || 1);
    }

    function syncSelectedFrameState(preferredFrame = null){
      const rawPreferred = Number(preferredFrame);
      const nextFrame = Number.isFinite(rawPreferred) && rawPreferred > 0
        ? normalizeVipLevel(rawPreferred)
        : getSelectedFrameLevel();

      state.selectedFrame = nextFrame;
      if (state.userData && typeof state.userData === "object") {
        state.userData.selectedFrame = nextFrame;
      }
      try {
        localStorage.setItem("pm_selected_frame", String(nextFrame));
      } catch (_) {}
      return nextFrame;
    }

    function getDisplayFrameLevel(){
      return Math.min(getSelectedFrameLevel(), getCurrentVipLevel());
    }

    function getTopbarAvatarShellId(){
      if ($("topbarAvatarShell")) return "topbarAvatarShell";
      if ($("headerAvatarShell")) return "headerAvatarShell";
      return null;
    }

    function mountTopbarPremiumAvatar(avatarUrl, vipLevel){
      const targetId = getTopbarAvatarShellId();
      if (!targetId) return null;
      const host = $(targetId);
      const sizePx = Math.max(34, Number(host?.clientWidth || host?.offsetWidth || 34));
      return mountPremiumAvatar(targetId, avatarUrl, vipLevel, sizePx, "pm-premium-avatar--topbar pm-premium-avatar--header");
    }

    function setAvatarFrameLevel(target, level){
      const el = typeof target === "string" ? $(target) : target;
      if (!el) return;
      el.className = `avatar-frame frame-lvl-${normalizeVipLevel(level)}`;
    }

    // --- MERKEZİ AVATAR OLUŞTURUCU (100 ÇERÇEVELİ SEVİYE SİSTEMİ) ---
    const FRAME_VISUAL_PROFILES = Object.freeze({
    1: { scale: 1.34, avatar: 0.86 },
    2: { scale: 1.34, avatar: 0.86 },
    3: { scale: 1.34, avatar: 0.86 },
    4: { scale: 1.34, avatar: 0.86 },
    5: { scale: 1.34, avatar: 0.86 },
    6: { scale: 1.34, avatar: 0.86 },
    7: { scale: 1.34, avatar: 0.86 },
    8: { scale: 1.34, avatar: 0.86 },
    9: { scale: 1.34, avatar: 0.86 },
    10: { scale: 1.34, avatar: 0.86 },
    11: { scale: 1.34, avatar: 0.86 },
    12: { scale: 1.34, avatar: 0.86 },
    13: { scale: 1.34, avatar: 0.86 },
    14: { scale: 1.34, avatar: 0.86 },
    15: { scale: 1.34, avatar: 0.86 },
    16: { scale: 1.34, avatar: 0.86 },
    17: { scale: 1.34, avatar: 0.86 },
    18: { scale: 1.34, avatar: 0.86 },
    19: { scale: 1.34, avatar: 0.86 },
    20: { scale: 1.34, avatar: 0.86 },
    21: { scale: 1.34, avatar: 0.86 },
    22: { scale: 1.34, avatar: 0.86 },
    23: { scale: 1.34, avatar: 0.86 },
    24: { scale: 1.34, avatar: 0.86 },
    25: { scale: 1.34, avatar: 0.86 },
    26: { scale: 1.34, avatar: 0.86 },
    27: { scale: 1.34, avatar: 0.86 },
    28: { scale: 1.34, avatar: 0.86 },
    29: { scale: 1.34, avatar: 0.86 },
    30: { scale: 1.34, avatar: 0.86 },
    31: { scale: 1.35, avatar: 0.86 },
    32: { scale: 1.35, avatar: 0.86 },
    33: { scale: 1.35, avatar: 0.86 },
    34: { scale: 1.35, avatar: 0.86 },
    35: { scale: 1.35, avatar: 0.86 },
    36: { scale: 1.35, avatar: 0.86 },
    37: { scale: 1.35, avatar: 0.86 },
    38: { scale: 1.35, avatar: 0.86 },
    39: { scale: 1.35, avatar: 0.86 },
    40: { scale: 1.35, avatar: 0.86 },
    41: { scale: 1.28, avatar: 0.85 },
    42: { scale: 1.28, avatar: 0.85 },
    43: { scale: 1.28, avatar: 0.85 },
    44: { scale: 1.28, avatar: 0.85 },
    45: { scale: 1.28, avatar: 0.85 },
    46: { scale: 1.28, avatar: 0.85 },
    47: { scale: 1.28, avatar: 0.85 },
    48: { scale: 1.28, avatar: 0.85 },
    49: { scale: 1.28, avatar: 0.85 },
    50: { scale: 1.28, avatar: 0.85 },
    51: { scale: 1.34, avatar: 0.86 },
    52: { scale: 1.34, avatar: 0.86 },
    53: { scale: 1.34, avatar: 0.86 },
    54: { scale: 1.34, avatar: 0.86 },
    55: { scale: 1.34, avatar: 0.86 },
    56: { scale: 1.34, avatar: 0.86 },
    57: { scale: 1.34, avatar: 0.86 },
    58: { scale: 1.34, avatar: 0.86 },
    59: { scale: 1.34, avatar: 0.86 },
    60: { scale: 1.34, avatar: 0.86 },
    61: { scale: 1.24, avatar: 0.84 },
    62: { scale: 1.24, avatar: 0.84 },
    63: { scale: 1.24, avatar: 0.84 },
    64: { scale: 1.24, avatar: 0.84 },
    65: { scale: 1.24, avatar: 0.84 },
    66: { scale: 1.24, avatar: 0.84 },
    67: { scale: 1.24, avatar: 0.84 },
    68: { scale: 1.24, avatar: 0.84 },
    69: { scale: 1.24, avatar: 0.84 },
    70: { scale: 1.24, avatar: 0.84 },
    71: { scale: 1.24, avatar: 0.84 },
    72: { scale: 1.24, avatar: 0.84 },
    73: { scale: 1.24, avatar: 0.84 },
    74: { scale: 1.24, avatar: 0.84 },
    75: { scale: 1.24, avatar: 0.84 },
    76: { scale: 1.24, avatar: 0.84 },
    77: { scale: 1.24, avatar: 0.84 },
    78: { scale: 1.24, avatar: 0.84 },
    79: { scale: 1.24, avatar: 0.84 },
    80: { scale: 1.24, avatar: 0.84 },
    81: { scale: 1.28, avatar: 0.84 },
    82: { scale: 1.28, avatar: 0.84 },
    83: { scale: 1.28, avatar: 0.84 },
    84: { scale: 1.28, avatar: 0.84 },
    85: { scale: 1.28, avatar: 0.84 },
    86: { scale: 1.28, avatar: 0.84 },
    87: { scale: 1.28, avatar: 0.84 },
    88: { scale: 1.28, avatar: 0.84 },
    89: { scale: 1.28, avatar: 0.84 },
    90: { scale: 1.28, avatar: 0.84 },
    91: { scale: 1.28, avatar: 0.84 },
    92: { scale: 1.28, avatar: 0.84 },
    93: { scale: 1.24, avatar: 0.84 },
    94: { scale: 1.28, avatar: 0.84 },
    95: { scale: 1.24, avatar: 0.84 },
    96: { scale: 1.28, avatar: 0.84 },
    97: { scale: 1.24, avatar: 0.84 },
    98: { scale: 1.28, avatar: 0.84 },
    99: { scale: 1.24, avatar: 0.84 },
    100: { scale: 1.46, avatar: 0.80, shiftY: '4px' }
  });

    function getFrameAssetIndex(level = 0) {
      const lvl = Number(level) || 0;
      if (lvl <= 0) return 0;
      return Math.max(1, Math.min(100, Math.floor(lvl)));
    }

    function getFrameVisualProfile(frameIndex = 0) {
      return FRAME_VISUAL_PROFILES[Number(frameIndex) || 0] || { scale: 1.30, avatar: 0.86, shiftX: '0px', shiftY: '0px' };
    }

    function buildPremiumAvatar(avatarUrl, userLevel, sizePx = 45, customClass = '') {
        if (window.PMAvatar && typeof window.PMAvatar.buildHTML === 'function') {
          return window.PMAvatar.buildHTML({
            avatarUrl: avatarUrl || AVATARS[0],
            level: userLevel,
            sizePx,
            extraClass: customClass,
            imageClass: 'pm-premium-img',
            wrapperClass: 'pm-premium-avatar',
            alt: 'Oyuncu'
          });
        }

        const lvl = Number(userLevel) || 1;
        const frameIndex = getFrameAssetIndex(lvl);
        const safeAvatar = safeUrl(avatarUrl || AVATARS[0]);
        const visual = getFrameVisualProfile(frameIndex);

        let frameHTML = '';
        if (frameIndex > 0) {
            const primaryFrameUrl = `/Cerceve/frame-${frameIndex}.png`;
            const fallbackFrameUrl = `/Çerçeve/frame-${frameIndex}.png`;
            frameHTML = `<img src="${primaryFrameUrl}" class="pm-frame-image frame-${frameIndex}" data-frame-index="${frameIndex}" data-fallback="${fallbackFrameUrl}" onerror="if(this.dataset.fallback && this.src !== this.dataset.fallback){this.src=this.dataset.fallback;return;} this.style.display='none'">`;
        }

        const styleVars = [
          `width:${sizePx}px`,
          `height:${sizePx}px`,
          `--pm-avatar-fit:${visual.avatar}`,
          `--pm-frame-scale:${visual.scale}`,
          `--pm-frame-shift-x:${visual.shiftX || '0px'}`,
          `--pm-frame-shift-y:${visual.shiftY || '0px'}`
        ].join(';');

        return `
        <div class="pm-premium-avatar ${frameIndex > 0 ? 'has-frame' : ''} ${customClass}" data-pm-avatar="true" data-frame-index="${frameIndex}" style="${styleVars}">
            <img src="${safeAvatar}" alt="Oyuncu" class="pm-premium-img" loading="lazy" decoding="async" draggable="false">
            ${frameHTML}
        </div>
        `;
    }

    function createPremiumAvatarNode(avatarUrl, vipLevel, sizePx = 45, extraClass = "") {
      if (window.PMAvatar && typeof window.PMAvatar.createNode === "function") {
        return window.PMAvatar.createNode({ avatarUrl, level: vipLevel, sizePx, extraClass });
      }
      const template = document.createElement('template');
      template.innerHTML = buildPremiumAvatar(avatarUrl, vipLevel, sizePx, extraClass).trim();
      return template.content.firstElementChild;
    }

        function resolveAvatarVipLevel(entity = null, fallbackRp = 0) {
      if (entity && typeof entity === 'object') {
        const explicitFrame = Number(entity.frame || entity.selectedFrame || entity.level || 0);
        if (explicitFrame > 0) return normalizeVipLevel(explicitFrame);

        const rp = Number(entity.rp || entity.totalRp || entity.seasonRp || fallbackRp || 0);
        return calculateLevelFromRp(rp);
      }
      return calculateLevelFromRp(Number(fallbackRp || 0));
    }

function mountPremiumAvatar(target, avatarUrl, vipLevel, sizePx = 45, extraClass = "") {
  const host = typeof target === 'string' ? $(target) : target;
  if (!host) return null;
  const node = createPremiumAvatarNode(avatarUrl, vipLevel, sizePx, extraClass);
  host.replaceChildren(node);
  return node;
}


    function syncBodyOverlayState(){
      const hasActiveModal = !!document.querySelector('.ps-modal.active');
      document.body.classList.toggle('modal-open', hasActiveModal);
    }

    function openMatrixModal(id){
      const modal = $(id);
      if (!modal) return;
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      syncBodyOverlayState();
    }

    function closeMatrixModal(id){
      const modal = $(id);
      if (!modal) return;
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      syncBodyOverlayState();
    }

    function showMatrixModal(title, message, tone = 'info'){
      const modal = $('matrixInfoModal');
      if (!modal) return;
      const icons = {
        info: 'fa-circle-info',
        warning: 'fa-triangle-exclamation',
        success: 'fa-circle-check',
        error: 'fa-circle-xmark'
      };
      modal.dataset.tone = tone;
      $('matrixInfoTitle').textContent = title || 'Bilgi';
      $('matrixInfoHeading').textContent = title || 'Bilgi';
      $('matrixInfoMessage').textContent = message || '';
      $('matrixInfoIcon').innerHTML = `<i class="fa-solid ${icons[tone] || icons.info}"></i>`;
      openMatrixModal('matrixInfoModal');
    }

    function showMatrixModalHtml(title, html, tone = 'info'){
      const modal = $('matrixInfoModal');
      if (!modal) return;
      const icons = {
        info: 'fa-circle-info',
        warning: 'fa-triangle-exclamation',
        success: 'fa-circle-check',
        error: 'fa-circle-xmark'
      };
      modal.dataset.tone = tone;
      $('matrixInfoTitle').textContent = title || 'Bilgi';
      $('matrixInfoHeading').textContent = title || 'Bilgi';
      $('matrixInfoMessage').innerHTML = html || '';
      $('matrixInfoIcon').innerHTML = `<i class="fa-solid ${icons[tone] || icons.info}"></i>`;
      openMatrixModal('matrixInfoModal');
    }


function getSocialRankMeta(rp = 0) {
  const value = Math.max(0, Number(rp) || 0);
  if (value < 1000) return { name: "BRONZE", className: "rank-bronze", vip: "BRONZE ÇAYLAK" };
  if (value < 3000) return { name: "SILVER", className: "rank-silver", vip: "GÜMÜŞ USTA" };
  if (value < 5000) return { name: "GOLD", className: "rank-gold", vip: "ALTIN LİDER" };
  if (value < 10000) return { name: "PLATINUM", className: "rank-platinum", vip: "PLATİN ŞAMPİYON" };
  if (value < 15000) return { name: "DIAMOND", className: "rank-diamond", vip: "DIAMOND" };
  return { name: "CHAMPION", className: "rank-champion", vip: "CHAMPION" };
}

async function ensureNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch (_) {
    return Notification.permission || "default";
  }
}

async function primeRealtimeUX() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      await ensureNotificationPermission();
    }
  } catch (_) {}
}

function showNativeRealtimeNotification({ title = "PlayMatrix", body = "", tag = "", data = null } = {}) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return null;
    const notification = new Notification(title, {
      body,
      tag,
      silent: false,
      icon: "./apple-touch-icon.png",
      badge: "./apple-touch-icon.png",
      data: data || null
    });
    notification.onclick = () => {
      window.focus();
      const payload = notification.data || {};
      if (payload.type === "dm" && payload.peerUid) {
        if (ensureAuthThen("Sosyal Merkez")) {
          openSocialSheet().then(() => {
            setSocialTab("friends", { preferredKey: `friend:${payload.peerUid}`, openPanel: true });
            selectSocialItem(`friend:${payload.peerUid}`, { openPanel: true });
          }).catch(() => null);
        }
      }
      if (payload.type === "invite") {
        if (ensureAuthThen("Sosyal Merkez")) openSocialSheet().catch(() => null);
      }
      notification.close();
    };
    return notification;
  } catch (_) {
    return null;
  }
}
    async function fetchPrivate(endpoint, method = "GET", body = null) {
      if (!auth.currentUser) throw new Error("Oturum bulunamadı.");
      const token = await getIdToken(auth.currentUser);
      const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
      const options = { method, headers };
      if (body) options.body = JSON.stringify(body);

      let response;
      await apiBaseReady;
      try {
        response = await requestWithApiFallback(endpoint, { ...options, cache: "no-store" });
      } catch {
        throw new Error("Sunucuyla bağlantı kurulamadı.");
      }

      const contentType = response.headers.get("content-type") || "";
      let payload = null;

      if (!response.ok) {
        if (contentType.includes("application/json")) {
          try { payload = await response.json(); } catch(_) {}
          if (response.status === 401 && payload?.redirect) {
            await forceSecureLogout(payload.error || "Oturum süren doldu.");
            throw new Error(payload.error || "Oturum süresi doldu.");
          }
          throw new Error((payload && (payload.error || payload.message)) || `Sunucu hatası. (${response.status})`);
        }
        if (response.status === 401) {
          await forceSecureLogout("Oturum süren doldu.");
          throw new Error("Oturum süresi doldu.");
        }
        throw new Error(`Sunucu hatası. (${response.status})`);
      }

      if (contentType.includes("application/json")) {
        payload = await response.json();
        if (payload && payload.ok === false) throw new Error(payload.error || "İşlem başarısız.");
        return payload;
      }

      throw new Error("Beklenmeyen sunucu yanıtı.");
    }

    async function fetchAPI(endpoint, method = "GET", body = null, options = {}) {
      await apiBaseReady;
      const headers = { Accept: "application/json", ...(options.headers || {}) };
      if (body !== null && body !== undefined) headers["Content-Type"] = "application/json";

      const fetchOptions = {
        method,
        headers,
        cache: "no-store",
        ...options
      };

      if (body !== null && body !== undefined) {
        fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
      }

      let response;
      try {
        response = await requestWithApiFallback(endpoint, fetchOptions);
      } catch (_) {
        throw new Error("Sunucuyla bağlantı kurulamadı.");
      }

      const contentType = response.headers.get("content-type") || "";
      let payload = null;

      if (!response.ok) {
        if (contentType.includes("application/json")) {
          try { payload = await response.json(); } catch (_) {}
          throw new Error((payload && (payload.error || payload.message)) || `Sunucu hatası. (${response.status})`);
        }
        throw new Error(`Sunucu hatası. (${response.status})`);
      }

      if (!contentType.includes("application/json")) {
        throw new Error("Beklenmeyen sunucu yanıtı.");
      }

      payload = await response.json();
      if (payload && payload.ok === false) throw new Error(payload.error || "İşlem başarısız.");
      return payload;
    }


    async function fetchPublic(endpoint, method = "GET", body = null, options = {}) {
      return fetchAPI(endpoint, method, body, { credentials: "omit", ...options });
    }

    function setFieldHelp(id, message = "", tone = "") {
      const element = $(id);
      if (!element) return;
      element.textContent = message;
      element.className = `field-help${tone ? ` is-${tone}` : ""}`;
    }

    function createToastBase({ tone = "info", iconClass = "fa-circle-info", title = "" }) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.dataset.tone = tone;

      const iconWrap = document.createElement("div");
      iconWrap.className = "toast-icon";
      const icon = document.createElement("i");
      icon.className = `fa-solid ${iconClass}`;
      iconWrap.appendChild(icon);

      const body = document.createElement("div");
      body.style.minWidth = "0";

      const titleEl = document.createElement("div");
      titleEl.className = "toast-title";
      titleEl.textContent = title;
      body.appendChild(titleEl);

      const closeBtn = document.createElement("button");
      closeBtn.className = "toast-close";
      closeBtn.setAttribute("aria-label", "Kapat");
      const closeIcon = document.createElement("i");
      closeIcon.className = "fa-solid fa-xmark";
      closeBtn.appendChild(closeIcon);
      closeBtn.addEventListener("click", () => toast.remove());

      toast.append(iconWrap, body, closeBtn);
      return { toast, body, closeBtn, titleEl };
    }

    function appendToast(toast, timeoutMs = 4200) {
      $("toastStack").appendChild(toast);
      if (timeoutMs > 0) window.setTimeout(() => toast.remove(), timeoutMs);
      return toast;
    }

    function loadExternalScript(src) {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
        if (existing && existing.dataset.loaded === "true") {
          resolve();
          return;
        }
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once:true });
          existing.addEventListener("error", () => reject(new Error("Script yüklenemedi.")), { once:true });
          return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.dataset.dynamicSrc = src;
        script.addEventListener("load", () => {
          script.dataset.loaded = "true";
          resolve();
        }, { once:true });
        script.addEventListener("error", () => reject(new Error("Script yüklenemedi.")), { once:true });
        document.head.appendChild(script);
      });
    }

    async function loadSocketClient() {
      await apiBaseReady;
      if (typeof window.io === "function") return window.io;
      if (!state.socketScriptPromise) {
        state.socketScriptPromise = loadExternalScript(`${API_URL}/socket.io/socket.io.js`);
      }
      await state.socketScriptPromise;
      if (typeof window.io !== "function") throw new Error("Socket istemcisi hazır değil.");
      return window.io;
    }

    function formatClockTime(ts) {
      try {
        return new Date(Number(ts) || Date.now()).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      } catch (_) {
        return "--:--";
      }
    }


    function updateSocialConnectionBadge(extraText = "") {
      const badge = $("psConnectionBadge");
      if (!badge) return;
      const text = extraText || (state.realtimeConnected ? "Bağlı" : "Bağlantı kuruluyor");
      badge.textContent = text;
      badge.classList.toggle("is-offline", !state.realtimeConnected);
    }

    function isSocialMobile() {
      return window.matchMedia("(max-width: 900px)").matches;
    }

    function disconnectRealtime() {
      clearDirectTypingState(false);
      if (state.socket) {
        state.socket.removeAllListeners();
        state.socket.disconnect();
        state.socket = null;
      }
      state.realtimeConnected = false;
      updateSocialConnectionBadge();
    }

    function resetSocialState() {
      dismissMatchmakingToast();
      state.social = createSocialState();
    }

    async function loadSocialCenterSummary(force = false) {
      if (!auth.currentUser) return null;
      if (state.social.centerLoading && !force) return state.social.centerSummary;
      if (!force && state.social.centerSummary) return state.social.centerSummary;
      state.social.centerLoading = true;
      state.social.centerError = "";
      try {
        const payload = await fetchPrivate("/api/social-center/summary");
        state.social.centerSummary = payload || null;
        state.vipCenter = payload?.vipCenter || state.vipCenter;
        if (payload?.vipCenter) renderVipLandingSection(payload.vipCenter);
        return state.social.centerSummary;
      } catch (error) {
        state.social.centerError = error.message || "Sosyal merkez özeti yüklenemedi.";
        return null;
      } finally {
        state.social.centerLoading = false;
        if (state.currentSheet === "social") renderSocialHub();
      }
    }

    async function loadVipCenter(force = false) {
      if (!auth.currentUser) {
        state.vipCenter = null;
        state.vipCatalog = null;
        renderVipLandingSection(null);
        return null;
      }
      if (state.vipCenterLoading && !force) return state.vipCenter;
      if (!force && state.vipCenter) return state.vipCenter;
      state.vipCenterLoading = true;
      try {
        const payload = await fetchPrivate('/api/vip/center');
        state.vipCenter = payload?.vipCenter || null;
        state.vipCatalog = payload?.catalog || null;
        renderVipLandingSection(state.vipCenter);
        return state.vipCenter;
      } catch (_) {
        renderVipLandingSection(null);
        return null;
      } finally {
        state.vipCenterLoading = false;
      }
    }

    async function loadPartySnapshot(force = false) {
      if (!auth.currentUser) return null;
      if (state.social.partyLoading && !force) return state.social.partySnapshot;
      if (!force && (state.social.partySnapshot || state.social.partyInvites.length)) return state.social.partySnapshot;
      state.social.partyLoading = true;
      state.social.partyError = "";
      try {
        const payload = await fetchPrivate("/api/party/me");
        state.social.partySnapshot = payload?.party || null;
        state.social.partyInvites = Array.isArray(payload?.incomingInvites) ? payload.incomingInvites : [];
        return state.social.partySnapshot;
      } catch (error) {
        state.social.partyError = error.message || "Parti bilgisi yüklenemedi.";
        return null;
      } finally {
        state.social.partyLoading = false;
        if (state.currentSheet === "social") renderSocialHub();
      }
    }

    async function refreshSocialFeaturePack(force = false) {
      await Promise.allSettled([
        loadSocialCenterSummary(force),
        loadPartySnapshot(force)
      ]);
    }

    async function loadDmSettings(targetUid = "") {
      const safeTargetUid = String(targetUid || "").trim();
      if (!safeTargetUid || !auth.currentUser) return null;
      if (state.social.dmSettings[safeTargetUid]) return state.social.dmSettings[safeTargetUid];
      try {
        const payload = await fetchPrivate(`/api/chat/settings?targetUid=${encodeURIComponent(safeTargetUid)}`);
        state.social.dmSettings[safeTargetUid] = payload || { mine: {}, theirs: {} };
        if (state.currentSheet === "social") renderSocialHub();
        return state.social.dmSettings[safeTargetUid];
      } catch (_) {
        return null;
      }
    }

    async function searchDirectMessages(query = "", targetUid = "") {
      const q = String(query || "").trim();
      state.social.dmSearchQuery = q;
      state.social.dmSearchTargetUid = String(targetUid || "").trim();
      if (q.length < 2) {
        state.social.dmSearchResults = [];
        if (state.currentSheet === "social") renderSocialHub();
        return [];
      }
      state.social.dmSearchLoading = true;
      try {
        const suffix = state.social.dmSearchTargetUid ? `&targetUid=${encodeURIComponent(state.social.dmSearchTargetUid)}` : "";
        const payload = await fetchPrivate(`/api/chat/direct/search?q=${encodeURIComponent(q)}${suffix}`);
        state.social.dmSearchResults = Array.isArray(payload?.items) ? payload.items : [];
        return state.social.dmSearchResults;
      } catch (error) {
        showToast("Mesaj arama", error.message || "Arama yapılamadı.", "error");
        state.social.dmSearchResults = [];
        return [];
      } finally {
        state.social.dmSearchLoading = false;
        if (state.currentSheet === "social") renderSocialHub();
      }
    }

    async function saveShowcaseProfile(payload = {}) {
      try {
        const result = await fetchPrivate("/api/me/showcase", "POST", payload);
        if (state.social.centerSummary?.me) {
          state.social.centerSummary.me.showcase = {
            title: result?.showcase?.showcaseTitle || payload.title || "",
            bio: result?.showcase?.showcaseBio || payload.bio || "",
            favoriteGame: result?.showcase?.favoriteGame || payload.favoriteGame || "",
            selectedBadge: result?.showcase?.selectedBadge || payload.selectedBadge || "",
            profileBanner: result?.showcase?.profileBanner || payload.profileBanner || "",
            vipTheme: result?.showcase?.vipTheme || payload.vipTheme || "obsidian",
            vipNameplate: result?.showcase?.vipNameplate || payload.vipNameplate || "clean",
            vipBubble: result?.showcase?.vipBubble || payload.vipBubble || "default",
            vipBannerPreset: result?.showcase?.vipBannerPreset || payload.vipBannerPreset || "none"
          };
        }
        showToast("Profil vitrini", "Vitrin kaydedildi.", "success");
        await Promise.allSettled([loadSocialCenterSummary(true), loadVipCenter(true)]);
      } catch (error) {
        showToast("Profil vitrini", error.message || "Kaydedilemedi.", "error");
      }
    }

    async function claimActivityPassReward(level) {
      try {
        const payload = await fetchPrivate("/api/activity-pass/claim", "POST", { level });
        showToast("Activity Pass", `${payload?.rewardMc || 0} MC hesabına eklendi.`, "success");
        await Promise.allSettled([loadSocialCenterSummary(true), loadVipCenter(true)]);
        if (typeof loadUserData === "function") loadUserData().catch(() => null);
      } catch (error) {
        showToast("Activity Pass", error.message || "Ödül alınamadı.", "error");
      }
    }

    async function handleDmRelationAction(action, targetUid) {
      const safeTargetUid = String(targetUid || "").trim();
      if (!safeTargetUid) return;
      const endpointMap = {
        archive: "/api/chat/direct/archive",
        unarchive: "/api/chat/direct/unarchive",
        mute: "/api/chat/mute",
        unmute: "/api/chat/unmute",
        block: "/api/chat/block",
        unblock: "/api/chat/unblock"
      };
      const endpoint = endpointMap[action];
      if (!endpoint) return;
      try {
        await fetchPrivate(endpoint, "POST", { targetUid: safeTargetUid });
        delete state.social.dmSettings[safeTargetUid];
        await loadDmSettings(safeTargetUid);
        if (action === "archive" || action === "unarchive") await loadFriends();
        showToast("Sohbet ayarı", "Sohbet ayarı güncellendi.", "success");
      } catch (error) {
        showToast("Sohbet ayarı", error.message || "İşlem başarısız.", "error");
      }
    }

    async function ensureParty() {
      try {
        const payload = await fetchPrivate("/api/party/create", "POST", {});
        state.social.partySnapshot = payload?.party || null;
        showToast("Parti Merkezi", "Partin hazırlandı.", "success");
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Merkezi", error.message || "Parti oluşturulamadı.", "error");
      }
    }

    async function inviteFriendToParty(targetUid = "") {
      try {
        await ensureParty();
        await fetchPrivate("/api/party/invite", "POST", { targetUid });
        showToast("Parti Daveti", "Parti daveti gönderildi.", "success");
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Daveti", error.message || "Parti daveti gönderilemedi.", "error");
      }
    }

    async function respondPartyInvite(inviteId = "", action = "decline") {
      try {
        await fetchPrivate("/api/party/respond", "POST", { inviteId, action });
        showToast("Parti Merkezi", action === "accept" ? "Partiye katıldın." : "Davet reddedildi.", action === "accept" ? "success" : "info");
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Merkezi", error.message || "Davet işlenemedi.", "error");
      }
    }

    async function leaveParty() {
      try {
        await fetchPrivate("/api/party/leave", "POST", {});
        showToast("Parti Merkezi", "Partiden ayrıldın.", "success");
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Merkezi", error.message || "Partiden ayrılamadın.", "error");
      }
    }

    async function setPartyReady(ready = false) {
      try {
        await fetchPrivate("/api/party/ready", "POST", { ready: !!ready });
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Merkezi", error.message || "Hazır durumu güncellenemedi.", "error");
      }
    }

    async function setPartyContext(gameType = "") {
      try {
        await fetchPrivate("/api/party/context", "POST", { gameType });
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Merkezi", error.message || "Parti hedefi güncellenemedi.", "error");
      }
    }

    async function promotePartyMember(targetUid = "") {
      try {
        await fetchPrivate("/api/party/promote", "POST", { targetUid });
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Merkezi", error.message || "Lider devri başarısız.", "error");
      }
    }

    async function kickPartyMember(targetUid = "") {
      try {
        await fetchPrivate("/api/party/kick", "POST", { targetUid });
        await loadPartySnapshot(true);
      } catch (error) {
        showToast("Parti Merkezi", error.message || "Oyuncu çıkarılamadı.", "error");
      }
    }

    function getSocialListItems(tab = state.social.activeTab) {
      if (tab === "hub") {
        return [{ key: "hub:overview", type: "hub", title: "Sosyal Merkez+", subtitle: "Parti, vitrin, Activity Pass ve son hareketler" }];
      }
      if (tab === "friends") {
        return (state.friends.accepted || []).map((entry) => ({ key: `friend:${entry.uid}`, type: "friend", ...entry, unread: Number(state.social.unreadDirect?.[entry.uid] || 0) }));
      }
      if (tab === "party") {
        const baseItems = [{ key: "party:overview", type: "party", title: "Aktif Parti", subtitle: state.social.partySnapshot ? "Üyeler, hazır durumu ve hedef oyun" : "Henüz aktif parti yok" }];
        const inviteItems = (state.social.partyInvites || []).map((entry) => ({ key: `party-invite:${entry.id}`, type: "party-invite", title: entry?.fromMember?.username || "Parti Daveti", avatar: entry?.fromMember?.avatar || AVATARS[0], selectedFrame: entry?.fromMember?.selectedFrame || 0, inviteId: entry.id, ...entry }));
        return [...baseItems, ...inviteItems];
      }
      if (tab === "search") {
        return [{ key: "search:dm", type: "search", title: "Mesaj Ara", subtitle: "Özel mesajlar içinde arama yap" }];
      }
      if (tab === "invites") {
        return (state.friends.accepted || []).map((entry) => ({ key: `invite:${entry.uid}`, type: "invite", ...entry }));
      }
      if (tab === "requests") {
        const incoming = (state.friends.incoming || []).map((entry) => ({ key: `request:${entry.friendshipId}`, type: "request", direction: "incoming", ...entry }));
        const outgoing = (state.friends.outgoing || []).map((entry) => ({ key: `request:${entry.friendshipId}`, type: "request", direction: "outgoing", ...entry }));
        return [...incoming, ...outgoing].sort((a, b) => (b.updatedAt || b.requestedAt || 0) - (a.updatedAt || a.requestedAt || 0));
      }
      if (tab === "add") {
        return [{ key: "add:manual", type: "add", title: "Kullanıcı adına göre ekle", subtitle: "Tam kullanıcı adıyla yeni bağlantı kur" }];
      }
      return [{ key: "global:lobby", type: "global", title: "Yerel (TR) Lobisi", subtitle: "Tüm çevrimiçi oyuncuların ortak akışı", totalMessages: state.lobbyMessages.length }];
    }

    function getSocialHeaderText(tab = state.social.activeTab) {
      if (tab === "hub") return "Sosyal Merkez+";
      if (tab === "friends") return `Arkadaşlar · ${state.friends.counts.accepted || 0}`;
      if (tab === "party") return `Parti Merkezi · ${state.social.partySnapshot?.members?.length || 0}`;
      if (tab === "search") return "Mesaj Arama";
      if (tab === "invites") return `Davet Et · ${state.friends.counts.accepted || 0}`;
      if (tab === "requests") return `İstekler · ${(state.friends.counts.incoming || 0) + (state.friends.counts.outgoing || 0)}`;
      if (tab === "add") return "Yeni bağlantı";
      return "Lobi Kanalları";
    }

    function ensureSocialSelection(preferredKey = "") {
      const items = getSocialListItems(state.social.activeTab);
      if (preferredKey) state.social.selectedKey = preferredKey;
      if (!items.some((item) => item.key === state.social.selectedKey)) {
        state.social.selectedKey = items[0]?.key || "";
      }
      return items.find((item) => item.key === state.social.selectedKey) || null;
    }

    function getSelectedSocialEntry() {
      return ensureSocialSelection();
    }

    function setSocialTab(tab, options = {}) {
      const safeTab = ["hub", "global", "friends", "party", "search", "requests", "add", "invites"].includes(tab) ? tab : "hub";
      const leavingFriends = state.social.activeTab === "friends" && safeTab !== "friends";
      if (leavingFriends) {
        clearDirectTypingState(true);
        state.social.currentActiveDmUid = null;
      }
      state.social.activeTab = safeTab;
      if (options.resetSelection) state.social.selectedKey = "";
      const entry = ensureSocialSelection(options.preferredKey || "");
      if (safeTab === "friends" && entry?.uid) {
        state.social.currentActiveDmUid = entry.uid;
        loadDirectHistoryForPeer(entry.uid);
      } else if (safeTab !== "friends") {
        updateTypingIndicator("", false);
      }
      if (safeTab === "hub") loadSocialCenterSummary().catch(() => null);
      if (safeTab === "party") loadPartySnapshot().catch(() => null);
      if (isSocialMobile()) {
        state.social.mobilePanelOpen = !!options.openPanel;
      }
      renderSocialHub();
    }

    function selectSocialItem(key, options = {}) {
      state.social.selectedKey = key || "";
      const entry = ensureSocialSelection();
      const nextDmUid = entry?.type === "friend" ? entry.uid : null;

      if (state.social.currentActiveDmUid && state.social.currentActiveDmUid !== nextDmUid) {
        clearDirectTypingState(true);
      }

      state.social.currentActiveDmUid = nextDmUid;
      if (nextDmUid) {
        state.social.unreadDirect[nextDmUid] = 0;
        loadDirectHistoryForPeer(nextDmUid);
      } else {
        updateTypingIndicator("", false);
      }

      if (isSocialMobile()) state.social.mobilePanelOpen = options.openPanel !== false;
      renderSocialHub();
    }

    function updateFriendPresence(uid, nextPresence) {
      ["accepted", "incoming", "outgoing"].forEach((bucket) => {
        state.friends[bucket] = (state.friends[bucket] || []).map((entry) => {
          if (entry.uid !== uid) return entry;
          const presence = typeof nextPresence === "boolean"
            ? normalizePresenceState({ status: nextPresence ? "IDLE" : "OFFLINE", activity: nextPresence ? "Lobide" : "" }, nextPresence)
            : normalizePresenceState(nextPresence, entry.online);
          return { ...entry, online: presence.online, presence };
        });
      });
      state.friends.counts.online = (state.friends.accepted || []).filter((item) => item.online).length;
      if (state.currentSheet === "social") renderSocialHub();
    }

    function getFriendMetaByUid(uid = "") {
      return (state.friends.accepted || []).find((entry) => entry.uid === uid) || null;
    }

    function getDirectConversation(peerUid = "") {
      return Array.isArray(state.social.directMessages[peerUid])
        ? [...state.social.directMessages[peerUid]].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        : [];
    }

    function normalizeDirectMessagePayload(payload, forcedPeerUid = "") {
      if (!payload) return null;
      const selfUid = auth.currentUser?.uid || "";
      const senderUid = String(payload.fromUid || payload.senderUid || payload.sender || "").trim();
      const rawTargetUid = String(payload.targetUid || payload.toUid || payload.peerUid || "").trim();
      const peerUid = forcedPeerUid || (senderUid && senderUid !== selfUid ? senderUid : rawTargetUid);
      const messageText = String(payload.message ?? payload.text ?? "").trim();
      const createdAt = Number(payload.createdAt || payload.timestamp || Date.now());
      const friendMeta = getFriendMetaByUid(peerUid);
      const username = payload.username || payload.senderName || (senderUid === selfUid ? (state.userData?.username || "Sen") : (friendMeta?.username || "Oyuncu"));
      const avatar = payload.avatar || payload.senderAvatar || (senderUid === selfUid ? state.userData?.avatar : friendMeta?.avatar) || AVATARS[0];
      if (!peerUid || !messageText) return null;

      return {
        id: String(payload.id || payload.messageId || `${senderUid || peerUid}_${createdAt}_${messageText.slice(0, 12)}`),
        chatId: String(payload.chatId || ""),
        clientTempId: String(payload.clientTempId || ""),
        fromUid: senderUid || selfUid,
        senderUid: senderUid || selfUid,
        sender: senderUid || selfUid,
        targetUid: rawTargetUid || (senderUid === selfUid ? peerUid : selfUid),
        toUid: rawTargetUid || (senderUid === selfUid ? peerUid : selfUid),
        username,
        avatar,
        message: messageText,
        text: messageText,
        createdAt,
        timestamp: createdAt,
        status: String(payload.status || "sent")
      };
    }

    function rememberDirectMessage(payload, forcedPeerUid = "") {
      const normalized = normalizeDirectMessagePayload(payload, forcedPeerUid);
      if (!normalized) return { peerUid: null, inserted: false, message: null };

      const selfUid = auth.currentUser?.uid || "";
      const peerUid = forcedPeerUid || (normalized.fromUid === selfUid ? normalized.targetUid : normalized.fromUid);
      const current = Array.isArray(state.social.directMessages[peerUid]) ? [...state.social.directMessages[peerUid]] : [];
      const exists = current.some((item) => item.id === normalized.id || (normalized.clientTempId && item.clientTempId && item.clientTempId === normalized.clientTempId));

      if (!exists) {
        current.push(normalized);
        current.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      }

      state.social.directMessages[peerUid] = current.slice(-80);
      return { peerUid, inserted: !exists, message: normalized };
    }

    function updateTypingIndicator(peerUid = "", isTyping = false) {
      const indicator = $("typingIndicator");
      const label = $("typingIndicatorLabel");
      if (!indicator || !label) return;

      const shouldShow = !!isTyping && !!peerUid && state.social.activeTab === "friends" && state.social.currentActiveDmUid === peerUid;
      if (!shouldShow) {
        indicator.classList.remove("is-visible");
        label.textContent = "";
        return;
      }

      const friend = getFriendMetaByUid(peerUid);
      label.textContent = `${friend?.username || "Arkadaşın"} yazıyor`;
      indicator.classList.add("is-visible");
    }

    function clearDirectTypingState(notifyPeer = false) {
      if (state.social.typingTimerId) {
        window.clearTimeout(state.social.typingTimerId);
        state.social.typingTimerId = 0;
      }
      if (notifyPeer && state.socket?.connected && state.social.currentActiveDmUid) {
        state.socket.emit("chat:typing", { toUid: state.social.currentActiveDmUid, isTyping: false });
      }
      updateTypingIndicator("", false);
    }

    function handleDirectTypingActivity() {
      if (state.social.activeTab !== "friends" || !state.social.currentActiveDmUid || !state.socket?.connected) return;
      const input = $("psChatInput");
      const value = (input?.value || "").trim();

      if (!value) {
        clearDirectTypingState(true);
        return;
      }

      state.socket.emit("chat:typing", { toUid: state.social.currentActiveDmUid, isTyping: true });
      if (state.social.typingTimerId) window.clearTimeout(state.social.typingTimerId);
      state.social.typingTimerId = window.setTimeout(() => {
        if (state.socket?.connected && state.social.currentActiveDmUid) {
          state.socket.emit("chat:typing", { toUid: state.social.currentActiveDmUid, isTyping: false });
        }
        state.social.typingTimerId = 0;
      }, 2000);
    }

    function loadDirectHistoryForPeer(peerUid, options = {}) {
      if (!peerUid || !state.socket?.connected) return;
      if (state.social.directHistoryPending[peerUid]) return;
      if (!options.force && state.social.directHistoryLoadedAt[peerUid]) return;
      state.social.directHistoryPending[peerUid] = true;
      state.socket.emit("chat:dm_load_history", { targetUid: peerUid });
    }

    function resolveInviteTargetHref(payload = {}) {
      const roomId = encodeURIComponent(payload.roomId || "");
      const gameKey = payload.gameKey || payload.gameCode || "";
      const gamePath = payload.gamePath || (gameKey === "chess" ? "./Online Oyunlar/Satranc.html" : "./Online Oyunlar/Pisti.html");
      return `${gamePath}?joinRoom=${roomId}`;
    }

    let inviteNavigationLock = false;
    let inviteNavigationResetTimer = 0;

    function navigateToInviteRoom(payload = {}) {
      const roomId = String(payload?.roomId || "").trim();
      const gameKey = String(payload?.gameKey || payload?.gameCode || "").trim().toLowerCase();
      if (!roomId) return false;
      if (inviteNavigationLock) {
        const queuedRoomId = String(sessionStorage.getItem("pm_auto_join_room") || "").trim();
        return queuedRoomId === roomId;
      }

      const href = resolveInviteTargetHref({ ...payload, roomId, gameKey });
      if (!href) return false;

      inviteNavigationLock = true;
      if (inviteNavigationResetTimer) window.clearTimeout(inviteNavigationResetTimer);
      sessionStorage.setItem("pm_auto_join_room", roomId);
      sessionStorage.setItem("pm_auto_join_game", gameKey || payload.gameKey || payload.gameCode || "");
      sessionStorage.setItem("pm_auto_join_at", String(Date.now()));
      inviteNavigationResetTimer = window.setTimeout(() => {
        inviteNavigationLock = false;
        inviteNavigationResetTimer = 0;
      }, 1800);
      window.location.replace(href);
      return true;
    }

    window.addEventListener("pagehide", () => {
      inviteNavigationLock = false;
      if (inviteNavigationResetTimer) {
        window.clearTimeout(inviteNavigationResetTimer);
        inviteNavigationResetTimer = 0;
      }
    });

    function buildSocialEmptyState(title, message) {
      const box = document.createElement("div");
      box.className = "ps-empty-state";

      const titleEl = document.createElement("strong");
      titleEl.textContent = title;

      const messageEl = document.createElement("div");
      messageEl.textContent = message;

      box.append(titleEl, messageEl);
      return box;
    }

    function createMiniTag(text, extraClass = "") {
      const tag = document.createElement("span");
      tag.className = `ps-mini-tag${extraClass ? ` ${extraClass}` : ""}`;
      tag.textContent = text;
      return tag;
    }

    function normalizePresenceState(presence = null, fallbackOnline = false) {
      const online = typeof presence?.online === "boolean" ? presence.online : !!fallbackOnline;
      const rawStatus = String(presence?.status || (online ? "IDLE" : "OFFLINE")).trim().toUpperCase();
      const status = ["IDLE", "MATCHMAKING", "IN_GAME", "OFFLINE"].includes(rawStatus) ? rawStatus : (online ? "IDLE" : "OFFLINE");
      const fallbackActivity = status === "IN_GAME"
        ? "Oyunda"
        : status === "MATCHMAKING"
          ? "Eşleşme Aranıyor..."
          : status === "OFFLINE"
            ? "Çevrimdışı"
            : "Lobide";

      return {
        status,
        activity: String(presence?.activity || fallbackActivity).trim() || fallbackActivity,
        online
      };
    }

    function getPresenceMeta(source = null) {
      const presence = normalizePresenceState(source?.presence || source || null, !!source?.online);
      if (presence.status === "IN_GAME") {
        return { ...presence, dotClass: "is-busy", labelClass: "is-busy", shortLabel: "Oyunda", canInvite: true };
      }
      if (presence.status === "MATCHMAKING") {
        return { ...presence, dotClass: "is-matchmaking", labelClass: "is-matchmaking", shortLabel: "Sırada", canInvite: true };
      }
      if (presence.status === "OFFLINE") {
        return { ...presence, dotClass: "is-offline", labelClass: "is-offline", shortLabel: "Pasif", canInvite: false };
      }
      return { ...presence, dotClass: "is-online", labelClass: "is-online", shortLabel: "Aktif", canInvite: true };
    }

    function hydrateFriendEntry(entry = {}) {
      const online = !!entry.online;
      const presence = normalizePresenceState(entry.presence, online);
      return { ...entry, online: presence.online, presence };
    }

    function updateMatchmakingToastMessage(message = "Uygun bir rakip aranıyor...") {
      const toast = state.social.matchmakingToastEl;
      const el = toast?.querySelector?.("[data-matchmake-message]");
      if (el) el.textContent = message;
    }

    function dismissMatchmakingToast() {
      if (state.social?.matchmakingToastEl?.remove) state.social.matchmakingToastEl.remove();
      if (state.social) state.social.matchmakingToastEl = null;
    }

    function getMatchmakingPagePath(gameType = "") {
      return gameType === "chess" ? "./Online Oyunlar/Satranc.html" : "./Online Oyunlar/Pisti.html";
    }

    function showMatchmakingToast(gameType = "") {
      dismissMatchmakingToast();
      const title = gameType === "chess" ? "Satranç Eşleşmesi" : "Pişti Eşleşmesi";
      const { toast, body, closeBtn } = createToastBase({
        tone: "info",
        iconClass: "fa-bolt",
        title: `${title} aranıyor`
      });

      closeBtn.addEventListener("click", () => cancelMatchmaking(gameType));

      const message = document.createElement("div");
      message.className = "toast-message";
      message.dataset.matchmakeMessage = "true";
      message.textContent = "Uygun bir rakip aranıyor...";

      const actions = document.createElement("div");
      actions.className = "invite-toast-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "ghost-btn";
      cancelBtn.type = "button";
      cancelBtn.textContent = "İptal Et";
      cancelBtn.addEventListener("click", () => cancelMatchmaking(gameType));

      actions.appendChild(cancelBtn);
      body.append(message, actions);
      state.social.matchmakingToastEl = toast;
      appendToast(toast, 0);
      return toast;
    }

    async function startMatchmaking(gameType, options = {}) {
      try {
        if (!ensureAuthThen("Hızlı Eşleşme")) return;
        const safeGameType = gameType === "chess" ? "chess" : gameType === "pisti" ? "pisti" : "";
        if (!safeGameType) throw new Error("Geçersiz oyun türü.");

        const socket = await ensureRealtimeConnection();
        if (!socket) throw new Error("Canlı bağlantı kurulamadı.");

        const payload = { gameType: safeGameType };
        if (safeGameType === "pisti") {
          const requestedBet = Number(options.bet);
          payload.mode = ["2-52", "2-104"].includes(String(options.mode || "2-52")) ? String(options.mode) : "2-52";
          payload.bet = Number.isFinite(requestedBet) && requestedBet > 0 ? Math.floor(requestedBet) : 1000;
        }

        state.social.pendingMatchmaking = {
          gameType: safeGameType,
          mode: payload.mode || "",
          bet: payload.bet || 0,
          startedAt: Date.now()
        };

        showMatchmakingToast(safeGameType);
        socket.emit("game:matchmake_join", payload);
      } catch (error) {
        dismissMatchmakingToast();
        state.social.pendingMatchmaking = null;
        showToast("Eşleşme hatası", error.message || "Hızlı eşleşme başlatılamadı.", "error");
      }
    }

    function cancelMatchmaking(gameType = "") {
      const activeGameType = gameType || state.social.pendingMatchmaking?.gameType || "";
      dismissMatchmakingToast();

      if (state.socket?.connected && activeGameType) {
        state.socket.emit("game:matchmake_leave", { gameType: activeGameType });
      }

      if (state.social.pendingMatchmaking) {
        state.social.pendingMatchmaking = null;
        showToast("Eşleşme iptal edildi", "Hızlı eşleşme araması durduruldu.", "info");
      }
    }

    window.startMatchmaking = startMatchmaking;
    window.cancelMatchmaking = cancelMatchmaking;

    function createSocialListItem(item, isActive) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ps-list-item${isActive ? " is-active" : ""}`;
      button.dataset.socialKey = item.key;
      button.addEventListener("click", () => selectSocialItem(item.key));

      let visual = null;
      if (["friend", "request", "invite", "party-invite"].includes(item.type)) {
        visual = document.createElement("div");
        visual.className = "ps-list-avatar";
        visual.appendChild(createPremiumAvatarNode(item.avatar || AVATARS[0], resolveAvatarVipLevel(item, 0), 42, "pm-premium-avatar--social-list"));
      } else {
        visual = document.createElement("div");
        visual.className = "ps-list-icon";
        const icon = document.createElement("i");
        const iconMap = {
          add: "fa-user-plus",
          search: "fa-magnifying-glass",
          party: "fa-user-group",
          hub: "fa-grid-2",
          global: "fa-earth-europe"
        };
        icon.className = `fa-solid ${iconMap[item.type] || "fa-earth-europe"}`;
        visual.appendChild(icon);
      }

      const copy = document.createElement("div");
      copy.className = "ps-list-copy";

      const title = document.createElement("div");
      title.className = "ps-list-title";
      title.textContent = item.title || item.username || "Sosyal öğe";

      const sub = document.createElement("div");
      sub.className = "ps-list-sub";

      if (item.type === "friend") {
        const presenceMeta = getPresenceMeta(item);
        const dot = document.createElement("span");
        dot.className = `ps-presence ${presenceMeta.dotClass}`.trim();
        const text = document.createElement("span");
        text.className = `ps-presence-label ${presenceMeta.labelClass}`.trim();
        text.textContent = presenceMeta.activity;
        sub.append(dot, text);
      } else if (item.type === "invite") {
        const presenceMeta = getPresenceMeta(item);
        const text = document.createElement("span");
        text.className = `ps-presence-label ${presenceMeta.labelClass}`.trim();
        text.textContent = presenceMeta.canInvite ? "Davet gönderilebilir" : presenceMeta.activity;
        sub.appendChild(text);
      } else if (item.type === "request") {
        const text = document.createElement("span");
        text.textContent = item.direction === "incoming" ? "Seni eklemek istiyor" : "Onay bekleniyor";
        sub.appendChild(text);
      } else if (item.type === "party-invite") {
        const text = document.createElement("span");
        text.textContent = `${item?.fromMember?.username || item.title || "Parti daveti"} seni partiye çağırıyor`;
        sub.appendChild(text);
      } else if (item.type === "add") {
        const text = document.createElement("span");
        text.textContent = item.subtitle || "Yeni arkadaşlık isteği oluştur";
        sub.appendChild(text);
      } else {
        const text = document.createElement("span");
        text.textContent = item.subtitle || "Gerçek zamanlı ortak akış";
        sub.appendChild(text);
      }

      copy.append(title, sub);

      const trailing = document.createElement("div");
      trailing.className = "ps-list-trailing";

      if (item.type === "friend") {
        const presenceMeta = getPresenceMeta(item);
        trailing.appendChild(createMiniTag(presenceMeta.shortLabel));
        const unread = Number(item.unread || 0);
        if (unread > 0) {
          const badge = document.createElement("span");
          badge.className = "ps-unread-badge";
          badge.textContent = unread > 99 ? "99+" : String(unread);
          trailing.appendChild(badge);
        }
      } else if (item.type === "invite") {
        const badge = document.createElement("span");
        badge.className = "ps-request-chip is-outgoing";
        badge.textContent = "Seç";
        trailing.appendChild(badge);
      } else if (item.type === "party-invite") {
        const badge = document.createElement("span");
        badge.className = "ps-request-chip is-incoming";
        badge.textContent = "Parti";
        trailing.appendChild(badge);
      } else if (item.type === "request") {
        const badge = document.createElement("span");
        badge.className = `ps-request-chip ${item.direction === "incoming" ? "is-incoming" : "is-outgoing"}`;
        badge.textContent = item.direction === "incoming" ? "Gelen" : "Giden";
        trailing.appendChild(badge);
      } else if (item.type === "global") {
        trailing.appendChild(createMiniTag(`${item.totalMessages || 0} mesaj`));
      }

      button.append(visual, copy, trailing);
      return button;
    }

    function renderSocialList() {
      const title = $("psMidTitle");
      const wrap = $("psListContainer");
      if (!title || !wrap) return;

      title.textContent = getSocialHeaderText();
      const items = getSocialListItems(state.social.activeTab);
      const selected = ensureSocialSelection();
      wrap.replaceChildren();

      if (!items.length) {
        const emptyMessage = state.social.activeTab === "friends"
          ? "Henüz arkadaş eklemedin. Sağdaki ekleme sekmesinden yeni bağlantı kurabilirsin."
          : state.social.activeTab === "invites"
            ? "Davet gönderebilmek için önce en az bir arkadaş eklemelisin."
            : state.social.activeTab === "party"
              ? "Parti daveti veya aktif parti bilgisi burada görünür."
              : state.social.activeTab === "search"
                ? "Mesaj aramak için en az 2 karakter gir."
                : state.social.activeTab === "requests"
                  ? "Şu an bekleyen bir sosyal işlem görünmüyor."
                  : "Bu bölüm için gösterilecek kayıt bulunamadı.";
        wrap.appendChild(buildSocialEmptyState("Liste boş", emptyMessage));
        return;
      }

      items.forEach((item) => wrap.appendChild(createSocialListItem(item, item.key === selected?.key)));
    }

    function setSocialHeader(entry, subtitle = "") {
      const title = $("psChatTitle");
      const subtitleEl = $("psChatSubtitle");
      const avatarWrap = $("psChatAvatar");
      const avatarImg = avatarWrap?.querySelector("img");
      const backBtn = $("psMobileBackBtn");
      const mainPanel = $("psMainPanel");
      const socialLayout = document.querySelector('.sheet-shell.is-social .pm-social-layout');
      const chatIsActive = !isSocialMobile() || !!state.social.mobilePanelOpen;

      if (title) {
        title.textContent = entry?.title || entry?.username || "Sosyal Merkez";
        title.style.display = "block";
      }
      if (subtitleEl) {
        subtitleEl.textContent = subtitle;
        subtitleEl.style.display = subtitle ? "block" : "none";
      }

      if (avatarWrap) {
        if (entry?.avatar) {
          avatarWrap.style.display = "inline-flex";
          mountPremiumAvatar(avatarWrap, entry.avatar || AVATARS[0], resolveAvatarVipLevel(entry), 44, "pm-premium-avatar--social-header");
          avatarWrap.setAttribute('aria-label', `${entry.username || entry.title || "Profil"} avatarı`);
        } else {
          avatarWrap.style.display = "none";
          avatarWrap.replaceChildren();
        }
      }

      if (backBtn) backBtn.style.display = isSocialMobile() && state.social.mobilePanelOpen ? "inline-flex" : "none";
      if (mainPanel) mainPanel.classList.toggle("mobile-active", chatIsActive);
      if (socialLayout) socialLayout.classList.toggle("is-chat-active", isSocialMobile() && !!state.social.mobilePanelOpen);
    }

    function setSocialHeaderActions(actions = []) {
      const wrap = $("psChatActions");
      if (!wrap) return;
      wrap.replaceChildren();
      const list = Array.isArray(actions) ? actions.filter(Boolean) : [];
      list.forEach((node) => wrap.appendChild(node));
      wrap.style.display = wrap.childElementCount ? "flex" : "none";
    }

    function setComposerState({ visible, placeholder = "", help = "", tone = "" }) {
      const inputArea = $("psInputArea");
      const input = $("psChatInput");
      const helpEl = $("psChatHelp");
      if (inputArea) inputArea.style.display = visible ? "flex" : "none";
      if (input) {
        input.placeholder = placeholder;
        if (!visible) input.value = "";
      }
      if (helpEl) {
        helpEl.textContent = help;
        helpEl.className = `ps-chat-help${tone ? ` is-${tone}` : ""}`;
        helpEl.style.display = visible || help ? "block" : "none";
      }
    }




let activeSocialMenu = null;
let activeSocialMenuCleanup = null;

function closeSocialMenu() {
  if (typeof activeSocialMenuCleanup === 'function') {
    try { activeSocialMenuCleanup(); } catch (_) {}
  }
  activeSocialMenuCleanup = null;
  if (activeSocialMenu?.parentNode) activeSocialMenu.parentNode.removeChild(activeSocialMenu);
  activeSocialMenu = null;
}

function openSocialMenu(anchor, items = []) {
  closeSocialMenu();
  const actions = Array.isArray(items) ? items.filter((item) => item && typeof item.onClick === 'function') : [];
  if (!anchor || !actions.length) return;

  const menu = document.createElement('div');
  menu.className = 'ps-floating-menu';
  actions.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ps-floating-menu__item${item.danger ? ' is-danger' : ''}`;
    button.innerHTML = `${item.icon ? `<i class="fa-solid ${item.icon}"></i>` : ''}<span>${escapeHtml(item.label || 'İşlem')}</span>`;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeSocialMenu();
      try { await item.onClick(); } catch (_) {}
    });
    menu.appendChild(button);
  });

  document.body.appendChild(menu);
  activeSocialMenu = menu;

  const placeMenu = () => {
    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const spacing = 10;
    let left = rect.right - menuRect.width;
    let top = rect.bottom + spacing;
    if (left < 8) left = 8;
    if ((left + menuRect.width) > (window.innerWidth - 8)) left = window.innerWidth - menuRect.width - 8;
    if ((top + menuRect.height) > (window.innerHeight - 8)) top = rect.top - menuRect.height - spacing;
    if (top < 8) top = 8;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  };

  const handleOutside = (event) => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) closeSocialMenu();
  };

  activeSocialMenuCleanup = () => {
    document.removeEventListener('pointerdown', handleOutside, true);
    window.removeEventListener('resize', placeMenu);
    window.removeEventListener('scroll', placeMenu, true);
  };
  document.addEventListener('pointerdown', handleOutside, true);
  window.addEventListener('resize', placeMenu);
  window.addEventListener('scroll', placeMenu, true);
  requestAnimationFrame(placeMenu);
}

function buildHeaderIconButton(iconClass, label, onClick) {
  const button = document.createElement('button');
  button.className = 'icon-btn';
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
  button.addEventListener('click', onClick);
  return button;
}

function buildOverflowActionButton(label, actions = []) {
  return buildHeaderIconButton('fa-ellipsis-vertical', label, (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSocialMenu(event.currentTarget, actions);
  });
}

function buildMessageBubble(item, isSelf = false, context = "dm") {
  const card = document.createElement("article");
  card.className = `ps-chat-bubble ${context === "global" ? "is-global" : "is-dm"}${isSelf ? " is-self" : ""}`;

  const shell = document.createElement("div");
  shell.className = "ps-chat-shell";

  const targetUid = item.fromUid || item.senderUid || item.uid || item.targetUid || "";
  const frameLevel = isSelf ? getDisplayFrameLevel() : resolveAvatarVipLevel(item, 0);
  const avatarUrl = isSelf
    ? safeUrl(state.selectedAvatar || state.userData?.avatar || AVATARS[0])
    : safeUrl(item.avatar || AVATARS[0]);

  const avatar = createPremiumAvatarNode(
    avatarUrl,
    frameLevel,
    38,
    "ps-chat-avatar-shell pm-premium-avatar--chat"
  );
  avatar.classList.add("ps-chat-avatar");
  if (targetUid) {
    avatar.style.cursor = "pointer";
    avatar.title = "Profili aç";
    avatar.addEventListener("click", () => window.showPlayerStats?.(targetUid));
  }

  const main = document.createElement("div");
  main.className = "ps-chat-main";

  const topLine = document.createElement("div");
  topLine.className = "ps-chat-topline";

  const name = document.createElement("strong");
  name.className = "ps-chat-name";
  name.textContent = isSelf ? "Sen" : (item.username || "Oyuncu");
  if (targetUid) {
    name.style.cursor = "pointer";
    name.title = "Profili aç";
    name.addEventListener("click", () => window.showPlayerStats?.(targetUid));
  }
  topLine.appendChild(name);

  const hasRankData = context === "global" || !!item.rankName || !!item.vipLabel || Number(item.rp || 0) > 0;
  if (hasRankData) {
    const badgeRow = document.createElement("div");
    badgeRow.className = "ps-chat-badge-row";

    const rankMeta = item.rankName
      ? { name: item.rankName, className: item.rankClass || "rank-bronze", vip: String(item.vipLabel || "").trim() }
      : getSocialRankMeta(item.rp || 0);

    const vipLabel = String(item.vipLabel || rankMeta.vip || "").trim();
    const rankLabel = String(rankMeta.name || "").trim();
    const combinedMeta = [vipLabel, rankLabel].filter((value, index, arr) => value && arr.indexOf(value) === index).join(" / ");

    if (combinedMeta) {
      const badge = document.createElement("span");
      badge.className = `ps-chat-badge ${rankMeta.className || "rank-bronze"}`;
      badge.textContent = combinedMeta;
      badgeRow.appendChild(badge);
    }

    if (badgeRow.childElementCount) topLine.appendChild(badgeRow);
  }

  const body = document.createElement("div");
  body.className = "ps-chat-text";
  body.textContent = item.deletedAt ? "Bu mesaj silindi." : (item.message || item.text || "");

  const bottom = document.createElement("div");
  bottom.className = "ps-chat-bottom";

  const time = document.createElement("span");
  time.className = "ps-chat-time";
  time.textContent = formatClockTime(item.createdAt);
  bottom.appendChild(time);

  if (item.editedAt && !item.deletedAt) {
    const edited = document.createElement("span");
    edited.className = "ps-chat-time";
    edited.textContent = "düzenlendi";
    bottom.appendChild(edited);
  }

  if (context === "dm" && isSelf && item.id && !item.deletedAt) {
    const actions = document.createElement("div");
    actions.className = "ps-chat-inline-actions";

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "ps-chat-mini-btn";
    moreBtn.setAttribute("aria-label", "Mesaj seçenekleri");
    moreBtn.title = "Mesaj seçenekleri";
    moreBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
    moreBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSocialMenu(event.currentTarget, [
        {
          label: 'Düzenle',
          icon: 'fa-pen',
          onClick: async () => {
            const nextText = window.prompt('Mesajı düzenle', item.message || item.text || '');
            if (nextText === null) return;
            try {
              await fetchPrivate('/api/chat/direct/edit', 'POST', { targetUid: state.social.currentActiveDmUid, messageId: item.id, text: nextText });
              await loadDirectHistoryForPeer(state.social.currentActiveDmUid, { force: true });
            } catch (error) {
              showToast('DM Düzenleme', error.message || 'Mesaj güncellenemedi.', 'error');
            }
          }
        },
        {
          label: 'Sil',
          icon: 'fa-trash',
          danger: true,
          onClick: async () => {
            try {
              await fetchPrivate('/api/chat/direct/delete', 'POST', { targetUid: state.social.currentActiveDmUid, messageId: item.id });
              await loadDirectHistoryForPeer(state.social.currentActiveDmUid, { force: true });
            } catch (error) {
              showToast('DM Silme', error.message || 'Mesaj silinemedi.', 'error');
            }
          }
        }
      ]);
    });

    actions.append(moreBtn);
    bottom.appendChild(actions);
  }

  main.append(topLine, body, bottom);
  if (isSelf) shell.append(main, avatar);
  else shell.append(avatar, main);
  card.appendChild(shell);
  return card;
}

function renderMessageStack(stream, messages, emptyTitle, emptyMessage, getIsSelf, context = "dm") {

      const nearBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 60;
      const stack = document.createElement("div");
      stack.className = "ps-conversation-stack";

      if (!messages.length) {
        stack.appendChild(buildSocialEmptyState(emptyTitle, emptyMessage));
      } else {
        messages.forEach((item) => stack.appendChild(buildMessageBubble(item, !!getIsSelf(item), context)));
      }

      stream.appendChild(stack);
      if (nearBottom) stream.scrollTop = stream.scrollHeight;
    }

    function syncInviteModeVisibility() {
      const gameSelect = $("socialInviteGame");
      const modeField = $("socialInviteMode")?.closest(".ps-field");
      if (!gameSelect || !modeField) return;
      modeField.style.display = gameSelect.value === "pisti" ? "grid" : "none";
    }

    function getSelectedInviteConfig() {
      const gameKey = $("socialInviteGame")?.value === "pisti" ? "pisti" : "chess";
      const mode = $("socialInviteMode")?.value || "2-52";
      const rawBet = Number($("socialInviteBet")?.value || 1000);
      const bet = Number.isFinite(rawBet) ? Math.min(10000000, Math.max(1, Math.floor(rawBet))) : 1000;
      return {
        gameKey,
        gameName: gameKey === "pisti" ? "Online Pişti" : "Satranç",
        mode,
        bet
      };
    }

    function renderGlobalPanel(stream) {
      setSocialHeader({ title: "#Yerel Sohbet (TR)" }, "99+ Kişi");
      setSocialHeaderActions();
      setComposerState({
        visible: true,
        placeholder: "Küfür/Argo Kullanma...",
        help: state.realtimeConnected ? "" : "Canlı bağlantı kuruluyor. Lobi akışı eşitleniyor."
      });

      renderMessageStack(
        stream,
        state.lobbyMessages,
        "Lobi şu an sakin",
        "İlk mesajı göndererek akışı sen başlatabilirsin.",
        (item) => !!auth.currentUser && item.uid === auth.currentUser.uid,
        "global"
      );
    }


    function appendLobbyMessage(msg) {
      const stream = $("psChatStream");
      if (!stream) return null;

      let stack = stream.querySelector('.ps-conversation-stack');
      if (!stack) {
        stream.replaceChildren();
        stack = document.createElement('div');
        stack.className = 'ps-conversation-stack';
        stream.appendChild(stack);
      }

      const emptyState = stack.querySelector('.ps-empty-state');
      if (emptyState) emptyState.remove();

      const isSelf = !!auth.currentUser && msg?.uid === auth.currentUser.uid;
      const bubble = buildMessageBubble(msg || {}, isSelf, 'global');
      stack.appendChild(bubble);
      stream.scrollTop = stream.scrollHeight;
      return bubble;
    }

    function appendLobbyMessageToActiveStream(msg) {
      if (state.currentSheet !== 'social' || state.social.activeTab !== 'global') return false;
      if (isSocialMobile() && !state.social.mobilePanelOpen) return false;
      return !!appendLobbyMessage(msg);
    }

    function renderActiveLobbyStream() {
      if (state.currentSheet !== 'social' || state.social.activeTab !== 'global') return false;
      if (isSocialMobile() && !state.social.mobilePanelOpen) return false;
      const stream = $("psChatStream");
      if (!stream) return false;
      renderGlobalPanel(stream);
      return true;
    }

    function renderFriendPanel(stream, entry) {
      const settings = state.social.dmSettings?.[entry.uid] || { mine: {}, theirs: {} };
      if (!state.social.dmSettings?.[entry.uid]) loadDmSettings(entry.uid).catch(() => null);

      const removeBtn = document.createElement("button");
      removeBtn.className = "icon-btn";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Arkadaşı kaldır");
      removeBtn.title = "Arkadaşı kaldır";
      removeBtn.innerHTML = '<i class="fa-solid fa-user-minus"></i>';
      removeBtn.addEventListener("click", () => removeFriend(entry));

      const searchBtn = buildHeaderIconButton('fa-magnifying-glass', 'Mesaj ara', () => {
        state.social.dmSearchTargetUid = entry.uid;
        state.social.dmSearchQuery = '';
        state.social.dmSearchResults = [];
        setSocialTab('search', { preferredKey: 'search:dm', openPanel: true });
      });

      const overflowBtn = buildOverflowActionButton('Sohbet seçenekleri', [
        {
          label: settings?.mine?.archived ? 'Arşivden çıkar' : 'Sohbeti arşivle',
          icon: settings?.mine?.archived ? 'fa-box-open' : 'fa-box-archive',
          onClick: () => handleDmRelationAction(settings?.mine?.archived ? 'unarchive' : 'archive', entry.uid)
        },
        {
          label: settings?.mine?.muted ? 'Sesi aç' : 'Sessize al',
          icon: settings?.mine?.muted ? 'fa-bell' : 'fa-bell-slash',
          onClick: () => handleDmRelationAction(settings?.mine?.muted ? 'unmute' : 'mute', entry.uid)
        },
        {
          label: settings?.mine?.blocked ? 'Engeli kaldır' : 'Engelle',
          icon: settings?.mine?.blocked ? 'fa-user-check' : 'fa-user-lock',
          onClick: () => handleDmRelationAction(settings?.mine?.blocked ? 'unblock' : 'block', entry.uid)
        },
        {
          label: 'Arkadaşı kaldır',
          icon: 'fa-user-minus',
          danger: true,
          onClick: () => removeFriend(entry)
        }
      ]);

      state.social.currentActiveDmUid = entry.uid;
      state.social.unreadDirect[entry.uid] = 0;
      loadDirectHistoryForPeer(entry.uid);

      const presenceMeta = getPresenceMeta(entry);
      const relationSummary = [
        settings?.mine?.archived ? 'Arşivli' : '',
        settings?.mine?.muted ? 'Sessiz' : '',
        settings?.mine?.blocked ? 'Engelli' : ''
      ].filter(Boolean).join(' · ');
      setSocialHeader({ title: entry.username || 'Arkadaş', avatar: entry.avatar }, `Özel Sohbet · ${presenceMeta.activity}${relationSummary ? ` · ${relationSummary}` : ''}`);
      setSocialHeaderActions([searchBtn, overflowBtn]);
      setComposerState({ visible: !settings?.mine?.blocked && !settings?.theirs?.blocked, placeholder: `${entry.username || "Arkadaşın"} için mesaj yaz...`, help: settings?.mine?.blocked ? "Bu kullanıcıyı engelledin. Mesaj göndermek için engeli kaldır." : settings?.theirs?.blocked ? "Bu kullanıcı mesajlarını kabul etmiyor." : "" });

      const conversation = getDirectConversation(entry.uid);
      const historyPending = !!state.social.directHistoryPending[entry.uid];
      renderMessageStack(
        stream,
        conversation,
        historyPending ? "Geçmiş yükleniyor" : "Henüz özel mesaj yok",
        historyPending ? "Son mesajlar güvenli şekilde senkronize ediliyor." : `${entry.username || "Arkadaşın"} ile ilk sohbeti başlatabilirsin.`,
        (item) => !!auth.currentUser && item.fromUid === auth.currentUser.uid,
        "dm"
      );

      updateTypingIndicator(entry.uid, false);
    }

    function renderRequestPanel(stream, entry) {
      const title = entry.direction === "incoming" ? "Gelen İstek" : "Giden İstek";
      setSocialHeader({ title: entry.username || "Arkadaşlık İsteği", avatar: entry.avatar }, title);
      setSocialHeaderActions();
      setComposerState({ visible: false, help: entry.direction === "incoming" ? "İsteği kabul ederek doğrudan özel mesaj ve oyun daveti açarsın." : "Karşı tarafın onayı geldiğinde bağlantı otomatik güncellenir." });

      const card = document.createElement("section");
      card.className = "ps-request-card";

      const profileRow = document.createElement("div");
      profileRow.className = "ps-profile-row";
      const avatarWrap = document.createElement("div");
      avatarWrap.className = "friend-avatar";
      avatarWrap.appendChild(createPremiumAvatarNode(entry.avatar || AVATARS[0], resolveAvatarVipLevel(entry), 58, "pm-premium-avatar--social-card"));

      const meta = document.createElement("div");
      meta.className = "ps-profile-meta";
      const name = document.createElement("strong");
      name.textContent = entry.username || "Oyuncu";
      const subtitle = document.createElement("span");
      subtitle.textContent = entry.direction === "incoming"
        ? "Seninle arkadaş olmak istiyor."
        : "Yanıt bekleniyor.";
      meta.append(name, subtitle);
      profileRow.append(avatarWrap, meta);

      const actions = document.createElement("div");
      actions.className = "ps-request-actions";
      if (entry.direction === "incoming") {
        const acceptBtn = document.createElement("button");
        acceptBtn.className = "btn btn-primary";
        acceptBtn.type = "button";
        acceptBtn.textContent = "Kabul Et";
        acceptBtn.addEventListener("click", () => respondFriendRequest(entry.friendshipId, "accept"));

        const declineBtn = document.createElement("button");
        declineBtn.className = "ghost-btn";
        declineBtn.type = "button";
        declineBtn.textContent = "Reddet";
        declineBtn.addEventListener("click", () => respondFriendRequest(entry.friendshipId, "decline"));
        actions.append(acceptBtn, declineBtn);
      } else {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "ghost-btn";
        cancelBtn.type = "button";
        cancelBtn.textContent = "İsteği Geri Çek";
        cancelBtn.addEventListener("click", () => removeFriend(entry));
        actions.appendChild(cancelBtn);
      }

      card.append(profileRow, actions);
      stream.appendChild(card);
    }

    function renderAddPanel(stream) {
      setSocialHeader({ title: "Yeni Arkadaş Ekle" }, "Bağlantı Başlat");
      setSocialHeaderActions();
      setComposerState({ visible: false, help: "Eklediğin kişi çevrimiçiyse anlık bildirim alır. Doğrudan davet ve DM sadece onaylı arkadaşlarda açılır." });

      const card = document.createElement("section");
      card.className = "ps-panel-card";

      const formGrid = document.createElement("div");
      formGrid.className = "ps-form-grid";
      formGrid.style.gridTemplateColumns = "1fr";

      const userField = document.createElement("div");
      userField.className = "ps-field";
      const userLabel = document.createElement("label");
      userLabel.setAttribute("for", "friendTargetInput");
      userLabel.textContent = "Kullanıcı adı";
      const userInput = document.createElement("input");
      userInput.id = "friendTargetInput";
      userInput.type = "text";
      userInput.placeholder = "Örn: AhmetBey";
      userInput.maxLength = 20;
      userInput.autocomplete = "off";
      userField.append(userLabel, userInput);

      formGrid.append(userField);

      const actions = document.createElement("div");
      actions.className = "ps-inline-actions";
      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-primary";
      addBtn.id = "friendAddBtn";
      addBtn.type = "button";
      addBtn.textContent = "Arkadaşlık İsteği Gönder";
      addBtn.addEventListener("click", handleFriendAdd);
      actions.appendChild(addBtn);

      const help = document.createElement("div");
      help.className = "ps-field-help";
      help.id = "friendActionHelp";
      help.textContent = "Kullanıcı adını eksiksiz girin. İstek gönderimi arkadaş koleksiyonuna yazılır ve karşı taraf çevrimiçiyse anlık uyarı düşer.";

      card.append(formGrid, actions, help);
      stream.appendChild(card);
      userInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleFriendAdd();
        }
      });
    }

    function renderInvitePanel(stream, entry) {
      setSocialHeader({ title: entry.username || "Oyuncu", avatar: entry.avatar }, "Oyuna Davet Et");
      setSocialHeaderActions();
      setComposerState({ visible: false, help: "" });

      const card = document.createElement("section");
      card.className = "ps-request-card";

      const profileRow = document.createElement("div");
      profileRow.className = "ps-profile-row";
      const avatarWrap = document.createElement("div");
      avatarWrap.className = "friend-avatar";
      avatarWrap.appendChild(createPremiumAvatarNode(entry.avatar || AVATARS[0], resolveAvatarVipLevel(entry), 58, "pm-premium-avatar--social-card"));

      const meta = document.createElement("div");
      meta.className = "ps-profile-meta";
      const name = document.createElement("strong");
      name.textContent = entry.username || "Oyuncu";
      const subtitle = document.createElement("span");
      const invitePresence = getPresenceMeta(entry);
      subtitle.textContent = invitePresence.canInvite
        ? "Şu an Aktif - Bildirim anında iletilir"
        : invitePresence.status === "OFFLINE"
          ? "Çevrimdışı - Davet gönderilemez"
          : `Meşgul - ${invitePresence.activity}`;
      meta.append(name, subtitle);
      profileRow.append(avatarWrap, meta);

      // OYUN VE BAHİS ALANI (YENİ)
      const formGrid = document.createElement("div");
      formGrid.className = "ps-form-grid";
      formGrid.style.marginTop = "14px";
      formGrid.style.marginBottom = "14px";
      formGrid.style.gridTemplateColumns = "1fr";

      // 1. Oyun Seçimi
      const gameField = document.createElement("div");
      gameField.className = "ps-field";
      const gameLabel = document.createElement("label");
      gameLabel.textContent = "Hangi Oyunu Oynayacaksınız?";
      const gameSelect = document.createElement("select");
      gameSelect.id = "socialInviteGame";
      gameSelect.className = "field-select";
      gameSelect.style.height = "48px";
      gameSelect.style.border = "1px solid rgba(255,255,255,0.15)";
      gameSelect.style.backgroundColor = "rgba(0,0,0,0.4)";
      gameSelect.innerHTML = `
        <option value="pisti">Online Pişti (Bahisli)</option>
        <option value="chess">Satranç (Sıralamalı)</option>
      `;
      gameField.append(gameLabel, gameSelect);

      // 2. Bahis Miktarı (Satranç seçilince gizlenir)
      const betField = document.createElement("div");
      betField.className = "ps-field";
      betField.id = "socialInviteBetField";
      const betLabel = document.createElement("label");
      betLabel.textContent = "Bahis Miktarı (MC)";
      const betInput = document.createElement("input");
      betInput.type = "number";
      betInput.id = "socialInviteBet";
      betInput.className = "field-input";
      betInput.style.height = "48px";
      betInput.style.border = "1px solid rgba(255,255,255,0.15)";
      betInput.style.backgroundColor = "rgba(0,0,0,0.4)";
      betInput.placeholder = "Örn: 10000";
      betInput.value = "10000";
      betField.append(betLabel, betInput);

      gameSelect.addEventListener("change", () => {
        betField.style.display = gameSelect.value === "pisti" ? "grid" : "none";
      });

      formGrid.append(gameField, betField);

      // 3. Davet Gönder Butonu (Tam Boy)
      const actions = document.createElement("div");
      actions.className = "ps-request-actions";

      const inviteBtn = document.createElement("button");
      inviteBtn.className = "btn btn-primary";
      inviteBtn.type = "button";
      inviteBtn.style.width = "100%";
      inviteBtn.style.justifyContent = "center";
      inviteBtn.style.height = "52px";
      inviteBtn.style.fontSize = "1rem";
      inviteBtn.innerHTML = '<i class="fa-solid fa-gamepad" style="margin-right:8px;"></i> Hemen Davet Gönder';
      const inviteMeta = getPresenceMeta(entry);
      inviteBtn.disabled = !inviteMeta.canInvite;
      inviteBtn.style.opacity = inviteMeta.canInvite ? "1" : ".55";
      inviteBtn.style.cursor = inviteMeta.canInvite ? "pointer" : "not-allowed";
      inviteBtn.addEventListener("click", () => {
        if (!inviteMeta.canInvite) {
          showToast(
            inviteMeta.status === "OFFLINE" ? "Oyuncu çevrimdışı" : "Oyuncu meşgul",
            inviteMeta.status === "OFFLINE"
              ? "Bu arkadaş şu anda aktif değil. Davet yalnızca çevrimiçi oyunculara iletilir."
              : `${entry.username || "Bu oyuncu"} şu anda meşgul (${inviteMeta.activity}).`,
            "info"
          );
          return;
        }
        createInviteForFriend(entry);
      });
      
      actions.appendChild(inviteBtn);

      card.append(profileRow, formGrid, actions);
      stream.appendChild(card);
    }

    function buildMetricChip(label, value) {
      const chip = document.createElement("div");
      chip.className = "ps-metric-chip";
      chip.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? "-"))}</strong>`;
      return chip;
    }

    function renderHubPanel(stream) {
      const refreshBtn = document.createElement("button");
      refreshBtn.className = "icon-btn";
      refreshBtn.type = "button";
      refreshBtn.title = "Özeti yenile";
      refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
      refreshBtn.addEventListener("click", () => refreshSocialFeaturePack(true));

      setSocialHeader({ title: "Sosyal Merkez+" }, "Parti, vitrin, son oyuncular ve Activity Pass");
      setSocialHeaderActions([refreshBtn]);
      setComposerState({ visible: false, help: state.social.centerError || "Merkez kartları canlı olarak sunucudan beslenir." , tone: state.social.centerError ? "error" : "" });

      if (state.social.centerLoading && !state.social.centerSummary) {
        stream.appendChild(buildSocialEmptyState("Yükleniyor", "Sosyal merkez özeti hazırlanıyor..."));
        return;
      }
      const payload = state.social.centerSummary;
      if (!payload?.me) {
        stream.appendChild(buildSocialEmptyState("Özet yüklenemedi", state.social.centerError || "Sosyal merkez verisi henüz hazır değil."));
        return;
      }

      const me = payload.me || {};
      const card = document.createElement("section");
      card.className = "ps-panel-card ps-dashboard-card";

      const top = document.createElement("div");
      top.className = "ps-profile-row";
      const avatarWrap = document.createElement("div");
      avatarWrap.className = "friend-avatar";
      avatarWrap.appendChild(createPremiumAvatarNode(me.avatar || AVATARS[0], Number(me.selectedFrame || 0), 72, "pm-premium-avatar--social-card"));

      const meta = document.createElement("div");
      meta.className = "ps-profile-meta";
      const name = document.createElement("strong");
      name.textContent = me.username || "Oyuncu";
      const subtitle = document.createElement("span");
      const progression = me.progression || {};
      subtitle.textContent = `${progression.seasonRank || me.seasonRankName || 'Bronze'} · ${formatNumber(progression.seasonScore ?? me.seasonRp ?? 0)} sezon puanı · ${formatNumber(progression.monthlyActivity ?? me.monthlyActiveScore ?? 0)} aktiflik · hesap seviyesi ${formatNumber(progression.accountLevel ?? me.accountLevel ?? me.level ?? 1)}`;
      meta.append(name, subtitle);
      top.append(avatarWrap, meta);

      const metricRow = document.createElement("div");
      metricRow.className = "ps-metric-grid";
      metricRow.append(
        buildMetricChip("Okunmamış", me.unreadMessages || 0),
        buildMetricChip("Arkadaş", (payload.friends || []).length),
        buildMetricChip("Son Oyuncu", (payload.recentPlayers || []).length),
        buildMetricChip("Maç", (payload.recentMatches || []).length)
      );

      const showcaseBox = document.createElement("div");
      showcaseBox.className = "ps-panel-subcard";
      const vipCenterData = getVipCenterData(payload.vipCenter || state.vipCenter);
      showcaseBox.innerHTML = `
        <div class="ps-subtitle-row"><strong>Profil vitrini</strong><span>Public showcase hazır</span></div>
        <div class="ps-form-grid ps-form-grid--single">
          <div class="ps-field"><label>Başlık</label><input id="scShowcaseTitle" type="text" maxlength="40" value="${escapeHtml(me.showcase?.title || "")}" placeholder="Örn: Satranç koleksiyoncusu"></div>
          <div class="ps-field"><label>Biyografi</label><textarea id="scShowcaseBio" maxlength="180" placeholder="Kısa vitrin metni">${escapeHtml(me.showcase?.bio || "")}</textarea></div>
          <div class="ps-field"><label>Favori oyun</label><input id="scFavoriteGame" type="text" maxlength="24" value="${escapeHtml(me.showcase?.favoriteGame || "")}" placeholder="Örn: Chess"></div>
          <div class="ps-field"><label>Rozet</label><input id="scSelectedBadge" type="text" maxlength="32" value="${escapeHtml(me.showcase?.selectedBadge || "")}" placeholder="Örn: Elite"></div>
          <div class="ps-field"><label>Banner URL</label><input id="scProfileBanner" type="text" maxlength="220" value="${escapeHtml(me.showcase?.profileBanner || "")}" placeholder="İsteğe bağlı görsel bağlantısı"></div>
          <div class="ps-field"><label>VIP Tema</label><select id="scVipTheme">${createOptionHtml(vipCenterData?.appearance?.themes || [], me.showcase?.vipTheme || vipCenterData?.appearance?.selectedTheme?.key || 'obsidian')}</select></div>
          <div class="ps-field"><label>İsim Plakası</label><select id="scVipNameplate">${createOptionHtml(vipCenterData?.appearance?.nameplates || [], me.showcase?.vipNameplate || vipCenterData?.appearance?.selectedNameplate?.key || 'clean')}</select></div>
          <div class="ps-field"><label>Sohbet Balonu</label><select id="scVipBubble">${createOptionHtml(vipCenterData?.appearance?.bubbles || [], me.showcase?.vipBubble || vipCenterData?.appearance?.selectedBubble?.key || 'default')}</select></div>
          <div class="ps-field"><label>Banner Preseti</label><select id="scVipBannerPreset">${createOptionHtml(vipCenterData?.appearance?.banners || [], me.showcase?.vipBannerPreset || vipCenterData?.appearance?.selectedBannerPreset?.key || 'none')}</select></div>
        </div>
      `;
      const showcaseActions = document.createElement("div");
      showcaseActions.className = "ps-inline-actions";
      const saveShowcaseBtn = document.createElement("button");
      saveShowcaseBtn.className = "btn btn-primary";
      saveShowcaseBtn.type = "button";
      saveShowcaseBtn.textContent = "Vitrini Kaydet";
      saveShowcaseBtn.addEventListener("click", () => saveShowcaseProfile({
        title: $("scShowcaseTitle")?.value || "",
        bio: $("scShowcaseBio")?.value || "",
        favoriteGame: $("scFavoriteGame")?.value || "",
        selectedBadge: $("scSelectedBadge")?.value || "",
        profileBanner: $("scProfileBanner")?.value || "",
        vipTheme: $("scVipTheme")?.value || "obsidian",
        vipNameplate: $("scVipNameplate")?.value || "clean",
        vipBubble: $("scVipBubble")?.value || "default",
        vipBannerPreset: $("scVipBannerPreset")?.value || "none"
      }));
      const openShowcaseBtn = document.createElement("button");
      openShowcaseBtn.className = "ghost-btn";
      openShowcaseBtn.type = "button";
      openShowcaseBtn.textContent = "Public Showcase";
      openShowcaseBtn.addEventListener("click", () => window.open(`${API_URL}/api/showcase/${encodeURIComponent(auth.currentUser?.uid || "")}`, "_blank", "noopener"));
      showcaseActions.append(saveShowcaseBtn, openShowcaseBtn);
      showcaseBox.appendChild(showcaseActions);

      const passBox = document.createElement("div");
      passBox.className = "ps-panel-subcard";
      const pass = me.activityPass || { score: 0, currentLevel: 0, levels: [] };
      passBox.innerHTML = `<div class="ps-subtitle-row"><strong>Activity Pass</strong><span>Skor: ${escapeHtml(formatNumber(pass.score || 0))}</span></div>`;
      const passGrid = document.createElement("div");
      passGrid.className = "ps-pass-grid";
      (pass.levels || []).forEach((level) => {
        const item = document.createElement("div");
        item.className = `ps-pass-item${level.claimed ? ' is-claimed' : level.unlocked ? ' is-open' : ''}`;
        item.innerHTML = `<strong>Lv.${escapeHtml(level.level)}</strong><span>${escapeHtml(level.badge)}</span><small>${escapeHtml(formatNumber(level.rewardMc))} MC · hedef ${escapeHtml(formatNumber(level.need))}</small>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = level.claimed ? "ghost-btn" : "btn btn-primary";
        btn.disabled = !!level.claimed || !level.unlocked;
        btn.textContent = level.claimed ? "Alındı" : level.unlocked ? "Ödülü Al" : "Kilitli";
        btn.addEventListener("click", () => claimActivityPassReward(level.level));
        item.appendChild(btn);
        passGrid.appendChild(item);
      });
      passBox.appendChild(passGrid);

      const columns = document.createElement("div");
      columns.className = "ps-overview-columns";
      const recentPlayers = document.createElement("div");
      recentPlayers.className = "ps-panel-subcard";
      recentPlayers.innerHTML = `<div class="ps-subtitle-row"><strong>Son Oyuncular</strong><span>${escapeHtml(String((payload.recentPlayers || []).length))} kayıt</span></div>`;
      const recentPlayersList = document.createElement("div");
      recentPlayersList.className = "ps-mini-list";
      (payload.recentPlayers || []).slice(0, 6).forEach((item) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "ps-mini-user";
        row.appendChild(createPremiumAvatarNode(item.avatar || AVATARS[0], Number(item.selectedFrame || 0), 36, "pm-premium-avatar--social-list"));
        const copy = document.createElement("div");
        copy.innerHTML = `<strong>${escapeHtml(item.username || 'Oyuncu')}</strong><span>${escapeHtml(formatNumber(item.seasonRp || item.rp || 0))} puan</span>`;
        row.appendChild(copy);
        row.addEventListener("click", () => window.showPlayerStats?.(item.uid));
        recentPlayersList.appendChild(row);
      });
      if (!recentPlayersList.childElementCount) recentPlayersList.appendChild(buildSocialEmptyState("Boş", "Henüz son oyuncu kaydı yok."));
      recentPlayers.appendChild(recentPlayersList);

      const recentMatches = document.createElement("div");
      recentMatches.className = "ps-panel-subcard";
      recentMatches.innerHTML = `<div class="ps-subtitle-row"><strong>Son Maçlar</strong><span>${escapeHtml(String((payload.recentMatches || []).length))} kayıt</span></div>`;
      const recentMatchList = document.createElement("div");
      recentMatchList.className = "ps-mini-list";
      (payload.recentMatches || []).slice(0, 6).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        row.innerHTML = `<strong>${escapeHtml(item.gameType || item.game || 'Maç')}</strong><span>${escapeHtml(formatClockTime(item.createdAt || Date.now()))} · ${escapeHtml((item.participants || []).length)} oyuncu</span>`;
        recentMatchList.appendChild(row);
      });
      if (!recentMatchList.childElementCount) recentMatchList.appendChild(buildSocialEmptyState("Boş", "Henüz maç geçmişi yok."));
      recentMatches.appendChild(recentMatchList);

      columns.append(recentPlayers, recentMatches);

      const activeSessionsBox = document.createElement("div");
      activeSessionsBox.className = "ps-panel-subcard";
      activeSessionsBox.innerHTML = `<div class="ps-subtitle-row"><strong>Aktif / Devam Eden Oturumlar</strong><span>${escapeHtml(String((payload.activeSessions || []).length))} kayıt</span></div>`;
      const activeSessionsList = document.createElement("div");
      activeSessionsList.className = "ps-mini-list";
      (payload.activeSessions || []).slice(0, 6).forEach((session) => {
        const row = document.createElement("div");
        row.className = "ps-panel-subcard";
        row.style.padding = "14px";
        const title = session.gameType === "chess" ? "Satranç" : "Online Pişti";
        const untilText = session.cleanupAt ? formatClockTime(session.cleanupAt) : "-";
        row.innerHTML = `<div class="ps-subtitle-row"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(session.status || "bekliyor")}</span></div><div style="color:var(--muted);font-size:.92rem;line-height:1.5">Oda: <span class="mono">${escapeHtml(session.roomId || "-")}</span> · ${session.canResume ? "yeniden katılabilir" : "inceleme modu"} · kapanış ${escapeHtml(untilText)}</div>`;
        const actions = document.createElement("div");
        actions.className = "ps-inline-actions";
        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "btn btn-primary";
        openBtn.textContent = session.canResume ? "Oyuna Dön" : "Sonucu Gör";
        openBtn.addEventListener("click", () => {
          const gamePath = session.gameType === "chess" ? "/Online Oyunlar/Satranc.html" : "/Online Oyunlar/Pisti.html";
          sessionStorage.setItem("pm_auto_join_game", session.gameType === "chess" ? "chess" : "pisti");
          sessionStorage.setItem("pm_auto_join_room", String(session.roomId || ""));
          window.location.href = `${gamePath}?joinRoom=${encodeURIComponent(session.roomId || "")}`;
        });
        actions.appendChild(openBtn);
        row.appendChild(actions);
        activeSessionsList.appendChild(row);
      });
      if (!activeSessionsList.childElementCount) activeSessionsList.appendChild(buildSocialEmptyState("Temiz", "Aktif veya incelemeye açık oyun oturumun yok."));
      activeSessionsBox.appendChild(activeSessionsList);

      const missionBox = document.createElement("div");
      missionBox.className = "ps-panel-subcard";
      const missionSummary = payload.missionBoard?.summary || { total: 0, completed: 0, pending: 0, completionPct: 0 };
      missionBox.innerHTML = `<div class="ps-subtitle-row"><strong>Görev Panosu</strong><span>%${escapeHtml(String(missionSummary.completionPct || 0))} tamamlandı</span></div>`;
      const missionMeta = document.createElement("div");
      missionMeta.className = "ps-metric-grid";
      missionMeta.append(
        buildMetricChip("Tamamlanan", missionSummary.completed || 0),
        buildMetricChip("Bekleyen", missionSummary.pending || 0),
        buildMetricChip("Toplam", missionSummary.total || 0)
      );
      missionBox.appendChild(missionMeta);
      const missionList = document.createElement("div");
      missionList.className = "ps-mini-list";
      (payload.missionBoard?.items || []).slice(0, 5).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        row.innerHTML = `<strong>${escapeHtml(item.label || "Görev")}</strong><span>${escapeHtml(String(item.current || 0))}/${escapeHtml(String(item.target || 0))} · %${escapeHtml(String(item.progressPct || 0))}</span>`;
        missionList.appendChild(row);
      });
      if (!missionList.childElementCount) missionList.appendChild(buildSocialEmptyState("Boş", "Henüz görev görünmüyor."));
      missionBox.appendChild(missionList);

      const achievementBox = document.createElement("div");
      achievementBox.className = "ps-panel-subcard";
      const achievementSummary = payload.achievements?.summary || { total: 0, unlocked: 0, completionPct: 0 };
      achievementBox.innerHTML = `<div class="ps-subtitle-row"><strong>Başarılar</strong><span>${escapeHtml(String(achievementSummary.unlocked || 0))}/${escapeHtml(String(achievementSummary.total || 0))} açık</span></div>`;
      const achievementMeta = document.createElement("div");
      achievementMeta.className = "ps-metric-grid";
      achievementMeta.append(
        buildMetricChip("Açılan", achievementSummary.unlocked || 0),
        buildMetricChip("Kilitli", achievementSummary.locked || 0),
        buildMetricChip("Tamamlanma", `%${achievementSummary.completionPct || 0}`)
      );
      achievementBox.appendChild(achievementMeta);
      const achievementList = document.createElement("div");
      achievementList.className = "ps-mini-list";
      (payload.achievements?.items || []).slice(0, 5).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        row.innerHTML = `<strong>${escapeHtml(`${item.icon || "⭐"} ${item.label || "Başarı"}`)}</strong><span>${escapeHtml(item.unlocked ? "Açıldı" : `%${item.progressPct || 0} ilerleme`)}</span>`;
        achievementList.appendChild(row);
      });
      if (!achievementList.childElementCount) achievementList.appendChild(buildSocialEmptyState("Boş", "Henüz başarı görünmüyor."));
      achievementBox.appendChild(achievementList);

      const vipCenterBox = document.createElement("div");
      vipCenterBox.className = "ps-panel-subcard pm-vip-subcard";
      const vipCenter = getVipCenterData(payload.vipCenter || state.vipCenter);
      vipCenterBox.innerHTML = `<div class="ps-subtitle-row"><strong>VIP Merkezi</strong><span>${escapeHtml(vipCenter.label || 'Standart')}</span></div>`;
      const vipMeta = document.createElement("div");
      vipMeta.className = "ps-metric-grid";
      vipMeta.append(
        buildMetricChip("Aktif Ayrıcalık", vipCenter?.overview?.activePerkCount || 0),
        buildMetricChip("Görünüm", vipCenter?.overview?.appearanceUnlockCount || 0),
        buildMetricChip("Sonraki", vipCenter?.progress?.nextLabel || '-')
      );
      vipCenterBox.appendChild(vipMeta);
      const vipCenterList = document.createElement("div");
      vipCenterList.className = "ps-mini-list";
      (vipCenter?.perks?.unlocked || []).slice(0, 4).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        row.innerHTML = `<strong>${escapeHtml(item.label || 'VIP ayrıcalığı')}</strong><span>${escapeHtml(item.category || 'vip')}</span>`;
        vipCenterList.appendChild(row);
      });
      if (!vipCenterList.childElementCount) vipCenterList.appendChild(buildSocialEmptyState("Boş", "Henüz aktif VIP ayrıcalığı görünmüyor."));
      vipCenterBox.appendChild(vipCenterList);

      const rewardBox = document.createElement("div");
      rewardBox.className = "ps-panel-subcard";
      const rewardSummary = payload.rewardCenter?.summary || { totalMc: 0, itemCount: 0, categories: [] };
      rewardBox.innerHTML = `<div class="ps-subtitle-row"><strong>Ödül Merkezi</strong><span>Toplam ${escapeHtml(formatNumber(rewardSummary.totalMc || 0))} MC</span></div>`;
      const rewardMeta = document.createElement("div");
      rewardMeta.className = "ps-metric-grid";
      rewardMeta.append(
        buildMetricChip("Kayıt", rewardSummary.itemCount || 0),
        buildMetricChip("Kategori", (payload.rewardCenter?.catalogSummary?.categoryCount || (rewardSummary.categories || []).length || 0)),
        buildMetricChip("Son Ödül", payload.rewardCenter?.items?.[0]?.label || "-")
      );
      rewardBox.appendChild(rewardMeta);
      const rewardList = document.createElement("div");
      rewardList.className = "ps-mini-list";
      (payload.rewardCenter?.items || []).slice(0, 4).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        row.innerHTML = `<strong>${escapeHtml(item.label || item.source || "Ödül")}</strong><span>${escapeHtml(formatNumber(item.amount || 0))} ${escapeHtml(item.currency || "MC")} · ${escapeHtml(formatClockTime(item.createdAt || item.timestamp || Date.now()))}</span>`;
        rewardList.appendChild(row);
      });
      (payload.rewardCenter?.catalog || []).slice(0, 3).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        const amountText = item.grantType === "fixed"
          ? `${formatNumber(item.amount || 0)} ${item.currency || "MC"}`
          : (item.amountMin || item.amountMax)
            ? `${formatNumber(item.amountMin || 0)}-${formatNumber(item.amountMax || 0)} ${item.currency || "MC"}`
            : (item.formula || item.cadence || "Dinamik");
        row.innerHTML = `<strong>${escapeHtml(item.label || "Katalog")}</strong><span>${escapeHtml(amountText)} · ${escapeHtml(item.category || "sistem")}</span>`;
        rewardList.appendChild(row);
      });
      if (!rewardList.childElementCount) rewardList.appendChild(buildSocialEmptyState("Boş", "Henüz kayıtlı bir ödül görünmüyor."));
      rewardBox.appendChild(rewardList);

      const matchCenterBox = document.createElement("div");
      matchCenterBox.className = "ps-panel-subcard";
      const matchSummary = payload.matchCenter?.summary || { totalMatches: 0, wins: 0, losses: 0, draws: 0, totalRewardMc: 0, byGame: {} };
      matchCenterBox.innerHTML = `<div class="ps-subtitle-row"><strong>Maç Merkezi</strong><span>${escapeHtml(String(matchSummary.totalMatches || 0))} kayıt</span></div>`;
      const matchMeta = document.createElement("div");
      matchMeta.className = "ps-metric-grid";
      matchMeta.append(
        buildMetricChip("Galibiyet", matchSummary.wins || 0),
        buildMetricChip("Mağlubiyet", matchSummary.losses || 0),
        buildMetricChip("Ödül", formatNumber(matchSummary.totalRewardMc || 0))
      );
      matchCenterBox.appendChild(matchMeta);
      const matchCenterList = document.createElement("div");
      matchCenterList.className = "ps-mini-list";
      (payload.matchCenter?.items || []).slice(0, 5).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        row.innerHTML = `<strong>${escapeHtml(item.title || item.gameType || "Maç")}</strong><span>${escapeHtml(item.outcome || item.result || "tamamlandı")} · ${escapeHtml(formatClockTime(item.createdAt || Date.now()))}</span>`;
        matchCenterList.appendChild(row);
      });
      if (!matchCenterList.childElementCount) matchCenterList.appendChild(buildSocialEmptyState("Boş", "Henüz maç geçmişi görünmüyor."));
      matchCenterBox.appendChild(matchCenterList);

      const overviewBox = document.createElement("div");
      overviewBox.className = "ps-panel-subcard";
      overviewBox.innerHTML = `<div class="ps-subtitle-row"><strong>Operasyon Özeti</strong><span>Canlı merkez kartları</span></div>`;
      const overviewGrid = document.createElement("div");
      overviewGrid.className = "ps-metric-grid";
      (payload.overviewCards || []).forEach((item) => {
        overviewGrid.appendChild(buildMetricChip(item.label || item.key || "Kart", formatNumber(item.value || 0)));
      });
      if (!overviewGrid.childElementCount) overviewGrid.appendChild(buildSocialEmptyState("Boş", "Şu an gösterilecek özet kartı yok."));
      overviewBox.appendChild(overviewGrid);

      const feedBox = document.createElement("div");
      feedBox.className = "ps-panel-subcard";
      feedBox.innerHTML = `<div class="ps-subtitle-row"><strong>Aktivite Akışı</strong><span>${escapeHtml(String((payload.activityFeed || []).length))} olay</span></div>`;
      const feedList = document.createElement("div");
      feedList.className = "ps-mini-list";
      (payload.activityFeed || []).slice(0, 8).forEach((item) => {
        const row = document.createElement("div");
        row.className = "ps-mini-match";
        row.innerHTML = `<strong>${escapeHtml(item.title || item.type || "Etkinlik")}</strong><span>${escapeHtml(formatClockTime(item.createdAt || Date.now()))} · ${escapeHtml(item.result || `${(item.participants || []).length} oyuncu`)}</span>`;
        feedList.appendChild(row);
      });
      if (!feedList.childElementCount) feedList.appendChild(buildSocialEmptyState("Boş", "Henüz sosyal aktivite akışı oluşmadı."));
      feedBox.appendChild(feedList);

      card.append(top, metricRow, showcaseBox, passBox, overviewBox, missionBox, achievementBox, vipCenterBox, rewardBox, matchCenterBox, activeSessionsBox, columns, feedBox);
      stream.appendChild(card);
    }

    function renderPartyPanel(stream, entry) {
      const refreshBtn = document.createElement("button");
      refreshBtn.className = "icon-btn";
      refreshBtn.type = "button";
      refreshBtn.title = "Partiyi yenile";
      refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
      refreshBtn.addEventListener("click", () => loadPartySnapshot(true));

      setSocialHeader({ title: "Parti Merkezi" }, "Parti, davetler ve hazır durumu");
      setSocialHeaderActions([refreshBtn]);
      setComposerState({ visible: false, help: state.social.partyError || "Arkadaşlarınla hazır olup tek noktadan oyuna geçebilirsin.", tone: state.social.partyError ? "error" : "" });

      const party = state.social.partySnapshot;
      const currentUid = auth.currentUser?.uid || "";
      const incomingInvites = Array.isArray(state.social.partyInvites) ? state.social.partyInvites : [];
      if (entry?.type === "party-invite") {
        const card = document.createElement("section");
        card.className = "ps-panel-card";
        card.innerHTML = `<div class="ps-subtitle-row"><strong>${escapeHtml(entry?.fromMember?.username || 'Parti daveti')}</strong><span>Süresi sınırlı davet</span></div>`;
        const actions = document.createElement("div");
        actions.className = "ps-request-actions";
        const acceptBtn = document.createElement("button");
        acceptBtn.className = "btn btn-primary";
        acceptBtn.textContent = "Kabul Et";
        acceptBtn.addEventListener("click", () => respondPartyInvite(entry.inviteId, "accept"));
        const declineBtn = document.createElement("button");
        declineBtn.className = "ghost-btn";
        declineBtn.textContent = "Reddet";
        declineBtn.addEventListener("click", () => respondPartyInvite(entry.inviteId, "decline"));
        actions.append(acceptBtn, declineBtn);
        card.appendChild(actions);
        stream.appendChild(card);
        return;
      }

      const card = document.createElement("section");
      card.className = "ps-panel-card ps-dashboard-card";
      const top = document.createElement("div");
      top.className = "ps-subtitle-row";
      top.innerHTML = `<strong>${party ? 'Aktif Parti' : 'Henüz Parti Yok'}</strong><span>${party ? `${party.members?.length || 0} üye` : 'Davet atınca otomatik açılır'}</span>`;
      card.appendChild(top);

      if (!party) {
        const createBox = document.createElement("div");
        createBox.className = "ps-panel-subcard";
        const createBtn = document.createElement("button");
        createBtn.className = "btn btn-primary";
        createBtn.type = "button";
        createBtn.textContent = "Parti Oluştur";
        createBtn.addEventListener("click", ensureParty);
        createBox.appendChild(createBtn);
        if (state.friends.accepted?.length) {
          const select = document.createElement("select");
          select.id = "partyInviteFriendSelect";
          select.className = "field-select";
          select.innerHTML = `<option value="">Arkadaş seç</option>` + state.friends.accepted.map((item) => `<option value="${escapeHtml(item.uid)}">${escapeHtml(item.username || item.uid)}</option>`).join("");
          const inviteBtn = document.createElement("button");
          inviteBtn.className = "ghost-btn";
          inviteBtn.type = "button";
          inviteBtn.textContent = "Parti Daveti Gönder";
          inviteBtn.addEventListener("click", () => {
            const uid = $("partyInviteFriendSelect")?.value || "";
            if (!uid) return showToast("Parti Merkezi", "Önce bir arkadaş seç.", "info");
            inviteFriendToParty(uid);
          });
          const row = document.createElement("div");
          row.className = "ps-inline-actions";
          row.append(select, inviteBtn);
          createBox.appendChild(row);
        }
        card.appendChild(createBox);
      } else {
        const partyMemberGrid = document.createElement("div");
        partyMemberGrid.className = "ps-mini-list";
        (party.members || []).forEach((member) => {
          const row = document.createElement("div");
          row.className = "ps-party-member";
          row.appendChild(createPremiumAvatarNode(member.avatar || AVATARS[0], Number(member.selectedFrame || 0), 38, "pm-premium-avatar--social-list"));
          const copy = document.createElement("div");
          copy.innerHTML = `<strong>${escapeHtml(member.username || member.uid || 'Oyuncu')}</strong><span>${escapeHtml(member.role === 'leader' ? 'Lider' : member.ready ? 'Hazır' : 'Bekliyor')}</span>`;
          row.appendChild(copy);
          if (currentUid === party.leaderUid && member.uid !== currentUid) {
            const actions = document.createElement("div");
            actions.className = "ps-inline-actions ps-inline-actions--compact";
            const promoteBtn = document.createElement("button");
            promoteBtn.className = "ghost-btn";
            promoteBtn.type = "button";
            promoteBtn.textContent = "Lider Yap";
            promoteBtn.addEventListener("click", () => promotePartyMember(member.uid));
            const kickBtn = document.createElement("button");
            kickBtn.className = "ghost-btn";
            kickBtn.type = "button";
            kickBtn.textContent = "Çıkar";
            kickBtn.addEventListener("click", () => kickPartyMember(member.uid));
            actions.append(promoteBtn, kickBtn);
            row.appendChild(actions);
          }
          partyMemberGrid.appendChild(row);
        });
        card.appendChild(partyMemberGrid);

        const selfMember = (party.members || []).find((item) => item.uid === currentUid);
        const controls = document.createElement("div");
        controls.className = "ps-inline-actions";
        const readyBtn = document.createElement("button");
        readyBtn.className = "btn btn-primary";
        readyBtn.type = "button";
        readyBtn.textContent = selfMember?.ready ? "Hazır Değil" : "Hazırım";
        readyBtn.addEventListener("click", () => setPartyReady(!selfMember?.ready));
        const leaveBtn = document.createElement("button");
        leaveBtn.className = "ghost-btn";
        leaveBtn.type = "button";
        leaveBtn.textContent = "Partiden Ayrıl";
        leaveBtn.addEventListener("click", leaveParty);
        controls.append(readyBtn, leaveBtn);

        const contextSelect = document.createElement("select");
        contextSelect.className = "field-select";
        contextSelect.id = "partyContextSelect";
        contextSelect.innerHTML = `
          <option value="">Hedef oyun seç</option>
          <option value="chess" ${party.gameContext?.gameType === 'chess' ? 'selected' : ''}>Satranç</option>
          <option value="pisti" ${party.gameContext?.gameType === 'pisti' ? 'selected' : ''}>Online Pişti</option>
        `;
        const contextBtn = document.createElement("button");
        contextBtn.className = "ghost-btn";
        contextBtn.type = "button";
        contextBtn.textContent = "Hedefi Kaydet";
        contextBtn.disabled = currentUid !== party.leaderUid;
        contextBtn.addEventListener("click", () => setPartyContext($("partyContextSelect")?.value || ""));

        const inviteRow = document.createElement("div");
        inviteRow.className = "ps-inline-actions";
        const friendSelect = document.createElement("select");
        friendSelect.id = "partyInviteFriendSelect";
        friendSelect.className = "field-select";
        friendSelect.innerHTML = `<option value="">Arkadaş seç</option>` + state.friends.accepted.map((item) => `<option value="${escapeHtml(item.uid)}">${escapeHtml(item.username || item.uid)}</option>`).join("");
        const inviteBtn = document.createElement("button");
        inviteBtn.className = "ghost-btn";
        inviteBtn.type = "button";
        inviteBtn.disabled = currentUid !== party.leaderUid;
        inviteBtn.textContent = "Parti Daveti Gönder";
        inviteBtn.addEventListener("click", () => {
          const uid = $("partyInviteFriendSelect")?.value || "";
          if (!uid) return showToast("Parti Merkezi", "Önce bir arkadaş seç.", "info");
          inviteFriendToParty(uid);
        });
        inviteRow.append(friendSelect, inviteBtn, contextSelect, contextBtn);

        card.append(controls, inviteRow);
      }

      if (incomingInvites.length) {
        const invitesBox = document.createElement("div");
        invitesBox.className = "ps-panel-subcard";
        invitesBox.innerHTML = `<div class="ps-subtitle-row"><strong>Gelen Parti Davetleri</strong><span>${escapeHtml(String(incomingInvites.length))} bekliyor</span></div>`;
        const inviteList = document.createElement("div");
        inviteList.className = "ps-mini-list";
        incomingInvites.forEach((invite) => {
          const row = document.createElement("div");
          row.className = "ps-party-invite-row";
          row.innerHTML = `<div><strong>${escapeHtml(invite?.fromMember?.username || 'Arkadaşın')}</strong><span>Partine katılmanı istiyor</span></div>`;
          const actions = document.createElement("div");
          actions.className = "ps-inline-actions ps-inline-actions--compact";
          const acceptBtn = document.createElement("button");
          acceptBtn.className = "btn btn-primary";
          acceptBtn.type = "button";
          acceptBtn.textContent = "Kabul";
          acceptBtn.addEventListener("click", () => respondPartyInvite(invite.id, "accept"));
          const declineBtn = document.createElement("button");
          declineBtn.className = "ghost-btn";
          declineBtn.type = "button";
          declineBtn.textContent = "Reddet";
          declineBtn.addEventListener("click", () => respondPartyInvite(invite.id, "decline"));
          actions.append(acceptBtn, declineBtn);
          row.appendChild(actions);
          inviteList.appendChild(row);
        });
        invitesBox.appendChild(inviteList);
        card.appendChild(invitesBox);
      }

      stream.appendChild(card);
    }

    function renderSearchPanel(stream) {
      setSocialHeader({ title: "Mesaj Arama" }, state.social.dmSearchTargetUid ? "Seçili arkadaş konuşmasında arama" : "Tüm DM konuşmalarında arama");
      setSocialHeaderActions();
      setComposerState({ visible: false, help: "En az 2 karakter yazarak DM geçmişinde arama yapabilirsin." });
      const card = document.createElement("section");
      card.className = "ps-panel-card ps-dashboard-card";
      card.innerHTML = `
        <div class="ps-inline-actions">
          <input id="dmSearchInput" class="field-input" type="text" maxlength="80" placeholder="Mesajlarda ara" value="${escapeHtml(state.social.dmSearchQuery || '')}">
          <select id="dmSearchTargetSelect" class="field-select"><option value="">Tüm arkadaşlar</option>${(state.friends.accepted || []).map((item) => `<option value="${escapeHtml(item.uid)}" ${(state.social.dmSearchTargetUid === item.uid) ? 'selected' : ''}>${escapeHtml(item.username || item.uid)}</option>`).join('')}</select>
          <button id="dmSearchBtn" class="btn btn-primary" type="button">Ara</button>
        </div>
      `;
      stream.appendChild(card);
      $("dmSearchBtn")?.addEventListener("click", () => searchDirectMessages($("dmSearchInput")?.value || "", $("dmSearchTargetSelect")?.value || ""));
      $("dmSearchInput")?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchDirectMessages($("dmSearchInput")?.value || "", $("dmSearchTargetSelect")?.value || ""); } });
      const resultWrap = document.createElement("div");
      resultWrap.className = "ps-mini-list";
      if (state.social.dmSearchLoading) {
        resultWrap.appendChild(buildSocialEmptyState("Aranıyor", "Mesajlar taranıyor..."));
      } else if (!(state.social.dmSearchResults || []).length) {
        resultWrap.appendChild(buildSocialEmptyState("Sonuç yok", state.social.dmSearchQuery ? "Eşleşen mesaj bulunamadı." : "Aramak istediğin kelimeyi yaz."));
      } else {
        (state.social.dmSearchResults || []).forEach((item) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "ps-search-result";
          row.appendChild(createPremiumAvatarNode(item?.peer?.avatar || AVATARS[0], Number(item?.peer?.selectedFrame || 0), 34, "pm-premium-avatar--social-list"));
          const copy = document.createElement("div");
          copy.innerHTML = `<strong>${escapeHtml(item?.peer?.username || 'Oyuncu')}</strong><span>${escapeHtml(item.text || '')}</span><small>${escapeHtml(formatClockTime(item.createdAt || Date.now()))}</small>`;
          row.appendChild(copy);
          row.addEventListener("click", () => {
            setSocialTab("friends", { preferredKey: `friend:${item.peerUid}`, openPanel: true });
            selectSocialItem(`friend:${item.peerUid}`, { openPanel: true });
          });
          resultWrap.appendChild(row);
        });
      }
      stream.appendChild(resultWrap);
    }

function renderSocialMain() {
      const stream = $("psChatStream");
      if (!stream) return;
      stream.replaceChildren();

      const entry = ensureSocialSelection();
      if (!entry) {
        setSocialHeader({ title: "Sosyal Merkez" }, "Bir öğe seçildiğinde ayrıntılar burada açılır");
        setSocialHeaderActions();
        setComposerState({ visible: false, help: "Sol taraftan bir sekme ve kayıt seçerek devam et." });
        stream.appendChild(buildSocialEmptyState("İçerik bekleniyor", "Listeden bir öğe seçtiğinde sağ panel o görünüm için hazırlanır."));
        return;
      }

      if (state.social.activeTab === "friends" && !entry.uid) {
        setSocialHeader({ title: "Arkadaşlar" }, "Aktif bir arkadaş seçilmedi");
        setSocialHeaderActions();
        setComposerState({ visible: false, help: "Özel sohbete başlamak için orta listeden bir arkadaş seç." });
        stream.appendChild(buildSocialEmptyState("Arkadaş seç", "Çevrimiçi durum ve özel mesaj alanı seçimin sonrası yüklenir."));
        return;
      }

      if (state.social.activeTab === "invites" && !entry.uid) {
        setSocialHeader({ title: "Oyun Daveti" }, "Kimseye davet gönderilmiyor");
        setSocialHeaderActions();
        setComposerState({ visible: false, help: "Davet etmek için listeden bir arkadaşını seç." });
        stream.appendChild(buildSocialEmptyState("Arkadaş seç", "Oyun daveti gönderebilmek için sol listeden bir arkadaşını seçmelisin."));
        return;
      }

      if (state.social.activeTab === "requests" && !entry.friendshipId) {
        setSocialHeader({ title: "İstekler" }, "Bekleyen sosyal işlem yok");
        setSocialHeaderActions();
        setComposerState({ visible: false, help: "Yeni istek geldiğinde bu ekran otomatik güncellenir." });
        stream.appendChild(buildSocialEmptyState("Bekleyen kayıt yok", "Şu an yönetilecek bir arkadaşlık isteği görünmüyor."));
        return;
      }

      if (state.social.activeTab === "hub") {
        renderHubPanel(stream);
        return;
      }
      if (state.social.activeTab === "friends") {
        renderFriendPanel(stream, entry);
        return;
      }
      if (state.social.activeTab === "party") {
        renderPartyPanel(stream, entry);
        return;
      }
      if (state.social.activeTab === "search") {
        renderSearchPanel(stream);
        return;
      }
      if (state.social.activeTab === "invites") {
        renderInvitePanel(stream, entry);
        return;
      }
      if (state.social.activeTab === "requests") {
        renderRequestPanel(stream, entry);
        return;
      }
      if (state.social.activeTab === "add") {
        renderAddPanel(stream);
        return;
      }
      renderGlobalPanel(stream);
    }

    function renderSocialTabs() {
      document.querySelectorAll(".ps-tab").forEach((tabButton) => {
        tabButton.classList.toggle("is-active", tabButton.dataset.socialTab === state.social.activeTab);
      });
    }

    function renderSocialHub() {
      if (!$("psListContainer") || !$("psMainPanel")) return;
      ensureSocialSelection();
      renderSocialTabs();
      renderSocialList();
      renderSocialMain();
      updateSocialConnectionBadge();
      handleSocialComposerInput();
    }

    async function loadFriends() {
      if (!auth.currentUser) return;
      try {
        const payload = await fetchPrivate("/api/friends/list");
        state.friends = {
          accepted: Array.isArray(payload.accepted) ? payload.accepted.map(hydrateFriendEntry) : [],
          incoming: Array.isArray(payload.incoming) ? payload.incoming.map(hydrateFriendEntry) : [],
          outgoing: Array.isArray(payload.outgoing) ? payload.outgoing.map(hydrateFriendEntry) : [],
          counts: payload.counts || { accepted:0, incoming:0, outgoing:0, online:0 }
        };
        if (state.currentSheet === "social") refreshSocialFeaturePack().catch(() => null);
        renderSocialHub();
      } catch (error) {
        const helpEl = $("friendActionHelp");
        if (helpEl) {
          helpEl.textContent = error.message || "Arkadaş listesi yüklenemedi.";
          helpEl.className = "ps-field-help";
        }
      }
    }

    async function handleFriendAdd() {
      try {
        const target = ($("friendTargetInput")?.value || "").trim();
        if (!target) throw new Error("Lütfen tam kullanıcı adını yazın.");
        setFieldHelp("friendActionHelp", "", "");
        const payload = await fetchPrivate("/api/friends/request", "POST", { target });
        if ($("friendTargetInput")) $("friendTargetInput").value = "";
        setFieldHelp("friendActionHelp", payload.message || "Arkadaşlık isteği gönderildi.", "success");
        showToast("Arkadaşlık işlemi", payload.message || "İstek gönderildi.", "success");
        await loadFriends();
      } catch (error) {
        setFieldHelp("friendActionHelp", error.message || "İstek gönderilemedi.", "error");
      }
    }

    window.sendFriendRequest = async function sendFriendRequest(uid) {
      try {
        if (!ensureAuthThen("Arkadaş ekleme")) return;
        const targetUid = String(uid || "").trim();
        if (!targetUid) throw new Error("Kullanıcı bilgisi eksik.");
        const payload = await fetchPrivate("/api/friends/request", "POST", { targetUid });
        showToast("Arkadaşlık işlemi", payload.message || "İstek gönderildi.", "success");
        await loadFriends();
        closeMatrixModal("playerStatsModal");
      } catch (error) {
        showToast("Arkadaşlık hatası", error.message || "İstek gönderilemedi.", "error");
      }
    };

    async function respondFriendRequest(friendshipId, action) {
      try {
        await fetchPrivate("/api/friends/respond", "POST", { friendshipId, action });
        showToast("Arkadaşlık işlemi", action === "accept" ? "İstek kabul edildi." : "İstek reddedildi.", action === "accept" ? "success" : "info");
        await loadFriends();
      } catch (error) {
        showToast("Arkadaşlık hatası", error.message || "İşlem tamamlanamadı.", "error");
      }
    }

    async function removeFriend(entry) {
      try {
        const confirmed = await showActionDialog({
          title: "Bu bağlantı kaldırılsın mı?",
          message: entry.status === "accepted"
            ? `${entry.username} artık arkadaş listende görünmeyecek.`
            : `${entry.username} için bekleyen istek kaldırılacak.`,
          confirmText: entry.status === "accepted" ? "Arkadaşı Kaldır" : "İsteği Kaldır",
          cancelText: "Vazgeç"
        });
        if (!confirmed) return;
        await fetchPrivate("/api/friends/remove", "POST", { friendshipId: entry.friendshipId, targetUid: entry.uid });
        showToast("Sosyal Merkez", entry.status === "accepted" ? "Arkadaş listesi güncellendi." : "Bekleyen istek kaldırıldı.", "info");
        if (entry.uid && state.social.unreadDirect[entry.uid]) delete state.social.unreadDirect[entry.uid];
        await loadFriends();
      } catch (error) {
        showToast("Sosyal Merkez", error.message || "Kaldırılamadı.", "error");
      }
    }

    async function createInviteForFriend(entry) {
      try {
        if (!ensureAuthThen("Sosyal Merkez")) return;
        const socket = await ensureRealtimeConnection();
        if (!socket) throw new Error("Canlı bağlantı kurulamadı.");

        if (!entry?.online) throw new Error("Bu oyuncu şu anda çevrimdışı.");

        const config = getSelectedInviteConfig();
        let roomId = "";

        if (config.gameKey === "chess") {
          const payload = await fetchPrivate("/api/chess/create", "POST", {});
          roomId = payload?.room?.id || "";
        } else {
          const payload = await fetchPrivate("/api/pisti-online/create-private", "POST", {
            mode: config.mode,
            bet: config.bet,
            roomName: `${state.userData?.username || "PlayMatrix"} Özel Oda`,
            password: ""
          });
          roomId = payload?.room?.id || "";
        }

        if (!roomId) throw new Error("Davet odası hazırlanamadı.");

        state.social.pendingInviteNavigation = {
          roomId,
          gameKey: config.gameKey,
          gameCode: config.gameKey,
          gamePath: config.gameKey === "chess" ? "./Online Oyunlar/Satranc.html" : "./Online Oyunlar/Pisti.html",
          targetUid: entry.uid
        };

        socket.emit("game:invite_send", {
          targetUid: entry.uid,
          roomId,
          gameKey: config.gameKey,
          gameName: config.gameName
        });

        showToast("Davet hazırlanıyor", "Sunucu onayı bekleniyor. Başarılı olduğunda odaya otomatik geçeceksiniz.", "info");
      } catch (error) {
        state.social.pendingInviteNavigation = null;
        showToast("Davet hatası", error.message || "Davet gönderilemedi.", "error");
      }
    }

    function handleSocialComposerInput() {
      const input = $("psChatInput");
      const helpEl = $("psChatHelp");
      if (!input || !helpEl || helpEl.classList.contains("is-error")) return;
      const size = (input.value || "").trim().length;
      const base = state.social.activeTab === "friends" ? "" : "";
      const text = size > 0 ? (base ? `${size}/280 · ${base}` : `${size}/280`) : base;
      helpEl.textContent = text;
      helpEl.className = "ps-chat-help";
      helpEl.style.display = text ? "block" : "none";
    }

    async function sendSocialMessage() {
      try {
        if (!ensureAuthThen("Sosyal Merkez")) return;
        const socket = await ensureRealtimeConnection();
        if (!socket) throw new Error("Canlı bağlantı kurulamadı.");

        const input = $("psChatInput");
        const message = (input?.value || "").trim();
        if (!message) throw new Error("Mesaj boş bırakılamaz.");
        if (message.length > 280) throw new Error("Mesaj en fazla 280 karakter olabilir.");

        await primeRealtimeUX();

        if (state.social.activeTab === "friends") {
          const entry = getSelectedSocialEntry();
          if (!entry?.uid) throw new Error("Önce bir arkadaş seçmelisin.");

          const clientTempId = window.crypto?.randomUUID?.() || `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          socket.emit("chat:dm_send", { toUid: entry.uid, targetUid: entry.uid, message, clientTempId });
          if (socket.connected) socket.emit("chat:typing", { toUid: entry.uid, isTyping: false });
          clearDirectTypingState(false);
          playSound("send");
          if (input) {
            input.value = "";
            input.focus({ preventScroll: true });
          }
          handleSocialComposerInput();
          setComposerState({ visible: true, placeholder: `${entry.username || "Arkadaşın"} için mesaj yaz...`, help: "Mesaj sunucuya iletiliyor...", tone: "" });
          return;
        }

        socket.emit("chat:lobby_send", { message });
        playSound("send");
        if (input) {
          input.value = "";
          input.focus({ preventScroll: true });
        }
        handleSocialComposerInput();
        setComposerState({ visible: true, placeholder: "Lobiye kısa ve temiz bir mesaj yaz...", help: "Mesaj gönderildi. Lobi akışında görünür hale geliyor.", tone: "success" });
      } catch (error) {
        const helpEl = $("psChatHelp");
        if (helpEl) {
          helpEl.textContent = error.message || "Mesaj gönderilemedi.";
          helpEl.className = "ps-chat-help is-error";
        }
      }
    }

    async function showActionDialog({ title, message, confirmText = "Tamam", cancelText = "Vazgeç" }) {
      return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "pm-dialog-backdrop";

        const dialog = document.createElement("div");
        dialog.className = "pm-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");

        const titleEl = document.createElement("h4");
        titleEl.textContent = title;

        const messageEl = document.createElement("p");
        messageEl.textContent = message;

        const actions = document.createElement("div");
        actions.className = "pm-dialog-actions";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "ghost-btn";
        cancelBtn.textContent = cancelText;

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "btn btn-primary";
        confirmBtn.textContent = confirmText;

        const cleanup = (result) => {
          backdrop.remove();
          resolve(result);
        };

        cancelBtn.addEventListener("click", () => cleanup(false));
        confirmBtn.addEventListener("click", () => cleanup(true));
        backdrop.addEventListener("click", (event) => {
          if (event.target === backdrop) cleanup(false);
        });

        actions.append(cancelBtn, confirmBtn);
        dialog.append(titleEl, messageEl, actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
      });
    }

    async function confirmPotentialCrashExit() {
      try {
        if (!auth.currentUser) return true;
        const payload = await fetchPrivate("/api/crash/active-bets");
        if (!payload?.hasActiveBet) return true;
        const warning = payload.hasRiskyBet
          ? "Şu an auto cashout tanımı olmayan aktif Crash bahsin var. Sayfadan çıkarsan tur devam eder ve patlama riski sana ait olur. Yine de davete gitmek istiyor musun?"
          : "Şu an aktif Crash bahsin bulunuyor. Sayfadan ayrıldığında tur arka planda devam eder. Davete geçmek istediğinden emin misin?";
        return await showActionDialog({
          title: "Aktif Crash Bahsi Tespit Edildi",
          message: warning,
          confirmText: "Yine de Devam Et",
          cancelText: "Kal"
        });
      } catch (_) {
        return true;
      }
    }

    function removeInviteToast(inviteId) {
      const toast = state.inviteToasts.get(inviteId);
      if (toast) toast.remove();
      state.inviteToasts.delete(inviteId);
    }

    async function handleIncomingInviteResponse(data, response) {
      try {
        if (!data?.inviteId) return;
        if (response === "accepted") {
          const canContinue = await confirmPotentialCrashExit();
          if (!canContinue) return;

          if (data.gameKey === "chess") {
            await fetchPrivate("/api/chess/join", "POST", { roomId: data.roomId });
          } else if (data.gameKey === "pisti") {
            await fetchPrivate("/api/pisti-online/join", "POST", { roomId: data.roomId });
          } else {
            throw new Error("Bilinmeyen davet türü.");
          }
        }

        if (state.socket) {
          state.socket.emit("game:invite_response", {
            inviteId: data.inviteId,
            hostUid: data.hostUid,
            roomId: data.roomId,
            gameKey: data.gameKey,
            response
          });
        }

        removeInviteToast(data.inviteId);

        if (response === "accepted") {
          // 2. DAVETİ KABUL EDENİ DİREKT OYUNA YÖNLENDİRME (Lobi Atlatıcı)
          showToast("Oyuna Bağlanılıyor", "Oyun odasına aktarılıyorsunuz...", "success");
          
          setTimeout(() => {
            sessionStorage.setItem("pm_auto_join_room", data.roomId);
            sessionStorage.setItem("pm_auto_join_game", data.gameKey);
            
            const targetHref = data.gameKey === "chess"
              ? `/Online Oyunlar/Satranc.html?joinRoom=${encodeURIComponent(data.roomId)}`
              : `/Online Oyunlar/Pisti.html?joinRoom=${encodeURIComponent(data.roomId)}`;
            window.location.href = targetHref;
          }, 1000);

        } else {
          showToast("Oyun daveti", `${data.hostName || "Arkadaşın"} tarafından gönderilen davet kapatıldı.`, "info");
        }
      } catch (error) {
        showToast("Davet katılımı başarısız", error.message || "Odaya katılım sağlanamadı.", "error");
      }
    }

    function showInviteToast(data) {
      if (!data?.inviteId) return;
      removeInviteToast(data.inviteId);

      const { toast, body, closeBtn } = createToastBase({
        tone: "info",
        iconClass: "fa-gamepad",
        title: "Oyun Daveti"
      });

      closeBtn.addEventListener("click", () => {
        handleIncomingInviteResponse(data, "declined");
      });

      const message = document.createElement("div");
      message.className = "toast-message";
      message.textContent = `${data.hostName || "Bir oyuncu"} seni ${data.gameName || "oyuna"} çağırıyor.`;

      const actions = document.createElement("div");
      actions.className = "invite-toast-actions";

      const acceptBtn = document.createElement("button");
      acceptBtn.className = "btn btn-primary";
      acceptBtn.textContent = "Katıl";
      acceptBtn.addEventListener("click", () => handleIncomingInviteResponse(data, "accepted"));

      const declineBtn = document.createElement("button");
      declineBtn.className = "ghost-btn";
      declineBtn.textContent = "Reddet";
      declineBtn.addEventListener("click", () => handleIncomingInviteResponse(data, "declined"));

      actions.append(acceptBtn, declineBtn);
      body.append(message, actions);

      state.inviteToasts.set(data.inviteId, toast);
      appendToast(toast, 0);
      window.setTimeout(() => removeInviteToast(data.inviteId), 12000);
      if (typeof playSound === "function") playSound("incoming");
    }

    function registerSocketEvents(socket) {
      socket.on("connect", () => {
        state.realtimeConnected = true;
        updateSocialConnectionBadge();
        if (state.social.activeTab === "friends" && state.social.currentActiveDmUid) {
          loadDirectHistoryForPeer(state.social.currentActiveDmUid, { force: true });
        }
      });

      socket.on("disconnect", () => {
        state.realtimeConnected = false;
        clearDirectTypingState(false);
        updateSocialConnectionBadge();
      });

      socket.on("connect_error", async (error) => {
        state.realtimeConnected = false;
        updateSocialConnectionBadge("Bağlantı yenileniyor");
        if (String(error?.message || "").includes("BAD_TOKEN") && auth.currentUser) {
          try {
            await getIdToken(auth.currentUser, true);
            window.setTimeout(() => ensureRealtimeConnection(true).catch(() => null), 600);
          } catch (_) {}
        }
      });

      socket.on("chat:lobby_history", (payload) => {
        state.lobbyMessages = Array.isArray(payload?.messages) ? payload.messages.slice(-60) : [];
        if (!renderActiveLobbyStream() && state.currentSheet === "social") renderSocialHub();
      });

      socket.on("chat:lobby_new", (payload) => {
        state.lobbyMessages = [...state.lobbyMessages.filter((item) => item.id !== payload?.id), payload].slice(-60);
        if (!appendLobbyMessageToActiveStream(payload) && state.currentSheet === "social") renderSocialHub();
      });

      socket.on("chat:lobby_error", (payload) => {
        const helpEl = $("psChatHelp");
        if (helpEl) {
          helpEl.textContent = payload?.message || "Mesaj gönderilemedi.";
          helpEl.className = "ps-chat-help is-error";
        }
      });

      const applyIncomingDirectMessage = (payload) => {
        const result = rememberDirectMessage(payload);
        const peerUid = result?.peerUid;
        if (!peerUid || !result.inserted) return;

        const isActiveConversation = state.currentSheet === "social"
          && state.social.activeTab === "friends"
          && state.social.currentActiveDmUid === peerUid
          && (!isSocialMobile() || state.social.mobilePanelOpen);

        if (isActiveConversation) {
          state.social.unreadDirect[peerUid] = 0;
          updateTypingIndicator(peerUid, false);
        } else {
          state.social.unreadDirect[peerUid] = Number(state.social.unreadDirect[peerUid] || 0) + 1;
          playSound("incoming");
          showToast("Yeni özel mesaj", `${payload?.username || "Arkadaşın"} sana mesaj gönderdi.`, "info");
          if (document.hidden) {
            showNativeRealtimeNotification({
              title: `${payload?.username || "Arkadaşın"} sana yazdı`,
              body: payload?.message || payload?.text || "PlayMatrix DM bildirimi",
              tag: `pm-dm-${peerUid}`,
              data: { type: "dm", peerUid }
            });
          }
        }

        if (state.currentSheet === "social") renderSocialHub();
      };

      socket.on("chat:dm_history", (payload) => {
        const peerUid = payload?.targetUid || payload?.peerUid || "";
        if (!peerUid) return;
        const incoming = Array.isArray(payload?.messages) ? payload.messages : [];
        const normalized = incoming.map((item) => normalizeDirectMessagePayload(item, peerUid)).filter(Boolean);
        state.social.directMessages[peerUid] = normalized.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(-80);
        state.social.directHistoryLoadedAt[peerUid] = Date.now();
        delete state.social.directHistoryPending[peerUid];
        if (state.currentSheet === "social") renderSocialHub();
      });

      socket.on("chat:dm_new", applyIncomingDirectMessage);

      socket.on("chat:dm_success", (payload) => {
        const result = rememberDirectMessage(payload);
        if (!result?.peerUid) return;
        state.social.unreadDirect[result.peerUid] = 0;
        const helpEl = $("psChatHelp");
        if (helpEl && state.social.currentActiveDmUid === result.peerUid) {
          helpEl.textContent = "Mesaj teslim edildi.";
          helpEl.className = "ps-chat-help is-success";
        }
        if (state.currentSheet === "social") renderSocialHub();
      });

      socket.on("chat:dm_edited", (payload) => {
        const peerUid = payload?.byUid === auth.currentUser?.uid ? state.social.currentActiveDmUid : (payload?.byUid || "");
        const list = Array.isArray(state.social.directMessages[peerUid]) ? [...state.social.directMessages[peerUid]] : [];
        state.social.directMessages[peerUid] = list.map((item) => item.id === payload?.messageId ? { ...item, message: payload?.text || item.message, text: payload?.text || item.text, editedAt: payload?.editedAt || Date.now() } : item);
        if (state.currentSheet === "social") renderSocialHub();
      });

      socket.on("chat:dm_deleted", (payload) => {
        const peerUid = payload?.byUid === auth.currentUser?.uid ? state.social.currentActiveDmUid : (payload?.byUid || "");
        const list = Array.isArray(state.social.directMessages[peerUid]) ? [...state.social.directMessages[peerUid]] : [];
        state.social.directMessages[peerUid] = list.map((item) => item.id === payload?.messageId ? { ...item, message: "", text: "", deletedAt: payload?.deletedAt || Date.now() } : item).filter((item) => !item.deletedAt || !item.text);
        if (state.currentSheet === "social") renderSocialHub();
      });

      socket.on("chat:direct_sent", (payload) => {
        rememberDirectMessage(payload);
        if (state.currentSheet === "social") renderSocialHub();
      });

      socket.on("chat:typing_status", (payload) => {
        const peerUid = payload?.fromUid || payload?.sender || "";
        updateTypingIndicator(peerUid, !!payload?.isTyping);
      });

      const handleDirectError = (payload) => {
        const helpEl = $("psChatHelp");
        if (helpEl) {
          helpEl.textContent = payload?.message || "Özel mesaj gönderilemedi.";
          helpEl.className = "ps-chat-help is-error";
        }
      };

      socket.on("chat:direct_error", handleDirectError);
      socket.on("chat:dm_error", handleDirectError);
      socket.on("chat:error", handleDirectError);

      socket.on("friends:updated", () => {
        if (auth.currentUser) loadFriends();
      });

      socket.on("friends:presence", (payload) => {
        if (!payload?.uid) return;
        updateFriendPresence(payload.uid, payload.isOnline);
      });

      socket.on("social:presence_update", (payload) => {
        if (!payload?.uid) return;
        updateFriendPresence(payload.uid, payload.presence || null);
      });

      socket.on("friends:request_received", () => {
        showToast("Yeni arkadaşlık isteği", "Sosyal Merkez panelinde bekleyen yeni bir istek var.", "info");
        if (auth.currentUser) loadFriends();
      });

      socket.on("friends:request_result", (payload) => {
        showToast("Arkadaşlık güncellendi", payload?.accepted ? "Gönderdiğin istek kabul edildi." : "Gönderdiğin istek reddedildi.", payload?.accepted ? "success" : "info");
        if (auth.currentUser) loadFriends();
      });

      socket.on("friends:request_auto_accepted", () => {
        showToast("Arkadaş eklendi", "Karşılıklı istek bulundu ve bağlantı anında kuruldu.", "success");
        if (auth.currentUser) loadFriends();
      });

      socket.on("game:matchmake_joined", (payload) => {
        const gameType = payload?.gameType || state.social.pendingMatchmaking?.gameType || "";
        if (!gameType) return;
        state.social.pendingMatchmaking = {
          ...(state.social.pendingMatchmaking || {}),
          gameType,
          mode: payload?.mode || state.social.pendingMatchmaking?.mode || "",
          bet: payload?.bet || state.social.pendingMatchmaking?.bet || 0,
          queuedAt: payload?.queuedAt || Date.now()
        };
        showMatchmakingToast(gameType);
        updateMatchmakingToastMessage("Uygun bir rakip aranıyor... Sistem seni ilk uygun odada eşleştirecek.");
      });

      socket.on("game:matchmake_success", (payload) => {
        const gameType = payload?.gameType || state.social.pendingMatchmaking?.gameType || "";
        dismissMatchmakingToast();
        state.social.pendingMatchmaking = null;
        showToast("Eşleşme bulundu", "Rakip bulundu. Oyun odasına aktarılıyorsun...", "success");
        window.setTimeout(() => navigateToInviteRoom({
          roomId: payload?.roomId,
          gameKey: gameType,
          gameCode: gameType,
          gamePath: payload?.gamePath || getMatchmakingPagePath(gameType)
        }), 220);
      });

      socket.on("game:matchmake_left", () => {
        dismissMatchmakingToast();
        state.social.pendingMatchmaking = null;
      });

      socket.on("game:matchmake_error", (payload) => {
        dismissMatchmakingToast();
        state.social.pendingMatchmaking = null;
        showToast("Eşleşme hatası", payload?.message || "Hızlı eşleşme kurulamadı.", "error");
      });

      socket.on("game:invite_receive", (payload) => {
        if (document.hidden) {
          showNativeRealtimeNotification({
            title: `${payload?.hostName || "Arkadaşın"} seni davet ediyor`,
            body: `${payload?.gameName || "Oyun"} daveti hazır.`,
            tag: `pm-invite-${payload?.inviteId || payload?.roomId || "invite"}`,
            data: { type: "invite" }
          });
        }
        showInviteToast(payload);
      });

      socket.on("game:invite_success", (payload) => {
        const pending = state.social.pendingInviteNavigation;
        const targetPayload = { ...(pending || {}), ...(payload || {}) };
        state.social.pendingInviteNavigation = null;
        showToast("Davet gönderildi", "Sunucu onayı alındı. Oyun odasına yönlendiriliyorsunuz...", "success");
        window.setTimeout(() => navigateToInviteRoom(targetPayload), 350);
      });

      socket.on("game:invite_error", (payload) => {
        state.social.pendingInviteNavigation = null;
        showToast("Davet hatası", payload?.message || "Davet iletilemedi.", "error");
      });

      socket.on("game:invite_sent", () => {});
      socket.on("game:invite_response", (payload) => {
        const guestName = payload?.guestName || "Arkadaşın";
        const accepted = payload?.response === "accepted";
        showToast(
          accepted ? "Davet kabul edildi" : "Davet reddedildi",
          accepted
            ? `${guestName} davetini kabul etti.`
            : `${guestName} davetini şu an kabul etmedi.`,
          accepted ? "success" : "info"
        );

        if (accepted) {
          const pending = state.social.pendingInviteNavigation;
          const targetPayload = { ...(pending || {}), ...(payload || {}) };
          state.social.pendingInviteNavigation = null;
          window.setTimeout(() => navigateToInviteRoom(targetPayload), 450);
        } else {
          state.social.pendingInviteNavigation = null;
        }
      });

      socket.on("game:elo_update", (payload) => {
        const field = payload?.field || (payload?.gameType === "pisti" ? "pistiElo" : "chessElo");
        if (!state.userData) state.userData = {};
        if (Number.isFinite(Number(payload?.newElo))) {
          state.userData[field] = Number(payload.newElo);
          updateUserShell();
          if (state.currentSheet === "profile") refreshProfileSheet();
        }
        showToast("ELO Güncellendi", payload?.message || "Rekabetçi puanın güncellendi.", payload?.outcome === "win" ? "success" : payload?.outcome === "loss" ? "error" : "info");
      });

      socket.on("party:update", () => {
        loadPartySnapshot(true).catch(() => null);
        loadSocialCenterSummary(true).catch(() => null);
      });

      socket.on("party:invite_receive", () => {
        showToast("Parti Daveti", "Yeni bir parti daveti aldın.", "info");
        loadPartySnapshot(true).catch(() => null);
      });

      socket.on("party:invite_result", (payload) => {
        showToast("Parti Daveti", payload?.accepted ? "Parti daveti kabul edildi." : "Parti daveti sonuçlandı.", payload?.accepted ? "success" : "info");
        loadPartySnapshot(true).catch(() => null);
      });

      socket.on("party:kicked", () => {
        showToast("Parti Merkezi", "Partiden çıkarıldın.", "info");
        loadPartySnapshot(true).catch(() => null);
      });

      socket.on("user:rp_earned", (payload) => {
        const earned = Math.max(0, Number(payload?.earned) || 0);
        if (!earned) return;
        if (!state.userData) state.userData = {};
        state.userData.rp = Math.max(0, Number(state.userData.rp || 0) + earned);
        updateUserShell();
        if (state.currentSheet === "profile") refreshProfileSheet();
      });
    }

    async function ensureRealtimeConnection(forceRefresh = false) {
      if (!auth.currentUser) return null;
      if (state.socket && state.socket.connected && !forceRefresh) return state.socket;
      const ioFactory = await loadSocketClient();
      const token = await getIdToken(auth.currentUser, true);
      if (state.socket) disconnectRealtime();
      const socket = ioFactory(API_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 500,
        reconnectionDelayMax: 4000,
        timeout: 10000
      });
      state.socket = socket;
      registerSocketEvents(socket);
      return socket;
    }

    async function openSocialSheet() {
      if (!ensureAuthThen("Sosyal Merkez")) return;
      openSheet("social", "Sosyal Merkez", "Arkadaşlarını yönet, parti kur, özel sohbetleri başlat, mesaj ara ve Activity Pass özetini tek merkezden gör.");
      state.social.mobilePanelOpen = !isSocialMobile();
      await primeRealtimeUX();
      await ensureRealtimeConnection();
      await Promise.allSettled([loadFriends(), refreshSocialFeaturePack(true)]);
      renderSocialHub();
      updateSocialConnectionBadge();
    }

    window.PlayMatrixRealtime = {
      ensureRealtimeConnection,
      showInviteToast,
      confirmPotentialCrashExit,
      openSocialSheet,
      startMatchmaking,
      cancelMatchmaking
    };

    function captureReferralFromUrl() {
      try {
        const url = new URL(window.location.href);
        const ref = (url.searchParams.get("ref") || "").trim().toUpperCase();
        if (ref && /^[A-Z0-9]{6,12}$/.test(ref)) {
          sessionStorage.setItem(REF_STORAGE_KEY, ref);
          url.searchParams.delete("ref");
          window.history.replaceState({}, document.title, url.toString());
        }
      } catch(_) {}
    }

    async function tryClaimPendingReferral() {
      try {
        if (!auth.currentUser) return;
        const code = (sessionStorage.getItem(REF_STORAGE_KEY) || "").trim().toUpperCase();
        if (!code) return;
        if (!auth.currentUser.emailVerified) return;
        const out = await fetchPrivate("/api/referral/claim", "POST", { code });
        if (out && out.ok) {
          sessionStorage.removeItem(REF_STORAGE_KEY);
          showToast("Davet ödülü", "Davet kodu başarıyla işlendi.", "success");
          await loadUserData();
        }
      } catch(_) {}
    }

    function getRankData(rp){
      const value = Math.max(0, Number(rp) || 0);
      if (value < 1000) return { name:"BRONZE", className:"rank-bronze", progress: value / 1000 * 100, nextAt: 1000 };
      if (value < 3000) return { name:"SILVER", className:"rank-silver", progress: (value - 1000) / 2000 * 100, nextAt: 3000 };
      if (value < 5000) return { name:"GOLD", className:"rank-gold", progress: (value - 3000) / 2000 * 100, nextAt: 5000 };
      if (value < 10000) return { name:"PLATINUM", className:"rank-platinum", progress: (value - 5000) / 5000 * 100, nextAt: 10000 };
      if (value < 15000) return { name:"DIAMOND", className:"rank-diamond", progress: (value - 10000) / 5000 * 100, nextAt: 15000 };
      return { name:"CHAMPION", className:"rank-champion", progress: 100, nextAt: null };
    }

    function calcVip(rp){
      const value = Math.max(0, Number(rp) || 0);
      if (value < 1000) return { vip:"BRONZE ÇAYLAK", next:"GÜMÜŞ USTA", pct:(value / 1000) * 100 };
      if (value < 3000) return { vip:"GÜMÜŞ USTA", next:"ALTIN LİDER", pct:((value - 1000) / 2000) * 100 };
      if (value < 5000) return { vip:"ALTIN LİDER", next:"PLATİN ŞAMPİYON", pct:((value - 3000) / 2000) * 100 };
      if (value < 10000) return { vip:"PLATİN ŞAMPİYON", next:"DİAMOND", pct:((value - 5000) / 5000) * 100 };
      if (value < 15000) return { vip:"DİAMOND", next:"CHAMPION", pct:((value - 10000) / 5000) * 100 };
      return { vip:"CHAMPION", next:"MAKSİMUM", pct:100 };
    }

    function formatEloValue(value){
      return Math.max(100, Math.round(Number(value) || 1000));
    }

    function showToast(title, message, tone = "info"){
      const icons = {
        success: "fa-circle-check",
        error: "fa-circle-exclamation",
        info: "fa-circle-info"
      };
      const { toast, body } = createToastBase({
        tone,
        iconClass: icons[tone] || icons.info,
        title
      });
      const messageEl = document.createElement("div");
      messageEl.className = "toast-message";
      messageEl.textContent = message;
      body.appendChild(messageEl);
      appendToast(toast, 4200);
    }

    function playSound(kind = "tap"){
      if (!state.soundEnabled) return;
      try {
        const AudioContextRef = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextRef) return;
        const audio = new AudioContextRef();
        const now = audio.currentTime;
        const master = audio.createGain();
        master.gain.value = 0.025;
        master.connect(audio.destination);

        const pulse = (type, freq, start, duration, volume) => {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          osc.connect(gain);
          gain.connect(master);
          osc.start(start);
          osc.stop(start + duration + 0.02);
        };

        if (kind === "send") {
          pulse("sine", 660, now, 0.05, 0.55);
          pulse("triangle", 880, now + 0.04, 0.06, 0.38);
          return;
        }
        if (kind === "incoming") {
          pulse("triangle", 560, now, 0.06, 0.45);
          pulse("sine", 760, now + 0.07, 0.08, 0.34);
          return;
        }
        if (kind === "pop") {
          pulse("triangle", 520, now, 0.06, 0.42);
          return;
        }
        pulse("sine", 420, now, 0.05, 0.32);
      } catch(_) {}
    }

    function updateSoundUI(){
      $("soundIcon").className = `fa-solid ${state.soundEnabled ? "fa-volume-high" : "fa-volume-xmark"}`;
    }

    function openSheet(name, title, subtitle){
      state.currentSheet = name;
      $("sheetShell").classList.add("is-open");
      $("sheetShell").classList.toggle("is-social", name === "social");
      $("sheetShell").setAttribute("aria-hidden", "false");
      document.body.classList.add("sheet-open");
      $("sheetTitle").textContent = title;
      $("sheetSubtitle").textContent = subtitle;
      document.querySelectorAll(".sheet-section").forEach((section) => section.classList.toggle("is-active", section.dataset.sheet === name));
      playSound("pop");
    }

    function closeSheet(){
      $("sheetShell").classList.remove("is-open", "is-social");
      $("sheetShell").setAttribute("aria-hidden", "true");
      document.body.classList.remove("sheet-open");
      state.currentSheet = null;
      state.drag.active = false;
      state.drag.deltaY = 0;
      state.social.mobilePanelOpen = !isSocialMobile();
      document.querySelectorAll('.pm-social-layout.is-chat-active').forEach((layout) => layout.classList.remove('is-chat-active'));
      $("sheetPanel").style.transform = "";
    }

    function setAuthMode(mode){
      state.authMode = mode;
      $("authSegment").querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.authMode === mode));
      $("authFullNameGroup").classList.toggle("hidden", mode !== "register");
      $("authUsernameGroup").classList.toggle("hidden", mode !== "register");
      $("authHelp").textContent = "";
      $("authHelp").className = "field-help";
      $("authSubmitBtn").textContent = mode === "login" ? "Giriş Yap" : "Hesap Oluştur";
    }

    function ensureAuthThen(actionName){
      if (auth.currentUser) return true;
      setAuthMode("login");
      openSheet("auth", "Hesabına giriş yap", `${actionName} için önce hesabına giriş yapmalısın.`);
      return false;
    }

    function openProfileSheet(){
      if (!ensureAuthThen("Profil paneli")) return;
      refreshProfileSheet();
      openSheet("profile", "Profil Yönetimi", "Avatar, Kullanıcı Adı Ve Hesap İşlemleri.");
    }

    function openWheelSheet(){
      if (!ensureAuthThen("Günlük çark")) return;
      drawWheel();
      refreshWheelUI();
      openSheet("wheel", "Günlük Çark", "E-posta doğrulaması tamamlandıktan sonra her 24 saatte bir ücretsiz spin yapılabilir.");
    }

    function openPromoSheet(){
      if (!ensureAuthThen("Promosyon kodu")) return;
      $("promoHelp").textContent = "";
      $("promoHelp").className = "field-help";
      openSheet("promo", "Ödül Merkezi", "Promosyon kodunu gir, ödülünü güvenli şekilde aktif et.");
    }

    function openSupportSheet(){
      if (!ensureAuthThen("Destek talebi")) return;
      $("supportHelp").textContent = "";
      $("supportHelp").className = "field-help";
      openSheet("support", "Canlı Destek", "Sorununu detaylı biçimde ilet, destek kaydın eksiksiz oluşturulsun.");
    }

    function getIstanbulSeasonContext() {
      const formatter = new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: 'numeric'
      });
      const parts = formatter.formatToParts(new Date());
      const values = Object.create(null);
      for (const part of parts) {
        if (part.type !== 'literal') values[part.type] = part.value;
      }
      const year = Number(values.year || new Date().getUTCFullYear());
      const month = Number(values.month || (new Date().getUTCMonth() + 1));
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      return {
        seasonKey: `${year}-${String(month).padStart(2, '0')}`,
        nextResetLabel: `01 ${monthNames[nextMonth - 1]} ${nextYear} 00:00`
      };
    }

    function setOverviewText(id, value) {
      const element = $(id);
      if (element) element.textContent = String(value ?? '');
    }

    function getChatPolicySummary(data = {}) {
      const policy = data?.chatPolicy && typeof data.chatPolicy === 'object' ? data.chatPolicy : null;
      if (policy?.summaryLabel) return String(policy.summaryLabel);
      const lobbyDays = Number(policy?.lobbyDays || 7) || 7;
      const directDays = Number(policy?.directDays || 7) || 7;
      return `Global ${lobbyDays} Gün · DM ${directDays} Gün`;
    }

    function updateSystemOverview(){
      const user = auth.currentUser;
      const data = state.userData || {};
      const progression = getProgressionData(data);
      const vipLabel = String(data.vipLabel || progression.vipLabel || 'Classic');
      const nextVipLabel = String(data.nextVipLabel || progression.nextVipLabel || progression.nextVip || '').trim();
      const verified = !!user?.emailVerified;
      const season = getIstanbulSeasonContext();

      setOverviewText('seasonKeyBadge', `Sezon: ${season.seasonKey}`);
      setOverviewText('seasonResetBadge', season.nextResetLabel);
      setOverviewText('activityResetBadge', season.nextResetLabel);
      setOverviewText('retentionBadge', getChatPolicySummary(data));
      setOverviewText('rewardFlowBadge', verified ? 'Çark + Promo Aktif' : '50.000 + 100.000 MC');
      setOverviewText(
        'rewardFlowMeta',
        verified
          ? `E-posta doğrulandı. Günlük çark, promo merkezi ve davet akışı aktif. Mevcut VIP durumun: ${vipLabel}${nextVipLabel ? ` · Sonraki kademe: ${nextVipLabel}` : ' · Maksimum kademedesin.'}`
          : 'Kayıt bonusu anında tanımlanır. E-posta doğrulamasından sonra 100.000 MC, günlük çark ve promosyon merkezi açılır.'
      );
    }

    async function openInviteSheet(){
      if (!ensureAuthThen("Davet sistemi")) return;
      $("inviteHelp").textContent = "";
      $("inviteHelp").className = "field-help";
      openSheet("invite", "Davet Et ve Kazan", "Davet kodunu ve bağlantını üret, tek dokunuşla paylaş.");
      await loadInviteLink();
    }

    
    function updateUserShell(){
      const user = auth.currentUser;
      const data = state.userData || {};
      const progression = getProgressionData(data);
      const totalRankClass = data.totalRankClass || progression.totalRankClass || progression.competitiveRankClass || data.rankClass || 'rank-bronze';
      const totalRankName = data.totalRankName || data.totalRank || progression.totalRank || progression.competitiveRank || data.rankName || 'Bronze';
      const competitiveScore = Number(data.competitiveScore ?? data.rp ?? progression.competitiveScore ?? 0);
      const seasonRankClass = data.seasonRankClass || progression.seasonRankClass || 'rank-bronze';
      const seasonRankName = data.seasonRankName || data.seasonRank || progression.seasonRank || 'Bronze';
      const seasonScore = Number(data.seasonScore ?? data.seasonRp ?? progression.seasonScore ?? 0);
      const accountLevel = getUserLevel(data);
      const accountProgressPct = clamp(Number(progression.accountLevelProgressPct ?? 0), 0, 100);
      const avatar = safeUrl(data.avatar || state.selectedAvatar || AVATARS[0]);
      const username = data.username || user?.email || "Oyuncu";
      const chessElo = formatEloValue(data.chessElo);
      const pistiElo = formatEloValue(data.pistiElo);
      const displayFrame = getDisplayFrameLevel();
      const vipLabel = String(data.vipLabel || progression.vipLabel || 'Standart');

      $("loginBtn").style.display = user ? "none" : "inline-flex";
      $("registerBtn").style.display = user ? "none" : "inline-flex";
      $("topUser").classList.toggle("is-visible", !!user);

      if (user) {
        $("headerBalance").textContent = formatNumber(data.balance || 0);
        mountTopbarPremiumAvatar(avatar, displayFrame);
        $("headerUsername").textContent = username;
        $("headerRankText").textContent = `${totalRankName} · ${formatNumber(competitiveScore)} RP`;
        $("ddUsername").textContent = username;
        $("ddVip").textContent = vipLabel;
        $("ddNext").textContent = accountLevel < 100 ? `Seviye ${accountLevel + 1}` : 'MAX';
        $("ddPct").textContent = `%${accountProgressPct.toFixed(1)}`;
        $("ddBar").style.width = `${accountProgressPct}%`;
      }

      const heroMeta = user
        ? `Bakiye: ${formatNumber(data.balance || 0)} MC · ${user.emailVerified ? "E-posta doğrulandı" : "E-posta doğrulanmadı"} · Rekabetçi Puan: ${formatNumber(competitiveScore)} · Satranç ELO: ${chessElo} · Pişti ELO: ${pistiElo}`
        : "Kayıt ol, bakiyeni ve lig ilerlemeni canlı takip et.";

      mountPremiumAvatar("heroProfileAvatarShell", avatar, displayFrame, 56, "pm-premium-avatar--profile");
      $("heroProfileName").textContent = user ? username : "Misafir Modu";
      $("heroProfileMeta").textContent = heroMeta;

      const rankBadge = $("heroRankBadge");
      if (rankBadge) {
         rankBadge.className = `rank-badge ${totalRankClass}`;
         rankBadge.textContent = totalRankName;
      }
      if ($("heroSeasonBadge")) $("heroSeasonBadge").className = `rank-badge ${seasonRankClass}`;
      if ($("heroSeasonBadge")) $("heroSeasonBadge").textContent = `${seasonRankName} · ${formatNumber(seasonScore)} Sezon`;
      if ($("heroProgressText")) $("heroProgressText").textContent = accountLevel < 100 ? `%${accountProgressPct.toFixed(1)}` : "MAX";
      if ($("heroProgressFill")) $("heroProgressFill").style.width = `${accountProgressPct}%`;

      const chessEloUI = document.getElementById('ui-chess-elo');
      const pistiEloUI = document.getElementById('ui-pisti-elo');
      const vipBadgeEl = document.getElementById('uiVipBadge');
      const accountLevelEl = document.getElementById('ui-account-level');
      if (chessEloUI) chessEloUI.textContent = String(chessElo);
      if (pistiEloUI) pistiEloUI.textContent = String(pistiElo);
      if (vipBadgeEl) vipBadgeEl.textContent = vipLabel;
      if (accountLevelEl) accountLevelEl.textContent = String(accountLevel);

      const heroAvatarShell = $("heroProfileAvatarShell");
      if (heroAvatarShell) {
        heroAvatarShell.style.cursor = user ? "pointer" : "default";
        heroAvatarShell.onclick = user ? () => window.showPlayerStats?.(user.uid) : null;
      }

      updateAppearanceSummary();
      updateSystemOverview();
      renderVipLandingSection(state.vipCenter);
    }

    function updateAppearanceSummary(){
      const avatar = safeUrl(state.selectedAvatar || state.userData?.avatar || AVATARS[0]);
      const maxLevel = getCurrentVipLevel();
      const currentFrame = getDisplayFrameLevel();
      const username = state.userData?.username || auth.currentUser?.email || 'Oyuncu';
      const titleEl = $("appearanceSummaryTitle");
      const textEl = $("appearanceSummaryText");

      mountPremiumAvatar("appearancePreviewShell", avatar, currentFrame, 76, "pm-premium-avatar--picker");

      if (titleEl) titleEl.textContent = `${username} · Seviye ${getUserLevel(state.userData)}`;
      if (textEl) textEl.textContent = `Seçili çerçeve: Seviye ${currentFrame} Çerçevesi. Kilit açma durumu tamamen Level sistemine bağlıdır. Şu an Seviye ${maxLevel} çerçevelerine kadar erişimin var.`;
    }

    function refreshCurrentUserAvatarSurfaces(){
      const avatar = safeUrl(state.selectedAvatar || state.userData?.avatar || AVATARS[0]);
      const displayFrame = getDisplayFrameLevel();
      mountPremiumAvatar("profileSheetAvatarShell", avatar, displayFrame, 56, "pm-premium-avatar--profile");
      mountPremiumAvatar("heroProfileAvatarShell", avatar, displayFrame, 56, "pm-premium-avatar--profile");
      mountPremiumAvatar("appearancePreviewShell", avatar, displayFrame, 76, "pm-premium-avatar--picker");
      mountTopbarPremiumAvatar(avatar, displayFrame);
    }

    async function persistSelectedFramePreference(frameLevel){
      const nextFrame = normalizeVipLevel(frameLevel);
      syncSelectedFrameState(nextFrame);
      if (!auth.currentUser) return nextFrame;
      await fetchPrivate("/api/profile/update", "POST", { selectedFrame: nextFrame });
      syncSelectedFrameState(nextFrame);
      return nextFrame;
    }

    function selectAvatar(src){
      const normalized = safeUrl(src || AVATARS[0]);
      state.selectedAvatar = normalized;
      refreshCurrentUserAvatarSurfaces();
      renderAvatarSelectionBox();
      updateAppearanceSummary();
    }

    async function selectFrame(level) {
      const nextFrame = normalizeVipLevel(level);
      const unlockedMax = getCurrentVipLevel();
      
      if (nextFrame > unlockedMax) {
        showMatrixModal('Kilitli', `Bu çerçeveyi kullanmak için en az Seviye ${nextFrame} olmalısın. Mevcut seviyen: ${getUserLevel(state.userData)}.`, 'warning');
        return;
      }

      const previousFrame = getSelectedFrameLevel();
      syncSelectedFrameState(nextFrame);

      renderAvatarSelectionBox();
      updateAppearanceSummary();
      refreshCurrentUserAvatarSurfaces();

      if (!auth.currentUser) return;

      try {
        await persistSelectedFramePreference(nextFrame);
      } catch (error) {
        syncSelectedFrameState(previousFrame);
        renderAvatarSelectionBox();
        updateAppearanceSummary();
        refreshCurrentUserAvatarSurfaces();
        showToast('Çerçeve kaydedilemedi', error.message || 'Seçili çerçeve sunucuya kaydedilemedi.', 'error');
      }
    }

    function switchAvatarTab(tab){
      const avatarTab = $('tab-avatars');
      const frameTab = $('tab-frames');
      const avatarContainer = $('avatarSelectionContainer');
      const frameContainer = $('frameSelectionContainer');
      if (avatarTab) avatarTab.classList.toggle('active', tab === 'avatars');
      if (frameTab) frameTab.classList.toggle('active', tab === 'frames');
      if (avatarContainer) avatarContainer.style.display = tab === 'avatars' ? 'grid' : 'none';
      if (frameContainer) frameContainer.style.display = tab === 'frames' ? 'grid' : 'none';
    }

    function renderAvatarSelectionBox(){
      const avatarContainer = $('avatarSelectionContainer');
      const frameContainer = $('frameSelectionContainer');
      if (!avatarContainer || !frameContainer) return;

      avatarContainer.innerHTML = '';
      frameContainer.innerHTML = '';

      const unlockedMax = getCurrentVipLevel();
      const currentFrame = getDisplayFrameLevel();
      const selectedAvatar = safeUrl(state.selectedAvatar || state.userData?.avatar || AVATARS[0]);

      const avatarFragment = document.createDocumentFragment();
      AVATARS.forEach((src, index) => {
        const normalized = safeUrl(src);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `avatar-pick-card ${selectedAvatar === normalized ? 'is-active' : ''}`;
        button.setAttribute('aria-label', `Avatar ${index + 1}`);

        // Düz img etiketi yerine, çerçeve sistemini (Premium Node) çağırıyoruz
        const previewWrap = document.createElement('div');
        previewWrap.className = 'avatar-pick-preview';
        const preview = createPremiumAvatarNode(normalized, currentFrame, 58, 'pm-premium-avatar--picker');
        previewWrap.appendChild(preview);

        const label = document.createElement('div');
        label.className = 'avatar-pick-label';
        label.textContent = `Avatar ${index + 1}`;

        button.append(previewWrap, label);
        button.addEventListener('click', () => selectAvatar(normalized));
        avatarFragment.appendChild(button);
      });
      avatarContainer.appendChild(avatarFragment);

      const frameFragment = document.createDocumentFragment();
      for (let level = 1; level <= 100; level++) {
        const isLocked = unlockedMax < level;
        const isSelected = currentFrame === level;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `frame-pick-card ${isLocked ? 'is-locked' : ''} ${isSelected ? 'is-active' : ''}`;
        card.setAttribute('aria-label', `Seviye ${level} çerçevesi`);

        const previewWrap = document.createElement('div');
        previewWrap.className = 'frame-pick-preview';
        const preview = createPremiumAvatarNode(selectedAvatar, level, 64, 'pm-premium-avatar--picker');
        if (isLocked) preview.style.filter = 'grayscale(100%) opacity(0.55)';
        previewWrap.appendChild(preview);

        const label = document.createElement('div');
        label.className = 'frame-pick-label';
        label.textContent = `Seviye ${level}`;

        const status = document.createElement('span');
        status.className = `status-chip ${isLocked ? 'is-locked' : isSelected ? 'is-active' : ''}`;

        if (isLocked) {
          status.textContent = `Lv. ${level}`;
          card.addEventListener('click', () => showMatrixModal('Kilitli', `Bu çerçeveyi açmak için Seviye ${level} olmalısın. Mevcut seviyen: ${getUserLevel(state.userData)}.`, 'warning'));
        } else if (isSelected) {
          status.textContent = 'Kullanımda';
          card.addEventListener('click', () => showMatrixModal('Aktif Çerçeve', `Şu anda Seviye ${level} çerçevesi kullanılıyor.`, 'success'));
        } else {
          status.textContent = 'Seç';
          card.addEventListener('click', () => selectFrame(level));
        }

        card.append(previewWrap, label, status);
        frameFragment.appendChild(card);
      }
      frameContainer.appendChild(frameFragment);
    }

    function openAvatarSelectionModal(){
      renderAvatarSelectionBox();
      switchAvatarTab('avatars');
      openMatrixModal('avatarSelectionModal');
    }

    window.closeMatrixModal = closeMatrixModal;
    window.switchAvatarTab = switchAvatarTab;

    function syncVerifyButtonState(){
      const button = $("verifyEmailBtn");
      if (!button) return;
      const verified = !!auth.currentUser?.emailVerified;
      button.textContent = verified ? "E-posta Adresini Güncelle" : "Doğrulama Maili Gönder";
    }

    function refreshProfileSheet(){
      const user = auth.currentUser;
      const data = state.userData || {};
      const progression = getProgressionData(data);
      const currentLevel = getUserLevel(data);
      const progress = clamp(Number(progression.accountLevelProgressPct ?? 0), 0, 100);
      const totalRankClass = data.totalRankClass || progression.totalRankClass || progression.competitiveRankClass || data.rankClass || 'rank-bronze';
      const totalRankName = data.totalRankName || data.totalRank || progression.totalRank || progression.competitiveRank || data.rankName || 'Bronze';
      const competitiveScore = Number(data.competitiveScore ?? data.rp ?? progression.competitiveScore ?? 0);
      const seasonRankClass = data.seasonRankClass || progression.seasonRankClass || 'rank-bronze';
      const seasonRankName = data.seasonRankName || data.seasonRank || progression.seasonRank || 'Bronze';
      const seasonScore = Number(data.seasonScore ?? data.seasonRp ?? progression.seasonScore ?? 0);
      const fullNameLocked = !!data.fullNameLocked || !!(data.fullName && String(data.fullName).trim());

      mountPremiumAvatar("profileSheetAvatarShell", safeUrl(data.avatar || AVATARS[0]), getDisplayFrameLevel(), 56, "pm-premium-avatar--profile");
      $("profileSheetName").textContent = data.username || user?.email || "Oyuncu";
      $("profileSheetMeta").textContent = `Bakiye: ${formatNumber(data.balance || 0)} MC · ${user?.emailVerified ? "E-posta doğrulandı" : "E-posta doğrulanmadı"} · Toplam Rank: ${totalRankName} · Rekabetçi Puan: ${formatNumber(competitiveScore)}`;
      $("profileProgressText").textContent = currentLevel < 100 ? `%${progress.toFixed(1)}` : "MAX";
      $("profileProgressFill").style.width = `${progress}%`;
      $("profileRankBadge").className = `rank-badge ${totalRankClass}`;
      $("profileRankBadge").textContent = totalRankName;
      $("profileSeasonBadge").className = `rank-badge ${seasonRankClass}`;
      $("profileSeasonBadge").textContent = `${seasonRankName} · ${formatNumber(seasonScore)} Sezon`;
      $("profileFullName").value = data.fullName || "";
      $("profileFullName").disabled = fullNameLocked;
      $("profileFullName").classList.toggle("is-locked", fullNameLocked);
      $("profileFullNameHelp").textContent = fullNameLocked
        ? "Ad Soyad Alanı İlk Kayıt Sonrası Kilitlendi Ve Değiştirilemez."
        : "İlk kayıt tamamlandıktan sonra bu alan güvenlik nedeniyle kilitlenir.";
      $("profileUsername").value = data.username || "";
      $("profileEmail").value = data.email || user?.email || "";
      const usernameChangeLimit = Number(data.usernameChangeLimit || 3);
      const usernameRemaining = Math.max(0, Number(data.usernameChangeRemaining ?? (usernameChangeLimit - Number(data.userChangeCount || 0))));
      const usernameLocked = usernameRemaining <= 0;
      $("profileUsername").disabled = usernameLocked;
      $("profileUsername").classList.toggle("is-locked", usernameLocked);
      $("usernameLimitHelp").textContent = usernameLocked
        ? "Kullanıcı adı değiştirme hakkın doldu. Bu alan artık kilitli."
        : `Kullanıcı Adı Toplam 3 Kez Değiştirilebilir. Kalan Hakkın: ${usernameRemaining}.`;
      $("usernameLimitHelp").className = `field-help ${usernameLocked ? "is-error" : ""}`;
      $("usernameHelp").textContent = "";
      $("usernameHelp").className = "field-help";
      state.selectedAvatar = safeUrl(data.avatar || AVATARS[0]);
      syncSelectedFrameState(data.selectedFrame || state.selectedFrame || localStorage.getItem('pm_selected_frame') || 1);
      renderAvatarSelectionBox();
      updateAppearanceSummary();
      syncVerifyButtonState();

      const profileSheetAvatarShell = $("profileSheetAvatarShell");
      if (profileSheetAvatarShell) {
        profileSheetAvatarShell.style.cursor = user ? "pointer" : "default";
        profileSheetAvatarShell.onclick = user ? () => window.showPlayerStats?.(user.uid) : null;
      }
    }


    async function maybeShowPendingReward(){
      const pending = state.userData?.pendingReward;
      if (!pending || !pending.amount || !pending.rank) return;

      const signature = `${pending.rank}:${pending.amount}:${pending.monthKey || "default"}`;
      if (sessionStorage.getItem(PENDING_REWARD_SESSION_KEY) === signature) return;

      sessionStorage.setItem(PENDING_REWARD_SESSION_KEY, signature);
      showMatrixModalHtml(
        "Tebrikler Şampiyon! 🏆",
        `Geçen ayın <b>En Çok Aktif Oyuncular</b> sıralamasında <b>${escapeHtml(String(pending.rank))}.</b> oldun!<br><br>Hesabına <b>${escapeHtml(formatNumber(pending.amount))} MC</b> eklendi. Başarılarının devamını dileriz!`,
        "success"
      );

      try {
        await fetchPrivate('/api/claim-monthly-reward', 'POST');
        if (state.userData) delete state.userData.pendingReward;
      } catch (error) {
        sessionStorage.removeItem(PENDING_REWARD_SESSION_KEY);
        showToast("Ödül bildirimi", error.message, "error");
      }
    }

    async function loadUserData(){
      if (!auth.currentUser) {
        state.userData = null;
        state.vipCenter = null;
        state.vipCatalog = null;
        state.monthlyRewardShownKey = "";
        updateUserShell();
        return;
      }
      try {
        const payload = await fetchPrivate("/api/me");
        state.userData = payload.user || {};
        syncSelectedFrameState(state.userData?.selectedFrame || state.selectedFrame || localStorage.getItem('pm_selected_frame') || 1);
        updateUserShell();
        refreshProfileSheet();
        syncVerifyButtonState();
        await Promise.allSettled([maybeShowPendingReward(), loadVipCenter(true)]);
        if (payload.toast?.signup) showToast("Yeni üyelik bonusu", "50.000 MC hesabına işlendi.", "success");
        if (payload.toast?.email) showToast("Doğrulama ödülü", "100.000 MC hesabına işlendi.", "success");
      } catch (error) {
        showToast("Veri senkron hatası", error.message, "error");
      }
    }

    function renderGames(){
      const query = ($("gameSearch").value || "").trim().toLowerCase();
      const filter = state.activeFilter;
      const user = auth.currentUser;
      const games = GAMES.filter((game) => {
        const matchesSearch = !query || `${game.name} ${game.desc} ${game.keywords}`.toLowerCase().includes(query);
        if (!matchesSearch) return false;
        if (filter === "all") return true;
        if (filter === "auth") return game.access === "auth";
        if (filter === "free") return game.access === "free";
        return game.category === filter;
      });

      $("gamesGrid").innerHTML = "";
      $("gamesEmpty").style.display = games.length ? "none" : "block";

      games.forEach((game) => {
        const card = document.createElement("article");
        card.className = "game-card fade-up";
        card.style.setProperty("--card-rgb", game.color);
        card.innerHTML = `
          <div class="game-top">
            <div class="game-icon"><i class="fa-solid ${game.icon}"></i></div>
            <div class="tag-stack">
              <span class="mini-tag">${game.category === "online" ? '<span class="live-dot"></span>Online' : game.category === "casino" ? 'Premium Casino' : 'Klasik'}</span>
              <span class="mini-tag">${game.access === "auth" ? 'Giriş Gerekir' : 'Ücretsiz'}</span>
            </div>
          </div>
          <div class="game-body">
            <h3 class="game-title">${game.name}</h3>
            <div class="game-desc">${game.desc}</div>
            <div class="feature-list">
              ${game.tags.map((tag) => `<span class="feature-pill">${tag}</span>`).join("")}
            </div>
          </div>
          <div class="game-footer">
            <span class="game-status">${game.access === "auth" ? (user ? "Hazır" : "Önce oturum aç") : "Anında başla"}</span>
            <button class="game-cta ${game.access === "free" || user ? "is-primary" : ""}">${game.access === "auth" ? (user ? "Oyunu Aç" : "Giriş Yap") : "Ücretsiz Oyna"}</button>
          </div>
        `;
        const openGame = () => {
          if (game.access === "auth" && !auth.currentUser) {
            setAuthMode("login");
            openSheet("auth", "Hesabına giriş yap", `${game.name} için önce hesabına giriş yapmalısın.`);
            return;
          }
          location.href = game.url;
        };

        const primaryBtn = card.querySelector(".game-cta.is-primary, .game-cta");
        if (primaryBtn) {
          primaryBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            openGame();
          });
        }

        if (auth.currentUser && game.category === "online" && (game.name === "Satranç" || game.name === "Pişti")) {
          const footer = card.querySelector(".game-footer");
          const statusEl = card.querySelector(".game-status");
          const actionGroup = document.createElement("div");
          actionGroup.style.display = "flex";
          actionGroup.style.gap = "8px";
          actionGroup.style.flexWrap = "wrap";
          actionGroup.style.justifyContent = "flex-end";

          const quickBtn = document.createElement("button");
          quickBtn.className = "game-cta";
          quickBtn.type = "button";
          quickBtn.textContent = "Hızlı Eşleş";
          quickBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            await startMatchmaking(game.name === "Satranç" ? "chess" : "pisti", game.name === "Pişti" ? { mode: "2-52", bet: 1000 } : {});
          });

          if (primaryBtn) {
            primaryBtn.replaceWith(actionGroup);
            actionGroup.append(quickBtn, primaryBtn);
          } else {
            actionGroup.appendChild(quickBtn);
            footer?.appendChild(actionGroup);
          }

          if (statusEl) statusEl.textContent = game.name === "Satranç" ? "Anında rakip bul" : "1000 MC hızlı masa";
        }

        card.addEventListener("click", () => {
          openGame();
        });
        $("gamesGrid").appendChild(card);
      });

      $("metricGamesCount").textContent = String(GAMES.length);
      revealFadeUps();
    }

    function leaderboardSkeleton(){
      const container = $("leaderboardListArea");
      if (!container) return;
      container.innerHTML = '<div class="lb-item skeleton is-skeleton"></div><div class="lb-item skeleton is-skeleton"></div><div class="lb-item skeleton is-skeleton"></div><div class="lb-item skeleton is-skeleton"></div>';
    }
    function getLeaderboardListForTab(tabType){
      if (!currentLeaderboardData) return [];
      if (tabType === 'level') return Array.isArray(currentLeaderboardData.levelTop) ? currentLeaderboardData.levelTop : [];
      if (tabType === 'season') return Array.isArray(currentLeaderboardData.seasonTop) ? currentLeaderboardData.seasonTop : [];
      if (tabType === 'activity') return Array.isArray(currentLeaderboardData.activityTop) ? currentLeaderboardData.activityTop : [];
      if (tabType === 'vip') return Array.isArray(currentLeaderboardData.vipTop) ? currentLeaderboardData.vipTop : [];
      if (tabType === 'chess') return Array.isArray(currentLeaderboardData.chessTop) ? currentLeaderboardData.chessTop : [];
      if (tabType === 'pisti') return Array.isArray(currentLeaderboardData.pistiTop) ? currentLeaderboardData.pistiTop : [];
      return [];
    }

    async function showPlayerStats(uid){
      const targetUid = String(uid || "").trim();
      if (!targetUid) {
        showToast("İstatistikler", "Oyuncu profili bulunamadı.", "error");
        return;
      }

      const content = $("playerStatsContent");
      if (!content) return;

      content.innerHTML = `
        <div class="ps-modal-header">
          <div class="ps-modal-title" id="playerStatsTitle">Oyuncu İstatistikleri</div>
          <button class="ps-modal-close" type="button" onclick="closeMatrixModal('playerStatsModal')" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="ps-modal-body" style="display:grid; place-items:center; min-height:240px; text-align:center;">
          <div>
            <i class="fa-solid fa-spinner fa-spin fa-2x" style="margin-bottom:12px; color:#00f2ff;"></i>
            <p style="margin:0; color:var(--muted);">İstatistikler çekiliyor...</p>
          </div>
        </div>`;
      openMatrixModal('playerStatsModal');

      const formatDate = (value, includeTime = false) => {
        const date = new Date(Number(value) || 0);
        if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "—";
        return includeTime ? date.toLocaleString("tr-TR") : date.toLocaleDateString("tr-TR");
      };

      try {
        const payload = await fetchPrivate(`/api/user-stats/${encodeURIComponent(targetUid)}`);
        const p = payload?.data || {};
        const level = Math.max(1, Number(p.level) || calculateLevelFromRp(Number(p.rp || 0)));
        const safeAvatar = safeUrl(p.avatar || AVATARS[0]);
        const safeName = escapeHtml(p.username || "Oyuncu");
        const isSelf = !!auth.currentUser && auth.currentUser.uid === String(p.uid || targetUid);

        content.innerHTML = `
          <div class="ps-modal-header">
            <div class="ps-modal-title" id="playerStatsTitle">Oyuncu İstatistikleri</div>
            <button class="ps-modal-close" type="button" onclick="closeMatrixModal('playerStatsModal')" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="ps-modal-body" style="animation: fadeUp .34s ease-out; text-align:left;">
            <div style="text-align:center; margin-bottom:20px;">
              <div class="avatar" style="width:80px; height:80px; margin:0 auto 12px; border:none; box-shadow:none; background:transparent; overflow:visible;">${buildPremiumAvatar(safeAvatar, level, 80, 'pm-premium-avatar--profile')}</div>
              <h3 style="margin:10px 0 8px;">${safeName}</h3>
              <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-bottom:14px;">
                <span class="rank-badge rank-gold">Kayıt: ${formatDate(p.createdAt)}</span>
                <span class="rank-badge rank-silver">Son Görülme: ${formatDate(p.lastLogin || p.lastSeen, true)}</span>
              </div>
            </div>

            <div style="background:var(--bg-elev); padding:15px; border-radius:12px; margin-bottom:15px;">
              <h4 style="margin:0 0 10px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:6px;">Genel Durum</h4>
              <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;"><span>Seviye:</span> <strong>${level}</strong></div>
              <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;"><span>Toplam RP:</span> <strong>${formatNumber(Number(p.rp) || 0)}</strong></div>
              <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;"><span>Toplam Oynanan Raund:</span> <strong>${formatNumber(Number(p.totalRounds) || 0)}</strong></div>
              <div style="display:flex; justify-content:space-between; gap:12px;"><span>Harcanan Toplam MC:</span> <strong>${formatNumber(Number(p.totalSpentMc) || 0)}</strong></div>
            </div>

            <div style="background:var(--bg-elev); padding:15px; border-radius:12px; margin-bottom:15px;">
              <h4 style="margin:0 0 10px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:6px;">Satranç</h4>
              <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;"><span>Kazanma:</span> <strong style="color:#4caf50;">${formatNumber(Number(p.chessWins) || 0)}</strong></div>
              <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;"><span>Kaybetme:</span> <strong style="color:#f44336;">${formatNumber(Number(p.chessLosses) || 0)}</strong></div>
              <div style="display:flex; justify-content:space-between; gap:12px;"><span>ELO:</span> <strong style="color:#00f2ff;">${formatNumber(Number(p.chessElo) || 1000)}</strong></div>
            </div>

            <div style="background:var(--bg-elev); padding:15px; border-radius:12px; margin-bottom:18px;">
              <h4 style="margin:0 0 10px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:6px;">Online Pişti</h4>
              <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;"><span>Kazanma:</span> <strong style="color:#4caf50;">${formatNumber(Number(p.pistiWins) || 0)}</strong></div>
              <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;"><span>Kaybetme:</span> <strong style="color:#f44336;">${formatNumber(Number(p.pistiLosses) || 0)}</strong></div>
              <div style="display:flex; justify-content:space-between; gap:12px;"><span>ELO:</span> <strong style="color:#ff0055;">${formatNumber(Number(p.pistiElo) || 1000)}</strong></div>
            </div>

            ${isSelf ? '' : '<button class="btn btn-primary" id="playerStatsAddFriendBtn" type="button" style="width:100%; justify-content:center;"><i class="fa-solid fa-user-plus"></i> Arkadaş Ekle</button>'}
          </div>`;

        const addFriendButton = $("playerStatsAddFriendBtn");
        if (addFriendButton) {
          addFriendButton.addEventListener("click", () => sendFriendRequest(String(p.uid || targetUid)));
        }
      } catch (error) {
        content.innerHTML = `
          <div class="ps-modal-header">
            <div class="ps-modal-title" id="playerStatsTitle">Oyuncu İstatistikleri</div>
            <button class="ps-modal-close" type="button" onclick="closeMatrixModal('playerStatsModal')" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="ps-modal-body" style="display:grid; place-items:center; min-height:220px; text-align:center;">
            <div>
              <i class="fa-solid fa-triangle-exclamation" style="font-size:1.8rem; margin-bottom:12px; color:var(--warning);"></i>
              <p style="margin:0;">${escapeHtml(error.message || "Veri çekilemedi.")}</p>
            </div>
          </div>`;
      }
    }

    window.showPlayerStats = showPlayerStats;
    window.openPlayerProfile = showPlayerStats;
    window.showPlayerProfile = showPlayerStats;

    function renderLeaderboardTab(tabType = "level"){
      if (!currentLeaderboardData) return;

      currentLeaderboardTab = tabType;
      document.querySelectorAll('#leaderboardTabs .lb-tab-btn').forEach((btn) => {
        const isActive = btn.dataset.lbTab === tabType;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      const container = $("leaderboardListArea");
      if (!container) return;
      container.innerHTML = "";

      const list = getLeaderboardListForTab(tabType).slice(0, 5);
      let label = '';
      let scoreColor = '#fff';

      if (tabType === 'level') {
        label = 'HESAP';
        scoreColor = '#00ff88';
      } else if (tabType === 'season') {
        label = 'SEZON RP';
        scoreColor = '#8b5cf6';
      } else if (tabType === 'activity') {
        label = 'AKTİFLİK';
        scoreColor = '#22c55e';
      } else if (tabType === 'vip') {
        label = 'VIP';
        scoreColor = '#F59E0B';
      } else if (tabType === 'chess') {
        label = 'ELO';
        scoreColor = '#00f2ff';
      } else if (tabType === 'pisti') {
        label = 'ELO';
        scoreColor = '#ff0055';
      }

      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'lb-empty-state';
        empty.textContent = 'Henüz kayıt yok.';
        container.appendChild(empty);
        return;
      }

      list.forEach((user, index) => {
        const rankNum = index + 1;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lb-item';
        item.setAttribute('aria-label', `${user.username || 'Oyuncu'} profili`);

        const rank = document.createElement('div');
        rank.className = 'lb-rank';
        if (rankNum === 1) rank.classList.add('top-1');
        else if (rankNum === 2) rank.classList.add('top-2');
        else if (rankNum === 3) rank.classList.add('top-3');
        rank.textContent = `#${rankNum}`;

         const wrapper = createPremiumAvatarNode(
          user.avatar || AVATARS[0],
          resolveAvatarVipLevel(user, 0), // Senin seviyeni değil, oyuncunun öz verisini kullanır
          45,
          'pm-premium-avatar--leaderboard'
        );

        const name = document.createElement('div');
        name.className = 'lb-name';
        name.textContent = String(user.username || 'Anonim');

        let scoreVal = '';
        if (tabType === 'level') scoreVal = `Lv. ${Math.max(1, Number(user.accountLevel ?? user.level) || 1)}`;
        else if (tabType === 'season') scoreVal = formatNumber(Number(user.seasonRp ?? user.score ?? 0) || 0);
        else if (tabType === 'activity') scoreVal = formatNumber(Number(user.monthlyActiveScore ?? user.activityScore ?? user.score ?? 0) || 0);
        else if (tabType === 'vip') scoreVal = String(user.vipLabel || `VIP ${Math.max(0, Number(user.vipLevel) || 0)}`);
        else if (tabType === 'chess') scoreVal = String(Math.max(100, Math.round(Number(user.chessElo) || 1000)));
        else if (tabType === 'pisti') scoreVal = String(Math.max(100, Math.round(Number(user.pistiElo) || 1000)));

        const scoreBox = document.createElement('div');
        scoreBox.className = 'lb-score-box';

        const scoreValue = document.createElement('span');
        scoreValue.className = 'lb-score-val';
        scoreValue.style.color = scoreColor;
        scoreValue.textContent = scoreVal;

        const scoreLabel = document.createElement('span');
        scoreLabel.className = 'lb-score-label';
        scoreLabel.textContent = label;

        scoreBox.append(scoreValue, scoreLabel);
        item.append(rank, wrapper, name, scoreBox);
        const targetUid = String(user.uid || '').trim();
        if (targetUid) {
          item.addEventListener('click', () => showPlayerStats(targetUid));
        } else {
          item.disabled = true;
          item.style.cursor = 'default';
        }
        container.appendChild(item);
      });
    }

    async function loadLeaderboard(){
      leaderboardSkeleton();
      try {
        await apiBaseReady;
        const response = await fetch(`${API_URL}/api/leaderboard`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          cache: 'no-store'
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) throw new Error(`Sunucu hatası. (${response.status})`);
        if (!contentType.includes('application/json')) throw new Error('Beklenmeyen sunucu yanıtı.');

        const payload = await response.json();
        if (!payload || payload.ok === false) throw new Error(payload?.error || 'Liderlik tablosu yüklenemedi.');

        currentLeaderboardData = {
          levelTop: (Array.isArray(payload.levelTop) ? payload.levelTop : Array.isArray(payload.rankTop) ? payload.rankTop : []).slice(0, 5),
          seasonTop: (Array.isArray(payload.seasonTop) ? payload.seasonTop : []).slice(0, 5),
          activityTop: (Array.isArray(payload.activityTop) ? payload.activityTop : Array.isArray(payload.monthlyActiveTop) ? payload.monthlyActiveTop : []).slice(0, 5),
          vipTop: (Array.isArray(payload.vipTop) ? payload.vipTop : []).slice(0, 5),
          chessTop: (Array.isArray(payload.chessTop) ? payload.chessTop : []).slice(0, 5),
          pistiTop: (Array.isArray(payload.pistiTop) ? payload.pistiTop : []).slice(0, 5)
        };

        renderLeaderboardTab(currentLeaderboardTab || 'level');
      } catch (error) {
        const container = $("leaderboardListArea");
        if (container) {
          container.innerHTML = '';
          const box = document.createElement('div');
          box.className = 'sheet-card';
          box.textContent = `Liderlik verisi alınamadı: ${error.message}`;
          container.appendChild(box);
        }
      }
    }

    function drawWheel(){
      const canvas = $("wheelCanvas");
      const ctx = canvas.getContext("2d");
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = canvas.width / 2;
      const sliceAngle = (2 * Math.PI) / REWARDS.length;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      REWARDS.forEach((reward, index) => {
        const angle = index * sliceAngle - Math.PI / 2;
        ctx.beginPath();
        ctx.fillStyle = reward.color;
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(63,140,255,.22)";
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle + sliceAngle / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = index % 2 === 0 ? "#BEEFFF" : "#F5F7FF";
        ctx.font = "900 30px Inter";
        ctx.fillText(reward.label, radius - 34, 12);
        ctx.restore();
      });
    }

    async function refreshWheelUI(){
      if (!auth.currentUser) return;
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        await tryClaimPendingReferral();
      }
      const data = state.userData || {};
      const lastSpin = Number(data.lastSpin || data.lastSpinAt || 0);
      const diff = 86400000 - (Date.now() - lastSpin);
      const cooldownEl = $("wheelCooldownText");
      if (diff > 0) {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        $("wheelSpinBtn").disabled = true;
        if (cooldownEl) cooldownEl.textContent = `Kilitli: ${h} saat ${m} dakika kaldı.`;
        $("wheelResult").textContent = `Tekrar çevirebilmek için ${h} saat ${m} dakika beklemelisin.`;
      } else {
        $("wheelSpinBtn").disabled = !auth.currentUser.emailVerified;
        if (cooldownEl) cooldownEl.textContent = auth.currentUser.emailVerified ? "Çark çevirmeye hazır." : "E-postanı onayla, çark açılır.";
        if (!auth.currentUser.emailVerified) $("wheelResult").textContent = "Çarkı açmak için e-posta doğrulaması gerekli.";
      }
    }

    async function spinWheel(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        if (!auth.currentUser.emailVerified) throw new Error("Çark için önce e-postanı doğrulamalısın.");
        $("wheelSpinBtn").disabled = true;
        $("wheelResult").textContent = "Sunucuda hesaplanıyor…";
        const response = await fetchPrivate("/api/wheel/spin", "POST");
        const prize = response.prize;
        const randomIndex = response.index;
        const segmentDeg = 360 / REWARDS.length;
        const stopAt = 360 - (randomIndex * segmentDeg);
        const extraTours = 3600;
        state.wheelRotation += extraTours + stopAt;
        $("wheelCanvas").style.transform = `rotate(${state.wheelRotation}deg)`;
        setTimeout(async () => {
          $("wheelResult").textContent = `Başarılı! ${formatNumber(prize)} MC kazandın.`;
          showToast("Çark sonucu", `${formatNumber(prize)} MC hesabına işlendi.`, "success");
          await loadUserData();
          await refreshWheelUI();
        }, 5000);
      } catch (error) {
        $("wheelResult").textContent = error.message;
        $("wheelSpinBtn").disabled = false;
        showToast("Çark hatası", error.message, "error");
      }
    }

    async function submitPromo(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        if (!auth.currentUser.emailVerified) throw new Error("Promo için önce e-postanı doğrulamalısın.");
        const code = ($("promoCode").value || "").trim().toUpperCase();
        if (!code) throw new Error("Promo kodu gir.");
        $("promoHelp").textContent = "Doğrulanıyor…";
        $("promoHelp").className = "field-help";
        const response = await fetchPrivate("/api/bonus/claim", "POST", { code });
        $("promoCode").value = "";
        $("promoHelp").textContent = `Onaylandı! ${formatNumber(response.amount)} MC eklendi.`;
        $("promoHelp").className = "field-help is-success";
        showToast("Promo başarılı", `${formatNumber(response.amount)} MC hesabına işlendi.`, "success");
        await loadUserData();
      } catch (error) {
        $("promoHelp").textContent = error.message;
        $("promoHelp").className = "field-help is-error";
      }
    }

    async function submitSupport(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        const subject = ($("supportSubject").value || "").trim();
        const reference = ($("supportReference").value || "").trim();
        const category = $("supportCategory").value || "Genel";
        const priority = $("supportPriority").value || "Normal";
        const message = ($("supportMessage").value || "").trim();

        if (subject.length < 4) throw new Error("Lütfen en az 4 karakterlik bir konu başlığı gir.");
        if (message.length < 15) throw new Error("Sorun detayını daha açıklayıcı yaz. En az 15 karakter gerekli.");

        $("supportHelp").textContent = "Gönderiliyor…";
        $("supportHelp").className = "field-help";
        await fetchPrivate("/api/support/receipt", "POST", {
          subject,
          note: message,
          category,
          priority,
          roundId: reference
        });
        $("supportSubject").value = "";
        $("supportReference").value = "";
        $("supportCategory").value = "Genel";
        $("supportPriority").value = "Normal";
        $("supportMessage").value = "";
        $("supportHelp").textContent = "Destek kaydın oluşturuldu.";
        $("supportHelp").className = "field-help is-success";
        showToast("Destek talebi gönderildi", "Detaylı destek kaydın başarıyla iletildi.", "success");
      } catch (error) {
        $("supportHelp").textContent = error.message;
        $("supportHelp").className = "field-help is-error";
      }
    }

    async function loadInviteLink(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        $("inviteHelp").textContent = "Link hazırlanıyor…";
        $("inviteHelp").className = "field-help";
        const response = await fetchPrivate("/api/referral/link");
        const code = (response.code || "").trim();
        let link = (response.link || "").trim();
        if (code && !link) link = `${window.location.origin}/?ref=${code}`;
        if (link.startsWith("?ref=")) link = `${window.location.origin}/${link}`;
        $("inviteCode").value = code;
        $("inviteLink").value = link;
        $("inviteHelp").textContent = "Hazır. Kopyalayıp paylaşabilirsin.";
        $("inviteHelp").className = "field-help is-success";
      } catch (error) {
        $("inviteHelp").textContent = error.message;
        $("inviteHelp").className = "field-help is-error";
      }
    }

    async function copyFieldValue(id, message){
      const value = $(id).value || "";
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        showToast("Kopyalandı", message, "success");
      } catch {
        showToast("Kopyalama hatası", "Panoya kopyalanamadı.", "error");
      }
    }

    async function saveProfile(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        await fetchPrivate("/api/profile/update", "POST", {
          fullName: ($("profileFullName").value || "").trim(),
          username: ($("profileUsername").value || "").trim(),
          avatar: state.selectedAvatar || AVATARS[0],
          selectedFrame: getSelectedFrameLevel()
        });
        showToast("Profil güncellendi", "Profil bilgilerin kaydedildi.", "success");
        await loadUserData();
      } catch (error) {
        showToast("Profil hatası", error.message, "error");
      }
    }

    async function sendVerificationMail(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        await sendEmailVerification(auth.currentUser);
        showToast("Doğrulama maili", "E-posta adresine doğrulama bağlantısı gönderildi.", "success");
      } catch (error) {
        showToast("Gönderim hatası", error.message, "error");
      }
    }

    async function requestEmailUpdate(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        const currentEmail = auth.currentUser.email || "";
        const nextEmail = (window.prompt("Yeni e-posta adresini gir:", currentEmail) || "").trim().toLowerCase();
        if (!nextEmail) return;
        if (nextEmail === currentEmail.toLowerCase()) {
          showToast("Bilgi", "Yeni e-posta adresi mevcut adresle aynı.", "info");
          return;
        }
        await verifyBeforeUpdateEmail(auth.currentUser, nextEmail);
        showToast("Güncelleme bağlantısı", "Yeni e-posta adresine doğrulama bağlantısı gönderildi.", "success");
      } catch (error) {
        showToast("E-posta güncelleme hatası", error.message, "error");
      }
    }

    async function handleVerifyEmailAction(){
      try {
        if (!auth.currentUser) throw new Error("Önce giriş yapmalısın.");
        await reload(auth.currentUser);
        syncVerifyButtonState();
        if (auth.currentUser.emailVerified) {
          await requestEmailUpdate();
          return;
        }
        await sendVerificationMail();
      } catch (error) {
        showToast("İşlem hatası", error.message, "error");
      }
    }

    async function checkUsernameAvailability(){
      const value = ($("profileUsername").value || "").trim();
      $("usernameHelp").textContent = "";
      $("usernameHelp").className = "field-help";
      if (!auth.currentUser || !value) return;
      if (value.length < 3) {
        $("usernameHelp").textContent = "Kullanıcı adı en az 3 karakter olmalı.";
        return;
      }

      const current = (state.userData?.username || "").toLowerCase();
      if (current === value.toLowerCase()) {
        $("usernameHelp").textContent = "Mevcut kullanıcı adın.";
        $("usernameHelp").className = "field-help is-success";
        return;
      }

      try {
        $("usernameHelp").textContent = "Kontrol ediliyor…";
        const payload = await fetchPrivate("/api/check-username?username=" + encodeURIComponent(value));
        $("usernameHelp").textContent = payload.available ? "Kullanılabilir." : "Bu kullanıcı adı dolu.";
        $("usernameHelp").className = `field-help ${payload.available ? "is-success" : "is-error"}`;
      } catch(_) {
        $("usernameHelp").textContent = "";
        $("usernameHelp").className = "field-help";
      }
    }

    async function submitAuth(){
      const email = ($("authEmail").value || "").trim();
      const password = $("authPassword").value || "";
      $("authHelp").textContent = "";
      $("authHelp").className = "field-help";

      try {
        if (state.authMode === "login") {
          if (!email || !password) throw new Error("E-posta veya kullanıcı adı ve şifre zorunlu.");
          const resolvedEmail = await resolveLoginIdentifier(email);
          await signInWithEmailAndPassword(auth, resolvedEmail, password);
          await bootstrapServerSession().catch(() => null);
          showToast("Giriş başarılı", "Oturum açıldı.", "success");
          closeSheet();
        } else {
          const fullName = ($("authFullName").value || "").trim();
          const username = ($("authUsername").value || "").trim();
          if (!fullName || !username || !email || !password) throw new Error("Tüm alanları doldur.");
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          await sendEmailVerification(credential.user);
          try {
            await fetchPrivate("/api/profile/update", "POST", { fullName, username, avatar: AVATARS[0] });
          } catch(_) {}
          showToast("Hesap oluşturuldu", "Doğrulama bağlantısı e-posta adresine gönderildi.", "success");
          closeSheet();
        }
      } catch (error) {
        let message = error.message || "İşlem başarısız.";
        if (error.code === "auth/email-already-in-use") message = "E-posta zaten kullanımda.";
        if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") message = "Hatalı e-posta veya şifre.";
        $("authHelp").textContent = message;
        $("authHelp").className = "field-help is-error";
      }
    }

    async function forgotPassword(){
      const email = ($("forgotEmail").value || "").trim();
      try {
        if (!email) throw new Error("E-posta adresi zorunlu.");
        await sendPasswordResetEmail(auth, email);
        $("forgotHelp").textContent = "Sıfırlama bağlantısı gönderildi.";
        $("forgotHelp").className = "field-help is-success";
        showToast("Şifre sıfırlama", "Sıfırlama linki e-posta adresine gönderildi.", "success");
      } catch (error) {
        $("forgotHelp").textContent = error.message || "Gönderilemedi.";
        $("forgotHelp").className = "field-help is-error";
      }
    }

    function updateMobileTabs(){
      const sections = ["#hero", "#games", "#leaderboard"];
      const positions = sections.map((selector) => {
        const element = document.querySelector(selector);
        return { selector, top: element ? element.getBoundingClientRect().top : Number.POSITIVE_INFINITY };
      });
      let active = "#hero";
      for (const entry of positions) if (entry.top <= window.innerHeight * .35) active = entry.selector;
      document.querySelectorAll(".mobile-tab").forEach((button) => {
        if (button.dataset.mobileLink) button.classList.toggle("is-active", button.dataset.mobileLink === active);
      });
    }

    function bindSheetDrag(){
      const start = (clientY) => {
        if (window.innerWidth > 860) return;
        state.drag.active = true;
        state.drag.startY = clientY;
        state.drag.deltaY = 0;
      };
      const move = (clientY) => {
        if (!state.drag.active) return;
        state.drag.deltaY = Math.max(0, clientY - state.drag.startY);
        $("sheetPanel").style.transform = `translateY(${state.drag.deltaY}px)`;
      };
      const end = () => {
        if (!state.drag.active) return;
        const close = state.drag.deltaY > 120;
        state.drag.active = false;
        if (close) closeSheet();
        else $("sheetPanel").style.transform = "";
      };
      $("sheetHandle").addEventListener("touchstart", (e) => start(e.touches[0].clientY), { passive:true });
      $("sheetHandle").addEventListener("touchmove", (e) => move(e.touches[0].clientY), { passive:true });
      $("sheetHandle").addEventListener("touchend", end);
      $("sheetHandle").addEventListener("pointerdown", (e) => start(e.clientY));
      window.addEventListener("pointermove", (e) => move(e.clientY));
      window.addEventListener("pointerup", end);
    }

    function revealFadeUps(){
      document.querySelectorAll(".fade-up").forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight - 40) element.classList.add("is-visible");
      });
    }

    function installTouchHardening(){
      document.documentElement.style.webkitTextSizeAdjust = "100%";
      document.documentElement.style.touchAction = "manipulation";
      document.body.style.touchAction = "manipulation";

      let lastTouchEnd = 0;
      document.addEventListener("touchend", (event) => {
        const now = Date.now();
        if (now - lastTouchEnd < 320) event.preventDefault();
        lastTouchEnd = now;
      }, { passive:false });

      document.addEventListener("dblclick", (event) => {
        if (event.target && event.target.closest && event.target.closest("button, a, .btn, .card, .sheet, .game-card, .social-shell")) {
          event.preventDefault();
        }
      }, { passive:false });

      document.addEventListener("gesturestart", (event) => {
        if (event.touches && event.touches.length > 1) {
          event.preventDefault();
        }
      }, { passive:false });
    }


    function setAppHeight(){
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const stableHeight = Math.max(window.innerHeight || 0, viewportHeight || 0, document.documentElement.clientHeight || 0);
      document.documentElement.style.setProperty("--app-height", `${Math.round(stableHeight)}px`);
    }

    function forceFirstPaintRefresh(){
      setAppHeight();
      revealFadeUps();
      updateMobileTabs();
      const main = document.querySelector("main.container");
      if (!main) return;
      main.style.transform = "translateZ(0)";
      requestAnimationFrame(() => {
        main.style.transform = "";
      });
    }

    function installFirstPaintStabilizer(){
      try {
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      } catch (_) {}

      const queueRefresh = (delay = 0) => window.setTimeout(() => requestAnimationFrame(forceFirstPaintRefresh), delay);
      [0, 16, 40, 90, 180, 320, 520].forEach(queueRefresh);

      window.addEventListener("load", () => queueRefresh(0), { once:true, passive:true });
      window.addEventListener("pageshow", () => queueRefresh(0), { passive:true });
      window.addEventListener("resize", () => queueRefresh(0), { passive:true });
      window.addEventListener("orientationchange", () => queueRefresh(60), { passive:true });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") queueRefresh(0);
      }, { passive:true });
      document.addEventListener("touchstart", () => queueRefresh(0), { passive:true, once:true });

      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => queueRefresh(0), { passive:true });
        window.visualViewport.addEventListener("scroll", () => queueRefresh(0), { passive:true });
      }
    }

    function bindEvents(){
      $("brandHome").addEventListener("click", () => window.scrollTo({ top:0, behavior:"smooth" }));
      $("heroStartBtn").addEventListener("click", () => auth.currentUser ? openProfileSheet() : (setAuthMode("register"), openSheet("auth", "Yeni hesap oluştur", "Kullanıcı adı ve e-posta ile hızlı kayıt akışı.")));
      $("loginBtn").addEventListener("click", () => { setAuthMode("login"); openSheet("auth", "Hesabına giriş yap", "Oyunlara, çarka ve profil araçlarına anında eriş."); });
      $("registerBtn").addEventListener("click", () => { setAuthMode("register"); openSheet("auth", "Yeni hesap oluştur", "Kullanıcı adı ve e-posta ile hızlı kayıt akışı."); });

      $("profileTrigger").addEventListener("click", (e) => {
        e.stopPropagation();
        playSound("tap");
        $("userDropdown").classList.toggle("active");
      });

      document.addEventListener("click", (e) => {
        if ($("userDropdown") && !e.target.closest("#topUser")) $("userDropdown").classList.remove("active");
      });

      $("navProfileItem").addEventListener("click", () => { $("userDropdown").classList.remove("active"); openProfileSheet(); });
      $("navWheelItem").addEventListener("click", () => { $("userDropdown").classList.remove("active"); openWheelSheet(); });
      $("navBonusItem").addEventListener("click", () => { $("userDropdown").classList.remove("active"); openPromoSheet(); });
      $("navSupportItem").addEventListener("click", () => { $("userDropdown").classList.remove("active"); openSupportSheet(); });
      $("navInviteItem").addEventListener("click", async () => { $("userDropdown").classList.remove("active"); await openInviteSheet(); });
      $("navSocialItem").addEventListener("click", async () => { $("userDropdown").classList.remove("active"); await primeRealtimeUX().catch(() => null); await openSocialSheet(); });
      $("logoutDropdownBtn").addEventListener("click", async () => { $("userDropdown").classList.remove("active"); await endServerSession(); await signOut(auth); closeSheet(); showToast("Çıkış yapıldı", "Oturum güvenli şekilde kapatıldı.", "info"); });

      $("refreshLeaderboardBtn").addEventListener("click", loadLeaderboard);
      document.querySelectorAll("#leaderboardTabs .lb-tab-btn").forEach((button) => {
        button.addEventListener("click", () => renderLeaderboardTab(button.dataset.lbTab || "level"));
      });
      const openAvatarSelectionBtn = $("openAvatarSelectionBtn");
      if (openAvatarSelectionBtn) openAvatarSelectionBtn.addEventListener("click", openAvatarSelectionModal);
      document.querySelectorAll('.ps-modal').forEach((modal) => {
        modal.addEventListener('click', (event) => {
          if (event.target === modal) closeMatrixModal(modal.id);
        });
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const activeModal = document.querySelector('.ps-modal.active');
          if (activeModal) closeMatrixModal(activeModal.id);
        }
      });
      $("sheetBackdrop").addEventListener("click", closeSheet);
      $("sheetClose").addEventListener("click", closeSheet);
      $("authSegment").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
      $("authSubmitBtn").addEventListener("click", submitAuth);
      $("forgotPasswordBtn").addEventListener("click", () => {
        $("forgotEmail").value = $("authEmail").value || "";
        $("forgotHelp").textContent = "";
        $("forgotHelp").className = "field-help";
        openSheet("forgot", "Şifremi Unuttum", "Sıfırlama bağlantısı e-posta adresine gönderilir.");
      });
      $("forgotSubmitBtn").addEventListener("click", forgotPassword);

      $("profileSaveBtn").addEventListener("click", saveProfile);
      $("verifyEmailBtn").addEventListener("click", handleVerifyEmailAction);
      $("logoutBtn").addEventListener("click", async () => { await endServerSession(); await signOut(auth); closeSheet(); showToast("Çıkış yapıldı", "Oturum güvenli şekilde kapatıldı.", "info"); });
      $("wheelSpinBtn").addEventListener("click", spinWheel);
      $("wheelRefreshBtn").addEventListener("click", refreshWheelUI);
      $("promoSubmitBtn").addEventListener("click", submitPromo);
      $("supportSubmitBtn").addEventListener("click", submitSupport);
      $("generateInviteBtn").addEventListener("click", loadInviteLink);
      $("copyInviteCodeBtn").addEventListener("click", () => copyFieldValue("inviteCode", "Davet kodu panoya kopyalandı."));
      $("copyInviteLinkBtn").addEventListener("click", () => copyFieldValue("inviteLink", "Davet bağlantısı panoya kopyalandı."));
      document.querySelectorAll(".ps-tab").forEach((button) => {
        button.addEventListener("click", () => {
          playSound("tap");
          const targetTab = button.dataset.socialTab || "global";
          setSocialTab(targetTab, { resetSelection: true, openPanel: targetTab === "global" || targetTab === "add" });
        });
      });
      $("psSendBtn").addEventListener("click", () => { primeRealtimeUX().catch(() => null); sendSocialMessage(); });
      $("psChatInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          sendSocialMessage();
        }
      });
      $("psChatInput").addEventListener("input", () => {
        handleSocialComposerInput();
        handleDirectTypingActivity();
      });
      $("psMobileBackBtn").addEventListener("click", () => {
        state.social.mobilePanelOpen = false;
        renderSocialHub();
      });
      window.addEventListener("resize", () => {
        if (!isSocialMobile()) {
          state.social.mobilePanelOpen = true;
        }
        if (state.currentSheet === "social") renderSocialHub();
      }, { passive:true });
      $("profileUsername").addEventListener("input", () => {
        clearTimeout(state.usernameDebounce);
        state.usernameDebounce = setTimeout(checkUsernameAvailability, 320);
      });
      $("soundToggle").addEventListener("click", () => {
        state.soundEnabled = !state.soundEnabled;
        localStorage.setItem("pm_ui_sound", state.soundEnabled ? "on" : "off");
        updateSoundUI();
        showToast("Arayüz sesi", state.soundEnabled ? "Premium tık sesleri açık." : "Arayüz sesleri kapatıldı.", "info");
      });

      document.querySelectorAll(".filter-chip").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.remove("is-active"));
          button.classList.add("is-active");
          state.activeFilter = button.dataset.filter;
          renderGames();
        });
      });

      $("gameSearch").addEventListener("input", renderGames);

      document.querySelectorAll(".mobile-tab").forEach((button) => {
        button.addEventListener("click", async () => {
          const link = button.dataset.mobileLink;
          const action = button.dataset.mobileAction;
          if (link) {
            document.querySelector(link)?.scrollIntoView({ behavior:"smooth", block:"start" });
            updateMobileTabs();
            return;
          }
          if (action === "wheel") openWheelSheet();
          if (action === "promo") openPromoSheet();
          if (action === "profile") openProfileSheet();
        });
      });

      window.addEventListener("scroll", updateMobileTabs, { passive:true });
      window.addEventListener("scroll", revealFadeUps, { passive:true });
      window.addEventListener("resize", revealFadeUps, { passive:true });
    }

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        await bootstrapServerSession().catch(() => null);
        startActivityHeartbeat();
        await loadUserData();
        await tryClaimPendingReferral();
        await ensureRealtimeConnection().catch(() => null);
        await loadFriends().catch(() => null);
      } else {
        stopActivityHeartbeat();
        disconnectRealtime();
        state.userData = null;
        state.vipCenter = null;
        state.vipCatalog = null;
        state.friends = { accepted: [], incoming: [], outgoing: [], counts: { accepted:0, incoming:0, outgoing:0, online:0 } };
        state.lobbyMessages = [];
        resetSocialState();
        renderSocialHub();
        updateUserShell();
        syncVerifyButtonState();
      }
      renderGames();
      await loadLeaderboard();
      updateMobileTabs();
    });

    document.addEventListener("mousemove", (event) => {
      document.documentElement.style.setProperty("--mx", `${(event.clientX / window.innerWidth) * 100}%`);
      document.documentElement.style.setProperty("--my", `${(event.clientY / window.innerHeight) * 100}%`);
    }, { passive:true });

    captureReferralFromUrl();
    updateSocialConnectionBadge();
    renderSocialHub();
    updateSoundUI();
    setAuthMode("login");
    bindEvents();
    bindSheetDrag();
    installTouchHardening();
    installFirstPaintStabilizer();
    forceFirstPaintRefresh();
    drawWheel();
    renderGames();
    updateSystemOverview();
    loadLeaderboard();
    updateUserShell();
    syncVerifyButtonState();
    updateMobileTabs();
    revealFadeUps();