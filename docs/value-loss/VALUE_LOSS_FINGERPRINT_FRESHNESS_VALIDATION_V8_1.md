# Fingerprint + Snapshot Tazelik Doğrulama Raporu — AI Değer Kaybı Yardımcısı v8.1

> Bu belge bir DOĞRULAMA/sıkılaştırma denetimi çıktısıdır. v8 fingerprint/freshness katmanı
> saldırgan (adversarial) probe'larla test edilmiştir.

## 1. Amaç

v8 ile eklenen form veri-sürümü (fingerprint) ve ön hesap özeti tazelik (freshness) katmanının
güvenliğini bağımsız olarak kanıtlamak; "v8 güvenle korunabilir mi?" kararını vermek.

## 2. İncelenen dosyalar

`value-loss-form-fingerprint.ts`, `value-loss-snapshot-freshness.ts`, `value-loss-calculation-snapshot.ts`,
`value-loss-calculation-history.ts`, context-types/normalizer/diff/apply, draft-builder, checklist,
calculation-engine; renderer panel/helper/preview/mapping + `main.ts`; v8 doğrulama dokümanı.
Kayıt yolu değişmedi (mevcut `tracking:update-value-loss-context`); ayrı/kontrolsüz yazma yolu YOKTUR.

## 3. v8 ile eklenen veri sürümü alanları

`ValueLossCalculationSnapshot` (ve miras alan history item): `inputFingerprint` (≤60),
`inputFingerprintVersion: 1`, `inputSummary` (≤10×120, kompakt). Hepsi opsiyonel; eski kayıtlar
bunlarsız geçerlidir (freshness `unknown`).

## 4. Fingerprint kapsamı doğrulaması (probe)

Şu alanların DEĞİŞİMİ parmak izini DEĞİŞTİRİR (probe ile teker teker doğrulandı): fileType,
assignmentDate, reportWillIncludeValueLoss, vehicle.{marketValue, modelYear, mileageKm,
workingHours, vehicleGroup, vehicleType, commercialOrRental, antiqueOrCollectible,
isCabrioOrConvertible}, history.{sbmPastDamageCount, hasPriorHeavyDamage, hasPriorSamePartDamage},
damage.{damageDate, damageAmount, isTotalLossOrHeavyDamage, hasAccessoryParts},
marketAnalysis.comparableListingCount, evidence.calculationModuleOutputExists ve yapılandırılmış
parça operation/normalize-ad/repair(labor/newPart/severity/ratio)/paint type.

## 5. Fingerprint dışında bırakılan alanlar (probe)

Şu alanların DEĞİŞİMİ parmak izini DEĞİŞTİRMEZ (probe ile doğrulandı): `calculationSnapshot`,
`calculationSnapshotHistory`, snapshot createdAt/amount/roundedAmount, yapılandırılmış parça UI
`id`'si, `notes`. Zaman damgası/rastgele değer kullanılmaz.

## 6. Deterministiklik ve sıralama kontrolü (probe)

- Aynı semantik girdi = aynı parmak izi (biçim `v1-<base36>`).
- Nesne anahtar sırası parmak izini etkilemez (SABİT sıralı kanonik dizi).
- Parça dizisi sırası parmak izini etkilemez (deterministik `sort`).
- Farklı UI id'li eşdeğer parçalar aynı parmak izini üretir.
- Minimal/eski bağlam çökmeden parmak izi üretir.

## 7. StructuredParts fingerprint kontrolü (probe)

- Parça adları fingerprint öncesi `normalizeValueLossPartName` ile normalize edilir;
  yalnız boşluk farkı (örn. "MOTOR  KAPUTU") parmak izini DEĞİŞTİRMEZ.
