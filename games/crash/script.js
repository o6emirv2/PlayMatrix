
(function () {
  'use strict';

  window.playCrashSfx = window.playCrashSfx || function playCrashSfxFallback() {};

  function $(id) { return document.getElementById(id); }
  function gameName() {
    const path = decodeURIComponent(location.pathname || '').toLowerCase();
    if (path.includes('crash')) return 'Crash';
    if (path.includes('satranc') || path.includes('satranç')) return 'Satranç';
    if (path.includes('pisti') || path.includes('pişti')) return 'Pişti';
    return 'Online oyun';
  }
  function setProgress(value) {
    const fill = $('loaderFill');
    const pct = $('loaderPct');
    const safe = Math.max(0, Math.min(100, Number(value) || 0));
    if (fill) fill.style.width = `${safe}%`;
    if (pct) pct.textContent = `${Math.round(safe)}%`;
  }
  function showLoginHomeHint() {
    try {
      sessionStorage.setItem('pm_open_login_after_home', '1');
    } catch (_) {}
  }

  function showActions() {
    const enter = $('btnEnterGame');
    const retry = $('btnRetryBoot');
    if (enter) {
      enter.style.display = 'inline-flex';
      enter.textContent = 'ANASAYFAYA DÖN';
      enter.onclick = function () { showLoginHomeHint(); window.location.href = '/'; };
    }
    if (retry) {
      retry.style.display = 'inline-flex';
      retry.onclick = function () { window.location.reload(); };
    }
  }
  function guardStuckIntro() {
    const intro = $('studioIntro');
    if (!intro || intro.style.display === 'none' || intro.dataset.bootCompleted === '1') return;
    const status = $('loaderStatus');
    const message = String(status?.textContent || '').trim();
    if (/hazır|açılıyor|lobi|oyun/i.test(message) && !/kurulamadı|yüklenemedi|doğrulanamadı/i.test(message)) return;
    setProgress(34);
    if (status) status.textContent = `${gameName()} için giriş veya canlı bağlantı doğrulanamadı. Ana sayfadan giriş yapıp tekrar deneyin.`;
    showActions();
    try {
      if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
        window.__PM_REPORT_CLIENT_ERROR__('online.boot.guard', new Error('ONLINE_GAME_BOOT_STUCK'), { source: 'online-boot-guard', game: gameName() });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(guardStuckIntro, 12000), { once: true });
  } else {
    window.setTimeout(guardStuckIntro, 12000);
  }
})();

import('/public/js/games/crash/index.js?v=pm-v13-live-refresh-session-speed').catch((error) => {
  try {
    window.__PM_REPORT_CLIENT_ERROR__?.('crash.module.import', error, { source: 'games/crash/script.js', game: 'crash', severity: 'error' });
  } catch (_) {}
  console.error('[PlayMatrix:Crash] module import failed', error);
});
