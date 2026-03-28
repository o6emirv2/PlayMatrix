'use strict';

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  premiumUi: true,
  adminHealthDashboard: true,
  auditTrailV2: true,
  opsErrorInbox: true,
  inviteFlowV2: true,
  rewardLedgerV2: true,
  chatRetentionStrict: true,
  maintenanceMode: false,
  publicSeasonWidget: true,
  publicRewardCenter: true,
  runtimeStatusBar: true,
  socialPinnedFriends: true,
  profileHubV2: true,
  economyCenter: true,
  seasonalShop: true,
  reconnectOverlay: true,
  replayCenter: true,
  antiStallUi: true,
  spectatorMode: true,
  smokeMatrixV2: true,
  portfolioExpansionV2: true,
  regressionLock: true,
  controlledRollout: true
});

const PUBLIC_FEATURE_FLAG_KEYS = Object.freeze([
  'premiumUi',
  'inviteFlowV2',
  'rewardLedgerV2',
  'chatRetentionStrict',
  'maintenanceMode',
  'publicSeasonWidget',
  'publicRewardCenter',
  'runtimeStatusBar',
  'socialPinnedFriends',
  'profileHubV2',
  'economyCenter',
  'seasonalShop',
  'reconnectOverlay',
  'replayCenter',
  'antiStallUi',
  'spectatorMode',
  'smokeMatrixV2',
  'portfolioExpansionV2',
  'regressionLock',
  'controlledRollout'
]);

const FEATURE_FLAG_LABELS = Object.freeze({
  premiumUi: 'Premium arayüz',
  adminHealthDashboard: 'Admin health dashboard',
  auditTrailV2: 'Gelişmiş audit trail',
  opsErrorInbox: 'Operasyon hata kutusu',
  inviteFlowV2: 'Davet akışı v2',
  rewardLedgerV2: 'Ödül ledger v2',
  chatRetentionStrict: 'Sıkı chat retention',
  maintenanceMode: 'Bakım modu',
  publicSeasonWidget: 'Genel sezon widget',
  publicRewardCenter: 'Genel ödül merkezi',
  runtimeStatusBar: 'Runtime durum çubuğu',
  socialPinnedFriends: 'Sabitlenen arkadaşlar',
  profileHubV2: 'Profil merkezi v2',
  economyCenter: 'Ekonomi merkezi',
  seasonalShop: 'Sezonluk mağaza',
  reconnectOverlay: 'Yeniden bağlanma katmanı',
  replayCenter: 'Replay merkezi',
  antiStallUi: 'Anti-stall arayüzü',
  spectatorMode: 'İzleyici modu',
  smokeMatrixV2: 'Device/browser smoke matrisi',
  portfolioExpansionV2: 'Oyun portföyü genişletme',
  regressionLock: 'Regresyon kilidi',
  controlledRollout: 'Kontrollü rollout'
});

module.exports = {
  DEFAULT_FEATURE_FLAGS,
  PUBLIC_FEATURE_FLAG_KEYS,
  FEATURE_FLAG_LABELS
};
