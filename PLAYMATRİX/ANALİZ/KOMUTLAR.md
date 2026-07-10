9.2. Kullanıcı giriş gerektiren alanlar

Giriş yapılmadan erişilemeyecek alanlar:

* Çark
* Promo
* Market satın alma
* Hesabım
* Bildirimler
* Avatar Seç
* Çerçeve Seç
* E-posta güncelleme
* Şifre değiştirme
* Kullanıcıya özel ekonomi işlemleri
* Oyunlara giriş gerektiren kullanıcı işlemleri

Giriş gerekiyorsa kullanıcıya sade mesaj gösterilir ve Giriş Yap modalı açılır.

⸻

10. Hesabım Modalı Güncellenecek

10.1. Hesabım yeni kapsamı

Hesabım modalı artık:

* Profil bilgileri
* Avatar seçimi
* Çerçeve seçimi
* Güvenlik
* Geçmişim, yalnızca cihaz/oturum çakışması sistemlerine bağlı olmayan geçmişler varsa

alanlarını içerebilir.

İstatistiklerim butonu ve işlevi kaldırılacaktır.

⸻

10.2. Güvenlik sekmesi

Güvenlik sekmesinde:

* Şifre değiştirme
* E-posta doğrulama
* E-posta güncelleme

bulunabilir.

E-posta doğrulama link gönderme sistemiyle çalışacaktır. Kod sistemi kullanılmayacaktır.

⸻

10.3. Cihazlarım alanı kaldırılacak

“Oturum sonlanma / başka cihaz / başka tarayıcı” sistemleri tamamen silineceği için Hesabım içinde “Cihazlarım” veya aktif cihaz takibi bulunmayacaktır.

Geçmişim alanı kullanılacaksa sadece cihaz/session çakışmasıyla ilgisi olmayan işlem ve oyun geçmişleri gösterilecektir.

⸻

11. AnaSayfa Genel Tasarım ve Modal Standardı Güncellenecek

11.1. AnaSayfa tasarım standardı

AnaSayfa baştan sona profesyonel, düzenli, modern, premium ve PlayMatrix kimliğine uygun hale getirilecektir.

Kaldırılacak eski/protokole aykırı yapılar:

* Sosyal merkez
* DM
* Sohbet
* Davet sistemi
* Misafir / instant play
* Promosyon vitrini
* Phase kalıntıları
* Tema değiştirme sistemi
* Gereksiz teknik açıklamalar

⸻

11.2. Üst bar

Üst bar standardı:

* Marka yazısı PLAYMATRİX olacak.
* Logo hizalı olacak.
* MC bakiye alanı kesilmeyecek.
* Hediye ikonu Promo modalını açacak.
* Profil fotoğrafı yuvarlak ve hizalı olacak.
* Çift tık zoom, basılı tutma metin seçimi, kayma ve taşma olmayacak.

⸻

11.3. Alt bar

Alt bar sıralaması:

Oyunlar — Liderlik — Çark — Promo — Hesabım

“Ana Sayfa” bölümü kaldırılacaktır.

⸻

11.4. Modal sistemi

Tüm modallar tek bottom-sheet sistemine bağlanacaktır:

* Bildirimler
* Hesabım
* Avatar Seç
* Çerçeve Seç
* E-posta Güncelle
* Şifre Değiştir
* Liderlik kullanıcı detayları
* Giriş Yap
* Kayıt Ol
* Şifreni mi Unuttun
* Promosyon Kodu
* Günlük Çark
* Market

Profili Tamamla ve Hesabım > İstatistiklerim modalı bu listede yer almayacaktır çünkü tamamen silinecektir.

⸻

12. Çark ve Promo Sistemi Güncellenecek

12.1. Çark

Çark:

* Gerçek ödülleri gösterecek.
* Sunucunun belirlediği ödülde duracak.
* Ödül kesin teslim edilecek.
* E-posta doğrulanmamışsa ödül verilmeyecek.
* Kullanıcıya doğrulama mesajı gösterilecek.

⸻

12.2. Promo

Promo:

* Geçerli kod ödülü kesin teslim edecek.
* Geçersiz/süresi dolmuş/kullanılmış kodlarda kullanıcı dostu mesaj gösterecek.
* E-posta doğrulanmamışsa ödül vermeyecek.
* Backend doğrulamalı çalışacak.
* Üst bardaki hediye ikonu Promo modalını açacaktır.

⸻

13. ZIP Genel Temizlik ve Onarım Kapsamı

13.1. Temizlenecek kapsam

Aşağıdaki alanların tamamı incelenecek:

* AnaSayfa
* Crash
* Satranç
* Pişti
* Pattern Master
* Snake Pro
* Space Pro
* Admin Index
* Admin Admin
* Admin Health
* Server dosyaları
* Public asset yapısı
* Route dosyaları
* Runtime dosyaları
* CSS dosyaları
* JS modülleri
* Gereksiz klasörler
* Yorum satırı kalıntıları
* Kullanılmayan eski kodlar
* Protokole aykırı eski sistemler

⸻

13.2. Tamamen silinecek sistemler

Aşağıdaki sistemler ZIP içinde iz bırakmayacak şekilde temizlenecektir:

* Profili Tamamla modalı ve tüm bağlı kodları
* PROFILE_COMPLETION_REQUIRED
* Oturum sonlanma akışı
* Başka cihazdan giriş akışı
* Başka tarayıcıdan giriş akışı
* SESSION_REPLACED
* Tek aktif oturum sistemi
* Cihazlarım / aktif cihaz takibi
* Hesabım > İstatistiklerim butonu ve işlevi
* Tema değiştirme sistemi
* Sosyal merkez
* DM
* Sohbet
* Davet sistemi
* Misafir / instant play
* Phase kalıntıları
* Gereksiz yorum kodları
* Kullanılmayan CSS/JS kalıntıları

⸻

13.3. Onarılacak ve profesyonelleştirilecek alanlar

Dosyalar gezilirken görülen tüm eksikler, kusurlar, hatalar ve sorunlar onarılacaktır.

Özellikle:

* Mobil taşma
* Modal kayması
* Button takılması
* Çift tık zoom
* Basılı tutarak metin seçimi
* Hatalı z-index
* Bozuk scroll
* Yatay taşma
* Bozuk DOM stringleri
* [object HTMLInputElement]
* [object HTMLButtonElement]
* [object Object]
* Asset yolu kırılması
* Bozuk market kartları
* Hatalı admin log görünümü
* Eksik backend doğrulama
* Sahip olunmayan ürün kullanımı
* E-posta doğrulamasız çark/promo ödülü
* Avatar/çerçeve hizasızlığı

giderilecektir.

⸻

14. Nihai Kabul Kriterleri

Bu güncelleme tamamlandığında:

* Profili Tamamla modalı ZIP içinde tamamen silinmiş olur.
* Profili Tamamla’ya bağlı frontend/backend/log kodu kalmaz.
* PROFILE_COMPLETION_REQUIRED artık üretilmez.
* Günlük Çark ve Promo için e-posta doğrulaması zorunlu olur.
* E-posta doğrulanmadan çark/promo ödülü verilmez.
* Oturum sonlanma / başka cihaz / başka tarayıcı / SESSION_REPLACED sistemleri tamamen silinir.
* Tek aktif oturum kodu kalmaz.
* Hesabım > İstatistiklerim butonu ve işlevi tamamen silinir.
* Hesabım içinde Cihazlarım / aktif cihaz takibi kalmaz.
* Admin Paneli dashboard + full modal mimarisinde çalışır.
* Market Kontrolü full modal olarak çalışır.
* Admin logları ve Render logları temiz, anlamlı, gruplanmış ve çözüm odaklı olur.
* Avatar + çerçeve sistemi tüm AnaSayfa ve oyunlarda tek bütün gibi görünür.
* Avatar Seç / Çerçeve Seç mesajları modal içinde değil, tools/toast olarak görünür.
* Çerçeve dışı market ürünleri kod tabanlı canlı dijital kozmetik ürün olarak tasarlanır.
* Market satın alma, sahiplik, kullanım ve iade backend doğrulamalı çalışır.
* AnaSayfa, oyunlar, admin dosyaları ve tüm ZIP gereksiz kodlardan temizlenir.
* Gizleme değil, gerçek silme yapılır.
* Ekranda buton kayması, takılma, düzen bozukluğu, çift tık zoom ve basılı tutarak metin kopyalama engellenir.
* Sistem mobilde, admin kullanımında, kullanıcı akışında, market yönetiminde ve hata takibinde profesyonel seviyeye çıkarılır.

PLAYMATRIX PROFESYONEL NİHAİ GÜNCELLEME ŞARTNAMESİ

Akıllı Tek Kayıtlı Avatar / Çerçeve Uyumluluk Sistemi + Tam Sistem Profesyonelleştirme Standardı

Sürüm: PlayMatrix Smart Avatar Frame & Full System Professionalization v4.0
Kapsam: AnaSayfa, Admin Panel, Crash, Satranç, Pişti, Snake Pro, Space Pro, Pattern Master, Auth modalları, Market, Liderlik, Çark, Promo, Bildirimler, Avatar/Çerçeve, dosya/kod temizliği.

⸻

1. Ana Amaç

Bu güncellemenin amacı, PlayMatrix sistemini hem görsel hem teknik hem de güvenlik açısından profesyonel production seviyesine çıkarmaktır.

Bu kapsamda iki ana çalışma yapılacaktır:

