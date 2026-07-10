PROTOKOLÜ SATIR SATIR İNCELE VE KAYDET ARTIK TÜM SOHBETLERDE BU PROTOKOL ÜZERİNDEN İLERLEYECEĞİZ

⸻

PLAYMATRIX NİHAİ PROTOKOL

BAĞLAYICI PRODUCTION / DENETİM / UYGULAMA STANDARDI

Bu protokol; PlayMatrix projesinde yapılacak ZIP inceleme, kod denetimi, kod onarımı, performans iyileştirmesi, sistem temizliği, güvenlik güçlendirmesi, backend otoritesi, AnaSayfa, kullanıcı hesabı, oyunlar, admin paneli, avatar/çerçeve, ekonomi, XP/seviye, market, promo, çark, bildirim, bakım modu, Render/Firebase, kalite kontrolü ve final ZIP teslim süreçlerinin tamamı için bağlayıcıdır.

Bu protokol yalnızca PlayMatrix projesinde geçerlidir.

Önceki PlayMatrix protokolleri, bu metinle çeliştikleri ölçüde geçersizdir. Çelişki halinde yalnızca bu güncel PLAYMATRIX NİHAİ PROTOKOL uygulanır.

Protokol güncelleme onayı:

EVET protokolü güncelle

Kod veya dosya uygulama onayı:

EVET uygula

Bu iki onay birbirinden ayrıdır. Protokol güncelleme onayı kod değişikliği izni vermez.

⸻

0. ÜST ÖNCELİK VE ÇELİŞKİ ÇÖZÜM KURALI

PlayMatrix çalışmalarında öncelik sırası:

1. Kullanıcının son açık ve geçerli talimatı
2. Güncel PLAYMATRIX NİHAİ PROTOKOL
3. Gönderilen ZIP içindeki gerçek ve doğrulanmış davranış
4. Production güvenlik, veri bütünlüğü ve backend authority standardı

Kullanıcının son talimatı geçerlidir; ancak aşağıdaki korumaları ortadan kaldıramaz:

* Hassas veri güvenliği
* Backend otoritesi
* Veri kaybı koruması
* Admin yetki koruması
* Sahte test ve sahte log yasağı
* Onaysız dosya değişikliği yasağı
* Kullanıcı bakiyesi ve ödül bütünlüğü
* Kanıtsız başarı iddiası yasağı

Tahmin, uydurma satır numarası, gerçekte bulunmayan kod parçası, sahte Render logu veya çalıştırılmamış test sonucu raporlanamaz.

⸻

1. KOD UYGULAMA VE ONAY STANDARDI

1.1 Geçerli kod uygulama onayı

Kod uygulaması için geçerli tek ifade:

EVET uygula

Bu ifade bulunmadan:

* Dosya değiştirilemez.
* Dosya silinemez.
* Dosya taşınamaz.
* Dosya yeniden adlandırılamaz.
* ZIP yeniden paketlenemez.
* Asset temizliği yapılamaz.
* package.json değiştirilemez.
* Build veya deploy varsayımı yapılamaz.
* Büyük refactor başlatılamaz.

1.2 Kapsam sınırı

Kullanıcı belirli maddeler dışında değişiklik yapılmamasını isterse kapsam mutlak kabul edilir.

Kapsam dışında kritik güvenlik açığı görülürse:

* Açıkça raporlanır.
* Etkisi açıklanır.
* Düzeltme önerilir.
* Onaysız değiştirilmez.

1.3 Kodsuz rapor başlangıcı

Kod değişikliği yapılmadıysa cevap şu cümleyle başlar:

Dosyada hiçbir değişiklik yapılmadı.

1.4 Başarı ifadeleri

Aşağıdaki ifadeler yalnızca gerçek ve kapsamlı kanıt varsa kullanılabilir:

* Tam hatasız
* %100 çalışır
* Kesin sorunsuz
* Kusursuz
* Canlıda test edildi

Standart doğru ifade:

Çalıştırılan kontroller başarılı.

Canlı ortam doğrulanmadıysa:

Canlı test yapılmadı; lokal/statik kontroller yapıldı.

⸻

2. KANITA DAYALI DENETİM STANDARDI

Her bulgu gerçek dosya içeriğine veya gerçek çalışma çıktısına dayanmalıdır.

Her bulgu mümkün olduğunda şu yapıyla yazılır:

1. Başlık
2. Risk seviyesi
3. Görünen problem
4. Dosya yolu
5. Doğrulanmış satır
6. Gerçek kod parçası
7. Teknik neden
8. Kullanıcı etkisi
9. Önerilen düzeltme
10. Kabul kriteri

Risk seviyeleri:

* Kritik
* Yüksek
* Orta
* Düşük
* İyileştirme tavsiyesi

Satır numarası doğrulanamıyorsa yazılmaz.

Ekran görüntüsü davranış kanıtıdır; tek başına kod satırı kanıtı değildir.

Başarısız test ile çalıştırılamayan test birbirinden ayrı raporlanır.

⸻

3. PROJE KÖK VE DOSYA YAPISI

Temel kök dosyalar:

/index.html
/script.js
/style.css
/server.js
/package.json

Proje ihtiyacına göre şu klasörler bulunabilir:

/public
/assets
/admin
/games
/server

package-lock.json zorunlu değildir.

Bulunuyorsa:

* package.json ile uyumlu olmalıdır.
* Bozuk veya eski dependency kaydı taşımamalıdır.
* Render kurulumunu bozmamalıdır.
* Kalıntı durumundaysa raporlanmalıdır.
* Yalnızca geçerli uygulama onayıyla kaldırılabilir.

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

⸻

4. AKTİF OYUN LİSTESİ

Aktif oyunlar yalnızca:

1. Crash
2. Satranç
3. Pişti
4. Pattern Master
5. Space Pro
6. Snake Pro

Eski oyunlar, demo oyunları, phase oyunları, test oyunları ve SOS geri getirilemez.

Tüm oyunlarda kullanıcı girişi zorunludur.

Misafir oyun akışı bulunmaz.

Ödül, MC, promo, çark ve market işlemlerinde e-posta doğrulaması zorunludur.

⸻

5. MOBİL ÖNCELİKLİ KULLANICI SİTESİ

Kullanıcı sitesi telefon ve tablet odaklıdır.

Kurallar:

* Telefon ve tablet ekranları desteklenir.
* Desktop kullanıcı sitesine doğrudan oyun erişimi verilmez.
* Desktop kullanıcıya profesyonel mobil yönlendirme ekranı gösterilir.
* Admin panel desktop, tablet ve mobilde kullanılabilir.
* Kullanıcı sitesinde hamburger menü bulunmaz.
* Alt mobil navigation korunur.
* AnaSayfa oyun kartları mobilde iki kolon çalışır.
* Safe-area ve mobil browser alt barları hesaba katılır.
* Yatay ve dikey ekran davranışları kontrol edilir.

⸻

6. ANASAYFA GENEL STANDARDI

6.1 Tasarım

Mevcut PlayMatrix tasarım kimliği korunur.

Küçük kalite iyileştirmeleri yapılabilir.

Büyük tasarım değişikliği:

* Önceden açıklanır.
* Kullanıcıya önerilir.
* Açık onay olmadan uygulanmaz.

6.2 Üst bar

AnaSayfa üst barında:

* PlayMatrix logosu
* Marka kimliği
* Kullanıcı avatarı
* Giriş/kayıt veya kullanıcı kontrolleri

bulunabilir.

AnaSayfa avatarında frame gösterilmez.

Mobilde taşma veya üst üste binme olamaz.

6.3 Oyun kartları

Oyun kartları:

* İki kolon düzenini korur.
* Gerçek bakım durumunu gösterir.
* Aktif oyuncu sayısını gösterebilir.
* Giriş yapılmadan oyun başlatmaz.
* Bakımdaki oyuna yönlendirme yapmaz.
* Kullanıcıya merkezi Tools mesajı gösterir.

6.4 Direct URL koruması

Bakımda olan oyun doğrudan URL ile açılamaz.

Koruma hem:

* Frontend
* Backend/server-side

katmanında uygulanır.

⸻

7. LİDERLİK TABLOSU VE SON KAZANANLAR YAŞAM DÖNGÜSÜ

7.1 Ana kural

Liderlik Tablosu ve Son Kazananlar yalnızca AnaSayfa gerçekten aktif ve görünürken güncellenir.

Oyun sayfalarında bu alanlar için polling yapılmaz.

7.2 Liderlik Tablosu yenileme standardı

Liderlik Tablosu:

1. Kullanıcı AnaSayfa’ya ilk girdiğinde hemen yüklenir.
2. İlk başarılı veya başarısız denemeden sonra 60 saniyelik yenileme döngüsü başlar.
3. AnaSayfa aktif ve tarayıcı sekmesi görünür olduğu sürece her 60 saniyede bir yenilenir.
4. Kullanıcı oyun sayfasına geçtiğinde polling tamamen durur.
5. Tarayıcı sekmesi arka plana alındığında polling durur.
6. Kullanıcı AnaSayfa’ya geri döndüğünde beklemeden anında yenilenir.
7. Anlık yenilemeden sonra yeni 60 saniyelik döngü başlar.

7.3 Son Kazananlar yenileme standardı

Son Kazananlar:

1. AnaSayfa ilk açıldığında hemen yüklenir.
2. AnaSayfa aktif ve görünür olduğu sürece her 60 saniyede yenilenir.
3. Oyun sayfalarında yenileme yapılmaz.
4. Sekme arka plandaysa polling durur.
5. AnaSayfa’ya dönüşte anında yenilenir.
6. Yenileme sonrası 60 saniyelik döngü yeniden kurulur.

7.4 İstek güvenliği

Her iki widget için:

* Aynı anda yalnızca bir aktif istek olabilir.
* Önceki istek tamamlanmadan ikinci istek başlatılamaz.
* Route değişiminde eski istek iptal edilebilir.
* Timer tekrarları birikemez.
* Duplicate event listener oluşturulamaz.
* Manuel yenileme yeni interval başlangıcı sayılır.
* Geçici hata, gerçek boş veri olarak gösterilemez.
* Son başarılı veri mümkünse korunur.
* Yükleniyor durumu sonsuza kadar açık kalamaz.
* Timeout uygulanır.
* Kontrollü retry/backoff uygulanabilir.

7.5 Liderlik otoritesi

Leaderboard:

* Backend tarafından hazırlanır.
* Client-side sıralama yapılmaz.
* Client yalnızca gelen sıralamayı gösterir.
* İlk üç oyuncu özel tasarım alabilir.
* Mobil performans korunur.
* Sahte kullanıcı veya sahte skor gösterilemez.

7.6 Son Kazananlar veri standardı

Son Kazananlar:

