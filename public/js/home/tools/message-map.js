// PlayMatrix User Message Map v14
// Teknik hata kodlarını kullanıcı dostu, kısa ve profesyonel Tools metinlerine dönüştürür.

export const USER_MESSAGES = Object.freeze({
  AUTH_REQUIRED: 'Devam etmek için giriş yapman gerekiyor.',
  AUTH_INVALID: 'Devam etmek için giriş yapman gerekiyor.',
  EMAIL_VERIFICATION_REQUIRED: 'Bu işlem için e-posta adresini doğrulaman gerekiyor.',
  EMAIL_REQUIRED: 'E-posta adresi gerekli.',
  EMAIL_INVALID: 'E-posta adresi geçersiz.',
  EMAIL_ALREADY_IN_USE: 'Bu e-posta başka bir hesapta kullanılıyor.',
  EMAIL_SAME_AS_CURRENT: 'Yeni e-posta mevcut e-posta adresinle aynı olamaz.',
  EMAIL_VERIFY_LINK_SENT: 'E-posta doğrulama bağlantısı gönderildi. Spam kutusunu da kontrol etmeyi unutma.',
  EMAIL_CHANGE_LINK_SENT: 'Doğrulama bağlantısı yeni e-posta adresine gönderildi. Spam kutusunu da kontrol etmeyi unutma.',
  EMAIL_LINK_DELIVERY_FAILED: 'E-posta bağlantısı şu anda gönderilemedi. Lütfen tekrar dene.',
  EMAIL_TOO_MANY_ATTEMPTS: 'Çok fazla e-posta denemesi yapıldı. Bir süre sonra tekrar dene.',
  PASSWORD_UPDATED: 'Şifren başarıyla güncellendi.',
  PASSWORD_UPDATE_FAILED: 'Şifren değiştirilemedi. Mevcut şifreni kontrol edip tekrar dene.',
  AVATAR_SAVED: 'Avatar seçimin kaydedildi.',
  AVATAR_SAVE_FAILED: 'Avatar seçimin şu anda kaydedilemedi. Lütfen tekrar dene.',
  FRAME_SAVED: 'Çerçeve seçimin kaydedildi.',
  FRAME_SAVE_FAILED: 'Çerçeve seçimin şu anda kaydedilemedi. Lütfen tekrar dene.',
  MARKET_OFFLINE: 'Market şu anda çevrim dışı. Lütfen daha sonra tekrar dene.',
  MARKET_LOAD_FAILED: 'Market şu anda yüklenemedi. Lütfen tekrar dene.',
  MARKET_ITEM_UNAVAILABLE: 'Ürün şu anda satın alınamaz.',
  ITEM_UNAVAILABLE: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
  ITEM_NOT_FOUND: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
  INSUFFICIENT_BALANCE: 'Bakiyen bu işlem için yeterli değil.',
  PROMO_NOT_FOUND: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
  PROMO_INACTIVE: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
  PROMO_LIMIT_REACHED: 'Bu promo kodu kullanım limitine ulaştı.',
  PROMO_ALREADY_CLAIMED: 'Bu promo kodunu daha önce kullandın.',
  CODE_REQUIRED: 'Promo kodu gerekli.',
  CODE_INVALID: 'Bu kod hatalı veya süresi dolmuş.',
  WHEEL_ALREADY_SPUN: 'Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.',
  WHEEL_ALREADY_CLAIMED_TODAY: 'Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.',
  INVALID_USERNAME: 'Kullanıcı adı 5-20 karakter olmalı; harf, sayı, nokta (.), alt çizgi (_) ve tire (-) kullanılabilir.',
  USERNAME_RESERVED: 'Bu kullanıcı adı sistem tarafından ayrılmıştır. Lütfen farklı bir kullanıcı adı seç.',
  INVALID_FIRST_NAME: 'İsim 1-40 karakter olmalı; Türkçe harf desteklenir.',
  INVALID_LAST_NAME: 'Soyisim 1-40 karakter olmalı; Türkçe harf desteklenir.',
  INVALID_PERSON_NAME: 'İsim ve soyisim 1-40 karakter olmalı; Türkçe harf desteklenir.',
  INVALID_PASSWORD: 'Şifre en az 6 karakter olmalıdır.',
  WEAK_PASSWORD: 'Bu şifre çok zayıf. Lütfen daha güvenli bir şifre belirle.',
  USERNAME_TAKEN: 'Bu kullanıcı adı kullanılıyor.',
  USERNAME_CHECK_FAILED: 'Kullanıcı adı şu anda kontrol edilemedi. Lütfen tekrar dene.',
  USERNAME_CHANGE_LIMIT_REACHED: 'Kullanıcı adı değiştirme hakkın doldu.',
  SOCKET_IO_CLIENT_LOAD_FAILED: 'Bildirimler şu anda yüklenemedi. Lütfen tekrar dene.',
  NETWORK_ERROR: 'Bağlantı kurulamadı. Lütfen internet bağlantını kontrol edip tekrar dene.',
  LOAD_FAILED: 'İçerik şu anda yüklenemedi. Lütfen tekrar dene.',
  INTERNAL_ERROR: 'İşlem şu anda tamamlanamadı. Lütfen biraz sonra tekrar dene.',
  PERMISSION_DENIED: 'Bu işlemi yapmak için yetkin bulunmuyor.'
});