1. Yeni Akıllı Avatar / Çerçeve Uyumluluk Sistemi kurulacaktır.
2. AnaSayfa, oyunlar ve admin panelde görülen tüm hata, eksik, kusur, bozukluk, güvenlik açığı, gereksiz kod ve işlevsiz yapı temizlenip profesyonelleştirilecektir.

Yeni avatar/çerçeve sisteminde admin artık her alan için ayrı ayrı boyut kaydetmeyecektir.

Admin sadece:

Frame seçer.
Avatar + çerçeve uyumluluğunu ayarlar.
Tek kayıt yapar.
Sistem bu uyumu her alanda kendi alan boyutuna göre otomatik uygular.

Bu sistemin temel ilkesi:

Admin = Uyumluluk / hizalama kaydeder.
Sistem = Alan boyutunu korur.
Render motoru = Uyumu alana göre otomatik ölçekler.

⸻

2. Bağlayıcı Ana Kararlar

Bu şartname uygulanırken aşağıdaki kararlar bağlayıcıdır:

* Eski alan bazlı 15 ayrı kayıt mantığı kaldırılacaktır.
* Admin panelindeki eski karmaşık Avatar / Çerçeve Alan Bazlı Ayarlar sistemi kaldırılacaktır.
* Yerine sıfırdan Akıllı Avatar / Çerçeve Yönetim Merkezi kurulacaktır.
* Admin sadece avatar ve çerçevenin birbirine uyumluluğunu kaydedecektir.
* Her alan kendi tasarım boyutunu koruyacaktır.
* Liderlikte büyük, üst barda küçük, game kartında orta, Crash canlı tur panelinde küçük görünüm sistem presetleriyle otomatik uygulanacaktır.
* Çerçeve Seç modalının mevcut kart boyutları korunacaktır.
* AnaSayfa üst barda avatar + çerçeve gösterilmeyecektir.
* AnaSayfa üst bar için ayrı profesyonel profil açıcı ikon / rozet kullanılacaktır.
* Oyun üst barlarında avatar/çerçeve gösterimi korunacaktır.
* Bot avatar/çerçeve alanları da aynı merkezi sisteme bağlanacaktır.
* Firebase kalıcı kaynak olacaktır; Render memory kalıcı kaynak olmayacaktır.
* Deploy sonrası avatar/çerçeve ayarları kaybolmayacaktır.
* E-posta başı hiçbir görünür kullanıcı adı alanında kullanılmayacaktır.
* Kullanıcı adı standardı tüm görünen alanlarda uygulanacaktır.
* Gereksiz dosya, klasör, yorum kodu, test dosyası, MD dosyası, ölü import ve kullanılmayan kod temizlenecektir.
* Yapılan her değişiklik gerçek dosya, gerçek bağlantı ve gerçek sistem davranışı üzerinden kontrol edilecektir.

⸻

3. Avatar / Çerçeve Gösterilen Nihai Alanlar

Yeni sistemde avatar + çerçeve gösterimi aşağıdaki 14 alanda uygulanacaktır.

No	Alan	Teknik Variant	Sistem Davranışı
1	AnaSayfa Liderlik Alanı	leaderboard	Büyük / premium görünüm
2	AnaSayfa Market Modalı Market Kartları	marketCard	Kart boyutuna göre sabit preview
3	AnaSayfa Hesabım Modalı Kullanıcı Kartı	accountModal	Modal içi orta/büyük görünüm
4	AnaSayfa Hesabım Modalı Profil Görünümü Kartı	accountProfileCard	Büyük profil görünümü
5	AnaSayfa Hesabım Modalı Çerçeve Seç Modalı	framePickerModal	Mevcut boyut korunur, sadece uyum uygulanır
6	Crash Üst Bar	crashTopbar	Küçük üst bar görünümü
7	Crash Canlı Tur Paneli	crashLivePanel	Küçük, zarif, satır bozmayan görünüm
8	Satranç Üst Bar	chessTopbar	Küçük üst bar görünümü
9	Satranç Oyun Game Alanı	chessGameCard	Oyuncu kartına uygun orta görünüm
10	Pişti Üst Bar	pistiTopbar	Küçük üst bar görünümü
11	Pişti Oyun Game Skor Alanı	pistiScoreCard	Skor/oyuncu kartına uygun görünüm
12	Snake Pro Üst Bar	snakeTopbar	Küçük üst bar görünümü
13	Space Pro Üst Bar	spaceTopbar	Küçük üst bar görünümü
14	Pattern Master Üst Bar	patternTopbar	Küçük üst bar görünümü

3.1 AnaSayfa Üst Bar Özel Kararı

AnaSayfa üst bar bu 14 alanın dışında tutulacaktır.

AnaSayfa üst barda:

* Avatar + çerçeve gösterilmeyecektir.
* Profil dropdown açmak için özel premium profil ikonu kullanılacaktır.
* Bu profil ikonu avatar/frame sistemine bağlı olmayacaktır.
* Üst bar düzeni logo, PlayMatrix yazısı, hediye, bildirim, bakiye ve profil açıcı ikon şeklinde yeniden profesyonelleştirilecektir.

Önerilen üst bar mantığı:

[L] [PLAYMATRIX]      [Hediye] [Bildirim] [Bakiye / MC] [Profil Rozeti]

⸻

4. Akıllı Tek Kayıtlı Avatar / Çerçeve Uyumluluk Sistemi

4.1 Yeni Sistem Mantığı

Eski sistemde admin aynı frame için farklı alanlara ayrı ayrı ayar giriyordu.

Yeni sistemde admin:

* Frame seçer.
* Avatarın çerçeve içinde nasıl duracağını ayarlar.
* Tek kayıt yapar.
* Sistem bu uyumu her alana kendi tasarım boyutuna göre uygular.

Örnek:

Admin Normal Frame 18 için şu uyumu kaydeder:

{
  "avatarScale": 0.86,
  "frameScale": 1.12,
  "avatarOffsetX": 0,
  "avatarOffsetY": -2,
  "frameOffsetX": 0,
  "frameOffsetY": 0,
  "innerPadding": 4
}

Sistem bunu otomatik olarak şöyle uygular:

Alan	Sonuç
Liderlik	Büyük görünür
Hesabım Modalı	Büyük/orta görünür
Profil Görünümü Kartı	Daha büyük premium görünür
Market Kartı	Kart alanına göre görünür
Crash Üst Bar	Küçük görünür
Crash Canlı Tur Paneli	Çok küçük ve zarif görünür
Satranç Game Alanı	Oyuncu kartına uygun görünür
Pişti Skor Alanı	Skor kartına uygun görünür

Burada önemli olan şudur:

Admin boyut kaydetmez. Admin uyum kaydeder.

⸻

5. Alan Boyut Preset Sistemi

Her alanın kendi sabit sistem boyutu olacaktır. Bu boyutlar admin tarafından günlük kullanımda değiştirilmez. Sistem tarafından korunur.

Örnek preset mantığı:

const AREA_PRESETS = {
  leaderboard: {
    boxSize: 84,
    mode: "large"
  },
  marketCard: {
    boxSize: 76,
    mode: "market-card"
  },
  accountModal: {
    boxSize: 78,
    mode: "modal"
  },
  accountProfileCard: {
    boxSize: 112,
    mode: "profile-premium"
  },
  framePickerModal: {
    boxSize: "preserve",
    mode: "preserve"
  },
  crashTopbar: {
    boxSize: 46,
    mode: "game-topbar"
  },
  crashLivePanel: {
    boxSize: 38,
    mode: "compact-row"
  },
  chessTopbar: {
    boxSize: 46,
    mode: "game-topbar"
  },
  chessGameCard: {
    boxSize: 68,
    mode: "game-card"
  },
  pistiTopbar: {
    boxSize: 46,
    mode: "game-topbar"
  },
  pistiScoreCard: {
    boxSize: 66,
    mode: "score-card"
  },
  snakeTopbar: {
    boxSize: 46,
    mode: "game-topbar"
  },
  spaceTopbar: {
    boxSize: 46,
    mode: "game-topbar"
  },
  patternTopbar: {
    boxSize: 46,
    mode: "game-topbar"
  }
};

5.1 Preset Kuralı

* Büyük alan büyük render alır.
* Küçük alan küçük render alır.
* Oyun üst barları küçük kalır.
* Crash canlı tur paneli satır düzenini büyütmez.
* Market kartlarında preview alanı taşmaz.
* Çerçeve Seç modalı mevcut boyutunu korur.
* Admin uyumu bozuk kaydetse bile alan kutusu tasarımı bozulmaz.

⸻

6. Firebase Veri Modeli

Yeni sistemde Firebase’de her alan için ayrı kayıt tutulmayacaktır. Frame bazlı tek uyumluluk kaydı tutulacaktır.

Örnek veri modeli:

{
  "frameId": "market-32",
  "frameType": "market",
  "framePath": "/public/assets/market/frames/market-32.png",
  "thickness": "ultra",
  "version": 4,
  "updatedAt": 1770000000000,
  "updatedBy": "adminUid",
  "alignment": {
    "avatarScale": 0.86,
    "frameScale": 1.12,
    "avatarOffsetX": 0,
    "avatarOffsetY": -2,
    "frameOffsetX": 0,
    "frameOffsetY": 0,
    "innerPadding": 4
  },
  "metadata": {
    "source": "admin-smart-avatar-frame-center",
    "presetVersion": "v4",
    "lastValidated": true
  }
}

