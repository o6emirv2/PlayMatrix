# Render Firebase Admin Credential Standardı

Bu projede `FIREBASE_KEY_BASE64` değeri Firebase Web Config değil, Firebase Admin Service Account JSON değerinin base64 tek satır halidir.

Doğru kaynak:

1. Firebase Console > Project settings > Service accounts
2. Generate new private key
3. İndirilen JSON dosyasını tek satır base64 yap
4. Render > Environment > `FIREBASE_KEY_BASE64` içine koy

Desteklenen alternatifler:

- `FIREBASE_KEY_PATH`: Render secret file yolu
- Split env:
  - `FIREBASE_PRIVATE_KEY`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PROJECT_ID`
- Uyumluluk için legacy `FIREBASE_KEY`

Bu dosyaya gerçek private key, base64 key veya service account JSON yazılmamalıdır.
