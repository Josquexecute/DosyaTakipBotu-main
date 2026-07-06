# QA Ortam Yan Etkisi Notu — Ayarlar / Fixture Kökü (2026-07-06)

## Ayarların saklandığı yer

`%APPDATA%\Baran Ekspertiz\local-cache\app-settings.json`
(tam yol: `C:\Users\user\AppData\Roaming\Baran Ekspertiz\local-cache\app-settings.json`)

## Bu koşuda ne oldu?

1. **İzolasyon denendi, ÇALIŞMADI:** Electron `APPDATA` ortam değişkeni ile başlatıldı; ancak
   `app.getPath('appData')` Windows bilinen-klasör API'sini kullandığı için env override'ı yok
   saydı ve uygulama GERÇEK profile yazdı (izole dizin boş kaldı — kanıtlı).
2. **Koşu ÖNCESİ yedek alındı:** `app-settings.json.qa-backup-20260706` (aynı klasörde).
3. **Yeni kirlilik OLUŞMADI:** koşu, ayar dosyasını bayt-aynı içerikle yeniden yazdı —
   SHA-256 öncesi == sonrası == `2EE56392AA4FEFE61DF87020F87C173A5F19807CC5586505E087156F03F56C52`.
   (Kaydedilen kök yol, dosyada ZATEN duran değerle aynıydı.)
4. **Türetilmiş cache dosyalarına dokunuldu** (year-2026-index / folder-fingerprints /
   tracking-write-index): zararsızdır; gerçek kök seçilince ilk taramada yeniden üretilir.
   Gerçek ofis case klasörlerine DOKUNULMADI.

## Kalan (önceki koşudan gelen) durum

`rootPath` hâlâ `...\.fixtures\2026` — bu, BİR ÖNCEKİ görsel QA görevinin yan etkisidir ve
kullanıcı ekran görüntülerinde fark etmiştir. O koşudan önceki özgün değer kayıtlı olmadığından
otomatik geri yükleme GÜVENLİ DEĞİL (yanlış klasör yazma riski). Çözüm kullanıcıda tek adım:

> Ayarlar → "Aktif kök klasör" alanına kendi yerel çalışma klasörünüzü yazın/seçin → Kaydet.

## Gelecek QA koşuları için not

Gerçek izolasyon için `APPDATA` env yeterli değildir; Electron'a `app.setPath('appData', ...)`
erişimi veya ayrı bir makine profili gerekir. Bu görevde runtime koduna dokunmak yasak olduğundan
yedek+hash-karşılaştırma yöntemi kullanılmış ve değişmezlik kanıtlanmıştır.