6.1 Firebase Kalıcılık Kuralları

Ayarlar şu durumlarda kaybolmayacaktır:

* Render deploy sonrası
* Backend restart sonrası
* Sunucu yenilenmesi sonrası
* Cache temizlenmesi sonrası
* Frontend yenilenmesi sonrası

6.2 Render Memory Kuralı

Render memory yalnızca geçici cache olarak kullanılabilir.

Kalıcı kaynak:

Firebase

⸻

7. Merkezi Render Motoru

Tüm avatar/çerçeve alanları tek merkezi render motoruna bağlanacaktır.

Önerilen dosya:

/public/js/shared/avatar-frame-smart-renderer.js

Render fonksiyonu:

renderSmartAvatarFrame(user, {
  variant: "leaderboard"
});

7.1 Render Motorunun Görevleri

Render motoru şu işleri yapacaktır:

* Kullanıcının aktif avatarını çözer.
* Kullanıcının aktif normal frame’ini çözer.
* Kullanıcının aktif market frame’ini çözer.
* Frame’in Firebase uyum ayarını alır.
* Teknik variant’a göre alan presetini bulur.
* Alan kutu boyutunu korur.
* Avatar ve frame’i absolute katmanlarla render eder.
* Avatarı frame’in altında tutar.
* Frame’i avatarın üstünde tutar.
* CSS değişkenleriyle ölçek ve offset uygular.
* Görselleri preload eder.
* Kırık avatar için fallback kullanır.
* Kırık frame için güvenli fallback kullanır.
* DOM’u gereksiz yere tekrar oluşturmaz.
* Avatar/frame değişmediyse node’u korur.
* İlk site girişinde ayarlar geç gelse bile güvenli default ile açar.
* Firebase ayarı geldiğinde layout zıplatmadan CSS değişkenlerini günceller.

⸻

8. İlk Yükleme / Hızlı Render Standardı

Avatar/çerçeve ayarları siteye ilk girişte hızlı ve stabil yüklenecektir.

8.1 İlk Açılış Sırası

Frontend başlarken:

1. Güvenli default avatar/frame presetleri uygulanır.
2. Kullanıcının aktif avatar/frame bilgisi alınır.
3. Avatar/frame runtime ayarları toplu şekilde çekilir.
4. Aktif kullanıcının avatarı ve frame’i preload edilir.
5. UI açılırken boş kutu gösterilmez.
6. Firebase ayarı geldikten sonra DOM yeniden kurulmaz; yalnızca CSS değişkenleri güncellenir.

8.2 Zıplama Engelleme

Tüm avatar/frame kutularında:

* Sabit kutu genişliği
* Sabit kutu yüksekliği
* aspect-ratio: 1 / 1
* Absolute avatar katmanı
* Absolute frame katmanı
* Önceden ayrılmış image width/height
* object-fit: cover
* overflow: hidden
* Stabil z-index

kullanılacaktır.

⸻

9. Admin Panel Yeni Yapısı

Eski avatar/frame ayar alanı kaldırılacaktır.

Yeni bölüm adı:

Akıllı Avatar / Çerçeve Yönetim Merkezi

9.1 Yeni Admin Akışı

Admin panel akışı şu olacaktır:

1. Frame tipi seçilir.
2. Frame seçilir.
3. Avatar + çerçeve uyumluluğu ayarlanır.
4. Tüm alanların canlı önizlemesi aynı anda gösterilir.
5. Önizleme Yap ile kayıt yapmadan test edilir.
6. Kaydet ile Firebase’e tek uyum kaydı yazılır.

9.2 Admin Kontrol Butonları

Admin butonları açık, net ve profesyonel ikonlu olacaktır.

Buton	Anlam
Avatar +	Avatarı büyüt
Avatar -	Avatarı küçült
Avatar ↑	Avatarı yukarı taşı
Avatar ↓	Avatarı aşağı taşı
Avatar ←	Avatarı sola taşı
Avatar →	Avatarı sağa taşı
Çerçeve +	Çerçeveyi büyüt
Çerçeve -	Çerçeveyi küçült
Çerçeve ↑	Çerçeveyi yukarı taşı
Çerçeve ↓	Çerçeveyi aşağı taşı
Çerçeve ←	Çerçeveyi sola taşı
Çerçeve →	Çerçeveyi sağa taşı
Reset	Varsayılana döndür
Önizleme Yap	Sadece önizlemeyi güncelle
Kaydet	Firebase’e kalıcı kaydet

9.3 Çalışmayan Kontrol Kuralı

Admin panelde hiçbir buton pasif veya işlevsiz kalmayacaktır.

Özellikle kontrol edilecekler:

* Avatar büyütme
* Avatar küçültme
* Avatar X/Y taşıma
* Çerçeve büyütme
* Çerçeve küçültme
* Çerçeve X/Y taşıma
* Reset
* Önizleme Yap
* Kaydet
* Frame seçme
* Normal/Market frame geçişi

⸻

10. Admin Önizleme Sistemi

Admin panelde tek ayar yapılırken tüm alanlar aynı anda önizlenecektir.

Önizlenecek alanlar:

* Liderlik Alanı
* Market Kartı
* Hesabım Modalı Kullanıcı Kartı
* Hesabım Profil Görünümü Kartı
* Çerçeve Seç Modalı
* Crash Üst Bar
* Crash Canlı Tur Paneli
* Satranç Üst Bar
* Satranç Game Alanı
* Pişti Üst Bar
* Pişti Skor Alanı
* Snake Pro Üst Bar
* Space Pro Üst Bar
* Pattern Master Üst Bar

10.1 Gerçek Önizleme Kuralı

Önizleme sahte kutu olmayacaktır.

Her önizleme gerçek tasarım yapısına benzeyecektir:

* Market kartı gerçek market kartı gibi
* Crash canlı panel gerçek satır gibi
* Satranç game alanı gerçek oyuncu kartı gibi
* Pişti skor alanı gerçek skor kartı gibi
* Liderlik gerçek leaderboard kartı gibi

Admin panelinde görünen sonuç ile gerçek sitedeki sonuç aynı render motorundan beslenecektir.

⸻

11. AnaSayfa Üst Bar Profesyonelleştirme

AnaSayfa üst bar tamamen incelenecek, hataları ve taşma sorunları giderilecektir.

11.1 Üst Bar Yerleşimi

Üst bar hedef düzeni:

[L] [PLAYMATRIX]        [Hediye] [Bildirim] [Bakiye / MC] [Profil]

11.2 Bakiye Alanı

Bakiye:

* Kesilmeyecektir.
* Kısaltılmayacaktır.
* 40M, 1.2B gibi gösterilmeyecektir.
* Ellipsis kullanılmayacaktır.
* PlayMatrix yazısına taşmayacaktır.
* Hediye/bildirim/profil ikonlarının üstüne binmeyecektir.
* Mobilde gerekirse ikinci satıra alınacaktır.
* Uzun değerler yatay scroll yerine responsive layout ile çözülecektir.

11.3 MC Çipi

MC çipi:

* AnaSayfa tasarımına uyumlu olacaktır.
* Göz yormayan premium elektrik/yıldırım efekti kullanacaktır.
* Efekt yalnızca bakiye + MC alanını kapsayacaktır.
* Tüm üst barı parlatmayacaktır.
* Aşırı glow ve göz yoran animasyon kaldırılacaktır.
* Performans dostu CSS animasyonu kullanılacaktır.

11.4 Profil Açıcı İkon

AnaSayfa üst barda avatar/frame kullanılmayacaktır.

Profil açıcı ikon:

* Premium rozet butonu şeklinde olacaktır.
* PlayMatrix tasarımına uyacaktır.
* Profil dropdown açacaktır.
* Mobilde dokunulabilir boyutta olacaktır.
* Aktiflik noktası gösterebilir.
* Avatar/frame sistemiyle karışmayacaktır.

⸻

12. Auth Modal Sistemi

Aşağıdaki modallar baştan sona incelenecek, hata ve kusurları giderilecek, kullanıcı dostu hale getirilecektir.

12.1 Giriş Modalı

Kontrol edilecekler:

* E-posta format kontrolü
* Şifre boşluk kontrolü
* Firebase auth hatalarının kullanıcı dostu çevirisi
* Yanlış şifre mesajı
* Kullanıcı bulunamadı mesajı
* Çok fazla deneme mesajı
* Network hatası mesajı
* Loading state
* Çift tıklama engeli
* Başarılı giriş sonrası modal kapanması
* Tek aktif oturum standardına uyum
* Hatalı durumda yarım UI state kalmaması

12.2 Kayıt Modalı

Kayıt modalı kritik alandır.

Kurallar:

* Kullanıcı adı zorunlu olacaktır.
* E-posta zorunlu olacaktır.
* Şifre zorunlu olacaktır.
* Şifre tekrar alanı varsa eşleşme kontrolü yapılacaktır.
* Kullanıcı adı regex kontrolü kullanıcı dostu yapılacaktır.
* Kullanıcı adı daha önce alınmışsa net mesaj gösterilecektir.
* E-posta zaten kayıtlıysa net mesaj gösterilecektir.
* Kayıt başarısızsa yarım profil oluşturulmayacaktır.
* Auth oluşup Firestore profil yazılamazsa rollback veya güvenli tamamlama yapılacaktır.
* Kullanıcıya INVALID_USERNAME gibi ham teknik hata gösterilmeyecektir.
* Tüm hata mesajları Türkçe ve kullanıcı dostu olacaktır.

