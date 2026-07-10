"İNCELEMEYE BAŞLA"

PlayMatrix ZIP İçeriği Detaylı İnceleme, Analiz ve Profesyonel Denetim Şartnamesi

0. Genel Amaç

Bu şartnamenin amacı, gönderilen PlayMatrix ZIP içeriğinin hiçbir dosyada değişiklik yapılmadan çok derin, titiz, profesyonel ve eksiksiz şekilde incelenmesini sağlamaktır.

Bu çalışma bir kod düzeltme, dosya silme, dosya taşıma, modül düzenleme veya görsel düzenleme çalışması değildir. Bu çalışma yalnızca:

* ZIP içeriğini detaylı inceleme,
* AnaSayfa yapısını analiz etme,
* Tüm oyunları ayrı ayrı denetleme,
* Admin panelini kapsamlı kontrol etme,
* Avatar + çerçeve sistemini çok derin inceleme,
* Gereksiz / kullanılmayan / eski / tekrar eden kodları tespit etme,
* Performans, güvenlik, kullanıcı deneyimi ve sürdürülebilirlik risklerini raporlama,
* Eksik sistemleri ve geliştirme tavsiyelerini profesyonel şekilde ortaya çıkarma,

amacıyla yapılacaktır.

İnceleme sonucunda kaynak dosyalara dokunulmayacak, hiçbir dosya silinmeyecek, hiçbir kod değiştirilmeyecek, hiçbir otomatik düzeltme yapılmayacaktır. Tüm bulgular yalnızca raporlanacaktır.

⸻

1. Temel Çalışma Kuralları

1.1. Dosyalara Kesinlikle Müdahale Edilmeyecek

İnceleme sırasında:

* Dosya değiştirilmeyecek.
* Dosya silinmeyecek.
* Dosya taşınmayacak.
* Dosya yeniden adlandırılmayacak.
* Kod düzenlenmeyecek.
* CSS düzenlenmeyecek.
* HTML düzenlenmeyecek.
* JavaScript düzenlenmeyecek.
* Backend dosyaları düzenlenmeyecek.
* Admin paneli dosyaları düzenlenmeyecek.
* Oyun dosyaları düzenlenmeyecek.
* Asset dosyaları optimize edilmeyecek.
* ZIP içeriği yeniden paketlenmeyecek.

Bu çalışma yalnızca okuma, analiz etme, risk çıkarma ve şartname/rapor oluşturma çalışmasıdır.

⸻

1.2. İnceleme Yüzeysel Olmayacak

İnceleme yalnızca dosya adlarına bakılarak yapılmayacaktır.

Aşağıdaki seviyelerde analiz yapılacaktır:

* Dosya ağacı incelemesi
* HTML yapı incelemesi
* CSS yapı incelemesi
* JavaScript akış incelemesi
* Backend / server modül incelemesi
* Firebase kullanım incelemesi
* Admin paneli fonksiyon incelemesi
* Oyun mantığı incelemesi
* Modal sistemi incelemesi
* Avatar + çerçeve render sistemi incelemesi
* Kullanıcı mesajları incelemesi
* Performans riski incelemesi
* Gereksiz dosya / klasör / kod fazlalığı incelemesi
* Kullanılmayan yapı incelemesi
* Tekrar eden kod incelemesi
* Eski / legacy / phase kalıntısı incelemesi
* Mobil uyumluluk incelemesi
* UI/UX tutarlılık incelemesi
* Güvenlik ve yetki kontrolü incelemesi

⸻

1.3. Her Bulgu Kanıtlı Yazılacak

Her hata, sorun, eksik veya tavsiye şu bilgilerle yazılacaktır:

* Sorunun bulunduğu alan
* Dosya yolu
* İlgili yapı / fonksiyon / modal / bileşen
* Sorunun açıklaması
* Kullanıcıya etkisi
* Teknik etkisi
* Risk seviyesi
* Önerilen çözüm
* Kabul kriteri

Belirsiz ifadeler kullanılmayacaktır.

Yanlış rapor dili:

Burada bir sorun olabilir.

Doğru rapor dili:

games/crash/script.js içinde Crash üst bar kullanıcı avatar render yapısı, merkezi avatar + çerçeve render sisteminden bağımsız çalışıyor. Bu durum admin panelinden yapılan avatar/çerçeve hizalama ayarlarının Crash üst barda birebir uygulanmamasına sebep olabilir. Bu alan merkezi renderAvatarFrame(user, { variant: "crashTopbar" }) yapısına bağlanmalıdır.

⸻

2. Raporlama Risk Seviyeleri

Her bulgu aşağıdaki seviyelerden biriyle sınıflandırılacaktır.

2.1. KRİTİK

Sistemin çalışmasını, güvenliğini, kullanıcı bakiyesini, ödül dağıtımını, admin yetkisini, Firebase/backend doğrulamasını veya oyun sonucunu doğrudan etkileyen sorunlardır.

Örnek:

* Ödül iki kez verilebiliyor.
* Kullanıcı sahip olmadığı market ürününü aktif edebiliyor.
* Admin olmayan kişi admin fonksiyonuna erişebiliyor.
* Avatar/çerçeve admin ayarı canlı alana uygulanmıyor.
* Oyun sonucu frontend manipülasyonuyla değiştirilebiliyor.

⸻

2.2. YÜKSEK

Kullanıcı deneyimini ciddi bozan, performansı düşüren, önemli UI kırılmalarına sebep olan veya sürdürülebilirliği zorlaştıran sorunlardır.

Örnek:

* Mobilde modal taşması.
* Admin panelinde kayıt sonrası ayarın kaybolması.
* Aynı sistemin farklı dosyalarda farklı mantıkla çalışması.
* Çok fazla tekrar eden kod.
* Kullanıcıya teknik hata gösterilmesi.

⸻

2.3. ORTA

Bakım, tasarım tutarlılığı, erişilebilirlik, kod kalitesi veya modülerlik açısından düzeltilmesi gereken sorunlardır.

Örnek:

* Gereksiz CSS tekrarları.
* Kullanılmayan import.
* Aynı toast mesajının farklı dosyalarda farklı yazılması.
* Eksik aria-label.
* Gereksiz wrapper yapıları.

⸻

2.4. DÜŞÜK

Sistemi doğrudan bozmasa da profesyonellik, temizlik ve kalite açısından iyileştirilmesi gereken konulardır.

Örnek:

* Yorum satırında kalmış eski kod.
* Kullanılmayan class adı.
* Fazla boş CSS bloğu.
* Tutarsız isimlendirme.

⸻

2.5. İYİLEŞTİRME TAVSİYESİ

Mevcut yapı çalışıyor olsa bile daha profesyonel, hızlı, güvenli ve sürdürülebilir hale getirmek için önerilen geliştirmelerdir.

⸻

3. Performans ve Hız Şartları

3.1. Genel Hedef

PlayMatrix sistemi hızlı açılmalı, hızlı tepki vermeli ve kullanıcıya bekletme hissi vermemelidir.

Sunucu, Firebase, backend, asset yükleme, render sistemi ve oyun ekranları performans açısından incelenecektir.

Hedef:

* AnaSayfa hızlı açılacak.
* Oyun sayfaları hızlı yüklenecek.
* Admin paneli takılmadan çalışacak.
* Modal açılışları gecikmeyecek.
* Avatar/çerçeve önizlemeleri donmayacak.
* Firebase okuma/yazma işlemleri gereksiz tekrar yapmayacak.
* Render log sistemi şişip sistemi yavaşlatmayacak.
* Gereksiz dosyalar kullanıcıya yüklenmeyecek.
* Kullanılmayan CSS/JS sayfaya bindirilmeyecek.

