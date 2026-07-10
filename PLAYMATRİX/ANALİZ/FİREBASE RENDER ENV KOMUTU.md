FİREBASE VE RENDER ENV KISIMLARINI SATIR SATIR İNCELE VE KAYDET ARTIK TÜM SOHBETLERDE BU FİREBASE VE RENDER ENV ÜZERİNDEN İLERLEYECEĞİZ

⸻

"RENDER ENVİRONMENT VARİABLES"

ADMIN_EMAILS=o6emirv2@gmail.com
ADMIN_UIDS=h2KSWtcmGWX7xNqntgyGabV14rQ2

ADMIN_PANEL_SECOND_FACTOR_HASH_HEX=<MEVCUT_RENDER_DEĞERİNİ_AYNEN_KORUYUN>
ADMIN_PANEL_SECOND_FACTOR_SALT_HEX=<MEVCUT_RENDER_DEĞERİNİ_AYNEN_KORUYUN>
ADMIN_PANEL_THIRD_FACTOR_NAME=<MEVCUT_RENDER_DEĞERİNİ_AYNEN_KORUYUN>

ALLOWED_ORIGINS=https://playmatrix.com.tr,https://www.playmatrix.com.tr,https://emirhan-siye.onrender.com

CHESS_BOT_MOVE_DELAY_MS=3000
CHESS_DISCONNECT_GRACE_MS=90000
CHESS_RESULT_RETENTION_MS=120000
MATCH_QUEUE_TTL_MS=120000

FIREBASE_KEY=<MEVCUT_FIREBASE_ADMIN_SERVICE_ACCOUNT_DEĞERİNİ_AYNEN_KORUYUN>
FIREBASE_PROJECT_ID=playmatrixpro-b18b7
FIREBASE_STORAGE_BUCKET=playmatrixpro-b18b7.firebasestorage.app
FIREBASE_EMAIL_CONTINUE_URL=https://playmatrix.com.tr

PUBLIC_FIREBASE_API_KEY=AIzaSyANhKrb7zuSzXouFq03Q_oWQJCQUglCNhE
PUBLIC_FIREBASE_APP_ID=1:401147567674:web:37f609d8527e61a72c5f03
PUBLIC_FIREBASE_AUTH_DOMAIN=playmatrixpro-b18b7.firebaseapp.com
PUBLIC_FIREBASE_MEASUREMENT_ID=G-HEDD2B0T9H
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=401147567674
PUBLIC_FIREBASE_PROJECT_ID=playmatrixpro-b18b7
PUBLIC_FIREBASE_STORAGE_BUCKET=playmatrixpro-b18b7.firebasestorage.app

PUBLIC_BASE_URL=https://playmatrix.com.tr
PUBLIC_BACKEND_ORIGIN=https://emirhan-siye.onrender.com

NODE_ENV=production

RUNTIME_LOG_MAX=1500
RUNTIME_LOG_RETENTION_HOURS=168
RUNTIME_LOG_DUPLICATE_WINDOW_MS=60000

FIRESTORE_CLEANUP_ENABLED=0
FIRESTORE_CLEANUP_DRY_RUN=1

SECURITY_CSP_REPORT_ONLY=1
SECURITY_CSP_STRICT=0

⸻

"FİREBASE CONFİG"

npm install firebase

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyANhKrb7zuSzXouFq03Q_oWQJCQUglCNhE",
  authDomain: "playmatrixpro-b18b7.firebaseapp.com",
  projectId: "playmatrixpro-b18b7",
  storageBucket: "playmatrixpro-b18b7.firebasestorage.app",
  messagingSenderId: "401147567674",
  appId: "1:401147567674:web:37f609d8527e61a72c5f03",
  measurementId: "G-HEDD2B0T9H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);