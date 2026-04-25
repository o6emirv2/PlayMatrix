# Firebase / Render Secret Rotation Runbook

Bu belge açıkta kalan veya şüpheli hale gelen secret değerleri için uygulanır. Canlı secret değerleri bu dosyaya, issue açıklamalarına, commit mesajlarına veya sohbet dışa aktarımlarına yazılmaz.

## Firebase Service Account Rotate

1. Firebase Console'a gir.
2. Project Settings > Service Accounts bölümünü aç.
3. Yeni private key üret.
4. İndirilen JSON dosyasını repo içine koyma.
5. Lokal makinede base64 üret:

```bash
base64 -w 0 firebase-service-account.json
```

macOS için:

```bash
base64 -i firebase-service-account.json | tr -d '\n'
```

6. Render Dashboard > Environment alanına `FIREBASE_KEY_BASE64` olarak ekle.
7. Alternatif olarak Render Secret File kullanılıyorsa JSON dosyasını secret file olarak yükle ve `FIREBASE_KEY_PATH` değerini o mount path'e ayarla.
8. Raw `FIREBASE_KEY` env değerini production ortamından kaldır.
9. Eski service account key'i Firebase Console'dan sil.
10. Render deploy'u yeniden başlat.
11. Loglarda Firebase Admin init hatası olmadığını doğrula.
12. Lokal JSON dosyasını güvenli şekilde sil veya kurumsal secret manager'a taşı.

## Public Firebase Web Config Rotate

Public web config secret değildir; fakat kod içine fallback olarak gömülmez. Değerler Render env üzerinden sağlanır:

```bash
PUBLIC_FIREBASE_API_KEY=...
PUBLIC_FIREBASE_AUTH_DOMAIN=...
PUBLIC_FIREBASE_PROJECT_ID=...
PUBLIC_FIREBASE_STORAGE_BUCKET=...
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
PUBLIC_FIREBASE_APP_ID=...
PUBLIC_FIREBASE_MEASUREMENT_ID=...
PUBLIC_FIREBASE_DATABASE_URL=...
```

Deploy sonrası `/api/public/runtime-config` endpoint'inin `firebaseReady: true` döndürdüğünü doğrula.

## Admin İkinci Faktör Hash Üretimi

Production'da raw `ADMIN_PANEL_SECOND_FACTOR` kullanılmaz.

```bash
node -e "const crypto=require('crypto'); const p='BURAYA_ADMIN_ŞİFRESİ'; const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.createHash('sha256').update(Buffer.concat([Buffer.from(salt,'hex'),Buffer.from(p)])).digest('hex'); console.log('ADMIN_PANEL_SECOND_FACTOR_SALT_HEX='+salt); console.log('ADMIN_PANEL_SECOND_FACTOR_HASH_HEX='+hash);"
```

Render env içine sadece hash ve salt yazılır.

## Deploy Sonrası Kontrol

```bash
npm run check:security-phase0
npm run check:server
npm run check:routes
```

Production loglarında şu hatalar görülmemelidir:

- `Raw FIREBASE_KEY kullanımı engellendi`
- `Firebase Admin credential bulunamadı`
- `ENV_VALIDATION_FAILED`

## Acil Durum Temizliği

- Eski ZIP dosyalarında `__MACOSX/`, `.env`, service-account JSON veya özel MD notu varsa yeniden temiz ZIP üret.
- Açığa çıkan service account key'i sadece env'den silmek yetmez; Firebase Console'da revoke/delete yapılmalıdır.
- Açığa çıkan admin ikinci faktör değeri hash+salt ile yeniden üretilip eski değer iptal edilmelidir.

## FIREBASE_KEY legacy uyumluluk notu

Render üzerinde eski `FIREBASE_KEY` raw JSON env değeri varsa servis artık deploy sırasında kırılmaz; değer geçici uyumluluk için okunur ve uyarı loglanır. Kalıcı standart `FIREBASE_KEY_BASE64` veya `FIREBASE_KEY_PATH` olmalıdır.