- operation / repair oranı(severity) / paint type değişimi parmak izini DEĞİŞTİRİR.
- Çözümsüz/bilinmeyen parça parmak izi üretiminde ÇÖKME yaratmaz (katsayı çözümü yapılmaz;
  yalnız saklanan alanlar hash'lenir).

## 8. Snapshot kayıt akışı kontrolü

Özet kaydı, parmak izini KAYITLI form verisinden (`formCandidate`) hesaplar; v5.1 kirli-form
engeli KORUNUR. Yeni özet `inputFingerprint`/`inputFingerprintVersion:1`/`inputSummary` içerir.
History cap 5 korunur. Normal form kaydı, `preservedSnapshotFields` ile parmak izli özet+geçmişi
KORUR. Snapshot içinde ham form verisi/dosya yolu saklanmaz; `inputSummary` kompakt ve yol-içermez
(probe).

## 9. History fingerprint kontrolü

Geçmiş kaydı, özetin parmak izini ve sürümünü aynen taşır (createSnapshotHistoryItem özet
alanlarını miras alır). control_needed/cannot_calculate geçmiş kaydı parmak izi taşıyabilir ama
tutar TAŞIMAZ (v5.1/v6 çift koruma korunur).

## 10. Freshness durumları doğrulaması (probe)

Özet yok → `none`; parmak izsiz özet → `unknown` (bayat DEĞİL); parmak izleri eşit → `fresh`;
form değişti → `stale`. Parmak izi hesap DURUMUNDAN bağımsızdır (control_needed özet de doğru
freshness üretir). Değer değiştirmez, hesaplamaz, kaydetmez.

## 11. UI tazelik uyarısı güvenliği

Panelde salt-okunur "Özet durumu: Güncel / Eski veriyle oluşturulmuş olabilir / Veri sürümü
bilinmiyor / Kayıtlı özet yok"; `stale`'de uyarı satırı. Ham hash gösterilmez (panel kaynağında
`inputFingerprint`/`v1-` metni yok); otomatik yeniden-hesap/kayıt tetiği yok; günlük kullanımı
bloklamaz; rapor/mail/Excel/web butonu yok.

## 12. Checklist tazelik maddesi güvenliği

"Kayıtlı ön hesap özeti güncel mi?": fresh→ok/info, stale→control_needed/warning,
unknown→control_needed/warning, none→not_applicable/info. **ASLA kritik değildir**; günlük dosya
işini bloklamaz. Kritik eksik-veri maddeleri değişmedi.

## 13. Taslak builder freshness cümleleri

`report_explanation`'a yalnız NİTELİK cümlesi (fresh/stale/unknown), yalnız kayıtlı özet varken;
özet yoksa freshness cümlesi eklenmez. Tutar/yuvarlanmış tutar ASLA eklenmez. Draft builder saf
(yan etki yok).

## 14. Yasak final tazminat ifadeleri kontrolü

"kesin değer kaybı", "nihai tazminat", "ödenmesi gereken kesin tutar", "kesin tazminat" —
freshness cümlelerinde ve tüm taslaklarda regex-testli olarak YOKTUR.

## 15. Yazma / Excel / mail / web güvenliği

fingerprint/freshness modülleri saf (ağ/mail/Excel/dosya-yazımı ve crypto-bağımlılığı token'sız);
IPC değişmedi (86/3); yeni runtime dependency yok; labor/AI-Mode importu yok.

## 16. Kalan riskler

1. cyrb53 ~53-bit; teorik hash çakışması yalnız "stale yerine fresh" (bir hatırlatma kaçar)
   riskidir — güvenlik sonucu yok, olasılık ihmal edilebilir.
2. Parça adı normalizasyonu `toLocaleUpperCase('tr-TR')` kullanır; fingerprint save ve
   freshness-kontrol AYNI runtime'da (renderer) hesaplandığından kendi içinde tutarlıdır
   (çapraz-ortam karşılaştırması yapılmaz).
3. Kapsam dışı alan (notlar) değişince "fresh" kalır — bilinçli.

## 17. Sonuç: v8 güvenle korunabilir mi?

Saldırgan probe'lar (determinizm, sıra/UI-id bağımsızlığı, alan-değişim duyarlılığı, whitespace-ad,
çözümsüz-parça, snapshot/notes hariç tutma, freshness durumları, inputSummary sızıntı) v8
katmanında GÜVENLİK AÇIĞI BULMADI; runtime düzeltmesi gerekmedi. Tüm değişmezler regresyon
testleriyle sabitlendi.

**v8 güvenle korunabilir.**
