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
- **Ücret çapası:** `Ekspertiz Ücreti : <tutar>` — "Ekspertiz Bilgileri" bölümünde.
  Görülen biçimler: `1600`, `2400`, `6125.4`, `2417.41`, `3352.5`, `8063.38` (nokta ondalık);
  TR binlik biçimi (`1.600,00`) için de çözümleyici hazır.
- **Ek alanlar:** `Rapor No : 2026/NN`, `Ekspertiz Türü : Uzaktan/YerindeEkspertiz`,
  `Rapor/Kayıt Tarihi`, `Plaka Numarası`, kasko/trafik ayrımı.
- **Başarı oranı:** 26/28 metin tabanlı ve çapa %100 tuttu. **2/28 özel-glif (Type3) fontlu**
  (farklı portal çıktısı): metin katmanı çöp semboller → çıkarım İMKÂNSIZ; durum `unreadable`
  olarak işaretlenir (elle giriş veya mevcut opsiyonel Tesseract OCR yolu ile okunabilir).
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