⸻

3.2. Sunucu Yavaşlamayacak

İnceleme sırasında şu konular özellikle kontrol edilecektir:

* Gereksiz backend endpointleri var mı?
* Aynı istek kısa sürede tekrar tekrar atılıyor mu?
* Firebase’den gereksiz veri çekiliyor mu?
* Realtime listener gereksiz açık kalıyor mu?
* Kullanıcı sayfadan çıksa bile listener kapanıyor mu?
* Log sistemi fazla kayıt üretip belleği şişiriyor mu?
* Render memory kayıtları gereksiz büyüyor mu?
* Admin logları sınırsız çoğalıyor mu?
* Oyunlarda interval/timer temizleniyor mu?
* Modal kapatıldığında event listener temizleniyor mu?
* Büyük assetler her sayfada gereksiz yükleniyor mu?
* Oyunlara özel JS/CSS sadece ilgili oyunda mı yükleniyor?
* CDN veya dış scriptler sayfayı bloke ediyor mu?

⸻

3.3. Çok Hızlı Yanıt ve Çok Hızlı Yükleme İlkeleri

Aşağıdaki performans kuralları raporda kontrol edilecektir:

* Kritik CSS mümkün olduğunca sade olmalı.
* Gereksiz global CSS azaltılmalı.
* Sayfaya ait olmayan oyun scriptleri AnaSayfa’da yüklenmemeli.
* Admin dosyaları kullanıcı tarafında yüklenmemeli.
* Oyun dosyaları yalnızca ilgili oyunda yüklenmeli.
* Görseller optimize edilmeli.
* Büyük avatar/çerçeve görselleri gerektiğinde lazy-load yapılmalı.
* Market ürünleri kategoriye göre yüklenmeli.
* Bildirimler panel açılmadan gereksiz yüklenmemeli.
* Liderlik verisi cache mantığıyla çalışmalı.
* Çark, promo, market, avatar ve çerçeve işlemleri çift istek üretmemeli.
* Firebase sorguları index ve limit mantığıyla düzenlenmeli.
* Admin panelinde büyük listeler pagination veya filtreleme ile yüklenmeli.
* Log ekranları sınırsız veri çekmemeli.

⸻

3.4. Performans Kabul Kriterleri

Bu madde tamamlandığında raporda şu soruların cevabı net verilmiş olmalıdır:

* Hangi dosyalar performans riski taşıyor?
* Hangi JS dosyaları gereksiz büyümüş?
* Hangi CSS dosyaları fazla !important, tekrar veya karmaşa içeriyor?
* Hangi assetler gereksiz büyük?
* Hangi Firebase okuma/yazma işlemleri gereksiz tekrar yapabilir?
* Hangi realtime listenerlar kapatılmadan kalabilir?
* Hangi admin log / render log sistemi şişme riski taşıyor?
* Hangi oyunlarda interval/timer/event listener temizliği eksik olabilir?
* Hangi alanlarda lazy-load veya cache öneriliyor?

⸻

4. Kullanıcı Dostu Mesaj Standardı

4.1. Genel Kural

Kullanıcıya hiçbir zaman teknik, korkutucu, geliştirici odaklı veya anlaşılmaz mesaj gösterilmeyecektir.

Kullanıcı tarafında şu tarz ifadeler görünmemelidir:

* Firebase
* Backend
* Server error
* Render memory
* Exception
* Stack trace
* Endpoint
* Unauthorized
* Validation failed
* Internal error
* Permission denied
* Null reference
* Undefined
* Token expired
* API failed
* HTTP 500
* Config error
* Collection not found
* Document write failed

Bu terimler yalnızca admin log veya geliştirici detay ekranlarında, kullanıcıdan gizli ve kontrollü şekilde bulunabilir.

⸻

4.2. Kullanıcı Mesajı Nasıl Olmalı?

Kullanıcı mesajları şu yapıda olmalıdır:

1. Ne oldu?
2. Kullanıcı ne yapmalı?
3. Gerekirse kısa güven verici açıklama.

Mesajlar kısa, net, açıklayıcı ve panik yaratmayan şekilde yazılmalıdır.

⸻

4.3. Yanlış / Doğru Mesaj Örnekleri

Yanlış Mesaj	Doğru Mesaj
Firebase e-mail update failed	E-posta adresin şu anda güncellenemedi. Lütfen tekrar dene.
Backend validation error	Bilgiler kontrol edilirken bir sorun oluştu. Lütfen alanları tekrar kontrol et.
EMAIL_NOT_VERIFIED	Devam etmek için e-posta adresini doğrulaman gerekiyor.
Unauthorized reward claim	Bu ödülü alabilmek için önce giriş yapman gerekiyor.
Render memory error	Görünüm şu anda yüklenemedi. Lütfen sayfayı yenileyip tekrar dene.
Market fetch failed	Market şu anda yüklenemedi. Lütfen tekrar dene.
Internal server error	İşlem şu anda tamamlanamadı. Lütfen biraz sonra tekrar dene.
Permission denied	Bu işlemi yapmak için yetkin bulunmuyor.
undefined avatar frame	Profil görünümün şu anda yüklenemedi. Varsayılan görünüm kullanılıyor.

⸻

4.4. E-Posta Değiştirme Mesaj Standardı

Yanlış mesaj:

Yeni e-posta adresini yaz; bağlantı yeni e-posta adresine gönderilir. Onaydan sonra Hesabım ve Firebase E-posta bilgisi güncellenir.

Doğru mesaj:

Yeni e-posta adresini yaz. Bağlantı yeni e-posta adresine gönderilir. Spam kutusunu kontrol etmeyi unutma. Onaydan sonra e-posta adresin güncellenir.

Daha profesyonel alternatif:

Yeni e-posta adresini gir. Doğrulama bağlantısı yeni adresine gönderilecek. Bağlantıyı onayladıktan sonra e-posta adresin otomatik olarak güncellenecek. Spam kutusunu da kontrol etmeyi unutma.

⸻

4.5. Şifre Değiştirme Mesaj Standardı

Yanlış mesaj:

Firebase password update failed.

Doğru mesaj:

Şifren şu anda değiştirilemedi. Mevcut şifreni kontrol edip tekrar dene.

Başarılı mesaj:

Şifren başarıyla güncellendi.

⸻

4.6. Avatar / Çerçeve Mesaj Standardı

Başarılı avatar mesajı:

Avatar seçimin kaydedildi.

Başarılı çerçeve mesajı:

Çerçeve seçimin kaydedildi.

Hata mesajı:

Seçimin şu anda kaydedilemedi. Lütfen tekrar dene.

Giriş gerekli mesajı:

Devam etmek için giriş yapman gerekiyor.

⸻

4.7. Çark ve Promo Mesaj Standardı

E-posta doğrulama gerekli:

Çark ve promo ödüllerinden yararlanmak için e-posta adresini doğrulaman gerekiyor.

Çark kullanıldı:

Bugünkü çark hakkını kullandın. Yarın tekrar deneyebilirsin.

Promo başarılı:

Promo kodun başarıyla kullanıldı.

Promo geçersiz:

Bu promo kodu geçerli değil veya süresi dolmuş.

⸻

4.8. Admin Mesaj Standardı

