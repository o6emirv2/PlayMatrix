(function () {
  'use strict';

  const MONTHS = Object.freeze(['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']);
  const MIN_AGE = 16;
  const MAX_AGE = 120;
  let initialized = false;
  let activeTarget = 'register';
  let selectedDay = 0;
  let returnFocus = null;

  const byId = (id) => document.getElementById(id);
  const pad2 = (value) => String(value).padStart(2, '0');

  function buildDate(day, month, year) {
    const d = Math.trunc(Number(day) || 0);
    const m = Math.trunc(Number(month) || 0);
    const y = Math.trunc(Number(year) || 0);
    if (!d || !m || !y) return '';
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  function normalizeDate(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? buildDate(match[3], match[2], match[1]) : '';
  }

  function calculateAge(value) {
    const match = normalizeDate(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 0;
    const now = new Date();
    let age = now.getFullYear() - Number(match[1]);
    const monthDelta = (now.getMonth() + 1) - Number(match[2]);
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < Number(match[3]))) age -= 1;
    return Math.max(0, age);
  }

  function formatDate(value) {
    const match = normalizeDate(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
  }

  function targetIds(target) {
    const prefix = target === 'profile' ? 'profile' : 'register';
    return {
      prefix,
      date: `${prefix}DateOfBirth`,
      day: `${prefix}BirthDay`,
      month: `${prefix}BirthMonth`,
      year: `${prefix}BirthYear`,
      button: `${prefix}DobOpenBtn`,
      summary: `${prefix}DobSummary`,
      help: prefix === 'profile' ? 'profileDobHelp' : 'authHelp',
      group: `${prefix}DobGroup`
    };
  }

  function readTarget(target) {
    const ids = targetIds(target);
    const stored = normalizeDate(byId(ids.date)?.value || '');
    const match = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const day = match ? Number(match[3]) : Math.trunc(Number(byId(ids.day)?.value || 0));
    const month = match ? Number(match[2]) : Math.trunc(Number(byId(ids.month)?.value || 0));
    const year = match ? Number(match[1]) : Math.trunc(Number(byId(ids.year)?.value || 0));
    const dateOfBirth = stored || buildDate(day, month, year);
    const age = calculateAge(dateOfBirth);
    return { dateOfBirth, day, month, year, age, ageVerified: !!dateOfBirth && age >= MIN_AGE };
  }

  function emitChange(node) {
    if (!node) return;
    try { node.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
  }

  function setTargetValue(target, value, { emit = true } = {}) {
    const ids = targetIds(target);
    const normalized = normalizeDate(value);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const values = {
      [ids.date]: normalized,
      [ids.day]: match ? String(Number(match[3])) : '',
      [ids.month]: match ? String(Number(match[2])) : '',
      [ids.year]: match ? String(Number(match[1])) : ''
    };
    Object.entries(values).forEach(([id, next]) => {
      const node = byId(id);
      if (!node) return;
      node.value = next;
      if (emit) emitChange(node);
    });
    syncTarget(target);
    return normalized;
  }

  function syncTarget(target) {
    const ids = targetIds(target);
    const value = readTarget(target);
    const summary = byId(ids.summary);
    const button = byId(ids.button);
    const formatted = formatDate(value.dateOfBirth);
    if (summary) summary.textContent = formatted
      ? `${formatted} · ${value.age} yaş`
      : (ids.prefix === 'profile' ? 'Doğum tarihini ekle' : 'Doğum tarihini seç');
    if (button) {
      button.classList.toggle('is-complete', !!formatted && value.ageVerified);
      button.classList.toggle('is-warning', !!formatted && !value.ageVerified);
    }
    return value;
  }

  function setLocked(target, locked) {
    const ids = targetIds(target);
    [ids.date, ids.day, ids.month, ids.year].forEach((id) => {
      const node = byId(id);
      if (!node) return;
      node.disabled = !!locked;
      node.classList.toggle('is-locked', !!locked);
    });
    const button = byId(ids.button);
    if (button) {
      button.disabled = !!locked;
      button.setAttribute('aria-disabled', locked ? 'true' : 'false');
      button.classList.toggle('is-locked', !!locked);
    }
    byId(ids.group)?.classList.toggle('is-dob-locked', !!locked);
    syncTarget(target);
  }

  function fillSelect(select, items, selectedValue) {
    if (!select) return;
    const fragment = document.createDocumentFragment();
    items.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(label);
      fragment.appendChild(option);
    });
    select.replaceChildren(fragment);
    const desired = String(selectedValue || '');
    if (desired && Array.from(select.options).some((option) => option.value === desired)) select.value = desired;
  }

  function hydrateOptions(month, year) {
    const today = new Date();
    const maxYear = today.getFullYear();
    const minYear = maxYear - MAX_AGE;
    fillSelect(byId('dobPopupBirthMonth'), MONTHS.map((label, index) => ({ value: index + 1, label })), month);
    const years = [];
    for (let value = maxYear; value >= minYear; value -= 1) years.push({ value, label: value });
    fillSelect(byId('dobPopupBirthYear'), years, year);
  }

  function setInfo(message, tone) {
    const node = byId('dobPopupInfo');
    if (!node) return;
    node.textContent = message || 'Doğum tarihin yalnızca yaş uygunluğu ve hesap güvenliği için kullanılır.';
    node.dataset.tone = tone || '';
  }

  function popupValue() {
    const dateOfBirth = buildDate(selectedDay, byId('dobPopupBirthMonth')?.value, byId('dobPopupBirthYear')?.value);
    return { dateOfBirth, age: calculateAge(dateOfBirth) };
  }

  function updatePreview() {
    const value = popupValue();
    const dateNode = byId('dobPopupSelectedDate');
    const ageNode = byId('dobPopupSelectedAge');
    const saveButton = byId('dobPopupSaveBtn');
    if (!value.dateOfBirth) {
      if (dateNode) dateNode.textContent = 'Henüz tarih seçilmedi';
      if (ageNode) ageNode.textContent = 'Takvimden gün, ay ve yıl seç.';
      if (saveButton) saveButton.disabled = true;
      setInfo('Doğum tarihi alanını eksiksiz seçmelisin.', '');
      return false;
    }
    const valid = value.age >= MIN_AGE;
    if (dateNode) dateNode.textContent = formatDate(value.dateOfBirth);
    if (ageNode) ageNode.textContent = valid ? `${value.age} yaş · Uygun` : `${value.age} yaş · 16+ koşulunu karşılamıyor`;
    if (saveButton) saveButton.disabled = !valid;
    setInfo(valid ? 'Tarih uygun. Uygula butonuyla forma aktarabilirsin.' : 'Devam edebilmek için 16 yaşından büyük olmalısın.', valid ? 'success' : 'error');
    return valid;
  }

  function renderCalendar() {
    const grid = byId('dobPopupDayGrid');
    if (!grid) return;
    const month = Math.trunc(Number(byId('dobPopupBirthMonth')?.value || 0));
    const year = Math.trunc(Number(byId('dobPopupBirthYear')?.value || 0));
    grid.replaceChildren();
    if (!month || !year) { selectedDay = 0; updatePreview(); return; }
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    selectedDay = Math.max(1, Math.min(maxDay, Number(selectedDay || 1)));
    const firstOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < firstOffset; index += 1) {
      const spacer = document.createElement('span');
      spacer.className = 'pm-dob-day-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      fragment.appendChild(spacer);
    }
    for (let day = 1; day <= maxDay; day += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pm-dob-day-btn';
      button.textContent = String(day);
      button.dataset.day = String(day);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `${day} ${MONTHS[month - 1]} ${year}`);
      button.setAttribute('aria-selected', day === selectedDay ? 'true' : 'false');
      if (day === selectedDay) button.classList.add('is-selected');
      button.addEventListener('click', () => {
        selectedDay = day;
        renderCalendar();
      });
      fragment.appendChild(button);
    }
    grid.appendChild(fragment);
    const hiddenDay = byId('dobPopupBirthDay');
    if (hiddenDay) hiddenDay.value = String(selectedDay);
    updatePreview();
  }

  function defaultSelection() {
    const today = new Date();
    const date = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  function open(target) {
    const ids = targetIds(target);
    const button = byId(ids.button);
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    activeTarget = target === 'profile' ? 'profile' : 'register';
    const current = readTarget(activeTarget);
    const fallback = defaultSelection();
    const year = current.year || fallback.year;
    const month = current.month || fallback.month;
    selectedDay = current.day || fallback.day;
    hydrateOptions(month, year);
    byId('dobPopupBirthMonth').value = String(month);
    byId('dobPopupBirthYear').value = String(year);
    const title = byId('dobPopupTitle');
    const text = byId('dobPopupText');
    if (title) title.textContent = activeTarget === 'profile' ? 'Doğum Tarihini Hesabına Ekle' : 'Doğum Tarihini Seç';
    if (text) text.textContent = activeTarget === 'profile'
      ? 'Bu bilgi kaydedildikten sonra yalnızca yönetici tarafından değiştirilebilir.'
      : 'Gün, ay ve yıl seçimini tamamla. 16+ yaş uygunluğu güvenli biçimde doğrulanır.';
    renderCalendar();
    const popup = byId('dobPopup');
    if (!popup) return false;
    returnFocus = document.activeElement;
    popup.classList.add('is-open');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pm-dob-popup-open');
    requestAnimationFrame(() => byId('dobPopupBirthMonth')?.focus?.({ preventScroll: true }));
    return true;
  }

  function close(restoreFocus = true) {
    const popup = byId('dobPopup');
    if (!popup) return;
    popup.classList.remove('is-open');
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pm-dob-popup-open');
    if (restoreFocus && returnFocus?.focus) requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
  }

  function applySelection() {
    const value = popupValue();
    if (!value.dateOfBirth) { setInfo('Doğum tarihi alanını eksiksiz ve geçerli seçmelisin.', 'error'); return; }
    if (value.age < MIN_AGE) { setInfo('Devam edebilmek için 16 yaşından büyük olmalısın.', 'error'); return; }
    setTargetValue(activeTarget, value.dateOfBirth);
    const help = byId(targetIds(activeTarget).help);
    if (help && activeTarget === 'profile') {
      help.textContent = `Seçilen tarih: ${formatDate(value.dateOfBirth)}. Profili Kaydet butonuyla hesabına ekleyebilirsin.`;
      help.dataset.tone = 'success';
    }
    try {
      window.dispatchEvent(new CustomEvent('playmatrix:dob-selected', {
        detail: { target: activeTarget, dateOfBirth: value.dateOfBirth, age: value.age }
      }));
    } catch (_) {}
    close(true);
  }

  function moveMonth(delta) {
    const currentYear = new Date().getFullYear();
    let month = Math.trunc(Number(byId('dobPopupBirthMonth')?.value || 1));
    let year = Math.trunc(Number(byId('dobPopupBirthYear')?.value || currentYear - 18));
    month += Math.trunc(Number(delta) || 0);
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    year = Math.max(currentYear - MAX_AGE, Math.min(currentYear, year));
    byId('dobPopupBirthMonth').value = String(month);
    byId('dobPopupBirthYear').value = String(year);
    renderCalendar();
  }

  function bindOnce(node, eventName, handler) {
    if (!node || node.dataset.pmDobPickerBound === 'true') return;
    node.dataset.pmDobPickerBound = 'true';
    node.addEventListener(eventName, handler);
  }

  function trapKeyboard(event) {
    const popup = byId('dobPopup');
    if (!popup?.classList.contains('is-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(popup.querySelectorAll('button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function init() {
    if (initialized) {
      syncTarget('register');
      syncTarget('profile');
      return window.PMDobPicker;
    }
    initialized = true;
    hydrateOptions('', '');
    ['register', 'profile'].forEach((target) => {
      const button = byId(targetIds(target).button);
      if (button) {
        button.dataset.pmDobPopupBound = 'true';
        bindOnce(button, 'click', (event) => { event.preventDefault(); open(target); });
      }
    });
    ['dobPopupCloseBtn', 'dobPopupCancelBtn', 'dobPopupBackdrop'].forEach((id) => bindOnce(byId(id), 'click', (event) => { event.preventDefault(); close(true); }));
    bindOnce(byId('dobPopupSaveBtn'), 'click', (event) => { event.preventDefault(); applySelection(); });
    bindOnce(byId('dobPopupPrevMonthBtn'), 'click', (event) => { event.preventDefault(); moveMonth(-1); });
    bindOnce(byId('dobPopupNextMonthBtn'), 'click', (event) => { event.preventDefault(); moveMonth(1); });
    ['dobPopupBirthMonth', 'dobPopupBirthYear'].forEach((id) => bindOnce(byId(id), 'change', renderCalendar));
    document.addEventListener('keydown', trapKeyboard);
    syncTarget('register');
    syncTarget('profile');
    return window.PMDobPicker;
  }

  window.PMDobPicker = Object.freeze({
    init,
    open,
    close,
    read: readTarget,
    setValue: setTargetValue,
    sync: syncTarget,
    lock: setLocked,
    format: formatDate,
    calculateAge
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
