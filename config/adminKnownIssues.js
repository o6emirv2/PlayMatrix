'use strict';

const GAME_ISSUES = Object.freeze([
  {
    area: 'Crash',
    error: 'Yuvarlak sonuç kayıtlarının izlenebilirliği geçmişte tutarsızdı',
    reason: 'Settlement/audit/history akışları parçalıydı',
    solution: 'Tek settlement standardı, audit log ve match history ile normalize edildi'
  },
  {
    area: 'Satranç',
    error: 'Leave/resign/disconnect davranış metni ile backend mantığı aynı değildi',
    reason: 'UI açıklamaları ve sonuç üretimi ayrışmıştı',
    solution: 'Result code standardı ve oyun içi metinler eşitlendi'
  },
  {
    area: 'Pişti',
    error: 'Oda senkronu ve stale cleanup hassastı',
    reason: 'Waiting/playing odaları cron ve gerçek zamanlı akış arasında ayrı yönetiliyordu',
    solution: 'Realtime oda akışı ve cleanup zinciri yeniden bağlandı'
  }
]);

const SOCIAL_ISSUES = Object.freeze([
  {
    area: 'Global Sohbet',
    error: 'Retention temizliği kullanıcıya açıklanmadan mesaj kaybı gibi görünüyordu',
    reason: 'Soft-delete ve otomatik cleanup ayrımı görünür değildi',
    solution: 'Tombstone ve retention politikası görünür hale getirildi'
  },
  {
    area: 'DM Sohbet',
    error: 'Silinen mesajlar geçmişten aniden kayboluyordu',
    reason: 'Delete sonrası kullanıcıya neden gösterilmiyordu',
    solution: 'Silinme nedeni ve sınırlı süre tombstone görünümü eklendi'
  },
  {
    area: 'Arkadaş Daveti',
    error: 'Incoming/outgoing davet görünürlüğü eksikti',
    reason: 'Tek yönlü state okunuyordu',
    solution: 'Sosyal akış görünümü ve davet ekranları standartlaştırıldı'
  },
  {
    area: 'Liderlik / İstatistik',
    error: 'Geçmişte farklı veri tipleri aynı tabloya düşebiliyordu',
    reason: 'Frontend alias/fallback karışıyordu',
    solution: 'Strict category mapping ve canonical profile alanları kullanıldı'
  }
]);

module.exports = {
  GAME_ISSUES,
  SOCIAL_ISSUES
};
