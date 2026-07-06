# SEİK Katsayı Seti Yeniden Doğrulama Prosedürü

> Bu belge geliştirme sürecine yöneliktir; runtime davranışı tanımlamaz. Uygulama HİÇBİR
> otomatik web güncellemesi/indirme yapmaz — yeni modül kullanıcı tarafından yerel olarak sağlanır.

## 1. Amaç

SEİK / TOBB yeni bir "Değer Kaybı Hesaplama Modülü" Excel sürümü yayınladığında, repo'daki
katsayı setlerinin (`SEIK_2026_V1_COEFFICIENT_SET`, `VALUE_LOSS_PART_COEFFICIENTS`,
`SEIK_2026_V1_COEFFICIENT_METADATA`) güvenle güncellenmesi/yeniden doğrulanması için izlenecek
adımları tanımlamak.

## 2. Ne zaman çalıştırılır?

- SEİK/TOBB yeni modül sürümü duyurduğunda.
- Uygulama esasları belgesi güncellendiğinde.
- Katsayı setiyle ilgili saha uyuşmazlığı raporlandığında.

## 3. Kaynak dosya adı ve sürüm kontrolü

- Yeni modülün TAM dosya adını ve (varsa) sürüm/tarih bilgisini kaydet.
- `value-loss-coefficients.ts` içindeki `version/sourceName/sourceDate/extractedAt` alanlarını
  YENİ sürüme göre güncelle; ESKİ sürüm kimliğini değiştirme (yeni kimlik ver, örn.
  `seik-2027-xx-v2`).
- İnceleme yöntemi: xlsx zip içi ham sheet XML + sharedStrings çözümü (SALT-OKUNUR;
  kaynak dosyaya asla yazma). Örnek araçlar v3.1/v4.1 çalışmalarındaki söküm scriptleridir.

## 4. Ana katsayı doğrulaması

`docs/value-loss/SEIK_COEFFICIENT_VALIDATION_V3_1.md` haritasını izleyerek hücre hücre karşılaştır:
yaş tablosu (`Tablolar!B19:C26` + `B27` formülü), km/saat tabloları (`E13:R20` + `Hesaplama!F9`
VLOOKUP eşlemesi), genel etkiler (`J5/J7/J9`), grup çarpanları (`V2/V6`), cap (`W2`),
yuvarlama (`U3/U4/U5` + `C1`), ana formül (`U2/U6/U10`). Her fark için: repo değerini güncelle +
davranış testindeki beklenen değerleri güncelle + farkı raporla.

## 5. Parça katsayı doğrulaması

`docs/value-loss/SEIK_PART_COEFFICIENT_VALIDATION_V4_1.md` yöntemini izle: parça bloklarını
(B34:L295 veya yeni aralık) TAZE çıkar, üretim tuple tablosuyla 7 alan üzerinden makine
karşılaştırması yap (bağımsız çapraz doğrulama scripti). Beklenen: 0 alan uyumsuzluğu.

## 6. Boya TAM / LOKAL sütun kontrolü

- TAM formül referans sütununu (eski modülde K — BOŞTU) ve gerçek veri sütununu (eski modülde J)
  kontrol et; J≥L oran deseninin sürdüğünü nicel olarak doğrula.
- Yeni modül K sütununu doldurduysa `paintedFullCoefficient` kaynağını K'ye taşı, kaynak notunu
  ve `knownAssumptions` listesini güncelle.

## 7. Hava yastığı / katsayı dışı değer kontrolü

Onarım sütunlarında katsayı deseni dışındaki değerleri (eski modülde 6/7/107/108/233/234) tara;
bu tür değerleri ÜRETİME ALMA (çözümsüz bırak → kontrol gerekir). Yeni modül düzelttiyse
değerleri aktar ve varsayım notunu kaldır.

## 8. Duplicate / VLOOKUP semantiği kontrolü

Aynı (grup, ad) tekrarlarını listele; Excel `VLOOKUP(...FALSE)` İLK satırı döndürür → üretimde
ilk satır kazanır. Kazanan satırları belge/teste işle; (grup, normalize ad) benzersizliğini koru.

## 9. Grup eşlemeleri kontrolü

Blok→grup eşlemelerini (A/B/C-Ç/D/E/F + cabrio ek satırları) ve `Ç→C` blok kullanımını
(`Hesaplama!C16` formülü) doğrula.

## 10. Otobüs / araç türü çarpanı kontrolü

`V6` (OTOBÜS 0.5) değerini ve koşulunu (`$B$3="OTOBÜS"` — araç TÜRÜ) doğrula;
`vehicleTypeMultipliers` ve motor B-grubu mantığını gerekiyorsa güncelle.

## 11. Cabrio özel satır kontrolü

Cabrio/ticari yan panel satırlarının (eski modülde 264-265) yerini/adını/değerini doğrula;
`CABRIO_PART_NAME_MARKER` sabitinin yeni adlarla eşleştiğini kontrol et. Otomatik ikame
EKLEME — yönlendirme yaklaşımı korunur.

## 12. Snapshot/history geriye uyumluluk kontrolü

Eski `calculationSnapshot`/`calculationSnapshotHistory` kayıtları TARİHÎ kayıttır: yeni set
sürümüyle yeniden yorumlanmaz, silinmez, dönüştürülmez. Normalize zincirinin eski kayıtları
aynen yüklediğini testle doğrula. Yeni kayıtlar yeni `version` kimliğini taşır.

## 13. Zorunlu test komutları

```bash
npm run typecheck
npm run build
npm run test:behavior
npm run ci
node scripts/final-office-audit.mjs
npm audit
npm run test:dev-harness
```

Katsayı değeri değiştiyse ilgili davranış testlerindeki beklenen örnek hesap değerlerini
(örn. 28.285,20 / 36.142,20 senaryoları) kaynağa göre güncelle — testi ZAYIFLATMADAN.

## 14. Teslim raporu formatı

`AGENTS.md` → "Teslim Raporu Formatı" kullanılır; ek olarak: eski→yeni sürüm kimliği, değişen
katsayıların tablosu (hücre referanslarıyla), güncellenen varsayımlar ve yeni doğrulama
dokümanının yolu raporlanır. Yeni bir `docs/value-loss/SEIK_*_VALIDATION_*.md` doğrulama
dokümanı OLUŞTURULUR ve `SEIK_2026_V1_COEFFICIENT_METADATA` (yeni adıyla) `validationDocs`
listesine eklenir.

## 15. Son karar: geçilebilir / düzeltme gerekir

Doğrulama dokümanının son bölümü açıkça şu iki karardan birini verir:
"geçilebilir." veya "düzeltme gerekir." — 0 uyumsuzluk + tüm komutlar yeşil olmadan
"geçilebilir" kararı verilemez.
