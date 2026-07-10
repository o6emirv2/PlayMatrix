Ekran görüntüsündeki oyun TikTok içinde “Mighty Tiny Team” adıyla sunulan, dikey ekranlı ve tek koridorlu bir casual strategy / lane battler oyunu. Oyunun yayıncısı, tam sürüm notları ve ayrıntılı ekonomi tablosu için kamuya açık, güvenilir bir resmî sayfa bulamadım. TikTok içeriğinin önemli bölümü dış arama motorları tarafından indekslenmediği için aşağıdaki oyun analizi iki kaynağa dayanıyor:

1. Gönderdiğin gerçek oyun ekran görüntüleri
2. TikTok’un güncel resmî Mini Games teknik belgeleri

TikTok Mini Games; indirme gerektirmeden uygulama içinde açılan, Android ve iOS üzerinde çalışan hafif oyunlardır. Kullanıcılar oyuna video yerleşimleri, arama, Minis Center ve daha önce oynananlar gibi farklı giriş noktalarından ulaşabilir.  

TikTok’un güncel teknik modeli Cocos, Unity ve Laya gibi motorlarla oluşturulan paketleri destekliyor. Resmî belgelerde eski H5 çalışma biçimi tarihsel model olarak gösteriliyor; yeni TikTok entegrasyonlarında güncel mini-game runtime öneriliyor.  

Biz oyunu TikTok’a değil doğrudan PlayMatrix web sistemine geliştireceğimiz için TikTok SDK’sını kopyalamamız gerekmiyor. Ancak oyunun hızlı açılış, dikey kullanım, kısa oturum ve tek dokunuşla oynanma prensiplerini PlayMatrix’e aktarabiliriz.

⸻

1. Görsellerden doğrulanan oyun yapısı

Ana savaş sistemi

Görüntüde iki karşılıklı üs bulunuyor. Oyuncu alt bölümdeki asker kartlarına dokunarak birlik üretiyor. Askerler otomatik şekilde koridora çıkıyor, düşmana doğru ilerliyor ve menzile girdiklerinde otomatik saldırıyor.

Doğrulanan bileşenler:

* Oyuncu ve düşman kalesi
* Kalelere ait can göstergesi
* Tek savaş koridoru
* Otomatik ilerleyen askerler
* Yakın ve menzilli asker kartları
* Asker üretim maliyeti
* Zamanla dolan savaş kaynağı
* Pause sistemi
* Savaş hızı artırma
* Bölüm/battlefield sistemi
* Günlük görevler
* Görev ödülü
* Normal ve premium para birimi
* Round içinde kazanılan altın göstergesi
* Reklam karşılığı hız veya kaynak avantajı

Ekranda görünen asker maliyetleri 5 ve 8; mevcut savaş kaynağı ise et simgesiyle gösteriliyor. Bu kaynak yalnızca savaş sırasında asker üretmek için kullanılıyor gibi görünüyor.

Temel oyun döngüsü

Görüntülerden çıkarılan muhtemel döngü:

1. Bölüm başlatılır.
2. Savaş kaynağı otomatik dolar.
3. Oyuncu uygun maliyetli asker üretir.
4. Askerler otomatik ilerler.
5. Karşılaşan askerler otomatik savaşır.
6. Hayatta kalan askerler düşman kalesine saldırır.
7. Düşman kalesinin canı sıfırlanınca bölüm kazanılır.
8. Altın, görev ilerlemesi ve gelişim ödülleri alınır.
9. Yeni askerler, asker seviyeleri veya yeni battlefield açılır.
10. Daha güçlü düşmanlarla döngü tekrar eder.

Bu yapı kısa oturumlarda kolay anlaşılır; ancak birim seçimi, üretim zamanlaması ve kaynak yönetimi sayesinde stratejik karar üretir.

⸻

2. PlayMatrix için özgün oyun önerisi

Oyunu birebir kopyalamak yerine aynı türde, tamamen özgün isim, grafik, karakter, ses, arayüz ve denge sistemiyle geliştirmeliyiz.

Önerilen isim

MATRIX SIEGE: MİNİ ORDU

Alternatifler:

