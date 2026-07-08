(function () {
  'use strict';

  const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const WEEKDAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
  const MIN_AGE = 16;
  const MAX_AGE = 120;
  const state = { target: 'register', selected: null, viewYear: 0, viewMonth: 0, locked: { register: false, profile: false }, initialized: false };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const safeTarget = (value) => value === 'profile' ? 'profile' : 'register';
  const todayUtc = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  };
  function parseIso(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }
  function toIso(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  function ageOf(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 0;
    const now = todayUtc();
    let age = now.getUTCFullYear() - date.getUTCFullYear();
    const monthDelta = now.getUTCMonth() - date.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
    return Math.max(0, age);
  }
  function isAllowed(date) {
    const age = ageOf(date);
    return age >= MIN_AGE && age <= MAX_AGE;
  }
  function targetIds(target) {
    const prefix = safeTarget(target);
    return {
      day: `${prefix}BirthDay`,
      month: `${prefix}BirthMonth`,
      year: `${prefix}BirthYear`,
      summary: `${prefix}DobSummary`,
      open: `${prefix}DobOpenBtn`
    };
  }
  function readHidden(target) {
    const ids = targetIds(target);
    const year = Number($(ids.year)?.value || 0);
    const month = Number($(ids.month)?.value || 0);
    const day = Number($(ids.day)?.value || 0);
    if (!year || !month || !day) return null;
    return parseIso(`${year}-${pad(month)}-${pad(day)}`);
  }
  function writeHidden(target, date) {
    const ids = targetIds(target);
    const nodes = { day: $(ids.day), month: $(ids.month), year: $(ids.year) };
    if (!date) {
      Object.values(nodes).forEach((node) => { if (node) node.value = ''; });
      return;
    }
    if (nodes.day) nodes.day.value = String(date.getUTCDate());
    if (nodes.month) nodes.month.value = String(date.getUTCMonth() + 1);
    if (nodes.year) nodes.year.value = String(date.getUTCFullYear());
    Object.values(nodes).forEach((node) => node?.dispatchEvent(new Event('change', { bubbles: true })));
  }
  function formatDisplay(date) {
    return date ? `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}` : '';
  }
  function syncSummary(target) {
    const ids = targetIds(target);
    const date = readHidden(target);
    const summary = $(ids.summary);
    const button = $(ids.open);
    const locked = !!state.locked[safeTarget(target)];
    if (summary) summary.textContent = date ? `${formatDisplay(date)} · Yaş: ${ageOf(date)}` : (target === 'profile' ? 'Doğum tarihini ekle' : 'Doğum tarihini seç');
    if (button) {
      button.classList.toggle('is-complete', !!date && isAllowed(date));
      button.classList.toggle('is-warning', !!date && !isAllowed(date));
      button.classList.toggle('is-locked', locked);
      button.disabled = locked;
      button.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    return date;
  }
  function setInfo(message, tone) {
    const node = $('dobPopupInfo');
    if (!node) return;
    node.textContent = message || 'Doğum tarihin yalnızca yaş uygunluğu ve hesap güvenliği için kullanılır.';
    node.dataset.tone = tone || '';
  }
  function fillMonthYear() {
    const month = $('dobCalendarMonth');
    const year = $('dobCalendarYear');
    if (month && !month.options.length) {
      MONTHS.forEach((label, index) => month.add(new Option(label, String(index))));
    }
    if (year && !year.options.length) {
      const current = todayUtc().getUTCFullYear();
      const maxYear = current - MIN_AGE;
      const minYear = current - MAX_AGE;
      for (let y = maxYear; y >= minYear; y -= 1) year.add(new Option(String(y), String(y)));
    }
  }
  function renderCalendar() {
    fillMonthYear();
    const grid = $('dobCalendarGrid');
    const month = $('dobCalendarMonth');
    const year = $('dobCalendarYear');
    if (!grid || !month || !year) return;
    month.value = String(state.viewMonth);
    year.value = String(state.viewYear);
    grid.replaceChildren();

    const first = new Date(Date.UTC(state.viewYear, state.viewMonth, 1));
    const lastDay = new Date(Date.UTC(state.viewYear, state.viewMonth + 1, 0)).getUTCDate();
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const previousMonthDays = new Date(Date.UTC(state.viewYear, state.viewMonth, 0)).getUTCDate();

    for (let cell = 0; cell < 42; cell += 1) {
      const dayNumber = cell - mondayOffset + 1;
      let date;
      let outside = false;
      if (dayNumber < 1) {
        date = new Date(Date.UTC(state.viewYear, state.viewMonth - 1, previousMonthDays + dayNumber));
        outside = true;
      } else if (dayNumber > lastDay) {
        date = new Date(Date.UTC(state.viewYear, state.viewMonth + 1, dayNumber - lastDay));
        outside = true;
      } else {
        date = new Date(Date.UTC(state.viewYear, state.viewMonth, dayNumber));
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pm-dob-calendar-day';
      if (outside) button.classList.add('is-outside');
      if (!isAllowed(date)) button.classList.add('is-disabled');
      const selected = state.selected && toIso(state.selected) === toIso(date);
      if (selected) button.classList.add('is-selected');
      button.textContent = String(date.getUTCDate());
      button.dataset.iso = toIso(date);
      button.setAttribute('aria-label', `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.disabled = !isAllowed(date);
      button.addEventListener('click', () => {
        if (!isAllowed(date)) return;
        state.selected = date;
        state.viewMonth = date.getUTCMonth();
        state.viewYear = date.getUTCFullYear();
        renderCalendar();
        setInfo(`Seçilen tarih: ${formatDisplay(date)} · Yaş: ${ageOf(date)}`, 'success');
        $('dobPopupApplyBtn')?.removeAttribute('disabled');
      });
      grid.appendChild(button);
    }
  }
  function changeMonth(delta) {
    const next = new Date(Date.UTC(state.viewYear, state.viewMonth + delta, 1));
    const maxYear = todayUtc().getUTCFullYear() - MIN_AGE;
    const minYear = todayUtc().getUTCFullYear() - MAX_AGE;
    if (next.getUTCFullYear() > maxYear || next.getUTCFullYear() < minYear) return;
    state.viewYear = next.getUTCFullYear();
    state.viewMonth = next.getUTCMonth();
    renderCalendar();
  }
  function open(target) {
    const safe = safeTarget(target);
    if (state.locked[safe]) return;
    state.target = safe;
    const current = readHidden(safe);
    const defaultDate = current || new Date(Date.UTC(todayUtc().getUTCFullYear() - 18, todayUtc().getUTCMonth(), Math.min(todayUtc().getUTCDate(), 28)));
    state.selected = current;
    state.viewYear = defaultDate.getUTCFullYear();
    state.viewMonth = defaultDate.getUTCMonth();
    renderCalendar();
    const popup = $('dobPopup');
    if (!popup) return;
    popup.classList.add('is-open');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pm-dob-open');
    $('dobPopupApplyBtn')?.toggleAttribute('disabled', !current);
    setInfo(current ? `Kayıtlı seçim: ${formatDisplay(current)} · Yaş: ${ageOf(current)}` : 'Takvimden gününü seç. Devam edebilmek için 16 yaşını doldurmuş olmalısın.', current ? 'success' : '');
    window.setTimeout(() => $('dobCalendarMonth')?.focus?.({ preventScroll: true }), 40);
  }
  function close() {
    const popup = $('dobPopup');
    if (!popup) return;
    popup.classList.remove('is-open');
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pm-dob-open');
  }
  function apply() {
    if (!state.selected || !isAllowed(state.selected)) {
      setInfo('Devam edebilmek için geçerli ve 16+ bir doğum tarihi seçmelisin.', 'error');
      return;
    }
    writeHidden(state.target, state.selected);
    syncSummary(state.target);
    try { window.dispatchEvent(new CustomEvent('playmatrix:dob-selected', { detail: { target: state.target, dateOfBirth: toIso(state.selected), age: ageOf(state.selected) } })); } catch (_) {}
    close();
  }
  function setValue(target, value) {
    const date = parseIso(value);
    writeHidden(target, date);
    syncSummary(target);
  }
  function getValue(target) {
    const date = readHidden(target);
    return date ? { dateOfBirth: toIso(date), birthDay: String(date.getUTCDate()), birthMonth: String(date.getUTCMonth() + 1), birthYear: String(date.getUTCFullYear()), age: ageOf(date), ageVerified: isAllowed(date) } : { dateOfBirth: '', birthDay: '', birthMonth: '', birthYear: '', age: 0, ageVerified: false };
  }
  function lock(target, locked) {
    const safe = safeTarget(target);
    state.locked[safe] = !!locked;
    const ids = targetIds(safe);
    [ids.day, ids.month, ids.year].forEach((id) => { const node = $(id); if (node) node.disabled = !!locked; });
    syncSummary(safe);
  }
  function init() {
    if (state.initialized) return;
    state.initialized = true;
    fillMonthYear();
    const weekdayRow = $('dobCalendarWeekdays');
    if (weekdayRow && !weekdayRow.children.length) {
      WEEKDAYS.forEach((label) => {
        const span = document.createElement('span');
        span.textContent = label;
        weekdayRow.appendChild(span);
      });
    }
    ['register','profile'].forEach((target) => {
      const button = $(targetIds(target).open);
      button?.addEventListener('click', (event) => { event.preventDefault(); open(target); });
      syncSummary(target);
    });
    $('dobPopupBackdrop')?.addEventListener('click', close);
    $('dobPopupCloseBtn')?.addEventListener('click', close);
    $('dobPopupCancelBtn')?.addEventListener('click', close);
    $('dobPopupApplyBtn')?.addEventListener('click', apply);
    $('dobCalendarPrev')?.addEventListener('click', () => changeMonth(-1));
    $('dobCalendarNext')?.addEventListener('click', () => changeMonth(1));
    $('dobCalendarMonth')?.addEventListener('change', (event) => { state.viewMonth = Number(event.target.value || 0); renderCalendar(); });
    $('dobCalendarYear')?.addEventListener('change', (event) => { state.viewYear = Number(event.target.value || state.viewYear); renderCalendar(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('dobPopup')?.classList.contains('is-open')) close(); });
  }

  window.PMDobPicker = { init, open, close, apply, setValue, getValue, lock, sync: syncSummary, formatDisplay: (value) => formatDisplay(parseIso(value)) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
