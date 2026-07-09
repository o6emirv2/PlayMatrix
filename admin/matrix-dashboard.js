import { preventUserInterference, initMatrixRain, adminFetch, setSecurityKey, clearSecurityKey, money, formatWhen, resolveAdminUrl } from './matrix-core.js';

preventUserInterference();
initMatrixRain(document.getElementById('matrixCanvas'), { fontSize: 14 });

const INDEX_URL = resolveAdminUrl('./index.html');
const BRAND_LOGO_URL = '/public/assets/images/logo.png';
const root = document.getElementById('adminRoot');
const loader = document.getElementById('adminLoader');

function redirectOut() {
  clearSecurityKey();
  window.location.replace(INDEX_URL);
}

function panelTemplate() {
  return `
    <div class="admin-app">
      <section class="topbar">
        <div class="brand">
          <img src="${BRAND_LOGO_URL}" alt="PlayMatrix" />
          <div>
            <h1>PLAYMATRİX ADMIN KONTROL MERKEZİ</h1>
            <p>Gerçek zamanlı operasyon, ekonomi, güvenlik ve bakım yönetimi aktif.</p>
          </div>
        </div>
        <div class="top-actions">
          <button id="dashboardRefreshBtn" class="ghost" type="button">VERİLERİ YENİLE</button>
          <button id="dashboardLogoutBtn" class="danger" type="button">GÜVENLİ ÇIKIŞ</button>
        </div>
      </section>

      <section class="panel stack">
        <div>
          <h2>DASHBOARD İSTATİSTİKLERİ</h2>
          <p class="lead">Toplam kullanıcı, gün içi MC hareketi, kâr-zarar, açık oda ve moderasyon durumları canlı olarak izlenir.</p>
        </div>
        <div class="summary-strip" id="metricGrid"></div>
      </section>

      <div class="layout-hero">
        <section class="panel stack">
          <div>
            <h2>TOPLU DURUM SIFIRLAMA</h2>
            <p class="lead">Tek kullanıcı, seçili kullanıcılar veya tüm kullanıcılar için PlayMatrix state alanlarını önizleme + reauth + audit akışıyla sıfırlayın.</p>
          </div>
          <div class="field-grid reset-target-grid">
            <div class="field"><label for="resetTargetScope">Hedef</label><select id="resetTargetScope"><option value="all">Tüm kullanıcılar</option><option value="single">Tek kullanıcı</option><option value="selected">Seçili kullanıcılar</option></select></div>
            <div class="field pm-admin-grid-span-all"><label for="resetTargetIdentifiers">Kullanıcı adı / e-posta / UID</label><textarea id="resetTargetIdentifiers" rows="2" placeholder="Tek kullanıcı veya virgülle ayrılmış seçili kullanıcılar"></textarea></div>
            <label class="check reset-filter-check"><input id="resetExcludeTests" type="checkbox" checked /> <span>Test kullanıcılarını hariç tut</span></label>
          </div>
          <div class="check-grid" id="resetFieldGrid"></div>
          <div class="action-row"><button id="previewResetBtn" class="ghost" type="button">ÖNİZLEME AL</button><button id="runResetBtn" class="danger" type="button">SIFIRLAMA İŞLEMİNİ BAŞLAT</button></div>
          <div class="reset-preview" id="resetPreviewBox" hidden></div>
        </section>

        <section class="panel stack maintenance-panel admin-maintenance-modal" aria-labelledby="maintenancePanelTitle">
          <div class="maintenance-modal-header">
            <div class="maintenance-heading-copy">
              <h2 id="maintenancePanelTitle">BAKIM MODU</h2>
              <p class="lead">Crash, Satranç, Pişti ve tüm servis bakım durumlarını kalıcı config ile yönet. Kaydedilen alan kullanıcı tarafında kesin kapanır; bakım kapatıldığında yeniden erişime açılır.</p>
            </div>
            <span class="maintenance-live-badge">CANLI KONTROL</span>
          </div>
          <div class="maintenance-modal-body">
            <div class="maintenance-priority-strip" aria-label="Öncelikli oyun bakım alanları">
              <span>CRASH</span><span>SATRANÇ</span><span>PİŞTİ</span>
            </div>
            <div class="maintenance-grid" id="maintenanceGrid"></div>
            <div class="maintenance-summary" id="maintenanceSummaryBox">Bakım durumu yükleniyor.</div>
            <div id="maintenanceNotificationSlot" class="maintenance-notification-slot"></div>
          </div>
          <div class="maintenance-modal-footer">
            <div class="maintenance-footer-copy"><strong>Kalıcı kayıt</strong><span>Kaydet sonrası server onaylı durum tekrar okunur.</span></div>
            <div class="action-row"><button id="saveMaintenanceBtn" class="danger" type="button">BAKIM AYARLARINI KAYDET</button></div>
          </div>
        </section>
      </div>

      <section class="panel stack crash-control-panel">
        <div>
          <h2>CRASH ÇARPAN / RİSK KONTROLÜ</h2>
          <p class="lead">Crash risk aralıklarını, aktif geri sayım turunu ve sonraki tur çarpan ayarını güvenli doğrulamayla yönetin.</p>
        </div>
        <div class="crash-control-summary" id="crashRiskSummary">Kontrol bilgileri hazırlanıyor.</div>
        <div class="field-grid">
          <div class="field"><label for="nextCrashPointInput">Crash Çarpanı</label><input id="nextCrashPointInput" type="text" inputmode="decimal" autocomplete="off" placeholder="Örn: 2.50 veya 2,50" /></div>
          <div class="field"><label for="crashAdminRiskLimitInput">Crash Max / Admin Risk Limit (MC)</label><input id="crashAdminRiskLimitInput" type="number" min="1" step="1" placeholder="1000000" /></div>
          <div class="field pm-admin-grid-span-all"><label for="futureCrashPointsInput">Gelecek 1-100 El Çarpanı</label><textarea id="futureCrashPointsInput" placeholder="Örn: 1.30, 2.50, 10.00 — en fazla 100 değer"></textarea></div>
        </div>
        <div class="crash-control-hint" id="crashControlHint">Aktif geri sayım butonu yalnızca round COUNTDOWN aşamasındayken çalışır. Uçuş başladıysa sonraki round butonunu kullan.</div>
        <div class="action-row">
          <button id="setCurrentCrashPointBtn" type="button" disabled>AKTİF GERİ SAYIM ROUNDUNA UYGULA</button>
          <button id="setNextCrashPointBtn" type="button" disabled>SONRAKİ ROUND İÇİN KAYDET</button>
          <button id="clearNextCrashPointBtn" class="ghost" type="button" disabled>ÇARPAN OVERRIDE TEMİZLE</button>
          <button id="saveFutureCrashPointsBtn" type="button" disabled>GELECEK 1-100 ELİ KAYDET</button>
          <button id="clearFutureCrashPointsBtn" class="ghost" type="button" disabled>GELECEK EL LİSTESİNİ TEMİZLE</button>
          <button id="saveCrashRiskLimitBtn" class="warn" type="button" disabled>CRASH MAX LİMİTİ KAYDET</button>
        </div>
        <div class="table-wrap crash-risk-table-wrap"><table class="crash-risk-table"><thead><tr><th>Min</th><th>Max</th><th>Ağırlık</th></tr></thead><tbody id="crashRiskRows"></tbody></table></div>
        <div class="action-row">
          <button id="saveCrashRiskBtn" type="button">RİSK TABLOSUNU KAYDET</button>
          <button id="resetCrashRiskBtn" class="warn" type="button">VARSAYILAN RİSK TABLOSUNA DÖN</button>
        </div>
      </section>


      <section class="panel stack" id="wheelAdminPanel">
        <div>
          <h2>GÜNLÜK ÇARK KONTROLÜ</h2>
          <p class="lead">Çark aktiflik durumunu ve ağırlıklı ödül havuzunu güvenli doğrulamayla yönet.</p>
        </div>
        <div class="field-grid">
          <div class="field"><label for="wheelActiveSelect">Çark Durumu</label><select id="wheelActiveSelect"><option value="true">Aktif</option><option value="false">Kapalı</option></select></div>
          <div class="field pm-admin-grid-span-all"><label for="wheelRewardsText">Ödül Havuzu</label><textarea id="wheelRewardsText" rows="8" placeholder="Her satır: tür|etiket|miktar/id|ağırlık\nmc|10.000 MC|10000|8\nxp|500 XP|500|4\nempty|Boş|0|1"></textarea></div>
        </div>
        <div class="crash-control-hint">Türler: mc, xp, empty. Ağırlık yükseldikçe çıkma ihtimali artar. Teknik kelimeler kullanıcıya gösterilmez.</div>
        <div class="action-row">
          <button id="reloadWheelConfigBtn" type="button" class="ghost">ÇARK AYARINI YENİLE</button>
          <button id="saveWheelConfigBtn" type="button">ÇARK AYARINI KAYDET</button>
        </div>
      </section>

      <section class="panel stack" id="marketAdminPanel">
        <div>
          <h2>MARKET ÇERÇEVE / ÜRÜN FİYAT VE STOK YÖNETİMİ</h2>
          <p class="lead">Aktif market ürünlerinin MC fiyatı, stok, görünürlük ve genel market durumu admin onayıyla yönetilir.</p>
        </div>
        <div class="market-status-admin-card">
          <div>
            <strong>Market Durumu</strong>
            <span id="marketGlobalStatusText">Durum yükleniyor...</span>
          </div>
          <button id="toggleMarketStatusBtn" type="button" class="table-mini-action" data-market-next-enabled="false">MARKETİ KAPAT</button>
        </div>
        <div class="market-refund-card">
          <div>
            <strong>Market Ürün İadesi</strong>
            <span>Kullanıcı adı veya e-posta önceliklidir. UID ek doğrulama olarak kullanılabilir.</span>
          </div>
          <div class="market-refund-grid">
            <input id="marketRefundIdentifier" type="text" autocomplete="off" placeholder="Kullanıcı adı veya e-posta" />
            <input id="marketRefundProductName" type="text" autocomplete="off" placeholder="Ürün adı veya ürün ID" />
            <input id="marketRefundUid" type="text" autocomplete="off" placeholder="UID (isteğe bağlı / 3. adım)" />
            <button id="refundMarketItemBtn" type="button" class="table-mini-danger">İADE ET</button>
          </div>
        </div>
        <div class="market-admin-section-title"><strong>Aktif Ürünler ve Düzenlemeler</strong><span>Aktif / görünür ürünler üstte, pasif veya görünmeyen ürünler en altta listelenir.</span></div>
        <div class="table-wrap market-admin-table-wrap"><table><thead><tr><th>Ürün Adı</th><th>Kategori</th><th>Açıklama</th><th>Fiyat (MC)</th><th>Stok</th><th>Aktif</th><th>Görünür</th><th>İşlem</th></tr></thead><tbody id="marketAdminRows"></tbody></table></div>
        <div class="market-admin-bulk-row"><button id="bulkSaveMarketItemsBtn" type="button" class="table-mini-action">TÜM MARKET DÜZENLEMELERİNİ KAYDET</button></div>
      </section>

      <section class="panel stack avatar-frame-admin-panel" id="avatarFrameAdminPanel">
        <div>
          <h2>AKILLI AVATAR / ÇERÇEVE YÖNETİM MERKEZİ</h2>
          <p class="lead">Canlı render motoruyla aynı variant ayarlarını kullanarak avatar ve çerçeve hizasını alan ölçüsünü bozmadan yönet.</p>
        </div>
        <div class="avatar-frame-admin-layout">
          <div class="avatar-frame-admin-controls">
            <div class="field-grid">
              <div class="field"><label for="avatarFrameTypeSelect">Çerçeve Tipi</label><select id="avatarFrameTypeSelect"><option value="normal">Normal</option><option value="market">Market</option></select></div>
              <div class="field"><label for="avatarFrameIndexSelect">Çerçeve</label><select id="avatarFrameIndexSelect"></select></div>
              <div class="field pm-admin-grid-span-all"><label for="avatarFrameVariantSelect">Canlı Alan / Variant</label><select id="avatarFrameVariantSelect"></select></div>
              <div class="field pm-admin-grid-span-all"><label for="avatarFramePreviewAvatar">Önizleme Avatarı</label><input id="avatarFramePreviewAvatar" type="text" value="/public/assets/avatars/system/fallback.svg" autocomplete="off" /></div>
              <div class="field"><label for="avatarScaleInput">Avatar Ölçeği</label><input id="avatarScaleInput" type="number" min="0.65" max="1.5" step="0.01" value="1" /></div>
              <div class="field"><label for="frameScaleInput">Çerçeve Ölçeği</label><input id="frameScaleInput" type="number" min="0.7" max="1.8" step="0.01" value="1" /></div>
              <div class="field"><label for="avatarOffsetXInput">Avatar X</label><input id="avatarOffsetXInput" type="number" min="-30" max="30" step="0.5" value="0" /></div>
              <div class="field"><label for="avatarOffsetYInput">Avatar Y</label><input id="avatarOffsetYInput" type="number" min="-30" max="30" step="0.5" value="0" /></div>
              <div class="field"><label for="frameOffsetXInput">Çerçeve X</label><input id="frameOffsetXInput" type="number" min="-30" max="30" step="0.5" value="0" /></div>
              <div class="field"><label for="frameOffsetYInput">Çerçeve Y</label><input id="frameOffsetYInput" type="number" min="-30" max="30" step="0.5" value="0" /></div>
              <div class="field"><label for="innerPaddingInput">İç Boşluk</label><input id="innerPaddingInput" type="number" min="0" max="24" step="0.5" value="0" /></div>
              <div class="field"><label for="outerPaddingInput">Dış Boşluk</label><input id="outerPaddingInput" type="number" min="0" max="24" step="0.5" value="0" /></div>
              <div class="field"><label for="avatarFrameThicknessSelect">Kalınlık Profili</label><select id="avatarFrameThicknessSelect"><option value="thin">İnce</option><option value="normal">Normal</option><option value="thick">Kalın</option><option value="ultra">Ultra</option></select></div>
              <div class="field"><label for="avatarFrameOverflowSelect">Taşma</label><select id="avatarFrameOverflowSelect"><option value="visible">Görünür</option><option value="hidden">Gizli</option></select></div>
            </div>
            <div class="avatar-frame-nudge-grid" aria-label="Hızlı hizalama kontrolleri">
              <button type="button" data-avatar-adjust="avatarScale" data-avatar-delta="0.02">Avatar büyüt</button><button type="button" data-avatar-adjust="avatarScale" data-avatar-delta="-0.02">Avatar küçült</button>
              <button type="button" data-avatar-adjust="frameScale" data-avatar-delta="0.02">Çerçeve büyüt</button><button type="button" data-avatar-adjust="frameScale" data-avatar-delta="-0.02">Çerçeve küçült</button>
              <button type="button" data-avatar-adjust="avatarOffsetY" data-avatar-delta="-0.5">Avatar yukarı</button><button type="button" data-avatar-adjust="avatarOffsetY" data-avatar-delta="0.5">Avatar aşağı</button>
              <button type="button" data-avatar-adjust="avatarOffsetX" data-avatar-delta="-0.5">Avatar sola</button><button type="button" data-avatar-adjust="avatarOffsetX" data-avatar-delta="0.5">Avatar sağa</button>
              <button type="button" data-avatar-adjust="frameOffsetY" data-avatar-delta="-0.5">Çerçeve yukarı</button><button type="button" data-avatar-adjust="frameOffsetY" data-avatar-delta="0.5">Çerçeve aşağı</button>
              <button type="button" data-avatar-adjust="frameOffsetX" data-avatar-delta="-0.5">Çerçeve sola</button><button type="button" data-avatar-adjust="frameOffsetX" data-avatar-delta="0.5">Çerçeve sağa</button>
            </div>
          </div>
          <div class="avatar-frame-live-preview">
            <div class="avatar-frame-preview-stage" id="avatarFramePreviewStage" data-preview-variant="leaderboard">
              <span class="avatar-frame-preview-label" id="avatarFramePreviewLabel">Liderlik</span>
              <span class="pm-avatar-host avatar-frame-preview-host" id="avatarFramePreviewHost"></span>
              <strong>Gerçek merkezi render motoru</strong>
              <small>Alan boyutu variant tarafından korunur; ayarlar yalnız avatar ve çerçeve katmanına uygulanır.</small>
            </div>
            <div class="status" id="avatarFrameAdminStatus" hidden></div>
            <div class="action-row">
              <button id="previewAvatarFrameBtn" class="ghost" type="button">ÖNİZLEME YAP</button>
              <button id="resetAvatarFrameBtn" class="warn" type="button">VARSAYILANA DÖN</button>
              <button id="saveAvatarFrameBtn" class="danger" type="button">KAYDET</button>
            </div>
          </div>
        </div>
      </section>
      <div class="layout-grid-3">
        <section class="panel stack">
          <div>
            <h2>SEÇİLİ KULLANICI KISITLAMA</h2>
            <p class="lead">Kullanıcı adı, e-posta veya UID ile kısıtlama uygulanır.</p>
          </div>
          <div class="field-grid">
            <div class="field"><label for="restrictIdentifier">Kullanıcı adı / e-posta / UID</label><input id="restrictIdentifier" type="text" placeholder="Kullanıcı adı, e-posta veya UID" /></div>
            <div class="field"><label for="restrictDuration">Süre (dakika)</label><input id="restrictDuration" type="number" min="0" step="1" placeholder="Örn: 60 dakika" /></div>
            <div class="field pm-admin-grid-span-all"><label for="restrictReason">Kısıtlama Açıklaması</label><textarea id="restrictReason" placeholder="Kısıtlama gerekçesini yaz"></textarea></div>
          </div>
          <div class="check-grid">
            <label class="check"><input type="radio" name="restrictMode" data-restrict="games_mute" /> <span>Tüm Oyunları Kısıtla</span></label>
            <label class="check"><input type="radio" name="restrictMode" data-restrict="ban" /> <span>Süresiz engel</span></label>
          </div>
          <div class="action-row"><button id="runRestrictBtn" type="button">KISITLAMAYI UYGULA</button></div>
        </section>

        <section class="panel stack">
          <div>
            <h2>SEÇİLİ KULLANICI ÖDÜLÜ</h2>
            <p class="lead">Seçili kullanıcıya MC, XP, market ürünü, bahisli oyun hakkı veya çark hakkı tanımla.</p>
          </div>
          <div class="field-grid reward-type-grid">
            <div class="field"><label for="rewardIdentifier">Kullanıcı adı / e-posta / UID</label><input id="rewardIdentifier" type="text" placeholder="Kullanıcı adı, e-posta veya UID" /></div>
            <div class="field"><label for="rewardTypeSelect">Ödül Türü</label><select id="rewardTypeSelect">
              <option value="mc">MC Ödülü</option>
              <option value="xp">XP Ödülü</option>
              <option value="market">Market Ürünü / Çerçeve</option>
              <option value="crash_bet_ticket">Crash Bahisli 1 El Hakkı</option>
              <option value="chess_bet_ticket">Satranç Bahisli 1 El Hakkı</option>
              <option value="pisti_bet_ticket">Pişti Bahisli 1 El Hakkı</option>
              <option value="wheel_right">+1 Çark Hakkı</option>
            </select></div>
            <div class="field reward-field reward-field-mc"><label for="rewardAmount">MC Miktarı</label><input id="rewardAmount" type="number" min="0" step="1" placeholder="50000" /></div>
            <div class="field reward-field reward-field-xp" hidden><label for="rewardXp">XP Miktarı</label><input id="rewardXp" type="number" min="0" step="1" placeholder="1000" /></div>
            <div class="field reward-field reward-field-market" hidden><label for="rewardMarketItemId">Market Ürün / Çerçeve ID</label><input id="rewardMarketItemId" type="text" placeholder="market-frame-id" /></div>
            <div class="field reward-field reward-field-ticket" hidden><label for="rewardTicketCount">Hak Sayısı</label><input id="rewardTicketCount" type="number" min="1" step="1" value="1" /></div>
            <div class="field pm-admin-grid-span-all"><label for="rewardReason">Ödül Açıklaması</label><textarea id="rewardReason" placeholder="Ödül gerekçesini yaz"></textarea></div>
          </div>
          <div class="action-row"><button id="grantUserRewardBtn" type="button">KULLANICIYA ÖDÜL VER</button></div>
        </section>

        <section class="panel stack">
          <div>
            <h2>TÜM KULLANICILARA MC</h2>
            <p class="lead">Toplu MC dağıtımı ve açıklama tüm kullanıcılara aynı anda uygulanır.</p>
          </div>
          <div class="field-grid">
            <div class="field"><label for="rewardAllAmount">MC Miktarı</label><input id="rewardAllAmount" type="number" min="1" step="1" placeholder="1000" /></div>
            <div class="field"><label for="rewardAllReason">Ödül Açıklaması</label><input id="rewardAllReason" type="text" placeholder="Toplu dağıtım açıklaması" /></div>
          </div>
          <div class="action-row"><button id="grantAllRewardBtn" class="warn" type="button">TÜM KULLANICILARA MC EKLE</button></div>
        </section>
      </div>

      <div class="layout-grid-2">
        <section class="panel stack">
          <div>
            <h2>PROMOSYON KODU OLUŞTURMA</h2>
            <p class="lead">Kod süresi, kişi sayısı, promo kodu ve hesap başı tek kullanım kuralı tanımlanır.</p>
          </div>
          <div class="field-grid promo-type-grid">
            <div class="field"><label for="promoTypeSelect">Promosyon Türü</label><select id="promoTypeSelect">
              <option value="mc">MC Promosyon Kodu</option>
              <option value="xp">XP Promosyon Kodu</option>
              <option value="market">Market Promosyon Kodu</option>
              <option value="crash_bet_ticket">Crash Bahisli 1 El Promosyon Kodu</option>
              <option value="chess_bet_ticket">Satranç 1 El Bahisli Promosyon Kodu</option>
              <option value="pisti_bet_ticket">Pişti 1 El Bahisli Promosyon Kodu</option>
              <option value="wheel_right">+1 Çark Hakkı Promosyon Kodu</option>
            </select></div>
            <div class="field"><label for="promoCode">Promosyon Kodu</label><input id="promoCode" type="text" placeholder="PLAYMATRIX50" /></div>
            <div class="field promo-field promo-field-mc"><label for="promoAmount">MC Miktarı</label><input id="promoAmount" type="number" min="0" step="1" placeholder="50000" /></div>
            <div class="field promo-field promo-field-xp" hidden><label for="promoXp">XP Miktarı</label><input id="promoXp" type="number" min="0" step="1" placeholder="250" /></div>
            <div class="field promo-field promo-field-market" hidden><label for="promoMarketItemId">Market Ürün / Çerçeve ID</label><input id="promoMarketItemId" type="text" placeholder="market-frame-id" /></div>
            <div class="field promo-field promo-field-ticket" hidden><label for="promoTicketCount">Hak Sayısı</label><input id="promoTicketCount" type="number" min="1" step="1" value="1" /></div>
            <div class="field"><label for="promoDuration">Kod Süresi (saat)</label><input id="promoDuration" type="number" min="1" step="1" placeholder="24" /></div>
            <div class="field"><label for="promoLimit">Kod Kişi Sayısı</label><input id="promoLimit" type="number" min="1" step="1" placeholder="100" /></div>
            <div class="field"><label for="promoPerAccount">Her Hesap 1 Kere</label><select id="promoPerAccount"><option value="true">Evet</option><option value="false">Hayır</option></select></div>
            <div class="field field-wide"><label for="promoDescription">Açıklama</label><input id="promoDescription" type="text" placeholder="Kampanya açıklaması" /></div>
          </div>
          <div class="action-row"><button id="createPromoBtn" type="button">PROMOSYON KODU OLUŞTUR</button></div>
          <div class="table-wrap"><table><thead><tr><th>Kod</th><th>Ödül</th><th>Kalan</th><th>Bitiş</th><th>İşlem</th></tr></thead><tbody id="promoRows"></tbody></table></div>
        </section>

        <section class="panel stack">
          <div>
            <h2>HATA TAKİP MERKEZİ</h2>
            <p class="lead">Ana sayfa, oyunlar ve yönetim alanındaki bilinen sorunlar neden ve çözüm başlıklarıyla listelenir.</p>
          </div>
          <div class="issue-columns issue-columns-split">
            <div class="issue-panel issue-panel-backend"><h3>Backend</h3><p class="issue-panel-note">API, admin route, oyun route, Firebase/transaction ve runtime memory hataları.</p><div class="issue-list" id="backendIssueList"></div></div>
            <div class="issue-panel issue-panel-frontend"><h3>Frontend</h3><p class="issue-panel-note">AnaSayfa, oyun ekranları, admin panel UI, modal ve kullanıcı runtime hataları.</p><div class="issue-list" id="frontendIssueList"></div></div>
          </div>
          <div class="runtime-card-list" id="recentErrorCards"></div><div class="table-wrap runtime-table"><table><thead><tr><th>Zaman</th><th>Kapsam</th><th>Hata</th></tr></thead><tbody id="recentErrorRows"></tbody></table></div>
        </section>
      </div>
    </div>
  `;
}

