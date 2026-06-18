# Pilot Kabul Planı — Saha Pilot v2

Bu plan, HasarBotu'nun ofiste sınırlı sayıda gerçek dosyayla denendiği **Saha Pilot v2** aşamasının kabul kriterlerini tanımlar. Amaç: uygulamanın gerçek pCloud klasör yapısı ve gerçek evrak/fotoğraflarla güvenli ve doğru çalıştığını teyit etmek.

## 1. Hazırlık
- Pilot için bir ay klasörü kopyalanır (orijinaller korunur): `npm run pilot:copy-month`.
- Pilot sırasında tanı paketi toplanır: `npm run pilot:collect`.
- Windows uyumluluk ön kontrolü: `npm run pilot:windows`.

## 2. Kabul kriterleri (Saha Pilot v2)
Aşağıdaki maddelerin tamamı pilotta doğrulanmalıdır.

### Sabah iş masası (günlük iş akışı v2)
Dosyalar ekranındaki hızlı filtreler gerçek verilerle anlamlı sonuç vermeli:
- **Bendeki**, **Geciken**, **Bugün**, **Bu Hafta**
- **Sahipsiz** (sorumlu atanmamış açık dosyalar)
- **Durgun** (uzun süredir işlem görmeyen açık dosyalar)
- **Veri Kalitesi** (eksik sorumlu/takip tarihi, kapalıda açık görev, PDF plaka uyuşmazlığı vb.)

### Veri kalitesi & risk
- **Veri Kalitesi** uyarıları kritik/uyarı seviyelerinde doğru sınıflandırılmalı.
- PDF plaka doğrulama (OCR dahil) uyuşmazlıkları "Sorunlar / Risk" ekranına düşmeli.
- pCloud çakışma/kopya ve revision regresyon tespiti çalışmalı; **sessiz ezme olmamalı**.

### Veri güvenliği
- Bozuk/çakışan `takip.json` durumunda ana dosya korunur, default üretilmez.
- Çok bilgisayarlı kullanımda aynı dosyada çakışma yönetimi (güvenli birleştirme / disk sürümü) doğru çalışır.

### Excel & parça/işçilik
- İşçilik dağıtıcı: hedef toplam ve gömülü fiyat listesi modları doğru tutar üretir; orijinal Excel değişmez.
- AI parça listesi okuma: el yazısı fişten makul isabetle parça çıkarır; usta dili gerçek ada çevrilir.

## 3. Çıkış (kabul) ölçütü
- Yukarıdaki maddelerin tümü pilot kullanıcı tarafından onaylanır ([PILOT_SAHA_TEST_FORMU.md](PILOT_SAHA_TEST_FORMU.md) doldurulur).
- Kritik (veri kaybı/ezme) hata gözlenmez.
- Sorun halinde [GERI_DONUS_PLANI.md](GERI_DONUS_PLANI.md) uygulanabilir durumdadır.

Kabul sonrası canlıya geçiş kararı için bkz. [CANLI_GECIS_KARARI.md](CANLI_GECIS_KARARI.md).
