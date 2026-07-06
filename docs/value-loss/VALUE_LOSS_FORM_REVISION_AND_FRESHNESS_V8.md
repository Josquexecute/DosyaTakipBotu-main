# Form Veri Sürümü + Ön Hesap Özeti Tazeliği — AI Değer Kaybı Yardımcısı v8

> Bu belge v8 tasarım + doğrulama çıktısıdır. Tazelik katmanı SALT-OKUNURDUR: veri değiştirmez,
> yeniden hesaplamaz, kaydetmez; tarihî özetleri geçersiz kılmaz.

## 1. Amaç

Kullanıcı bir ön hesap özeti kaydettikten sonra değer kaybı form verilerini değiştirebilir.
Kayıtlı özet tarihî bir kayıttır; UI'nın bu özetin GÜNCEL form verisini artık yansıtmayabileceğini
açıkça uyarması için deterministik bir "veri sürümü" (parmak izi) katmanı eklenir.

## 2. Neden veri sürümü gerekli?

v5–v7'de özet kaydı ile form verisi bağımsızdı; bir özetin hangi form verisinden üretildiği
izlenemiyordu. Zaman damgası güvenilir bir tazelik ölçütü değildir (form kaydı ile özet kaydı
sıraları değişebilir). Bu yüzden hesabı etkileyen girdilerden DETERMİNİSTİK parmak izi üretilir.

## 3. Fingerprint kapsamı

`createValueLossFormFingerprint` (`value-loss-form-fingerprint.ts`) SABİT sıralı kanonik dizi
üzerinden hesabı etkileyen alanları kapsar: fileType, assignmentDate, reportWillIncludeValueLoss;
vehicle.{modelYear, mileageKm, workingHours, marketValue, vehicleGroup, vehicleType,
commercialOrRental, foreignPlate, antiqueOrCollectible, isCabrioOrConvertible};
history.{sbmPastDamageCount, hasPriorHeavyDamage, hasPriorSamePartDamage};
damage.{damageDate, isTotalLossOrHeavyDamage, damageAmount, hasStructuralParts,
hasSemiStructuralParts, hasCosmeticParts, hasAccessoryParts};
marketAnalysis.{comparableListingCount, listingsWithinLast30Days, listingNumbersVisible,
screenshotsTaken, kmModelEquipmentComparable, outliersExcluded, bargainingRealityExplained};
evidence.{calculationModuleOutputExists, methodExplainedInReport}; ve yapılandırılmış parçalar
(operation + normalize ad + repair labor/newPart/severity/ratio + paint type), DETERMİNİSTİK
sıralanmış. Hash: küçük saf `cyrb53` (harici bağımlılık YOK; CJS main + ESM renderer uyumlu);
biçim `v1-<base36>`.

## 4. Fingerprint kapsamı dışında bırakılan alanlar

`calculationSnapshot`, `calculationSnapshotHistory` (özetin kendisi — dahil edilseydi kayıttan
hemen sonra "stale" görünürdü), UI-only parça satırı `id`'leri (kararsız), `notes` (hesabı
etkilemez), `vehicle.brandModel` (hesap/yönlendirme tarafından kullanılmıyor). Zaman damgası ve
rastgele değer KULLANILMAZ.

## 5. Snapshot'a eklenen alanlar

`ValueLossCalculationSnapshot`'a opsiyonel: `inputFingerprint` (≤60), `inputFingerprintVersion: 1`,
`inputSummary` (kompakt insan-okur girdi özeti; ≤10 madde, ham veri/dosya yolu YOK). Geçmiş
kayıtları (history item) bu alanları miras alır. Kaydederken KAYITLI form verisinin parmak izi
hesaplanır ve hem güncel özete hem geçmiş kaydına aynı parmak izi yazılır.

## 6. Freshness durumları

`evaluateSnapshotFreshness(vl)` (`value-loss-snapshot-freshness.ts`): özet yok → `none`; özet var
ama parmak izi yok (eski/tarihî kayıt) → `unknown` (bayat sayılmaz); parmak izleri eşit → `fresh`;
farklı → `stale`. Değer değiştirmez, hesaplamaz, kaydetmez. `stale` mesajı geneldir; ham hash
göstermez.

