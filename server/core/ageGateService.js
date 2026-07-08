const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const MIN_AGE = 16;
function pad2(value) { return String(value).padStart(2, '0'); }
function parseDateOfBirth(input = {}) {
  if (typeof input === 'string') {
    const raw = input.trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return parseDateOfBirth({ year: m[1], month: m[2], day: m[3] });
    const tr = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (tr) return parseDateOfBirth({ day: tr[1], month: tr[2], year: tr[3] });
  }
  const year = Math.trunc(Number(input.year ?? input.birthYear ?? input.dobYear ?? 0));
  const month = Math.trunc(Number(input.month ?? input.birthMonth ?? input.dobMonth ?? 0));
  const day = Math.trunc(Number(input.day ?? input.birthDay ?? input.dobDay ?? 0));
  if (!year || !month || !day) return { ok: false, code: 'DATE_OF_BIRTH_REQUIRED', message: 'Doğum tarihi alanını eksiksiz seçmelisiniz.' };
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { ok: false, code: 'INVALID_DATE_OF_BIRTH', message: 'Doğum tarihi geçerli değil.' };
  const currentYear = new Date().getUTCFullYear();
  if (year < currentYear - 120 || year > currentYear) return { ok: false, code: 'INVALID_DATE_OF_BIRTH', message: 'Doğum tarihi geçerli değil.' };
  const value = `${year}-${pad2(month)}-${pad2(day)}`;
  const age = calculateAge(value);
  return { ok: true, dateOfBirth: value, age, ageVerified: age >= MIN_AGE };
}
function calculateAge(dateOfBirth = '') {
  const m = String(dateOfBirth || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const now = new Date();
  let age = now.getUTCFullYear() - Number(m[1]);
  const monthDelta = (now.getUTCMonth() + 1) - Number(m[2]);
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < Number(m[3]))) age -= 1;
  return Math.max(0, age);
}
function assertDateOfBirthInput(input = {}) {
  const parsed = parseDateOfBirth(input);
  if (!parsed.ok) return parsed;
  if (!parsed.ageVerified) return { ok: false, code: 'AGE_RESTRICTED', message: 'Devam edebilmek için 16 yaşından büyük olmalısınız.', dateOfBirth: parsed.dateOfBirth, age: parsed.age, ageVerified: false };
  return parsed;
}
async function readAgeGate(uid = '') {
  const safeUid = String(uid || '').trim();
  if (!safeUid) return { ok: false, code: 'AUTH_REQUIRED', ageGateOk: false };
  const { db } = initFirebaseAdmin();
  if (!db) return { ok: true, code: '', ageGateOk: true, source: 'firestore-unavailable' };
  const snap = await db.collection('users').doc(safeUid).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  if (data.ageLocked || data.accountLocked || data.locked) return { ok: false, code: 'ACCOUNT_LOCKED', ageGateOk: false, ageLocked: true };
  const dob = String(data.dateOfBirth || '').trim();
  if (!dob) return { ok: false, code: 'DATE_OF_BIRTH_REQUIRED', ageGateOk: false };
  const age = calculateAge(dob);
  if (age < MIN_AGE || data.ageVerified === false) return { ok: false, code: 'AGE_RESTRICTED', ageGateOk: false, age, dateOfBirth: dob };
  return { ok: true, code: '', ageGateOk: true, age, dateOfBirth: dob };
}
async function requireAgeGate(req, res, next) {
  try { const gate = await readAgeGate(String(req.user?.uid || '').trim()); if (gate.ok) return next(); return res.status(gate.code === 'ACCOUNT_LOCKED' ? 423 : 403).json({ ok: false, data: null, message: '', code: gate.code || 'AGE_REQUIRED', error: gate.code || 'AGE_REQUIRED' }); }
  catch (_) { return res.status(403).json({ ok: false, data: null, message: '', code: 'AGE_REQUIRED', error: 'AGE_REQUIRED' }); }
}
module.exports = { MIN_AGE, parseDateOfBirth, calculateAge, assertDateOfBirthInput, readAgeGate, requireAgeGate };
