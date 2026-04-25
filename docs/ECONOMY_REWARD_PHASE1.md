# Faz 1 — Cron, Ödül ve Ekonomi Onarımı

Bu fazda para/ödül veren kritik akışlar tekil ledger, idempotency ve bildirim standardına yaklaştırıldı.

## Kapatılan kritik riskler

- Aylık ödül ve aktivite reset cron'larında pencere kapalıyken `lastProcessedPeriodKey` yazılması engellendi.
- `lastProcessedPeriodKey` artık gerçek ödül/reset işlemi başarıyla tamamlandıktan sonra yazılır.
- Pencere kapalı durumlar `deferredPeriodKey`, `deferredRewardMonthKey`, `deferredUntilWindow` ve `waitReason` alanlarıyla ayrı takip edilir.
- Aylık aktiflik ödülleri artık merkezi `grantReward` akışından geçer.
- Admin tekil ödül ve admin reward-all merkezi ledger/idempotency standardına alındı.
- Wheel ve promo claim işlemleri transaction içinde ledger idempotency kontrolüyle balance günceller.
- Referral ödülleri merkezi `grantReward` ile ledger, notification ve duplicate guard üzerinden yürür.
- Classic/Crash/Pişti XP kazanımları reward catalog içinde XP kaynaklarıyla audit ledger'a yazılır.

## Merkezi servis

Yeni dosya: `utils/rewardService.js`

Sağladığı ana fonksiyonlar:

- `applyRewardGrantInTransaction`
- `grantReward`
- `grantRewardToAllUsers`
- `createRewardNotificationForGrant`

Bu servis ledger dokümanını önce kontrol eder. Aynı idempotency key tekrar gelirse balance tekrar artmaz.

## Notlar

- Firebase transaction kuralları nedeniyle signup/email bootstrap mevcut claim flag mimarisini korur; ledger ve notification artifact standardı korunmuştur.
- Pişti online maç sonu ödül kayıtları mevcut room settlement idempotency ile çalışmaya devam eder.
- Pişti solo/online XP audit kayıtları `pisti_spend_progress` kaynağıyla ledger standardına bağlandı.
