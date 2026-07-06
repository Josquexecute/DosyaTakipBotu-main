# SEİK Parça Katsayı Doğrulama ve Sıkılaştırma Raporu — AI Değer Kaybı Yardımcısı v4.1

> Bu belge bir DOĞRULAMA/denetim çıktısıdır; runtime davranışı tanımlamaz. Kaynak modül
> güncellenirse bu doğrulama tekrarlanmalıdır.

## 1. Amaç

v4'te eklenen SEİK parça katsayı tablosunun (`VALUE_LOSS_PART_COEFFICIENTS`,
`src/shared/value-loss/value-loss-part-coefficients.ts`) kaynak Excel modülüne hücre düzeyinde
izlenebilirliğini bağımsız olarak kanıtlamak; `J = TAM` / `L = LOKAL` eşlemesini gerekçelendirmek;
katsayı-dışı değerlerin güvenle dışlandığını doğrulamak ve v5 öncesi "v4 güvenle korunabilir mi?"
kararını vermek.

## 2. İncelenen kaynaklar

- Excel modülü (çalışma alanında mevcut): **"Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1"**
  — `Tablolar` sayfası, birincil aralık `Tablolar!B34:L295` (+ başlık satırları 32-33 vb.).
  Yöntem: xlsx zip içi ham sheet XML + sharedStrings çözümü (salt-okunur; dosyaya yazılmadı).
- **Bağımsız çapraz doğrulama scripti** (scratchpad, depo dışı): kaynak aralık TAZE yeniden
  çıkarıldı ve üretim tablosuyla 7 alan üzerinden (sourceRow, değişen, onarım hafif/orta/ağır,
  boya TAM/LOKAL) kayıt kayıt makine karşılaştırması yapıldı.
- Repo: part-input-types / part-coefficients / part-severity / part-resolver /
  calculation-engine / context-normalizer / context-diff / checklist / context-apply /
  draft-builder / parts-form / form-mapping + behavior testleri + v3.1 doğrulama dokümanı.

## 3. v4 parça katsayı seti özeti

**120 üretim kaydı.** Her kayıtta: `vehicleGroup`, `partName`, `normalizedPartName`
(TR büyük harf + boşluk sadeleştirme), opsiyonel 6 katsayı alanı, `sourceSheet: 'Tablolar'`,
`sourceRange: 'Tablolar!B{satır}:L{satır}'`, `sourceRow`. Grup dağılımı: A 34 (32 blok + 2 cabrio),
B 39, C 28 (Ç aynı bloğu kullanır), D 8, E 7, F 4.

## 4. Excel kaynak aralığı haritası

| Blok | Veri satırları | Grup | Not |
|---|---|---|---|
| OTOMOBİL TAKSİ (A GRUBU) | 34-65 | A | 62-65 hava yastığı satırları |
| MİNİBÜS OTOBÜS (B) | 70-115 | B | 80-113 adlar I sütununda; 114-115 airbag |
| C/Ç bloğu | 119-146 | C (Ç→C) | `Hesaplama!C16`: `IF(OR(C3="C",C3="Ç") ...)` |
| D bloğu | 155-167 | D | 162-167 KAPAK SAC tekrarları |
| E bloğu | 192-198 | E | |
| F bloğu (motosiklet) | 228-231 | F | |
| TİCARİ VE CABRİO yan panel | 264-265 | A'ya eklendi | esaslar 3.7 |

Ara satırlar (66-69, 116-118, 147-154, 168-191, 199-227, 232-263, 266-295) boş/sıfır dolgu veya
başlıktır; isimsiz oldukları için üretime alınmadı.

## 5. Sütun anlamları doğrulaması

Başlık satırları (33/69/118/154/191/227/263): `B=DEĞİŞEN PARÇALAR`, `C=KATSAYI`,
`E=ONARILAN PARÇALAR`, `F=HAFİF`, `G=ORTA`, `H=AĞIR`, `I=BOYANACAK PARÇALAR`, `L=LOKAL`.
`J` başlığı bozuk (sayısal 119 artığı), `K` başlığı ve TÜM K hücreleri boş (aşağıda).
Satır 80-113'te değişen/onarılan ad hücreleri boş olup adlar yalnız I sütunundadır; blok
yapısı gereği satırın tüm işlemleri aynı parçaya aittir (A bloğunda B=E=I adları özdeştir).

## 6. `J = TAM` / `L = LOKAL` boya eşlemesi doğrulaması

- `Hesaplama` sayfası boya katsayısı formülü TAM için `Tablolar!K{satır}`, LOKAL için
  `Tablolar!L{satır}` başvurur.
- **K sütunu 34-295 aralığında 0 (SIFIR) dolu hücre içerir** — formülün TAM referansı boşa
  bakar (kaynak modülde muhtemel sütun kayması). Birebir K takip edilseydi tüm TAM boya
  katsayıları 0 olurdu (açıkça hatalı sonuç).
