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
  publicRewardCenter: true
});

const PUBLIC_FEATURE_FLAG_KEYS = Object.freeze([
  'premiumUi',
  'inviteFlowV2',
  'rewardLedgerV2',
  'chatRetentionStrict',
  'maintenanceMode',
  'publicSeasonWidget',
  'publicRewardCenter'
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
  publicRewardCenter: 'Genel ödül merkezi'
});

module.exports = {
  DEFAULT_FEATURE_FLAGS,
  PUBLIC_FEATURE_FLAG_KEYS,
  FEATURE_FLAG_LABELS
};
