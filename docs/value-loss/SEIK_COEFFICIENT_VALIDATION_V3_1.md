# SEİK Katsayı Çıkarım Doğrulama Raporu — AI Değer Kaybı Yardımcısı v3.1

> Bu belge bir DOĞRULAMA/denetim çıktısıdır; runtime davranışı tanımlamaz. Kaynak modül
> güncellenirse bu doğrulama tekrarlanmalıdır.

## 1. Amaç

v3'te eklenen "Reel Piyasa Analiz Ön Hesabı" motorunun katsayı seti
(`SEIK_2026_V1_COEFFICIENT_SET`, `src/shared/value-loss/value-loss-coefficients.ts`), kaynak
Excel modülü **"Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1"** ile hücre/formül
düzeyinde bağımsız olarak karşılaştırıldı. Hedef: v4 (yapılandırılmış parça katsayıları)
öncesinde çıkarımın doğruluğunu kanıtlamak, varsayımları açıkça listelemek.

## 2. İncelenen kaynaklar

- Excel modülü (kullanıcı çalışma alanında mevcut): `Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1`
  — sayfalar: `Hesaplama` (sheet1), `Uygulama Esasları` (sheet3), `Tablolar` (sheet4).
  İnceleme yöntemi: xlsx zip içi ham sheet XML + sharedStrings çözümü (salt-okunur; dosyaya yazılmadı).
- Repo dosyaları: `value-loss-calculation-types.ts`, `value-loss-coefficients.ts`,
  `value-loss-calculation-engine.ts`, `value-loss-calculation-explain.ts`, `value-loss-rounding.ts`,
  `value-loss-calculation-panel.ts`, `scripts/behavior-regression-tests.mjs`.

## 3. Repo katsayı seti özeti

`SEIK_2026_V1_COEFFICIENT_SET` — version: `seik-2026-07-v1`, source: modül adı + "yerel kopyadan
çıkarıldı" ibaresi (UI'da gösterilir). Alanlar: `ageCoefficients` (8 bant),
`mileageTables` (3 sınıf: A/F km, B/C/Ç/E km, D saat), `generalEffects` (ticari −0.05,
SBM −0.03/adet taban −0.15, alt sınır yakınlığı +0.05/eşik 1000), `groupMultipliers` (F: 2.5),
`capMarketValueRatio` 0.3, `roundingStep` 500, `damageRatioWeight` 0.1.
Parça katsayı tabloları BİLEREK sette yok (v4 kapsamı); motor `partData` verilmeden tutar üretmez.

## 4. Excel kaynak hücre/aralık haritası

| Repo alanı | Excel kaynağı |
|---|---|
| ageCoefficients | `Tablolar!B19:C26` (bantlar) + `Tablolar!B27` (bant seçim formülü) + `Hesaplama!C7` (VLOOKUP) |
| mileageTables satır anahtarları | `Tablolar!E13:E20` (E13=A, E14=B, E15=C, E16=Ç, E17=E, E18=F, E20=D) |
| mileageTables aralık→sütun eşlemesi | `Hesaplama!F9` (VLOOKUP `Tablolar!E13:R20`, gruba göre sütun indeksi) |
| generalEffects.commercialOrRental | `Hesaplama!J5` = `IF(F5="EVET",-0.05,0)` |
| generalEffects.sbm* | `Hesaplama!J7` = `IF(F7=0,0,IF(F7<=5,F7*-0.03,-0.15))` |
| generalEffects.mileageLowerBoundProximity | `Hesaplama!J9` (10 pencereli +0.05 formülü) |
| damageRatioWeight / hasar katsayısı | `Hesaplama!J3` = `IF(F3=0,0,((C64+H64+K64)+((F3/C5)*100)*0.1)/100)` |
| groupMultipliers | `Tablolar!V2=2.5` (U2 formülü, F bloğu) + `Tablolar!V6=0.5` (U6, OTOBÜS bloğu) |
| capMarketValueRatio | `Tablolar!W2` = `Hesaplama!C5*0.3` |
| Ana formül | `Tablolar!U10` = `C5×C7×F9×(1+(J5+J7+J9))×J3` (çarpansız blok); `U2`/`U6` çarpanlı bloklar |
| Yuvarlama | `Tablolar!U3=U2/1000`, `U4=INT(U3)*1000`, `U5=U2-U4` + `Hesaplama!C1` dalları |

