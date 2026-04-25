'use strict';

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  enhancedUi: true,
  adminHealthDashboard: true,
  auditTrailV2: true,
  opsErrorInbox: true,
  inviteFlowV2: true,
  rewardLedgerV2: true,
  chatRetentionStrict: true,
  maintenanceMode: false,
  crashMaintenance: false,
  pistiMaintenance: false,
  chessMaintenance: false,
  classicGamesMaintenance: false,
  publicActivityWidget: true,
  publicRewardCenter: true
});

const PUBLIC_FEATURE_FLAG_KEYS = Object.freeze([
  'enhancedUi',
  'inviteFlowV2',
  'rewardLedgerV2',
  'chatRetentionStrict',
  'maintenanceMode',
  'crashMaintenance',
  'pistiMaintenance',
  'chessMaintenance',
  'classicGamesMaintenance',
  'publicActivityWidget',
  'publicRewardCenter'
]);

const FEATURE_FLAG_LABELS = Object.freeze({
  enhancedUi: 'Gelişmiş arayüz',
  adminHealthDashboard: 'Admin health dashboard',
  auditTrailV2: 'Gelişmiş audit trail',
  opsErrorInbox: 'Operasyon hata kutusu',
  inviteFlowV2: 'Davet akışı v2',
  rewardLedgerV2: 'Ödül ledger v2',
  chatRetentionStrict: 'Sıkı chat retention',
  maintenanceMode: 'Genel bakım modu',
  crashMaintenance: 'Crash bakım modu',
  pistiMaintenance: 'Pişti bakım modu',
  chessMaintenance: 'Satranç bakım modu',
  classicGamesMaintenance: 'Klasik oyunlar bakım modu',
  publicActivityWidget: 'Genel aktiflik widget',
  publicRewardCenter: 'Genel ödül merkezi'
});

module.exports = {
  DEFAULT_FEATURE_FLAGS,
  PUBLIC_FEATURE_FLAG_KEYS,
  FEATURE_FLAG_LABELS
};
