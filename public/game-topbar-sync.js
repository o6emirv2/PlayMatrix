(function(){
  'use strict';
  const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27%23111827%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%2F%3E%3C%2Fsvg%3E';
  const state = { lastBalance: null, lastLevel: null, lastProgress: null, inFlight: false, lastRefreshAt: 0, minIntervalMs: 2500 };
  function fmt(n){ return Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function intFmt(n){ return Math.floor(Number(n||0)).toLocaleString('tr-TR'); }
  function profileFromPayload(payload){ return payload?.user || payload?.profile || payload?.me || payload || {}; }
  function pickNumber(){ for(const value of arguments){ const n=Number(value); if(Number.isFinite(n)) return n; } return null; }
  function pct(profile){ const v=pickNumber(profile?.progression?.progressPercent, profile?.progression?.accountLevelProgressPct, profile?.progressPercent, profile?.accountLevelProgressPct, profile?.progression?.progressPct, 0); return Math.max(0,Math.min(100,Number.isFinite(v)?v:0)); }
  function safeAvatar(value){ return window.PMAvatar?.safeAvatarUrl ? window.PMAvatar.safeAvatarUrl(value || DEFAULT_AVATAR) : (value || DEFAULT_AVATAR); }
  function pmGameTopbarVariant(){
    const path = String(location.pathname || '').toLowerCase();
    if (path.includes('/crash')) return 'crashTopbar';
    if (path.includes('/chess')) return 'chessTopbar';
    if (path.includes('/pisti')) return 'pistiTopbar';
    if (path.includes('/snake-pro')) return 'snakeTopbar';
    if (path.includes('/space-pro')) return 'spaceTopbar';
    if (path.includes('/pattern-master')) return 'patternTopbar';
    return 'homeTopbar';
  }

  function setText(ids,text,changed){ ids.forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.textContent=text; if(changed) pulse(el); }); }
  function pulse(node){ if(!node) return; node.classList.remove('pm-live-sync-pulse'); void node.offsetWidth; node.classList.add('pm-live-sync-pulse'); setTimeout(()=>node.classList.remove('pm-live-sync-pulse'),650); }
  function ensurePulseStyles(){
    if(document.getElementById('pm-live-sync-pulse-style')) return;
    const style=document.createElement('style');
    style.id='pm-live-sync-pulse-style';
    style.textContent=`
      @keyframes pmLiveSyncPulse{0%{filter:brightness(1);transform:translateZ(0) scale(1)}45%{filter:brightness(1.35);transform:translateZ(0) scale(1.045)}100%{filter:brightness(1);transform:translateZ(0) scale(1)}}
      .pm-live-sync-pulse{animation:pmLiveSyncPulse .65s ease both}
      .pm-topbar-avatar-only{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
      .top-bar-full,.account-level-section{overflow:visible!important}
      .account-level-section{padding-left:6px!important}
      .pm-game-topbar-avatar-host{width:52px!important;height:52px!important;min-width:52px!important;flex:0 0 52px!important;margin-left:3px!important;border-radius:18px!important;overflow:visible!important;display:grid!important;place-items:center!important;isolation:isolate!important;background:linear-gradient(145deg,rgba(255,255,255,.09),rgba(255,255,255,.03))!important;border:1px solid rgba(255,255,255,.12)!important}
      .pm-game-topbar-avatar-host>[data-pm-avatar=true],.pm-game-topbar-avatar-host>.pm-avatar{width:50px!important;height:50px!important;max-width:50px!important;max-height:50px!important;overflow:visible!important;display:grid!important;place-items:center!important}
      .pm-game-topbar-avatar-host [data-pm-avatar=true]>.pm-avatar-img,.pm-game-topbar-avatar-host [data-pm-avatar=true]>img:not(.pm-frame-image):not(.pm-avatar-shell__frame):not(.pm-game-frame){position:absolute!important;inset:0!important;left:0!important;top:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;display:block!important;object-fit:cover!important;border-radius:50%!important;transform:translate3d(var(--pm-avatar-shift-x,0px),var(--pm-avatar-shift-y,0px),0) scale(var(--pm-avatar-scale,1))!important;transform-origin:center!important}
      .pm-game-topbar-avatar-host [data-pm-avatar=true]>.pm-frame-image,.pm-game-topbar-avatar-host [data-pm-avatar=true]>.pm-avatar-shell__frame,.pm-game-topbar-avatar-host [data-pm-avatar=true]>.pm-game-frame{display:block!important;visibility:visible!important;position:absolute!important;left:50%!important;top:50%!important;width:calc(100% * var(--pm-frame-scale,1.18))!important;height:calc(100% * var(--pm-frame-scale,1.18))!important;max-width:none!important;max-height:none!important;object-fit:contain!important;transform:translate3d(calc(-50% + var(--pm-frame-shift-x,0px)),calc(-50% + var(--pm-frame-shift-y,0px)),0)!important;transform-origin:center!important;z-index:4!important;pointer-events:none!important}
      @media(max-width:480px){.account-level-section{padding-left:7px!important;gap:10px!important}.pm-game-topbar-avatar-host{width:44px!important;height:44px!important;min-width:44px!important;flex-basis:44px!important;margin-left:2px!important}.pm-game-topbar-avatar-host>[data-pm-avatar=true],.pm-game-topbar-avatar-host>.pm-avatar{width:42px!important;height:42px!important}}
    `;
    document.head.appendChild(style);
  }
  function mountAvatar(profile){
    const avatar = safeAvatar(profile.avatar || profile.photoURL || profile.avatarUrl || DEFAULT_AVATAR);
    const accountLevel = Math.max(1, Math.floor(pickNumber(profile.accountLevel, profile.level, profile.progression?.accountLevel, profile.progression?.level, 1) || 1));
    const selectedFrame = Math.max(0, Math.floor(pickNumber(profile.selectedFrame, profile.activeFrame, profile.frameLevel, profile.frame, profile.selectedFrameLevel, 0) || 0));
    const hasExplicitFrame = selectedFrame > 0;
    const renderLevel = hasExplicitFrame ? selectedFrame : accountLevel;
    const exactFrameIndex = hasExplicitFrame && selectedFrame <= 18
      ? selectedFrame
      : (window.PMAvatar?.getFrameAssetIndex ? window.PMAvatar.getFrameAssetIndex(renderLevel) : 0);
    const frameUrl = String(profile.marketFrameUrl || profile.frameUrl || profile.activeFrameUrl || profile.selectedFrameUrl || '');
    const pageVariant = pmGameTopbarVariant();
    const hostIds = pageVariant === 'homeTopbar' ? ['topbarAvatarShell'] : ['uiAccountAvatarHost'];
    const hosts = hostIds.map(id=>document.getElementById(id)).filter(Boolean);
    for(const host of hosts){
      const variant = host.id === 'topbarAvatarShell' ? 'homeTopbar' : pageVariant;
      const allowedFrame = variant !== 'homeTopbar';
      const key = `topbar-avatar-frame:${variant}:${avatar}:${accountLevel}:${allowedFrame ? selectedFrame : 0}:${allowedFrame ? exactFrameIndex : 0}:${allowedFrame ? frameUrl : ''}`;
      if(host.dataset.pmTopbarAvatarKey === key && host.firstElementChild) continue;
      if(window.PMAvatar?.mount){
        try{
          window.PMAvatar.mount(host,{ avatarUrl:avatar, level:allowedFrame ? renderLevel : 0, exactFrameIndex:allowedFrame ? exactFrameIndex : 0, frameUrl:allowedFrame ? frameUrl : '', frameType: allowedFrame && frameUrl ? 'market' : 'level', marketFrameId: allowedFrame ? String(profile.marketFrameId || profile.marketEquipped?.frame || profile.equippedMarket?.frame || profile.cosmeticSlots?.frame?.itemId || '') : '', sizePx:50, wrapperClass:'pm-avatar pm-game-topbar-avatar', imageClass:'pm-avatar-img', variant, sizeTag:variant, alt:'Hesap avatarı' });
          host.dataset.pmTopbarAvatarKey=key;
          continue;
        }catch(_){}
      }
      const img = document.createElement('img');
      img.src = avatar; img.alt = 'Hesap avatarı'; img.loading = 'eager'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.draggable = false; img.className = 'pm-topbar-avatar-only';
      host.replaceChildren(img); host.dataset.pmTopbarAvatarKey = key;
    }
  }
  function apply(payload, options){
    ensurePulseStyles();
    const p = profileFromPayload(payload);
    if(!p || typeof p !== 'object') return false;
    const level = pickNumber(payload?.accountLevel, payload?.level, payload?.progression?.level, p.accountLevel, p.level, p.progression?.level, p.progression?.accountLevel, 1) || 1;
    const balance = pickNumber(payload?.balance, payload?.mc, payload?.mcBalance, payload?.wallet?.balance, p.balance, p.mc, p.mcBalance, p.wallet?.balance, 0) || 0;
    const percent = pct(p.progression ? p : { ...p, progression: payload?.progression || p.progression });
    const changedLevel = state.lastLevel !== null && Math.floor(level) !== state.lastLevel;
    const changedBalance = state.lastBalance !== null && Math.abs(balance - state.lastBalance) >= 0.01;
    const changedProgress = state.lastProgress !== null && Math.abs(percent - state.lastProgress) >= 0.05;
    state.lastLevel = Math.floor(level); state.lastBalance = balance; state.lastProgress = percent;
    const force = !!options?.forcePulse;
    setText(['uiAccountLevelBadge','ddLevel'], String(Math.floor(level)), changedLevel || force);
    setText(['uiBalance','ui-balance','uiAccountBalance'], fmt(balance), changedBalance || force);
    setText(['headerBalance'], intFmt(balance), changedBalance || force);
    setText(['headerRankText'], `Hesap Seviyesi ${Math.floor(level)}`, changedLevel || force);
    setText(['uiAccountLevelPct','uiAccountProgressText','ddPct'], `${percent.toFixed(1)}%`, changedProgress || force);
    ['uiAccountLevelBar','uiAccountProgressFill','topProgressFill','profileProgressFill','ddBar'].forEach(id=>{ const el=document.getElementById(id); if(el){ el.style.width=`${percent}%`; el.style.setProperty('--pm-progress',`${percent}%`); if(changedProgress || force) pulse(el.closest('.stat-bar-bg') || el); }});
    mountAvatar(p);
    try{ window.__PM_LAST_ACCOUNT_STATE__ = Object.assign({}, window.__PM_LAST_ACCOUNT_STATE__ || {}, p, { balance, accountLevel: Math.floor(level), progressPercent: percent }); }catch(_){ }
    try{ window.dispatchEvent(new CustomEvent('pm:account-sync-applied', { detail: payload })); }catch(_){ }
    return true;
  }
  async function getAuthToken(forceRefresh){ try{ if(window.__PM_RUNTIME?.getIdToken) return await window.__PM_RUNTIME.getIdToken(!!forceRefresh); }catch(_){} try{ const user=window.__PM_RUNTIME?.auth?.currentUser; if(user?.getIdToken) return await user.getIdToken(!!forceRefresh); }catch(_){} return ''; }
  function apiBase(){ try{ if(window.__PM_API__?.getApiBaseSync) return String(window.__PM_API__.getApiBaseSync() || '').replace(/\/+$/,'').replace(/\/api$/i,''); }catch(_){} return String(window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || location.origin).replace(/\/+$/,'').replace(/\/api$/i,''); }
  async function refresh(options){
    const opts=options||{}; const now=Date.now(); if(state.inFlight) return null; if(!opts.force && now-state.lastRefreshAt<state.minIntervalMs) return null; state.inFlight=true; state.lastRefreshAt=now;
    try{
      if(window.__PM_ONLINE_CORE__?.requestWithAuth){ const payload=await window.__PM_ONLINE_CORE__.requestWithAuth('/api/me',{method:'GET',timeoutMs:5500,retries:1,allowSessionFallback:true}); apply(payload, opts); return payload; }
      const token=await getAuthToken(!!opts.forceTokenRefresh).catch(()=>'');
      const headers={Accept:'application/json'};
      if(token) headers.Authorization=`Bearer ${token}`;
      if(!token) return null;
      const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(), Math.max(3500, Number(opts.timeoutMs || 9000)));
      const res=await fetch(`${apiBase()}/api/me?t=${Date.now()}`, { method:'GET', headers, credentials:'include', cache:'no-store', signal:controller.signal }); clearTimeout(timer);
      const payload=await res.json().catch(()=>null); if(res.ok && payload?.ok !== false) apply(payload, opts); return payload;
    }catch(error){
      const msg=String(error?.message||error||'');
      const expectedTransient=/abort|aborted|no_user|auth_required|401|network|load failed|failed to fetch|timeout|cancel/i.test(msg);
      if(!expectedTransient){
        try{ window.__PM_REPORT_CLIENT_ERROR__?.('game.topbar.sync', error, { source:'public/game-topbar-sync.js', path:location.pathname, severity:'warning' }); }catch(_){}
      }
      return null;
    }
    finally{ state.inFlight=false; }
  }
  window.__PM_GAME_ACCOUNT_SYNC__ = { apply, refresh, notifyMutation(payload){ const current=window.__PM_LAST_ACCOUNT_STATE__||{}; apply({ ...current, ...(payload?.user || payload?.profile || {}), ...payload }, { forcePulse:true }); } };
  window.addEventListener('pm:online-core-ready', () => refresh({ force:true, timeoutMs:9000 }));
  document.addEventListener('visibilitychange', () => { if(!document.hidden) refresh({ force:true, timeoutMs:9000 }); });
  setTimeout(() => refresh({ force:true, timeoutMs:9000 }), 1200);
  setTimeout(() => refresh({ force:true, timeoutMs:9000 }), 4200);
})();
