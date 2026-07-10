PROTOKOLÜ SATIR SATIR İNCELE VE KAYDET ARTIK TÜM SOHBETLERDE BU PROTOKOL ÜZERİNDEN İLERLEYECEĞİZ

⸻

PLAYMATRIX NİHAİ PROTOKOL

BAĞLAYICI PRODUCTION / DENETİM / UYGULAMA STANDARDI

Bu protokol, PlayMatrix projesinde yapılacak tüm ZIP inceleme, kod denetimi, kod onarımı, sistem temizliği, güvenlik güçlendirme, backend otorite düzenlemesi, AnaSayfa mobil/tablet uyumluluğu, oyun stabilizasyonu, admin panel yönetimi, avatar/çerçeve sistemi, XP/seviye, ekonomi, market, promo, çark, bildirim, runtime log, Redis, Firestore, Render/Firebase standardı, test/kalite kapısı ve final ZIP teslim süreçleri için bağlayıcı çalışma standardıdır.

Bu protokol yalnızca PlayMatrix projesi için geçerlidir.

Tüm eski PlayMatrix protokolleri tamamen geçersizdir. Eski v2, v2.1 veya başka isimli PlayMatrix protokolleri tarihsel referans olarak dahi bağlayıcı değildir.

Bu protokol kod uygulaması değildir. Kod uygulaması yalnızca kullanıcının açık ve birebir şu onayıyla yapılır:

EVET uygula

Bu ifade dışında hiçbir cümle, yorum, ima, görsel, açıklama, benzer talep veya genel onay kod uygulama onayı sayılmaz.

Protokol güncelleme onayı için geçerli ifade:

EVET protokolü güncelle

⸻

0. ÜST ÖNCELİK VE ÇELİŞKİ ÇÖZÜM KURALI

PlayMatrix çalışmalarında öncelik sırası şöyledir:

1. Kullanıcının son açık talimatı
2. PLAYMATRIX NİHAİ PROTOKOL
3. Mevcut ZIP içindeki gerçek ve doğrulanmış kod davranışı
4. Genel production güvenlik / stabilite / backend authority standardı

Kullanıcının son talimatı geçerlidir; ancak hiçbir son talimat aşağıdaki korumaları geçersiz kılamaz:

* Güvenlik koruması
* Gizlilik koruması
* Backend authority standardı
* Veri kaybı koruması
* Hassas veri sızıntısı engeli
* Sahte test/log/kanıt yasağı
* Onaysız kod/dosya işlem yasağı

Hiçbir durumda tahmin, sahte log, sahte test, uydurma satır numarası, dosyada olmayan kod parçası veya kanıtsız başarı ifadesi kullanılmaz.

⸻

1. KOD UYGULAMA VE ONAY STANDARDI

1.1 Geçerli Kod Uygulama Onayı

Kod uygulaması için geçerli tek ifade:

EVET uygula

Bu ifade birebir, büyük/küçük harf duyarlı ve eksiksiz olmalıdır.

Kullanıcı mesajında bu ifade varsa ve ZIP gönderilmişse, belirtilen kapsam üzerinden doğrudan uygulama yapılabilir.

Kapsam belirtilmeden sadece EVET uygula denirse, yalnızca önceki raporda kritik olarak tespit edilen maddeler uygulanır.

1.2 Onaysız İşlem Yasakları

Açık EVET uygula olmadan:

* Dosya değiştirilmez.
* Dosya silinmez.
* Dosya taşınmaz.
* Dosya yeniden adlandırılmaz.
* ZIP yeniden paketlenmez.
* Asset temizliği yapılmaz.
* package.json değiştirilmez.
* Build/deploy varsayımı yapılmaz.
* Eski/backup klasörleri temizlenmez.
* Büyük modüler refactor yapılmaz.

Kritik güvenlik açığı görülse bile onaysız düzeltilmez; yalnızca raporlanır.

1.3 Kapsam Sınırı

Kullanıcı “Aşağıdaki maddeler dışında değişiklik yapma” derse bu talimat mutlak kabul edilir.

Kapsam dışında güvenlik açığı veya kritik risk görülürse raporlanır; fakat kapsam dışı kod değişikliği yapılmaz.

1.4 Rapor Başlangıç Standardı

Kod uygulanmadıysa rapor şu cümleyle başlar:

Dosyada hiçbir değişiklik yapılmadı.

1.5 Kanıtlı Başarı İfadesi

Şu ifadeler yalnızca gerçek kanıt varsa kullanılabilir:

* Tam hatasız
* %100 çalışır
* Kesin sorunsuz
* Canlıda test edildi

Doğru standart ifade:

Çalıştırılan kontroller başarılı.

Canlı Render testi yapılmadıysa şu ifade kullanılır:

Canlı test yapılmadı; lokal/statik kontroller yapıldı.

⸻

2. KANITA DAYALI DENETİM STANDARDI

Her hata, kusur veya eksik gerçek dosya içeriğine dayanmalıdır.

Her bulguda mümkünse şu alanlar bulunur:

1. Kısa hata başlığı
2. Etki seviyesi
3. Görünen sorun
4. Dosya
5. Satır
6. Gerçek kod parçası
7. Teknik sebep
8. Önerilen düzeltme
9. Sonuç

Kurallar:

* Satır numarası yalnızca doğrulanırsa yazılır.
* Kod parçası yalnızca dosyada varsa yazılır.
* Render log satırı yalnızca gerçek log veya ekran görüntüsünde varsa yazılır.
* Kullanıcının gönderdiği ekran görüntüsü davranış kanıtı sayılır; fakat kod satırı yerine geçmez.
* Canlı Render testi yapılmadıysa yapılmış gibi yazılmaz.
* Test çalıştırılamadıysa nedeni açıkça yazılır.
* Çalıştırılamayan test ile başarısız test ayrı raporlanır.

⸻

3. PROJE DOSYA MİMARİSİ

3.1 Geçerli Kök Yapı

Kökte bulunması gereken temel dosyalar:

/index.html
/script.js
/style.css
/server.js
/package.json

Kökte ayrıca şu klasörler bulunabilir:

/public/js
/public/css
/assets
/admin
/games

3.2 Admin Panel Yapısı

Admin panel dosyaları /admin klasörü altında bulunur.

Tercih edilen yapı:

/admin/index.html
/admin/admin.css
/admin/admin.js
/admin/admin-auth.js
/admin/admin-api.js
/admin/admin-modals.js
/admin/admin-health.js

Mevcut projedeki çalışan admin yapısı korunabilir; ancak bozuk, duplicate, eski selector kullanan veya işlem yapmayan alanlar temizlenir.

3.3 Oyun Dosya Yapısı

Oyunlar şu yapı altında bulunur:

/games/crash/index.html
/games/crash/crash.js
/games/crash/crash.css
/games/chess/index.html
/games/chess/chess.js
/games/chess/chess.css
/games/pisti/index.html
/games/pisti/pisti.js
/games/pisti/pisti.css
/games/pattern/index.html
/games/pattern/pattern.js
/games/pattern/pattern.css
/games/space/index.html
/games/space/space.js
/games/space/space.css
/games/snake/index.html
/games/snake/snake.js
/games/snake/snake.css

3.4 Asset Yapısı

Geçerli asset standardı:

/assets/images
/assets/icons
/assets/audio
/assets/frame
/assets/avatar

Kullanıcı upload sistemi yoktur. Kullanıcı asset yükleyemez. Avatar ve frame dosyaları lokal asset olarak yönetilir.

3.5 CSS Yapısı

CSS yapısı:

* Global CSS
* Modül CSS
* Oyun CSS
* Admin CSS

şeklinde yönetilir.

Tekrarlı CSS blokları yalnızca aynı davranış kanıtlanırsa birleştirilir.

⸻

4. FINAL ZIP TEMİZLİK STANDARDI

Final ZIP içinde kesinlikle bulunmayacaklar:

.npmrc
README
*.md
__MACOSX
._*
.DS_Store
.old
.bak
.tmp
backup
test
debug
phase
demo
legacy-unused

README ve MD dosyaları final ZIP’ten otomatik çıkarılır.

Eski/backup klasörleri yalnızca EVET uygula sonrası final temizlikte kaldırılabilir.

Kullanılmayan assetlerin silinmesi için ayrıca açık onay gerekir.

Final ZIP içinde yasak dosya taraması zorunludur.

⸻

5. AKTİF OYUN LİSTESİ

