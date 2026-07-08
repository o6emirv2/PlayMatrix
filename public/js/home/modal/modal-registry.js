// PlayMatrix AnaSayfa Modal Registry v15
// Modal başlığı, açıklaması, ikon rengi ve yükleme metni tek merkezden yönetilir.

export const MODAL_REGISTRY = Object.freeze({
  login: {
    key: 'login', sheet: 'auth', title: 'Giriş Yap',
    description: 'E-posta veya kullanıcı adınla güvenli giriş yap.',
    icon: 'fa-right-to-bracket', accent: 'blue', size: 'sm', requiresData: false
  },
  register: {
    key: 'register', sheet: 'auth', title: 'Kayıt Ol',
    description: 'Kullanıcı adın oyun ve ödül alanlarında görünür.',
    icon: 'fa-user-plus', accent: 'violet', size: 'md', requiresData: false
  },
  forgot: {
    key: 'forgot', sheet: 'forgot', title: 'Şifremi Unuttum',
    description: 'Sıfırlama bağlantısını e-posta adresine gönder.',
    icon: 'fa-key', accent: 'gold', size: 'sm', requiresData: false
  },
  profile: {
    key: 'profile', sheet: 'profile', title: 'Hesabım',
    description: 'Profil, güvenlik ve geçmişini tek yerden yönet.',
    icon: 'fa-user-gear', accent: 'cyan', size: 'lg', requiresData: true,
    loading: 'Hesap bilgilerin güvenli şekilde hazırlanıyor.'
  },
  email: {
    key: 'email', sheet: 'email', title: 'E-posta Güvenliği',
    description: 'E-posta doğrulama ve güncelleme işlemlerini yönet.',
    icon: 'fa-envelope-circle-check', accent: 'emerald', size: 'md', requiresData: true,
    loading: 'E-posta güvenliği hazırlanıyor.'
  },
  password: {
    key: 'password', sheet: 'password', title: 'Şifre Değiştir',
    description: 'Mevcut şifreni doğrula, yeni şifreni güncelle.',
    icon: 'fa-lock', accent: 'violet', size: 'md', requiresData: true,
    loading: 'Şifre güvenliği hazırlanıyor.'
  },
  avatar: {
    key: 'avatar', sheet: 'avatarPickerModal', title: 'Avatar Seç',
    description: 'Avatarını seç ve hesabına güvenle uygula.',
    icon: 'fa-image-portrait', accent: 'blue', size: 'lg', requiresData: true,
    loading: 'Avatar seçenekleri hazırlanıyor.'
  },
  frame: {
    key: 'frame', sheet: 'framePickerModal', title: 'Çerçeve Seç',
    description: 'Seviyene ve envanterine uygun çerçeveyi seç.',
    icon: 'fa-certificate', accent: 'violet', size: 'lg', requiresData: true,
    loading: 'Çerçeve seçenekleri hazırlanıyor.'
  },
  wheel: {
    key: 'wheel', sheet: 'wheel', title: 'Günlük Çark',
    description: 'Günlük ödül hakkını güvenli şekilde kullan.',
    icon: 'fa-dharmachakra', accent: 'gold', size: 'lg', requiresData: true,
    loading: 'Günlük çark verileri hazırlanıyor.'
  },
  promo: {
    key: 'promo', sheet: 'promo', title: 'Promosyon Kodu',
    description: 'Geçerli kodunu gir, ödülünü hesabına tanımla.',
    icon: 'fa-ticket', accent: 'pink', size: 'md', requiresData: true,
    loading: 'Promosyon alanı hazırlanıyor.'
  },
  market: {
    key: 'market', sheet: 'market', title: 'Market',
    description: 'Aktif ürünleri incele ve MC ile satın al.',
    icon: 'fa-store', accent: 'cyan', size: 'xl', requiresData: true,
    loading: 'Market ürünleri hazırlanıyor.'
  },
  notifications: {
    key: 'notifications', sheet: 'notifications', title: 'Bildirimler',
    description: 'Sistem ve kişisel bildirimlerini incele.',
    icon: 'fa-bell', accent: 'blue', size: 'lg', requiresData: true,
    loading: 'Bildirimler hazırlanıyor.'
  },
  stats: {
    key: 'stats', sheet: 'playerStatsModal', title: 'İstatistikler',
    description: 'Seviye, aktivite ve performans özetini görüntüle.',
    icon: 'fa-chart-simple', accent: 'cyan', size: 'lg', requiresData: true,
    loading: 'İstatistikler hazırlanıyor.'
  },
  logout: {
    key: 'logout', sheet: 'matrixInfoModal', title: 'Güvenli Çıkış',
    description: 'Oturumunu güvenli şekilde kapat.',
    icon: 'fa-power-off', accent: 'pink', size: 'sm', requiresData: false
  }
});

export const DATA_REQUIRED_MODAL_KEYS = Object.freeze(Object.values(MODAL_REGISTRY).filter((item) => item.requiresData).map((item) => item.key));
export const DATA_REQUIRED_SHEET_KEYS = Object.freeze(Object.values(MODAL_REGISTRY).filter((item) => item.requiresData && !String(item.sheet).endsWith('Modal')).map((item) => item.sheet));

export function getModalMeta(key = '') {
  const normalized = String(key || '').trim();
  return MODAL_REGISTRY[normalized] || MODAL_REGISTRY[Object.keys(MODAL_REGISTRY).find((item) => MODAL_REGISTRY[item].sheet === normalized)] || null;
}
export const modalTitle = (key = '') => getModalMeta(key)?.title || 'PlayMatrix';
export const modalDescription = (key = '') => getModalMeta(key)?.description || 'İçerik hazırlanıyor.';
export const modalIcon = (key = '') => getModalMeta(key)?.icon || 'fa-layer-group';
export const modalLoadingText = (key = '') => getModalMeta(key)?.loading || `${modalTitle(key)} hazırlanıyor.`;