- **Nicel kanıt (çapraz doğrulama):** J ve L'nin ikisinin de >0 olduğu **91 satırın 91'inde
  J ≥ L**; J/L oranları {1, 1.67, 1.88, 2}. Uygulama esasları 3.2 (lokal boya düşük etki,
  komple boya orta/yüksek etki) ile birebir uyumlu desen.
- Karar: `paintedFullCoefficient` ← **J sütunu**, `paintedLocalCoefficient` ← **L sütunu**.
- Bu eşleme resolver çıktısında GÖRÜNÜRDÜR: TAM çözümlerinde kaynak notu
  "TAM için J sütunu (modülde K boş; J=TAM eşlendi)" ifadesini içerir (testli).

## 7. Değişen parça katsayıları doğrulaması

Çapraz doğrulama: 120 kaydın `changedCoefficient` alanı kaynak C sütunuyla **birebir
(0 uyumsuzluk)**. Aralık: 0.1 – 6 (en yüksek: B ANA ŞASE 6, A TAVAN SACI 5, cabrio yan panel 4.5).

## 8. Onarılan parça katsayıları doğrulaması

Hafif/orta/ağır üçlüsü kaynak F/G/H sütunlarıyla **birebir (0 uyumsuzluk)**; aralık 0 – 3.
Ağırlık seçimi `classifyRepairSeverity` ile (oran ≤0.15 hafif, ≤0.30 orta, >0.30 ağır;
esaslar 3.4 + `Hesaplama!F16` deseni). F=G=H=0 satırlar (örn. C SÜRÜCÜ/YOLCU AIRBAG,
ARKA DİNGİL/KOVAN) kaynakta gerçekten 0'dır ve 0 olarak korunur (katsayı=0 geçerli değerdir).

## 9. Hava yastığı / katsayı dışı değer kontrolü

Kaynakta 6 satırın onarım hücreleri katsayı deseni dışındadır (G/H boş + F değerleri):
satır 62 (F=7), 63 (F=6), 64 (F=107), 65 (F=108), 114 (F=233), 115 (F=234). 107/108/233/234
değerleri satır/kimlik referansı görünümündedir; 6/7 de diğer onarım değerlerinin (maks. 3)
çok dışındadır. **Bu 6 satırın onarım katsayıları ÜRETİME ALINMADI** (`repaired*Coefficient`
= undefined) → onarılan işlemde çözümsüz/uyarı/kontrol gerekir. Değişim katsayıları (2/2/2/2/1/1)
ve geçerli boya değerleri korunur. **Doğrulama guard'ı (SEİK kuralı DEĞİL):** testler tüm üretim
katsayılarının sonlu, ≥0 ve ≤10 olduğunu tarar; bu eşik yalnız transkripsiyon hatası
yakalamak içindir.

## 10. Duplicate parça adı ve VLOOKUP semantiği kontrolü

Kaynakta aynı (grup, ad) için tekrar satırlar: B ÇAMURLUK (SAC-OTOBÜS) 101↔102,
B TABAN SACI 103↔104-106, B TAVAN SACI 107↔108-110, D KAPAK SAC 162↔163-167.
Excel `VLOOKUP(...FALSE)` İLK eşleşen satırı döndürür → üretimde **ilk satır kazanır**
(TABAN SACI→103 [TAM 0.25; sonraki tekrarlar 0], TAVAN SACI→107, ÇAMURLUK→101, KAPAK SAC→162).
Üretim tablosunda (grup, normalizedPartName) çifti **benzersizdir** (testli) → lookup
deterministiktir; kazanan satır `sourceRow` alanında görünür.

## 11. Araç grup eşlemesi kontrolü

Blok→grup eşlemeleri §4 tablosundaki gibidir; aynı normalize ad farklı gruplarda farklı katsayı
dönebilir (testli örnekler: MOTOR KAPUTU A=1 / B=1.5; TAVAN SACI A=5 / B=1 / C=2 / D=0.5;
ŞASE E=3 / F=3 / D=2). Bilinmeyen/`unknown` grup için hiçbir kayıt dönmez.

## 12. `Ç` grubunun C bloğunu kullanması

`Hesaplama!C16` formülü `IF(OR($C$3="C",$C$3="Ç"), Tablolar!B119:C150, ...)` — C ve Ç aynı bloğu
kullanır. Repo'da `lookupGroup('Ç') → 'C'`; test: `findPartCoefficientEntry('Ç','ANA ŞASE')`
satır 119'dan çözülür.

## 13. Cabrio / özel satırlar kontrolü

Satır 264-265 (SOL/SAĞ YAN PANEL (TİCARİ VE CABRİO), değişim 4.5) esaslar 3.7 gereği hususi
cabrio/tek kapılı kamyonet arka çamurluk hesabında kullanılır; A grubuna KAYNAK ADIYLA eklendi
(kullanıcı bilinçli seçer; otomatik ikame YAPILMAZ — 3.7 kuralının otomasyonu v5+ konusudur).