Örnek kullanıcı dostu hata:

Kullanıcı adı yalnızca harf, rakam, nokta ve alt çizgi içerebilir.

Ham hata gösterilmeyecek:

INVALID_USERNAME

12.3 Şifremi Unuttum Modalı

Kontrol edilecekler:

* E-posta format kontrolü
* Firebase reset mail gönderimi
* Başarı mesajı
* Kullanıcı bulunamadı mesajı
* Rate limit / çok fazla istek mesajı
* Network hatası
* Loading state
* Modal kapanma davranışı

12.4 Şifre Değiştir Modalı

Kontrol edilecekler:

* Mevcut şifre doğrulama
* Yeni şifre güvenliği
* Şifre tekrar eşleşmesi
* Firebase re-auth gereksinimi
* Kullanıcı dostu hata mesajları
* Başarı sonrası güvenli state reset

12.5 E-posta Değiştir Modalı

Kontrol edilecekler:

* Yeni e-posta formatı
* Re-auth
* Firebase verification flow
* Kullanıcı dostu mesajlar
* Eski/yeni e-posta karışıklığı
* Profil payload güvenliği

⸻

13. Hesabım Modalı

Hesabım modalı baştan sona incelenecektir.

Kontrol edilecek alanlar:

* Kullanıcı kartı
* Profil görünümü kartı
* Avatar gösterimi
* Çerçeve gösterimi
* Kullanıcı adı
* E-posta
* Bakiye
* XP / level
* Avatar Seç butonu
* Çerçeve Seç butonu
* Profili Kaydet butonu
* Hata mesajları
* Başarı mesajları
* Mobil scroll
* Kart hizalama
* Görsel taşma
* Kırık avatar/frame fallback

13.1 Avatar Seç Modalı

Avatar Seç modalında:

* Kart boyutları korunacaktır.
* Avatar görseli taşmayacaktır.
* Mobilde grid bozulmayacaktır.
* Gereksiz avatar kategorileri kaldırılacaktır.
* Avatar listesi sadece modal açıldığında yüklenecektir.
* Seçim sonrası preview anında güncellenecektir.

13.2 Çerçeve Seç Modalı

Çerçeve Seç modalında:

* Kart boyutu korunacaktır.
* Avatar + çerçeve kutusu küçültülmeyecektir.
* Sadece uyumluluk uygulanacaktır.
* Locked frame tıklanamaz olacaktır.
* Market frame sahipliği backend tarafından doğrulanacaktır.
* Kırık frame görünmeyecektir.
* Frame seçimi profil kartına doğru yansıyacaktır.

⸻

14. Market Modalı

Market modalı tamamen incelenecek ve profesyonelleştirilecektir.

14.1 Market Kartları

Market kartlarında:

* Avatar/frame preview kaymayacaktır.
* Frame avatarı doğru saracaktır.
* Preview başlığın üstüne binmeyecektir.
* Etiket avatarın üstüne yanlış binmeyecektir.
* Kart dışına taşma olmayacaktır.
* Mobil grid bozulmayacaktır.
* Tüm ürün tiplerinde kart düzeni stabil olacaktır.

Ürün tipleri:

* Çerçeve
* Avatar
* Rozet
* İstatistik teması
* İsim efekti
* Profil arka planı
* Oyun içi tema

14.2 Market Kategorileri

Kategori sekmeleri yeniden düzenlenecektir.

Kategoriler:

* Tümü
* Çerçeve
* Rozet
* İstatistik Teması
* İsim Efekti
* Profil Arka Planı
* Oyun Teması

Kurallar:

* Profesyonel ikonlar kullanılacaktır.
* Aktif kategori net belli olacaktır.
* Pasif kategori görünür ama tıklanamaz olacaktır.
* Ürün olmayan kategori aktif gibi davranmayacaktır.
* Kategori ile sıralama alanı arasındaki boşluk azaltılacaktır.

14.3 Sıralama

Sıralama mantığı:

1. En kaliteli ürünler önce
2. En yüksek fiyatlı ürünler önce
3. Premium / ultra ürünler önce
4. Sahip olunan ürünler doğru konumlandırılır
5. Stokta olmayanlar alta alınır
6. Pasif ürünler tıklanamaz olur
7. Aynı kalite/fiyat varsa ada göre sıralanır

⸻

15. Günlük Çark Modalı

Çark modalı incelenecektir.

Kontrol edilecekler:

* Günlük hak kontrolü
* Backend sonucu esas alma
* Client sonucu kabul etmeme
* Ödül mesajı
* Kullanıcı adı standardı
* Son kazananlara doğru kayıt
* Çift tıklama engeli
* Animasyon bittiğinde sonuç gösterme
* Hata mesajları
* Mobil taşma
* Runtime log

⸻

16. Promosyon Kodu Modalı

Promo modalı incelenecektir.

Kontrol edilecekler:

* Kod boş kontrolü
* Kod format kontrolü
* Backend doğrulama
* İdempotency
* Kullanılmış kod mesajı
* Süresi geçmiş kod mesajı
* Geçersiz kod mesajı
* Başarı mesajı
* Bakiye/ödül güncellemesi
* Çift kullanım engeli

⸻

17. Bildirimler Modalı

Bildirimler modalı incelenecektir.

Kurallar:

* Bildirimler sürekli Firebase okumayacaktır.
* Zil ikonuna basınca yüklenecektir.
* Liste limiti korunacaktır.
* Boş bildirim durumu profesyonel görünecektir.
* Kullanıcı adı/e-posta başı karışıklığı olmayacaktır.
* Okundu/okunmadı state bozulmayacaktır.
* Mobilde taşma olmayacaktır.

⸻

18. Liderlik Alanı

Liderlik alanı incelenecek ve profesyonelleştirilecektir.

Kontrol edilecekler:

* İlk 3 özel tasarım
* Avatar/frame büyük preset
* Kullanıcı adı standardı
* E-posta başı gösterilmemesi
* Mobil hizalama
* Liste cache standardı
* Manuel yenileme
* Oyuncu profil modalı
* Kırık avatar/frame fallback
* Rank rozetleri
* Liste limiti

⸻

19. Hero Alanı ve Sosyal İkonlar

19.1 Hero Alanı

Hero alanında:

* Görsel taşma olmayacaktır.
* Mobilde banner kırpılmayacaktır.
* Slider butonları hizalı olacaktır.
* Dot navigation düzgün çalışacaktır.
* Gereksiz sahte veri olmayacaktır.
* Görseller optimize edilecektir.

19.2 Hero Altı Sosyal İkonlar

Sosyal ikonlar:

* Instagram
* Telegram
* TikTok
* Mail Destek

Kontrol edilecektir.

Kurallar:

* Sosyal Merkez sistemiyle karıştırılmayacaktır.
* Mail Destek sadece e-posta iletişimi standardında kalacaktır.
* Kartlar mobilde taşmayacaktır.
* İkonlar doğru linke yönlendirecektir.
* Boş / hatalı link varsa güvenli davranış gösterilecektir.

⸻

20. Oyun Kartları

Oyun kartları incelenecektir.

Aktif oyunlar:

* Crash
* Satranç
* Pişti
* Pattern Master
* Space Pro
* Snake Pro

Kurallar:

* SOS bulunmayacaktır.
* Music Tiles bulunmayacaktır.
* Kart yönlendirmeleri doğru olacaktır.
* Giriş gerektiren oyunlarda auth modal açılacaktır.
* Mobilde 2 kolon hedeflenecektir.
* Masaüstünde profesyonel grid korunacaktır.
* Kart hover/touch davranışı düzgün olacaktır.
* Görsel kırılması olmayacaktır.

⸻

21. Oyunlar Tek Tek İnceleme Standardı

21.1 Crash

Crash için kontrol edilecekler:

* Üst bar avatar/frame
* Crash canlı tur paneli küçük avatar/frame
* Bahis input
* Auto cashout
* Global round
* Kullanıcı adı standardı
* Kazanç bildirimi
* Mobil layout
* Socket state
* Backend settlement
* XP kuralı
* Bakiye güncelleme
* Runtime log

21.2 Satranç

Satranç için kontrol edilecekler:

* Üst bar avatar/frame
* Oyun game alanı avatar/frame
* Bot avatarı: /public/assets/images/logo.png
* Bot frame: /public/assets/market/frames/market-32.png
* Bot frame ayarı admin kaydıyla uyumlu
* Lobi boş mesajı profesyonel
* Hamle UI
* Oda kartları
* Kullanıcı adı standardı
* Mobil layout
* Ses
* Reconnect
* Draw/leave/result UI

21.3 Pişti

Pişti için kontrol edilecekler:

* Üst bar avatar/frame
* Game skor alanı avatar/frame
* Bot avatarı: /public/assets/images/logo.png
* Bot frame: /public/assets/market/frames/market-32.png
* Bot frame ayarı admin kaydıyla uyumlu
* Oyun veri hazırlanıyor state
* Skor kartı
* Kullanıcı adı standardı
* Mobil layout
* Deck/card alanları
* Result UI

21.4 Snake Pro

Kontrol edilecekler:

* Üst bar avatar/frame
* Skor güvenliği
* Mobil kontrol
* XP hesaplama backend standardı
* Oyun bitiş modalı
* Hile önleme

21.5 Space Pro

Kontrol edilecekler:

* Üst bar avatar/frame
* Skor güvenliği
* Hayatta kalma süresi
* XP hesaplama
* Mobil input
* Oyun bitiş modalı

