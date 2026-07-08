# Kapanma (Ekspertiz) Ücreti — Rapor PDF Öğrenimi ve Özellik Tasarımı

> Durum: ÖĞRENME TAMAM + saf çıkarım motoru hazır (`src/shared/reports/closing-fee-extract.ts`).
> Main/IPC/UI kablolaması SONRAKİ adımdır. Not: kaynak `v0.6.4-final-candidate` ile donduruldu;
> bu özellik bir SONRAKİ sürüm geliştirmesidir (freeze etiketi değişmez).

## 1. Amaç

Kapatılan dosyalarda, kesin ekspertiz raporundaki **"Ekspertiz Ücreti"** değerini (kapanma
ücreti) programda göstermek/kaydetmek.

## 2. Öğrenilen rapor yapısı (28 gerçek PDF, 2026)

- **Klasör düzeni:** `EKSPERTİZ RAPORLARI\2026\<AY YIL>\<PLAKA> EKSPERTİZ RAPORU.pdf`
  (ofisteki gerçek yol: `P:\BARAN GLOBAL EKSPERTİZ\EKSPERTİZ RAPORLARI\2026`). Ay klasörleri
  dosya kökündeki ay adlarıyla aynı biçimdedir (ör. "HAZİRAN 2026").
- **Eşleştirme anahtarları:** (1) dosya adındaki PLAKA — vaka klasör adları da plakayla
  başladığı için birincil anahtar; (2) rapor içindeki `Dosya No : NN/NNNNNNNN` (sigorta hasar
  dosya no) — takip kaydındaki dosya no ile çapraz doğrulama.
- **Kapanma tutarı çapası (v0.6.7 DÜZELTME):** `GENEL TOPLAM <tutar>` — "Hesap Özeti" bölümünde,
  KDV DAHİL nihai tutar (ör. `72.594,91`, `173.354,16`). Kullanıcı isteğiyle: küçük hizmet bedeli
  olan "Ekspertiz Ücreti" DEĞİL, GENEL TOPLAM baz alınır. TR biçimi (`72.594,91` = nokta binlik,
  virgül ondalık) çözümlenir. NOT: GENEL TOPLAM (KDV dahil) ≠ TOPLAM TUTAR (KDVsiz ara toplam);
  bazı raporlarda GENEL TOPLAM ile Ödemeler bölümündeki "KDV'Lİ TUTAR" da farklı olabilir —
  yalnız GENEL TOPLAM alınır. PDF okuyucu metni iki temsille birleştirdiğinden GENEL TOPLAM
  genelde iki kez geçer; ilk (özdeş) eşleşme alınır.
- **Ek alanlar:** `Rapor No : 2026/NN`, `Ekspertiz Türü : Uzaktan/YerindeEkspertiz`,
  `Rapor/Kayıt Tarihi`, `Plaka Numarası`, kasko/trafik ayrımı.
- **Başarı oranı (28 gerçek rapor):** **25 GENEL TOPLAM (pozitif)** + **1 sıfır** (42BHY26 —
  reddedilen/iptal dosya, `0,00` geçerli sayılır) + **2 özel-glif (Type3) fontlu** (34CKG245,
  34MPA764 — çöp metin, `unreadable`; elle giriş veya opsiyonel Tesseract OCR ile okunabilir).
- PDF'ler küçük (ort. 84KB) ve mevcut `pdf2json` bağımlılığıyla okunur — YENİ dependency yok.

## 3. Saf çıkarım motoru (HAZIR)

`src/shared/reports/closing-fee-extract.ts`:
`normalizePlateKey` · `parseReportFileName` · `parseTurkishAmount` · `looksUnreadableReportText`
· `extractClosingFeeFromText` → `{ status: ok|fee_missing|unreadable, feeTl, dosyaNo, raporNo,
ekspertizTuru, kayitTarihi, plateInText, warnings }`. Ağ/dosya/IPC yok; davranış testli.

## 4. Kablolama planı (sonraki adım — küçük eklemeli)

1. **Ayar:** `settings.reportsRootPath` (opsiyonel; Ayarlar'da metin girişi + klasör seç;
   varsayılan öneri `P:\BARAN GLOBAL EKSPERTİZ\EKSPERTİZ RAPORLARI\2026` — ancak pCloud
   canlı-kök kuralı gereği salt-OKUNUR tarama yüzeyidir, yazma asla yapılmaz).
2. **Main servis:** salt-okunur tarayıcı — yıl/ay klasörlerini gezer, `parseReportFileName`
   ile plaka anahtarı çıkarır, mevcut pdf2json okuyucusuyla metni alır, motoru çağırır;
   sonuçları local-cache'e (türetilmiş) yazar. takip.json'a DOKUNMAZ.
3. **IPC:** +1 salt-okunur invoke (`reports:get-closing-fees`) → kontrat/preload/denetim
   sayıları 86→87 olarak birlikte güncellenir (üçlü kural).
4. **UI:** kapalı dosyalarda Dosya Künyesi + Durum Panosu satırında "Kapanma ücreti: X TL"
   (kaynak rozeti: rapor adı/tarihi; `unreadable` → "okunamadı, elle girin" uyarısı).
5. **Opsiyonel kalıcılaştırma:** kullanıcı ONAYIYLA `tracking.closing.fee` alanına yazma
   (confirmDialog + mevcut güvenli mutate); otomatik yazma YOK.
6. Eşleşmeyen/çift plaka, yıl-dışı klasör, unreadable ve ücret-aralık uyarıları listelenir.

## 5. Kurallara uyum

Ücretli servis yok · yeni dependency yok · ağ yok · rapor klasörü SALT-OKUNUR (pCloud'a yazma
yok) · preview-first · takip.json'a yalnız onayla · testler/guard'lar korunur.