## 14. Bilinmeyen parça davranışı

Tabloda olmayan ad → `findPartCoefficientEntry` undefined → resolver katsayı ÜRETMEZ, satırı
atmaz, uyarıyla işaretler → motor `control_needed`. Yazım hatası bulanık eşleşME YAPMAZ
(yalnız tam/normalize eşleşme; test: 'MOTOR KAPUT' çözülmez). UI, grup bazlı bilinen adları
datalist ile önerir.

## 15. Serbest metinden katsayı tahmini yapılmadığı kontrolü

`changedPartsText` / `repairedPartsText` / `paintedPartsText` alanları hiçbir yerde katsayıya
dönüştürülmez: resolver yalnız `structuredParts` alır; motor yalnız `structuredParts`
(veya v3 test-yolu açık `partData`) üzerinden parça katsayısı kullanır. Test: yalnız serbest
metinli bağlam `control_needed` döner, parça faktörü üretilmez.

## 16. Hesap motorunda kısmi/çözümsüz parça davranışı

- Tüm satırlar çözüldü + `damageAmount` var → `calculated` (parça başına faktör + kaynak satır).
- En az bir satır çözümsüz → **`control_needed`, tutar YOK**; kısmi ara toplam yalnız
  "TANI amaçlıdır, sonuç olarak kullanılamaz" uyarısında görünür.
- `damageAmount` yok → missing input + `control_needed`.
- `damageAmount > rayiç` → uyarı + `control_needed`.
- Disclaimer her durumda zorunlu; taslağa tutar yazılmaz; "kesin değer kaybı /
  ödenmesi gereken kesin tutar / nihai tazminat" ifadeleri üretilmez (regex-testli).

## 17. Kaynak satır/range izlenebilirliği

120 kaydın tamamında `sourceSheet/sourceRange/sourceRow` dolu ve `sourceRange`
`Tablolar!B{satır}:L{satır}` biçiminde, satırlar 34-295 aralığındadır (testli). Çözülen her
kalemde `coefficientSource` UI'da ve motor faktör açıklamasında görünür; TAM çözümleri J-eşleme
notunu taşır.

## 18. Test edilen örnek parça çözümlemeleri

| Örnek | Beklenen | Durum |
|---|---|---|
| A / MOTOR KAPUTU / değişen | 1 (satır 43) | ✔ |
| A / SAĞ ÖN ÇAMURLUK (SAC) / onarılan, oran 0.2 → orta | 0.75 (satır 36) | ✔ |
| A / TAVAN SACI / boyanan TAM | 3 (satır 34, J) | ✔ |
| A / TAVAN SACI / boyanan LOKAL | 1.5 (satır 34, L) | ✔ |
| B / TABAN SACI (duplicate) | satır 103 kazanır; TAM 0.25 | ✔ |
| Ç / ANA ŞASE | C bloğu satır 119, değişim 2.5 | ✔ |
| A / SÜRÜCÜ HAVA YASTIĞI / onarılan | çözümsüz + uyarı (anomali dışlandı) | ✔ |
| Tam veri seti (3 parça, Σ4.75, hasar 80.000/800.000) | 36.142,20 → 36.500 | ✔ |

## 19. Varsayımlar ve kalan riskler

1. `J = TAM` eşlemesi kaynak modüldeki K-sütunu boşluğuna dayalı, nicel desteği güçlü
   (91/91 J≥L) bir yorumdur; SEİK düzeltilmiş modül yayınlarsa teyit edilmelidir (kaynak notu
   her çözümde görünür).
2. Hava yastığı onarım katsayıları bilinçli olarak yok → bu satırlar onarılan işlemde daima
   kontrol gerektirir.
3. KABİN (TRİMSİZ) satırında kaynak modülün kendi iç notu vardır (trimli/trimsiz ayrımı
   "formülle koyulacak") — modül güncellemesinde izlenmelidir.
4. Esaslar 3.7 cabrio ikamesi otomatikleştirilmedi (kullanıcı bilinçli seçer).
5. ≤10 sanity eşiği yalnız transkripsiyon-hatası guard'ıdır; SEİK kuralı değildir.

## 20. Sonuç: v4 güvenle korunabilir mi?

120 üretim kaydının 7 alanı kaynak aralıktan yapılan TAZE bağımsız çıkarımla makine
karşılaştırmasında **0 uyumsuzluk, 0 bütünlük sorunu** verdi; eşlemeler (J/L, Ç→C, duplicate
ilk-satır, airbag dışlama) hem gerekçelendirildi hem testlerle sabitlendi; motor çözümsüz
parçada tutar üretmiyor. Üretim kodunda düzeltme GEREKMEDİ.

**v4 güvenle korunabilir.**