Admin panelinde teknik detay tamamen yasak değildir; fakat kullanıcı dostu başlıkla ayrılmalıdır.

Doğru admin formatı:

* Başlık: İşlem tamamlanamadı.
* Açıklama: Kullanıcı bakiyesi güncellenirken sorun oluştu.
* Teknik detay: Geliştirici detaylarında gösterilir.
* Aksiyon: Tekrar dene / Logu incele / Kullanıcı kaydını aç.

Admin panelinde bile doğrudan karmaşık hata kodu ekrana basılmamalıdır.

⸻

5. AnaSayfa İnceleme Şartları

AnaSayfa tüm alt bileşenleriyle ayrı ayrı incelenecektir. AnaSayfa yalnızca tek bir index.html alanı gibi ele alınmayacak; her modal, her buton, her dropdown, her kart, her kullanıcı akışı ayrı denetlenecektir.

⸻

5.1. Giriş / Kayıt / Şifreni Mi Unuttun Modalları

Kontrol edilecekler:

* Modal açılış/kapanış akışı doğru mu?
* Giriş ve kayıt birbirine karışıyor mu?
* Kayıt alanları eksiksiz mi?
* Şifre tekrar kontrolü var mı?
* Şifremi unuttum akışı kullanıcı dostu mu?
* Hata mesajları teknik mi?
* Form submit sırasında çift tıklama engelleniyor mu?
* Loading durumu var mı?
* Başarılı işlem sonrası doğru modal kapanıyor mu?
* Mobilde modal taşma yapıyor mu?
* Klavye açıldığında alanlar görünür kalıyor mu?
* ESC / dış tıklama / kapatma ikonları doğru çalışıyor mu?
* Erişilebilirlik için label ve aria yapısı yeterli mi?

⸻

5.2. Üst Bar

Kontrol edilecekler:

* Logo doğru görünüyor mu?
* Kullanıcı giriş durumuna göre butonlar doğru değişiyor mu?
* Bakiye gösterimi doğru mu?
* Avatar + çerçeve üst barda kaymadan duruyor mu?
* Mobilde üst bar taşma yapıyor mu?
* Dropdown açılışı z-index sorunu yaşıyor mu?
* Üst bar oyun sayfalarıyla tutarlı mı?
* Gereksiz listener tekrarları var mı?
* Kullanıcı çıkış yaptıktan sonra üst bar doğru sıfırlanıyor mu?

⸻

5.3. Alt Bar

Kontrol edilecekler:

* Linkler doğru mu?
* Mobilde düzgün hizalanıyor mu?
* Gereksiz sosyal veya eski bağlantılar var mı?
* Kullanılmayan alanlar duruyor mu?
* Copyright / marka bilgisi doğru mu?
* Alt bar flood alanıyla karışıyor mu?

⸻

5.4. Üst Bar Dropdown

Kontrol edilecekler:

* Dropdown sadece doğru durumda açılıyor mu?
* Giriş yapmamış kullanıcıya yanlış seçenek gösteriliyor mu?
* Hesabım, Market, Bildirimler, Çıkış seçenekleri doğru mu?
* Mobilde dropdown ekrandan taşıyor mu?
* Dropdown kapatma davranışı doğru mu?
* Dış tıklama listenerları çoğalıyor mu?
* Z-index modal sistemiyle çakışıyor mu?

⸻

5.5. Hesabım Modalı ve İçeriği

Kontrol edilecekler:

* Kullanıcı bilgileri doğru yükleniyor mu?
* Avatar + çerçeve profil kartında doğru görünüyor mu?
* Bakiye, seviye, XP, kayıt bilgisi doğru mu?
* Gereksiz istatistik veya kullanılmayan alanlar var mı?
* Eski sistem kalıntıları bulunuyor mu?
* Modal içinde modal açıldığında z-index bozuluyor mu?
* Mobilde içerik taşma yapıyor mu?
* Kullanıcı dostu mesaj standardı uygulanıyor mu?

⸻

5.6. Hesabım İçindeki Avatar Seç Modalı

Kontrol edilecekler:

* Avatar listesi doğru yükleniyor mu?
* Sahip olunan / olunmayan avatar ayrımı var mı?
* Seçili avatar doğru işaretleniyor mu?
* Kaydet işlemi çift tıklamayla tekrar etmiyor mu?
* Başarı/hata mesajı global toast/tools sisteminden gösteriliyor mu?
* Modal içi eski hata kutuları var mı?
* Avatar seçimi sonrası AnaSayfa, oyunlar ve admin görünümleri senkron mu?
* Profil tamamlama veya eski guard kalıntısı var mı?

⸻

5.7. Hesabım İçindeki Çerçeve Seç Modalı

Kontrol edilecekler:

* Normal çerçeveler doğru listeleniyor mu?
* Market çerçeveleriyle çakışma var mı?
* Sahip olunmayan çerçeve aktif edilebiliyor mu?
* Çerçeve önizlemesi gerçek avatarla doğru mu?
* Seçili çerçeve doğru işaretleniyor mu?
* Kaydet sonrası tüm alanlara doğru uygulanıyor mu?
* Başarı/hata mesajı global toast/tools sisteminden gösteriliyor mu?
* Modal içi teknik hata veya eski kutu var mı?

⸻

5.8. Hesabım İçindeki E-Posta Değiştir Modalı

Kontrol edilecekler:

* Yeni e-posta alanı doğru doğrulanıyor mu?
* Kullanıcıya teknik açıklama gösteriliyor mu?
* Spam kutusu bilgilendirmesi var mı?
* Onay sonrası kullanıcı mesajı sade mi?
* Firebase kelimesi kullanıcıya gösteriliyor mu?
* Tekrar gönderme davranışı doğru mu?
* Başarı/hata mesajları kullanıcı dostu mu?

⸻

5.9. Hesabım İçindeki Şifre Değiştir Modalı

Kontrol edilecekler:

* Mevcut şifre alanı var mı?
* Yeni şifre ve şifre tekrar kontrolü doğru mu?
* Şifre kuralları kullanıcı dostu anlatılıyor mu?
* Teknik auth hataları kullanıcıya gösteriliyor mu?
* Başarı sonrası modal doğru kapanıyor mu?
* Hata sonrası kullanıcı alanları tekrar kontrol edebiliyor mu?

⸻

5.10. Hesabım İçindeki Kart Yapısı

Kontrol edilecekler:

* Kartlar görsel olarak tutarlı mı?
* Avatar + çerçeve kart içinde doğru hizalı mı?
* Kartlar mobilde kırılıyor mu?
* Gereksiz kartlar var mı?
* Kullanılmayan istatistik alanları var mı?
* Kartlarda eski veri veya boş placeholder kalıyor mu?
* Kart hover/focus davranışı doğru mu?

⸻

5.11. Günlük Çark Modalı

Kontrol edilecekler:

* Giriş yapılmadan çark çevrilebiliyor mu?
* E-posta doğrulaması zorunlu mu?
* Backend ödül vermeden önce doğrulama yapıyor mu?
* Günlük hak kontrolü doğru mu?
* Çift tıklama ile iki ödül veriliyor mu?
* Ödül teslimi transaction/idempotency mantığıyla güvenli mi?
* Çark animasyonu ve sonuç senkron mu?
* Hata mesajları kullanıcı dostu mu?
* Teknik hata gösteriliyor mu?

⸻

5.12. Promosyon Kodu Modalı

Kontrol edilecekler:

* Giriş yapılmadan promo kullanılabiliyor mu?
* E-posta doğrulaması zorunlu mu?
* Kod geçerlilik süresi kontrol ediliyor mu?
* Kullanım limiti kontrol ediliyor mu?
* Kullanıcı başına kullanım limiti var mı?
* Ödül çift işleniyor mu?
* Backend doğrulaması var mı?
* Teknik hata mesajı gösteriliyor mu?
* Başarılı kullanım sonrası bakiye doğru güncelleniyor mu?

⸻

5.13. Market Modalı

Kontrol edilecekler:

* Market ürünleri doğru kategorileniyor mu?
* Satın alınan ürünler doğru işaretleniyor mu?
* Sahip olunmayan ürün aktif edilebiliyor mu?
* Fiyat, stok, aktiflik, görünürlük doğru mu?
* Çerçeve / avatar / rozet / efekt / tema slotları çakışıyor mu?
* Market ürünleri yalnızca satın alan kullanıcıya mı uygulanıyor?
* Market verisi yüklenirken skeleton/loading var mı?
* Hata durumunda tekrar dene butonu gerçekten çalışıyor mu?
* Kullanıcıya endpoint veya teknik hata gösteriliyor mu?
* Market kapalıysa kullanıcı dostu mesaj var mı?

Market kapalı mesajı:

Market şu anda çevrim dışı.

⸻

5.14. Bildirimler Modalı

Kontrol edilecekler:

* Bildirimler panel açılmadan gereksiz yükleniyor mu?
* Okundu/okunmadı durumu doğru mu?
* Bildirim sayacı doğru mu?
* Eski bildirimler sınırsız yükleniyor mu?
* Kullanıcıya özel bildirim izolasyonu var mı?
* Admin duyuruları doğru geliyor mu?
* Teknik hata mesajları gizleniyor mu?

⸻

5.15. Tools / Toast Bildirimleri

Kontrol edilecekler:

* Tüm başarı/hata mesajları tek global sistemden mi gösteriliyor?
* Modal içi eski kutular kaldırılmalı mı?
* Aynı mesaj farklı dosyalarda tekrar yazılmış mı?
* Toast süresi doğru mu?
* Mobilde toast ekrandan taşıyor mu?
* Başarı, hata, uyarı ve bilgi mesajları görsel olarak ayrılıyor mu?
* Teknik hata kodları kullanıcıya gösteriliyor mu?

⸻

5.16. Hero Alanı

Kontrol edilecekler:

* Ana mesaj net mi?
* Butonlar doğru yönlendiriyor mu?
* Giriş/kayıt akışıyla çakışıyor mu?
* Mobilde görsel taşma var mı?
* Gereksiz animasyon performansı düşürüyor mu?
* Sosyal butonlarla görsel bütünlük var mı?

⸻

5.17. Hero Altındaki Sosyal Butonlar

Kontrol edilecekler:

* Linkler doğru mu?
* Boş veya sahte link var mı?
* Kullanılmayan sosyal buton var mı?
* Mobilde hizalama doğru mu?
* Erişilebilirlik için label var mı?
* Dış link güvenliği doğru mu?

⸻

5.18. Oyun Kartları ve Yönlendirmeleri

Kontrol edilecekler:

* Tüm oyun kartları doğru oyuna yönlendiriyor mu?
* Kapalı / bakımda / aktif durumları doğru mu?
* Kart görselleri optimize mi?
* Hover/touch davranışı doğru mu?
* Giriş gerektiren oyunlarda doğru modal açılıyor mu?
* Kartlar mobilde eşit ve düzenli mi?
* Eski kaldırılmış oyun kartı kalıntısı var mı?

⸻

5.19. Liderlik Alanı

Kontrol edilecekler:

* Liderlik verisi doğru geliyor mu?
* Cache mantığı var mı?
* Gereksiz realtime okuma yapılıyor mu?
* Avatar + çerçeve liderlik kartında doğru hizalı mı?
* Mobilde liderlik kartları taşma yapıyor mu?
* Boş veri durumu kullanıcı dostu mu?
* Teknik hata gösteriliyor mu?
* Sıralama adil ve net mi?

⸻

5.20. Sayfa En Altı Flood Alanı

Kontrol edilecekler:

* Gereksiz yoğun içerik var mı?
* SEO veya kullanıcı deneyimi açısından anlamsız tekrar var mı?
* Mobilde sayfa çok uzuyor mu?
* Eski metin / kullanılmayan link / boş alan var mı?
* Alt bar ile karışıyor mu?
* Performansı etkileyen gereksiz animasyon veya görsel var mı?

⸻

6. Tüm Oyunlar İnceleme Şartları

Tüm oyunlar ayrı ayrı incelenecektir. Oyunlar yalnızca açılıyor mu diye kontrol edilmeyecek; oyun mantığı, ödül sistemi, kullanıcı arayüzü, performans, avatar/çerçeve entegrasyonu, backend doğrulaması ve hata mesajlarıyla beraber incelenecektir.

İncelenecek oyunlar:

* Crash
* Satranç
* Pişti
* Pattern Master
* Snake Pro
* Space Pro

⸻

6.1. Tüm Oyunlar İçin Ortak Kontrol Kuralları

Her oyunda şu alanlar kontrol edilecektir:

* Oyun açılış ekranı
* Oyun üst barı
* Kullanıcı avatar + çerçeve görünümü
* Bakiye gösterimi
* Bahis / ödül / skor alanları
* Başlat / durdur / tekrar oyna butonları
* Oyun sonucu ekranı
* Kazanç / kayıp bildirimi
* Hata mesajları
* Giriş yapılmamış kullanıcı davranışı
* E-posta doğrulaması gerekiyorsa kontrolü
* Backend doğrulama
* Firebase okuma/yazma
* Çift tıklama / tekrar işlem koruması
* Mobil uyumluluk
* Timer / interval temizliği
* Event listener temizliği
* Gereksiz tekrar eden kodlar
* Kullanılmayan fonksiyonlar
* Eski oyun kalıntıları
* Performans riski
* Oyun mantığına uygun tavsiyeler

⸻

6.2. Crash Oyunu İncelemesi

Crash için kontrol edilecek alanlar:

* Global round mantığı
* Round başlangıç/bitiş akışı
* Bahis koyma alanı
* Minimum bahis kontrolü
* Bakiye düşme zamanı
* Cashout butonu
* Auto cashout sistemi
* Kazanç hesaplama
* Patlama anı
* Kazananlar paneli
* Canlı tur paneli
* Crash üst bar
* Crash kazanç bildirimi
* Avatar + çerçeve görünümü
* Reconnect davranışı
* Sayfa yenileme sonrası durum
* Çift bahis engeli
* Çift cashout engeli
* Backend doğrulaması
* Manipülasyon riski
* Oyun geçmişi
* Mobil görünüm
* Animasyon performansı

Crash oyun mantığı için tavsiyeler:

* Tek global round varsa tüm kullanıcılar aynı round durumunu görmelidir.
* Cashout yalnızca round aktifken çalışmalıdır.
* Patlama sonrası cashout engellenmelidir.
* Bahis bakiyesi backend tarafında güvenli düşülmelidir.
* Kazanç teslimi idempotent olmalıdır.
* Auto cashout minimum değeri mantıklı sınırlarla korunmalıdır.
* Round sonucu frontend tarafından değiştirilememelidir.
* Kullanıcı sayfayı yenilese bile aktif bahis durumu doğru korunmalıdır.