* Matrix Frontline
* Matrix Mini Wars
* Matrix Komutan
* Neon Siege
* Matrix Savunma Hattı

Benim ana önerim Matrix Siege: Mini Ordu. Hem oyun türünü anlatıyor hem PlayMatrix kimliğine uyuyor.

Görsel kimlik

TikTok oyunundaki çizimleri kopyalamayacağız. PlayMatrix sürümü şu kimliğe sahip olacak:

* Koyu Matrix arka plan
* Neon yeşil, turkuaz ve altın vurgu
* Çizgi film ile premium bilimkurgu arasında özgün karakterler
* Kale yerine enerji çekirdeği veya Matrix üssü
* Et kaynağı yerine Enerji
* Mücevher yerine oyun içi Teknoloji Kristali
* Harita isimleri: Neon Ova, Kod Vadisi, Siber Geçit, Kuantum Kale
* Orijinal birlikler, animasyonlar ve sesler

⸻

3. Önerilen savaş mekaniği

Savaş kaynağı

Adı: Enerji

* Başlangıç: 3
* Maksimum: 10
* Yenilenme: saniyede 1
* Bazı birlikler veya yükseltmeler yenilenmeyi artırabilir.
* Enerji yalnızca mevcut savaşta kullanılır.
* PlayMatrix MC bakiyesinden tamamen ayrıdır.

İlk asker kadrosu

Birlik	Maliyet	Rol	Özellik
Kod Koşucusu	3	Hızlı yakın dövüş	Düşük can, yüksek hız
Neon Nişancı	4	Menzilli	Arkadan saldırır
Matrix Muhafızı	6	Tank	Yüksek can, düşük hasar
Pulse Büyücüsü	7	Alan hasarı	Grup düşmanlara etkili
Siber Komutan	9	Destek	Yakındaki birlikleri güçlendirir

İleri seviyelerde:

* Hava birimi
* Kalkan kırıcı
* Şifacı
* Gizli saldırı birimi
* Boss birimi
* Geçici savunma kulesi

eklenebilir.

Birlik davranışı

Her birimde backend tarafından belirlenen sürümlü değerler bulunmalı:

unitId
version
energyCost
maxHp
damage
attackRange
attackCooldown
movementSpeed
targetPriority
specialAbility

Frontend bu değerleri değiştiremez. Admin panelindeki denge ayarları yeni maçlara sürümlü config olarak uygulanır.

Kazanma koşulu

* Düşman enerji çekirdeğinin canı sıfıra iner.
* Süre biterse kalan üs canı karşılaştırılır.
* Eşitse sahadaki toplam birlik canı karşılaştırılır.
* Sonuç yine eşitse beraberlik verilir.

⸻

4. Bölüm ve ilerleme sistemi

Harita yapısı

İlk sürüm için:

* 5 dünya
* Her dünyada 10 bölüm
* Toplam 50 bölüm
* Her 10. bölümde boss savaşı

Örnek:

1. Neon Ova
2. Kod Vadisi
3. Siber Bataklık
4. Kuantum Geçidi
5. Ana Sistem Kalesi

Bölüm yıldızları

Her bölüm en fazla üç yıldız verir:

* Bölümü tamamla
* Üs canının en az %50’sini koru
* Belirlenen süre altında tamamla

Yıldızlar asker veya bölüm kilidi açmakta kullanılabilir. Bu puan PlayMatrix MC’den ayrı olmalıdır.

Zorluk eğrisi

Zorluk yalnızca düşman canını artırarak yapılmamalı. Profesyonel denge için:

* Yeni düşman kombinasyonları
* Farklı spawn ritimleri
* Hızlı saldırı dalgaları
* Zırhlı birlikler
* Menzilli düşmanlar
* Alan hasarı kullanan düşmanlar
* Harita özel etkileri
* Boss yetenekleri

kademeli olarak açılmalı.

⸻

5. Görev ve retention sistemi

Görüntüde günlük görev sistemi doğrulanıyor. PlayMatrix sürümünde görevler şu şekilde olabilir:

