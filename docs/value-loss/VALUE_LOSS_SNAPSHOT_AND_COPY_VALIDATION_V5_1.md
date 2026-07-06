# Ön Hesap Özeti + Gerekçe Kopyalama Doğrulama Raporu — AI Değer Kaybı Yardımcısı v5.1

> Bu belge bir DOĞRULAMA/sıkılaştırma denetimi çıktısıdır. v5'in en hassas yeni davranışı olan
> onaylı özet kayıt yolu, saldırgan (adversarial) probe'larla test edilmiş; bir mesaj-kapsam
> tutarsızlığı bulunup MINIMAL runtime düzeltmesiyle giderilmiştir.

## 1. Amaç

v5 ile eklenen `calculationSnapshot` kayıt yolunun, gerekçe kopyalama metninin ve araç türü /
hasar tarihi mantığının güvenliğini bağımsız olarak kanıtlamak; v6 öncesi "v5 güvenle
korunabilir mi?" kararını vermek.

## 2. İncelenen dosyalar

Tüm `src/shared/value-loss/*` modülleri (context-types/normalizer/diff/apply, calculation
types/engine/copy/snapshot, coefficients, part-coefficients/resolver, checklist, draft-builder),
renderer value-loss bileşen/aksiyon/eşleme dosyaları, `state.ts`, `main.ts` (kayıt aksiyonları),
behavior testleri ve v3.1/v4.1 doğrulama dokümanları. Kayıt yolu: mevcut v2
`tracking:update-value-loss-context` IPC'si — ayrı/kontrolsüz yazma yolu YOKTUR.

## 3. v5 ile eklenen kalıcı veri alanları