21.6 Pattern Master

Kontrol edilecekler:

* Üst bar avatar/frame
* Pattern state
* XP hesaplama
* Hata/başarı UI
* Mobil uyum
* Oyun bitiş modalı

⸻

22. Kullanıcı Adı Standardı

Tüm görünür alanlarda kullanıcı adı şu öncelikle çözülecektir:

username > displayName > name > fullName > Oyuncu

E-posta başı fallback olarak kullanılmayacaktır.

Yanlış:

o6emirv2

Doğru:

o6emirxl

Uygulanacak alanlar:

* Liderlik
* Çark ödülleri
* Son kazananlar
* Son aktiviteler
* Crash canlı panel
* Crash kazanç bildirimi
* Satranç oyuncu kartları
* Pişti oyuncu kartları
* Profil modalı
* Hesabım modalı
* Admin kullanıcı listeleri
* Market geçmişi
* Oyun sonuç modalı

⸻

23. Backend Güvenlik ve Sağlamlaştırma

Backend tarafında kontrol edilecekler:

* Auth doğrulama
* Admin yetki kontrolü
* Firebase Admin config
* CORS
* Session lock
* Bakiye transaction
* XP transaction
* Market satın alma
* Promo kullanımı
* Çark settlement
* Avatar/frame setting write
* User profile update
* Register/profile consistency
* Idempotency
* Runtime log
* Hassas veri sanitization

Frontend hiçbir zaman:

* Bakiye belirleyemez.
* XP belirleyemez.
* Level belirleyemez.
* Market sahipliği belirleyemez.
* Çark sonucunu belirleyemez.
* Oyun sonucunu kesinleştiremez.

⸻

24. Dosya ve Kod Temizliği

Aşağıdaki her şey temizlenecektir:

* Gereksiz dosyalar
* Kullanılmayan klasörler
* Yorum kodları
* Test dosyaları
* MD dosyaları
* Backup dosyaları
* .old
* .bak
* .tmp
* Ölü importlar
* Kullanılmayan helper fonksiyonlar
* Duplicate CSS
* Duplicate JS
* Eski avatar/frame patch kodları
* Eski mock preview kutuları
* Kullanılmayan social/chat/dm/invite kodları
* SOS kalıntıları
* Music Tiles kalıntıları
* package-lock.json final ZIP içinde bulunmayacaktır.
* .npmrc final ZIP içinde bulunmayacaktır.

Temizlik yapılırken hiçbir aktif bağlantı rastgele silinmeyecektir. Her silme işlemi gerçek import, route, HTML bağlantısı ve runtime kullanımına göre kontrol edilecektir.

⸻

25. Kabul Kriterleri

Bu çalışma aşağıdaki kriterler sağlanmadan tamamlanmış sayılmayacaktır:

* Akıllı Avatar / Çerçeve Yönetim Merkezi çalışmalıdır.
* Admin tek uyum kaydıyla tüm alanları yönetebilmelidir.
* 14 avatar/frame alanı merkezi sisteme bağlı olmalıdır.
* Her alan kendi boyutunu korumalıdır.
* Çerçeve Seç modalı boyutu bozulmamalıdır.
* AnaSayfa üst barda avatar/frame görünmemelidir.
* AnaSayfa üst bar profesyonel profil ikonu kullanmalıdır.
* AnaSayfa bakiye alanı taşmamalıdır.
* MC çipi göz yormayan profesyonel efekt kullanmalıdır.
* Giriş modalı hatasız çalışmalıdır.
* Kayıt modalı yarım kullanıcı oluşturmamalıdır.
* Kayıt hataları kullanıcı dostu olmalıdır.
* Şifremi Unuttum modalı düzgün çalışmalıdır.
* Hesabım modalı düzgün çalışmalıdır.
* Avatar Seç modalı düzgün çalışmalıdır.
* Çerçeve Seç modalı düzgün çalışmalıdır.
* Market kartları taşmamalıdır.
* Market kategori sistemi profesyonel olmalıdır.
* Liderlik alanında kullanıcı adı doğru görünmelidir.
* Çark ödüllerinde e-posta başı görünmemelidir.
* Crash canlı tur paneli küçük ve zarif olmalıdır.
* Satranç/Pişti bot avatar-frame doğru olmalıdır.
* Botlar admin kayıtlı frame uyumunu kullanmalıdır.
* Satranç ve Pişti boş lobi mesajı profesyonel olmalıdır.
* Tüm oyunlar mobilde taşmadan çalışmalıdır.
* Gereksiz dosya/kod temizliği yapılmalıdır.
* Syntax kontrolleri geçmelidir.
* ZIP bütünlük kontrolü geçmelidir.
* Kalan bilinen sorun varsa açıkça raporlanmalıdır.

⸻

26. Teslimat Raporunda Yazılacaklar

Kod uygulaması tamamlandığında raporda şu bilgiler verilecektir:

* Güncellenen dosyalar
* Eklenen dosyalar
* Silinen dosyalar
* Temizlenen gereksiz kodlar
* Yeni avatar/frame merkezi render dosyası
* Yeni admin yönetim merkezi dosyaları
* Firebase veri modelinin nasıl kurulduğu
* Alan presetlerinin nerede tanımlandığı
* 14 alanın hangi variant ile bağlandığı
* AnaSayfa üst barın nasıl profesyonelleştirildiği
* Auth modallarında nelerin düzeltildiği
* Kayıt sisteminde yarım kayıt engelinin nasıl sağlandığı
* Market modalında nelerin düzeltildiği
* Liderlik alanı düzeltmeleri
* Çark / promo / bildirim düzeltmeleri
* Crash düzeltmeleri
* Satranç düzeltmeleri
* Pişti düzeltmeleri
* Klasik oyun düzeltmeleri
* Admin panel düzeltmeleri
* Gereksiz dosya/kod temizlik listesi
* Syntax kontrol sonucu
* ZIP bütünlük kontrol sonucu
* Kalan bilinen sorunlar

⸻

27. Kısa Sonuç

Bu yeni şartnamenin özü şudur:

PlayMatrix artık tek tek yamalanmış alanlardan oluşmayacak.
AnaSayfa, oyunlar, admin panel, modallar, market, liderlik ve avatar/frame sistemi merkezi, tutarlı, güvenli ve profesyonel bir yapıya alınacaktır.

Avatar/çerçeve tarafında:

Admin sadece uyumluluk kaydeder.
Sistem her alanın boyutunu kendi presetinden alır.
Her alan kendi tasarımını korur.
Tek kayıt tüm alanlarda doğru uygulanır.

Genel sistem tarafında:

Tüm modallar incelenir.
Tüm oyunlar incelenir.
Tüm gereksiz kodlar temizlenir.
Tüm görsel bozukluklar giderilir.
Tüm güvenlik açıkları kapatılır.
Tüm kullanıcı görünen alanlar profesyonelleştirilir.

Yukarıdaki Maddeleri Aşağıdaki Maddelere Göre Yeniden Uygula Ve Bana Yeni Güncel Şartnameyi Gönder Geliştirilmiş Profesyonel Seviyeye Çıkarılmış Şekilde Gönder

1- "YENİ ÖZELLİK"

ANASAYFADA OLAN "LİDERLİK ALANI-HESABIM MODALI-HESABIM MODALI İÇİNDEKİ PROFİL GÖRÜNÜMÜ KARTI" Bu Alanlar Aynı Görünümü Versin

ANASAYFA ÜST BARI VE MARKET KARTLARI AYRI OLARAK AYARLANACAK

OYUNLARDA OLAN "CRASH ÜST BAR-SATRANÇ ÜST BAR-PİŞTİ ÜST BAR-SNAKEPRO ÜST BAR-SPACE PRO ÜST BAR-PATTERN MASTER ÜST BAR" Bu Alanlar Aynı Görünümü Versin

CRASH CANLI TUR PANELİ-CRASH KAZANÇ BİLDİRİMİ-SATRANÇ GAME/OYUN KARTLARI-PİŞTİ GAME OYUN KARTLARI Ayrı Ayrı Ayarlanacak

AYARLAR FİREBASEYE KAYDEDİLECEK VE ORDAN OKUNUP UYGULANACAK HER RENDER YENİ DEPLOY SONRASI SIFIRLANMA OLMAYACAK

2- Avatar Büyütme Küçültme Çalışmıyor Önizlemede Görmüyorum Ben

3- Ön İzleme Alanı Gerçek Önizleme Yapmıyor Gerçek Tasarımdaki Gibi Birebir Göstermiyor Ön İzleme Alanı Site Tasarımındaki Neyse Onu Kesin Olarak Gösterecek Önizlemeler Gerçek Olacağı İçin Tasarımdan Yapılarını Ve Tasarım Kodlarını Al Mesela AnaSayfa Üst Bar Tasarım Kodlarını Al Ve Admin Paneli Ön İzleme Yerine Yerleştir Bu Sayede Nasıl Görüneceğini Ve Uyguladığım Zaman Nasıl Görüneceğini Daha Net Anlarım Ve Daha Net Ayarlar Yapabilirim

4- AnaSayfa Üst Barında Bulunan Çerçeve Ve Avatar Zıplama Kayma Yer Değiştirme Sorunları Oluyor Bu Sorunu Kökten Çöz

5- AVATAR VE ÇERÇEVE AYARLARINI KEYDET DEDİĞİM ZAMAN KESİN OLARAK UYGULANACAK ŞEKİLDE VE UYGULANACAK HALE GELECEK