* Render memory üzerinde tutulabilir.
* Varsayılan limit 5’tir.
* Sahte veri üretilmez.
* Deploy/restart sonrası memory verisinin sıfırlanabileceği kabul edilir.
* Gerçek kazanç, promo veya çark aktivitesi oluşmadıysa boş durum gösterilir.
* Bağlantı hatası ile gerçek boş liste birbirinden ayrılır.

⸻

8. ANASAYFA MODÜLER YAPI

Tercih edilen yapı:

/script.js
/public/js/home/auth-modal.js
/public/js/home/game-catalog.js
/public/js/home/leaderboard.js
/public/js/home/recent-winners.js
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

script.js yalnızca bootstrap ve init görevi görür.

Büyük runtime dosyaları sürekli büyütülemez.

Modülerleştirme sırasında:

* Global state kontrolsüz çoğaltılamaz.
* Aynı event iki modülde dinlenemez.
* Aynı API isteği farklı modüllerden duplicate atılamaz.
* Döngüsel import oluşturulamaz.

Sosyal merkez, DM, arkadaş, chat, oyun daveti ve davet et-kazan sistemi bulunmaz.

Canlı destek yalnızca e-posta yönlendirmesidir.

⸻

9. KAYIT / GİRİŞ / HESAP STANDARDI

9.1 Kullanıcı adı

* 5–20 karakter
* Türkçe harf destekli
* Harf, sayı, ., -, _
* Boşluk yasak
* Backend benzersizlik kontrolü zorunlu

9.2 İsim ve soyisim

* Ayrı alanlar
* 3–50 karakter
* Türkçe harf destekli
* Sayı içermez
* Nokta, tire, alt çizgi içermez
* Başında veya sonunda boşluk bırakılmaz

9.3 Şifre

* Minimum 6 karakter
* Özel karakter zorunlu değildir
* Şifre frontend loglarına yazılamaz
* Şifre localStorage veya sessionStorage içinde tutulamaz

9.4 Kayıt ödülleri

* Kayıt sonrası: 50.000 MC
* E-posta doğrulama sonrası: 100.000 MC

Her iki ödül:

* Backend transaction
* Idempotency
* Tekrar claim engeli

ile uygulanır.

9.5 Kayıt hata mesajları

Kullanıcıya teknik hata gösterilmez.

Örnek kullanıcı mesajları:

* Kullanıcı adı 5-20 karakter olmalı.
* İsim yalnızca harflerden oluşmalı.
* Şifre en az 6 karakter olmalı.
* Bu e-posta adresi zaten kullanılıyor.
* Bu kullanıcı adı kullanılamıyor.

⸻

10. BENİ HATIRLA VE OTURUM STANDARDI

10.1 Genel kural

“Beni Hatırla” yalnızca görsel checkbox değildir. Firebase auth persistence ve backend session davranışını birlikte belirler.

Şifre veya hassas kimlik bilgisi tarayıcı depolamasına yazılamaz.

10.2 Beni Hatırla açıkken

Kullanıcı “Beni Hatırla” seçeneğini aktif ettiyse:

* Firebase kalıcı persistence kullanılır.
* Backend kalıcı ve güvenli HttpOnly session/cookie oluşturur.
* Oyunlara girip çıkınca oturum kapanmaz.
* Oyundan AnaSayfa’ya dönünce oturum kapanmaz.
* Sayfa yenilenince oturum kapanmaz.
* PWA veya normal tarayıcı geçişinde oturum korunur.
* Sunucu deploy/restart işlemi tek başına logout sebebi olamaz.
* Frontend ve backend session yeniden eşitlenebilir.
* Kullanıcı manuel çıkış yaparsa oturum sona erer.
* Tarayıcı çerezleri/site verileri temizlenirse oturum sona erer.
* Güvenlik nedeniyle session revoke edilirse oturum sona erer.
* Firebase hesabı devre dışı bırakılırsa oturum sona erer.

“Tarayıcı geçmişini temizleme” teknik olarak her zaman cookie silmez. Protokolde esas alınan durum:

* Çerezlerin
* Site verilerinin
* Firebase local persistence verisinin

temizlenmesidir.

10.3 Beni Hatırla kapalıyken

Kullanıcı seçeneği aktif etmediyse:

* Firebase session persistence kullanılır.
* Backend session-cookie kullanır.
* Cookie kalıcı Max-Age taşımaz.
* Sayfa yenileme oturumu kapatmaz.
* Oyunlara girip çıkma oturumu kapatmaz.
* AnaSayfa’ya dönüş oturumu kapatmaz.
* Tarayıcı oturumu tamamen kapatılınca session sona erer.
* Tarayıcı/site verileri temizlenince session sona erer.
* Kullanıcı manuel çıkış yaparsa session sona erer.

Mobil işletim sisteminin tarayıcıyı kısa süreli arka plana alması tek başına logout sebebi olmamalıdır.

10.4 Çıkış işlemi

Kullanıcı çıkış yaptığında birlikte temizlenir:

* Firebase auth session
* Backend session-cookie
* Kullanıcıya ait geçici client state
* Hassas cache
* Socket authentication state

Çıkış işlemi sonrası oyun sayfası authenticated kullanıcı gibi davranamaz.

10.5 Oturum hata yönetimi

Session senkronizasyonu başarısızsa kullanıcıya doğrudan:

* Firebase
* Token
* Cookie
* Session endpoint
* HTTP status

gösterilmez.

Kullanıcı mesajı işlem odaklı olur.

⸻

11. DOĞUM TARİHİ STANDARDI

