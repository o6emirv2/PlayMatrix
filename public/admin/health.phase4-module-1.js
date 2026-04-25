import { adminFetch, resolveAdminUrl, setSecurityKey } from './matrix-core.js';

    const state = { user: null, activeBase: '', admin: null };
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const fmt = (value) => Number(value || 0).toLocaleString('tr-TR');

    function setBadge(id, text, tone='warn') {
      const el = $(id);
      if (!el) return;
      el.className = `badge ${tone}`;
      el.textContent = text;
    }

    function setStatus(text, tone='warn') {
      const el = $('statusBox');
      if (!el) return;
      el.className = `status ${tone}`;
      el.textContent = String(text || '');
    }

    function createMetricCard(label, value) {
      const card = document.createElement('div');
      card.className = 'metric';
      const key = document.createElement('div');
      key.className = 'k';
      key.textContent = String(label || '');
      const val = document.createElement('div');
      val.className = 'v';
      val.textContent = String(value || '');
      card.append(key, val);
      return card;
    }

    function renderMetrics(data = {}) {
      const deployment = data.deployment || data.health?.process || {};
      const counters = data.health?.counters || {};
      const memory = deployment.memory || data.health?.process?.memory || {};
      const items = [
        ['Node', deployment.node || '-'],
        ['Uptime', `${fmt(deployment.uptimeSec)} sn`],
        ['PID', fmt(deployment.pid)],
        ['Kullanıcı', fmt(deployment.userCount || counters.userCount)],
        ['Ticket', fmt(deployment.ticketCount || counters.ticketCount)],
        ['Audit', fmt(deployment.auditCount || counters.auditCount)],
        ['RSS', fmt(memory.rss)],
        ['Heap Used', fmt(memory.heapUsed)]
      ];
      $('metricGrid').replaceChildren(...items.map(([k, v]) => createMetricCard(k, v)));
    }

    async function verifyAdminSession() {
      const status = await adminFetch('/api/auth/admin/matrix/status');
      if (status?.clientKey) setSecurityKey(status.clientKey);
      state.user = status?.user || null;
      state.admin = status?.admin || null;
      state.activeBase = window.__PM_API__?.getApiBaseSync?.() || window.location.origin;
      setBadge('authBadge', `Yönetici oturumu aktif · ${(state.user?.email || state.user?.uid || 'admin')}`, 'ok');
      setBadge('baseBadge', `API · ${state.activeBase}`, 'ok');
      $('userBox').textContent = `${state.user?.email || state.user?.uid || '—'}${state.admin?.role ? ` • ${String(state.admin.role).toUpperCase()}` : ''}`;
      return status;
    }

    async function loadHealth() {
      setBadge('healthBadge', 'Health yükleniyor...', 'warn');
      setStatus('Sistem sağlığı yükleniyor...', 'warn');
      try {
        await verifyAdminSession();
        const payload = await adminFetch('/api/admin/ops/health');
        renderMetrics(payload);
        $('rawOutput').textContent = JSON.stringify(payload, null, 2);
        setBadge('healthBadge', 'Health hazır', 'ok');
        setStatus(`Aktif backend: ${state.activeBase || window.location.origin} · Yönetici health verisi başarıyla alındı.`, 'ok');
      } catch (error) {
        $('rawOutput').textContent = error.message || 'Health yüklenemedi.';
        setBadge('authBadge', 'Yönetici oturumu doğrulanamadı', 'error');
        setBadge('healthBadge', 'Health hatası', 'error');
        setStatus(`Health isteği başarısız: ${error.message || 'Bilinmeyen hata'}`, 'error');
        if (String(error?.message || '').toLowerCase().includes('oturumu') || Number(error?.status || 0) === 401 || Number(error?.status || 0) === 403) {
          window.setTimeout(() => window.location.replace(resolveAdminUrl('./index.html')), 900);
        }
      }
    }

    $('reloadBtn').addEventListener('click', () => loadHealth());
    $('backBtn').addEventListener('click', () => window.location.replace(resolveAdminUrl('./admin.html')));

    renderMetrics({});
    loadHealth();