`vehicle.vehicleType` (12'li enum), `damage.damageDate` (metin, ≤40),
`calculationSnapshot` (kompakt özet) — üçü de yalnız `tracking.aiHelperContext.valueLoss`
altında, geriye uyumlu, sanitize/migrate zinciri taşımalı (eski kayıtlar özetsiz güvenle yüklenir; testli).

## 4. `calculationSnapshot` veri yapısı

Yalnız kompakt alanlar: version(1), createdAt, status, (yalnız calculated'da) amount/roundedAmount,
formulaSummary, coefficientSource, factorsSummary (özet SATIRLARI), missingInputs, warnings,
evidence, capApplied/capReason, disclaimer. İÇERMEZ (probe ile doğrulandı): ham faktör nesneleri
(`"explanation"` anahtarı yok), ham structuredParts, tracking nesnesi, yerel dosya yolu, iç kimlik
(örn. `part-p1`), Excel çalışma kitabı yolu, sınırsız metin.

## 5. Snapshot normalizasyon kuralları

Whitelist + sınırlar (probe ile ölçüldü): createdAt ≤40, coefficientSource ≤200, capReason ≤200,
disclaimer ≤400, formulaSummary ≤300; diziler ≤20 öğe (factorsSummary öğeleri ≤200,
missing/warnings/evidence ≤300). Beklenmeyen anahtarlar ATILIR. Status whitelist dışıysa özet
tamamen düşer. **calculated olmayan özete tutar SIZAMAZ**: normalize, control_needed /
cannot_calculate özetlerindeki amount/roundedAmount alanlarını düşürür (testli).

## 6. Snapshot kayıt akışı

"Ön Hesap Özetini Kaydet" → (v5.1 sıkılaştırması) form kirliyse KAYIT ENGELLENİR ve kullanıcı
önce v2 form kaydına yönlendirilir → özet, mevcut sonuçtan üretilir → diff + onay modalı
(dar kapsam mesajı + calculated değilse "Ödenebilir tutar hesaplanmadı; özet yalnız TANI amaçlı"
notu) → mevcut IPC ile atomic/revision-guard'lı kayıt. Panel render'ı ve "Ön Hesabı Yenile"
HİÇBİR ZAMAN kayıt tetiklemez (kaynak assert'li). Otomatik kayıt YOKTUR.

## 7. Diff / onay mesajı kapsamı

Onay metni: **"Bu işlem yalnızca aiHelperContext.valueLoss.calculationSnapshot alanını
güncelleyecektir."** — v5.1 düzeltmesi sonrası bu söz TEKNİK olarak da doğrudur: kayıt girdisi
KAYITLI alanlar + yeni özet olarak kurulur; diff yalnız "Ön hesap özeti" + "Ön hesap özeti tarihi"
satırlarını içerir (probe: kirli formda eski davranış rayiç değişikliğini de yazıyordu → giderildi).

## 8. Normal form kaydının snapshot'ı koruması

v2 form kaydı (`aih-vl-save`) ve önizleme, mevcut `calculationSnapshot`'ı girdiye taşır
(preserve) — form kaydı özeti SİLEMEZ/DEĞİŞTİREMEZ; özet yalnız kendi onaylı aksiyonuyla
değişir (kaynak + davranış testli).

## 9. structuredParts / damageAmount korunumu

Özet kaydı girdisi kayıtlı bağlamdan kurulduğundan `vehicle`, `damage` (structuredParts +
damageAmount dahil), `marketAnalysis`, `evidence` alanları BİREBİR korunur (round-trip testi:
kayıt öncesi/sonrası derin eşitlik). Başka hiçbir tracking alanına dokunulmaz (mevcut v2 servis
yalnız `valueLoss`'u merge eder; v2'den beri testli).

## 10. calculated snapshot davranışı

amount + roundedAmount saklanır; disclaimer, status, coefficientSource, formül ve faktör özetleri
her zaman bulunur. Diff etiketi: `calculated / 36.500 TL` biçiminde.

## 11. control_needed / cannot_calculate snapshot davranışı

Tutar alanları HİÇ üretilmez (builder) ve normalize de sızmayı düşürür (çifte koruma). Uyarıların
başına "Bu özet tanı amaçlıdır; ödenebilir tutar hesaplanmadı." notu eklenir. Onay modalında da
aynı tanı notu gösterilir.

## 12. Copy rationale metni güvenliği

Metin: durum, (yalnız calculated'da) yuvarlanmış+ham tutar — aksi halde açıkça "Ödenebilir tutar
hesaplanmadı." —, formül, katsayı kaynağı, cap, faktörler, eksikler, uyarılar, dayanaklar,
disclaimer. İÇERMEZ (probe + regex testli): yerel tam yol, iç kimlik, Excel yolu, mail/rapor
tetikleme dili. Pano hatasında güvenli uyarı + seçilebilir salt-okunur metin alanı; mail/rapor/web
aksiyonu tetiklenmez.

## 13. Yasak final tazminat ifadeleri kontrolü

"kesin değer kaybı", "nihai tazminat", "ödenmesi gereken kesin tutar", "kesin tazminat" —
kopya metni, özet, taslaklar ve onay mesajlarında regex-testli olarak YOKTUR; disclaimer her
çıktıda zorunludur.

## 14. Hasar tarihi / yaş katsayısı kontrolü

Geçerli hasar tarihi yaş katsayısının kaynağıdır (2031 → yaş 10 → 0.85; açıklamada kaynak
görünür). Tarih yoksa eski atama-yılı davranışı BİREBİR; geçersiz tarih çökme yaratmaz →
uyarı + güvenli fallback (testli).

## 15. Atama tarihi / 01.07.2026 zorunluluk mantığı kontrolü

Zorunluluk eşiği YALNIZ atama/ihbar bağlamına bağlıdır. Kritik regresyon (probe + kalıcı test):
**atama 2026-06-15 + hasar tarihi 2026-08-01** → requirement `not_required` (required'a
ZORLANMAZ) ve motor `cannot_calculate` (eşik öncesi blokeri). `damageDate` requirement
girdisine hiç eşlenmez (apply modülü).

## 16. Araç türü / otobüs 0.5 çarpanı kontrolü

B + Otobüs → 0.5 (düşürücü; kaynak Tablolar!V6); B + tür bilinmiyor → çarpan 1 + eksper uyarısı;
B + Minibüs → 0.5 UYGULANMAZ, uyarısız; B-dışı + Otobüs → uyumsuzluk blokeri `control_needed`,
tutar yok. Geçersiz tür enum'u normalize'da düşer; tür marka/modelden ÇIKARILMAZ (yalnız
kullanıcı seçimi). Tümü testli.

## 17. Motosiklet / F grup 2.5 çarpanı regresyonu

F grubunda 2.5 birebir korunur (testli); araç türü alanı F davranışını etkilemez.

## 18. Yazma / Excel / mail / web güvenliği

Kopya/özet modülleri saf (ağ/mail/Excel/dosya-yazımı token'sız; guard testli); IPC değişmedi
(86/3); yeni runtime dependency yok; tek yazma yolu mevcut onaylı v2 mekanizmasıdır.

## 19. Kalan riskler

1. Özet, kayıt anındaki katsayı seti sürümünü yansıtır (createdAt + kaynak alanıyla izlenebilir);
   SEİK set güncellenirse eski özetler tarihî kayıttır.
2. Kirli-form engeli kullanıcıya bir ek adım getirir (önce formu kaydet) — bilinçli güvenlik
   tercihi; toast yönlendirmesi mevcuttur.
3. Kopyalanan metnin uygulama dışına yapıştırıldıktan sonraki kullanımı uygulama kontrolü
   dışındadır (metin disclaimer'lıdır).

## 20. Sonuç: v5 güvenle korunabilir mi?

Saldırgan probe'lar tek gerçek sorun buldu (kirli formda dar-kapsam mesajı ihlali) ve bu sorun
minimal runtime sıkılaştırmasıyla giderilip regresyon testleriyle sabitlendi; diğer tüm
değişmezler (kompaktlık, tutar sızmazlığı, kapsam, koruma, eşik, çarpanlar, yasak dil) doğrulandı.

**v5 güvenle korunabilir.**