11.1 Kayıt alanı

Kayıt formundaki doğum tarihi:

* Boş bırakılamaz.
* Native tarayıcı tarih kutusuna tamamen bağımlı olamaz.
* Mobil uyumlu özel popup/modal seçici kullanır.
* Gün, ay ve yıl seçimini açık biçimde gösterir.
* Geçersiz tarih üretmez.
* Gelecek tarih kabul etmez.

11.2 Profesyonel popup davranışı

Popup:

* PlayMatrix tasarım kimliğine uyar.
* Gün isimlerini Türkçe gösterir.
* Ay ve yıl değiştirmeyi destekler.
* Seçilen günü vurgular.
* Geçersiz ay günlerini pasif gösterir.
* İptal ve Uygula butonları içerir.
* Mobilde ekrandan taşmaz.
* Klavye ve ekran okuyucu erişilebilirliği sağlar.
* Açıldığında body scroll’u güvenli biçimde kilitler.
* Kapatıldığında scroll state’i geri yükler.

11.3 Veri formatı

Frontend görünüm formatı yerelleştirilebilir.

Backend’e gönderilen standart:

YYYY-MM-DD

Backend:

* Tarihi yeniden parse eder.
* Gün/ay/yıl tutarlılığını kontrol eder.
* Geçersiz tarihi reddeder.
* Client doğrulamasına güvenmez.

11.4 Hesabım bölümü

Doğum tarihi bulunmayan kullanıcı:

* Hesabım bölümünden bir kez tarih ekleyebilir.
* Kayıt tamamlanınca alan salt okunur/pasif hale gelir.

Doğum tarihi bulunan kullanıcı:

* Tarihi görebilir.
* Düzenleyemez.
* Tarih seçici tekrar aktif edilemez.
* Client-side DOM manipülasyonuyla değiştirmeye çalışsa backend reddeder.

11.5 Admin değişikliği

Doğum tarihini yalnızca admin değiştirebilir.

Zorunlu şartlar:

* Kritik işlem
* Firebase reauth
* İşlem özeti
* Audit kaydı
* Kullanıcıya ait eski/yeni açık doğum tarihini audit’e yazmama

Audit yalnızca şu tür bilgi tutar:

Kullanıcının doğum tarihi yönetici tarafından güncellendi.

⸻

12. TOOLS / MESAJ SİSTEMİ

PlayMatrix genelinde tek merkezi Tools mesaj sistemi kullanılır.

Türler:

* success
* error
* warning
* info
* reward
* system

Yasak yapılar:

* Browser alert
* Duplicate toast sistemi
* Her modalın kendi bağımsız hata kutusu
* Teknik exception metni
* Backend message alanını doğrudan kullanıcıya basma

Kullanıcıya gösterilmeyecek ifadeler:

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

Frontend yalnızca merkezi code → Türkçe mesaj sözlüğünü kullanır.

Bilinmeyen hata mesajı:

İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.

Aynı mesajın kısa sürede spam oluşturması engellenir.

⸻

13. BİLDİRİM STANDARDI

Bildirimler:

* Socket + düşük frekanslı fallback kullanabilir.
* Kullanıcıya ait veri izolasyonunu korur.
* Hassas payload içermez.
* Render memory üzerinde geçici tutulabilir.
* Firestore’da gereksiz kalıcı bildirim geçmişi oluşturmaz.
* Okundu bilgisi geçici tutulabilir.

Admin duyurusu:

* Adminin yazdığı metni gösterir.
* Otomatik ek cümle eklemez.
* Teknik veri içeremez.

Crash cashout/kazanç mesajı özel Crash bildirimi kullanır.

⸻

14. SUNUCU PERFORMANS VE HIZ STANDARDI

14.1 Genel amaç

“Sunucu hızlı olacak” ifadesi ölçülebilir teknik kriterlere dönüştürülür.

Performans iyileştirmesi yalnızca CSS animasyon azaltmak değildir. Şu alanların tümü incelenir:

* API gecikmesi
* Firebase sorguları
* Duplicate request
* Duplicate listener
* Timer temizliği
* Socket yükü
* JSON payload boyutu
* Runtime log büyümesi
* Memory leak
* Statik asset cache
* Compression
* Keep-alive
* Timeout
* Retry
* Cold start
* AnaSayfa polling

14.2 Zorunlu kurallar

* Aynı endpoint için gereksiz paralel istek atılmaz.
* Aynı Firebase verisi kısa aralıkta tekrar tekrar okunmaz.
* Aynı event listener birden fazla kez eklenmez.
* Sayfa kapanırken interval ve timeout temizlenir.
* Oyun sayfalarında AnaSayfa polling’i çalışmaz.
* Görünür olmayan sayfalarda render ve timer yükü azaltılır.
* Büyük listelerde limit/pagination uygulanır.
* Runtime log sınırsız büyüyemez.
* Successful 200 response’lar gereksiz loglanmaz.
* API timeout olmadan sonsuza kadar bekleyemez.
* Retry sınırsız çalışamaz.
* Exponential backoff veya kontrollü retry uygulanır.
* Cache gerçek boş veri ile bağlantı hatasını birbirine karıştırmaz.

14.3 Cache standardı

Uygun okuma endpointlerinde:

* Kısa süreli server cache
* In-flight request deduplication
* Stale-while-revalidate
* Redis veya güvenli runtime cache
* ETag/Last-Modified
* Statik asset cache-control

değerlendirilir.