function adminToolKind(kind = '') {
  const raw = String(kind || '').toLowerCase();
  if (raw === 'ok') return 'success';
  if (raw === 'success' || raw === 'error' || raw === 'warning' || raw === 'info') return raw;
  return 'info';
}
const adminToolsToastKeys = new Map();
function showAdminToolsMessage(title = 'Admin Paneli', message = '', kind = 'info') {
  const text = String(message || '').trim();
  if (!text) return;
  let host = document.getElementById('adminToolsToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'adminToolsToastHost';
    host.className = 'admin-tools-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const scope = String(title || 'Admin Paneli').trim().toLowerCase().replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ_-]+/gi, '-').slice(0, 80) || 'admin';
  const safeTextForKey = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
  const toastKey = `${scope}:${adminToolKind(kind)}:${safeTextForKey}`;
  const existing = adminToolsToastKeys.get(scope);
  if (existing?.node?.isConnected) existing.node.remove();
  if (existing?.timer) window.clearTimeout(existing.timer);
  const toast = document.createElement('article');
  toast.className = `admin-tools-toast is-${adminToolKind(kind)}`;
  toast.dataset.scope = scope;
  toast.dataset.toastKey = toastKey;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'admin-tools-toast-close';
  close.setAttribute('aria-label', 'Bildirimi kapat');
  close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  const body = document.createElement('div');
  body.className = 'admin-tools-toast-body';
  const safeTitle = String(title || 'Admin Paneli').trim();
  body.append(el('strong', '', safeTitle), el('span', '', text));
  close.addEventListener('click', () => { adminToolsToastKeys.delete(scope); toast.remove(); });
  toast.append(body, close);
  host.appendChild(toast);
  const timer = window.setTimeout(() => { adminToolsToastKeys.delete(scope); toast.remove(); }, adminToolKind(kind) === 'error' ? 7200 : 4800);
  adminToolsToastKeys.set(scope, { node: toast, timer, key: toastKey });
}
function setInlineStatus(id, text, kind = '') {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = String(text || '');
  node.className = `status${kind ? ` ${kind}` : ''}`;
  node.hidden = !String(text || '').trim();
}
function setStatus(id, text, kind = '', options = {}) {
  const node = document.getElementById(id);
  const silent = options?.silent === true;
  if (node) {
    if (silent) {
      node.textContent = String(text || '');
      node.className = `status${kind ? ` ${kind}` : ''}`;
      node.hidden = !String(text || '').trim();
    } else {
      node.textContent = '';
      node.className = `status is-tools-only${kind ? ` ${kind}` : ''}`;
      node.hidden = true;
    }
  }
  if (silent) return;
  const label = id ? String(id).replace(/Status$/i, '').replace(/([A-Z])/g, ' $1').trim() : 'Admin Paneli';
  showAdminToolsMessage(label || 'Admin Paneli', text, kind || 'info');
}

function textNode(value = '') {
  return document.createTextNode(String(value ?? ''));
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function replaceWithChildren(target, children = []) {
  if (!target) return;
  const fragment = document.createDocumentFragment();
  children.forEach((child) => fragment.appendChild(child));
  target.replaceChildren(fragment);
}

function buildMetricCard(label, value, tone = '') {
  const card = el('article', `summary-pill ${tone}`.trim());
  card.append(el('span', 'label', label), el('div', 'value', value));
  return card;
}

function buildResetOption(value, label) {
  const wrapper = el('label', 'check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = value;
  wrapper.append(input, textNode(' '), el('span', '', label));
  return wrapper;
}

const MAINTENANCE_HELP = Object.freeze({
  general: 'Tüm kullanıcı yüzeyi güvenli bakım ekranına alınır.',
  system: 'API ve temel servislerde kontrollü bakım uygulanır.',
  crash: 'Crash sayfası, API ve canlı round erişimi kapatılır.',
  chess: 'Satranç lobi, oda, hamle ve profil API erişimi kapatılır.',
  pisti: 'Pişti lobi, masa ve oyun API erişimi kapatılır.',
  classic: 'Snake Pro ve Space Pro klasik oyun grubu kapatılır.',
  'space-pro': 'Space Pro tekil bakım durumu.',
  'snake-pro': 'Snake Pro tekil bakım durumu.',
  market: 'Market modalı ve market API istekleri kapatılır.',
  wheel: 'Günlük Çark modalı ve çark API istekleri kapatılır.',
  promo: 'Promosyon Kodu modalı ve promo API istekleri kapatılır.'
});
function updateMaintenanceSummary() {
  const box = document.getElementById('maintenanceSummaryBox');
  if (!box) return;
  const active = [...document.querySelectorAll('[data-maintenance].is-on')].map((button) => button.querySelector('strong')?.textContent || button.dataset.maintenance).filter(Boolean);
  box.textContent = active.length ? `Aktif bakım: ${active.join(', ')}` : 'Bakımda alan yok. Tüm alanlar aktif çalışıyor.';
  box.classList.toggle('is-clear', active.length === 0);
}
const MAINTENANCE_ENTRIES = Object.freeze([
  ['general', 'GENEL SİSTEM'],
  ['market', 'MARKET'],
  ['wheel', 'ÇARK'],
  ['promo', 'PROMO'],
  ['crash', 'CRASH'],
  ['chess', 'SATRANÇ'],
  ['pisti', 'PİŞTİ'],
  ['classic', 'KLASİK OYUNLAR'],
  ['space-pro', 'SPACE PRO'],
  ['snake-pro', 'SNAKE PRO']
]);

function buildMaintenanceButton(key, label, enabled) {
  const button = el('button', `maintenance-toggle ${enabled ? 'is-on' : ''}`.trim());
  button.type = 'button';
  button.dataset.maintenance = key;
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  const body = document.createElement('div');
  const state = el('span', 'maintenance-state-pill', enabled ? 'BAKIMDA' : 'AKTİF');
  const desc = el('small', '', MAINTENANCE_HELP[key] || 'Bakım durumunu yönet.');
  body.append(el('strong', '', label), desc, state);
  button.append(body, el('span', 'switch'));
  return button;
}

function renderMaintenanceGrid(maintenance = {}) {
  const grid = document.getElementById('maintenanceGrid');
  replaceWithChildren(grid, MAINTENANCE_ENTRIES.map(([key, label]) => buildMaintenanceButton(key, label, !!maintenance[key])));
  updateMaintenanceSummary();
}

function buildCell(value, attrs = {}) {
  const cell = document.createElement('td');
  Object.entries(attrs).forEach(([key, attrValue]) => cell.setAttribute(key, String(attrValue)));
  if (value instanceof Node) cell.appendChild(value);
  else if (Array.isArray(value)) value.filter(Boolean).forEach((child) => child instanceof Node ? cell.appendChild(child) : cell.appendChild(document.createTextNode(String(child ?? ''))));
  else cell.textContent = String(value ?? '');
  return cell;
}

function buildRow(cells = []) {
  const row = document.createElement('tr');
  cells.forEach((cell) => row.appendChild(cell));
  return row;
}

function renderTableRows(target, rows, emptyText, colspan) {
  if (!Array.isArray(rows) || !rows.length) {
    replaceWithChildren(target, [buildRow([buildCell(emptyText, { colspan })])]);
    return;
  }
  replaceWithChildren(target, rows);
}

function inferIssueSolution(item = {}) {
  const scope = String(item.scope || item.event || item.category || '').toLowerCase();
  const message = String(item.message || item.error?.message || item.error || item.reason || '').toLowerCase();
  const source = String(item.source || item.path || item.endpoint || '').toLowerCase();
  if (scope.includes('auth') || source.includes('/auth/admin/matrix')) return 'Güvenlik adımlarını tamamlayıp paneli tekrar aç.';
  if (message.includes('network-request-failed') || message.includes('failed to fetch') || message === 'load failed') return 'Bağlantını kontrol edip işlemi tekrar dene.';
  if (source.includes('crash') || scope.includes('crash')) return 'Crash işlem akışı güvenli kayıtla yeniden kontrol edilmeli.';
  if (source.includes('chess') || source.includes('satranc') || scope.includes('chess')) return 'Satranç işlem akışı güvenli kayıtla yeniden kontrol edilmeli.';
  if (source.includes('home-core') || source.includes('script.js') || scope.includes('home')) return 'AnaSayfa işlem adımları kontrol edilip tekrar denenmeli.';
  return 'İlgili alan güvenli hata detayıyla kontrol edilmeli.';
}

function publicIssueCopy(item = {}) {
  const rawText = `${item.error || ''} ${item.message || ''} ${item.reason || ''} ${item.path || ''} ${item.endpoint || ''} ${item.scope || ''}`.toLowerCase();
  const status = Number(item.status || 0) || 0;
  const authGate = rawText.includes('/auth/admin/matrix') || rawText.includes('admin_matrix_gate') || rawText.includes('session_required');
  if (authGate && (status === 401 || status === 403 || rawText.includes('step-') || rawText.includes('status'))) {
    return { title: 'Yönetici oturumu tamamlanmadı.', reason: 'Güvenlik adımları tamamlanmadan panel isteği çalıştı.', solution: 'Güvenlik adımlarını tamamlayıp paneli tekrar aç.' };
  }
  if (rawText.includes('load failed') || rawText.includes('failed to fetch') || rawText.includes('network')) {
    return { title: 'İşlem şu anda yüklenemedi.', reason: 'Bağlantı veya servis yanıtı geçici olarak tamamlanamadı.', solution: 'Sayfayı yenileyip işlemi tekrar dene.' };
  }
  const isMarketIssue = rawText.includes('/api/market/purchase') || rawText.includes('/api/market/equip') || String(item.game || '').toLowerCase() === 'market' || String(item.scope || '').toLowerCase().startsWith('market');
  if (isMarketIssue) {
    return {
      title: item.title || 'Market işlemi tamamlanamadı.',
      reason: item.reason || 'Market işlemi güvenli kontrol tarafından tamamlanamadı.',
      solution: item.solution || 'Ürün durumu, stok, fiyat, e-posta doğrulaması ve kullanıcı bakiyesi kontrol edilmeli.'
    };
  }
  if (status >= 500) return { title: item.title || 'İşlem tamamlanamadı.', reason: item.reason || 'Servis işlemi güvenli şekilde sonuçlandıramadı.', solution: item.solution || 'Kayıt detayını inceleyip işlemi tekrar dene.' };
  if (status >= 400) return { title: item.title || 'İşlem başlatılamadı.', reason: item.reason || 'Oturum, yetki veya işlem adımlarından biri tamamlanmadı.', solution: item.solution || 'Gerekli adımları tamamlayıp tekrar dene.' };
  return { title: 'İncelenmesi gereken kayıt oluştu.', reason: item.reason || 'İlgili alanda teknik inceleme gerektiren bir kayıt oluştu.', solution: item.solution || inferIssueSolution(item) };
}

function buildIssueCard(item = {}) {
  const card = el('div', 'issue');
  const area = item.area || item.game || item.scope || 'Alan';
  const copy = publicIssueCopy(item);
  const reason = document.createElement('div');
  reason.className = 'issue-reason';
  reason.textContent = `Neden: ${copy.reason}`;
  const solution = document.createElement('div');
  solution.className = 'issue-solution';
  solution.textContent = `Çözüm: ${copy.solution}`;
  const details = document.createElement('details');
  details.className = 'issue-technical-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Geliştirici detayı';
  const detailText = [item.method, item.path || item.source || item.endpoint, item.status ? `Durum: ${item.status}` : '', item.code ? `Kod: ${item.code}` : '', item.requestId ? `İstek: ${item.requestId}` : '', item.scope || item.category || ''].filter(Boolean).join(' • ');
  details.append(summary, el('small', 'meta', detailText || 'Teknik detay yok.'));
  card.append(el('span', 'meta', area), el('strong', '', copy.title), reason, solution, details);
  return card;
}

function renderIssueList(target, items = []) {
  const cards = Array.isArray(items) ? items.map(buildIssueCard) : [];
  replaceWithChildren(target, cards.length ? cards : [el('div', 'issue', 'Kayıt yok.')]);
}


function formatMultiplier(value = 0) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)}x` : 'Yok';
}

function parseDecimalInput(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeRiskRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    min: parseDecimalInput(row?.min || 0),
    max: parseDecimalInput(row?.max || 0),
    weight: parseDecimalInput(row?.weight || 0)
  })).filter((row) => Number.isFinite(row.min) && Number.isFinite(row.max) && Number.isFinite(row.weight));
}

function buildRiskRow(row = {}, index = 0) {
  const tr = document.createElement('tr');
  tr.dataset.riskIndex = String(index);
  ['min', 'max', 'weight'].forEach((key) => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = String(row[key] ?? '');
    input.dataset.riskField = key;
    input.setAttribute('aria-label', `Crash risk ${key}`);
    td.appendChild(input);
    tr.appendChild(td);
  });
  return tr;
}

function crashConfirmIsValid() {
  return true;
}

function updateCrashControlButtons(payload = null) {
  const confirmed = true;
  const phase = String(payload?.phase || document.getElementById('crashRiskSummary')?.dataset.phase || '').toUpperCase();
  const currentBtn = document.getElementById('setCurrentCrashPointBtn');
  const nextBtn = document.getElementById('setNextCrashPointBtn');
  const clearBtn = document.getElementById('clearNextCrashPointBtn');
  const hint = document.getElementById('crashControlHint');
  if (currentBtn) {
    currentBtn.disabled = !confirmed || phase !== 'COUNTDOWN';
    currentBtn.title = phase === 'COUNTDOWN' ? 'Aktif geri sayım roundunun crash çarpanını ayarlar.' : 'Aktif round uçuşta/patlamışsa mevcut round değiştirilemez.';
  }
  if (nextBtn) nextBtn.disabled = !confirmed;
  if (clearBtn) clearBtn.disabled = !confirmed;
  const limitBtn = document.getElementById('saveCrashRiskLimitBtn');
  if (limitBtn) limitBtn.disabled = !confirmed;
  if (hint) {
    const stateText = phase === 'COUNTDOWN'
      ? 'Aktif round geri sayımda: aktif rounda çarpan uygulanabilir.'
      : 'Aktif round kilitli veya henüz yok: sonraki round override kullanılmalıdır.';
    hint.textContent = stateText;
  }
}

function formatCrashValidationDetails(error) {
  const details = Array.isArray(error?.payload?.details) ? error.payload.details : [];
  if (!details.length) return error.message || 'İşlem başarısız.';
  return `${error.message || 'Risk tablosu reddedildi.'}: ${details.join(' · ')}`;
}

function renderCrashRiskPanel(payload = {}) {
  const rows = normalizeRiskRows(payload.riskTable || payload.risk || []);
  const riskRowsEl = document.getElementById('crashRiskRows');
  renderTableRows(riskRowsEl, rows.map(buildRiskRow), 'Risk tablosu bulunamadı.', 3);
  const summary = document.getElementById('crashRiskSummary');
  if (summary) {
    const phase = String(payload.phase || '—');
    const appliesTo = payload.overrideAppliesTo === 'current_countdown_round'
      ? 'Aktif geri sayım roundu değiştirilebilir'
      : 'Aktif round kilitli; değişiklik sonraki rounda uygulanır';
    const activePoint = payload.currentRoundCrashPoint ? ` · Aktif crash: ${formatMultiplier(payload.currentRoundCrashPoint)}` : '';
    const locked = payload.activeRoundLocked ? ' · Kilitli' : '';
    summary.dataset.phase = phase;
    summary.textContent = `Durum: ${phase} · Round: ${payload.roundId || '—'} · Anlık: ${formatMultiplier(payload.multiplier)}${activePoint} · Bekleyen override: ${formatMultiplier(payload.nextCrashPointOverride)} · Gelecek el: ${Number(payload.futureCrashPointCount || 0)} adet · ${appliesTo}${locked}`;
  }
  const nextInput = document.getElementById('nextCrashPointInput');
  if (nextInput && Number(payload.nextCrashPointOverride || 0) > 0 && !nextInput.value) nextInput.value = Number(payload.nextCrashPointOverride).toFixed(2);
  const futureInput = document.getElementById('futureCrashPointsInput');
  if (futureInput && Array.isArray(payload.futureCrashPoints) && !futureInput.value) futureInput.value = payload.futureCrashPoints.map((v) => Number(v).toFixed(2)).join(', ');
  const riskLimitInput = document.getElementById('crashAdminRiskLimitInput');
  if (riskLimitInput) riskLimitInput.value = String(payload.adminRiskBetLimit || payload.riskBetLimit || 1000000);
  updateCrashControlButtons(payload);
}

async function loadCrashRiskPanel() {
  try {
    const payload = await adminFetch('/api/crash/admin/risk-table');
    renderCrashRiskPanel(payload || {});
    setStatus('crashRiskStatus', 'Crash risk kontrol verisi yüklendi.', 'ok', { silent: true });
    return payload;
  } catch (error) {
    setStatus('crashRiskStatus', error.message || 'Crash risk kontrol verisi alınamadı.', 'error');
    return null;
  }
}

function collectCrashRiskRows() {
  return Array.from(document.querySelectorAll('#crashRiskRows tr')).map((row) => {
    const out = {};
    row.querySelectorAll('input[data-risk-field]').forEach((input) => { out[input.dataset.riskField] = parseDecimalInput(input.value || 0); });
    return out;
  }).filter((row) => Number.isFinite(row.min) && Number.isFinite(row.max) && Number.isFinite(row.weight));
}

function requireCrashRiskConfirm() {
  return true;
}

function renderRecentErrorCards(target, items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (!target) return;
  if (!rows.length) {
    replaceWithChildren(target, [el('div', 'runtime-card', 'Kritik hata kaydı yok.')]);
    return;
  }
  replaceWithChildren(target, rows.map((item) => {
    const card = el('article', 'runtime-card');
    const copy = publicIssueCopy(item);
    const area = item.area || item.game || item.source || item.scope || item.event || 'Sistem';
    const details = document.createElement('details');
    details.className = 'issue-technical-details';
    details.append(el('summary', '', 'Geliştirici detayı'), el('small', 'meta', [item.method, item.path || item.source || item.endpoint, item.status ? `Durum: ${item.status}` : '', item.scope || item.category || ''].filter(Boolean).join(' • ') || 'Teknik detay yok.'));
    card.append(
      el('span', 'runtime-card-time', formatWhen(item.createdAt || item.timestamp)),
      el('strong', '', area),
      el('p', '', copy.title),
      details
    );
    return card;
  }));
}

async function autoBootstrapAdminSession() {
  // Güvenlik gereği dashboard hiçbir zaman Firebase oturumundan otomatik açılmaz.
  // Yönetici erişimi yalnızca 4 adımlı kapı tamamlanınca geçerli olur.
  return false;
}

async function ensureAccess() {
  try {
    const out = await adminFetch('/api/auth/admin/matrix/status');
    if (out?.clientKey) setSecurityKey(out.clientKey);
    return { ok: !!out?.authenticated, admin: out?.admin || null, error: '' };
  } catch (error) {
    const recovered = await autoBootstrapAdminSession();
    if (recovered) {
      try {
        const out = await adminFetch('/api/auth/admin/matrix/status');
        if (out?.clientKey) setSecurityKey(out.clientKey);
        return { ok: !!out?.authenticated, admin: out?.admin || null, error: '' };
      } catch (retryError) {
        return { ok: false, admin: null, error: retryError?.message || 'Yönetici oturumu doğrulanamadı.' };
      }
    }
    return { ok: false, admin: null, error: error?.message || 'Yönetici oturumu doğrulanamadı.' };
  }
}



const MARKET_ADMIN_CATEGORIES = Object.freeze([
  ['frames', 'Çerçeve'],
  ['badges', 'Rozet'],
  ['animated-name-effects', 'Animasyonlu İsim Efekti'],
  ['stats-card-themes', 'İstatistik Kart Teması']
]);
const MARKET_PASSIVE_CATEGORY_LABELS = Object.freeze({
  avatars: 'Avatar (Pasif Altyapı)',
  'profile-backgrounds': 'Profil Arka Planı (Pasif Altyapı)',
  'game-table-themes': 'Oyun İçi Masa / Tahta Teması (Pasif Altyapı)'
});

function marketInput(kind, itemId, value = '') {
  const input = document.createElement(kind === 'textarea' ? 'textarea' : 'input');
  if (kind !== 'textarea') input.type = kind || 'text';
  input.value = String(value ?? '');
  input.dataset[`market${kind === 'number' ? 'Number' : 'Field'}`] = itemId;
  input.className = 'market-admin-input';
  return input;
}

function marketCategorySelect(itemId, current = 'frames') {
  const select = document.createElement('select');
  select.dataset.marketCategory = itemId;
  if (MARKET_PASSIVE_CATEGORY_LABELS[current]) {
    const option = document.createElement('option');
    option.value = current;
    option.textContent = MARKET_PASSIVE_CATEGORY_LABELS[current];
    option.selected = true;
    option.disabled = true;
    select.appendChild(option);
  }
  MARKET_ADMIN_CATEGORIES.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === current;
    select.appendChild(option);
  });
  return select;
}

function marketCheckbox(itemId, field, checked = true) {
  const label = document.createElement('label');
  label.className = 'market-admin-switch';
  label.setAttribute('aria-label', field === 'marketActive' ? 'Aktif' : 'Görünür');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked !== false;
  input.dataset[field] = itemId;
  const track = document.createElement('span');
  track.className = 'market-admin-switch-track';
  const text = document.createElement('span');
  text.className = 'market-admin-switch-label';
  text.textContent = checked !== false ? 'Açık' : 'Kapalı';
  input.addEventListener('change', () => { text.textContent = input.checked ? 'Açık' : 'Kapalı'; });
  label.append(input, track, text);
  return label;
}

function marketAdminPreview(item = {}) {
  const category = String(item.category || item.type || 'frames');
  const asset = marketAdminFrameUrlFromItem(item) || String(item.asset || item.preview || item.image || item.frameUrl || '');
  const wrap = el('div', 'market-admin-preview');
  const generated = /\/public\/assets\/market\/generated\//.test(asset);
  if (category === 'frames' && asset && !generated && window.PMAvatar?.mount) {
    wrap.classList.add('market-admin-preview--avatar-frame');
    const host = el('span', 'market-admin-preview-avatar-host');
    wrap.appendChild(host);
    window.PMAvatar.mount(host, {
      avatarUrl: BRAND_LOGO_URL,
      level: 0,
      exactFrameIndex: 0,
      frameUrl: asset,
      variant: 'marketCard',
      sizePx: 58,
      showFrame: true,
      extraClass: 'market-admin-preview-avatar pm-avatar--market-card',
      alt: item.name || item.title || 'Market ürünü'
    });
    const frame = host.querySelector('.pm-avatar-shell__frame');
    if (frame) {
      frame.addEventListener('error', () => {
        wrap.dataset.kind = category;
        wrap.dataset.frameError = 'true';
        wrap.innerHTML = `${marketAdminPreviewIcon(category)}<small>Görsel bulunamadı</small>`;
      }, { once: true });
    }
  } else if (asset && !generated) {
    const img = document.createElement('img');
    img.src = asset;
    img.alt = item.name || item.title || 'Market ürünü';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('error', () => {
      wrap.dataset.kind = category;
      wrap.dataset.frameError = 'true';
      wrap.innerHTML = `${marketAdminPreviewIcon(category)}<small>Görsel bulunamadı</small>`;
    }, { once: true });
    wrap.appendChild(img);
  } else {
    wrap.dataset.kind = category;
    wrap.innerHTML = marketAdminPreviewIcon(category);
  }
  return wrap;
}

function marketAdminPreviewIcon(category = '') {
  const map = {
    frames: '<i class="fa-regular fa-circle"></i>',
    avatars: '<i class="fa-solid fa-user-astronaut"></i>',
    'profile-backgrounds': '<i class="fa-solid fa-panorama"></i>',
    badges: '<i class="fa-solid fa-certificate"></i>',
    'animated-name-effects': '<b>PM</b>',
    'stats-card-themes': '<i class="fa-solid fa-chart-line"></i>',
    'game-table-themes': '<i class="fa-solid fa-chess-board"></i>'
  };
  return map[String(category || '')] || '<i class="fa-solid fa-gem"></i>';
}

function normalizeMarketAdminFramePath(value = '', frameIndex = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw.replace(/\/+/, '/');
  if (/^(public|assets)\//i.test(raw)) return `/${raw}`.replace(/\/+/, '/');
  const directName = raw.match(/^(?:market|frame)[-_]?0*(\d{1,3})\.(png|webp|jpg|jpeg|svg)$/i);
  if (directName) return `/public/assets/market/frames/market-${Math.max(1, Math.trunc(Number(directName[1]) || 1))}.${String(directName[2] || 'png').toLowerCase()}`;
  const numeric = Math.max(0, Math.trunc(Number(frameIndex || (raw.match(/(?:market[-_]?frame|market|frame)[-_]?0*(\d{1,3})/i) || [])[1] || 0) || 0));
  return numeric > 0 ? `/public/assets/market/frames/market-${numeric}.png` : '';
}

function marketAdminFrameUrlFromItem(item = {}) {
  return normalizeMarketAdminFramePath(item.frameUrl || item.asset || item.preview || item.image || item.src || '', item.frameIndex || item.id || '');
}

function marketAdminRowSnapshot(id = '') {
  const esc = CSS.escape(String(id || '').trim());
  const pick = (selector) => document.querySelector(selector);
  const frameUrlRaw = pick(`[data-market-frame-url="${esc}"]`)?.value || '';
  const frameIndex = pick(`[data-market-frame-index="${esc}"]`)?.value || '';
  const frameUrl = normalizeMarketAdminFramePath(frameUrlRaw, frameIndex);
  return {
    id,
    name: pick(`[data-market-name="${esc}"]`)?.value || id,
    title: pick(`[data-market-name="${esc}"]`)?.value || id,
    description: pick(`[data-market-description="${esc}"]`)?.value || '',
    category: pick(`[data-market-category="${esc}"]`)?.value || 'frames',
    price: Math.max(1, Math.trunc(Number(pick(`[data-market-price="${esc}"]`)?.value || 0) || 0)),
    stock: Math.max(0, Math.trunc(Number(pick(`[data-market-stock="${esc}"]`)?.value || 0) || 0)),
    active: !!pick(`[data-market-active="${esc}"]`)?.checked,
    visible: !!pick(`[data-market-visible="${esc}"]`)?.checked,
    frameUrl,
    asset: frameUrl,
    preview: frameUrl,
    image: frameUrl,
    frameIndex: frameIndex === '' ? null : Math.max(0, Math.trunc(Number(frameIndex) || 0))
  };
}

function refreshMarketAdminPreviewForRow(id = '') {
  const esc = CSS.escape(String(id || '').trim());
  const card = document.querySelector(`.market-admin-product-card[data-market-row="${esc}"]`);
  const current = card?.querySelector?.('.market-admin-preview');
  if (!card || !current) return;
  const next = marketAdminPreview(marketAdminRowSnapshot(id));
  current.replaceWith(next);
}

function buildMarketAdminRow(item = {}) {
  const id = item.id || item.key || '';
  const price = Math.max(0, Math.trunc(Number(item.price || 0) || 0));
  const stock = item.stock === null || item.stock === undefined ? 0 : Math.max(0, Math.trunc(Number(item.stock || 0) || 0));

  const nameInput = marketInput('text', id, item.name || item.title || id);
  nameInput.dataset.marketName = id;
  const descInput = marketInput('textarea', id, item.description || '');
  descInput.dataset.marketDescription = id;
  descInput.rows = 3;
  const categorySelect = marketCategorySelect(id, item.category || item.type || 'frames');
  const frameUrlInput = marketInput('text', id, marketAdminFrameUrlFromItem(item));
  frameUrlInput.dataset.marketFrameUrl = id;
  frameUrlInput.placeholder = '/public/assets/market/frames/market-1.png';
  frameUrlInput.autocomplete = 'off';
  frameUrlInput.inputMode = 'url';
  const frameIndexInput = marketInput('number', id, item.frameIndex == null ? '' : Math.max(0, Math.trunc(Number(item.frameIndex) || 0)));
  frameIndexInput.dataset.marketFrameIndex = id;
  frameIndexInput.min = '0';
  frameIndexInput.step = '1';
  frameIndexInput.placeholder = '1';
  const priceInput = marketInput('number', id, price);
  priceInput.min = '1';
  priceInput.step = '1';
  priceInput.dataset.marketPrice = id;
  const stockInput = marketInput('number', id, stock);
  stockInput.min = '0';
  stockInput.step = '1';
  stockInput.dataset.marketStock = id;
  const activeInput = marketCheckbox(id, 'marketActive', item.active !== false);
  const visibleInput = marketCheckbox(id, 'marketVisible', item.visible !== false);
  const save = el('button', 'table-mini-action market-admin-save-btn', 'KAYDET');
  save.type = 'button';
  save.dataset.marketSave = id;
  [frameUrlInput, frameIndexInput, categorySelect].forEach((node) => node?.addEventListener?.('input', () => refreshMarketAdminPreviewForRow(id)));
  categorySelect?.addEventListener?.('change', () => refreshMarketAdminPreviewForRow(id));

  const card = el('article', 'market-admin-product-card');
  card.dataset.marketRow = id;
  if (item.active === false || item.visible === false || stock <= 0) card.classList.add('is-passive');
  const head = el('div', 'market-admin-product-head');
  head.append(marketAdminPreview(item), el('strong', 'market-admin-product-id', id));
  const form = el('div', 'market-admin-product-form');
  const field = (label, node, cls = '') => {
    const box = el('label', `market-admin-field ${cls}`.trim());
    box.append(el('span', '', label), node);
    return box;
  };
  form.append(
    field('Ürün Adı', nameInput),
    field('Kategori', categorySelect),
    field('Çerçeve Yolu', (() => { const box = el('div', 'market-admin-path-box'); box.append(frameUrlInput, el('small', 'market-admin-help', 'Örnek: /public/assets/market/frames/market-1.png')); return box; })(), 'wide market-admin-frame-field'),
    field('Çerçeve No', frameIndexInput),
    field('Açıklama', descInput, 'wide'),
    field('Fiyat (MC)', priceInput),
    field('Stok', stockInput),
    field('Aktif', activeInput),
    field('Görünür', visibleInput),
    save
  );
  card.append(head, form);
  const tr = document.createElement('tr');
  tr.className = 'market-admin-card-row';
  tr.dataset.marketRow = id;
  const td = document.createElement('td');
  td.colSpan = 8;
  td.appendChild(card);
  tr.appendChild(td);
  return tr;
}
async function loadMarketGlobalStatus() {
  const label = document.getElementById('marketGlobalStatusText');
  const btn = document.getElementById('toggleMarketStatusBtn');
  try {
    const payload = await adminFetch('/api/admin/market/status');
    const enabled = payload.enabled !== false;
    if (label) {
      label.textContent = enabled ? 'Açık' : 'Kapalı';
      label.dataset.enabled = enabled ? 'true' : 'false';
    }
    if (btn) {
      btn.dataset.marketNextEnabled = enabled ? 'false' : 'true';
      btn.textContent = enabled ? 'MARKETİ KAPAT' : 'MARKETİ AÇ';
      btn.classList.toggle('danger', enabled);
    }
    return enabled;
  } catch (error) {
    if (label) label.textContent = 'Durum alınamadı';
    setStatus('marketAdminStatus', error.message || 'Market durumu alınamadı.', 'error');
    return true;
  }
}

async function toggleMarketGlobalStatus() {
  const btn = document.getElementById('toggleMarketStatusBtn');
  const nextEnabled = btn?.dataset.marketNextEnabled !== 'false';
  try {
    setStatus('marketAdminStatus', nextEnabled ? 'Market açılıyor...' : 'Market kapatılıyor...', 'info');
    await adminFetch('/api/admin/market/status', { method: 'POST', body: JSON.stringify({ enabled: nextEnabled, ...selectedNotificationPayload('market') }) });
    await loadMarketGlobalStatus();
    setStatus('marketAdminStatus', nextEnabled ? 'Market açıldı.' : 'Market kapatıldı.', 'success');
  } catch (error) {
    setStatus('marketAdminStatus', error.message || 'Market durumu güncellenemedi.', 'error');
  }
}

async function loadMarketAdminPanel() {
  await loadMarketGlobalStatus();
  const host = document.getElementById('marketAdminRows');
  if (!host) return;
  try {
    const payload = await adminFetch('/api/admin/market/items');
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 160) : [];
    const sortedItems = items.sort((a, b) => {
      const aPassive = a.active === false || a.visible === false || Number(a.stock || 0) <= 0;
      const bPassive = b.active === false || b.visible === false || Number(b.stock || 0) <= 0;
      if (aPassive !== bPassive) return aPassive ? 1 : -1;
      return String(a.category || '').localeCompare(String(b.category || ''), 'tr') || String(a.id || '').localeCompare(String(b.id || ''), 'tr', { numeric: true });
    });
    renderTableRows(host, sortedItems.map(buildMarketAdminRow), 'Market ürünü bulunmuyor.', 8);
    setStatus('marketAdminStatus', `Market ürünleri yüklendi: ${items.length}`, 'success', { silent: true });
  } catch (error) {
    renderTableRows(host, [], 'Market ürünleri şu anda görüntülenemiyor.', 8);
    setStatus('marketAdminStatus', error.message || 'Market ürünleri şu anda görüntülenemiyor.', 'error');
  }
}
async function saveMarketAdminItem(itemId = '') {
  const id = String(itemId || '').trim();
  const rowPayload = marketAdminRowSnapshot(id);
  try {
    setStatus('marketAdminStatus', 'Market ürünü kaydediliyor...', 'info');
    await adminFetch('/api/admin/market/item', { method: 'POST', body: JSON.stringify(rowPayload) });
    setStatus('marketAdminStatus', 'Market ürünü güncellendi.', 'success');
    await loadMarketAdminPanel();
  } catch (error) {
    setStatus('marketAdminStatus', error.message || 'Market ürünü kaydedilemedi.', 'error');
  }
}

async function bulkSaveMarketAdminItems() {
  const bulkButton = document.getElementById('bulkSaveMarketItemsBtn');
  if (bulkButton?.dataset.busy === 'true') return;
  if (bulkButton) { bulkButton.dataset.busy = 'true'; bulkButton.disabled = true; bulkButton.textContent = 'KAYDEDİLİYOR...'; }
  const finish = () => {
    if (bulkButton) { bulkButton.dataset.busy = 'false'; bulkButton.disabled = false; bulkButton.textContent = 'TÜM MARKET DÜZENLEMELERİNİ KAYDET'; }
  };
  const ids = Array.from(new Set(Array.from(document.querySelectorAll('[data-market-row]')).map((row) => row.dataset.marketRow).filter(Boolean)));
  if (!ids.length) { finish(); return setStatus('marketAdminStatus', 'Kaydedilecek market ürünü bulunmuyor.', 'error'); }
  const rows = ids.map((id) => marketAdminRowSnapshot(id));
  let okCount = 0;
  const failures = [];
  try {
    setStatus('marketAdminStatus', 'Toplu market düzenlemeleri kaydediliyor...', 'info');
    for (let i = 0; i < rows.length; i += 30) {
      const chunk = rows.slice(i, i + 30);
      const payload = await adminFetch('/api/admin/market/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ items: chunk })
      });
      okCount += Number(payload.savedCount || 0);
      if (Array.isArray(payload.failed)) payload.failed.forEach((f) => failures.push(`${f.id || 'ürün'}: ${f.message || f.error || 'kaydedilemedi'}`));
      setStatus('marketAdminStatus', `Toplu kayıt sürüyor: ${Math.min(i + chunk.length, rows.length)}/${rows.length}`, 'info');
    }
    if (failures.length) setStatus('marketAdminStatus', `${okCount} ürün kaydedildi, ${failures.length} ürün hata verdi.`, 'error');
    else setStatus('marketAdminStatus', `${okCount} market ürünü toplu kaydedildi.`, 'success');
    await loadMarketAdminPanel();
  } catch (error) {
    setStatus('marketAdminStatus', error.message || 'Toplu market kaydı tamamlanamadı.', 'error');
  } finally {
    finish();
  }
}

async function refundMarketAdminItem() {
  const identifier = document.getElementById('marketRefundIdentifier')?.value?.trim() || '';
  const productName = document.getElementById('marketRefundProductName')?.value?.trim() || '';
  const uid = document.getElementById('marketRefundUid')?.value?.trim() || '';
  if (!identifier && !uid) return setStatus('marketAdminStatus', 'İade için kullanıcı adı, e-posta veya UID gir.', 'error');
  if (!productName) return setStatus('marketAdminStatus', 'İade edilecek ürün adı veya ürün ID gerekli.', 'error');
  try {
    setStatus('marketAdminStatus', 'Market iadesi uygulanıyor...', 'info');
    const payload = await adminFetch('/api/admin/market/refund', { method: 'POST', body: JSON.stringify({ identifier, uid, productName, notificationMode: selectedNotificationMode('market') }) });
    setStatus('marketAdminStatus', `${payload.match || payload.uid || 'Kullanıcı'} için ${payload.item?.title || payload.item?.name || productName} iadesi tamamlandı.`, 'success');
  } catch (error) {
    setStatus('marketAdminStatus', error.message || 'Market iadesi yapılamadı.', 'error');
  }
}



function wheelRewardRowsFromTextarea() {
  const raw = document.getElementById('wheelRewardsText')?.value || '';
  return raw.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 40).map((line, index) => {
    const [typeRaw, labelRaw, valueRaw, weightRaw] = line.split('|').map((x) => String(x || '').trim());
    const type = ['mc', 'xp', 'empty'].includes(typeRaw) ? typeRaw : 'empty';
    const weight = Math.max(1, Math.trunc(Number(weightRaw || 1) || 1));
    const id = `${type}-${index}-${Date.now()}`;
    if (type === 'empty') return { id, type, label: labelRaw || 'Boş', amount: 0, weight };
    return { id, type, label: labelRaw || valueRaw || 'Ödül', amount: Math.max(1, Math.trunc(Number(valueRaw || 0) || 0)), weight };
  }).filter((row) => row.type === 'empty' || row.amount > 0);
}
function wheelRewardsToTextarea(rewards = []) {
  return (Array.isArray(rewards) ? rewards : []).map((reward) => {
    if (reward.type === 'empty') return `empty|${reward.label || 'Boş'}|0|${reward.weight || 1}`;
    return `${reward.type || 'mc'}|${reward.label || 'Ödül'}|${Math.max(1, Math.trunc(Number(reward.amount || 0) || 0))}|${reward.weight || 1}`;
  }).join('\n');
}
async function loadWheelAdminConfig() {
  const active = document.getElementById('wheelActiveSelect');
  const rewards = document.getElementById('wheelRewardsText');
  try {
    const payload = await adminFetch('/api/admin/wheel/config');
    if (active) active.value = payload.active === false ? 'false' : 'true';
    if (rewards) rewards.value = wheelRewardsToTextarea(payload.rewards || payload.config?.rewards || []);
    setStatus('wheelAdminStatus', 'Çark ayarı yüklendi.', 'success', { silent: true });
  } catch (error) {
    setStatus('wheelAdminStatus', 'Çark ayarı şu anda yüklenemedi. Lütfen tekrar dene.', 'error');
  }
}
async function saveWheelAdminConfig() {
  const active = String(document.getElementById('wheelActiveSelect')?.value || 'true') === 'true';
  const rewards = wheelRewardRowsFromTextarea();
  if (!rewards.length) return setStatus('wheelAdminStatus', 'En az bir çark ödülü ekle.', 'error');
  try {
    setStatus('wheelAdminStatus', 'Çark ayarı kaydediliyor...', 'info');
    await adminFetch('/api/admin/wheel/config', { method: 'POST', body: JSON.stringify({ active, rewards }) });
    setStatus('wheelAdminStatus', 'Çark ayarı kaydedildi.', 'success');
  } catch (error) {
    setStatus('wheelAdminStatus', 'Çark ayarı kaydedilemedi. Lütfen tekrar dene.', 'error');
  }
}

function buildNotificationControl(key = '', allowPersonal = false) {
  const box = el('div', 'admin-notify-box');
  box.dataset.notifyBox = key;
  box.append(el('strong', '', 'Bildirim Tercihi'));
  const options = allowPersonal
    ? [['all', 'Sistem bildirimi gönder', 'Tüm kullanıcılara duyuru düşer.'], ['personal', 'Kişisel bildirim gönder', 'Yalnız ilgili kullanıcıya görünür.'], ['none', 'Bildirim gönderme', 'Sadece admin log kaydı oluşur.']]
    : [['all', 'Sistem bildirimi gönder', 'Tüm kullanıcılara duyuru düşer.'], ['none', 'Bildirim gönderme', 'Sadece admin log kaydı oluşur.']];
  const grid = el('div', 'admin-notify-grid');
  options.forEach(([value, title, desc], index) => {
    const label = el('label', 'admin-notify-option');
    const input = document.createElement('input');
    input.type = 'radio'; input.name = `adminNotify_${key}`; input.value = value; input.checked = index === options.length - 1;
    label.append(input, el('span', 'admin-notify-check', ''), el('span', 'admin-notify-text', title), el('small', '', desc));
    grid.appendChild(label);
  });
  const custom = el('div', 'admin-notify-custom');
  custom.innerHTML = `<div class="field"><label for="adminNotifyTitle_${key}">Bildirim Başlığı</label><input id="adminNotifyTitle_${key}" type="text" maxlength="120" placeholder="Başlığı admin yazar" /></div><div class="field"><label for="adminNotifyMessage_${key}">Bildirim İçeriği</label><textarea id="adminNotifyMessage_${key}" rows="2" maxlength="2000" placeholder="Kullanıcıya sadece bu içerik gider"></textarea></div>`;
  box.append(grid, custom);
  return box;
}
function selectedNotificationMode(key = '') {
  return document.querySelector(`input[name="adminNotify_${CSS.escape(String(key))}"]:checked`)?.value || 'none';
}
function selectedNotificationPayload(key = '') {
  const safeKey = String(key || '');
  return {
    notificationMode: selectedNotificationMode(safeKey),
    notificationTitle: document.getElementById(`adminNotifyTitle_${safeKey}`)?.value.trim() || '',
    notificationMessage: document.getElementById(`adminNotifyMessage_${safeKey}`)?.value.trim() || ''
  };
}
function injectNotificationControl(panel, key, allowPersonal = false) {
  if (!panel || panel.querySelector(`[data-notify-box="${key}"]`)) return;
  const control = buildNotificationControl(key, allowPersonal);
  const maintenanceSlot = panel.classList?.contains('maintenance-panel') ? panel.querySelector('#maintenanceNotificationSlot') : null;
  const status = panel.querySelector('.status');
  if (maintenanceSlot) maintenanceSlot.appendChild(control);
  else if (status) status.insertAdjacentElement('beforebegin', control);
  else panel.appendChild(control);
}
function buildUserInfoPanel() {
  const section = el('section', 'panel stack admin-user-info-panel');
  section.id = 'adminUserInfoPanel';
  section.innerHTML = `
    <div>
      <h2>KULLANICI BİLGİLERİ</h2>
      <p class="lead">Kullanıcı e-posta, doğrulama, bakiye, seviye, XP, avatar, çerçeve ve kısıtlama alanlarını tek merkezden güncelle.</p>
    </div>
    <div class="field-grid admin-user-lookup">
      <div class="field pm-admin-grid-span-all"><label for="userInfoIdentifier">Kullanıcı adı / e-posta / UID</label><input id="userInfoIdentifier" type="text" autocomplete="off" placeholder="Kullanıcı adı, e-posta veya UID" /></div>
      <button id="userInfoLoadBtn" type="button" class="table-mini-action">KULLANICIYI GETİR</button>
    </div>
    <div id="userInfoForm" class="admin-user-form" hidden>
      <div class="admin-user-current" id="userInfoCurrent"></div>
      <div class="admin-user-deep" id="userInfoDeep"></div>
      <div class="field-grid">
        <div class="field"><label for="userInfoEmail">E-posta</label><input id="userInfoEmail" type="email" autocomplete="off" /></div>
        <div class="field"><label for="userInfoEmailVerified">E-posta Durumu</label><select id="userInfoEmailVerified"><option value="true">Doğrulanmış</option><option value="false">Doğrulanmamış</option></select></div>
        <div class="field"><label for="userInfoUsername">Kullanıcı Adı</label><input id="userInfoUsername" type="text" autocomplete="off" /></div>
        <div class="field"><label for="userInfoFullName">Ad Soyad</label><input id="userInfoFullName" type="text" autocomplete="off" /></div>
        <div class="field"><label for="userInfoBirthDate">Doğum Tarihi</label><input id="userInfoBirthDate" type="text" inputmode="numeric" placeholder="YYYY-MM-DD" maxlength="10" autocomplete="off" /></div>
        <div class="field"><label for="userInfoBalance">MC Bakiye</label><input id="userInfoBalance" type="number" step="1" /></div>
        <div class="field"><label for="userInfoLevel">Seviye</label><input id="userInfoLevel" type="number" min="1" max="100" step="1" /></div>
        <div class="field"><label for="userInfoXp">XP</label><input id="userInfoXp" type="number" min="0" step="1" /></div>
        <div class="field"><label for="userInfoFrame">Seçili Çerçeve</label><input id="userInfoFrame" type="number" min="0" max="100" step="1" /></div>
        <div class="field"><label for="userInfoExtraWheelRights">Ek Çark Hakkı</label><input id="userInfoExtraWheelRights" type="number" min="0" step="1" /></div>
        <div class="field"><label for="userInfoCrashTickets">Crash Bahisli Hak</label><input id="userInfoCrashTickets" type="number" min="0" step="1" /></div>
        <div class="field"><label for="userInfoChessTickets">Satranç Bahisli Hak</label><input id="userInfoChessTickets" type="number" min="0" step="1" /></div>
        <div class="field"><label for="userInfoPistiTickets">Pişti Bahisli Hak</label><input id="userInfoPistiTickets" type="number" min="0" step="1" /></div>
        <div class="field"><label for="userInfoAvatar">Avatar</label><input id="userInfoAvatar" type="text" autocomplete="off" /></div>
        <div class="field"><label for="userInfoBanned">Kısıtlama</label><select id="userInfoBanned"><option value="false">Aktif / Serbest</option><option value="true">Yasaklı</option></select></div>
        <div class="field pm-admin-grid-span-all"><label for="userInfoBanReason">Kısıtlama Açıklaması</label><textarea id="userInfoBanReason" rows="2"></textarea></div>
      </div>
    </div>
    <div class="action-row"><button id="userInfoSaveBtn" type="button" disabled>KULLANICI BİLGİLERİNİ GÜNCELLE</button></div>`;
  return section;
}
function fillUserInfoForm(payload = {}) {
  const user = payload.user || {};
  const form = document.getElementById('userInfoForm');
  const current = document.getElementById('userInfoCurrent');
  if (form) form.hidden = false;
  const save = document.getElementById('userInfoSaveBtn');
  if (save) save.disabled = false;
  if (current) current.textContent = `UID: ${payload.uid || user.uid || '—'} • ${user.email || 'e-posta yok'} • Seviye ${user.accountLevel || 1}`;
  const set = (id, value) => { const node = document.getElementById(id); if (node) node.value = value ?? ''; };
  const raw = payload.raw || {};
  set('userInfoEmail', user.email || '');
  set('userInfoEmailVerified', String(!!user.emailVerified));
  set('userInfoUsername', user.username || '');
  set('userInfoFullName', user.fullName || '');
  set('userInfoBirthDate', user.birthDate || raw.birthDate || '');
  set('userInfoBalance', Number(user.balance || 0));
  set('userInfoLevel', Number(user.accountLevel || 1));
  set('userInfoXp', Number(user.accountXp || 0));
  const tickets = raw.gameTickets || {};
  set('userInfoFrame', Number(user.selectedFrame || 0));
  set('userInfoExtraWheelRights', Number(raw.extraWheelRights || raw.wheelExtraRights || raw.wheelRights || raw.wheelBonusRights?.count || 0));
  set('userInfoCrashTickets', Number(tickets['crash:bet']?.count || tickets.crash?.count || 0));
  set('userInfoChessTickets', Number(tickets['chess:bet']?.count || tickets.chess?.count || 0));
  set('userInfoPistiTickets', Number(tickets['pisti:bet']?.count || tickets.pisti?.count || 0));
  set('userInfoAvatar', user.avatar || '');
  set('userInfoBanned', String(!!user.banned));
  set('userInfoBanReason', user.banReason || '');
  renderUserInfoDeep(payload);
}
function renderUserInfoDeep(payload = {}) {
  const host = document.getElementById('userInfoDeep');
  if (!host) return;
  const raw = payload.raw || payload.user || {};
  const pairs = [
    ['UID', payload.uid || raw.uid || '—'],
    ['Doğum Tarihi', raw.birthDate || 'Eklenmemiş'],
    ['Market Envanteri', Object.keys(raw.inventory || raw.marketInventory || raw.marketItems || {}).length || 'Yok'],
    ['Aktif Ürünler', [raw.activeFrameId || raw.marketFrameId || raw.selectedFrame, raw.activeBadgeId, raw.nameEffectId].filter(Boolean).join(' / ') || 'Yok'],
    ['Promo Geçmişi', Object.keys(raw.promoClaims || raw.usedPromos || {}).length || 'Yok'],
    ['Çark Geçmişi', Object.keys(raw.wheelHistory || raw.dailyWheel || {}).length || 'Yok'],
    ['Ek Çark Hakkı', Number(raw.extraWheelRights || raw.wheelExtraRights || raw.wheelRights || raw.wheelBonusRights?.count || 0).toLocaleString('tr-TR')],
    ['Oyun Hakları', JSON.stringify(raw.gameTickets || raw.gameRights || raw.dailyRights || raw.gameLimits || {})],
    ['Aktif Oda', raw.activeRoomId || raw.activeChessRoom || raw.activePistiRoom || 'Yok'],
    ['Kısıtlamalar', raw.banned ? `Yasaklı: ${raw.banReason || 'Açıklama yok'}` : 'Aktif / Serbest']
  ];
  host.replaceChildren(...pairs.map(([label, value]) => {
    const item = el('article', 'admin-user-deep-card');
    item.append(el('span', '', label), el('strong', '', String(value || '—').slice(0, 220)));
    return item;
  }));
}
async function loadUserInfoPanel(identifierOverride = '') {
  const identifier = String(identifierOverride || document.getElementById('userInfoIdentifier')?.value || '').trim();
  if (!identifier) return setStatus('userInfoStatus', 'Kullanıcı adı, e-posta veya UID yaz.', 'error');
  const save = document.getElementById('userInfoSaveBtn');
  if (save) save.disabled = true;
  setStatus('userInfoStatus', 'Kullanıcı bilgileri getiriliyor...', 'info');
  try {
    const payload = await adminFetch(`/api/admin/matrix/user-info?identifier=${encodeURIComponent(identifier)}`);
    fillUserInfoForm(payload);
    setStatus('userInfoStatus', 'Kullanıcı bilgileri yüklendi.', 'ok');
  } catch (error) {
    const payload = error?.payload || {};
    if (payload?.error === 'MULTIPLE_USERS_MATCH' && Array.isArray(payload.matches) && payload.matches.length) {
      renderUserInfoMatches(payload.matches);
      setStatus('userInfoStatus', 'Birden fazla kullanıcı eşleşti. Lütfen doğru kullanıcıyı seç.', 'warning');
      return;
    }
    setStatus('userInfoStatus', error?.message || 'Kullanıcı bilgileri getirilemedi.', 'error');
    throw error;
  }
}
function renderUserInfoMatches(matches = []) {
  const form = document.getElementById('userInfoForm');
  const deep = document.getElementById('userInfoDeep');
  const current = document.getElementById('userInfoCurrent');
  const save = document.getElementById('userInfoSaveBtn');
  if (form) form.hidden = false;
  if (save) save.disabled = true;
  if (current) current.textContent = 'Birden fazla kullanıcı eşleşti. Yönetmek istediğin kullanıcıyı seç.';
  const host = deep || current;
  if (!host) return;
  const cards = matches.slice(0, 12).map((item) => {
    const card = el('button', 'admin-user-match-card', '');
    card.type = 'button';
    const title = item.username || item.email || item.uid || 'Kullanıcı';
    card.append(el('strong', '', title), el('span', '', `${item.email || 'e-posta yok'} • UID: ${item.uid || '—'} • Eşleşme: ${item.match || '—'}`));
    card.addEventListener('click', () => {
      const input = document.getElementById('userInfoIdentifier');
      if (input) input.value = item.uid || item.email || item.username || '';
      loadUserInfoPanel(item.uid || item.email || item.username || '').catch(() => null);
    });
    return card;
  });
  host.replaceChildren(...cards);
}
async function saveUserInfoPanel() {
  const identifier = document.getElementById('userInfoIdentifier')?.value.trim();
  if (!identifier) throw new Error('Kullanıcı seçilmedi.');
  const body = {
    identifier,
    email: document.getElementById('userInfoEmail')?.value.trim(),
    emailVerified: document.getElementById('userInfoEmailVerified')?.value === 'true',
    username: document.getElementById('userInfoUsername')?.value.trim(),
    fullName: document.getElementById('userInfoFullName')?.value.trim(),
    birthDate: document.getElementById('userInfoBirthDate')?.value.trim(),
    balance: Number(document.getElementById('userInfoBalance')?.value || 0),
    accountLevel: Number(document.getElementById('userInfoLevel')?.value || 1),
    accountXp: Number(document.getElementById('userInfoXp')?.value || 0),
    selectedFrame: Number(document.getElementById('userInfoFrame')?.value || 0),
    extraWheelRights: Number(document.getElementById('userInfoExtraWheelRights')?.value || 0),
    gameTickets: {
      'crash:bet': { count: Number(document.getElementById('userInfoCrashTickets')?.value || 0) },
      'chess:bet': { count: Number(document.getElementById('userInfoChessTickets')?.value || 0) },
      'pisti:bet': { count: Number(document.getElementById('userInfoPistiTickets')?.value || 0) }
    },
    avatar: document.getElementById('userInfoAvatar')?.value.trim(),
    banned: document.getElementById('userInfoBanned')?.value === 'true',
    banReason: document.getElementById('userInfoBanReason')?.value.trim(),
    ...selectedNotificationPayload('userInfo')
  };
  setStatus('userInfoStatus', 'Kullanıcı bilgileri güncelleniyor...', 'info');
  const payload = await adminFetch('/api/admin/matrix/user-info', { method: 'PATCH', body: JSON.stringify(body) });
  setStatus('userInfoStatus', `Kullanıcı bilgileri güncellendi. UID: ${payload.uid || identifier}.`, 'ok');
  await loadUserInfoPanel().catch(() => null);
}


const ADMIN_MODAL_DEFS = Object.freeze([
  ['reset', 'fa-rotate-left', 'Toplu Durum Sıfırlama'],
  ['maintenance', 'fa-screwdriver-wrench', 'Bakım Modu'],
  ['crash', 'fa-chart-line', 'Crash Kontrolü'],
  ['wheel', 'fa-dharmachakra', 'Çark Kontrolü'],
  ['market', 'fa-store', 'Market Kontrolü'],
  ['restrict', 'fa-user-lock', 'Kullanıcı Kısıtlama'],
  ['reward', 'fa-gift', 'Kullanıcı Ödülü'],
  ['rewardAll', 'fa-coins', 'Tüm Kullanıcılara MC Ödülü'],
  ['promo', 'fa-ticket', 'Promosyon Kodu'],
  ['userInfo', 'fa-address-card', 'Kullanıcı Bilgileri'],
  ['issues', 'fa-triangle-exclamation', 'Hata Takip Merkezi']
]);
let adminModalVault = null;
let adminModalContent = null;
let adminModalOverlay = null;
const adminModalPanels = new Map();
function buildAdminActionGrid() {
  const grid = document.createElement('section');
  grid.className = 'panel admin-action-panel';
  const head = document.createElement('div');
  head.className = 'admin-action-head';
  head.innerHTML = '<h2>YÖNETİM MODALLARI</h2><p class="lead">Her işlem AnaSayfa modal standardına uyumlu, alttan açılan profesyonel full modal ekranında çalışır.</p>';
  const actions = document.createElement('div');
  actions.className = 'admin-action-grid';
  ADMIN_MODAL_DEFS.forEach(([key, icon, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-action-tile';
    btn.dataset.adminOpenModal = key;
    btn.innerHTML = `<span class="admin-action-icon"><i class="fa-solid ${icon}"></i></span><strong>${label}</strong><small>Full modal aç</small>`;
    actions.appendChild(btn);
  });
  grid.append(head, actions);
  return grid;
}
function createAdminModalShell() {
  const overlay = document.createElement('div');
  overlay.id = 'adminModalOverlay';
  overlay.className = 'admin-modal-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<div class="admin-modal-backdrop" data-admin-close-modal="true"></div><section class="admin-modal-sheet" role="dialog" aria-modal="true"><div class="admin-modal-grabber"></div><button id="adminModalCloseBtn" class="admin-modal-close" type="button" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button><div id="adminModalContent" class="admin-modal-content"></div></section>';
  return overlay;
}
function installAdminModalSystem() {
  const app = root.querySelector('.admin-app');
  if (!app || adminModalOverlay) return;
  const firstPanel = app.querySelector('.panel.stack');
  if (firstPanel) firstPanel.insertAdjacentElement('afterend', buildAdminActionGrid());
  adminModalVault = document.createElement('div');
  adminModalVault.id = 'adminPanelVault';
  adminModalVault.hidden = true;
  app.appendChild(adminModalVault);
  adminModalOverlay = createAdminModalShell();
  document.body.appendChild(adminModalOverlay);
  adminModalOverlay.addEventListener('click', handleDashboardClick);
  adminModalContent = adminModalOverlay.querySelector('#adminModalContent');
  const layoutHero = app.querySelector('.layout-hero');
  const resetPanel = layoutHero?.querySelector('section:nth-child(1)');
  const maintenancePanel = layoutHero?.querySelector('section:nth-child(2)');
  const crashPanel = app.querySelector('.crash-control-panel');
  const wheelPanel = app.querySelector('#wheelAdminPanel');
  const marketPanel = app.querySelector('#marketAdminPanel');
  const grid3 = app.querySelector('.layout-grid-3');
  const restrictPanel = grid3?.querySelector('section:nth-child(1)');
  const rewardPanel = grid3?.querySelector('section:nth-child(2)');
  const rewardAllPanel = grid3?.querySelector('section:nth-child(3)');
  const promoPanel = Array.from(app.querySelectorAll('section.panel')).find((s) => s.querySelector('#promoRows'));
  const issuesPanel = Array.from(app.querySelectorAll('section.panel')).find((s) => s.querySelector('#gameIssueList') || s.querySelector('#systemIssueList'));
  const userInfoPanel = buildUserInfoPanel();
  app.appendChild(userInfoPanel);
  const entries = { reset: resetPanel, maintenance: maintenancePanel, crash: crashPanel, wheel: wheelPanel, market: marketPanel, restrict: restrictPanel, reward: rewardPanel, rewardAll: rewardAllPanel, promo: promoPanel, userInfo: userInfoPanel, issues: issuesPanel };
  injectNotificationControl(resetPanel, 'reset', false);
  injectNotificationControl(maintenancePanel, 'maintenance', false);
  injectNotificationControl(wheelPanel, 'wheel', false);
  injectNotificationControl(marketPanel, 'market', true);
  injectNotificationControl(restrictPanel, 'restrict', true);
  injectNotificationControl(rewardPanel, 'reward', true);
  injectNotificationControl(rewardAllPanel, 'rewardAll', false);
  injectNotificationControl(promoPanel, 'promo', false);
  injectNotificationControl(userInfoPanel, 'userInfo', true);
  Object.entries(entries).forEach(([key, panel]) => {
    if (!panel) return;
    panel.dataset.adminPanel = key;
    panel.classList.add('admin-modal-panel');
    adminModalPanels.set(key, panel);
    adminModalVault.appendChild(panel);
  });
  [layoutHero, grid3].forEach((node) => { if (node) node.hidden = true; });
}
function openAdminPanelModal(key = '') {
  installAdminModalSystem();
  const panel = adminModalPanels.get(String(key || ''));
  if (!panel || !adminModalOverlay || !adminModalContent) return;
  adminModalContent.replaceChildren(panel);
  adminModalContent.scrollTop = 0;
  panel.scrollTop = 0;
  adminModalOverlay.classList.add('is-open');
  adminModalOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('admin-modal-lock');
  if (String(key || '') === 'promo') updatePromoTypeFields();
  if (String(key || '') === 'reward') updateRewardTypeFields();
  window.requestAnimationFrame(() => panel.querySelector('input,select,textarea,button')?.focus?.({ preventScroll: true }));
}
function closeAdminPanelModal() {
  if (!adminModalOverlay || !adminModalContent || !adminModalVault) return;
  Array.from(adminModalContent.children).forEach((child) => adminModalVault.appendChild(child));
  adminModalOverlay.classList.remove('is-open');
  adminModalOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('admin-modal-lock');
}

const AVATAR_FRAME_INPUTS = Object.freeze({
  avatarScale:'avatarScaleInput', frameScale:'frameScaleInput', avatarOffsetX:'avatarOffsetXInput', avatarOffsetY:'avatarOffsetYInput',
  frameOffsetX:'frameOffsetXInput', frameOffsetY:'frameOffsetYInput', innerPadding:'innerPaddingInput', outerPadding:'outerPaddingInput'
});
const AVATAR_FRAME_DEFAULT = Object.freeze({ avatarScale:1, frameScale:1, avatarOffsetX:0, avatarOffsetY:0, frameOffsetX:0, frameOffsetY:0, innerPadding:0, outerPadding:0, thickness:'normal', overflow:'visible' });
let avatarFrameAdminPayload = null;

function avatarFrameSelectionKey() {
  const type = document.getElementById('avatarFrameTypeSelect')?.value || 'normal';
  const index = Math.max(1, Number(document.getElementById('avatarFrameIndexSelect')?.value || 1) || 1);
  const variant = document.getElementById('avatarFrameVariantSelect')?.value || 'leaderboard';
  return { type, index, variant, key:`${type}:${index}:${variant}` };
}
function readAvatarFrameSettingForm() {
  const setting = {};
  Object.entries(AVATAR_FRAME_INPUTS).forEach(([key,id]) => { setting[key] = Number(document.getElementById(id)?.value || AVATAR_FRAME_DEFAULT[key]); });
  setting.thickness = document.getElementById('avatarFrameThicknessSelect')?.value || 'normal';
  setting.overflow = document.getElementById('avatarFrameOverflowSelect')?.value || 'visible';
  return setting;
}
function writeAvatarFrameSettingForm(setting = AVATAR_FRAME_DEFAULT) {
  Object.entries(AVATAR_FRAME_INPUTS).forEach(([key,id]) => { const node=document.getElementById(id); if(node) node.value=String(setting[key] ?? AVATAR_FRAME_DEFAULT[key]); });
  const thickness=document.getElementById('avatarFrameThicknessSelect'); if(thickness) thickness.value=setting.thickness || 'normal';
  const overflow=document.getElementById('avatarFrameOverflowSelect'); if(overflow) overflow.value=setting.overflow || 'visible';
}
const AVATAR_FRAME_LIVE_SIZES = Object.freeze({
  homeTopbar:[40], leaderboard:[78,64,46], accountModal:[68], accountProfileCard:[112,78], marketCard:[98],
  crashTopbar:[50], crashLivePanel:[56], crashWinNotice:[72], chessTopbar:[50], chessGameCard:[68],
  pistiTopbar:[50], pistiScoreCard:[68], snakeTopbar:[50], spaceTopbar:[50]
});
function variantPreviewSizes(variant='leaderboard') {
  const values=AVATAR_FRAME_LIVE_SIZES[variant] || [64];
  return [...new Set(values.map((value)=>Math.max(18,Number(value)||64)))];
}
function avatarFrameLabel(variant='') { return String(variant || '').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,(c)=>c.toUpperCase()); }
function refreshAvatarFrameIndexOptions() {
  const type=document.getElementById('avatarFrameTypeSelect')?.value || 'normal';
  const select=document.getElementById('avatarFrameIndexSelect'); if(!select) return;
  const current=Math.max(1,Number(select.value || 1)||1); const max=type==='market'?32:18;
  select.replaceChildren(...Array.from({length:max},(_,i)=>new Option(`${type==='market'?'Market':'Normal'} ${i+1}`,String(i+1))));
  select.value=String(Math.min(current,max));
}
function selectedAvatarFrameSetting() {
  const selected=avatarFrameSelectionKey();
  const config=avatarFrameAdminPayload?.config || {};
  return config.frames?.[selected.key] || config.variants?.[selected.variant] || AVATAR_FRAME_DEFAULT;
}
function hydrateAvatarFrameSetting() { writeAvatarFrameSettingForm(selectedAvatarFrameSetting()); renderAvatarFramePreview(); }
function renderAvatarFramePreview() {
  const host=document.getElementById('avatarFramePreviewHost'); if(!host || !window.PMAvatar?.mount) return;
  const selected=avatarFrameSelectionKey(); const setting=readAvatarFrameSettingForm();
  const avatarUrl=document.getElementById('avatarFramePreviewAvatar')?.value.trim() || '/public/assets/avatars/system/fallback.svg';
  const frameUrl=selected.type==='market'?`/public/assets/market/frames/market-${selected.index}.png`:'';
  const stage=document.getElementById('avatarFramePreviewStage');
  if(stage) {
    stage.dataset.previewVariant=selected.variant;
    stage.className=`avatar-frame-preview-stage avatar-frame-preview-stage--${selected.variant}`;
    let context=stage.querySelector('.avatar-frame-preview-context');
    if(!context){ context=document.createElement('div'); context.className='avatar-frame-preview-context'; stage.appendChild(context); }
    const labels={homeTopbar:'AnaSayfa Üst Bar',leaderboard:'Liderlik Kartları',accountModal:'Hesabım Modalı',accountProfileCard:'Profil Kartları',marketCard:'Market Kartı',crashTopbar:'Crash Üst Bar',crashLivePanel:'Crash Canlı Panel',crashWinNotice:'Crash Kazanç Bildirimi',chessTopbar:'Satranç Üst Bar',chessGameCard:'Satranç Oyun Kartı',pistiTopbar:'Pişti Üst Bar',pistiScoreCard:'Pişti Skor Kartı',snakeTopbar:'Snake Pro Üst Bar',spaceTopbar:'Space Pro Üst Bar'};
    const calibration=window.PMAvatar?.FRAME_CALIBRATIONS?.[selected.type]?.[selected.index] || null;
    const aperture=calibration?.innerApertureRatio ? ` · İç açıklık %${Math.round(calibration.innerApertureRatio*100)}` : '';
    context.innerHTML=`<strong>${labels[selected.variant] || avatarFrameLabel(selected.variant)}</strong><span>Gerçek canlı slot ölçüleri: ${variantPreviewSizes(selected.variant).join(' / ')} px${aperture}</span>`;
  }
  const label=document.getElementById('avatarFramePreviewLabel'); if(label) label.textContent=avatarFrameLabel(selected.variant);
  host.classList.remove('pm-avatar-host');
  host.replaceChildren();
  const row=document.createElement('span'); row.className='avatar-frame-preview-hosts'; host.appendChild(row);
  variantPreviewSizes(selected.variant).forEach((sizePx)=>{
    const unit=document.createElement('span'); unit.className='avatar-frame-preview-unit';
    const mountHost=document.createElement('span'); mountHost.className='pm-avatar-host avatar-frame-preview-live-host';
    const caption=document.createElement('small'); caption.textContent=`${sizePx}px`;
    unit.append(mountHost,caption); row.appendChild(unit);
    window.PMAvatar.mount(mountHost,{ avatarUrl, level:selected.type==='normal'?selected.index:0, exactFrameIndex:selected.type==='normal'?selected.index:0, frameUrl, frameType:selected.type, frameId:`${selected.type}-${selected.index}`, marketFrameId:selected.type==='market'?`market-${selected.index}`:'', variant:selected.variant, sizePx, variantSetting:setting, extraClass:'pm-avatar--admin-live-preview' });
  });
}
async function loadAvatarFrameAdminSettings() {
  avatarFrameAdminPayload=await adminFetch('/api/admin/avatar-frame/settings');
  const variants=document.getElementById('avatarFrameVariantSelect');
  if(variants && !variants.options.length) variants.replaceChildren(...(avatarFrameAdminPayload.variants || []).map((value)=>new Option(avatarFrameLabel(value),value)));
  refreshAvatarFrameIndexOptions();
  try { window.PMAvatar?.setSettings?.(avatarFrameAdminPayload.config || {}); } catch (_) {}
  hydrateAvatarFrameSetting();
  setStatus('avatarFrameAdminStatus','Avatar ve çerçeve ayarları yüklendi.','ok');
}
async function saveAvatarFrameAdminSetting(reset=false) {
  const selected=avatarFrameSelectionKey();
  setStatus('avatarFrameAdminStatus',reset?'Varsayılan ayar geri yükleniyor...':'Ayar kaydediliyor...','info');
  const payload=await adminFetch('/api/admin/avatar-frame/settings',{method:'PATCH',body:JSON.stringify({variant:selected.variant,frameType:selected.type,frameIndex:selected.index,setting:readAvatarFrameSettingForm(),reset})});
  avatarFrameAdminPayload={...(avatarFrameAdminPayload || {}),config:payload.config || avatarFrameAdminPayload?.config || {}};
  try { window.PMAvatar?.setSettings?.(avatarFrameAdminPayload.config || {}); } catch (_) {}
  writeAvatarFrameSettingForm(payload.setting || AVATAR_FRAME_DEFAULT); renderAvatarFramePreview();
  setStatus('avatarFrameAdminStatus',reset?'Variant varsayılan ayara döndürüldü.':'Avatar ve çerçeve ayarı kalıcı olarak kaydedildi.','ok');
}

async function loadDashboard() {
  const [dashboard, promos, issues] = await Promise.all([
    adminFetch('/api/admin/matrix/dashboard'),
    adminFetch('/api/admin/matrix/promos').catch(() => ({ items: [] })),
    adminFetch('/api/admin/matrix/issues').catch(() => ({ games: [], systems: [], recentErrors: [] }))
  ]);
  loadAvatarFrameAdminSettings().catch((error) => setStatus('avatarFrameAdminStatus', error?.message || 'Avatar/çerçeve ayarları yüklenemedi.', 'error'));
  const metrics = dashboard.metrics || {};
  replaceWithChildren(document.getElementById('metricGrid'), [
    buildMetricCard('Toplam Kullanıcı Sayısı', money(metrics.userCount)),
    buildMetricCard('Gün İçi Toplam MC Harcama', money(metrics.dailyMcSpend)),
    buildMetricCard('Gün İçi MC Çıkışı', money(metrics.totalLoss), 'negative'),
    buildMetricCard('Gün İçi MC Girişi', money(metrics.totalProfit), 'positive'),
    buildMetricCard('Sistemdeki MC Bakiyesi', money(metrics.totalBalance || 0), 'positive'),
    buildMetricCard('Açık Oda Sayısı', money(metrics.openRoomCount)),
    buildMetricCard('Silinen Hesap Sayısı', money(metrics.deletedCount)),
    buildMetricCard('Muted Kullanıcı Sayısı', money(metrics.mutedCount))
  ]);

  const resetLabels = [
    ['balance', 'Bakiye'], ['accountLevel', 'Seviye'], ['accountXp', 'XP'],
    ['avatar', 'Avatar'], ['avatarFrame', 'Avatar + Çerçeve'], ['selectedFrame', 'Çerçeve'],
    ['marketActiveProducts', 'Market Aktif Ürünleri'], ['userCollections', 'Kullanıcı Firebase Koleksiyonları'],
    ['activityScore', 'Aktiflik Puanı'], ['monthlyActiveScore', 'Aylık Aktiflik'], ['leaderboard', 'Liderlik Sıralaması'],
    ['dailyWheelRights', 'Günlük Çark Hakları'], ['promoHistory', 'Promo Kullanım Geçmişi'], ['gameDailyRights', 'Oyun Günlük Hakları'],
    ['classicXpCaps', 'Klasik Oyun XP Limitleri'], ['crashActiveBets', 'Crash Aktif Bahis Durumları'],
    ['openRooms', 'Satranç / Pişti Açık Oda Durumları'], ['notificationHistory', 'Bildirim Geçmişi'], ['runtimeUserState', 'Runtime Kullanıcı State']
  ];
  replaceWithChildren(document.getElementById('resetFieldGrid'), resetLabels.map(([value, label]) => buildResetOption(value, label)));

  renderMaintenanceGrid(dashboard.maintenance || {});

  renderTableRows(document.getElementById('promoRows'), (promos.items || []).map((item) => {
    const code = item.code || item.id || '—';
    const actionCell = document.createElement('td');
    const del = el('button', 'table-mini-danger', 'İPTAL / SİL');
    del.type = 'button';
    del.dataset.promoDelete = code;
    actionCell.appendChild(del);
    return buildRow([
      buildCell(code),
      buildCell(item.rewardSummary || [Number(item.amount || 0) ? money(item.amount) + ' MC' : '', Number(item.xp || 0) ? money(item.xp) + ' XP' : '', item.marketItemId ? 'Market: ' + item.marketItemId : '', item.badgeId ? 'Rozet: ' + item.badgeId : '', item.nameEffectId ? 'Efekt: ' + item.nameEffectId : ''].filter(Boolean).join(' + ') || '—'),
      buildCell(money(item.limitLeft)),
      buildCell(formatWhen(item.expiresAt)),
      actionCell
    ]);
  }), 'Promo kod bulunmuyor.', 5);
  const recentErrors = issues.recentErrors || [];
  const derivedSystemIssues = Array.isArray(issues.systems) && issues.systems.length
    ? issues.systems
    : recentErrors.slice(0, 6).map((item) => ({
        area: item.area || item.source || 'Runtime',
        error: item.message || item.error?.message || item.reason || 'Runtime hata kaydı',
        reason: item.scope || item.event || item.category || 'runtime',
        solution: inferIssueSolution(item),
        source: item.source || item.path || item.endpoint || ''
      }));
  renderIssueList(document.getElementById('backendIssueList') || document.getElementById('gameIssueList'), issues.backend || derivedSystemIssues || []);
  renderIssueList(document.getElementById('frontendIssueList') || document.getElementById('systemIssueList'), issues.frontend || issues.games || []);
  renderRecentErrorCards(document.getElementById('recentErrorCards'), recentErrors);
  renderTableRows(document.getElementById('recentErrorRows'), recentErrors.map((item) => {
    const copy = publicIssueCopy(item);
    return buildRow([
      buildCell(formatWhen(item.createdAt || item.timestamp)),
      buildCell(item.area || item.game || item.scope || item.event || 'Sistem'),
      buildCell(copy.title)
    ]);
  }), 'Kritik hata kaydı yok.', 3);
  await loadCrashRiskPanel();
  await loadWheelAdminConfig();
  await loadMarketAdminPanel();
}

function getCheckedResetFields() {
  return Array.from(document.querySelectorAll('#resetFieldGrid input:checked')).map((el) => el.value);
}

function currentMaintenanceState() {
  const out = { general: false, system: false, market: false, wheel: false, promo: false, classic: false };
  document.querySelectorAll('[data-maintenance]').forEach((el) => { out[el.dataset.maintenance] = el.classList.contains('is-on'); });
  return out;
}

function selectedRestrictionAction() {
  return document.querySelector('input[name="restrictMode"]:checked')?.dataset.restrict || '';
}

function updatePromoTypeFields() {
  const type = document.getElementById('promoTypeSelect')?.value || 'mc';
  const map = {
    mc: ['promo-field-mc'],
    xp: ['promo-field-xp'],
    market: ['promo-field-market'],
    crash_bet_ticket: ['promo-field-ticket'],
    chess_bet_ticket: ['promo-field-ticket'],
    pisti_bet_ticket: ['promo-field-ticket'],
    wheel_right: ['promo-field-ticket']
  };
  document.querySelectorAll('.promo-field').forEach((node) => {
    const visible = (map[type] || []).some((className) => node.classList.contains(className));
    node.hidden = !visible;
  });
}

function updateRewardTypeFields() {
  const type = document.getElementById('rewardTypeSelect')?.value || 'mc';
  const map = {
    mc: ['reward-field-mc'],
    xp: ['reward-field-xp'],
    market: ['reward-field-market'],
    crash_bet_ticket: ['reward-field-ticket'],
    chess_bet_ticket: ['reward-field-ticket'],
    pisti_bet_ticket: ['reward-field-ticket'],
    wheel_right: ['reward-field-ticket']
  };
  document.querySelectorAll('.reward-field').forEach((node) => {
    const visible = (map[type] || []).some((className) => node.classList.contains(className));
    node.hidden = !visible;
  });
}

function readResetTargetPayload() {
  const scope = document.getElementById('resetTargetScope')?.value || 'all';
  const identifiers = String(document.getElementById('resetTargetIdentifiers')?.value || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  return { scope, identifiers, excludeTestUsers: !!document.getElementById('resetExcludeTests')?.checked };
}
function renderResetPreview(payload = {}) {
  const box = document.getElementById('resetPreviewBox');
  if (!box) return;
  box.hidden = false;
  const fields = Array.isArray(payload.fields) ? payload.fields.join(', ') : '—';
  const sample = Array.isArray(payload.sample) && payload.sample.length ? payload.sample.join(', ') : 'Örnek kullanıcı yok';
  box.textContent = `Önizleme: ${Number(payload.affected || 0).toLocaleString('tr-TR')} kullanıcı etkilenecek. Alanlar: ${fields}. Örnek: ${sample}.`;
}

async function handleAction(action) {
  try {
    if (action === 'logout') {
      await adminFetch('/api/auth/admin/matrix/logout', { method: 'POST' }).catch(() => null);
      return redirectOut();
    }
    if (action === 'refresh') {
      await loadDashboard();
      return;
    }
    if (action === 'reset-preview') {
      const fields = getCheckedResetFields();
      if (!fields.length) throw new Error('Önizleme için sıfırlanacak alan seçin.');
      const payload = await adminFetch('/api/admin/matrix/reset-nuclear', { method: 'POST', body: JSON.stringify({ fields, dryRun: true, ...readResetTargetPayload() }) });
      renderResetPreview(payload);
      setStatus('resetStatus', `Önizleme hazır. Etkilenecek kullanıcı: ${money(payload.affected || 0)}.`, 'info');
      return;
    }
    if (action === 'reset') {
      const fields = getCheckedResetFields();
      if (!fields.length) throw new Error('Sıfırlanacak alan seçin.');
      const payload = await adminFetch('/api/admin/matrix/reset-nuclear', { method: 'POST', body: JSON.stringify({ fields, ...readResetTargetPayload(), ...selectedNotificationPayload('reset') }) });
      renderResetPreview(payload);
      setStatus('resetStatus', `Toplu sıfırlama tamamlandı. Etkilenen kullanıcı: ${money(payload.affected || 0)}.`, 'ok');
      return loadDashboard();
    }
    if (action === 'save-maintenance') {
      const payload = await adminFetch('/api/admin/matrix/maintenance', { method: 'PATCH', body: JSON.stringify({ ...currentMaintenanceState(), ...selectedNotificationPayload('maintenance') }) });
      const confirmed = await adminFetch('/api/admin/matrix/dashboard').catch(() => ({ maintenance: payload?.maintenance || currentMaintenanceState() }));
      renderMaintenanceGrid(confirmed.maintenance || payload?.maintenance || currentMaintenanceState());
      const persistedLabel = payload?.persisted === false ? 'Runtime durum güncellendi.' : 'Kalıcı kayıt server tarafından onaylandı.';
      setStatus('maintenanceStatus', `Bakım modu kaydedildi. ${payload?.activeGames ? `Aktif bakım: ${payload.activeGames}. ` : ''}${persistedLabel}`, 'ok');
      return;
    }
    if (action.startsWith('restrict:')) {
      const mode = action.split(':')[1];
      const identifier = document.getElementById('restrictIdentifier')?.value.trim();
      const durationMinutes = Number(document.getElementById('restrictDuration')?.value || 0);
      const reason = document.getElementById('restrictReason')?.value.trim();
      if (!identifier) throw new Error('Hedef kullanıcı gerekli.');
      const payload = await adminFetch('/api/admin/matrix/restrict-user', { method: 'POST', body: JSON.stringify({ identifier, action: mode, durationMinutes, reason, ...selectedNotificationPayload('restrict') }) });
      setStatus('restrictStatus', `Kısıtlama uygulandı. UID: ${payload.uid || identifier}.`, 'ok');
      return;
    }
    if (action === 'reward-user') {
      const identifier = document.getElementById('rewardIdentifier')?.value.trim();
      const rewardType = document.getElementById('rewardTypeSelect')?.value || 'mc';
      const amount = rewardType === 'mc' ? Number(document.getElementById('rewardAmount')?.value || 0) : 0;
      const xp = rewardType === 'xp' ? Number(document.getElementById('rewardXp')?.value || 0) : 0;
      const marketItemId = rewardType === 'market' ? document.getElementById('rewardMarketItemId')?.value.trim() : '';
      const ticketCount = ['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket','wheel_right'].includes(rewardType) ? Math.max(1, Math.trunc(Number(document.getElementById('rewardTicketCount')?.value || 1) || 1)) : 0;
      const reason = document.getElementById('rewardReason')?.value.trim();
      if (!identifier) throw new Error('Hedef kullanıcı gerekli.');
      if (rewardType === 'mc' && amount <= 0) throw new Error('Geçerli MC miktarı gerekli.');
      if (rewardType === 'xp' && xp <= 0) throw new Error('Geçerli XP miktarı gerekli.');
      if (rewardType === 'market' && !marketItemId) throw new Error('Market ürün veya çerçeve ID gerekli.');
      if (['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket','wheel_right'].includes(rewardType) && ticketCount <= 0) throw new Error('Geçerli hak sayısı gerekli.');
      if (!reason) throw new Error('Ödül açıklaması gerekli.');
      const payload = await adminFetch('/api/admin/matrix/reward-user', { method: 'POST', body: JSON.stringify({ identifier, rewardType, amount, xp, marketItemId, ticketCount, reason, ...selectedNotificationPayload('reward') }) });
      setStatus('rewardStatus', `Kullanıcıya ödül gönderildi. UID: ${payload.uid || identifier}.`, 'ok');
      return loadDashboard();
    }
    if (action === 'reward-all') {
      const amount = Number(document.getElementById('rewardAllAmount')?.value || 0);
      const reason = document.getElementById('rewardAllReason')?.value.trim();
      if (amount <= 0) throw new Error('Geçerli MC miktarı gerekli.');
      if (!reason) throw new Error('Ödül açıklaması gerekli.');
      const payload = await adminFetch('/api/admin/matrix/reward-all', { method: 'POST', body: JSON.stringify({ amount, reason, ...selectedNotificationPayload('rewardAll') }) });
      setStatus('rewardAllStatus', `Toplu MC dağıtımı tamamlandı. Etkilenen kullanıcı: ${money(payload.affected || 0)}.`, 'ok');
      return loadDashboard();
    }
    if (action === 'promo-create') {
      const promoType = document.getElementById('promoTypeSelect')?.value || 'mc';
      const code = document.getElementById('promoCode')?.value.trim();
      const amount = promoType === 'mc' ? Number(document.getElementById('promoAmount')?.value || 0) : 0;
      const xp = promoType === 'xp' ? Number(document.getElementById('promoXp')?.value || 0) : 0;
      const marketItemId = promoType === 'market' ? document.getElementById('promoMarketItemId')?.value.trim() : '';
      const ticketCount = ['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket','wheel_right'].includes(promoType) ? Math.max(1, Math.trunc(Number(document.getElementById('promoTicketCount')?.value || 1) || 1)) : 0;
      const durationHours = Number(document.getElementById('promoDuration')?.value || 0);
      const usageLimit = Number(document.getElementById('promoLimit')?.value || 0);
      const onePerAccount = String(document.getElementById('promoPerAccount')?.value || 'true') === 'true';
      const description = document.getElementById('promoDescription')?.value.trim();
      if (!code) throw new Error('Promo kodu gerekli.');
      if (promoType === 'mc' && amount <= 0) throw new Error('Geçerli MC miktarı gerekli.');
      if (promoType === 'xp' && xp <= 0) throw new Error('Geçerli XP miktarı gerekli.');
      if (promoType === 'market' && !marketItemId) throw new Error('Market ürün veya çerçeve ID gerekli.');
      if (['crash_bet_ticket','chess_bet_ticket','pisti_bet_ticket','wheel_right'].includes(promoType) && ticketCount <= 0) throw new Error('Geçerli hak sayısı gerekli.');
      if (durationHours <= 0) throw new Error('Kod süresi gerekli.');
      if (usageLimit <= 0) throw new Error('Kod kişi sayısı gerekli.');
      await adminFetch('/api/admin/matrix/promo-codes', { method: 'POST', body: JSON.stringify({ code, promoType, amount, xp, marketItemId, ticketCount, durationHours, usageLimit, onePerAccount, description, ...selectedNotificationPayload('promo') }) });
      setStatus('promoStatus', 'Promosyon kodu oluşturuldu.', 'ok');
      return loadDashboard();
    }
    if (action === 'promo-delete') {
      const code = String(arguments[1] || '').trim().toUpperCase();
      if (!code) throw new Error('Silinecek promo kodu bulunamadı.');
      await adminFetch(`/api/admin/matrix/promo-codes/${encodeURIComponent(code)}`, { method: 'DELETE', body: JSON.stringify({ ...selectedNotificationPayload('promo') }) });
      setStatus('promoStatus', `${code} promosyon kodu iptal edildi/silindi.`, 'ok');
      return loadDashboard();
    }
    if (action === 'crash-risk-save') {
      requireCrashRiskConfirm();
      const rows = collectCrashRiskRows();
      if (!rows.length) throw new Error('Risk tablosu boş olamaz.');
      try {
        const payload = await adminFetch('/api/crash/admin/risk-table', { method: 'POST', body: JSON.stringify({ rows }) });
        renderCrashRiskPanel(payload || {});
        setStatus('crashRiskStatus', 'Crash risk tablosu kaydedildi. Yeni çarpan seçimleri bir sonraki crash point üretiminden itibaren geçerlidir.', 'ok');
      } catch (error) {
        setStatus('crashRiskStatus', formatCrashValidationDetails(error), 'error');
      }
      return;
    }
    if (action === 'crash-risk-reset') {
      requireCrashRiskConfirm();
      const payload = await adminFetch('/api/crash/admin/risk-table', { method: 'POST', body: JSON.stringify({ resetDefault: true }) });
      renderCrashRiskPanel(payload || {});
      setStatus('crashRiskStatus', payload.overrideCleared ? 'Varsayılan Crash risk tablosu yüklendi ve bekleyen override temizlendi.' : 'Varsayılan Crash risk tablosu yüklendi.', 'ok');
      return;
    }
    if (action === 'crash-current-set' || action === 'crash-next-set') {
      requireCrashRiskConfirm();
      const multiplier = parseDecimalInput(document.getElementById('nextCrashPointInput')?.value || 0);
      if (!Number.isFinite(multiplier) || multiplier < 1.01 || multiplier > 10000) throw new Error('Çarpan 1.01 ile 10000 arasında olmalı. Virgül veya nokta kullanabilirsin.');
      const target = action === 'crash-current-set' ? 'current_countdown_round' : 'next_created_round';
      try {
        const payload = await adminFetch('/api/crash/admin/next-crash-point', { method: 'POST', body: JSON.stringify({ multiplier, target }) });
        setStatus('crashRiskStatus', payload.appliedTo === 'current_countdown_round'
          ? `Aktif geri sayım roundu ${formatMultiplier(payload.selectedMultiplier)} olarak ayarlandı.`
          : `Sonraki oluşturulacak round ${formatMultiplier(payload.selectedMultiplier || payload.nextCrashPointOverride)} olarak kaydedildi.`, 'ok');
      } catch (error) {
        setStatus('crashRiskStatus', formatCrashValidationDetails(error), 'error');
      }
      await loadCrashRiskPanel();
      return;
    }
    if (action === 'crash-next-clear') {
      requireCrashRiskConfirm();
      await adminFetch('/api/crash/admin/next-crash-point', { method: 'DELETE' });
      const nextInput = document.getElementById('nextCrashPointInput');
      if (nextInput) nextInput.value = '';
      setStatus('crashRiskStatus', 'Crash çarpan override temizlendi; aktif geri sayım varsa risk tablosundan yeni çarpan seçildi.', 'ok');
      await loadCrashRiskPanel();
      return;
    }
    if (action === 'crash-future-save') {
      requireCrashRiskConfirm();
      const text = document.getElementById('futureCrashPointsInput')?.value || '';
      const points = String(text).split(/[\s,;|]+/).map(parseDecimalInput).filter((n) => Number.isFinite(n) && n >= 1.01 && n <= 10000).slice(0, 100);
      if (!points.length) throw new Error('Gelecek el listesi için 1.01-10000 arasında en az 1 çarpan yaz.');
      const payload = await adminFetch('/api/crash/admin/future-rounds', { method: 'POST', body: JSON.stringify({ points }) });
      setStatus('crashRiskStatus', `Gelecek ${payload.futureCrashPointCount || points.length} Crash eli kaydedildi.`, 'ok');
      await loadCrashRiskPanel();
      return;
    }
    if (action === 'crash-risk-limit-save') {
      requireCrashRiskConfirm();
      const riskBetLimit = Math.max(1, Math.trunc(Number(document.getElementById('crashAdminRiskLimitInput')?.value || 0) || 0));
      const payload = await adminFetch('/api/crash/admin/risk-limit', { method: 'POST', body: JSON.stringify({ riskBetLimit }) });
      renderCrashRiskPanel(payload);
      return setStatus('crashRiskStatus', `Crash max/risk limit kaydedildi: ${money(payload.adminRiskBetLimit || payload.riskBetLimit || riskBetLimit)} MC`, 'success');
    }
    if (action === 'crash-future-clear') {
      requireCrashRiskConfirm();
      await adminFetch('/api/crash/admin/future-rounds', { method: 'DELETE' });
      const futureInput = document.getElementById('futureCrashPointsInput');
      if (futureInput) futureInput.value = '';
      setStatus('crashRiskStatus', 'Gelecek Crash el listesi temizlendi.', 'ok');
      await loadCrashRiskPanel();
      return;
    }
  } catch (error) {
    const map = {
      reset: 'resetStatus', 'save-maintenance': 'maintenanceStatus', 'reward-user': 'rewardStatus', 'reward-all': 'rewardAllStatus', 'promo-create': 'promoStatus', 'promo-delete': 'promoStatus', 'crash-risk-save': 'crashRiskStatus', 'crash-risk-reset': 'crashRiskStatus', 'crash-current-set': 'crashRiskStatus', 'crash-next-set': 'crashRiskStatus', 'crash-next-clear': 'crashRiskStatus', 'crash-future-save': 'crashRiskStatus', 'crash-future-clear': 'crashRiskStatus', 'crash-risk-limit-save': 'crashRiskStatus', 'user-info-save': 'userInfoStatus'
    };
    const statusId = map[action] || (action.startsWith('restrict:') ? 'restrictStatus' : 'maintenanceStatus');
    setStatus(statusId, error.message || 'İşlem başarısız.', 'error');
  }
}

root.addEventListener('input', (event) => {
  if (event.target?.id === 'promoTypeSelect') updatePromoTypeFields();
  if (event.target?.id === 'rewardTypeSelect') updateRewardTypeFields();
  if (Object.values(AVATAR_FRAME_INPUTS).includes(event.target?.id) || event.target?.id === 'avatarFramePreviewAvatar') renderAvatarFramePreview();
});
root.addEventListener('change', (event) => {
  if (event.target?.id === 'promoTypeSelect') updatePromoTypeFields();
  if (event.target?.id === 'rewardTypeSelect') updateRewardTypeFields();
  if (event.target?.id === 'avatarFrameTypeSelect') { refreshAvatarFrameIndexOptions(); hydrateAvatarFrameSetting(); }
  if (event.target?.id === 'avatarFrameIndexSelect' || event.target?.id === 'avatarFrameVariantSelect') hydrateAvatarFrameSetting();
  if (event.target?.id === 'avatarFrameThicknessSelect' || event.target?.id === 'avatarFrameOverflowSelect') renderAvatarFramePreview();
});

function handleDashboardClick(event) {
  const closeTarget = event.target.closest('[data-admin-close-modal]');
  if (closeTarget) {
    event.preventDefault();
    return closeAdminPanelModal();
  }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.adminOpenModal) { event.preventDefault(); return openAdminPanelModal(button.dataset.adminOpenModal); }
  if (button.id === 'adminModalCloseBtn' || button.dataset.adminCloseModal) { event.preventDefault(); return closeAdminPanelModal(); }
  if (button.id === 'dashboardRefreshBtn') return handleAction('refresh');
  if (button.id === 'dashboardLogoutBtn') return handleAction('logout');
  if (button.id === 'previewResetBtn') return handleAction('reset-preview');
  if (button.id === 'runResetBtn') return handleAction('reset');
  if (button.id === 'saveMaintenanceBtn') return handleAction('save-maintenance');
  if (button.id === 'grantUserRewardBtn') return handleAction('reward-user');
  if (button.id === 'grantAllRewardBtn') return handleAction('reward-all');
  if (button.id === 'createPromoBtn') return handleAction('promo-create');
  if (button.dataset.promoDelete) return handleAction('promo-delete', button.dataset.promoDelete);
  if (button.id === 'saveCrashRiskBtn') return handleAction('crash-risk-save');
  if (button.id === 'resetCrashRiskBtn') return handleAction('crash-risk-reset');
  if (button.id === 'setCurrentCrashPointBtn') return handleAction('crash-current-set');
  if (button.id === 'setNextCrashPointBtn') return handleAction('crash-next-set');
  if (button.id === 'clearNextCrashPointBtn') return handleAction('crash-next-clear');
  if (button.id === 'saveFutureCrashPointsBtn') return handleAction('crash-future-save');
  if (button.id === 'clearFutureCrashPointsBtn') return handleAction('crash-future-clear');
  if (button.id === 'saveCrashRiskLimitBtn') return handleAction('crash-risk-limit-save');
  if (button.id === 'reloadWheelConfigBtn') return loadWheelAdminConfig();
  if (button.id === 'saveWheelConfigBtn') return saveWheelAdminConfig();
  if (button.id === 'toggleMarketStatusBtn') return toggleMarketGlobalStatus();
  if (button.dataset.marketSave) return saveMarketAdminItem(button.dataset.marketSave);
  if (button.id === 'bulkSaveMarketItemsBtn') return bulkSaveMarketAdminItems();
  if (button.id === 'refundMarketItemBtn') return refundMarketAdminItem();
  if (button.id === 'previewAvatarFrameBtn') return renderAvatarFramePreview();
  if (button.id === 'saveAvatarFrameBtn') return saveAvatarFrameAdminSetting(false).catch((error) => setStatus('avatarFrameAdminStatus', error?.message || 'Ayar kaydedilemedi.', 'error'));
  if (button.id === 'resetAvatarFrameBtn') return saveAvatarFrameAdminSetting(true).catch((error) => setStatus('avatarFrameAdminStatus', error?.message || 'Ayar sıfırlanamadı.', 'error'));
  if (button.dataset.avatarAdjust) {
    const id=AVATAR_FRAME_INPUTS[button.dataset.avatarAdjust]; const input=document.getElementById(id); if(!input) return;
    input.value=String(Math.round((Number(input.value || 0)+Number(button.dataset.avatarDelta || 0))*100)/100); renderAvatarFramePreview(); return;
  }
  if (button.id === 'userInfoLoadBtn') return loadUserInfoPanel().catch((error) => setStatus('userInfoStatus', error.message || 'Kullanıcı getirilemedi.', 'error'));
  if (button.id === 'userInfoSaveBtn') return saveUserInfoPanel().catch((error) => setStatus('userInfoStatus', error.message || 'Kullanıcı güncellenemedi.', 'error'));
  if (button.id === 'runRestrictBtn') {
    const mode = selectedRestrictionAction();
    if (!mode) return setStatus('restrictStatus', 'Kısıtlama türü seçin.', 'error');
    return handleAction(`restrict:${mode}`);
  }
  if (button.dataset.maintenance) {
    const next = !button.classList.contains('is-on');
    button.classList.toggle('is-on', next);
    button.setAttribute('aria-pressed', next ? 'true' : 'false');
    const label = button.querySelector('.maintenance-state-pill');
    if (label) label.textContent = next ? 'BAKIMDA' : 'AKTİF';
    updateMaintenanceSummary();
    return;
  }
}
root.addEventListener('click', handleDashboardClick);

(async () => {
  const access = await ensureAccess();
  if (!access.ok) {
    const title = loader?.querySelector('.loader-lines span');
    const sub = loader?.querySelector('.loader-lines strong');
    const hint = loader?.querySelector('.loader-lines b');
    if (title) title.textContent = 'YÖNETİCİ OTURUMU DOĞRULANAMADI';
    if (sub) sub.textContent = access.error || 'Yetki doğrulaması başarısız oldu.';
    if (hint) hint.textContent = 'Giriş ekranına yönlendiriliyorsunuz';
    window.setTimeout(() => redirectOut(), 900);
    return;
  }
  loader.classList.add('loader-hidden');
  const panelDoc = new DOMParser().parseFromString(panelTemplate(), 'text/html');
  root.replaceChildren(panelDoc.body.firstElementChild);
  installAdminModalSystem();
  updateCrashControlButtons();
  await loadDashboard();
})();