Aktif oyunlar yalnızca şunlardır:

1. Crash
2. Satranç
3. Pişti
4. Pattern Master
5. Space Pro
6. Snake Pro

SOS, eski klasik oyunlar, demo oyunlar, phase oyunları ve test oyunları geri getirilmeyecektir.

Tüm oyunlarda giriş zorunludur.

Misafir kullanıcı yoktur.

Ödül, MC, promo, çark ve market işlemleri için e-posta doğrulaması, doğum tarihi doğrulaması ve 16+ uygunluğu zorunludur.

⸻

6. MOBİL / TABLET ÖNCELİKLİ KULLANICI SİTESİ

PlayMatrix kullanıcı sitesi mobil ve tablet öncelikli çalışacaktır.

Kurallar:

* Kullanıcı sitesi telefon ve tablet için optimize edilir.
* Kullanıcı sitesi desktop kullanımına açılmaz.
* Desktop engeli 1024px üstü genişlik ve user-agent/screen-width kontrolünün birlikte değerlendirilmesiyle uygulanır.
* Desktop kullanıcıya QR kod, mobil yönlendirme ve kısa açıklama gösterilir.
* Admin panel linki kullanıcı desktop engel ekranında gösterilmez.
* Admin panel desktop, tablet ve mobilde kullanılabilir kalır.
* Kullanıcı sitesinde hamburger menü yasaktır.
* Admin mobilde hamburger menü kullanılabilir.
* Alt mobil navigation korunur.
* AnaSayfa mobilde 2 kolon oyun kartı düzeni kullanır.
* PWA desteklenir: manifest, icon ve mobile web app ayarları bulunur.
* Offline oyun yoktur.

⸻

7. ANASAYFA STANDARDI

7.1 Tasarım Kararı

AnaSayfa mevcut tasarım kimliğini korur.

Küçük güzelleştirmeler yapılabilir; ancak büyük tasarım değişiklikleri kullanıcıya önerilir ve onay alınmadan uygulanmaz.

7.2 Üst Bar

AnaSayfa üst barında:

* Logo bulunur.
* PlayMatrix kimliği korunur.
* Avatar bulunur.
* Avatar üzerinde frame bulunmaz.
* Hamburger menü bulunmaz.
* Mobilde taşma olmaz.

7.3 Oyun Kartları

Oyun kartları:

* Mobilde 2 kolon olur.
* Bakım etiketi gösterir.
* Aktif oyuncu sayısı gösterir.
* Girişsiz oyun açmaz.
* Bakımdaki oyun kartı oyuna yönlendirmez.
* Bakımdaki oyuna tıklanınca Tools mesajı gösterir.

7.4 Direct URL Bakım Engeli

Bakım modundaki oyun direct URL ile açılamaz.

Direct URL engeli hem frontend hem server-side uygulanır.

Kullanıcı oyun URL’sini doğrudan yazarsa AnaSayfa’ya yönlendirilir ve Tools mesajı gösterilir.

⸻

8. ANASAYFA MODÜLER YAPI

AnaSayfa kademeli olarak modüler hale getirilir.

Tercih edilen yapı:

/script.js
/public/js/home/auth-modal.js
/public/js/home/game-catalog.js
/public/js/home/leaderboard.js
/public/js/home/profile-panel.js
/public/js/home/reward-ui.js
/public/js/home/market.js
/public/js/home/wheel.js
/public/js/home/notification.js
/public/js/home/toast.js
/public/js/home/tools.js
/public/js/home/widget-contract.js
/public/js/profile/avatar-picker.js
/public/js/profile/frame-picker.js
/public/js/profile/profile-stats.js

script.js yalnızca minimum init / bootstrap görevi görür.

Sosyal merkez, DM, arkadaş sistemi, chat, oyun daveti, davet et ve kazan, canlı destek modülü bulunmaz.

Canlı destek yalnızca e-posta yönlendirme standardındadır.

Büyük dosyaları modülerleştirmek ayrı kapsam onayı gerektirir.

⸻

9. KAYIT / GİRİŞ / HESAP STANDARDI

9.1 Auth Modeli

Auth modeli hibrittir:

* Firebase Authentication kullanılır.
* Backend session/token doğrulama yapar.
* Frontend yetki kararı veremez.
* Backend Firebase ID token/session doğrular.
* Kullanıcı yetkisi backend tarafından belirlenir.

9.2 Kullanıcı Adı

Kullanıcı adı:

* 5-20 karakter
* Türkçe harf destekli
* Harf, sayı, ., -, _ destekli
* Boşluk içermez

Kullanıcı adı benzersizliği Firestore usernames koleksiyonu üzerinden transaction ile yönetilir.

9.3 İsim / Soyisim

İsim ve soyisim:

* Ayrı alanlar olarak değerlendirilir.
* 3-50 karakter
* Türkçe harf destekli
* Sayı içermez
* Boşluk içermez
* _, ., - içermez

9.4 Şifre

Şifre:

* Minimum 6 karakter
* Özel karakter zorunlu değildir.

Şifre sıfırlama Firebase reset mail ile yapılır.

9.5 Doğum Tarihi ve 16+ Yaş Standardı

Kayıtta doğum tarihi zorunludur.

Doğum tarihi alanı:

* Gün select
* Ay select
* Yıl select

şeklindedir.

Yaş sınırı:

16+

16+ kontrolü:

* Frontend ön kontrol yapar.
* Backend kesin doğrulama yapar.
* Backend doğrulaması nihai otoritedir.

Kullanıcı 16 yaş altı doğum tarihi girerse kayıt devam etmez ve kullanıcı dostu mesaj gösterilir.

Doğum tarihi sonradan kullanıcı tarafından değiştirilemez.

Doğum tarihi yalnızca admin tarafından kritik işlem olarak değiştirilebilir:

* Reauth zorunludur.
* Audit zorunludur.
* Audit içinde tam doğum tarihi yazılmaz.
* Audit yalnızca “doğum tarihi eklendi/değiştirildi” bilgisini tutar.

Eski hesaplar için:

* Eski hesaplar giriş yapabilir.
* Doğum tarihi eklenene kadar oyun/market/çark/promo kilitlenir.
* Hesabım bölümünde doğum tarihi alanı gösterilir.
* Eski hesap doğum tarihi girince 16 yaş altı çıkarsa hesap kilitlenir.
* Admin açarsa kullanıcı kullanıma devam edebilir.

Admin panelde doğum tarihi:

* Tam tarih
* Yaş

olarak görünür.

Kullanıcı doğum tarihinin yanlış girildiğini iddia ederse süreç destek e-postası üzerinden yürür ve admin kritik işlem ile düzeltir.

9.6 Kayıt Ödülü

Başlangıç ödülü:

* Kayıt sonrası 50.000 MC kayıt ödülü
* E-posta doğrulandıktan sonra 100.000 MC e-posta doğrulama ödülü

Ödüller backend transaction ve idempotency ile verilir.

9.7 E-Posta Değişikliği

Kullanıcı e-postasını değiştirirse yeni e-posta doğrulanana kadar ödüllü işlemler kilitlenir.

9.8 Tek Aktif Oturum

Çoklu cihaz oturumu desteklenmez.

Tek aktif kullanıcı oturumu vardır.

Yeni cihazdan giriş yapılırsa eski oturum otomatik düşer.

Kullanıcı aktif oyundaysa yeni giriş engellenir.

Kullanıcı session süresi:

7 gün

Admin session süresi:

1 saat

9.9 Banlı Kullanıcı

Banlı kullanıcı giriş yapabilir; ancak:

* Oyunlara giremez.
* Market kullanamaz.
* Çark kullanamaz.
* Promo kullanamaz.

Ban mesajını admin yazabilir.

⸻

10. KAYIT HATA MESAJLARI

Kayıt sırasında kullanıcıya teknik mesaj gösterilmez.

Yasak kullanıcı mesajları:

Firebase error
Validation failed
Unauthorized
Internal error
Permission denied
Backend
Server error
HTTP 500
API failed
Token expired
Undefined
Null reference

Doğru mesaj örnekleri:

Kullanıcı adı 5-20 karakter olmalı.
İsim yalnızca harflerden oluşmalı.
Şifre en az 6 karakter olmalı.
Bu e-posta adresi zaten kullanılıyor.
Bu kullanıcı adı kullanılamıyor.
Devam edebilmek için 16 yaşından büyük olmalısınız.
Doğum tarihi alanını eksiksiz seçmelisiniz.