Ekonomi, bakiye veya kritik oyun sonucu cache üzerinden kesinleştirilemez.

14.4 Performans hedefleri

Normal warm-instance koşullarında hedefler:

* Health endpoint p95: 250 ms veya altı
* Cache’li AnaSayfa okuma endpointleri p95: 500 ms veya altı
* Cache’siz Firestore tabanlı standart okuma p95: 1.200 ms veya altı
* Standart kritik olmayan write acknowledgement p95: 1.500 ms veya altı
* AnaSayfa polling isteği: widget başına tek aktif request
* Client tarafında uzun görev: mümkün olduğunca 50 ms altında

Render cold-start bu ölçümlerden ayrı raporlanır.

Bu hedefler canlı ölçüm olmadan sağlanmış kabul edilmez.

14.5 Performans raporu

Final raporda mümkünse:

* Ortalama
* p95
* p99
* En yavaş endpoint
* En fazla Firestore okuması yapan akış
* En büyük JS/CSS dosyaları
* En büyük assetler
* Memory artışı
* Açık kalan listener/timer sayıları

yazılır.

⸻

15. XP / LEVEL / EKONOMİ

Maksimum seviye:

100

Level 100 XP hedefi:

4.000.000.000.000 XP

Level 100 sonrası XP verilmez.

Prestij sistemi yoktur.

XP, level ve progress yalnızca backend tarafından hesaplanır.

Frontend:

* XP belirleyemez.
* Level belirleyemez.
* Progress yüzdesi hesaplayıp otorite olamaz.
* Ödül miktarı gönderemez.

MC işlemleri:

* Backend transaction
* Idempotency
* Tekrar işlem engeli

ile yapılır.

MC görünüm formatı:

31.927.827,00

XP görünüm formatı:

31927827

⸻

16. BACKEND AUTHORITY MATRIX

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
Kullanıcı mesajı	Frontend yalnızca gösterim

⸻

17. FRONTEND KESİN YASAKLARI

Frontend:

* Bakiye yazamaz.
* XP yazamaz.
* Level yazamaz.
* Oyun sonucu belirleyemez.
* Bahis sonucu belirleyemez.
* Cashout sonucu belirleyemez.
* Promo ödülü veremez.
* Çark sonucu belirleyemez.
* Market sahipliği veremez.
* Günlük hak düşemez.
* Leaderboard sıralaması belirleyemez.
* Secret taşıyamaz.
* Admin bilgisi içeremez.
* Parola saklayamaz.
* Backend message değerini doğrudan kullanıcıya gösteremez.

⸻

18. AVATAR / FRAME STANDARDI

Avatar/frame sistemi tek merkezi render motoru kullanır.

AnaSayfa topbar:

* Avatar var
* Frame yok

Oyun topbar:

* Avatar var
* Frame her zaman açık

Admin yalnızca:

* Scale
* Offset
* Padding
* Hizalama

değiştirebilir.

Container boyutunu değiştiremez.

Variantlar:

crashTopbar
chessTopbar
pistiTopbar
snakeTopbar
spaceTopbar
patternTopbar
leaderboard
accountModal
accountProfileCard
marketCard
crashLivePanel
crashWinNotice
chessGameCard
pistiScoreCard

Frame sistemi frame-1 ile frame-18 arasında kalır.

Kullanıcı sahip olmadığı frame’i aktif edemez.

⸻

19. MARKET STANDARDI

Para birimi:

MC

Aktif satış kategorisi:

Frame

Yakında kategorileri:

* İstatistik Teması
* Rozet
* Animasyonlu İsim Efekti

Yakında kategorileri tıklanamaz ve satın alınamaz.

Market:

* Backend transaction kullanır.
* İdempotency uygular.
* Stok kontrolü yapar.
* Sahiplik backend tarafından doğrulanır.
* Kapalıysa modal açılmaz.
* Kullanıcıya Tools mesajı gösterilir.
* İade admin + reauth + audit gerektirir.

⸻

20. PROMO STANDARDI

Promo admin tarafından açılır/kapatılır.

Promo kapalıysa modal açılmaz.

Promo türleri:

* MC
* XP
* Market çerçeve
* Oyun hakkı
* Promo

Promo:

* E-posta doğrulaması ister.
* Kullanıcı başı limit destekler.
* Başlangıç ve bitiş tarihi destekler.
* Minimum/maximum level destekler.
* Backend claim yapar.
* Idempotency uygular.
* Client ödül veremez.

⸻

21. ÇARK STANDARDI

Çark admin tarafından açılır/kapatılır.

Ödül türleri:

* MC
* XP
* Boş

Günlük hak:

1

Reset:

Europe/Istanbul 00:00

Çark sonucu yalnızca backend belirler.

Çift tıklama veya bağlantı tekrarında ikinci ödül verilemez.

⸻

22. ADMIN PANEL GENEL STANDARDI

Admin panel:

* Desktop, tablet ve mobilde kullanılabilir.
* Dört adımlı giriş sistemini korur.
* Tek admin modeli kullanır.
* Rol sistemi içermez.
* Kritik işlemde Firebase parola reauth ister.
* Kritik modal diğer modalın arkasında kalamaz.
* X, Vazgeç ve Doğrula butonları gerçek davranış gösterir.
* Modal body scroll’u kontrollü kilitler.
* Mobil browser alt barını dikkate alır.

Çalışan modal gereksiz yere yeniden yazılmaz.

Bozuk modal kontrollü olarak yeniden oluşturulabilir.