## Render Firebase Admin Deploy Continuity Note

- Production standard remains `FIREBASE_KEY_BASE64` or `FIREBASE_KEY_PATH`.
- Legacy `FIREBASE_KEY` is accepted only for deploy continuity and must be rotated to the standard form.
- If a service-account payload is missing required Admin fields in production, the web service fails fast. Memory-store fallback is disabled for production so persistent data, cron jobs and settlement flows cannot run on temporary storage.
- Supported emergency split fields: `FIREBASE_PRIVATE_KEY_BASE64` or `FIREBASE_PRIVATE_KEY` with `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PROJECT_ID`.

## Render Public Origin Kontrolü

- `PUBLIC_BASE_URL` canonical site origin olmalıdır: `https://playmatrix.com.tr`.
- `CANONICAL_ORIGIN` tanımlıysa uygulama eksik `PUBLIC_BASE_URL` değerini ondan türetir.
- `PUBLIC_BACKEND_ORIGIN` Render servis origin'i olmalıdır.
- `PUBLIC_API_BASE` origin olarak tutulmalıdır; `/api` ile biten eski değerler çalışma anında kök origin'e normalize edilir.
- Deploy logunda `ENV_VALIDATION_FAILED: Üretimde PUBLIC_BASE_URL zorunludur.` görülmemelidir.

## Render Log: Firebase Admin `private_key` Hatası

Görülen hata:

```text
Firebase Admin başlatılamadı: Firebase service account eksik/geçersiz alanlar: private_key
initCrashDb error: FIREBASE_ADMIN_UNAVAILABLE
saveCrashHistory error: FIREBASE_ADMIN_UNAVAILABLE
```

Kök neden: Render ortamındaki `FIREBASE_KEY` değeri Firebase Admin SDK service-account JSON formatında değil veya service-account JSON içinde `private_key` alanı eksik/geçersiz. Firebase Web Config (`apiKey`, `authDomain`, `appId`, `measurementId`) Admin SDK credential yerine kullanılamaz.

Kod davranışı: Production ortamında Firebase Admin credential eksik/geçersizse servis fail-fast davranır ve memory-store fallback açılmaz. Development ortamında cron/job akışları Firebase Admin hazır değilken veri yazmadan kontrollü skip eder; `db.collectionGroup is not a function` hatası üretilmez.

Render üzerinde kalıcı çözüm:

1. Firebase Console > Project Settings > Service Accounts > Generate new private key ile yeni service-account JSON indir.
2. JSON'u repo içine koyma ve sohbet/commit içine yapıştırma.
3. JSON'u tek satır base64 yap.
4. Render Environment içine `FIREBASE_KEY_BASE64` olarak ekle.
5. Eski raw `FIREBASE_KEY` değerini kaldır.
6. Redeploy yap.
7. Logda `[PlayMatrix][firebase] Firebase Admin başlatıldı: FIREBASE_KEY_BASE64` satırını doğrula.

## Render Log: `FIREBASE_KEY_BASE64 JSON parse edilemedi`

Görülen hata:

```text
Firebase Admin başlatılamadı: FIREBASE_KEY_BASE64 JSON parse edilemedi
Unexpected token ... is not valid JSON
```

Kök neden: `FIREBASE_KEY_BASE64=SERVICE_ACCOUNT_JSON_BASE64` gerçek credential değildir; placeholder değerdir. Bu değer base64 gibi okunmaya çalışıldığında JSON'a çevrilemez.

Kod davranışı:

- Placeholder/geçersiz `FIREBASE_KEY_BASE64` artık tek uyarıyla atlanır.
- Varsa `FIREBASE_KEY_PATH`, split env veya legacy `FIREBASE_KEY` denenir.
- Production ortamında geçerli Admin credential yoksa servis başlatılmaz. Development ortamında memory-store yalnızca yerel uyumluluk için kullanılabilir ve cron/job akışları Firestore verisi yazmadan skip eder.

