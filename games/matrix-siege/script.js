(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    config: null,
    progress: null,
    missions: [],
    stageId: 1,
    run: null,
    sim: null,
    events: [],
    raf: 0,
    paused: true,
    speed: 1,
    lastFrame: 0,
    virtualElapsed: 0,
    submitting: false,
    sound: localStorage.getItem('pm:matrix-siege:sound') !== '0',
    missionIndex: 0,
    missionTimer: 0,
    busyAction: false
  };

  const glyphs = {
    'code-runner': 'K',
    'neon-ranger': 'N',
    'matrix-guardian': 'M',
    'pulse-mage': 'P',
    'cyber-commander': 'S',
    'glitch-raider': 'G',
    'void-drone': 'V',
    'iron-brute': 'D',
    'hex-caster': 'H',
    'null-warden': 'W',
    'boss-sentinel': 'Q',
    'boss-null-titan': 'Ø'
  };

  const worldPalettes = {
    1: { top: '#173e2f', mid: '#0b2d22', bottom: '#061a13', grid: 'rgba(56,255,139,.09)', lane: 'rgba(56,255,139,.30)' },
    2: { top: '#112d45', mid: '#091f35', bottom: '#05111f', grid: 'rgba(55,223,255,.10)', lane: 'rgba(55,223,255,.34)' },
    3: { top: '#351642', mid: '#21102d', bottom: '#11091a', grid: 'rgba(214,108,255,.10)', lane: 'rgba(255,79,154,.34)' }
  };

  function tools(title, message, type = 'info') {
    try {
      window.dispatchEvent(new CustomEvent('playmatrix:tools-message', { detail: { title, message, type } }));
    } catch (_) {}
    const status = $('msStatusText');
    if (status) status.textContent = message || title;
  }

  async function request(path, options = {}) {
    if (window.__PM_ONLINE_CORE__?.requestWithAuth) {
      return window.__PM_ONLINE_CORE__.requestWithAuth(path, {
        ...options,
        timeoutMs: 12000,
        retries: 1,
        allowSessionFallback: true
      });
    }

    const headers = new Headers(options.headers || {});
    const token = await window.__PM_RUNTIME?.getIdToken?.(false).catch(() => '');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const base = window.__PM_API__?.getApiBaseSync?.() || location.origin;
    const response = await fetch(`${String(base).replace(/\/$/, '')}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.code || payload?.error || `HTTP_${response.status}`);
      error.code = payload?.code || payload?.error;
      throw error;
    }
    return payload?.data ?? payload;
  }

  function errorText(code = '') {
    const map = {
      AUTH_REQUIRED: 'Devam etmek için giriş yapman gerekiyor.',
      EMAIL_NOT_VERIFIED: 'Devam etmek için e-posta adresini doğrulaman gerekiyor.',
      DATE_OF_BIRTH_REQUIRED: 'Devam etmek için Hesabım bölümünden doğum tarihini eklemelisin.',
      AGE_RESTRICTED: 'Bu oyun yalnızca 16 yaş ve üzeri kullanıcılar içindir.',
      ACCOUNT_LOCKED: 'Hesabın güvenlik nedeniyle kilitli.',
      REDIS_UNAVAILABLE: 'Oyun servisi şu anda hazırlanıyor. Biraz sonra tekrar dene.',
      GAME_MAINTENANCE: 'Matrix Siege şu anda bakımda.',
      MAINTENANCE_ACTIVE: 'Matrix Siege şu anda bakımda.',
      STAGE_LOCKED: 'Bu bölüm henüz açılmadı.',
      STAGE_NOT_FOUND: 'Bölüm bilgisi bulunamadı.',
      ANTI_CHEAT_REJECTED: 'Oyun sonucu doğrulanamadı. Bölümü yeniden başlat.',
      RUN_EXPIRED: 'Oyun oturumunun süresi doldu. Bölümü yeniden başlat.',
      RUN_NOT_FOUND: 'Oyun oturumu bulunamadı. Bölümü yeniden başlat.',
      MISSION_NOT_COMPLETE: 'Bu görevin hedefi henüz tamamlanmadı.',
      MISSION_ALREADY_CLAIMED: 'Bu görevin ödülünü zaten aldın.',
      UNIT_MAX_LEVEL: 'Bu birlik maksimum seviyeye ulaştı.',
      INSUFFICIENT_CRYSTALS: 'Bu geliştirme için yeterli Teknoloji Kristalin yok.',
      UNIT_NOT_FOUND: 'Birlik bilgisi bulunamadı.'
    };
    return map[code] || 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.';
  }

  function audioTone(freq = 440, duration = 0.08) {
    if (!state.sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      const context = audioTone.context || (audioTone.context = new Context());
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.05, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch (_) {}
  }

  function cryptoRandom() {
    try {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      return values[0].toString(16);
    } catch (_) {
      return Math.random().toString(16).slice(2);
    }
  }

  function currentStage() {
    return state.config?.stages?.find((stage) => Number(stage.stageId) === Number(state.stageId)) || null;
  }

  function currentMission() {
    if (!state.missions.length) return null;
    return state.missions[state.missionIndex % state.missions.length] || null;
  }

  function renderStageMeta() {
    const stage = currentStage();
    if (!stage) return;
    const worldNames = ['NEON OVA', 'KOD VADİSİ', 'SİBER GEÇİT'];
    $('msWorldLabel').textContent = worldNames[stage.world - 1] || 'MATRIX';
    $('msStageLabel').textContent = stage.isBoss ? `BOSS ${stage.stageId}` : `Bölüm ${stage.stageId}`;
    $('msStageTitle').textContent = stage.name;
    const row = state.progress?.completedStages?.[`stage-${stage.stageId}`] || {};
    const stars = Math.max(0, Math.min(3, Number(row.stars || 0)));
    $('msStageStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('msPrevStage').disabled = state.stageId <= 1 || Boolean(state.run);
    $('msNextStage').disabled = state.stageId >= Math.min(20, Number(state.progress?.unlockedStage || 1)) || Boolean(state.run);
  }

  function renderMission() {
    const mission = currentMission();
    const button = $('msMissionClaimBtn');
    if (!mission) {
      $('msMissionTitle').textContent = 'Yeni görev hazırlanıyor';
      $('msMissionProgress').textContent = '0 / 0';
      $('msMissionBar').style.background = 'rgba(255,255,255,.08)';
      button.disabled = true;
      button.textContent = 'BEKLENİYOR';
      button.removeAttribute('data-mission-id');
      return;
    }

    $('msMissionTitle').textContent = mission.title;
    $('msMissionProgress').textContent = `${mission.progress || 0} / ${mission.target}`;
    const progress = Number(mission.progress || 0);
    const target = Math.max(1, Number(mission.target || 1));
    const percentage = Math.max(0, Math.min(100, (progress / target) * 100));
    $('msMissionBar').style.setProperty('--progress', `${percentage}%`);
    $('msMissionBar').style.background = `linear-gradient(90deg,var(--green) 0 ${percentage}%,rgba(255,255,255,.08) ${percentage}%)`;

    button.dataset.missionId = mission.missionId;
    button.disabled = state.busyAction || !mission.completed || mission.claimed;
    button.textContent = mission.claimed ? 'ALINDI' : mission.completed ? `+${mission.rewardCrystals} KRİSTAL` : 'ÖDÜLÜ AL';
  }

  function renderUnits() {
    const host = $('msUnitBar');
    host.replaceChildren();
    for (const unit of state.config?.playerUnits || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ms-unit-card';
      button.style.setProperty('--unit-color', unit.color || '#38ff8b');
      const unlocked = unit.unlocked !== false;
      button.disabled = !unlocked;
      button.dataset.unitId = unit.unitId;
      button.innerHTML = `<span class="unit-glyph">${glyphs[unit.unitId] || '◇'}</span><strong>${unit.name}</strong><span>LV.${Number(unit.level || 1)} · ⚡ ${unit.energyCost}</span>`;
      button.addEventListener('click', () => spawnUnit(unit));
      host.appendChild(button);
    }
  }

  function renderWorkshop() {
    const host = $('msWorkshopList');
    host.replaceChildren();
    const crystals = Number(state.progress?.technologyCrystals || 0);
    const costs = state.config?.upgradeCosts || [];

    for (const unit of state.config?.playerUnits || []) {
      const level = Math.max(1, Number(state.progress?.unitLevels?.[unit.unitId] || unit.level || 1));
      const isMax = level >= 10;
      const cost = Number(costs[level] || 0);
      const unlocked = unit.unlocked !== false;
      const row = document.createElement('div');
      row.className = 'ms-workshop-row';
      row.style.setProperty('--unit-color', unit.color || '#38ff8b');
      row.innerHTML = `
        <span class="ms-workshop-glyph">${glyphs[unit.unitId] || '◇'}</span>
        <span class="ms-workshop-copy">
          <strong>${unit.name} · LV.${level}</strong>
          <span>Can ${unit.maxHp} · Hasar ${unit.damage}${isMax ? ' · Maksimum seviye' : ` · Sonraki geliştirme ${cost} kristal`}</span>
        </span>
        <button type="button" data-upgrade-unit="${unit.unitId}" ${!unlocked || isMax || crystals < cost || state.busyAction ? 'disabled' : ''}>${isMax ? 'MAX' : `${cost} ◆`}</button>`;
      row.querySelector('button')?.addEventListener('click', () => upgradeUnit(unit.unitId));
      host.appendChild(row);
    }
  }

  async function refreshProfileData() {
    const [config, progress, missions] = await Promise.all([
      request('/api/v1/games/matrix-siege/config'),
      request('/api/v1/games/matrix-siege/progress'),
      request('/api/v1/games/matrix-siege/missions')
    ]);
    state.config = config;
    state.progress = progress;
    state.missions = missions.items || [];
    $('msCrystalCount').textContent = Number(progress.technologyCrystals || 0).toLocaleString('tr-TR');
    $('msEnergyMax').textContent = config.energy.max;
    renderStageMeta();
    renderMission();
    renderUnits();
    renderWorkshop();
  }

  async function claimMission() {
    const mission = currentMission();
    if (!mission || state.busyAction || mission.claimed || !mission.completed) return;
    state.busyAction = true;
    renderMission();
    try {
      const payload = await request('/api/v1/games/matrix-siege/claim-mission', {
        method: 'POST',
        body: JSON.stringify({ missionId: mission.missionId })
      });
      state.progress = payload.progress || state.progress;
      state.missions = payload.missions || state.missions;
      $('msCrystalCount').textContent = Number(state.progress?.technologyCrystals || 0).toLocaleString('tr-TR');
      tools('Görev Tamamlandı', `${mission.rewardCrystals} Teknoloji Kristali hesabına eklendi.`, 'reward');
      audioTone(920, 0.16);
    } catch (error) {
      tools('Görev Ödülü', errorText(error.code || error.message), 'error');
    } finally {
      state.busyAction = false;
      renderMission();
      renderWorkshop();
    }
  }

  async function upgradeUnit(unitId) {
    if (state.busyAction || state.run) return;
    state.busyAction = true;
    renderWorkshop();
    try {
      const payload = await request('/api/v1/games/matrix-siege/upgrade-unit', {
        method: 'POST',
        body: JSON.stringify({ unitId })
      });
      state.progress = payload.progress || state.progress;
      await refreshProfileData();
      tools('Birlik Geliştirildi', 'Birlik seviyesi ve savaş özellikleri kalıcı olarak güncellendi.', 'success');
      audioTone(760, 0.14);
    } catch (error) {
      tools('Birlik Atölyesi', errorText(error.code || error.message), 'error');
    } finally {
      state.busyAction = false;
      renderWorkshop();
    }
  }

  function spawnUnit(unit) {
    if (state.paused || !state.run || !state.sim || state.submitting || unit.unlocked === false) return;
    const snapshot = state.sim.snapshot();
    if (Number(snapshot.energy) < Number(unit.energyCost)) {
      audioTone(160, 0.1);
      tools('Enerji Yetersiz', 'Bu birlik için enerjinin dolmasını bekle.', 'warning');
      return;
    }
    const event = {
      sequence: state.events.length + 1,
      type: 'SPAWN_UNIT',
      unitId: unit.unitId,
      timestampMs: Math.max(0, Math.floor(state.virtualElapsed)),
      correlationId: `ms_${Date.now()}_${cryptoRandom()}`
    };
    state.events.push(event);
    const updated = window.PMMatrixSiegeSim.createSimulation({
      config: state.run.config,
      stage: state.run.stage,
      seed: state.run.seed,
      events: state.events
    });
    updated.stepTo(state.virtualElapsed);
    state.sim = updated;
    audioTone(360 + (state.events.length % 5) * 60, 0.07);
  }

  function resetBattleVisual() {
    cancelAnimationFrame(state.raf);
    state.events = [];
    state.run = null;
    state.sim = null;
    state.virtualElapsed = 0;
    state.paused = true;
    state.submitting = false;
    $('msBattleOverlay').hidden = false;
    $('msOverlayText').textContent = 'Enerjini yönet, birliklerini üret ve düşman çekirdeğini yok et.';
    $('msStartBtn').disabled = false;
    $('msPauseBtn').textContent = 'Ⅱ';
    $('msWorkshopBtn').disabled = false;
    updateUi({
      energy: state.config?.energy?.start || 3,
      playerBaseHp: 1000,
      enemyBaseHp: currentStage()?.enemyBaseHp || 1000,
      units: [],
      nowMs: 0
    });
    draw({
      energy: state.config?.energy?.start || 3,
      playerBaseHp: 1000,
      enemyBaseHp: currentStage()?.enemyBaseHp || 1000,
      units: [],
      nowMs: 0
    });
  }

  async function load() {
    try {
      $('msStatusText').textContent = 'Komutan profili yükleniyor…';
      await refreshProfileData();
      state.stageId = Math.max(1, Math.min(Number(state.progress.currentStage || 1), Number(state.progress.unlockedStage || 1)));
      renderStageMeta();
      resetBattleVisual();
      $('msSoundBtn').textContent = state.sound ? '♫' : '×';
      $('msStatusText').textContent = 'Sistem hazır. Bölümünü seç ve savaşı başlat.';

      clearInterval(state.missionTimer);
      state.missionTimer = window.setInterval(() => {
        if (!state.run && !state.busyAction && state.missions.length) {
          state.missionIndex = (state.missionIndex + 1) % state.missions.length;
          renderMission();
        }
      }, 7000);
    } catch (error) {
      const message = errorText(error.code || error.message);
      $('msStatusText').textContent = message;
      $('msOverlayText').textContent = message;
      $('msStartBtn').disabled = true;
      tools('Matrix Siege', message, 'error');
    }
  }

  async function startBattle() {
    if (state.run || state.submitting || state.busyAction) return;
    try {
      $('msStartBtn').disabled = true;
      $('msWorkshopBtn').disabled = true;
      $('msOverlayText').textContent = 'Savaş alanı hazırlanıyor…';
      const data = await request('/api/v1/games/matrix-siege/start', {
        method: 'POST',
        body: JSON.stringify({ stageId: state.stageId })
      });
      state.run = data;
      state.events = [];
      state.sim = window.PMMatrixSiegeSim.createSimulation({
        config: data.config,
        stage: data.stage,
        seed: data.seed,
        events: state.events
      });
      state.virtualElapsed = 0;
      state.paused = false;
      state.lastFrame = performance.now();
      $('msBattleOverlay').hidden = true;
      $('msPauseBtn').textContent = 'Ⅱ';
      $('msStatusText').textContent = 'Savaş başladı. Birliklerini zamanında üret.';
      cancelAnimationFrame(state.raf);
      state.raf = requestAnimationFrame(frame);
      audioTone(620, 0.12);
    } catch (error) {
      $('msStartBtn').disabled = false;
      $('msWorkshopBtn').disabled = false;
      const message = errorText(error.code || error.message);
      $('msOverlayText').textContent = message;
      tools('Savaş Başlatılamadı', message, 'error');
    }
  }

  function frame(now) {
    const elapsed = Math.min(120, Math.max(0, now - state.lastFrame));
    state.lastFrame = now;
    if (!state.paused && state.sim && !state.submitting) {
      state.virtualElapsed += elapsed * state.speed;
      const snapshot = state.sim.stepTo(state.virtualElapsed);
      updateUi(snapshot);
      draw(snapshot);
      if (snapshot.complete) {
        finishBattle(snapshot);
        return;
      }
    }
    state.raf = requestAnimationFrame(frame);
  }

  function updateUi(snapshot) {
    const stage = state.run?.stage || currentStage() || { playerBaseHp: 1000, enemyBaseHp: 1000, durationMs: 120000 };
    const energyMax = Number(state.run?.config?.energy?.max || state.config?.energy?.max || 10);
    $('msEnergyValue').textContent = Number(snapshot.energy || 0).toFixed(1);
    $('msEnergyBar').style.width = `${Math.max(0, Math.min(100, Number(snapshot.energy || 0) / energyMax * 100))}%`;
    $('msPlayerBaseHp').textContent = Math.max(0, Number(snapshot.playerBaseHp || 0));
    $('msEnemyBaseHp').textContent = Math.max(0, Number(snapshot.enemyBaseHp || 0));
    $('msPlayerBaseBar').style.width = `${Math.max(0, Math.min(100, Number(snapshot.playerBaseHp || 0) / Number(stage.playerBaseHp || 1000) * 100))}%`;
    $('msEnemyBaseBar').style.width = `${Math.max(0, Math.min(100, Number(snapshot.enemyBaseHp || 0) / Number(stage.enemyBaseHp || 1000) * 100))}%`;
    const remaining = Math.max(0, Number(stage.durationMs || 120000) - Number(snapshot.nowMs || 0));
    $('msTimer').textContent = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor(remaining % 60000 / 1000)).padStart(2, '0')}`;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawWorldDecor(ctx, width, height, world, laneY) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    if (world === 1) {
      ctx.fillStyle = '#3d8f5a';
      for (const [x, y, r] of [[105, 170, 42], [168, 220, 31], [width - 118, height - 170, 46]]) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (world === 2) {
      ctx.strokeStyle = '#37dfff'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const x = 70 + i * 118;
        ctx.strokeRect(x, 100 + (i % 2) * 45, 48, 48);
      }
    } else {
      ctx.fillStyle = '#d66cff';
      for (let i = 0; i < 9; i += 1) {
        const x = 35 + i * 83;
        const y = i % 2 ? 150 : height - 145;
        ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 14, y + 18); ctx.lineTo(x - 14, y + 18); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, laneY - 62, width, 124);
    ctx.restore();
  }

  function draw(snapshot) {
    const canvas = $('msCanvas');
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const stage = state.run?.stage || currentStage() || { world: 1 };
    const palette = worldPalettes[Number(stage.world || 1)] || worldPalettes[1];

    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.52, palette.mid);
    gradient.addColorStop(1, palette.bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = palette.grid;
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 60) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    for (let y = 0; y < height; y += 60) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }

    const laneY = height * 0.62;
    drawWorldDecor(context, width, height, Number(stage.world || 1), laneY);
    context.strokeStyle = palette.lane;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, laneY - 60); context.lineTo(width, laneY - 60);
    context.moveTo(0, laneY + 60); context.lineTo(width, laneY + 60);
    context.stroke();

    drawBase(context, 58, laneY, 'player', snapshot.playerBaseHp);
    drawBase(context, width - 58, laneY, 'enemy', snapshot.enemyBaseHp);

    for (const unit of snapshot.units || []) {
      const x = (Number(unit.x || 0) / 1000) * width;
      const y = laneY + (unit.side === 'player' ? 18 : -18) + ((unit.id % 3) - 1) * 18;
      const isBoss = String(unit.unitId || '').startsWith('boss-');
      const radius = Math.max(isBoss ? 18 : 8, Number(unit.radius || 11));
      context.save();
      context.shadowColor = unit.color;
      context.shadowBlur = isBoss ? 28 : 18;
      context.fillStyle = unit.color;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = isBoss ? '#fff5b5' : 'rgba(255,255,255,.26)';
      context.lineWidth = isBoss ? 4 : 1;
      context.stroke();
      context.fillStyle = '#03110c';
      context.font = `900 ${isBoss ? 17 : 13}px system-ui`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(glyphs[unit.unitId] || '◇', x, y);
      const hpWidth = isBoss ? 48 : 30;
      context.fillStyle = 'rgba(0,0,0,.6)';
      context.fillRect(x - hpWidth / 2, y - radius - 11, hpWidth, 4);
      context.fillStyle = unit.side === 'player' ? '#38ff8b' : '#ff5364';
      context.fillRect(x - hpWidth / 2, y - radius - 11, hpWidth * Math.max(0, unit.hp / unit.maxHp), 4);
      context.restore();
    }

    context.fillStyle = 'rgba(255,255,255,.45)';
    context.font = '700 11px system-ui';
    context.textAlign = 'center';
    context.fillText(`ENERJİ HATTI · DÜNYA ${Number(stage.world || 1)}`, width / 2, laneY + 4);
  }

  function drawBase(context, x, y, side, hp) {
    context.save();
    const color = side === 'player' ? '#38ff8b' : '#ff5364';
    context.shadowColor = color;
    context.shadowBlur = 24;
    context.fillStyle = 'rgba(3,12,9,.92)';
    context.strokeStyle = color;
    context.lineWidth = 4;
    roundedRect(context, x - 38, y - 64, 76, 128, 18);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y - 38);
    context.lineTo(x + 22, y);
    context.lineTo(x, y + 38);
    context.lineTo(x - 22, y);
    context.closePath();
    context.fill();
    context.fillStyle = '#02100b';
    context.font = '900 16px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(side === 'player' ? 'PM' : 'AI', x, y);
    context.fillStyle = 'rgba(255,255,255,.72)';
    context.font = '800 10px system-ui';
    context.fillText(String(Math.max(0, Number(hp || 0))), x, y + 52);
    context.restore();
  }

  async function finishBattle(snapshot) {
    if (state.submitting || !state.run) return;
    state.submitting = true;
    state.paused = true;
    cancelAnimationFrame(state.raf);
    try {
      const idempotencyKey = `ms_${state.run.runId}`;
      const payload = await request('/api/v1/games/matrix-siege/submit', {
        method: 'POST',
        headers: { 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify({
          runId: state.run.runId,
          nonce: state.run.nonce,
          configVersion: state.run.config.version,
          events: state.events,
          durationMs: snapshot.nowMs,
          clientResult: {
            playerBaseHp: snapshot.playerBaseHp,
            enemyBaseHp: snapshot.enemyBaseHp,
            winner: snapshot.winner
          },
          idempotencyKey
        })
      });

      state.progress = payload.progress || state.progress;
      state.missions = payload.missions || state.missions;
      $('msCrystalCount').textContent = Number(state.progress?.technologyCrystals || 0).toLocaleString('tr-TR');
      $('msResultEmblem').textContent = payload.win ? '✦' : '◇';
      $('msResultTitle').textContent = payload.win ? 'Bölüm Zaferi' : 'Savaş Tamamlandı';
      $('msResultText').textContent = payload.win
        ? 'Düşman çekirdeği etkisiz hale getirildi.'
        : 'Ordu geri çekildi. Birlik zamanlamanı geliştirip tekrar dene.';
      $('msResultStars').textContent = payload.stars;
      $('msResultXp').textContent = payload.xpAwarded;
      $('msResultCrystals').textContent = payload.crystalsAwarded;
      $('msResultModal').hidden = false;
      if (payload.win) state.stageId = Math.min(20, Number(state.progress.unlockedStage || state.stageId + 1));
      renderStageMeta();
      renderMission();
      renderWorkshop();
      audioTone(payload.win ? 820 : 220, 0.18);
    } catch (error) {
      state.submitting = false;
      const message = errorText(error.code || error.message);
      tools('Sonuç Doğrulanamadı', message, 'error');
      $('msBattleOverlay').hidden = false;
      $('msOverlayText').textContent = message;
      $('msStartBtn').disabled = false;
      $('msWorkshopBtn').disabled = false;
    }
  }

  function nextBattle() {
    $('msResultModal').hidden = true;
    resetBattleVisual();
    renderStageMeta();
  }

  function togglePause() {
    if (!state.run || state.submitting) return;
    state.paused = !state.paused;
    $('msPauseBtn').textContent = state.paused ? '▶' : 'Ⅱ';
    $('msStatusText').textContent = state.paused ? 'Savaş duraklatıldı.' : 'Savaş devam ediyor.';
    if (!state.paused) state.lastFrame = performance.now();
  }

  function openWorkshop() {
    if (state.run) {
      tools('Birlik Atölyesi', 'Atölyeyi savaş tamamlandıktan sonra açabilirsin.', 'warning');
      return;
    }
    renderWorkshop();
    $('msWorkshopModal').hidden = false;
  }

  function bind() {
    $('msStartBtn').addEventListener('click', startBattle);
    $('msTutorialBtn').addEventListener('click', () => { $('msTutorialModal').hidden = false; });
    $('msTutorialClose').addEventListener('click', () => { $('msTutorialModal').hidden = true; });
    $('msMissionClaimBtn').addEventListener('click', claimMission);
    $('msWorkshopBtn').addEventListener('click', openWorkshop);
    $('msWorkshopClose').addEventListener('click', () => { $('msWorkshopModal').hidden = true; });
    $('msPauseBtn').addEventListener('click', togglePause);
    $('msSoundBtn').addEventListener('click', () => {
      state.sound = !state.sound;
      localStorage.setItem('pm:matrix-siege:sound', state.sound ? '1' : '0');
      $('msSoundBtn').textContent = state.sound ? '♫' : '×';
    });
    $('msSpeedBtn').addEventListener('click', () => {
      state.speed = state.speed === 1 ? 2 : 1;
      $('msSpeedBtn').textContent = `${state.speed}× HIZ`;
    });
    $('msPrevStage').addEventListener('click', () => {
      if (state.run) return;
      state.stageId = Math.max(1, state.stageId - 1);
      renderStageMeta();
      resetBattleVisual();
    });
    $('msNextStage').addEventListener('click', () => {
      if (state.run) return;
      state.stageId = Math.min(Number(state.progress?.unlockedStage || 1), state.stageId + 1);
      renderStageMeta();
      resetBattleVisual();
    });
    $('msNextBattleBtn').addEventListener('click', nextBattle);
    $('msRetryBtn').addEventListener('click', () => {
      $('msResultModal').hidden = true;
      resetBattleVisual();
    });
    for (const modal of document.querySelectorAll('.ms-modal')) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal && modal.id !== 'msResultModal') modal.hidden = true;
      });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !state.paused && state.run) togglePause();
    });
    window.addEventListener('pagehide', () => {
      state.paused = true;
      cancelAnimationFrame(state.raf);
      clearInterval(state.missionTimer);
    });
  }

  bind();
  load();
})();