⸻

23. ADMIN ALLOWLIST

* Firestore ana kaynaktır.
* ENV yalnızca ilk kurulum bootstrap kaynağıdır.
* Allowlist değişimi kritik işlemdir.
* Reauth zorunludur.
* Audit zorunludur.
* Client-side admin kontrolü yeterli kabul edilmez.

⸻

24. ADMIN YÖNETİM MODALLARI

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

Şunlar final sistemde kalamaz:

* Bozuk X
* Bozuk Vazgeç
* Çalışmayan Kaydet
* Duplicate listener
* Eski selector
* Arka planda kalan reauth
* Yanlış z-index
* Kapanmayan modal
* Sonsuz loading

⸻

25. TOPLU DURUM SIFIRLAMA

Desteklenen kapsamlar:

* Tek kullanıcı
* Seçili kullanıcılar
* Tüm kullanıcılar
* Test kullanıcıları hariç

Preview zorunludur.

Etkilenecek kullanıcı sayısı gösterilir.

Audit zorunludur.

⸻

26. BAKIM MODU

Bakım alanları:

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

26.1 Bağımsızlık kuralı

Her oyun bağımsız bakım anahtarına sahiptir.

Bir oyunun bakımı diğer oyunu kapatamaz.

Market, Promo veya Çark bakımı oyunları kapatamaz.

Genel sistem bakımı tüm kullanıcı oyunlarını kapatabilir.

26.2 Boolean normalizasyonu

Aşağıdaki değerler aktif bakım sayılmaz:

false
0
"0"
off
pasif
inactive
disabled
hayır
no
null
undefined
""

Yalnızca açık şekilde aktif kabul edilen değerler bakım başlatır.

String "false" truthy olduğu için yanlışlıkla bakım aktif kabul edilemez.

26.3 Bakım davranışı

Bakım aktifse:

* Modal açılmaz.
* Direct URL engellenir.
* API güvenli hata kodu döndürür.
* Tools mesajı gösterilir.
* Teknik detay kullanıcıya gösterilmez.

Bakım kapalıysa oyun bakımdaymış gibi davranamaz.

Bu durum production kabulünde zorunlu testtir.

⸻

27. ADMIN HATA TAKİP MERKEZİ

Sıralama:

1. Kritik
2. Hata
3. Uyarı

Aynı seviyede yeni tarih önce gelir.

Geliştirici detayı varsayılan kapalıdır.

HTTP status yalnızca detay ekranında görünür.

Runtime retention:

7 gün

Runtime maksimum kayıt:

1500

Successful 200 loglanmaz.

⸻

28. AUDIT VE RUNTIME LOG AYRIMI

Veri	Konum	Amaç
Kritik admin işlemi	Firestore audit	Kalıcı denetim
Runtime hata	Render memory	Geçici hata takibi
Bildirim geçmişi	Render memory	Geçici kullanıcı görünümü
Son kazananlar	Render memory	Canlı görünüm
Game state	Runtime + gerekli kalıcı veri	Stabilite

Audit içinde bulunamaz:

* Parola
* Token
* Salt
* Hash
* Private key
* Service account
* Doğrulama kodu
* Açık hassas kullanıcı verisi

⸻

29. KULLANICI YÖNETİMİ

Admin:

* Kullanıcı arayabilir.
* UID/e-posta/kullanıcı adı görebilir.
* Bakiye görebilir.
* XP/level görebilir.
* Ban/unban yapabilir.
* Oyun geçmişi görebilir.
* Market envanteri görebilir.
* Promo geçmişi görebilir.
* Çark geçmişi görebilir.
* E-posta değiştirebilir.
* Doğum tarihi değiştirebilir.
* Kullanıcı silebilir.

Kullanıcı silme:

* Hard delete
* Kritik işlem
* Reauth
* Audit
* Geri alınamaz uyarısı

gerektirir.

⸻

30. CRASH STANDARDI

Crash tasarımı tamamen değiştirilmez; stabilize edilir.

Bahis limitleri:

Minimum: 1 MC
Public maksimum: 10.000.000 MC
Hidden hard risk: 100.000.000 MC

Auto cashout minimum:

2.00x

Manual cashout XP alt sınırı:

1.50x

XP:

1000 MC = 50 XP

Crash global round backend-authoritative çalışır.

Client multiplier yalnızca görseldir.

Cashout:

* Backend hesaplanır.
* Correlation ID kullanır.
* Idempotency uygular.
* Duplicate ödül üretmez.
* Gecikme toleransını kullanıcı aleyhine kötüye kullanmaz.

Retry:

* State reload
* Socket reconnect

başlatır.

Bilinen Crash problemleri production kabulünden önce:

* Gerçek dosya üzerinden tespit edilir.
* Kanıta dayalı düzeltilir.
* Rastgele yeniden yazma yapılmaz.

⸻

31. SATRANÇ STANDARDI

Satranç backend-authoritative socket kullanır.

Bot:

* MC vermez.
* XP vermez.
* Level ilerletmez.
* Bahisli odaya katılmaz.
* Public gerçek oyuncu odası gibi gösterilmez.

Bot gecikmesi:

3 saniye

Bahissiz ödül:

5.000 MC

Günlük hak:

10

Aynı rakip ödüllü galibiyet limiti:

3

Bahis:

1.000 – 1.000.000 MC

XP:

1000 MC = 50 XP

Reconnect:

90 saniye

Oda listesi socket ile güncellenir, fallback 30 saniyedir.