6- Avatar Büyütme Küçültme Yazılarla Değil Tuşlarla Butonlarla Olsun

7- Çerçeve Büyütme Küçültme Yazılarla Değil Tuşlarla Butonlarla Olsun

8- Yani Butonlarla Genel Olarak İşlem Yapılsın Kar Butonlar Kullanılsın Üzerimde Anlamlı İkonlar Olsun Büyüme Küçülme İkonları Mesela Çerçeve Büyütmede Çerçeve İkonu Olsun Büyütme Anlamı Taşısın

9- Ön İzleme Alanı Gerçek Önizleme Yapmıyor Gerçek Tasarımdaki Gibi Birebir Göstermiyor Ön İzleme Alanı Site Tasarımındaki Neyse Onu Kesin Olarak Gösterecek

10- Avatar Çerçeve Ayarlarını Kaydet Butonu Kırmızı Renkte Olsun

11- Avatar Çerçeve Ayarlarını Kaydet Butonu Üstünde Yeşil Olarak Önizleme Yap Olsun Butona Basınca Önizleme Alanı Güncellensin Fakat Kaydetmesiz Sadece Önizleme Alanı Güncellensin

12- Önizlemeler Gerçek Olacağı İçin Tasarımdan Yapılarını Ve Tasarım Kodlarını Al Mesela AnaSayfa Üst Bar Tasarım Kodlarını Al Ve Admin Paneli Ön İzleme Yerine Yerleştir Bu Sayede Nasıl Görüneceğini Ve Uyguladığım Zaman Nasıl Görüneceğini Daha Net Anlarım Ve Daha Net Ayarlar Yapabilirim

13- AVATAR VE ÇERÇEVE AYARLARINI KEYDET DEDİĞİM ZAMAN KESİN OLARAK UYGULANACAK ŞEKİLDE VE HALE GELECEK

14- ADMİN PANELİNDELİ "AVATAR ÇERÇEVE ALAN BAZLI AYARLAR" KISMINDA KAYMA TAKILMA DÜZEN BOZUKLUĞU OLMAYACAK

15- Aşağıdaki Maddeler İyileştirilmiş Geliştirilmiş Profesyonel Seviyeye Çıkarılmış Şekilde Tekrardan Uygulama Yap

16- Avatar Ve Çerçeve Ayarları Firebaseye Kaydedilecek Oradan Okunup Uygulanacak Yani Render Her Deploy Yapıldığında Veya Sunucu Yenilendiğinde Ayarlar Kaybolmuyacak Gitmeyecek

"GÖNDERDİĞİM ZİP İÇİNDE VE KOD ÜZERİNDE UYGULA"

PLAYMATRIX PROFESYONEL GÜNCELLEME ŞARTNAMESİ

Tek Ana Madde: Admin Panelinden Avatar / Çerçeve Alan Bazlı Ayar Sistemi

Bu güncellemede amaç, PlayMatrix içinde avatar ve çerçeve kullanılan tüm alanların tek merkezden, admin paneli üzerinden, alan bazlı ve canlı önizlemeli şekilde yönetilmesidir.

Bu sistem hem normal çerçeveler hem de market çerçeveleri için geçerli olacaktır. Admin panelinden hangi alan için hangi avatar boyutu, çerçeve boyutu, hizalama, iç boşluk veya ölçek değeri girilirse, sistem o değeri doğrudan ilgili alanda uygulayacaktır.

Bu yapı tek bir genel ayar olarak yapılmayacaktır. Çünkü AnaSayfa üst barı, liderlik tablosu, market kartı, Crash üst barı, Satranç oyun alanı ve diğer oyun alanları farklı boyutlara sahiptir. Bu yüzden her kullanım alanı için ayrı ayar yapılacaktır.

⸻

1. Avatar / Çerçeve Ayarı Admin Panelinden Yönetilecek

Admin paneline profesyonel bir Avatar / Çerçeve Ayar Yönetimi alanı eklenecektir.

Bu alanda admin:

* Normal çerçeveleri düzenleyebilecektir.
* Market çerçevelerini düzenleyebilecektir.
* Her çerçevenin her kullanım alanındaki görünümünü ayrı ayrı ayarlayabilecektir.
* Avatarı büyütebilecektir.
* Avatarı küçültebilecektir.
* Çerçeveyi büyütebilecektir.
* Çerçeveyi küçültebilecektir.
* Avatarı sağa / sola / yukarı / aşağı kaydırabilecektir.
* Çerçeveyi sağa / sola / yukarı / aşağı kaydırabilecektir.
* İç boşluk ayarlayabilecektir.
* Çerçeve kalınlık tipini seçebilecektir.
* Gerçek alan önizlemesi üzerinden ayar yapabilecektir.

Bu sistem sadece market kartı için değil, PlayMatrix içinde avatar ve çerçeve kullanılan tüm alanlar için geçerli olacaktır.

⸻

2. Yönetilecek Avatar / Çerçeve Kullanım Alanları

Admin panelinde aşağıdaki 15 alan ayrı ayrı yönetilecektir.

Her alan kendi ayarına sahip olacaktır. Bir alanda yapılan avatar / çerçeve ayarı başka alanı bozmayacaktır.

No	Kullanım Alanı	Açıklama
1	AnaSayfa Üst Bar	Ana sayfa üst kısmındaki profil avatar + frame alanı
2	Liderlik Tablosu	Leaderboard kartları ve sıralama alanındaki avatar + frame
3	Hesabım Modalı	Hesabım modalı içinde görünen genel avatar + frame
4	Hesabım Modalı Profil Görünümü Kartı	Profil kartındaki büyük kullanıcı görünümü
5	Market Modalındaki Kartlar	Market ürün kartlarında frame önizleme alanı
6	Crash Üst Bar	Crash oyun üst barındaki avatar + frame
7	Crash Canlı Tur Paneli	Crash canlı tur oyuncu satırlarındaki avatar + frame
8	Crash Kazanç Bildirimi	Crash kazanç / sonuç bildirimlerinde avatar + frame
9	Satranç Üst Bar	Satranç üst barındaki avatar + frame
10	Satranç Game / Oyun Alanı Kartları	Satranç oyun içi oyuncu kartları
11	Pişti Üst Bar	Pişti oyun üst barındaki avatar + frame
12	Pişti Game / Oyun Alanı Skor Kartı	Pişti masa, skor ve oyuncu kartı alanları
13	Snake Pro Üst Bar	Snake Pro oyun üst barındaki avatar + frame
14	Space Pro Üst Bar	Space Pro oyun üst barındaki avatar + frame
15	Pattern Master Üst Bar	Pattern Master oyun üst barındaki avatar + frame

⸻

3. Her Alan İçin Ayrı Ayar Yapısı Olacak

Her avatar / çerçeve alanı için admin panelinde ayrı ayar grubu bulunacaktır.

Her alan için şu değerler düzenlenebilecektir:

* Avatar ölçeği
* Çerçeve ölçeği
* Avatar X hizalama
* Avatar Y hizalama
* Çerçeve X hizalama
* Çerçeve Y hizalama
* İç boşluk
* Dış boşluk
* Maksimum kutu genişliği
* Maksimum kutu yüksekliği
* Border radius / yuvarlaklık davranışı
* Taşma kontrolü
* Z-index / katman sırası
* Mobil özel ölçek
* Masaüstü özel ölçek
* Önizleme modu

Bu sayede örnek olarak:

* Leaderboard’da avatar + çerçeve büyük görünebilir.
* Oyun üst barında daha küçük ama net görünebilir.
* Market kartında ürün önizlemesi taşmadan gösterilebilir.
* Crash canlı tur panelinde satırı bozmadan küçük gösterilebilir.
* Hesabım profil kartında daha büyük ve premium görünebilir.

⸻

4. Alan Bazlı Önizleme Zorunlu Olacak

Admin panelindeki ayar sistemi yalnızca sayı girilen kuru bir form olmayacaktır.

Her alan için gerçek tasarıma benzeyen canlı önizleme bulunacaktır.

Örneğin admin AnaSayfa Üst Bar ayarını seçtiğinde, önizleme alanında gerçek AnaSayfa üst bar tasarımı gösterilecektir. Admin avatarı büyüttüğünde, çerçeveyi küçülttüğünde veya X/Y hizalamasını değiştirdiğinde bunu gerçek üst bar görünümü üzerinde anında görecektir.

Aynı şekilde:

* Liderlik Tablosu seçilirse gerçek leaderboard kartı önizlenecektir.
* Market Modal Kartı seçilirse gerçek market ürün kartı önizlenecektir.
* Crash Üst Bar seçilirse gerçek Crash üst bar tasarımı önizlenecektir.
* Crash Canlı Tur Paneli seçilirse gerçek oyuncu satırı önizlenecektir.
* Satranç Game Kartı seçilirse gerçek oyun içi oyuncu kartı önizlenecektir.
* Pişti Skor Kartı seçilirse gerçek skor / oyuncu kartı önizlenecektir.
* Snake Pro, Space Pro ve Pattern Master üst barları kendi gerçek üst bar görünümleriyle önizlenecektir.

Admin neyi ayarladığını tahmin etmeyecek. Gerçek kullanım alanını görerek ayar yapacaktır.

⸻

5. Önizleme Gerçek Render Sistemiyle Aynı Olacak

Admin panelindeki önizleme ile gerçek sitede görünen avatar / çerçeve sistemi farklı olmayacaktır.

