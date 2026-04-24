# CSP Strict Migration Plan — FAZ 4

FAZ 4 ile `unsafe-inline` bağımlılığı kaldırılarak frontend yüzeyleri `SECURITY_CSP_STRICT=1` için hazır hale getirildi. Hedef, production ortamında inline script/event/style bağımlılığını kaldırmak ve kullanıcı verisini ham HTML string içine basma riskini azaltmaktır.

## Uygulanan Standart

- HTML içindeki inline `<script>` blokları harici JS dosyalarına taşındı.
- HTML içindeki inline `<style>` blokları harici CSS dosyalarına taşındı.
- `onclick`, `oninput`, `onerror` ve benzeri inline event handler kullanımları kaldırıldı.
- Statik buton/event bağları `addEventListener` tabanlı köprüye alındı.
- Inline `style="..."` attribute değerleri CSS class karşılıklarına taşındı.
- JSON-LD içerikleri `public/jsonld/` altına dış dosya stratejisiyle taşındı.
- `public/playmatrix-runtime.js` toast render’ı `innerHTML` yerine DOM node üretimiyle yapıldı.
- `public/avatar-frame.js` frame/avatar fallback davranışı inline `onerror` yerine capture-phase `error` listener ile yapıldı.
- Crash/Pişti/Satranç tarafında kritik oda/kart/player event bağları inline handler yerine listener/delegation akışına taşındı.

## Strict CSP Açılışı

Staging/preview ortamında önce şu değerlerle test edilir:

```bash
SECURITY_CSP_STRICT=1
SECURITY_CSP_REPORT_ONLY=1
```

Console ve network raporları temizlendikten sonra enforcement açılır:

```bash
SECURITY_CSP_STRICT=1
SECURITY_CSP_REPORT_ONLY=0
```

## Kabul Kontrolleri

```bash
npm run check:html
npm run check:security-phase0
node --check server.js
node tools/check-routes.js
```

Ek doğrulama:

- Ana sayfa login/register/sheet akışları açılır.
- Oyun vitrini, liderlik ve profil shell’i yüklenir.
- Crash/Pişti/Satranç sayfalarında modal ve aksiyon butonları çalışır.
- Admin panel ve health ekranı inline CSP ihlali üretmez.
- Browser console’da `Refused to execute inline script`, `Refused to apply inline style`, `script-src-attr`, `style-src-attr` ihlali görülmez.

## FIREBASE_KEY legacy uyumluluk notu

Render üzerinde eski `FIREBASE_KEY` raw JSON env değeri varsa servis artık deploy sırasında kırılmaz; değer geçici uyumluluk için okunur ve uyarı loglanır. Kalıcı standart `FIREBASE_KEY_BASE64` veya `FIREBASE_KEY_PATH` olmalıdır.