Kayıt formunda canlı validasyon bulunur.

Kullanıcı adı uygunluğu backend’den kontrol edilir.

⸻

11. KVKK / GİZLİLİK / KULLANIM ŞARTLARI

KVKK ve Kullanım Şartları ayrı sayfalardır.

Kayıt sırasında zorunlu onaylar:

* Kullanım Şartları
* KVKK / Gizlilik
* MC sanal puan bilgilendirmesi

MC gerçek para karşılığı olmayan sanal puandır.

MC sanal puan açıklaması şu alanlarda gösterilir:

* Kayıt
* Market
* Çark
* Promo

Kullanıcı verisini silme talebi Hesabım bölümünden yapılabilir.

⸻

12. KULLANICI VERİ SİLME TALEBİ

Kullanıcı hesap silme talebi oluşturabilir.

Silme talebinde:

* 7 gün bekleme süresi vardır.
* Kullanıcı bekleme süresinde talebi iptal edebilir.
* Silme talebi aktifken kullanıcı oyun oynayamaz.
* Silme talebi aktifken market, çark, promo kullanılamaz.
* Kullanıcı yalnızca hesaba girip talebi iptal edebilir.

Hard delete sonrası:

* Anonimleştirilmiş işlem kaydı kalır.
* Aynı e-posta 15 gün sonra tekrar kullanılabilir.
* Kullanıcı adı 15 gün sonra tekrar boşa çıkar.

Kullanıcı silme kritik işlemdir.

Admin hard delete yaparsa:

* Reauth zorunludur.
* Audit zorunludur.
* Geri alınamaz uyarısı gösterilir.

⸻

13. TOOLS / BİLDİRİM / MESAJ STANDARDI

13.1 Tek Merkezi Mesaj Sistemi

PlayMatrix genelinde tek merkezi Tools mesaj sistemi kullanılır.

Tools türleri:

success
error
warning
info
reward
system

Tools mesajları global queue mantığıyla çalışır.

Aynı mesaj spam engeli:

5 saniye

Tools mesajları ekranın üst merkezinde görünür.

Tools görünme süresi türe göre:

3-8 saniye

Modal içi eski hata kutuları, alert yapıları, duplicate toast sistemleri ve inline eski uyarı kutuları kaldırılır.

13.2 Kullanıcıya Teknik Mesaj Gösterilmez

Kullanıcıya şu ifadeler gösterilmez:

Firebase
Backend
Server error
Render memory
Exception
Stack trace
Endpoint
Unauthorized
Validation failed
Internal error
Permission denied
HTTP 500
API failed
Token expired
Undefined
Null reference

Backend message alanı kullanıcıya doğrudan gösterilmez.

Frontend, backend code alanını Türkçe kullanıcı mesajına map eder.

Bilinmeyen hata kodunda kullanıcıya şu mesaj gösterilir:

İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.

13.3 Admin Teknik Detay

Admin panelde teknik detay yalnızca geliştirici detayı açıldığında gösterilir.

Admin geliştirici detayı kapalıysa kullanıcı dostu açıklama gösterilir.

⸻

14. BİLDİRİM STANDARDI

Bildirimler:

* Socket + fallback yapısıyla çalışır.
* Fallback düşük frekanslıdır.
* Bildirim geçmişi kalıcı değildir.
* Bildirim geçmişi Render memory içinde tutulur.
* Kullanıcı başı bildirim geçmişi memory limiti 20’dir.
* Okundu bilgisi Render memory içinde geçici tutulur.
* Kullanıcı bildirim geçmişi kalıcı Firestore kaydı olarak tutulmaz.
* Bildirim payload hassas veri içermez.

Bildirim sesi:

* Kullanıcı tarafından açılıp kapatılabilir.
* Cihaz sessiz moduna saygı gösterilir.
* Kullanıcı ayarı Firestore kullanıcı ayarlarında tutulur.

Admin duyuruları:

* Admin kişisel mesaj veya sistem duyurusu gönderebilir.
* Admin ne yazarsa kullanıcı onu görür.
* Otomatik ek metin eklenmez.
* Admin duyurunun geçici veya kalıcı olmasını seçebilir.
* Kalıcı admin duyuruları bildirim geçmişinden ayrı sistemdir.
* Admin duyuruyu zorunlu yaparsa kullanıcı kapatsa bile tekrar görünür.

⸻

15. SON KAZANANLAR / AKTİVİTELER

Son kazananlar Render memory üzerinde tutulur.

Varsayılan liste limiti:

5

Admin bu limiti ayarlayabilir.

Sahte veri gösterilmez.

Çark ödülleri ve ödül bildirimleri son kazananlara düşebilir.

Crash Canlı Tur Paneli kayıtları Render memory üzerinde tutulur ve maksimum 1000 kayıt tutabilir.

⸻

16. LEADERBOARD STANDARDI

Leaderboard:

* Backend’den alınır.
* AnaSayfa açılışında yüklenir.
* Refresh süresi 60 saniyedir.
* AnaSayfa görünür değilse polling durur.
* Client-side sıralama kabul edilmez.
* İlk 3 sıra özel tasarım alabilir.
* Mobil performans korunur.

⸻

17. BACKEND AUTHORITY MATRIX

Alan	Otorite
Bakiye	Backend
XP	Backend
Level	Backend
Market satın alma	Backend
Market sahipliği	Backend
Promo ödülü	Backend
Çark sonucu	Backend
Oyun sonucu	Backend
Crash cashout	Backend
Satranç hamlesi	Backend socket
Pişti sonucu	Backend
Klasik oyun XP	Backend
Günlük haklar	Backend
Leaderboard	Backend
Admin kritik işlem	Backend + reauth
Kullanıcı mesajı gösterimi	Frontend sadece gösterim

Frontend yalnızca kullanıcı input’u alır, backend response gösterir ve Tools mesajı basar.

⸻

18. FRONTEND YASAKLARI

Frontend kesinlikle şunları yapamaz:

* Bakiye yazamaz.
* XP yazamaz.
* Level yazamaz.
* Oyun sonucu belirleyemez.
* Bahis sonucu belirleyemez.
* Crash cashout sonucu belirleyemez.
* Promo ödülü veremez.
* Çark sonucu belirleyemez.
* Market sahipliği veremez.
* Günlük hak düşemez.
* Leaderboard sıralaması belirleyemez.
* Secret, token, private key veya admin bilgisi içeremez.
* Kullanıcıya backend message alanını doğrudan gösteremez.
* 16+ yaş doğrulamasında nihai karar veremez.

⸻

19. XP / LEVEL / EKONOMİ STANDARDI

19.1 Level

Maksimum level:

100

Level 100 XP hedefi:

4.000.000.000.000 XP

Level 100 sonrası XP verilmez.

Level 100 sonrası XP gösterimi:

MAX

MC ödülleri, bahis kazançları, market, promo ve çark işlemleri devam eder.

Prestij sistemi yoktur.

19.2 XP Hesaplama

XP yalnızca backend tarafından hesaplanır.

Frontend:

* XP hesaplayamaz.
* Level hesaplayamaz.
* Progress hesaplayamaz.
* XP değeri gönderemez.

Backend progression payload döndürür.

XP level eğrisi backend’de net formül veya tablo olarak tanımlanır.

19.3 MC Ekonomi

MC işlemleri yalnızca backend transaction ile yapılır.

Firestore MC güncellemeleri transaction ile yapılır.

Her ekonomi işleminde idempotency zorunludur.

Frontend correlation/idempotency ID gönderir.

Backend bu ID’yi doğrular, tekrar kullanımını engeller ve sonucu güvenli biçimde döndürür.

MC formatı:

31.927.827,00

XP formatı:

31927827

19.4 Ekonomi Ledger

Tüm MC/XP değişimleri global ledger koleksiyonuna yazılır.

Ledger hassas veri içermez.

Ledger alanları:

* UID
* İşlem tipi
* Tutar
* Zaman
* Idempotency key

Tam request payload, token, parola, private veri, IP veya hassas veri ledger içinde tutulmaz.

⸻

20. FIRESTORE VERİ STANDARDI

Firestore koleksiyon isimleri İngilizcedir.

Örnek koleksiyonlar:

users
usernames
ledger
auditLogs
promoClaims
wheelSpins
marketPurchases
marketInventory
adminAllowlist
announcements
systemSettings
maintenance

Kullanıcı ana doküman ID’si:

Firebase UID

Ekonomi ledger:

/ledger/{ledgerId}

Kullanıcı dokümanı örneği:

{
  "uid": "firebaseUid",
  "email": "user@example.com",
  "username": "playerName",
  "firstName": "Ad",
  "lastName": "Soyad",
  "dateOfBirth": "YYYY-MM-DD",
  "ageVerified": true,
  "emailVerified": true,
  "balance": 50000,
  "xp": 0,
  "level": 1,
  "ban": {
    "active": false,
    "message": ""
  },
  "settings": {
    "notificationSound": true
  },
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}

Promo/çark/market geçmişi:

* Kritik özet kullanıcı dokümanında tutulabilir.
* Detay global koleksiyonlarda tutulur.

Firestore index gereksinimleri final raporda yazılır.

⸻

21. REDIS STANDARDI

Redis production’da zorunludur.

Redis kullanım alanları:

* Crash global round state
* Oda lock
* Rate limit
* Idempotency lock
* Kritik runtime lock
* Bahisli oda state
* Reconnect state

Redis bağlantısı koparsa:

* Kritik oyunlar durur.
* Ekonomi işlemleri durur.
* Admin panelde kritik sistem hatası gösterilir.

Render memory, Redis yerine production kritik state kaynağı olarak kullanılamaz.

21.1 Redis TTL Standardı

Veri	TTL
Idempotency lock	24 saat
Rate limit key	Endpoint’e göre
Crash round state	1 saat
Bahisli Satranç/Pişti oda state	2 saat
Geçici lock	İşlem türüne göre kısa TTL

Stale Redis lock:

* TTL bitince otomatik düşer.
* Admin manuel temizleyebilir.

21.2 Redis Key Örnekleri

pm:crash:round:current
pm:crash:round:{roundId}
pm:game:room:lock:{roomId}
pm:game:betroom:{roomId}
pm:rate:{endpoint}:{uidOrIp}
pm:idempotency:{uid}:{operation}:{key}
pm:session:active:{uid}
pm:maintenance:state

⸻

22. RUNTIME MEMORY STANDARDI

Runtime memory kullanım alanları:

* Son kazananlar
* Geçici log
* Geçici game state
* Bildirim geçmişi
* Crash canlı tur paneli

Runtime log limiti:

3000 kayıt / 7 gün

Runtime warning/error/critical Render console’a güvenli özetle yazılır.

Successful 200 loglanmaz.

Runtime log içinde hassas veri bulunmaz.

Hassas veri gerekiyorsa yalnızca maskelenmiş olabilir.

⸻

23. API / ENDPOINT STANDARDI

23.1 Endpoint Path

Tüm API endpoint’leri /api/... altında bulunur.

API versioning kullanılır:

/api/v1/...

Health endpointleri:

/health
/api/health

Public health yalnızca ok döndürür.

Admin health detaylıdır ve admin auth ister.

23.2 API Response Formatı

Standart response formatı:

{
  "ok": true,
  "data": {},
  "message": "",
  "code": "SUCCESS"
}

Hata response örneği:

{
  "ok": false,
  "data": null,
  "message": "",
  "code": "AUTH_REQUIRED"
}

Production response içinde debug alanı dönmez.

debug yalnızca staging ortamında dönebilir.

23.3 API Hata Kodu Sözlüğü

API hata kodları merkezi sözlük ile yönetilir.

Temel hata kodları:

SUCCESS
UNKNOWN_ERROR
AUTH_REQUIRED
SESSION_EXPIRED
SESSION_CONFLICT
ACTIVE_GAME_LOGIN_BLOCKED
EMAIL_NOT_VERIFIED
AGE_REQUIRED
AGE_RESTRICTED
DATE_OF_BIRTH_REQUIRED
ACCOUNT_LOCKED
ACCOUNT_BANNED
ACCOUNT_DELETION_PENDING
ADMIN_AUTH_REQUIRED
ADMIN_REAUTH_REQUIRED
FORBIDDEN
RATE_LIMITED
CSRF_REQUIRED
VALIDATION_ERROR
USERNAME_TAKEN
EMAIL_ALREADY_EXISTS
MAINTENANCE_ACTIVE
GAME_MAINTENANCE_ACTIVE
MARKET_CLOSED
PROMO_CLOSED
WHEEL_CLOSED
INSUFFICIENT_BALANCE
IDEMPOTENCY_REPLAY
INVALID_IDEMPOTENCY_KEY
REDIS_UNAVAILABLE
ECONOMY_LOCKED
GAME_STATE_UNAVAILABLE
CRASH_ROUND_UNAVAILABLE
CASHOUT_ALREADY_PROCESSED
ROOM_NOT_FOUND
ROOM_LOCKED
RECONNECT_TIMEOUT
MATCHMAKING_COOLDOWN
ANTI_CHEAT_REJECTED
PAYLOAD_TOO_LARGE
PROMO_INVALID
PROMO_LIMIT_REACHED
WHEEL_ALREADY_USED
MARKET_ITEM_NOT_OWNED
MARKET_STOCK_UNAVAILABLE

Her hata kodunun frontend tarafında Türkçe kullanıcı mesajı map’i zorunludur.

Bilinmeyen hata kodunda kullanıcıya şu mesaj gösterilir:

İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.

Admin panel bilinmeyen hata detayını yalnızca geliştirici detayı açıldığında gösterebilir.

⸻

24. SECURITY / BACKEND STANDARDI

Backend tüm ekonomi işlemlerinde tek otoritedir.

Frontend hiçbir ödül değeri gönderemez.

Idempotency tüm kritik işlemlerde zorunludur.

Rate limit tüm kritik endpoint’lerde zorunludur.

Cookie session varsa CSRF koruması zorunludur.

Production CORS origin listesi:

https://playmatrix.com.tr
https://www.playmatrix.com.tr
https://emirhan-siye.onrender.com

Staging/preview domainleri ayrı staging ENV üzerinden yönetilir.

Production ENV’de localhost kesinlikle yasaktır.

Localhost yasağı tüm kaynak dosyalarda taranır.

Secret sanitize zorunludur.

Secret leak scan ZIP içindeki tüm text dosyalarında yapılır.

/api/client-errors endpoint’i kalır.

/api/client-errors standardı:

* Auth varsa userId bağlar.
* Auth yoksa anonim düşük limit uygular.
* Sanitize zorunludur.
* Rate limit zorunludur.
* Sensitive-data filter zorunludur.

⸻

25. AVATAR / FRAME STANDARDI

25.1 Genel Kural

Avatar/frame sistemi tek merkezi render motoruyla çalışır.

Render motoru frontend merkezi modüldedir.

Sahiplik ve izin backend tarafından doğrulanır.

AnaSayfa üst barında frame yasaktır.

Oyun üst barlarında avatar + frame her zaman açıktır.

Oyun topbar frame kapatma kesin yasaktır.

25.2 Admin Ayarları

Admin yalnızca şunları değiştirebilir:

* scale
* offset
* padding
* hizalama

Admin container boyutu değiştiremez.

Mobil ve desktop için ayrı ayar yoktur. Tek ayar kullanılır.

Frame ayarları versiyonlu config ile yayılır.

25.3 Variantlar

Oyun topbar variantları:

crashTopbar
chessTopbar
pistiTopbar
snakeTopbar
spaceTopbar
patternTopbar

Diğer variantlar:

leaderboard
accountModal
accountProfileCard
marketCard
crashLivePanel
crashWinNotice
chessGameCard
pistiScoreCard

25.4 Frame Seviyesi

Seviye frame sistemi frame-1 ile frame-18 arasında kalır.

Level frame ve market frame ayrı kategorilerdir.

Frame envanteri ayrı sekmelere sahiptir:

* Level Frame
* Market Frame

Level düşerse level frame tekrar kilitlenir.

Market frame satın alındıktan sonra kalıcıdır.

Locked frame gösterilebilir; fakat tıklanamaz.

Kullanıcı sahip olmadığı frame’i seçemez.

Frame seçimi backend’de doğrulanır.

Avatar kategorileri:

emoji
female
male
flags

Kullanıcı avatar yükleyemez.

Sadece hazır avatarlar kullanılabilir.

Telif riskli avatarlar kesin yasaktır.

⸻

26. MARKET STANDARDI

Market aktif sistemdir.

Para birimi:

MC

Aktif satış kategorisi:

Frame