⸻

6.3. Satranç Oyunu İncelemesi

Satranç için kontrol edilecek alanlar:

* Oyun tahtası
* Taş dizilimi
* Hamle doğrulaması
* Bot hamlesi
* Hamle süresi
* Kullanıcı sırası
* Oyun bitiş koşulları
* Şah / mat / pat durumları
* Beraberlik durumu
* Bahisli / bahissiz mod ayrımı
* Bahissiz ödül limiti
* Günlük hak kontrolü
* Bahis aralığı
* Beraberlikte bakiye iadesi veya yanma kuralı
* Oda sistemi
* Pasiflik kontrolü
* Çıkış davranışı
* Avatar + çerçeve görünümü
* Satranç üst bar
* Satranç oyun kartı
* Mobil tahta boyutu
* Oyun sonucu mesajları

Satranç oyun mantığı için tavsiyeler:

* Geçersiz hamle frontend ve oyun motoru seviyesinde engellenmelidir.
* Bot hamlesi kullanıcı hamlesinden sonra gecikmeli ve tutarlı yapılmalıdır.
* Bahisli oyunda bakiye sonucu backend doğrulamalı işlenmelidir.
* Kullanıcı çıkarsa süre ve ceza kuralı açık olmalıdır.
* Beraberlik kuralı kullanıcıya net anlatılmalıdır.
* Bahissiz günlük ödül kötüye kullanılamamalıdır.
* Oyun sonucu frontend manipülasyonuyla değiştirilememelidir.

⸻

6.4. Pişti Oyunu İncelemesi

Pişti için kontrol edilecek alanlar:

* Kart dağıtımı
* Oyuncu eli
* Masa kartı
* Sıra sistemi
* Kart atma mantığı
* Pişti yakalama
* Skor hesaplama
* Tur bitişi
* Oyun bitişi
* Bot/rakip davranışı
* Bahis veya ödül sistemi
* Bakiye güncelleme
* Pişti skor kartı
* Pişti üst bar
* Avatar + çerçeve görünümü
* Kart assetleri
* Mobil kart dizilimi
* Hata mesajları
* Animasyon performansı

Pişti oyun mantığı için tavsiyeler:

* Kart dağıtımı tekrar edilebilir ve güvenli mantıkla çalışmalıdır.
* Skor hesabı yalnızca frontend’de bırakılmamalıdır.
* Pişti durumu açık kurallarla hesaplanmalıdır.
* Oyuncu aynı anda iki kart atamamalıdır.
* Sıra dışı hamle engellenmelidir.
* Oyun sonucu güvenli biçimde işlenmelidir.

⸻

6.5. Pattern Master İncelemesi

Pattern Master için kontrol edilecek alanlar:

* Desen gösterimi
* Kullanıcı tekrar girişi
* Seviye artışı
* Skor sistemi
* Hata hakkı
* Süre kontrolü
* Oyun bitişi
* Ödül sistemi
* Pattern üst bar
* Avatar + çerçeve görünümü
* Mobil buton boyutları
* Görsel efektler
* Ses/animasyon performansı
* Tekrar başlatma akışı

Pattern Master oyun mantığı için tavsiyeler:

* Desen üretimi adil ve takip edilebilir olmalıdır.
* Kullanıcı hatası net gösterilmelidir.
* Oyun hızı seviye ile dengeli artmalıdır.
* Skor manipülasyonu engellenmelidir.
* Ödül varsa backend doğrulamalı verilmelidir.

⸻

6.6. Snake Pro İncelemesi

Snake Pro için kontrol edilecek alanlar:

* Canvas / oyun alanı
* Yılan hareketi
* Yön kontrolü
* Çarpışma kontrolü
* Yem üretimi
* Skor sistemi
* Seviye/hız artışı
* Oyun bitişi
* Ödül sistemi
* Snake üst bar
* Avatar + çerçeve görünümü
* Mobil kontrol butonları
* Klavye/touch kontrolü
* Oyun döngüsü performansı
* Interval temizliği

Snake Pro oyun mantığı için tavsiyeler:

* Ters yöne ani dönüş engellenmelidir.
* Yem yılanın üstünde oluşmamalıdır.
* Oyun bittiğinde loop kesin durmalıdır.
* Skor frontend manipülasyonuna açık olmamalıdır.
* Mobil kontroller gecikmesiz çalışmalıdır.

⸻

6.7. Space Pro İncelemesi

Space Pro için kontrol edilecek alanlar:

* Oyuncu gemisi
* Düşmanlar
* Mermi sistemi
* Çarpışma algılama
* Can sistemi
* Skor sistemi
* Seviye artışı
* Oyun bitişi
* Ödül sistemi
* Space üst bar
* Avatar + çerçeve görünümü
* Mobil kontroller
* Canvas performansı
* Animasyon döngüsü
* Asset yükleme

Space Pro oyun mantığı için tavsiyeler:

* Çarpışma hesapları tutarlı olmalıdır.
* Ateş etme spam koruması bulunmalıdır.
* Oyun bitince tüm animasyon/timer durmalıdır.
* Skor ve ödül backend doğrulamalı olmalıdır.
* Mobilde kontrol alanları parmak kullanımına uygun olmalıdır.

⸻

7. Admin Paneli İnceleme Şartları

Admin paneli sistemin en kritik yönetim alanıdır. Admin paneli yalnızca görsel olarak değil, yetki, veri doğruluğu, kullanıcı yönetimi, market kontrolü, log yönetimi, avatar/çerçeve yönetimi ve işlem güvenliği açısından detaylı incelenecektir.

⸻

7.1. Admin Panel Genel Kontrol

Kontrol edilecekler:

* Admin giriş koruması
* Yetki kontrolü
* Admin olmayan kullanıcının erişim riski
* Dashboard veri doğruluğu
* Kullanıcı listesi
* Kullanıcı detay ekranı
* Bakiye düzenleme
* Ban / unban
* Promo yönetimi
* Market yönetimi
* Bildirim yönetimi
* Log yönetimi
* Render log yönetimi
* Crash risk yönetimi
* Oyun izleme
* Cleanup araçları
* Sağlık/health ekranları
* Mobil/tablet uyumluluk
* Admin mesaj standardı
* Gereksiz teknik hata gösterimi
* Veri yükleme performansı

⸻

7.2. Admin Log Sistemi

Kontrol edilecekler:

* Loglar sınırsız büyüyor mu?
* Aynı hata tekrar tekrar üretiliyor mu?
* Başarılı işlemler gereksiz log şişiriyor mu?
* 200 OK gibi gereksiz kayıtlar tutuluyor mu?
* Asset hataları doğru sınıflandırılıyor mu?
* Kullanıcıya gösterilecek mesaj ile admin log detayı ayrılmış mı?
* Render memory logları sistemi yavaşlatıyor mu?
* Loglar filtrelenebiliyor mu?
* Eski loglar temizlenebiliyor mu?
* Kritik hatalar öncelikli görünüyor mu?

⸻

7.3. Admin Market Yönetimi

Kontrol edilecekler:

* Ürün ekleme
* Ürün düzenleme
* Ürün silme/pasifleştirme
* Fiyat kontrolü
* Stok kontrolü
* Görünürlük kontrolü
* Aktif/pasif durumu
* Ürün kalite seviyesi
* Slot mantığı
* Kullanıcı envanteri
* Sahiplik doğrulaması
* Satın alma geçmişi
* Market ürün önizlemesi
* Normal kozmetiklerle çakışma
* Backend doğrulaması
* Kullanıcıya özel uygulama

