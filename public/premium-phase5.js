
(() => {
  const root = document.documentElement;
  const interactiveSelector = 'button, a, input, textarea, select, label, [role="button"], .btn, .ghost-btn, .pill-btn, .mobile-tab, .drop-item, .filter-chip, .lb-tab-btn';
  let lastTouchEnd = 0;

  function isInteractive(target) {
    return !!target?.closest?.(interactiveSelector);
  }

  function setViewportVars() {
    const height = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    root.style.setProperty('--pm-vh', `${height * 0.01}px`);
    root.style.setProperty('--app-height', `${height}px`);
  }

  function getIstanbulYearMonth() {
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
    return {
      year: Number(values.year || new Date().getUTCFullYear()),
      month: Number(values.month || (new Date().getUTCMonth() + 1))
    };
  }

  function getNextSeasonResetLabel() {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const current = getIstanbulYearMonth();
    const nextMonth = current.month === 12 ? 1 : current.month + 1;
    const nextYear = current.month === 12 ? current.year + 1 : current.year;
    return `01 ${months[nextMonth - 1]} ${nextYear} 00:00`;
  }

  function getSeasonKeyLabel() {
    const current = getIstanbulYearMonth();
    return `${current.year}-${String(current.month).padStart(2, '0')}`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function refreshSystemBadges() {
    setText('seasonResetBadge', getNextSeasonResetLabel());
    setText('activityResetBadge', getNextSeasonResetLabel());
    setText('retentionBadge', 'Global 7 Gün · DM 7 Gün');
    setText('rewardFlowBadge', '50.000 + 100.000 MC');
    setText('seasonKeyBadge', `Sezon: ${getSeasonKeyLabel()}`);
  }

  function decorateBody() {
    document.body?.classList.add('pm-phase5-ready');
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      document.body?.classList.add('pm-touch');
    }
  }

  function bindTouchStability() {
    document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (event) => {
      if (isInteractive(event.target)) event.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', (event) => {
      const now = Date.now();
      if (isInteractive(event.target) && (now - lastTouchEnd) < 320) event.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
  }

  function boot() {
    setViewportVars();
    refreshSystemBadges();
    decorateBody();
  }

  window.addEventListener('resize', setViewportVars, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(setViewportVars, 90), { passive: true });
  document.addEventListener('DOMContentLoaded', boot, { once: true });
  bindTouchStability();
})();