Doğru değer üretimi:

```bash
base64 -w 0 firebase-service-account.json
```

Render'a yazılacak değer örneği:

```env
FIREBASE_KEY_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiwi...
```

Yanlış değer:

```env
FIREBASE_KEY_BASE64=SERVICE_ACCOUNT_JSON_BASE64
```

## Static Frontend Runtime Fallback

`playmatrix.com.tr` statik/CDN üzerinden açıldığında `/api/public/runtime-config` aynı origin üzerinde bulunamayabilir. Bu durumda login ekranında `PUBLIC_FIREBASE_CONFIG_MISSING`, profil/çark işlemlerinde `405`, oyuncu istatistiklerinde `404` görülebilir.

Kalıcı frontend düzeltmesi:

- `public/playmatrix-static-runtime.js` public Firebase Web Config ve Render backend origin fallback sağlar.
- HTML giriş noktaları hardcoded backend origin taşımaz; production backend origin `public/playmatrix-static-runtime.js` üzerinden tek kaynak olarak sağlanır.
- Root HTML içindeki eski statik meta CSP kaldırıldı; production CSP sunucu Helmet headerları üzerinden uygulanır ve statik CDN fallback Render API originini engellemez.

## Render 2026-04-25 runtime düzeltmesi

- `ALLOWED_ORIGINS` değerlerinde `https//` yazımı geçersizdir; her origin `https://` protokolüyle başlamalıdır.
- `FIREBASE_KEY_BASE64` raw JSON veya placeholder değil, tek satırlık base64 service-account JSON olmalıdır.
- Telefonda deploy yönetimi için daha güvenli alternatif: Render Secret File `firebase-service-account.json` + `FIREBASE_KEY_PATH=/etc/secrets/firebase-service-account.json`.
- Firebase Admin credential hazır değilken public leaderboard endpoint'i artık 500 üretmez; boş/degraded payload döner.
- Auth session bootstrap Firebase Admin yokken 401 yerine 503 verir; frontend bunu geçici altyapı durumu olarak işler ve istek fırtınasını backoff ile keser.

## Render 2026-04-25 Auth Degraded Mode Fix

Görülen yeni runtime hata zinciri:

```text
Firebase Admin devre dışı: Firebase service account eksik/geçersiz alanlar: private_key
POST /api/auth/session/create statusCode=503
POST /api/profile/update statusCode=401
POST /api/wheel/spin statusCode=401
```

Kök neden: Firebase Admin service-account credential hâlâ geçerli değil. Web client Firebase ile giriş yapabiliyor olsa bile backend `verifyIdToken` için Admin SDK'ya bağımlı kaldığı için server session bootstrap 503'e düşüyordu.

Kod davranışı artık şöyledir:

- Geçerli Admin credential varsa normal Firestore/Admin SDK yolu kullanılır.
- Admin credential yoksa servis kapanmaz; Firebase Auth REST `accounts:lookup` ile ID token doğrulaması yapılır.
- Admin credential yokken geçici bellek tabanlı Firestore uyumluluk katmanı devreye girer.
- Login/session, profil kaydetme ve günlük çark endpointleri Render üzerinde 503/401 hata fırtınası üretmeden çalışabilir.
- Bu mod kalıcı veri garantisi vermez; servis restart olursa memory-store verisi sıfırlanır. Kalıcı çözüm hâlâ gerçek `FIREBASE_KEY_BASE64` veya `FIREBASE_KEY_PATH` service-account credential eklemektir.

Telefonla yönetimde en az hata üreten yöntem:

1. Firebase Console > Project settings > Service accounts > Generate new private key.
2. JSON içeriğini Render Secret File olarak ekle.
3. Env değişkeni olarak `FIREBASE_KEY_PATH=/etc/secrets/firebase-service-account.json` tanımla.
4. Yanlış/placeholder `FIREBASE_KEY_BASE64` değerini kaldır.
5. Redeploy yap.