Bilinen Satranç sorunları production kabulünden önce düzeltilmelidir:

* Yanlış giriş durumu
* Sonsuz lobby loading
* Yanlış bakım mesajı
* Socket reconnect problemi
* Bozuk oda kur/katıl
* Mobil tahta taşması
* Duplicate socket listener
* Yanlış kullanıcı UID çözümü

⸻

32. PİŞTİ STANDARDI

Bahissiz kazanç:

5.000 MC

Bahis:

1.000 – 1.000.000 MC

XP:

1000 MC = 50 XP

Reconnect:

90 saniye

Bot oyunları MC/XP üretmez.

Oyun sonucunu backend belirler.

Aynı rakip ödüllü galibiyet limiti:

3

Bilinen Pişti sorunları production kabulünden önce düzeltilmelidir:

* Kullanıcı giriş yapmışken girişsiz görünme
* Yanlış bakım state’i
* Boş lobby
* Bozuk oda arama
* Duplicate request
* Kart sıra problemi
* Backend session/socket uyuşmazlığı
* Reconnect sonrası yanlış sonuç

⸻

33. KLASİK OYUNLAR

Aktif klasik oyunlar:

* Pattern Master
* Space Pro
* Snake Pro

MC ödülü yoktur.

Günlük toplam XP cap:

10.000 XP

Tek oturum XP cap:

Pattern Master: 1000 XP
Space Pro: 1000 XP
Snake Pro: 1000 XP

Backend nonce zorunludur.

Offline oyun yoktur.

Oyun sonucu otomatik submit edilir.

Frontend skor tek başına güvenilir kabul edilmez.

Bilinen klasik oyun problemleri production kabulünden önce kontrol edilir:

* Oyun loop’unun durmaması
* Timer leak
* Event listener leak
* Pause hakkı hatası
* Skor manipülasyonu
* Duplicate submit
* Bozuk sonuç modalı
* Mobil kontrol gecikmesi
* Asset yükleme problemi

⸻

34. SECURITY / BACKEND STANDARDI

Backend tek otoritedir.

Idempotency kritik işlemlerde zorunludur.

CORS:

https://playmatrix.com.tr
https://www.playmatrix.com.tr
https://emirhan-siye.onrender.com

Production’da localhost yasaktır.

Secret sanitize zorunludur.

/api/client-errors:

* Sanitize
* Rate limit
* Sensitive-data filter
* Payload sınırı

kullanır.

⸻

35. RENDER / DEPLOY STANDARDI

Render build:

npm install

Start:

npm start

Node sürümü sabitlenir.

Health endpoint bulunur.

Loglar güvenli özet taşır.

ENV değerleri raporda açık yazılmaz.

Yalnızca ENV isimleri yazılabilir.

Deploy sonrası manuel kontrol listesi zorunludur.

⸻

36. REPO TEMİZLİĞİ

Temizlenecekler:

* Debug console kalıntıları
* Yorum içine alınmış eski kod
* Duplicate CSS
* Duplicate JS
* Boş klasörler
* Kullanılmayan importlar
* Eski sosyal/DM/chat
* Phase/demo kalıntıları
* Kullanılmayan HTML/CSS/JS
* Ölü asset referansları

Kullanılmayan asset silme işlemi açık onay gerektirir.

⸻

37. TEST / KALİTE KAPISI

Kod uygulaması sonrası minimum kontroller:

* node --check
* JSON parse
* CSS brace
* HTML temel yapı
* Duplicate ID
* Asset path
* Route kayıt
* Secret leak scan
* ZIP bütünlük
* package.json
* Backend endpoint
* Admin route yetki
* Client error endpoint
* Bakım direct URL
* Market/Çark/Promo kapalı modal davranışı
* Crash cashout
* Satranç socket/lobby
* Pişti socket/lobby
* Klasik oyun nonce/submit
* Avatar/frame topbar
* Tools mesaj sistemi
* Beni Hatırla persistence
* Doğum tarihi popup
* DOB backend lock
* Liderlik polling
* Son Kazananlar polling
* Visibility pause/resume
* Duplicate request engeli
* Server performance ölçümü

Test başarısızsa başarısız olduğu açıkça yazılır.

Araç eksikliği nedeniyle çalıştırılamayan test ayrı yazılır.

⸻

38. PRODUCTION KABUL STANDARDI

Kullanıcının:

* “Hatasız”
* “Sorunsuz”
* “Eksiksiz”
* “Kusursuz”

talepleri aşağıdaki teknik kabul anlamına gelir:

1. Bilinen kritik hata kalmamalıdır.
2. Bilinen yüksek riskli bloklayıcı hata kalmamalıdır.
3. Zorunlu testler geçmelidir.
4. Çalıştırılamayan testler açıkça raporlanmalıdır.
5. Kullanıcıya yanlış başarı mesajı gösterilmemelidir.
6. Gerçek canlı test yapılmadıysa yapılmış gibi yazılmamalıdır.
7. Kalan riskler gizlenmemelidir.
8. AnaSayfa, oyunlar ve admin panel temel akışları test edilmelidir.
9. Auth, maintenance, economy ve admin authority kontrolleri geçmelidir.
10. Kanıt olmadan “%100 kusursuz” denmemelidir.

Bu nedenle production kabul ifadesi:

Zorunlu kontroller geçti ve bilinen bloklayıcı hata bulunmuyor.

şeklinde yazılır.

⸻

39. FINAL TESLİM STANDARDI

