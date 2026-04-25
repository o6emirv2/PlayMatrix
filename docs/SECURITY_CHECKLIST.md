# PlayMatrix Faz 1 Güvenlik Checklist

Bu checklist production deploy öncesi uygulanmalıdır. Gerçek secret, service-account JSON, private key, admin ikinci faktör değeri veya Render panelindeki canlı env değerleri repo içine yazılmaz.

## 1. Firebase / Render Secret Rotate

- [ ] Firebase Console > Project Settings > Service Accounts üzerinden yeni service account key oluştur.
- [ ] Yeni JSON dosyasını lokal makinede base64'e çevir veya Render Secret File olarak yükle.
- [ ] Render Environment içine yalnızca `FIREBASE_KEY_BASE64` veya `FIREBASE_KEY_PATH` gir.
- [ ] Raw `FIREBASE_KEY` production ortamından kaldır.
- [ ] Eski Firebase service account key'i iptal et/sil.
- [ ] Eski key'in kullanıldığı tüm deployment/repo/yerel dosyaları temizle.
- [ ] Render deploy'u yeniden başlat.
- [ ] Deploy loglarında `Raw FIREBASE_KEY kullanımı engellendi`, `Firebase Admin credential bulunamadı` veya `ENV_VALIDATION_FAILED` hatası olmadığını doğrula.

## 2. Repo Secret Hijyeni

- [ ] `.env`, `.env.production`, service-account JSON, private key, token, admin şifresi repo içinde yok.
- [ ] `PROTOKOL+FIREBASE RENDER*.md` veya benzeri özel not dosyaları repo içinde yok.
- [ ] `__MACOSX/` ve `._*` macOS resource fork artıkları final ZIP içinde yok.
- [ ] `.gitignore` secret dosyalarını ve işletim sistemi artıklarını kapsıyor.
- [ ] `npm run check:security-phase0` başarılı.

## 3. Production Env Zorunluları

- [ ] `NODE_ENV=production`
- [ ] `PUBLIC_BASE_URL` HTTPS canonical frontend origin.
- [ ] `PUBLIC_BACKEND_ORIGIN` HTTPS backend origin.
- [ ] `PUBLIC_API_BASE` gerekiyorsa HTTPS API base; boş bırakılırsa backend origin standardı kullanılır.
- [ ] `ALLOWED_ORIGINS` sadece HTTPS production domainlerinden oluşuyor.
- [ ] Private/admin CORS production ortamında yalnız exact `ALLOWED_ORIGINS` eşleşmesiyle açılıyor; preview wildcard kabul edilmiyor.
- [ ] `FIREBASE_KEY_BASE64` veya `FIREBASE_KEY_PATH` tanımlı.
- [ ] `FIREBASE_KEY` production'da boş.
- [ ] `ADMIN_UIDS` ve `ADMIN_EMAILS` tanımlı.
- [ ] `ADMIN_PANEL_SECOND_FACTOR_HASH_HEX` ve `ADMIN_PANEL_SECOND_FACTOR_SALT_HEX` tanımlı.
- [ ] Raw `ADMIN_PANEL_SECOND_FACTOR` production'da boş.
- [ ] Public Firebase web config alanları eksiksiz:
  - `PUBLIC_FIREBASE_API_KEY`
  - `PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `PUBLIC_FIREBASE_PROJECT_ID`
  - `PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `PUBLIC_FIREBASE_APP_ID`
  - `PUBLIC_FIREBASE_MEASUREMENT_ID`
  - `PUBLIC_FIREBASE_DATABASE_URL`

## 4. Frontend Runtime Config Standardı

- [ ] Frontend Firebase config hardcoded fallback içermiyor.
- [ ] Frontend API origin hardcoded production fallback içermiyor.
- [ ] `/api/public/runtime-config` public runtime config için tek kaynak.
- [ ] HTML içindeki `playmatrix-api-url` meta değeri canlı URL taşımaz; sadece runtime override gerekiyorsa deployment sırasında doldurulur.
- [ ] Admin HTML dosyaları production URL hardcode etmez.

## 5. CSP Geçişi

- [ ] `SECURITY_CSP_REPORT_ONLY=1` ile staging/preview ortamında CSP ihlalleri izlenir.
- [ ] Inline `<script>`, `onclick`, `oninput`, `style="..."` kalıntıları temizlenir.
- [ ] Inline JSON-LD için nonce/hash stratejisi uygulanır veya harici JSON-LD dosyasına taşınır.
- [ ] Temizlik tamamlanınca `SECURITY_CSP_STRICT=1` yapılır.
- [ ] Report-only kapatılıp `SECURITY_CSP_REPORT_ONLY=0` ile enforcement doğrulanır.

## 6. Minimum Son Kontrol

```bash
npm run check:security-phase0
npm run check:server
npm run check:routes
npm run check:html
```

Not: Production secret rotate işlemi koddan yapılamaz; Firebase Console ve Render Dashboard üzerinden manuel yapılmalıdır.

## FIREBASE_KEY legacy uyumluluk notu

Render üzerinde eski `FIREBASE_KEY` raw JSON env değeri varsa servis artık deploy sırasında kırılmaz; değer geçici uyumluluk için okunur ve uyarı loglanır. Kalıcı standart `FIREBASE_KEY_BASE64` veya `FIREBASE_KEY_PATH` olmalıdır.

## Render Firebase Admin Startup Guard

- Render must prefer `FIREBASE_KEY_BASE64` or `FIREBASE_KEY_PATH` for the Admin service account.
- Legacy raw `FIREBASE_KEY` is tolerated only to avoid deploy crash during migration.
- Invalid or incomplete Admin credentials must not prevent the HTTP port from opening; health output must expose Firebase readiness without printing secret material.

## 7. Faz 3 Runtime / CORS / Log Güvenliği

- [ ] `npm run check:runtime-hardening` başarılı.
- [ ] `/api/public/runtime-config` çıktısında yalnız public Firebase web config ve public API origin bulunuyor.
- [ ] `/healthz` ve `/api/healthz` Firebase hata metnini veya credential içeriğini göstermiyor.
- [ ] Production CORS, public route dahil Origin header geldiğinde yalnız `ALLOWED_ORIGINS` exact eşleşmesine izin veriyor.
- [ ] Socket bağlantılarında request id üretiliyor ve kritik socket hata kayıtlarına taşınıyor.
- [ ] Rate limit cevaplarında `requestId` dönüyor.
- [ ] Log redaction private key, bearer token, Firebase key, admin ikinci/üçüncü faktör, hash/salt ve uzun hex değerlerini maskeleyebiliyor.
- [ ] `ADMIN_HEALTH_SURFACE_ENABLED=1` production’da yalnız admin guard arkasındaki sağlık ekranını açıyor; public health yüzeyi minimal kalıyor.

