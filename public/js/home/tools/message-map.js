// PlayMatrix User Message Map v15
// Teknik hata kodlarını kullanıcı dostu, kısa ve profesyonel Tools metinlerine dönüştürür.

export const USER_MESSAGES = Object.freeze({
  SUCCESS: 'İşlem başarıyla tamamlandı.',
  UNKNOWN_ERROR: 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.',
  SESSION_EXPIRED: 'Oturumunun süresi doldu. Lütfen tekrar giriş yap.',
  SESSION_CONFLICT: 'Hesabın başka bir cihazda açıldığı için bu oturum kapatıldı.',
  ACTIVE_GAME_LOGIN_BLOCKED: 'Aktif oyunun devam ederken başka bir cihazdan giriş yapılamaz.',
  ADMIN_AUTH_REQUIRED: 'Devam etmek için yönetici girişi gerekiyor.',
  ADMIN_REAUTH_REQUIRED: 'Bu işlem için yönetici doğrulaması gerekiyor.',
  FORBIDDEN: 'Bu işlemi yapmak için yetkin bulunmuyor.',
  RATE_LIMITED: 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.',
  CSRF_REQUIRED: 'Güvenlik doğrulaması yenilendi. Lütfen işlemi tekrar dene.',
  VALIDATION_ERROR: 'Bilgileri kontrol edip tekrar dene.',
  AUTH_REQUIRED: 'Devam etmek için giriş yapman gerekiyor.',
  AUTH_INVALID: 'Devam etmek için giriş yapman gerekiyor.',
  EMAIL_VERIFICATION_REQUIRED: 'Bu işlem için e-posta adresini doğrulaman gerekiyor.',
  AGE_REQUIRED: 'Devam etmek için doğum tarihini eklemen gerekiyor.',
  AGE_RESTRICTED: 'Devam edebilmek için 16 yaşından büyük olmalısınız.',
  DATE_OF_BIRTH_REQUIRED: 'Doğum tarihi alanını eksiksiz seçmelisiniz.',
  ACCOUNT_LOCKED: 'Hesabın şu anda kilitli. Destek ile iletişime geçebilirsin.',
  ACCOUNT_BANNED: 'Hesabınla oyunlara erişim kısıtlandı.',
  ACCOUNT_DELETION_PENDING: 'Hesap silme talebin aktif. Devam etmek için talebi iptal edebilirsin.',
  EMAIL_REQUIRED: 'E-posta adresi gerekli.',
  EMAIL_INVALID: 'E-posta adresi geçersiz.',
  EMAIL_ALREADY_IN_USE: 'Bu e-posta başka bir hesapta kullanılıyor.',
  EMAIL_ALREADY_EXISTS: 'Bu e-posta adresi zaten kullanılıyor.',
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
  MAINTENANCE_ACTIVE: 'Sistem şu anda bakımda. Lütfen daha sonra tekrar dene.',
  GAME_MAINTENANCE_ACTIVE: 'Bu oyun şu anda bakımda. Lütfen daha sonra tekrar dene.',
  MARKET_CLOSED: 'Market şu anda çevrim dışı.',
  PROMO_CLOSED: 'Promo sistemi şu anda kapalı.',
  WHEEL_CLOSED: 'Çark şu anda kapalı.',
  MARKET_LOAD_FAILED: 'Market şu anda yüklenemedi. Lütfen tekrar dene.',
  MARKET_ITEM_UNAVAILABLE: 'Ürün şu anda satın alınamaz.',
  MARKET_ITEM_NOT_OWNED: 'Bu ürün hesabında bulunmuyor.',
  MARKET_STOCK_UNAVAILABLE: 'Bu ürünün stoğu şu anda tükendi.',
  ITEM_UNAVAILABLE: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
  ITEM_NOT_FOUND: 'Bu ürün şu anda satın alınamaz. Lütfen marketi yenileyip tekrar dene.',
  INSUFFICIENT_BALANCE: 'Bakiyen bu işlem için yeterli değil.',
  REDIS_UNAVAILABLE: 'Sistem şu anda güvenli işlem moduna geçemedi. Lütfen biraz sonra tekrar dene.',
  ECONOMY_LOCKED: 'Ekonomi işlemi şu anda güvenli şekilde tamamlanamadı. Lütfen tekrar dene.',
  GAME_STATE_UNAVAILABLE: 'Oyun durumu şu anda yüklenemedi. Lütfen tekrar dene.',
  CRASH_ROUND_UNAVAILABLE: 'Crash tur durumu şu anda yüklenemedi. Lütfen tekrar dene.',
  MATCHMAKING_COOLDOWN: 'Eşleşme için kısa bir süre beklemen gerekiyor.',
  PAYLOAD_TOO_LARGE: 'Gönderilen oyun verisi çok büyük. Lütfen oyunu yeniden başlat.',
  ANTI_CHEAT_REJECTED: 'Skorun doğrulanırken bir sorun oluştu. Lütfen oyunu tekrar başlat.',
  EVENT_TIMELINE_REQUIRED: 'Oyun verisi eksik. Lütfen oyunu yeniden başlat.',
  EVENT_TIMELINE_INVALID: 'Oyun verisi doğrulanamadı. Lütfen oyunu yeniden başlat.',
  IDEMPOTENCY_REPLAY: 'Bu işlem daha önce işlendi.',
  INVALID_IDEMPOTENCY_KEY: 'İşlem doğrulanamadı. Lütfen tekrar dene.',
  CASHOUT_ALREADY_PROCESSED: 'Bu çıkış işlemi daha önce tamamlandı.',
  STAGE_LOCKED: 'Bu bölüm henüz açılmadı.',
  STAGE_NOT_FOUND: 'Bölüm bilgisi bulunamadı. Lütfen tekrar dene.',
  RUN_NOT_FOUND: 'Oyun oturumu bulunamadı. Bölümü yeniden başlat.',
  RUN_EXPIRED: 'Oyun oturumunun süresi doldu. Bölümü yeniden başlat.',
  RUN_TOKEN_INVALID: 'Oyun oturumu doğrulanamadı. Bölümü yeniden başlat.',
  CONFIG_VERSION_MISMATCH: 'Oyun ayarları güncellendi. Bölümü yeniden başlat.',
  MISSION_NOT_FOUND: 'Görev bulunamadı.',
  MISSION_NOT_COMPLETE: 'Bu görev henüz tamamlanmadı.',
  MISSION_ALREADY_CLAIMED: 'Bu görev ödülünü daha önce aldın.',
  UNIT_NOT_FOUND: 'Birlik bulunamadı.',
  UNIT_MAX_LEVEL: 'Bu birlik maksimum seviyede.',
  INSUFFICIENT_CRYSTALS: 'Teknoloji Kristalin bu geliştirme için yeterli değil.',
  ROOM_NOT_FOUND: 'Oda bulunamadı. Lütfen lobiye dönüp tekrar dene.',
  ROOM_LOCKED: 'Bu oda şu anda kullanılamıyor. Lütfen başka bir oda seç.',
  RECONNECT_TIMEOUT: 'Yeniden bağlanma süresi doldu.',
  PROMO_INVALID: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
  PROMO_NOT_FOUND: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
  PROMO_INACTIVE: 'Bu promo kodu geçerli değil veya süresi dolmuş.',
  PROMO_LIMIT_REACHED: 'Bu promo kodu kullanım limitine ulaştı.',
  PROMO_ALREADY_CLAIMED: 'Bu promo kodunu daha önce kullandın.',
  CODE_REQUIRED: 'Promo kodu gerekli.',
  CODE_INVALID: 'Bu kod hatalı veya süresi dolmuş.',
  WHEEL_ALREADY_USED: 'Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.',
  WHEEL_ALREADY_SPUN: 'Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.',
  WHEEL_ALREADY_CLAIMED_TODAY: 'Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.',
  INVALID_USERNAME: 'Kullanıcı adı 5-20 karakter olmalı; harf, sayı, nokta (.), alt çizgi (_) ve tire (-) kullanılabilir.',
  USERNAME_RESERVED: 'Bu kullanıcı adı sistem tarafından ayrılmıştır. Lütfen farklı bir kullanıcı adı seç.',
  INVALID_FIRST_NAME: 'İsim 3-50 karakter olmalı; yalnızca Türkçe harf içermeli.',
  INVALID_LAST_NAME: 'Soyisim 3-50 karakter olmalı; yalnızca Türkçe harf içermeli.',
  INVALID_PERSON_NAME: 'İsim ve soyisim 3-50 karakter olmalı; yalnızca Türkçe harf içermeli.',
  INVALID_PASSWORD: 'Şifre en az 6 karakter olmalıdır.',
  WEAK_PASSWORD: 'Bu şifre çok zayıf. Lütfen daha güvenli bir şifre belirle.',
  USERNAME_TAKEN: 'Bu kullanıcı adı kullanılıyor.',
  USERNAME_CHECK_FAILED: 'Kullanıcı adı şu anda kontrol edilemedi. Lütfen tekrar dene.',
  USERNAME_CHANGE_LIMIT_REACHED: 'Kullanıcı adı değiştirme hakkın doldu.',
  SOCKET_IO_CLIENT_LOAD_FAILED: 'Bildirimler şu anda yüklenemedi. Lütfen tekrar dene.',
  PUBLIC_RUNTIME_CONFIG_UNAVAILABLE: 'Bağlantı ayarları yüklenemedi. Lütfen tekrar dene.',
  PUBLIC_FIREBASE_CONFIG_MISSING: 'Giriş sistemi şu anda hazırlanamadı. Lütfen tekrar dene.',
  PUBLIC_FIREBASE_CONTRACT_MISMATCH: 'Giriş sistemi doğrulanamadı. Lütfen tekrar dene.',
  SESSION_SYNC_FAILED: 'Oturum bağlantısı kurulamadı. Lütfen tekrar dene.',
  AUTH_UNAVAILABLE: 'Giriş sistemi şu anda kullanılamıyor. Lütfen tekrar dene.',
  SESSION_SECRET_MISSING: 'Oturum güvenliği şu anda hazırlanamadı. Lütfen tekrar dene.',
  LEADERBOARD_UNAVAILABLE: 'Liderlik verileri şu anda alınamadı. Liste otomatik olarak tekrar denenecek.',
  RECENT_WINNERS_UNAVAILABLE: 'Son kazanan verileri şu anda alınamadı. Liste otomatik olarak tekrar denenecek.',
  NETWORK_ERROR: 'Bağlantı kurulamadı. Lütfen internet bağlantını kontrol edip tekrar dene.',
  LOAD_FAILED: 'İçerik şu anda yüklenemedi. Lütfen tekrar dene.',
  INTERNAL_ERROR: 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.',
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