Önizleme sistemi, sitede kullanılan merkezi avatar / frame render sistemiyle aynı mantığı kullanacaktır.

Yani admin panelinde düzgün görünen bir ayar:

* AnaSayfa’da aynı şekilde görünecek.
* Leaderboard’da aynı şekilde görünecek.
* Market kartında aynı şekilde görünecek.
* Crash üst barında aynı şekilde görünecek.
* Satranç üst barında aynı şekilde görünecek.
* Pişti oyun alanında aynı şekilde görünecek.

Admin panelinde yapılan ayar ile gerçek kullanıcı ekranı arasında fark olmayacaktır.

⸻

6. Normal Çerçeve ve Market Çerçeve Aynı Sistemden Yönetilecek

Normal çerçeveler ve market çerçeveleri iki ayrı, kopuk sistem olarak çalışmayacaktır.

Tek merkezi avatar / frame ayar sistemi kurulacaktır.

Bu sistem:

* Normal çerçeveleri destekleyecektir.
* Market çerçevelerini destekleyecektir.
* Varsayılan çerçeveyi destekleyecektir.
* Çerçevesiz avatar durumunu destekleyecektir.
* Eksik frame dosyası varsa güvenli fallback kullanacaktır.
* Eksik avatar varsa varsayılan PlayMatrix avatarını gösterecektir.

Normal frame seçildiğinde normal frame ayarları uygulanacaktır.

Market frame seçildiğinde market frame ayarları uygulanacaktır.

Her iki sistem de aynı alan bazlı ayar mantığıyla çalışacaktır.

⸻

7. Çerçeve Kalınlığına Göre Akıllı Ayar Profili Olacak

Çerçevelerin kalınlığı farklı olduğu için her frame aynı ayarla düzgün görünmez.

Bu nedenle her çerçeve için kalınlık profili bulunacaktır:

* İnce
* Normal
* Kalın
* Ultra kalın

Admin panelinde çerçevenin kalınlık tipi seçilebilecektir.

Kalınlık tipi, varsayılan avatar ölçeğini ve frame iç boşluğunu belirleyecektir. Ancak admin isterse her alan için bu değerleri ayrıca değiştirebilecektir.

Örnek:

* İnce frame: avatar daha büyük olabilir.
* Normal frame: standart oran kullanılabilir.
* Kalın frame: avatar biraz küçültülebilir.
* Ultra kalın frame: avatar daha fazla içeri alınabilir.

Ama nihai karar admin panelindeki alan bazlı ayarlardan gelecektir.

⸻

8. Admin Panelinde Ayar Akışı

Admin panelindeki sistem şu akışla çalışacaktır:

1. Admin Avatar / Çerçeve Ayarları bölümüne girer.
2. Normal çerçeve veya market çerçeve seçer.
3. Düzenlemek istediği çerçeveyi seçer.
4. Kullanım alanını seçer.
5. Gerçek alan önizlemesi açılır.
6. Admin avatar / frame değerlerini değiştirir.
7. Önizleme anında güncellenir.
8. Admin kaydeder.
9. Kaydedilen ayar ilgili alanda uygulanır.
10. Diğer alanların ayarı bozulmaz.

Bu sistemde admin örnek olarak şunları yapabilecektir:

* “Bu market frame AnaSayfa üst barda biraz daha büyük görünsün.”
* “Bu frame leaderboard’da geniş dursun.”
* “Bu frame oyun üst barında taşmadan ama net dursun.”
* “Bu frame Crash canlı tur panelinde küçük satıra sığsın.”
* “Bu frame market kartında gerçek önizleme gibi dursun.”
* “Bu frame Satranç oyun kartında avatarı kapatmasın.”

⸻

9. Kaydedilecek Veri Yapısı

Avatar / çerçeve ayarları backend tarafında güvenli ve düzenli bir yapıda tutulacaktır.

Her çerçeve için genel ayar ve alan bazlı ayarlar bulunacaktır.

Örnek mantık:

{
  frameId: "market-frame-1",
  frameType: "market",
  framePath: "/assets/market/frames/frame-1.png",
  thickness: "ultra",
  defaultSettings: {
    avatarScale: 0.82,
    frameScale: 1.12,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    frameOffsetX: 0,
    frameOffsetY: 0,
    innerPadding: 0
  },
  variants: {
    homeTopbar: {},
    leaderboard: {},
    accountModal: {},
    accountProfileCard: {},
    marketCard: {},
    crashTopbar: {},
    crashLivePanel: {},
    crashWinNotice: {},
    chessTopbar: {},
    chessGameCard: {},
    pistiTopbar: {},
    pistiScoreCard: {},
    snakeTopbar: {},
    spaceTopbar: {},
    patternTopbar: {}
  }
}

Alan bazlı değer yoksa sistem default ayarı kullanacaktır. Ancak admin bir alan için özel ayar girdiyse o alan mutlaka özel ayarı kullanacaktır.

⸻

10. Variant / Alan Anahtarları Standart Olacak

Kod içinde her alan için standart variant adı kullanılacaktır.

Kullanım Alanı	Teknik Variant Adı
AnaSayfa Üst Bar	homeTopbar
Liderlik Tablosu	leaderboard
Hesabım Modalı	accountModal
Hesabım Profil Kartı	accountProfileCard
Market Modal Kartları	marketCard
Crash Üst Bar	crashTopbar
Crash Canlı Tur Paneli	crashLivePanel
Crash Kazanç Bildirimi	crashWinNotice
Satranç Üst Bar	chessTopbar
Satranç Game Kartları	chessGameCard
Pişti Üst Bar	pistiTopbar
Pişti Skor Kartı	pistiScoreCard
Snake Pro Üst Bar	snakeTopbar
Space Pro Üst Bar	spaceTopbar
Pattern Master Üst Bar	patternTopbar

Frontend tarafında avatar / frame render edilirken hangi alanda render yapılıyorsa ilgili variant gönderilecektir.

Örnek:

renderAvatarFrame(user, {
  variant: "homeTopbar"
});
renderAvatarFrame(user, {
  variant: "crashTopbar"
});
renderAvatarFrame(user, {
  variant: "leaderboard"
});

⸻

11. Merkezi Render Sistemi Zorunlu Olacak

Avatar / çerçeve kullanılan alanlarda farklı farklı eski render kodları kullanılmayacaktır.

Tüm alanlar tek merkezi render sistemine bağlanacaktır.

Bu sistem:

* Kullanıcının aktif avatarını çözecektir.
* Kullanıcının aktif normal frame bilgisini çözecektir.
* Kullanıcının aktif market frame bilgisini çözecektir.
* Hangi frame’in aktif olduğunu belirleyecektir.
* İlgili alanın variant ayarını okuyacaktır.
* Avatar / frame boyutunu uygulayacaktır.
* X/Y hizalamayı uygulayacaktır.
* Eksik görsel durumunda fallback kullanacaktır.
* Boş avatar veya boş frame alanı göstermeyecektir.

Bu sistem sayesinde AnaSayfa, oyunlar, market ve admin paneli farklı sonuç üretmeyecektir.

⸻

12. Admin Panelinden Girilen Değer İlgili Alana Kesin Uygulanacak

Admin panelinden bir alan için hangi değer girildiyse, o değer ilgili alanda uygulanacaktır.

Örnek:

Admin Crash Üst Bar için:

* Avatar ölçeği: 0.86
* Frame ölçeği: 1.12
* Avatar X: 0
* Avatar Y: -1
* Frame X: 0
* Frame Y: 0

girdiyse, Crash üst barında bu değerler uygulanacaktır.

Aynı frame’in Leaderboard ayarı farklı olabilir. Leaderboard kendi değerini kullanacaktır. Crash üst barı Leaderboard değerini kullanmayacaktır.

Bu sistemde ayarlar karışmayacaktır.

⸻

13. Güvenli Değer Sınırları Olacak

Admin panelinden girilen değerler backend tarafında doğrulanacaktır.

Aşırı büyük veya sistemi bozacak değerler kabul edilmeyecektir.

Örnek güvenli aralıklar:

Ayar	Güvenli Aralık
Avatar ölçeği	0.50 - 1.30
Frame ölçeği	0.70 - 1.60
X hizalama	-40 px / +40 px
Y hizalama	-40 px / +40 px
İç boşluk	0 - 40 px

Bu aralıklar sistemin tasarımına göre düzenlenebilir. Ama admin yanlışlıkla avatarı tamamen yok edecek veya çerçeveyi ekran dışına taşıyacak değer girdiğinde sistem bunu engellemelidir.

⸻

14. Mobil ve Masaüstü Ayarları Desteklenecek

Her alan için gerekirse mobil ve masaüstü ayrı değerler kullanılabilecektir.

Örneğin AnaSayfa üst barında mobil görünüm çok dar olduğu için mobil ayar farklı olabilir.

Her variant için şu yapı desteklenmelidir:

* Varsayılan ayar
* Mobil ayar
* Masaüstü ayar

Mobil ayar varsa mobilde o kullanılacaktır. Yoksa varsayılan ayar kullanılacaktır.

Bu sayede oyun üst barları küçük ekranlarda bozulmayacaktır.

⸻

15. Market Kartı Önizlemesi Gerçek Kullanım Mantığıyla Çalışacak

Market modalındaki frame kartları yalnızca frame görselini göstermeyecektir.

Market kartında:

* Kullanıcının mevcut avatarı kullanılacaktır.
* Kullanıcı giriş yapmamışsa varsayılan avatar kullanılacaktır.
* Frame gerçek avatar üzerinde gösterilecektir.
* Karttaki önizleme marketCard variant ayarını kullanacaktır.
* Market kartında görünen frame, satın alındıktan sonra diğer alanlarda bozulmayacaktır.
* Market kartındaki görünüm, admin panelindeki market kartı önizlemesiyle uyumlu olacaktır.

⸻

16. Oyun Üst Barları Kendi Variant Ayarlarını Kullanacak

Tüm oyun üst barları merkezi render sistemini kullanacaktır ancak her oyun kendi variant ayarını okuyacaktır.

Örnek:

* Crash üst bar: crashTopbar
* Satranç üst bar: chessTopbar
* Pişti üst bar: pistiTopbar
* Snake Pro üst bar: snakeTopbar
* Space Pro üst bar: spaceTopbar
* Pattern Master üst bar: patternTopbar

Böylece bir oyunda iyi görünen frame diğer oyunda bozulmayacaktır.

⸻

17. Crash, Satranç ve Pişti Özel Alanları Ayrıca Ayarlanacak

Crash, Satranç ve Pişti oyunlarında üst bar dışında özel oyuncu alanları vardır.

Bu alanlar da ayrıca variant olarak yönetilecektir.

Crash için:

* Crash üst bar
* Crash canlı tur paneli
* Crash kazanç bildirimi

Satranç için:

* Satranç üst bar
* Satranç oyun alanı oyuncu kartları

Pişti için:

* Pişti üst bar
* Pişti oyun alanı skor kartı

Bu alanların her biri farklı boyutta olduğu için aynı ayarı kullanmayacaktır.

⸻

18. Kullanıcıya Özel Aktif Frame Karışmayacak

Bu sistem yalnızca görünüm ayarıdır. Kullanıcı sahiplik sistemiyle karıştırılmayacaktır.

Kurallar:

* X kullanıcısının frame’i yalnızca X üzerinde görünür.
* Y kullanıcısının frame’i yalnızca Y üzerinde görünür.
* Admin panelindeki ayar, frame’in nasıl görüneceğini belirler.
* Admin panelindeki ayar, frame’in kime ait olduğunu değiştirmez.
* Bir frame’in alan bazlı ayarı tüm kullanıcılar için aynı frame görselinin hizalamasını belirler.
* Kullanıcıya özel sahiplik ve aktif kullanım backend tarafından korunur.

⸻

19. Normal Frame / Market Frame Aktiflik Kuralı Korunacak

Avatar / çerçeve ayar sistemi aktif frame seçimini bozmayacaktır.

Kurallar:

* Kullanıcı market frame seçerse market frame görünür.
* Kullanıcı normal frame seçerse normal frame görünür.
* Market frame sahipliği silinmez.
* Normal frame seçildiğinde market frame aktif slotu temizlenebilir.
* Aktif frame hangi kaynaksa render sistemi onu gösterir.
* Admin panelindeki ayarlar yalnızca görünüm oranlarını belirler.

⸻

20. Boş Avatar / Boş Frame Görünümü Engellenecek

Hiçbir alanda boş avatar, boş frame halkası veya kırık görsel görünmeyecektir.

Kurallar:

* Avatar yüklenemezse varsayılan avatar kullanılacaktır.
* Frame dosyası eksikse frame gösterilmeyecek veya varsayılan güvenli frame kullanılacaktır.
* Kırık image icon görünmeyecektir.
* Frame var avatar yok gibi görünüm olmayacaktır.
* Avatar var frame kayıp gibi hatalar loglanacaktır.
* Admin panelinde bozuk frame path uyarısı gösterilecektir.

⸻

21. Admin Önizleme Alanları Gerçek Tasarıma Yakın Olacak

Admin panelindeki önizleme kutuları basit boş kutu olmayacaktır.

Her alan için gerçek tasarım şablonu kullanılacaktır:

* AnaSayfa üst bar önizlemesi
* Liderlik tablosu kart önizlemesi
* Hesabım modal önizlemesi
* Hesabım profil kartı önizlemesi
* Market kartı önizlemesi
* Crash üst bar önizlemesi
* Crash canlı tur paneli satır önizlemesi
* Crash kazanç bildirimi önizlemesi
* Satranç üst bar önizlemesi
* Satranç oyun kartı önizlemesi
* Pişti üst bar önizlemesi
* Pişti skor kartı önizlemesi
* Snake Pro üst bar önizlemesi
* Space Pro üst bar önizlemesi
* Pattern Master üst bar önizlemesi

Admin ayar yaparken gerçek ekranı görüyormuş gibi davranacaktır.

⸻

22. Eski Kopya Avatar / Frame Kodları Temizlenecek

Avatar ve frame kullanılan eski, kopya, farklı çalışan kodlar temizlenecektir.

Temizlenecekler:

* Farklı dosyalarda tekrar eden avatar render kodları
* Eski frame path çözümleyicileri
* Sadece bazı oyunlarda çalışan özel frame kodları
* Market kartına özel kopuk preview kodları
* Leaderboard’a özel eski frame hizalama kodları
* Oyun üst barlarında frame’i gizleyen CSS çakışmaları
* Avatarın zıplamasına neden olan geç yükleme stilleri
* Gereksiz !important çözümleri
* Kullanılmayan helper fonksiyonlar

Tüm sistem merkezi yapıya bağlanacaktır.

⸻

23. Backend ve Frontend Uyumluluğu

Backend tarafında:

* Frame ayarları güvenli şekilde kaydedilecektir.
* Admin yetkisi olmayan kullanıcı ayar değiştiremeyecektir.
* Değer aralıkları doğrulanacaktır.
* Bozuk frame path kayıtları engellenecektir.
* Ayar değişiklikleri loglanacaktır.
* Hassas veri frontend’e sızdırılmayacaktır.

Frontend tarafında:

* İlgili variant ayarları okunacaktır.
* Cache kontrollü çalışacaktır.
* Yeni ayarlar sayfaya düzgün yansıyacaktır.
* Eski ayar gelmezse default ayar kullanılacaktır.
* Mobil ve masaüstü ayrımı uygulanacaktır.
* Bozuk veya eksik veri UI’ı kırmayacaktır.

⸻

24. Kabul Kriterleri

Bu sistem aşağıdaki şartlar sağlanmadan tamamlanmış sayılmayacaktır:

* Admin panelinde avatar / frame ayar bölümü çalışmalıdır.
* Normal frame ve market frame aynı sistemden yönetilmelidir.
* 15 kullanım alanının tamamı ayrı ayrı ayarlanabilir olmalıdır.
* Her alan için gerçek tasarıma yakın önizleme bulunmalıdır.
* Admin panelinden girilen değer ilgili alana uygulanmalıdır.
* Bir alanın ayarı başka alanı bozmamalıdır.
* AnaSayfa üst barında avatar + frame zıplamamalıdır.
* Leaderboard’da avatar + frame bütünleşik görünmelidir.
* Market kartlarında frame gerçek avatar üzerinde görünmelidir.
* Crash üst barda avatar + frame eksiksiz görünmelidir.
* Satranç üst barda frame kaybolmamalıdır.
* Pişti üst barda avatar + frame düzgün görünmelidir.
* Snake Pro, Space Pro ve Pattern Master üst barları aynı merkezi sistemi kullanmalıdır.
* Crash canlı tur paneli ve kazanç bildirimi ayrı ayarlarını kullanmalıdır.
* Satranç ve Pişti oyun içi kartları ayrı ayarlarını kullanmalıdır.
* Kırık avatar veya kırık frame görüntüsü oluşmamalıdır.
* Mobilde taşma olmamalıdır.
* Masaüstünde hizalama bozulmamalıdır.
* Eski kopya render kodları temizlenmelidir.

⸻

25. Teslimatta Belirtilecekler

Güncelleme tamamlandığında şu bilgiler net şekilde raporlanacaktır:

* Hangi dosyalar güncellendi.
* Hangi dosyalar eklendi.
* Hangi dosyalar silindi.
* Avatar / frame merkezi render sistemi hangi dosyada kuruldu.
* Admin panelinde avatar / frame ayarları hangi dosyalara eklendi.
* 15 kullanım alanının hangi variant adlarıyla bağlandığı.
* Normal frame ve market frame sisteminin nasıl ortaklaştırıldığı.
* Önizleme sisteminin nasıl çalıştığı.
* Admin panelinden girilen ayarların frontend’e nasıl uygulandığı.
* Mobil ve masaüstü ayarlarının nasıl yönetildiği.
* Eski avatar / frame kodlarından nelerin temizlendiği.
* Hangi syntax kontrollerinin yapıldığı.
* Hangi ZIP bütünlük kontrollerinin yapıldığı.
* Kalan bilinen sorun varsa açıkça belirtilecektir.

⸻

Kısa Sonuç

Bu güncellemede kurulacak sistemin adı:

Admin Panelinden Alan Bazlı Avatar / Çerçeve Ayar Sistemi

olacaktır.

Bu sistemde admin, avatar ve çerçeve kullanılan 15 alanın her biri için ayrı ayrı ayar yapabilecektir. Her ayar gerçek tasarım önizlemesiyle yapılacak ve admin panelinden girilen değer doğrudan ilgili alanda uygulanacaktır. Böylece leaderboard’da büyük görünen frame, oyun üst barında küçük kalmayacak; market kartında düzgün görünen frame gerçek kullanımda bozulmayacaktır.