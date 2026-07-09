const MONTHS = Object.freeze(['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']);
const WEEKDAYS = Object.freeze(['Pt','Sa','Ça','Pe','Cu','Ct','Pa']);

function pad(value) { return String(value).padStart(2, '0'); }
function todayParts() { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }; }
function parseIso(value = '') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return { year, month, day };
}
function toIso(parts) { return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`; }
function isFuture(parts) {
  const t = todayParts();
  return toIso(parts) > toIso(t);
}
function formatTr(value = '') {
  const parts = parseIso(value);
  if (!parts) return '';
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

export function createBirthDatePicker(options = {}) {
  let modal = null;
  let selected = null;
  let view = todayParts();
  let returnFocus = null;
  const minYear = Math.max(1, Number(options.minYear || 1900));
  const currentYear = todayParts().year;

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'birthDatePickerModal';
    modal.className = 'pm-birth-picker';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="pm-birth-picker__panel" role="dialog" aria-modal="true" aria-labelledby="birthDatePickerTitle" aria-describedby="birthDatePickerHelp">
        <header class="pm-birth-picker__header">
          <span class="pm-birth-picker__icon" aria-hidden="true"><i class="fa-solid fa-cake-candles"></i></span>
          <div><h2 id="birthDatePickerTitle">Doğum Tarihini Seç</h2><p id="birthDatePickerHelp">Gün, ay ve yılı seçip Uygula butonuna dokun.</p></div>
          <button type="button" class="pm-birth-picker__close" data-birth-action="cancel" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="pm-birth-picker__toolbar">
          <button type="button" data-birth-action="previous" aria-label="Önceki ay"><i class="fa-solid fa-chevron-left"></i></button>
          <label><span class="pm-sr-only">Ay</span><select data-birth-month aria-label="Ay seç"></select></label>
          <label><span class="pm-sr-only">Yıl</span><select data-birth-year aria-label="Yıl seç"></select></label>
          <button type="button" data-birth-action="next" aria-label="Sonraki ay"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div class="pm-birth-picker__week" aria-hidden="true">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="pm-birth-picker__days" role="grid" aria-label="Takvim günleri"></div>
        <div class="pm-birth-picker__selection" aria-live="polite"></div>
        <footer class="pm-birth-picker__actions">
          <button type="button" class="ghost-btn" data-birth-action="cancel">İptal</button>
          <button type="button" class="btn btn-primary" data-birth-action="apply">Uygula</button>
        </footer>
      </div>`;
    document.body.appendChild(modal);
    const monthSelect = modal.querySelector('[data-birth-month]');
    MONTHS.forEach((name, index) => monthSelect.add(new Option(name, String(index + 1))));
    const yearSelect = modal.querySelector('[data-birth-year]');
    for (let year = currentYear; year >= minYear; year -= 1) yearSelect.add(new Option(String(year), String(year)));
    monthSelect.addEventListener('change', () => { view.month = Number(monthSelect.value); clampView(); render(); });
    yearSelect.addEventListener('change', () => { view.year = Number(yearSelect.value); clampView(); render(); });
    modal.addEventListener('click', (event) => {
      const dayButton = event.target.closest('[data-birth-day]');
      if (dayButton && !dayButton.disabled) {
        selected = { year: view.year, month: view.month, day: Number(dayButton.dataset.birthDay) };
        render();
        return;
      }
      const action = event.target.closest('[data-birth-action]')?.dataset.birthAction;
      if (action === 'cancel') close(false);
      if (action === 'apply' && selected) { options.onApply?.(toIso(selected)); close(true); }
      if (action === 'previous') shiftMonth(-1);
      if (action === 'next') shiftMonth(1);
      if (event.target === modal) close(false);
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      if (event.key === 'Tab') trapFocus(event);
    });
    return modal;
  }

  function clampView() {
    if (view.year > currentYear) view.year = currentYear;
    if (view.year < minYear) view.year = minYear;
    const today = todayParts();
    if (view.year === today.year && view.month > today.month) view.month = today.month;
  }

  function shiftMonth(delta) {
    const d = new Date(view.year, view.month - 1 + delta, 1);
    view = { year: d.getFullYear(), month: d.getMonth() + 1, day: 1 };
    clampView();
    render();
  }

  function render() {
    ensureModal();
    const monthSelect = modal.querySelector('[data-birth-month]');
    const yearSelect = modal.querySelector('[data-birth-year]');
    monthSelect.value = String(view.month);
    yearSelect.value = String(view.year);
    const daysHost = modal.querySelector('.pm-birth-picker__days');
    const first = new Date(view.year, view.month - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(view.year, view.month, 0).getDate();
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < offset; index += 1) {
      const gap = document.createElement('span'); gap.className = 'pm-birth-picker__gap'; gap.setAttribute('aria-hidden', 'true'); fragment.appendChild(gap);
    }
    for (let day = 1; day <= count; day += 1) {
      const parts = { year: view.year, month: view.month, day };
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.birthDay = String(day); button.textContent = String(day); button.setAttribute('role', 'gridcell');
      const future = isFuture(parts);
      button.disabled = future;
      button.classList.toggle('is-selected', !!selected && toIso(selected) === toIso(parts));
      button.setAttribute('aria-selected', button.classList.contains('is-selected') ? 'true' : 'false');
      button.setAttribute('aria-label', `${day} ${MONTHS[view.month - 1]} ${view.year}`);
      fragment.appendChild(button);
    }
    daysHost.replaceChildren(fragment);
    const selection = modal.querySelector('.pm-birth-picker__selection');
    selection.textContent = selected ? `Seçilen tarih: ${formatTr(toIso(selected))}` : 'Henüz tarih seçilmedi.';
    const next = modal.querySelector('[data-birth-action="next"]');
    const today = todayParts();
    next.disabled = view.year === today.year && view.month >= today.month;
    modal.querySelector('[data-birth-action="apply"]').disabled = !selected;
  }

  function trapFocus(event) {
    const focusable = Array.from(modal.querySelectorAll('button:not(:disabled),select:not(:disabled)')).filter((node) => !node.hidden);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function open({ value = '', trigger = null } = {}) {
    ensureModal();
    selected = parseIso(value);
    view = selected ? { ...selected } : todayParts();
    returnFocus = trigger || document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pm-birth-picker-open');
    options.onOpen?.();
    render();
    window.setTimeout(() => modal.querySelector('[data-birth-month]')?.focus(), 0);
  }

  function close(applied = false) {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pm-birth-picker-open');
    options.onClose?.({ applied });
    window.setTimeout(() => returnFocus?.focus?.(), 0);
  }

  return Object.freeze({ open, close, format: formatTr, parse: parseIso });
}

export { formatTr as formatBirthDateTr };
