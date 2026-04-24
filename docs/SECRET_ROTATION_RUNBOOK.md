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
- If a service-account payload is missing required Admin fields, the web service starts in Firebase-degraded mode instead of exiting before the port opens. Replace the credential immediately; authenticated and database-backed APIs require a valid Firebase Admin credential.
- Supported emergency split fields: `FIREBASE_PRIVATE_KEY_BASE64` or `FIREBASE_PRIVATE_KEY` with `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PROJECT_ID`.