const FORBIDDEN_TECH_WORDS = /render\s*memory|\brender\b|firebase|sunucu|backend|server|endpoint|socket|socket_io_client_load_failed|server error|internal error|permission denied|undefined|null reference|null|http[_\s-]*\d{3}|validation failed|unauthorized|token expired|api failed|exception|stack trace|document write failed|collection not found|config error|request failed/i;

export function normalizeUserFacingMessage(codeOrMessage = '', fallback = 'İşlem şu anda tamamlanamadı. Lütfen tekrar dene.') {
  const raw = String(codeOrMessage || '').trim();
  const upper = raw.toUpperCase();
  if (USER_MESSAGES[raw]) return USER_MESSAGES[raw];
  if (USER_MESSAGES[upper]) return USER_MESSAGES[upper];
  if (typeof window !== 'undefined' && window.PMUserMessages?.normalize) {
    const globalText = window.PMUserMessages.normalize(raw, fallback);
    if (globalText && globalText !== raw) return globalText;
  }
  if (/auth\/invalid-credential|auth\/wrong-password/i.test(raw)) return 'E-posta veya şifre hatalı.';
  if (/auth\/email-already-in-use/i.test(raw)) return USER_MESSAGES.EMAIL_ALREADY_IN_USE;
  if (/auth\/invalid-email/i.test(raw)) return USER_MESSAGES.EMAIL_INVALID;
  if (/auth\/network-request-failed|failed to fetch|load failed|network/i.test(raw)) return USER_MESSAGES.NETWORK_ERROR;
  if (/too-many|too_many|rate/i.test(raw)) return 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.';
  if (!raw || FORBIDDEN_TECH_WORDS.test(raw) || /^\d{3,}$/.test(raw)) return fallback;
  return raw.length > 160 ? fallback : raw;
}

export function toastTitleForContext(context = '') {
  const normalized = String(context || '').toLowerCase();
  if (normalized.includes('avatar')) return 'Avatar Seç';
  if (normalized.includes('frame') || normalized.includes('çerçeve')) return 'Çerçeve Seç';
  if (normalized.includes('market')) return 'Market';
  if (normalized.includes('wheel') || normalized.includes('çark')) return 'Günlük Çark';
  if (normalized.includes('promo')) return 'Promosyon Kodu';
  if (normalized.includes('password') || normalized.includes('şifre')) return 'Şifre Değiştir';
  if (normalized.includes('email') || normalized.includes('e-posta')) return 'E-posta Güvenliği';
  if (normalized.includes('notification') || normalized.includes('bildirim')) return 'Bildirimler';
  if (normalized.includes('stats') || normalized.includes('istatistik')) return 'İstatistikler';
  if (normalized.includes('auth') || normalized.includes('giriş')) return 'Hesap Erişimi';
  return 'PlayMatrix';
}