* 5 asker üret
* 2 Neon Nişancı üret
* Bir bölümü üs hasarı almadan bitir
* Üç savaş kazan
* Bir boss yen
* Toplam 25 düşman yok et
* Bir savaşı 90 saniye altında tamamla

Ödül seçenekleri:

* Oyun XP’si
* PlayMatrix XP’si
* Kozmetik kart çerçevesi
* Birlik görünümü
* Profil rozeti
* Oyun içi Teknoloji Kristali

PlayMatrix protokolündeki klasik oyun ekonomi standardı korunacaksa oyun MC vermemeli, yalnızca XP ve oyun içi kozmetik ilerleme vermelidir.

⸻

6. Reklam ve hız sistemi

Görüntüde x1.5 hız düğmesi ve video simgesi bulunuyor. TikTok Mini Games SDK resmî olarak tamamlanan ödüllü video reklamları için callback ve ödül kontrolü sağlıyor.  

PlayMatrix web sürümü için üç seçenek var:

Önerilen başlangıç modeli

* 1x normal hız
* 2x hız tüm kullanıcılara ücretsiz
* Pause ücretsiz
* Reklama bağlı zorunlu ilerleme yok

Daha sonra eklenebilecek ödüllü reklam

* Bir defalık ek savaş enerjisi
* Yenilgiden sonra bir kez devam
* Kozmetik sandık
* Bölüm sonunda XP çarpanı

Reklam izlenmediğinde oyun akışı engellenmemeli. Reklam sonucu backend tarafından imzalı doğrulama olmadan ödül üretmemeli.

⸻

7. PlayMatrix’e uygun teknik mimari

Önerilen oyun motoru

PlayMatrix web sitesi için en uygun seçenek Phaser 3.

Phaser, mobil ve desktop web tarayıcılarında WebGL ve Canvas kullanan açık kaynaklı bir HTML5 oyun framework’üdür. MIT lisansı ticari projelerde kullanıma izin verir.  

PixiJS güçlü bir 2D renderer olsa da tam bir oyun framework’ü değildir. Bu projede sahne yönetimi, ses, input, animasyon ve oyun döngüsü gerektiği için Phaser daha uygun olur.  

Dosya yapısı

/games/matrix-siege/
  index.html
  game.js
  game.css
/public/js/games/matrix-siege/
  bootstrap.js
  config.js
  scenes/
    BootScene.js
    PreloadScene.js
    BattleScene.js
    ResultScene.js
  systems/
    BattleEngine.js
    UnitFactory.js
    CombatSystem.js
    EnergySystem.js
    EnemyAI.js
    MissionSystem.js
    AudioSystem.js
    ReplayRecorder.js
  ui/
    BattleHud.js
    UnitBar.js
    MissionCard.js
    ResultModal.js
/assets/games/matrix-siege/
  atlases/
  backgrounds/
  units/
  bases/
  effects/
  audio/

Backend endpointleri

POST /api/v1/games/matrix-siege/start
POST /api/v1/games/matrix-siege/submit
GET  /api/v1/games/matrix-siege/config
GET  /api/v1/games/matrix-siege/progress
GET  /api/v1/games/matrix-siege/missions
POST /api/v1/games/matrix-siege/claim-mission

⸻

8. Anti-cheat ve backend authority

Oyunun tamamını frontend’e bırakmak doğru olmaz.

Önerilen sistem:

1. Backend oyun başlangıcında nonce üretir.
2. Backend bölüm config’i, düşman seed’i ve unit config version döndürür.
3. Client yalnızca oyuncunun asker üretme aksiyonlarını kaydeder.
4. Her aksiyonda:
    * birlik kimliği
    * client timestamp
    * sıra numarası
    * harcanan enerji
    * correlation ID
5. Event timeline maç sonunda backend’e gönderilir.
6. Backend aynı seed ve config ile savaşı tekrar simüle eder.
7. Sonuç tutarlıysa XP ve görev ilerlemesi transaction ile işlenir.
8. Aynı nonce veya submit tekrar kullanılırsa önceki sonuç döndürülür.

Bu model, tam zamanlı sunucu simülasyonundan daha düşük maliyetli; tamamen client-authoritative sistemden ise çok daha güvenlidir.