Kod değiştiyse sürümlü ZIP zorunludur.

Final rapor:

1. ZIP bağlantısı
2. Güncellenen dosyalar
3. Eklenen dosyalar
4. Silinen dosyalar
5. Yeniden yazılan alanlar
6. Yeniden yazma nedenleri
7. Temizlenen yapılar
8. Test sonuçları
9. Çalıştırılamayan testler
10. Bilinen kalan riskler
11. Manuel Render/Firebase ayarları
12. Kısa dosya ağacı

içerir.

Dosya yoksa:

Eklenen dosyalar: Yok
Silinen dosyalar: Yok

Final ZIP isimleri:

PLAYMATRIX-V1.zip
PLAYMATRIX-V2.zip
PLAYMATRIX-V3.zip

şeklinde artan sürüm kullanır.

⸻

40. KESİN YASAKLAR

* Client-side bakiye
* Client-side XP
* Client-side level
* Client-side oyun sonucu
* Client-side bahis sonucu
* Client-side Crash cashout
* Client-side promo
* Client-side çark
* Client-side market sahipliği
* Frontend secret
* Frontend private key
* Frontend admin bilgisi
* Şifreyi localStorage’da saklama
* README/MD final ZIP
* .npmrc final ZIP
* Kullanıcı sitesinde hamburger
* AnaSayfa topbar frame
* Oyun topbar frame kapatma
* Açık hassas runtime log
* Reauth atlama
* Sosyal/DM/chat/davet geri getirme
* Misafir oyun
* Maintenance bypass
* Sahte test
* Sahte Render logu
* Tahmini satır numarası
* Dosyada olmayan kodu varmış gibi gösterme
* Backend teknik mesajını kullanıcıya basma
* Bağlantı hatasını gerçek boş veri gibi gösterme
* Aynı polling isteğini paralel çalıştırma
* Beni Hatırla açıkken oyun geçişinde kullanıcıyı çıkış yaptırma
* Beni Hatırla kapalıyken her sayfa yenilemede kullanıcıyı çıkış yaptırma
* Kullanıcının kayıtlı doğum tarihini client üzerinden değiştirme
* Bakım kapalı oyunu bakımda gösterme
* Kanıtsız “kusursuz” iddiası

⸻

41. KISA NİHAİ KARAR TABLOSU

Alan	Nihai karar
Protokol	PLAYMATRIX NİHAİ PROTOKOL
Protokol onayı	EVET protokolü güncelle
Kod onayı	EVET uygula
Aktif oyunlar	Crash, Satranç, Pişti, Pattern, Space, Snake
Liderlik ilk yükleme	AnaSayfa girişinde hemen
Liderlik yenileme	AnaSayfa görünürken 60 saniye
Son Kazananlar ilk yükleme	AnaSayfa girişinde hemen
Son Kazananlar yenileme	AnaSayfa görünürken 60 saniye
Oyun sayfasında polling	Yok
AnaSayfa’ya dönüş	Hemen yenileme
Duplicate polling	Yasak
Beni Hatırla açık	Kalıcı Firebase + backend session
Beni Hatırla kapalı	Tarayıcı oturumuna bağlı session
Oyun geçişinde logout	Yasak
Manuel logout	Tüm auth/session temizlenir
Doğum tarihi	Özel profesyonel popup
DOB tekrar kullanıcı değişikliği	Yasak
DOB admin değişikliği	Reauth + audit
Bakım kapalı oyun	Bakımdaymış gibi davranamaz
Market/Çark/Promo bakımı	Oyunları kapatmaz
Sunucu performansı	Ölçülebilir p95/p99 kriterleri
Leaderboard sıralaması	Backend
Son Kazananlar	Render memory, sahte veri yok
AnaSayfa topbar frame	Yok
Oyun topbar frame	Her zaman açık
Level max	100
Level 100 XP	4.000.000.000.000
Klasik günlük XP cap	10.000
Runtime log	1500 kayıt / 7 gün
Render build	npm install
package-lock	Zorunlu değil; varsa uyumlu olmalı
Final ZIP	Kod değiştiyse zorunlu
Kusursuzluk iddiası	Yalnızca kanıt varsa

⸻

42. SON HÜKÜM

Bu PLAYMATRIX NİHAİ PROTOKOL, PlayMatrix için güncel ve bağlayıcı çalışma standardıdır.

Bundan sonra özellikle şu kurallar zorunludur:

* Liderlik ve Son Kazananlar yalnızca AnaSayfa görünürken 60 saniyede bir yenilenir.
* AnaSayfa’ya dönüşte iki alan da anında yenilenir.
* Oyun sayfalarında AnaSayfa polling’i çalışmaz.
* “Beni Hatırla” seçimi gerçek auth persistence davranışını belirler.
* Oyunlara girip çıkmak kullanıcıyı logout etmez.
* Doğum tarihi profesyonel popup ile seçilir.
* Kullanıcı kayıtlı doğum tarihini değiştiremez.
* Doğum tarihi yalnızca admin reauth ve audit ile değiştirilebilir.
* Bakım kapalı oyun bakımdaymış gibi davranamaz.
* Sunucu performansı ölçülür ve gereksiz istekler kaldırılır.
* AnaSayfa, oyunlar ve admin panel production kabul testlerinden geçmeden tamamlanmış sayılmaz.
* Kanıtsız başarı veya kusursuzluk iddiası kullanılamaz.
* Client-side ekonomi, XP, ödül ve oyun sonucu otoritesi kabul edilemez.