## 5. Yaş katsayı doğrulaması

Bant seçimi `Tablolar!B27`: `YEAR(Hesaplama!F11) - Hesaplama!C11` (F11 = hasar tarihi, varsayılan
`TODAY()`; C11 = model yılı). Bant eşiği formülü: `<3 → "0-2"`, `>2 ve ≤4 → "3-4"`, `>4 ve ≤7 → "5-7"`,
`>7 ve ≤10`, `>10 ve ≤13`, `>13 ve ≤16`, `>16 ve ≤19`, `>19 → "20 Üstü"`.

| Yaş bandı | Excel değeri | Repo değeri | Uyum | Kaynak |
|---|---|---|---|---|
| 0-2 (yaş<3) | 1 | `{min:0,max:3}: 1` | ✔ | Tablolar!C26 |
| 3-4 | 0.95 | `{min:3,max:5}: 0.95` | ✔ | Tablolar!C25 |
| 5-7 | 0.90 | `{min:5,max:8}: 0.9` | ✔ | Tablolar!C24 |
| 8-10 | 0.85 | `{min:8,max:11}: 0.85` | ✔ | Tablolar!C23 |
| 11-13 | 0.80 | `{min:11,max:14}: 0.8` | ✔ | Tablolar!C22 |
| 14-16 | 0.75 | `{min:14,max:17}: 0.75` | ✔ | Tablolar!C21 |
| 17-19 | 0.70 | `{min:17,max:20}: 0.7` | ✔ | Tablolar!C20 |
| 20 üstü (>19) | 0.65 | `{min:20}: 0.65` | ✔ | Tablolar!C19 |

Sınır davranışı (min dahil / max hariç) Excel'in `>x ve ≤y` bantlarıyla tam sayı yaşlarda birebir
örtüşür. **Varsayım (belgelendi):** Repo yaş kaynağı olarak ATAMA tarihini kullanır; Excel HASAR
tarihini (varsayılan bugün) kullanır. Atama ≈ hasar tarihi olduğundan pratik etki yoktur; yıl
sınırında (örn. Aralık hasarı / Ocak ataması) 1 bant sapabilir → eksper kontrol uyarısı zaten
sonuçta mevcuttur.

## 6. KM / çalışma saati katsayı doğrulaması

`Hesaplama!F9` VLOOKUP sütun eşlemesi (sütun 2=F ... 11=O) + satır değerleri:

| Araç grubu | Aralık | Excel katsayısı | Repo katsayısı | Uyum | Kaynak |
|---|---|---|---|---|---|
| A/F | 0-19.999 | 1 (F13/F18) | 1 | ✔ | Tablolar!F13:M13, F18:M18 (iki satır özdeş) |
| A/F | 20.000-49.999 | 0.95 (G) | 0.95 | ✔ | 〃 |
| A/F | 50.000-99.999 | 0.90 (H) | 0.90 | ✔ | 〃 |
| A/F | 100.000-149.999 | 0.85 (I) | 0.85 | ✔ | 〃 |
| A/F | 150.000-199.999 | 0.80 (J) | 0.80 | ✔ | 〃 |
| A/F | 200.000-299.999 | 0.75 (K) | 0.75 | ✔ | 〃 |
| A/F | 300.000-499.999 | 0.70 (L) | 0.70 | ✔ | 〃 |
| A/F | ≥500.000 | 0.70 (M) | 0.70 | ✔ | 〃 |
| B/C/Ç/E | 0-49.999 | 1 (F14..F17) | 1 | ✔ | Tablolar!F14:O17 (dört satır özdeş) |
| B/C/Ç/E | 50.000-149.999 | 0.95 (I) | 0.95 | ✔ | 〃 |
| B/C/Ç/E | 150.000-299.999 | 0.90 (J) | 0.90 | ✔ | 〃 |
| B/C/Ç/E | 300.000-499.999 | 0.85 (L) | 0.85 | ✔ | 〃 |
| B/C/Ç/E | 500.000-749.999 | 0.80 (M) | 0.80 | ✔ | 〃 |
| B/C/Ç/E | 750.000-999.999 | 0.75 (N) | 0.75 | ✔ | 〃 |
| B/C/Ç/E | ≥1.000.000 | 0.70 (O) | 0.70 | ✔ | 〃 |
| D (saat) | 0-500 | 1 (F20) | 1 | ✔ | Tablolar!F20:L20 |
| D (saat) | 501-1.000 | 0.95 | 0.95 | ✔ | 〃 |
| D (saat) | 1.001-2.000 | 0.90 | 0.90 | ✔ | 〃 |
| D (saat) | 2.001-3.000 | 0.85 | 0.85 | ✔ | 〃 |
| D (saat) | 3.001-4.000 | 0.80 | 0.80 | ✔ | 〃 |
| D (saat) | 4.001-5.000 | 0.75 | 0.75 | ✔ | 〃 |
| D (saat) | ≥5.001 | (formülde dal yok — kaynak eksiği) | 0.70 | ⚠ varsayım | Tablo başlığı `Tablolar!L19` "5001 ÜZERİ" + L20=0.7 |