Diğer kategoriler “Yakında” etiketiyle görünebilir; ancak tıklanamaz ve satın alınamaz.

Yakında kategorileri:

* İstatistik Teması
* Rozet
* Animasyonlu İsim Efekti

Yakında kategorileri admin panelden gizlenebilir.

Avatar satışı aktif değildir.

Market kuralları:

* Satın alma backend transaction ile yapılır.
* İdempotency zorunludur.
* Global stok desteklenir.
* Kullanıcı başı limit desteklenir.
* Ürünler admin panelden eklenebilir.
* Frame fiyatları admin panelden değişebilir.
* Fiyat değişimi mevcut sahipliği etkilemez.
* Kullanıcı sahip olmadığı ürünü aktif etmeye çalışırsa backend reddeder.
* Market kapalıysa market tamamen kilitlenir.
* Market kapalıyken sahip olunan frame seçilemez.
* Market iadesi admin + reauth + audit ile yapılır.
* İadede ürünün kaldırılıp kaldırılmayacağını admin seçer.

⸻

27. PROMO STANDARDI

Promo admin tarafından açılıp kapatılabilir.

Promo kapalıysa modal açılmaz, Tools mesajı çıkar.

Promo türleri:

* MC
* XP
* Market çerçeve
* Oyun hakkı
* Promo

Kurallar:

* Promo kullanmak için e-posta doğrulama zorunludur.
* Doğum tarihi ve 16+ uygunluğu zorunludur.
* Kullanıcı başı limit desteklenir.
* Başlangıç/bitiş tarihi desteklenir.
* Minimum/maximum level şartını admin belirleyebilir.
* Promo oluşturma kritik admin işlemidir.
* Promo claim idempotency zorunludur.
* Promo sonucu Tools mesajı ile gösterilir.
* Promo ödülü client tarafından verilemez.
* Promo kodları case-sensitive değildir.
* AnaSayfa promo input küçük harf yazılsa bile otomatik büyük harfe çevirir.
* Promo tahmin saldırılarına karşı rate limit + lockout + audit event uygulanır.

⸻

28. ÇARK STANDARDI

Çark admin tarafından açılıp kapatılabilir.

Çark kapalıysa modal açılmaz, Tools mesajı çıkar.

Çark sonucu backend belirler.

Ödül tipleri:

* MC
* XP
* Boş

Günlük hak:

1

Reset saati:

Europe/Istanbul 00:00

Kurallar:

* Çark kullanmak için e-posta doğrulama zorunludur.
* Doğum tarihi ve 16+ uygunluğu zorunludur.
* Ödül havuzu admin panelden düzenlenir.
* Ağırlık sistemi hem oran hem ihtimal olarak gösterilir.
* Boş ödül oranı için sistem güvenli min/max sınır koyar.
* Claim idempotency zorunludur.
* Sonuç son kazananlara düşebilir.
* Client-side çark sonucu kabul edilmez.
* Hak kullanıldıktan sonra bağlantı koparsa backend sonucu kaydeder.
* Kullanıcı tekrar açınca kayıtlı sonuç gösterilir.

⸻

29. ADMIN PANEL GENEL STANDARDI

Admin panel daha modüler hale getirilir.

Tasarım kimliği korunur, güçlendirilir ve profesyonelleştirilir.

Admin panel:

* Mobilde kullanılabilir olur.
* Desktop ve tablet desteğini korur.
* Tüm işlemler mobil uyumlu olur.
* 4 adımlı giriş sistemi korunur.
* Tek admin sistemi kullanır.
* Rol sistemi yoktur.
* Tek admin aynı zamanda owner sayılır.
* Kritik işlemler Firebase hesabına kayıtlı şifreyle doğrulanır.
* Kritik işlem modalı işlem modalının üstünde açılır.
* X butonu her zaman çalışır.
* Vazgeç butonu her zaman çalışır.
* Doğrula butonu gerçek doğrulama işlemini başlatır.
* Modal içi scroll kullanılır.
* Body kilitlenir.
* Mobil browser alt bar dikkate alınır.

Bozuk yönetim modalları yeniden yazılır.

Çalışan modallar gereksiz yere sıfırlanmaz.

Admin ikinci doğrulama geçerlilik süresi:

5 dakika

Bu süre tüm kritik işlemler için ortak geçerlidir.

⸻

30. ADMIN ALLOWLIST STANDARDI

Admin allowlist hybrid çalışır.

* Firestore ana kaynaktır.
* ENV yalnızca ilk kurulum admini için kullanılır.
* ENV sadece Firestore allowlist boşsa çalışır.
* Admin allowlist değişimi kritik işlemdir.
* Admin allowlist değişimi reauth ister.
* Admin allowlist değişimi audit’e yazılır.

⸻

31. ADMIN AUDIT STANDARDI

Admin audit retention:

6 ay

Audit kalıcı denetim kaydıdır.

Runtime log temizlenebilir.

Audit temizlenemez.

Audit içinde hassas veri bulunmaz.

Audit kayıtlarında şunlar yasaktır:

parola
token
admin secret
hash
salt
private key
service account
doğrulama kodu
tam doğum tarihi

Kullanıcı silme hard delete audit kaydı:

* Maskelenmiş e-posta
* UID
* İşlem özeti

Hard delete sonrası ayrıca anonimleştirilmiş işlem kaydı kalır.

⸻

32. ADMIN YÖNETİM MODALLARI

Zorunlu modallar:

1. Toplu Durum Sıfırlama
2. Bakım Modu
3. Crash Kontrolü
4. Çark Kontrolü
5. Market Kontrolü
6. Kullanıcı Kısıtlama
7. Kullanıcı Ödülü
8. Tüm Kullanıcılara MC Ödülü
9. Promosyon Kodu
10. Kullanıcı Bilgileri
11. Hata Takip Merkezi

Çalışmayan buton, bozuk X, bozuk doğrulama, arka planda açılan reauth modalı, eski selector, eski modal tasarımı, duplicate event listener veya işlem yapmayan kaydet butonu kalmaz.

⸻

33. TOPLU DURUM SIFIRLAMA

Toplu sıfırlama destekleri:

* Tek kullanıcı
* Seçili kullanıcılar
* Tüm kullanıcılar
* Test kullanıcıları hariç filtre

Preview zorunludur.

Etkilenecek kullanıcı sayısı gösterilir.

Audit zorunludur.

Sıfırlanabilir alanlar:

* Bakiye
* Seviye
* XP
* Avatar
* Avatar + çerçeve
* Çerçeve
* Market aktif ürünleri
* Kullanıcı Firebase koleksiyonları
* Aktiflik puanı
* Liderlik sıralaması
* Günlük çark hakları
* Promo kullanım geçmişi
* Oyun günlük hakları
* Klasik oyun günlük XP limitleri
* Crash aktif bahis durumları
* Satranç/Pişti açık oda durumları
* Bildirim geçmişi
* Runtime kullanıcı state kayıtları

⸻

34. BAKIM MODU

Bakım modu kapsar:

* Genel sistem
* Crash
* Satranç
* Pişti
* Pattern Master
* Space Pro
* Snake Pro
* Market
* Çark
* Promo

Bakım mesajları oyun/sistem alanına göre sabittir.

Admin özel bakım mesajı yazmaz.

Bakım aktifse:

* Modal açılmaz.
* Oyun direct URL ile açılmaz.
* Frontend engeli uygulanır.
* Server-side engel uygulanır.
* Kullanıcıya Tools mesajı gösterilir.
* Teknik hata gösterilmez.

Genel bakım aktifken admin panel açık kalır.

Bakım sırasında açık oyunlar:

* Hemen sonlandırılır.
* Kullanıcı AnaSayfa’ya yönlendirilir.
* Bakım mesajı gösterilir.
* Bakiyeler iade edilir.
* XP verilmez.

⸻

35. ADMIN HATA TAKİP MERKEZİ

Hata Takip Merkezi kalır.

Backend ve frontend hataları ayrı gösterilir.

Varsayılan sıralama:

1. Kritik
2. Hata
3. Uyarı

Aynı seviyede yeni tarih önce gösterilir.

Geliştirici detayı varsayılan kapalıdır.

HTTP status kodu yalnızca Hata Takip Merkezi detayında görünür.

Beklenen auth gate 401/403 düşük öncelik event olarak gösterilebilir.

Admin 403 kullanıcı dostu mesaj:

Bu işlem için yönetici doğrulaması gerekiyor.

Detayda status 403 görünebilir.