## 7. Kayıt akışı

"Ön Hesap Özetini Kaydet": v5.1 kirli-form engeli KORUNUR (form ≠ kayıtlı ise önce v2 form kaydı
istenir). Girdi KAYITLI bağlamdan kurulur; parmak izi kayıtlı form verisinden hesaplanır; kompakt
özet + parmak izi alanları oluşturulur; `calculationSnapshot` güncellenir + `calculationSnapshotHistory`
başa eklenir (en fazla 5). Onay mesajı: "Bu özet, mevcut kayıtlı değer kaybı form verileriyle
(veri sürümü) ilişkilendirilecektir." + dar kapsam sözü. Diff satırı: "Ön hesap veri sürümü:
yeni kayıt oluşturulacak / güncellenecek". Hesap yenileme/kopyalama OTOMATİK kayıt yapmaz.

## 8. UI gösterimi

Kayıtlı özet bloğunda salt-okunur "Özet durumu": Güncel / Eski veriyle oluşturulmuş olabilir /
Veri sürümü bilinmiyor / Kayıtlı özet yok. `stale` durumunda uyarı satırı gösterilir. Ham hash
gösterilmez; otomatik yeniden hesaplama/kayıt butonu yoktur; günlük kullanımı bloklamaz.

## 9. Checklist etkisi

Yeni madde "Kayıtlı ön hesap özeti güncel mi?": fresh → ok/info; stale → control_needed/warning;
unknown → control_needed/warning; none → not_applicable/info. **ASLA kritik değildir**; günlük
dosya işini bloklamaz. Mevcut kritik eksik-veri maddeleri değişmedi.

## 10. Taslak etkisi

`report_explanation` taslağına yalnız NİTELİK cümlesi: fresh → "…aynı veri sürümüne aittir.";
stale → "…önceki form verilerine ait olabilir; …yenilenmesi önerilir."; unknown → "…veri sürümü
bilinmemektedir; …kontrol edilmelidir." Tutar/yuvarlanmış tutar ASLA eklenmez; final tazminat
dili yoktur.

## 11. Geriye uyumluluk

Parmak izi olmayan eski kayıtlar GEÇERLİ tarihî kayıt kalır (freshness `unknown`, `stale` değil);
normalize zinciri eski bağlamları aynen yükler; parmak izi alanları opsiyoneldir. Yeni parmak izi
sürüm kimliği `v1` taşır; sürüm değişirse eski parmak izi eşleşmez → `stale` (güvenli taraf).

## 12. Yazma / Excel / mail / web güvenliği

Fingerprint/freshness modülleri saf (ağ/mail/Excel/dosya-yazımı token'sız); IPC değişmedi (86/3);
yeni runtime dependency yok; tek yazma yolu mevcut onaylı v2/v5/v6 mekanizmasıdır.

## 13. Kalan riskler

1. Hash çakışması teorik olarak mümkündür (cyrb53 ~53-bit); pratikte değer kaybı girdi uzayı için
   ihmal edilebilir — çakışma yalnız gerçekte farklı iki girdinin aynı parmak izini üretmesi
   demektir ki bu, "stale" yerine yanlışlıkla "fresh" gösterme riskidir (düşük olasılık, güvenlik
   sonucu yok: yalnız bir hatırlatma kaçar).
2. Parmak izi kapsamı hesap-anlamlı alanlarla sınırlıdır; kapsam dışı bir alan (örn. notlar)
   değişirse "fresh" kalır — bilinçli.
3. Freshness kayıtlı veriye göredir; kaydedilmemiş form düzenlemeleri v5.1 kirli-form engeliyle
   ayrı ele alınır.

## 14. Sonuç: v8 güvenle korunabilir mi?

Tazelik katmanı tamamen salt-okunurdur; deterministik parmak izi (determinizm, sıra-bağımsızlık,
snapshot/UI-id hariç tutma, alan değişim duyarlılığı) ve dört freshness durumu regresyon
testleriyle sabitlendi; geriye uyumluluk korundu; otomatik hesap/yazma yok; tutar taslağa girmez.

**v8 güvenle korunabilir.**