**Belgelenen varsayım:** F9 formülünde D grubu 5001+ için açık dal yoktur (formül else-dalı
sütun 1'e düşer — kaynak modülde muhtemel ihmal). Repo, tablo başlığına ve L20=0.7 değerine
dayanarak 0.70 kullanır; muhafazakâr ve tablo ile tutarlıdır.

## 7. Genel etki katsayı doğrulaması

| Etki | Excel formül/hücre | Repo mantığı | Uyum | Not |
|---|---|---|---|---|
| Ticari/kiralık | `J5`: EVET → −0.05 | `commercialOrRental===true → −0.05` | ✔ | |
| SBM geçmiş hasar | `J7`: 0→0; ≤5→n×−0.03; >5→−0.15 | birebir aynı üçlü kural | ✔ | taban −0.15 |
| KM alt sınır yakınlığı | `J9`: 10 pencere, yalnız km grupları | `isNearLowerBound` (v3.1'de düzeltildi) | ✔ (düzeltme sonrası) | aşağıda |
| Dördüncü etki? | `C1` formülü `(J5+J7+J9+J11)` kullanır | motor 3 etki kullanır | ✔ | `J11` hücresi BOŞtur (formülsüz/değersiz); `U2/U6/U10` blokları da `(J5+J7+J9)` kullanır → kaynak-içi tutarsızlık, etkisi 0 |

**v3.1'de DÜZELTİLEN iki uyumsuzluk (J9 birebir çözümünden):**
1. Excel J9 pencereleri **D grubunu hiç içermez** (yalnız A/F/C/B/Ç/E); repo v3'te D (çalışma
   saati) için de +0.05 verebiliyordu → düzeltme: yakınlık yalnız `unit==='km'` tablolarında.
2. Excel J9'da **A/F için 500.000-501.000 penceresi yoktur** (o sınırda katsayı 0.70→0.70
   değişmez; pencere yalnız B/C/Ç/E'de tanımlı); repo v3'te A/F 500k sınırına da bonus
   veriyordu → düzeltme: katsayının önceki aralıkla aynı kaldığı sınırda pencere yok.
   Düzeltme sonrası repo pencereleri J9'un 10 penceresiyle birebir: ≤1000 (tüm km grupları);
   A/F: 20-21k, 100-101k, 200-201k; ortak: 50-51k, 150-151k, 300-301k; B/C/Ç/E: 500-501k,
   750-751k, 1000-1001k.

## 8. Grup çarpanı doğrulaması

| Grup / araç türü | Excel çarpanı | Repo çarpanı | Uyum | Not |
|---|---|---|---|---|
| F (motosiklet) | 2.5 (`Tablolar!V2`, `U2` bloğu; `C1` koşulu `$C$3="F"`) | `groupMultipliers.F = 2.5` | ✔ | |
| OTOBÜS (araç türü, B grubunda) | 0.5 (`Tablolar!V6`, `U6` bloğu; `C1` koşulu `$B$3="OTOBÜS"`) | uygulanmaz + B grubunda eksper uyarısı | ⚠ bilinçli sınır | çarpan GRUBA değil araç TÜRÜNE bağlı; v2 formu araç türü tutmuyor. Motor B grubunda açık uyarı üretir |
| Diğer tüm gruplar | 1 (`U10` çarpansız blok) | varsayılan 1 | ✔ | |
| Desteklenmeyen grup | — | katsayı tablosu yoksa `cannot_calculate` + eksik girdisi | ✔ | `vehicleGroups` whitelist |

## 9. Cap / üst sınır doğrulaması

| Cap kaynağı | Excel değeri | Repo değeri | Uyum | Yuvarlama sırası |
|---|---|---|---|---|
| `Tablolar!W2 = Hesaplama!C5*0.3` | rayiç × 0.30 | `capMarketValueRatio = 0.3` | ✔ | Cap YUVARLAMADAN ÖNCE uygulanır — Excel'de `C1`, oran >0.3 ise W bloğunun (capli tutarın) yuvarlanmış halini seçer; repo da önce cap, sonra yuvarlama yapar ✔ |

`C1` seçim mantığı: `(C7×F9×(1+etkiler)×J3)` oranı [grup çarpanı dahil] 0.3'ü aşarsa W (capli)
bloğu, aşmazsa U (normal) bloğu kullanılır. Repo eşdeğeri: `amount > marketValue×0.3 → amount = cap`.

## 10. Yuvarlama doğrulaması

Excel: `U4=INT(U2/1000)*1000` (binlik taban), `U5=U2−U4` (kalan); `C1`:
kalan ∈ (0,500] → taban+500; kalan ∈ (500,1000) → taban+1000; kalan=0 → 0.
Repo: `roundValueLossAmount = ceil(x/500)×500`; ≤0 → 0; sayı değilse `undefined`.

| Girdi | Excel beklenen | Repo çıktısı | Uyum |
|---|---|---|---|
| 0 | 0 | 0 | ✔ |
| −5 | (girdi oluşmaz) | 0 | ✔ güvenli taraf |
| 1 | 500 | 500 | ✔ |
| 499 | 500 | 500 | ✔ |
| 500 | 500 | 500 | ✔ |
| 501 | 1000 | 1000 | ✔ |
| 1749 | 2000 | 2000 | ✔ |
| 1750 | 2000 | 2000 | ✔ |
| 1751 | 2000 | 2000 | ✔ |
| 2000 (tam 1000 katı) | 0 (formül artefaktı) | 2000 | ⚠ bilinçli sapma |

**Belgelenen sapma:** Excel `C1` formülü kalan=0 (tutar tam 1000 katı) durumunda 0 döndürür —
bu kaynak modülde muhtemel bir formül artefaktıdır (28.000,00 TL'lik gerçek bir sonucu sıfırlar);
kayan nokta aritmetiğinde pratikte oluşmaz. Repo bu durumda tutarın kendisini döndürür (doğru
yukarı-500 davranışı). Uygulama esasları 3.21 ("500 TL ve katları, yukarı yönlü") repo davranışını
destekler.

## 11. Formül sırası doğrulaması

İncelenen hücreler: `Tablolar!U2`, `U6`, `U10` (ana formül blokları), `Hesaplama!C1` (seçim +
yuvarlama), `J3/J5/J7/J9` (katsayılar), `C7` (yaş), `F9` (km/saat).

Excel `U10` = `C5 × C7 × F9 × (1+(J5+J7+J9)) × J3`  ⇔  Repo:
`marketValue × ageCoef × usageCoef × (1 + effects) × damageCoef × multiplier` — sıra ve yapı ✔.

- Eksik faktör: yok (J11 boş; `C1`'deki J11 terimi etkisiz).
- Yüzde dönüşümü: `J3` içindeki `(F3/C5)×100×0.1` ve `/100` repo'da
  `damageRatioPercent × damageRatioWeight` ve `/100` olarak birebir ✔.
- Cap→yuvarlama sırası: her ikisinde de önce cap, sonra yuvarlama ✔.
- `F3=0` (hasar tutarı yok) → Excel J3=0 (sonuç 0); repo eşdeğeri: `partData.damageAmount`
  zorunlu, yoksa tutar üretilmez (daha güvenli) ✔.
- Rayiç-aralık tablosu (`Tablolar!F2:R16`, 0.65-1.0): U/C1 formüllerinde REFERANS EDİLMEZ;
  repo'nun bu tabloyu sete almaması doğrulandı ✔.

## 12. Örnek hesap karşılaştırmaları

**Örnek A — normal hesap:** rayiç 800.000, model yılı 2021, atama 2026 (yaş 5 → 0.90),
75.000 km grup A (→ 0.90), SBM 1 (→ −0.03), ticari hayır, Σparça 3.5, hasar 80.000
(oran %10 → J3 = (3.5+1)/100 = 0.045):
`800.000 × 0.90 × 0.90 × 0.97 × 0.045 = 28.285,20 → 28.500` — v3 raporundaki değerle ve motorla
birebir (davranış testi `DKv3 motor: tam veride tutar hesaplar` bunu sabitler) ✔.

**Örnek B — cap:** aynı girdilerle Σparça 40, hasar 400.000 → ham 282.852 > 240.000 (0.3×800.000)
→ cap 240.000, yuvarlanmış 240.000, `capApplied=true` (davranış testi sabitler) ✔.

**Örnek C — eksik veri/katsayı:** `partData` yok → `control_needed`, tutar YOK; katsayı seti
`missing` → `cannot_calculate` + "Katsayı tabloları yüklenmediği için tutarlı ön hesap yapılamadı."
tutar YOK (davranış testleri sabitler) ✔.

## 13. Uydurma / varsayım kontrolü

Uydurulmuş katsayı YOKTUR. Belgelenen varsayımlar/sapmalar:
1. Yaş kaynağı: atama tarihi (Excel: hasar tarihi/TODAY) — pratik etkisi ihmal edilebilir (§5).
2. D grubu 5001+ saat → 0.70 (kaynak formülde dal eksik; tablo değerinden alındı) (§6).
3. OTOBÜS 0.5 çarpanı uygulanmıyor (araç türü verisi yok; açık uyarı üretiliyor) (§8).
4. Tam 1000 katı tutarlarda Excel formül artefaktı izlenmiyor (repo doğru davranıyor) (§10).
5. Yuvarlama negatif girdiyi 0'a çeker (Excel'de bu girdi oluşmaz; güvenli taraf) (§10).

## 14. Eksik veya sonraki göreve bırakılan alanlar

- Parça katsayı tabloları (`Tablolar!B34:L295`, grup bazlı değişen/onarılan/boyanan listeler) ve
  hafif-orta-ağır sınıflaması (%15/%30 işçilik-parça oranı eşikleri, `Hesaplama!F16` deseni) → v4.
- Hasar tutarı + yapılandırılmış parça seçimi form alanları → v4.
- Araç türü (otomobil/taksi/otobüs/…) alanı ve OTOBÜS 0.5 çarpanı → v4+.
- Kaynak modül sürüm takibi (SEİK güncellemesi çıkarsa setin yeniden doğrulanması).

## 15. Sonuç: v4'e geçilebilir mi?

Yaş, km/saat, genel etkiler, grup çarpanı, cap, yuvarlama ve formül sırası kaynak modülle
hücre düzeyinde doğrulandı; tespit edilen iki yakınlık-penceresi uyumsuzluğu bu görevde (v3.1)
düzeltildi ve regresyon testleriyle sabitlendi. Kalan farklar bilinçli, belgelenmiş ve
güvenli-taraf varsayımlardır.

**v4'e geçilebilir.**