Redis unavailable admin panelde kritik sistem hatası olarak gösterilir.

⸻

36. ADMIN AUDIT VE RUNTIME LOG AYRIMI

Alan	Nerede Tutulur	Amaç
Kritik admin işlemleri	Firestore audit	Kalıcı denetim
Runtime hatalar	Render memory	Geçici hata takibi
Bildirim geçmişi	Render memory	Geçici kullanıcı bildirimi
Son kazananlar	Render memory	Canlı görünüm
Kritik runtime lock/state	Redis	Production stabilite
Game state	Redis + gerekli kalıcı veri	Oyun stabilitesi
Ekonomi ledger	Firestore ledger	Bakiye/XP denetimi

⸻

37. KULLANICI YÖNETİMİ

Admin kullanıcıyı yönetebilir.

Desteklenen işlemler:

* Kullanıcı arama
* UID / e-posta / kullanıcı adı görüntüleme
* Doğum tarihi + yaş görüntüleme
* Bakiye görüntüleme
* XP / level görüntüleme
* Ban / unban
* Yaş kilidi kaldırma
* Kullanıcı oyun geçmişi
* Market envanteri
* Promo geçmişi
* Çark geçmişi
* E-posta değiştirme
* Doğum tarihi değiştirme
* Kullanıcı silme

Kullanıcı silme hard delete olarak çalışır.

Hard delete:

* Kritik işlem sayılır.
* Reauth ister.
* Audit’e yazılır.
* Geri alınamaz uyarısı gösterir.

Banlı kullanıcı oyunlara giremez.

Ban mesajını admin yazabilir.

⸻

38. CRASH STANDARDI

38.1 Genel Karar

Crash tasarımı tamamen yenilenmez.

UI temizlenir, stabilize edilir ve eski kod kalıntıları temizlenir.

Üst bar etiketi:

CRASH

38.2 Bahis Limitleri

Minimum bahis:

1 MC

Public max bahis:

10.000.000 MC

Hidden hard risk:

Default 100.000.000 MC

Hidden hard risk admin panelden değiştirilebilir.

Hidden hard risk yalnızca owner tarafından değiştirilebilir.

Tek admin aynı zamanda owner sayılır.

Auto cashout minimum:

2.00x

Manual cashout XP alt sınırı:

1.50x

38.3 XP

Crash XP formülü:

1000 MC = 50 XP

Kaybeden gerçek Crash bahsi XP verir.

Crash XP günlük cap yoktur.

38.4 Global Round

Crash global round zorunludur.

Crash global round state Redis ile tutulur.

Kurallar:

* Tüm kullanıcılar aynı round state’i görür.
* Round sonucu backend belirler.
* Client multiplier yalnızca görsel temsil yapar.
* Cashout backend tarafından hesaplanır.
* Idempotency zorunludur.

38.5 Risk Motoru

Crash multiplier admin ayarlı risk motoru ile belirlenir.

Risk motoru yalnızca admin panelde görünür.

Kullanıcıya açıklanmaz.

Admin multiplier sonucunu manuel değiştiremez.

38.6 Cashout Gecikme Standardı

Client tıklama zamanını correlationId ile gönderir.

Backend bunu doğrular ve round state ile güvenli şekilde değerlendirir.

Amaç kullanıcı aleyhine gecikmeyi azaltmaktır.

Client kazanç yazamaz.

Cashout correlationId replay olursa:

* Önceki sonuç döndürülür.
* Şüpheli audit event yazılır.

38.7 Crash Bildirimleri

Crash bildirim standardı:

* Kritik hata Tools toast kullanır.
* Cashout/kazanç özel Crash bildirimi kullanır.
* Cashout bildirimi avatar + MC + X + XP gösterir.
* Tek aktif Crash bildirimi gösterilir.
* Cashout bildirimi 5 saniyede otomatik kapanır.
* Aynı cashout iki kez bildirim üretmez.
* Aynı cashout iki kez MC/XP işlemez.

38.8 Canlı Tur Paneli

Canlı Tur Paneli yalnızca oyuncu cashout/loss kayıtlarını gösterir.

Maksimum kayıt:

1000

Depolama:

Render memory

Crash round geçmişi kalıcı tutulmaz; yalnızca memory kullanılır.

38.9 Kurallar Modalı

Crash kurallar modalı bottom sheet olarak açılır.

38.10 Intro / Retry

Crash intro timeout:

12 saniye

Retry butonu:

* State reload yapar.
* Socket reconnect başlatır.

38.11 Aktif Round Bahis

Aktif round sırasında bahis yapılırsa bahis sonraki rounda yazılır.

Bakiye düşümü round başlarken yapılır.

İptal:

Round başlamadan önce iptal edilebilir.

⸻

39. SATRANÇ STANDARDI

39.1 Genel Karar

Satranç tasarımı korunur.

Responsive güçlendirilir.

Backend-authoritative socket zorunludur.

39.2 Bot

Bot modu ekonomi üretmez.

Bot:

* MC vermez.
* XP vermez.
* Level ilerletmez.
* Bahisli oyuna katılamaz.
* Public lobby’de normal oda gibi görünmez.

Bot hamle gecikmesi:

3 saniye

Bot zorluğu admin panelden global ayarlanır.

Bot zorluk seviyeleri:

Normal
Orta
Zor
Ultra Zor
Plus Zor
Pro Zor
Pro Plus+++ Zor

39.3 Bahissiz Satranç

Kazanç:

5.000 MC

Günlük hak:

10

Aynı rakibe karşı ödüllü galibiyet limiti:

3

XP yoktur.

Kötüye kullanım önlemi:

* Aynı cihaz
* IP
* Hesap grubu

kontrolü yapılır.

Kullanıcıya sade limit mesajı gösterilir.

Admin panelde detay görünür.

39.4 Bahisli Satranç

Min/max:

1.000 MC - 1.000.000 MC

XP:

1000 MC = 50 XP

Beraberlik:

* Yarım iade
* Kalan yanar
* XP yok

Reconnect:

90 saniye

Kullanıcı bilerek çıkarsa 90 saniye beklenir. Dönmezse kayıp uygulanır.

Reconnect ekranı:

* Geri sayım
* Hükmen kazanma/kaybetme bilgisi

gösterir.

Bahisli oda state’i restart sonrası korunur.

39.5 Süreli Oyun

Default süre:

10 dakika

Admin panelden ayarlanabilir.

39.6 Beraberlik Teklifi

Beraberlik teklifi 20 hamleden sonra aktif olur.

39.7 Oda Listesi

Oda listesi socket ile güncellenir.

Fallback 30 saniyedir.

Bahisli oyunlarda eşleşme manipülasyonuna karşı cooldown uygulanır.

39.8 Mobil Tahta

Satranç mobil tahtası ekrana tam sığar.

Hamle sesi zorunludur; ses yüklenemezse oyun bozulmaz.

⸻

40. PİŞTİ STANDARDI

Pişti Satranç ekonomi standardıyla aynı kalır.

Bahissiz kazanç:

5.000 MC

Günlük haklar Satranç’tan ayrıdır.

Bahis min/max:

1.000 MC - 1.000.000 MC

XP:

1000 MC = 50 XP

Beraberlik:

* Yarım iade
* Kalan yanar
* XP yok

Pişti reconnect süresi Satranç ile aynıdır:

90 saniye

Pişti bot modu vardır; fakat bot oyunu MC/XP üretmez.

Pişti aktif çıkışta 90 saniye beklenir.

Kullanıcı dönmezse kayıp uygulanır.

Pişti oyun sonucunu backend belirler.

Pişti oda süresi Satranç ile aynıdır.

Pişti ücretsiz modda XP yoktur.

Aynı rakip ödüllü galibiyet limiti:

3

Pişti lobi tasarımı Satranç standardına benzer.

Kart animasyonları çok gösterişli olabilir; ancak performans bozulmaz.

Bahisli Pişti oda state’i restart sonrası korunur.

Bahisli oyunlarda eşleşme manipülasyonuna karşı cooldown uygulanır.

⸻

41. KLASİK OYUNLAR STANDARDI

Aktif klasik oyunlar:

* Pattern Master
* Space Pro
* Snake Pro

Klasik oyunlarda MC ödülü yoktur.

Günlük toplam klasik XP cap:

100.000 XP

Oyun başı tek oturum XP cap:

Pattern Master: 1000 XP
Space Pro: 1000 XP
Snake Pro: 1000 XP