⸻

9. Mobil arayüz

Ekran oranı

* Ana hedef: 9:16
* Minimum genişlik: 320 px
* Safe-area desteği
* iPhone alt browser bar ve çentik hesabı
* Tabletlerde merkezlenmiş sınırlı oyun alanı
* Desktop kullanıcı sitesinde mevcut PlayMatrix engeli devam eder

Ekran yerleşimi

Üst alan:

* Geri dön
* Oyun adı
* PlayMatrix avatar + frame
* Oyun XP
* Pause

Savaş alanı:

* Günlük görev kartı
* Oyuncu ve düşman üs canı
* Aktif birlikler
* Vuruş efektleri
* Kaynak sayacı

Alt alan:

* Enerji barı
* 4 veya 5 asker kartı
* Birlik maliyeti
* Aktif cooldown
* Hız kontrolü

⸻

10. Admin panel gereksinimleri

Admin şunları yönetebilmeli:

* Oyunu aç/kapat
* Bakım modu
* Bölüm config’leri
* Birlik istatistikleri
* Düşman dalgaları
* Boss değerleri
* Günlük görevler
* XP ödülleri
* Günlük XP limiti
* Anti-cheat toleransları
* Event timeline limitleri
* Oyun config versiyonu
* Aktif oyuncu sayısı
* Tamamlama oranı
* Ortalama maç süresi
* En sık kullanılan birlikler
* En fazla kaybedilen bölümler
* Hata kayıtları

Admin hiçbir maçın sonucunu veya tekil düşman davranışını manuel olarak değiştirememeli.

⸻

11. TikTok modelinden alınabilecek platform ilkeleri

TikTok Mini Games SDK; login, local storage, rewarded ads, ödeme, paylaşım, lifecycle, network ve yetenek kontrolü gibi platform servisleri sunuyor.  

PlayMatrix karşılıkları:

TikTok sistemi	PlayMatrix karşılığı
Silent login	Firebase Auth + backend session
OpenID	Firebase UID
Local storage	Güvenli local cache
TikTok backend profile	Firestore kullanıcı profili
Rewarded ad	İleride reklam sağlayıcı entegrasyonu
In-app purchase	Şimdilik kullanılmayacak
Sharing	Sonuç kartı paylaşımı
Analytics	Backend oyun event analitiği
TikTok leaderboard	PlayMatrix leaderboard

TikTok, kullanıcı profil bilgisinin frontend’den doğrudan güvenilir kabul edilmemesini ve kalıcı oyun varlıklarının değişmez kullanıcı kimliğine bağlanmasını öneriyor. PlayMatrix tarafında aynı rolü Firebase UID ve backend doğrulaması üstlenmeli.  

⸻

12. İlk production kapsamı

İlk sürümün gereksiz büyümemesi için önerilen kapsam:

* 1 özgün oyun
* 3 harita teması
* 20 bölüm
* 5 oyuncu birliği
* 5 düşman birliği
* 2 boss
* 10 günlük görev
* Birlik yükseltme sistemi
* Backend nonce ve replay validation
* Oyun sonucu modalı
* PlayMatrix XP ödülü
* Admin config ekranı
* Mobil 9:16 arayüz
* Avatar + frame topbar entegrasyonu
* Ses aç/kapat
* Pause
* 1x ve 2x hız
* Oyun içi öğretici

Bu kapsam tamamlandıktan sonra yeni dünyalar, kozmetikler ve özel etkinlikler eklenebilir.

⸻

Kritik protokol durumu

Mevcut bağlayıcı PlayMatrix protokolünde aktif oyunlar yalnızca:

* Crash
* Satranç
* Pişti
* Pattern Master
* Space Pro
* Snake Pro

olarak tanımlanmış durumda. Bu nedenle yeni oyun, protokol güncellenmeden yedinci aktif oyun olarak eklenemez.

Kod uygulamasından önce netleştirilmesi gereken tek karar:

Matrix Siege: Mini Ordu yedinci aktif oyun olarak mı eklensin, yoksa mevcut klasik oyunlardan birinin yerine mi geçsin?