Admin market tavsiyeleri:

* Ürün global tanımlanmalı, kullanıcıya satın alma sonrası envanter olarak eklenmelidir.
* Kullanıcı sahip olmadığı ürünü aktif edememelidir.
* Aynı slotta iki aktif ürün olmamalıdır.
* Market çerçevesi aktifse normal çerçeve pasif olmalıdır.
* Normal çerçeve aktifse market çerçevesi pasif olmalıdır.
* Aynı mantık avatar, rozet, isim efekti ve profil arka planı için de uygulanmalıdır.

⸻

8. Akıllı Avatar / Çerçeve Yönetim Merkezi Şartları

Bu alan sistemin en kritik alanlarından biridir. Admin panelindeki Akıllı Avatar / Çerçeve Yönetim Merkezi tamamen detaylı incelenecek ve mevcut yapı yeterli değilse sıfırdan yenilenmesi tavsiye edilecektir.

Bu merkezde amaç, avatar ve çerçeveyi her alanda aynı mantıkla, fakat her alanın kendi gerçek boyutunu koruyarak hizalamaktır.

⸻

8.1. Temel Mantık

Admin panelinde yapılan ayarlar, canlı sistemde birebir aynı şekilde uygulanmalıdır.

Ancak burada kritik kural şudur:

Admin ayarı alanın gerçek boyutunu değiştirmeyecektir.

Yani:

* Liderlik kartı büyükse büyük kalacak.
* Crash üst bar küçükse küçük kalacak.
* Hesabım profil kartı hangi boyuttaysa o boyutta kalacak.
* Market kartı hangi boyuttaysa o boyutta kalacak.
* Oyun üst barı küçük avatar alanıysa küçük kalacak.

Admin yalnızca:

* Avatarın çerçeve içindeki hizasını,
* Çerçevenin avatarı doğru sarıp sarmadığını,
* Avatar ile çerçeve uyumunu,
* X/Y kaymasını,
* Ölçek uyumunu,
* İç boşluk ve çerçeve oturmasını,

kontrol edecektir.

Admin paneli hiçbir zaman tüm alanları aynı boyuta zorlamayacaktır.

⸻

8.2. Doğru Örnek Mantık

Örnek:

Admin panelinde Normal 18. çerçeve ayarlandı ve kaydedildi.

Bu ayar sonrası:

* Liderlik kartında avatar/çerçeve alanı büyükse büyük görünmeye devam edecek.
* Crash üst barda avatar/çerçeve alanı küçükse küçük görünmeye devam edecek.
* Hesabım modalında profil alanı daha büyükse o boyut korunacak.
* Market kartında alan orta boydaysa orta boy korunacak.

Adminin yaptığı ayar yalnızca avatar ile çerçevenin birbirine oturmasını sağlayacaktır.

Yanlış davranış:

* Liderlik kartındaki büyük alan admin ayarı yüzünden küçülür.
* Crash üst bardaki küçük alan admin ayarı yüzünden büyür.
* Tüm alanlar aynı ölçüye zorlanır.
* Çerçeve ayarı container boyutunu bozar.
* Admin önizlemesi gerçek canlı alandan farklı görünür.

Doğru davranış:

* Her alan kendi gerçek slot boyutunu korur.
* Admin ayarı yalnızca avatar/çerçeve hizasını belirler.
* Önizleme ile canlı sonuç birebir aynı olur.

⸻

8.3. Gerçek Tasarım Önizleme Zorunluluğu

Admin panelindeki önizlemeler sahte kutu, basit yuvarlak avatar veya temsili mockup olmayacaktır.

Önizlemeler gerçek tasarımda gösterilecektir.

Örnek:

* Crash üst bar önizlemesi, gerçek Crash üst bar tasarımında gösterilecek.
* Liderlik önizlemesi, gerçek liderlik kartı tasarımında gösterilecek.
* Hesabım modalı önizlemesi, gerçek Hesabım modal kartı içinde gösterilecek.
* Market kartı önizlemesi, gerçek market kartı tasarımında gösterilecek.
* Satranç oyun kartı önizlemesi, gerçek Satranç oyun kartı tasarımında gösterilecek.
* Pişti skor kartı önizlemesi, gerçek Pişti skor kartı tasarımında gösterilecek.

Admin panelinde nasıl görünüyorsa canlı sistemde de aynı görünmelidir.

⸻

8.4. Önizleme Motoru ve Canlı Render Motoru Aynı Olacak

Admin paneli önizlemesi ile canlı sistem farklı kodla çalışmayacaktır.

Zorunlu kural:

* Önizleme motoru = canlı render motoru
* Admin preview CSS = canlı component CSS mantığı
* Admin preview HTML = canlı component HTML yapısına uyumlu
* Ayar sonucu = canlı sonuç

Ayrı ayrı render fonksiyonları kullanılmayacaktır.

Yanlış yapı:

* Admin panelinde ayrı preview kodu
* AnaSayfa’da ayrı avatar kodu
* Crash’te ayrı avatar kodu
* Liderlikte ayrı avatar kodu
* Market’te ayrı avatar kodu

Doğru yapı:

* Tek merkezi render sistemi
* Tüm alanlar variant üzerinden çalışır
* Admin ve canlı sistem aynı ayarları okur

⸻

8.5. Merkezi Render Zorunluluğu

Avatar + çerçeve render işlemi tek merkezden yönetilmelidir.

Önerilen merkezi yapı:

renderAvatarFrame(user, {
  variant: "leaderboard"
});

Her alan kendi variant değerini göndermelidir.

Örnek variantlar:

* homeTopbar
* leaderboard
* accountModal
* accountProfileCard
* marketCard
* crashTopbar
* crashLivePanel
* crashWinNotice
* chessTopbar
* chessGameCard
* pistiTopbar
* pistiScoreCard
* snakeTopbar
* spaceTopbar
* patternTopbar

Bu liste frontend, backend, admin paneli, ayar kayıt sistemi ve canlı render sistemi arasında birebir aynı olmalıdır.

⸻

8.6. Variant Uyumsuzluğu Kontrolü

İnceleme sırasında özellikle şu kontrol yapılacaktır:

* Admin panelinde görünen variantlar backend listesiyle aynı mı?
* Backend kabul ettiği variantları frontend gerçekten kullanıyor mu?
* Canlı sistemde kullanılan variant admin panelinde ayarlanabiliyor mu?
* Admin panelinde olup canlı sistemde kullanılmayan variant var mı?
* Canlı sistemde olup admin panelinde eksik olan variant var mı?
* Kaydedilen ayarlar doğru variant altına yazılıyor mu?
* Mobil/desktop ayrımı varsa doğru fallback çalışıyor mu?

Variant uyumsuzluğu kritik hata sayılacaktır.

⸻

8.7. Alan Boyutu Koruma Kuralı

Her alanın kendi tasarım boyutu korunmalıdır.

Admin ayarları şu şeyleri değiştirmemelidir:

* Alanın toplam genişliği
* Alanın toplam yüksekliği
* Kartın layout ölçüsü
* Üst bar yüksekliği
* Liderlik satır yüksekliği
* Oyun üst bar avatar kutusu
* Modal kart ölçüsü
* Market kart boyutu

Admin ayarları yalnızca şunları değiştirebilir:

* Avatar scale
* Frame scale
* Avatar offset X
* Avatar offset Y
* Frame offset X
* Frame offset Y
* Inner padding
* Outer padding
* Border radius davranışı
* Overflow davranışı
* Mobil/desktop hassas oran

⸻

8.8. Kalınlık Profili

Çerçeveler kalınlık yapısına göre değerlendirilmelidir.

Profil türleri:

* thin
* normal
* thick
* ultra

Kalın çerçevelerde avatar daha kontrollü içeri alınmalıdır. İnce çerçevelerde avatar daha geniş görünebilir. Her çerçeve için tek standart scale zorlanmamalıdır.

⸻

8.9. Normal ve Market Çerçeveleri Tek Sistemde Olacak

Normal çerçeveler ve market çerçeveleri ayrı render sistemleriyle çalışmamalıdır.

Doğru yapı:

* Normal çerçeve de aynı render motorunu kullanır.
* Market çerçevesi de aynı render motorunu kullanır.
* Fallback çerçeve de aynı render motorunu kullanır.
* Çerçevesiz durum da aynı merkezden yönetilir.

Yanlış yapı:

* Normal çerçeve başka CSS ile,
* Market çerçevesi başka HTML ile,
* Admin önizlemesi başka mantıkla,
* Oyunlar başka render ile çalışır.

⸻

8.10. Admin Yönetim Akışı

Admin panelinde akış şu şekilde olmalıdır:

1. Çerçeve tipi seçilir.
2. Çerçeve seçilir.
3. Variant / alan seçilir.
4. Gerçek tasarım önizlemesi açılır.
5. Avatar ve çerçeve hizalama ayarları yapılır.
6. Önizleme güncellenir.
7. Kaydet yapılır.
8. Ayar Firebase/backend’e yazılır.
9. Canlı sistem aynı ayarı okur.
10. Tüm ilgili alanlarda birebir uygulanır.

⸻

8.11. Admin Butonları ve Kullanım Standardı

Admin panelinde kontroller kullanıcı dostu olmalıdır.

Kontroller:

* Avatar büyüt
* Avatar küçült
* Çerçeve büyüt
* Çerçeve küçült
* Avatar yukarı
* Avatar aşağı
* Avatar sola
* Avatar sağa
* Çerçeve yukarı
* Çerçeve aşağı
* Çerçeve sola
* Çerçeve sağa
* Varsayılana dön
* Önizleme yap
* Kaydet

Kaydet butonu kırmızı olabilir. Önizleme yap butonu yeşil olabilir. Butonlar yazı ve ikonla anlaşılır olmalıdır.

⸻

8.12. Kayıt Sonrası Kaybolmama Şartı

Admin panelinde yapılan ayarlar:

* Sayfa yenilenince kaybolmamalı.
* Deploy sonrası kaybolmamalı.
* Cache temizlenince kaybolmamalı.
* Başka admin panel ekranına geçince sıfırlanmamalı.
* Aynı çerçeve tekrar açıldığında son kayıtlı ayar gelmeli.
* Mobil/desktop varyantları doğru okunmalı.
* Eksik variant varsa default ayar doğru kullanılmalı.

⸻

8.13. Avatar/Çerçeve Kabul Kriterleri

Bu alan tamamlanmış sayılabilmesi için:

* Admin önizlemesi gerçek tasarımla birebir olmalıdır.
* Canlı sistem admin önizlemesiyle aynı görünmelidir.
* Her alan kendi boyutunu korumalıdır.
* Avatar/çerçeve ayarı alan boyutunu bozmamalıdır.
* Tüm variantlar admin, frontend ve backend’de eşleşmelidir.
* Normal ve market çerçeveleri aynı merkezden çalışmalıdır.
* Mobil ve desktop görünüm tutarlı olmalıdır.
* Kaydet sonrası ayarlar kaybolmamalıdır.
* Eski bağımsız avatar render kodları tespit edilmelidir.
* Gereksiz kopya render sistemleri raporlanmalıdır.

⸻

9. Oyun Mantığına Göre Sistem Tavsiyeleri

9.1. Genel Hedef

Her oyun kendi mantığına uygun, adil, güvenli ve kullanıcı dostu sistemlerle çalışmalıdır.

Oyunlar yalnızca görsel olarak çalışıyor diye yeterli kabul edilmeyecektir. Oyun mantığı, ödül sistemi, skor, bahis, kullanıcı hakkı, backend doğrulaması ve kötüye kullanım riskleri ayrıca analiz edilecektir.

⸻

9.2. Oyunlarda Olması Gereken Ortak Sistemler

Her oyunda aşağıdaki sistemler kontrol edilmeli ve eksikler tavsiye olarak raporlanmalıdır:

* Başlatma güvenliği
* Oyun durumu yönetimi
* Pause / resume ihtiyacı
* Oyun bitiş doğrulaması
* Skor doğrulaması
* Ödül doğrulaması
* Kullanıcı bakiye doğrulaması
* Çift işlem engeli
* Sayfa yenileme davranışı
* Mobil kontrol uyumu
* Oyun içi hata mesajları
* Kullanıcı dostu sonuç mesajları
* Manipülasyon riski
* Backend tarafı güvenlik
* Firebase veri tutarlılığı
* Oyun geçmişi
* Günlük limit / hak sistemi gerekiyorsa kontrol
* Bot varsa bot mantığı
* Timer varsa doğru temizleme
* Interval varsa doğru durdurma

⸻

9.3. Oyun Sonuç Mesajları

Yanlış mesaj:

Reward transaction failed.

Doğru mesaj:

Ödülün şu anda işlenemedi. Lütfen tekrar dene.

Yanlış mesaj:

Score validation error.

Doğru mesaj:

Skorun doğrulanırken bir sorun oluştu. Lütfen oyunu tekrar başlat.

Yanlış mesaj:

Insufficient balance backend reject.

Doğru mesaj:

Bakiyen bu işlem için yeterli değil.

⸻

10. Gereksiz Kod, Klasör ve Dosya İncelemesi

10.1. Genel Hedef

ZIP içeriğinde gereksiz yük oluşturan, kullanılmayan, eski, tekrar eden, kalıntı veya yanlış yerde bulunan tüm dosyalar raporlanacaktır.

Bu inceleme sonunda hiçbir dosya silinmeyecek; yalnızca hangi dosyaların neden riskli veya gereksiz göründüğü yazılacaktır.

⸻

10.2. Kontrol Edilecek Gereksiz Yapılar

Aşağıdaki tüm yapılar aranacaktır:

* Kullanılmayan JavaScript dosyaları
* Kullanılmayan CSS dosyaları
* Kullanılmayan HTML parçaları
* Eski oyun dosyaları
* Kaldırılmış sistem kalıntıları
* Phase / legacy dosyaları
* Gereksiz importlar
* Kullanılmayan fonksiyonlar
* Kullanılmayan class/id yapıları
* Duplicate assetler
* Aynı işi yapan farklı dosyalar
* Tek dosyada olması gereken ama dağılmış küçük parçalar
* Modül olması gerekirken tek dosyada şişmiş kodlar
* Boş klasörler
* Paketleme kirliliği
* __MACOSX ve ._* dosyaları
* Gereksiz test/debug dosyaları
* Console/debug kalıntıları
* Yorum satırında bırakılmış eski kodlar
* Kullanıcıya yüklenmemesi gereken admin dosyaları
* Admin’e özel dosyaların public tarafta gereksiz yüklenmesi
* Oyunlara özel dosyaların AnaSayfa’da yüklenmesi

⸻