Backend nonce zorunludur.

Nonce oyun oturumu bitene kadar geçerlidir.

Offline oynama yoktur.

Oyun sonucu modalı vardır.

Skor submit oyun bitince otomatik yapılır.

Backend doğrulama:

* Skor
* Süre
* Event timeline

üzerinden yapılır.

Event timeline için maksimum payload boyutu zorunludur.

Payload çok büyükse backend reddeder.

Anti-cheat toleransı orta seviyededir.

Bağlantı kopması pause hakkı tüketmez.

Reconnect ayrı değerlendirilir.

41.1 Space Pro

Mevcut hali korunup geliştirilir.

Mobil kontrol:

* Sağ buton
* Sol buton

Can sayısı:

5

Pause sadece Space/Snake için vardır ve max 3 kez kullanılabilir.

41.2 Snake Pro

Snake Pro çalışmıyorsa önce raporlanır.

Snake Pro yeniden yazma için ayrıca şu açık onay gerekir:

Snake Pro yeniden yazılsın

Kontrol:

* D-pad
* Swipe

Hız artışı skora göre kademeli olur.

Pause sadece Space/Snake için vardır ve max 3 kez kullanılabilir.

41.3 Pattern Master

Görsel dil:

Premium Matrix

Input:

* Buton
* Klavye

birlikte çalışır.

Sonuç ekranında XP formülü değil, sadece özet gösterilir.

⸻

42. MATCHMAKING / ANTI-ABUSE STANDARDI

Bahissiz ödüllü oyunlarda ve bahisli eşleşmelerde kötüye kullanım kontrolü yapılır.

Kontrol alanları:

* Aynı cihaz
* IP
* Hesap grubu
* Aynı rakip tekrarları
* Eşleşme cooldown
* Olağan dışı oyun süresi
* Olağan dışı skor davranışı

Admin panelde detaylı görünür.

Kullanıcıya teknik detay gösterilmez.

Kullanıcıya sade ve dostu limit mesajı gösterilir.

⸻

43. RENDER / DEPLOY STANDARDI

Render build command:

npm install

Start command:

npm start

Node version:

22 LTS

package.json içinde start script bulunur:

{
  "scripts": {
    "start": "node server.js"
  }
}

Health endpoint bulunur:

/health
/api/health

Loglar Render console’a güvenli özetle düşer.

Successful 200 loglanmaz.

npm audit uyarıları rapora yazılır.

High risk npm audit için:

* Kod uygulama onayı varsa güvenli patch uygulanabilir.
* Onay yoksa sadece raporlanır.
* Major/breaking update onaysız yapılmaz.

Deploy sonrası manuel kontrol listesi zorunludur.

Render ENV değerleri raporda açık yazılmaz; sadece isimleri yazılabilir.

Backend URL:

https://emirhan-siye.onrender.com

Frontend domainleri:

https://playmatrix.com.tr
https://www.playmatrix.com.tr

Firebase Admin SDK service account ENV parser iki formatı da destekler:

* Single-line JSON
* Base64 JSON

Firebase Storage kullanılmaz.

Kullanıcı upload sistemi yoktur.

⸻

44. FIREBASE / RENDER ENV STANDARDI

Render ENV içinde değerler final raporda açık yazılmaz.

Sadece ENV isimleri yazılabilir.

Production ortamında localhost yasaktır.

Firebase Admin SDK service account yalnızca backend ENV’de tutulur.

Frontend içinde service account, private key, admin secret, token veya benzeri hassas veri bulunamaz.

Örnek ENV isimleri:

NODE_ENV
LOG_LEVEL
PUBLIC_BASE_URL
CANONICAL_ORIGIN
PUBLIC_BACKEND_ORIGIN
PUBLIC_API_BASE
ALLOWED_ORIGINS
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_KEY
REDIS_URL
SESSION_SECRET
ADMIN_EMAILS

ENV değerleri asla açık raporlanmaz.

⸻

45. REPO TEMİZLİK STANDARDI

Temizlenecekler:

* Debug console kalıntıları
* Yorum satırına alınmış eski kodlar
* Duplicate CSS blokları
* Boş klasörler
* Eski sosyal/DM/chat kalıntıları
* Eski phase isimleri
* Kullanılmayan JS/CSS/HTML parçaları
* Ölü importlar
* Kullanılmayan assetler
* Eski backup/test/debug/demo yapıları

Kullanılmayan assetler yalnızca ayrıca onay sonrası silinir.

Final ZIP dosya ağacı raporu zorunludur.

⸻

46. TEST / KALİTE KAPISI

Kod uygulaması sonrası yapılacak kontroller:

* node --check
* JSON parse kontrolü
* CSS brace kontrolü
* HTML temel yapı kontrolü
* Asset path kontrolü
* Route kayıt kontrolü
* Secret leak scan
* Final ZIP bütünlük testi
* package.json kontrolü
* Backend endpoint kontrolü
* Admin route yetki kontrolü
* Client error endpoint kontrolü
* Oyun bakım modu yönlendirme kontrolü
* Market/çark/promo kapalıyken modal açılmama kontrolü
* Crash cashout akışı kontrolü
* Oyun topbar avatar/frame kontrolü
* Tools mesaj sistemi kontrolü
* Redis zorunlu servis kontrolü
* Firestore index gereksinim kontrolü

Final ZIP bütünlük testi şunları içerir:

* Dosya ağacı
* Yasak dosya taraması
* Syntax kontrolü
* Asset path kontrolü

Kod değişince test başarısız olursa ZIP teslim edilmez.

Kod değişti ancak bazı testler araç eksikliği nedeniyle çalıştırılamadıysa ZIP verilebilir; çalıştırılamayan testler açıkça yazılır.

Test raporu:

* Kritikler detaylı
* Başarılı kontroller özet

şeklinde yazılır.

⸻

47. MINIMUM PRODUCTION KABUL KRİTERLERİ

PlayMatrix production kabulü için minimum şartlar:

1. Frontend economy yazımı yok.
2. Backend transaction economy çalışıyor.
3. Idempotency kritik işlemlerde uygulanıyor.
4. Redis production’da bağlı ve zorunlu.
5. Crash global round Redis state ile çalışıyor.
6. Firestore kullanıcı/ledger/audit ayrımı doğru.
7. Admin kritik işlemler reauth istiyor.
8. Admin audit hassas veri içermiyor.
9. Kullanıcı teknik hata görmüyor.
10. Tools merkezi queue çalışıyor.
11. Doğum tarihi ve 16+ backend doğrulaması var.
12. E-posta doğrulama ödüllü işlemler için zorunlu.
13. Bakım direct URL ile bypass edilemiyor.
14. Market/çark/promo kapalıyken modal açılmıyor.
15. Oyun topbar avatar+frame açık.
16. AnaSayfa topbar frame kapalı.
17. Desktop kullanıcı sitesi engeli çalışıyor.
18. Admin panel mobil/desktop/tablet çalışıyor.
19. Secret leak scan temiz.
20. Final ZIP içinde yasak dosya yok.

⸻

48. FINAL TESLİM STANDARDI

Kod değiştiyse final teslimde ZIP linki zorunludur.

Kod değiştiyse final ZIP otomatik üretilir.

Test başarısızsa ZIP teslim edilmez.

Final ZIP adı sürümlü olur:

PLAYMATRIX-V1.zip
PLAYMATRIX-V2.zip
PLAYMATRIX-V3.zip

Final teslimde yazılacaklar:

1. ZIP indirme bağlantısı
2. Güncellenen dosyalar
3. Eklenen dosyalar
4. Silinen dosyalar
5. Yeniden yazılan alanlar
6. Yeniden yazma sebepleri
7. Temizlenen gereksiz dosyalar
8. Yapılan test/kontrol sonuçları
9. Çalıştırılamayan testler
10. Bilinen kalan riskler
11. Manuel Render/Firebase ayarları
12. Firestore index gereksinimleri
13. Kısa dosya ağacı
14. Tam değişim listesi

Dosya yoksa:

Eklenen dosyalar: Yok
Silinen dosyalar: Yok

Güncellenen her dosya için sebep yazılır.

Bilinen kalan risk yoksa yalnızca gerçekten doğruysa şu ifade yazılır:

Bilinen kalan risk yok

Manuel Render/Firebase ayarlarında ENV isimleri yazılır; değerler yazılmaz.

⸻

49. KESİN YASAKLAR

Kesin yasaklar:

* Client-side bakiye yazımı
* Client-side XP yazımı
* Client-side level yazımı
* Client-side oyun sonucu
* Client-side bahis sonucu
* Client-side Crash cashout sonucu
* Client-side promo ödülü
* Client-side çark sonucu
* Client-side market sahipliği
* Frontend secret
* Frontend private key
* Frontend admin bilgisi
* README/MD final ZIP
* .npmrc final ZIP
* Hamburger menü kullanıcı sitesi
* AnaSayfa topbar frame
* Oyun topbar frame kapatma
* Runtime log içine açık hassas veri yazma
* Admin kritik işleminde reauth atlama
* Sosyal/DM/chat/davet sistemini geri getirme
* Misafir oyun akışı
* Bakım modunu direct URL ile bypass
* Sahte test sonucu
* Sahte Render log satırı
* Tahmini satır numarası
* Dosyada olmayan kodu varmış gibi gösterme
* Kullanıcıya yanlış başarı mesajı
* Kullanıcıya yanlış hata mesajı
* Backend message alanını kullanıcıya doğrudan gösterme
* Production API response içinde debug döndürme
* Redis olmadan production kritik oyun/ekonomi çalıştırma
* 16 yaş altı kullanıcıya kayıt/oyun akışı açma
* Doğum tarihini audit içinde tam tarih olarak yazma
* MC’yi gerçek para karşılığı gibi sunma
* Kullanıcı upload avatar sistemi
* Telif riskli avatar kullanımı
* Crash multiplier sonucunu admin manuel değiştirme
* Onaysız Snake Pro yeniden yazımı
* Onaysız büyük modüler refactor
* Onaysız kullanılmayan asset silme

⸻

50. KISA NİHAİ KARAR TABLOSU

Alan	Nihai Karar
Protokol adı	PLAYMATRIX NİHAİ PROTOKOL
Kapsam	Sadece PlayMatrix
Eski protokoller	Tamamen geçersiz
Protokol onayı	EVET protokolü güncelle
Kod onayı	Sadece “EVET uygula”
Kod onayı duyarlılığı	Birebir, büyük/küçük harf duyarlı
ZIP varsayılan mod	Onaysız tam rapor, değişiklik yok
Kapsamsız EVET uygula	Sadece kritik rapor maddeleri
Final ZIP	Kod değiştiyse otomatik
Test başarısızsa ZIP	Verilmez
Araç eksikliğiyle çalışmayan test	Açık yazılır, ZIP verilebilir
Kök yapı	5 ana dosya + public/admin/games/assets
Admin klasörü	/admin
Oyun klasörü	/games/
Asset yapısı	images/icons/audio/frame/avatar
Kullanıcı sitesi	Telefon + tablet
Desktop kullanıcı	QR + mobil yönlendirme
Desktop engeli	1024px + user-agent/screen-width
PWA	Var
Kullanıcı hamburger	Yasak
Admin hamburger	Mobilde olabilir
Aktif oyunlar	Crash, Satranç, Pişti, Pattern, Space, Snake
Misafir kullanıcı	Yok
Auth	Firebase Auth + backend session doğrulama
Tek aktif session	Var
Kullanıcı session	7 gün
Admin session	1 saat
Yeni cihaz login	Eski oturum düşer
Aktif oyunda yeni login	Engellenir
Yaş sınırı	16+
Doğum tarihi	Gün/Ay/Yıl select zorunlu
Eski hesap DOB yoksa	Giriş var, oyun/market/çark/promo kilitli
Under 16 eski hesap	Kilitlenir, admin açabilir
DOB değişimi	Admin + reauth + audit
Kullanıcı silme talebi	7 gün bekleme
Silme iptali	Kullanıcı iptal edebilir
Aynı e-posta reuse	15 gün sonra
Kullanıcı adı reuse	15 gün sonra
MC formatı	31.927.827,00
Level max	100
Level 100 XP	4.000.000.000.000
Level 100 sonrası	MAX
Prestij	Yok
Ekonomi	Backend transaction
Ledger	Global Firestore ledger
Ledger veri	UID, tip, tutar, zaman, idempotency
Firestore koleksiyon dili	İngilizce
User doc ID	Firebase UID
Redis	Production zorunlu
Redis yoksa	Kritik oyun/ekonomi durur
Redis kullanım	Crash, lock, rate limit, idempotency
Idempotency TTL	24 saat
Crash Redis TTL	1 saat
Bahisli oda TTL	2 saat
Runtime log	3000 kayıt / 7 gün
Bildirim geçmişi	Memory, kullanıcı başı 20
Son kazananlar	Varsayılan 5, admin ayarlı
API path	/api/v1/…
API response	{ ok, data, message, code }
Kullanıcı mesajı	code map üzerinden Türkçe
Unknown error	İşlem şu anda tamamlanamadı…
Debug response	Sadece staging
Public health	Sadece ok
Admin health	Detaylı
Market aktif ürün	Frame
Market frame	Kalıcı
Level frame	Level düşerse kilitlenir
Market kapalıysa	Tamamen kilitli
Promo code	Auto uppercase, case-insensitive
Çark disconnect	Backend sonucu saklar
Çark boş oranı	Güvenli min/max
Bildirim sesi	Kullanıcı aç/kapat, cihaz sessize saygı
Tools konum	Üst merkez
Tools süre	3-8 saniye
Admin duyuru	Geçici/kalıcı seçilebilir
Zorunlu duyuru	Kapatılsa da tekrar görünür
Admin sistemi	Tek admin
Owner	Tek admin owner sayılır
Admin rol	Yok
Admin login	4 adım
Admin reauth	5 dakika ortak
Audit retention	6 ay
Runtime log temizleme	Var
Audit temizleme	Yok
Crash state	Redis
Crash risk motoru	Admin panelde görünür
Crash multiplier manuel değişim	Yasak
Crash bahis düşümü	Round başlarken
Crash history	Kalıcı değil, memory
Satranç/Pişti bot zorluğu	Admin global
Bot seviyeleri	Normal, Orta, Zor, Ultra Zor, Plus Zor, Pro Zor, Pro Plus+++ Zor
Satranç bahis	1.000 - 1.000.000 MC
Pişti bahis	1.000 - 1.000.000 MC
Reconnect	90 sn
Bahisli oda restart	Korunur
Pişti beraberlik	Yarım iade + kalan yanar
Klasik günlük XP cap	100.000
Klasik oyun başı cap	1000 XP
Klasik doğrulama	Skor + süre + event timeline
Snake rewrite	Ayrı “Snake Pro yeniden yazılsın” onayı
Bakım açık oyun	Biter, iade, XP yok
Node version	22 LTS
Start command	npm start
Health	/health ve /api/health
Firebase service account	JSON + Base64 parser
Firebase Storage	Kullanılmaz
User upload	Yok
KVKK/Şartlar	Ayrı sayfalar
Kayıt onayları	Şartlar + KVKK + MC sanal puan
MC açıklaması	Kayıt, market, çark, promo
Final ZIP adı	PLAYMATRIX-V1.zip, V2, V3

⸻

51. SON HÜKÜM

Bu PLAYMATRIX NİHAİ PROTOKOL, PlayMatrix için güncel bağlayıcı production çalışma standardıdır.

PlayMatrix artık:

* Mobil/tablet öncelikli kullanıcı sitesi,
* desktop/tablet/mobil uyumlu admin panel,
* backend-authoritative ekonomi,
* backend XP/level,
* Firestore ledger,
* Redis zorunlu runtime state,
* tek Tools mesaj sistemi,
* güvenli runtime log,
* minimum Firestore kalıcı veri,
* markette yalnızca aktif Frame satışı,
* admin kontrollü promo/çark,
* oyun topbarlarında zorunlu avatar + frame,
* AnaSayfa topbarında framesiz avatar,
* direct URL bakım engeli,
* 16+ doğum tarihi doğrulaması,
* KVKK/Kullanım Şartları kabulü,
* güvenli final ZIP teslim standardı

üzerinden ilerleyecektir.

Hiçbir hata gizlenmez.

Hiçbir sahte başarı yazılmaz.

Hiçbir hassas bilgi açığa çıkarılmaz.

Hiçbir client-side economy / XP / ödül / oyun sonucu otoritesi kabul edilmez.

Final teslimler yalnızca gerçek değişiklik listesi, gerçek test/kontrol sonucu ve gerekiyorsa ZIP bağlantısı ile yapılır.