10.3. Kod Dağınıklığı İncelemesi

Kod organizasyonu şu kurallara göre kontrol edilecektir:

* Aynı fonksiyon farklı dosyalarda tekrar yazılmamalı.
* Avatar render tek merkezden yapılmalı.
* Toast mesajları tek merkezden yönetilmeli.
* Firebase işlemleri ortak servis mantığında toplanmalı.
* Oyunlar ortak üst bar sistemini kullanmalı.
* Admin API çağrıları standart olmalı.
* Market sahiplik kontrolü tek merkezden yapılmalı.
* Modal açma/kapatma sistemi tek standartla çalışmalı.
* Kullanıcı auth state yönetimi parçalanmamalı.

⸻

11. Backend / Firebase / Sunucu İncelemesi

11.1. Genel Hedef

Backend ve Firebase yapısı hızlı, güvenli, sürdürülebilir ve kullanıcı dostu mesaj sistemine uyumlu olmalıdır.

İnceleme sırasında backend davranışı yalnızca endpoint var mı diye kontrol edilmeyecek; veri doğrulama, işlem güvenliği, idempotency ve performans açısından da değerlendirilecektir.

⸻

11.2. Kontrol Edilecekler

* Auth kontrolü
* Admin yetki kontrolü
* Kullanıcı veri izolasyonu
* Bakiye işlemleri
* Market satın alma
* Market aktif etme
* Çark ödülü
* Promo ödülü
* Oyun ödülleri
* Leaderboard okuma
* Bildirim okuma
* Log yazma
* Render log yazma
* Firebase collection yapısı
* Gereksiz veri çekimi
* Realtime listener kullanımı
* Transaction kullanımı
* Aynı işlemin iki kez yazılma riski
* Hata mesajı dönme standardı
* Kullanıcıya teknik hata sızması

⸻

11.3. Backend Kabul Kriterleri

Backend tarafında:

* Kritik işlemler yalnızca frontend kontrolüne bırakılmamalı.
* Ödül ve bakiye işlemleri transaction/idempotency ile güvenli olmalı.
* Admin işlemleri yetki doğrulamalı olmalı.
* Kullanıcı sahip olmadığı ürünü aktif edememeli.
* E-posta doğrulaması gereken işlemler backend’de de kontrol edilmeli.
* Teknik hata kullanıcıya doğrudan dönmemeli.
* Loglar sistemi yavaşlatacak kadar şişmemeli.

⸻

12. Mobil Uyumluluk İncelemesi

12.1. Genel Hedef

PlayMatrix AnaSayfa, oyunlar ve admin paneli mobilde sorunsuz kullanılmalıdır.

Kontrol edilecek cihaz türleri:

* Küçük telefon ekranı
* Büyük telefon ekranı
* Tablet
* Masaüstü

⸻

12.2. Kontrol Edilecekler

* Modal taşmaları
* Üst bar kırılmaları
* Dropdown taşmaları
* Oyun canvas boyutları
* Kart dizilimleri
* Buton basılabilirlik alanları
* Toast konumu
* Admin tablo taşmaları
* Market kartları
* Avatar/çerçeve hizalaması
* Klavye açıldığında form alanları
* Dikey/yatay ekran davranışı

⸻

13. Güvenlik İncelemesi

13.1. Genel Hedef

Sistem kullanıcı manipülasyonuna, yetkisiz admin erişimine, frontend hilelerine ve veri tutarsızlığına karşı incelenecektir.

⸻

13.2. Kontrol Edilecekler

* Admin route koruması
* Admin API koruması
* Kullanıcı rol doğrulaması
* Bakiye manipülasyonu
* Ödül manipülasyonu
* Market sahiplik manipülasyonu
* Oyun skor manipülasyonu
* Promo tekrar kullanımı
* Çark tekrar kullanımı
* Firebase rules uyumu
* Public config sızıntısı riski
* Kullanıcıya teknik hata sızması
* XSS riski
* Inline script yoğunluğu
* Dış kaynak/CSP ihtiyacı

⸻

14. Final Rapor Formatı

İnceleme sonunda rapor şu yapıda hazırlanmalıdır:

1. Genel özet
2. ZIP dosya ağacı özeti
3. Kritik bulgular
4. Yüksek riskli bulgular
5. Orta riskli bulgular
6. Düşük riskli bulgular
7. İyileştirme tavsiyeleri
8. AnaSayfa detaylı inceleme
9. Tüm oyunlar detaylı inceleme
10. Admin paneli detaylı inceleme
11. Akıllı Avatar / Çerçeve Yönetim Merkezi özel inceleme
12. Performans ve hız incelemesi
13. Backend / Firebase / sunucu incelemesi
14. Kullanıcı dostu mesaj standardı incelemesi
15. Gereksiz dosya / kod / klasör analizi
16. Mobil uyumluluk analizi
17. Güvenlik analizi
18. Öncelikli yapılacaklar listesi
19. Kabul kriterleri
20. Sonuç ve profesyonel değerlendirme

⸻

15. Genel Kabul Kriterleri

Bu şartnameye göre inceleme tamamlanmış sayılabilmesi için:

* AnaSayfa tüm alt alanlarıyla incelenmiş olmalıdır.
* Tüm oyunlar ayrı ayrı incelenmiş olmalıdır.
* Admin paneli tüm kritik alanlarıyla incelenmiş olmalıdır.
* Akıllı Avatar / Çerçeve Yönetim Merkezi çok detaylı analiz edilmiş olmalıdır.
* Performans riskleri net çıkarılmış olmalıdır.
* Sunucu/Firebase/backend/render memory teknik mesajlarının kullanıcıya sızma riski incelenmiş olmalıdır.
* Kullanıcı dostu mesaj önerileri verilmiş olmalıdır.
* Oyun mantığına göre eksik sistem tavsiyeleri verilmiş olmalıdır.
* Gereksiz kod, dosya, klasör ve tekrar eden yapı riskleri yazılmış olmalıdır.
* Her bulgu kanıtlı, açıklamalı ve çözüm önerili olmalıdır.
* Hiçbir dosyada değişiklik yapılmamış olmalıdır.
* Rapor yüzeysel değil, profesyonel ve uygulanabilir olmalıdır.

⸻

16. Sonuç

Bu şartnameye göre yapılacak çalışma, PlayMatrix ZIP içeriğinin yalnızca basit bir gözden geçirmesi değildir.

Bu çalışma:

* AnaSayfa’yı,
* Tüm oyunları,
* Admin panelini,
* Avatar + çerçeve yönetim merkezini,
* Market sistemini,
* Bildirim sistemini,
* Kullanıcı mesajlarını,
* Backend/Firebase akışlarını,
* Performans risklerini,
* Gereksiz kod ve dosya fazlalıklarını,
* Mobil uyumluluğu,
* Güvenliği,
* Oyun mantığına uygun eksik sistemleri,

en ince ayrıntısına kadar analiz edecek profesyonel bir denetim şartnamesidir.

En kritik özel alan Akıllı Avatar / Çerçeve Yönetim Merkezi olacaktır. Bu alan gerçek tasarım önizlemesi, canlı sistemle birebir eşleşme, alan boyutu koruma ve merkezi render standardı açısından özellikle derin incelenecektir.

Dosyalara müdahale edilmeyecek; tüm eksikler, hatalar, sorunlar, kusurlar, gereksiz yapılar ve profesyonel geliştirme tavsiyeleri ayrıntılı şekilde raporlanacaktır.