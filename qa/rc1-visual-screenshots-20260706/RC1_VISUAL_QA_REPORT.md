# RC1 Görsel QA Raporu — Scroll Düzeltmesi Sonrası Sayfa Turu (2026-07-06)

## 1. Amaç

Scroll düzeltmesi (`.workspace.workspace-page` → `overflow-y: auto`) sonrası tüm sol menü
sayfalarını görsel olarak belgelemek; kullanıcının RC1 yeniden build öncesi ekran ekran
incelemesine sunmak.

## 2. Test edilen sürüm bilgisi

v0.6.4 kaynak + scroll fix'i (behavior 1492 tabanı). Kaynaktan çalıştırıldı
(`electron .` — EXE DEĞİL; mevcut RC1 EXE'si fix öncesine ait, eski).

## 3. Capture yöntemi

Electron `--remote-debugging-port` + CDP (Chrome DevTools Protocol) üzerinden otomatik gezinme
ve `Page.captureScreenshot`. Dependency EKLENMEDİ (Node yerleşik WebSocket). Veri: 250 sentetik
fixture (`npm run fixtures` → `.fixtures\2026`) — **gerçek ofis verisi kullanılmadı**. Kilit,
Dosyalar'dan fixture kaydına tıklanarak (gerçek kullanıcı akışı) açıldı.

## 4. Çözünürlük / zoom

1920x1080 sanal viewport, %100 zoom (tüm sayfalar). Kritik sayfa AI Değer Kaybı ayrıca %90 ve
%125 zoom'da (uygulamanın gerçek `--app-zoom` mekanizmasıyla) yakalandı. Koyu tema, uygulamanın
gerçek mekanizması `html.dark` ile 2 sayfada yakalandı.

## 5. Sayfa bazlı sonuçlar

29/29 screenshot başarılı; tüm sayfalar yüklendi, beyaz ekran/çakışan panel/okunmaz etiket YOK.
Ayrıntı: `SCREENSHOT_INDEX.md` + `capture-results.json` (sayısal scroll metrikleri).

## 6. Scroll / taşma kontrolü

Sayısal kanıt (scrollHeight/clientHeight):

- Mevzuat & AI Yardımcıları: **1851/1006 → sayfa kayıyor** (fix öncesi kırpılıyordu).
- AI Değer Kaybı Yardımcısı: **3026/1006 → kayıyor**; alt bölümler (katsayı seti, taslak
  butonları, AI Taslak Üretici) bottom görüntüsünde tam erişilebilir.
- Mevzuat Bilgi Bankası: 1851/1006 → kayıyor. Ayarlar: 5826/1006 → kayıyor.
- Focus sayfaları (Operasyon/Evrak/Portal/Excel/Ağır Hasar) ve liste sayfaları: sh==ch —
  tasarım gereği İÇ scroll kullanır; sayfa düzeyi kırpılma yok.
- Zoom %90 (2591/1006) ve %125 (2738/1006): kayma her iki zoom'da da çalışıyor.

## 7. Yatay taşma kontrolü

TÜM sayfalarda scrollWidth == clientWidth → kontrolsüz yatay taşma YOK (sayısal olarak
doğrulandı).

## 8. Dark theme görünüm kontrolü

`html.dark` ile Ana Sayfa + AI Değer Kaybı yakalandı: koyu yüzeyler doğru, etiketler okunur,
kart düzeni bozulmuyor, kayma çalışıyor.

## 9. Eksik alınan screenshot var mı?

**Hayır — 29/29 başarılı.** Not: Evrak küçük resimlerinde fixture görselleri sahte bayt
içerdiğinden resim İÇERİĞİ boş görünebilir; bu veri kaynaklıdır, layout hatası değildir.

## 10. Kullanıcı görsel onayı için notlar

- `screenshots/` klasörünü sırayla açın; özellikle 13_top/bottom (Değer Kaybı) ve
  04_top/bottom'u (AI Yardımcıları) kontrol edin — smoke bulgusunun düzeldiği yer burası.
- Sidebar/topbar/statusbar her görüntüde sabit ve görünür (DOM'dan da doğrulandı).
- ÖNEMLİ: Test için Ayarlar'daki kök yol `.fixtures\2026`'ya alındı. Gerçek çalışmaya dönerken
  Ayarlar'dan kendi klasörünüzü yeniden seçin.
- Bu rapor benim (otomatik + görsel) QA bulgularımdır; nihai görsel onay kullanıcıya aittir.

## 11. Son karar

Tüm sayfalar erişilebilir, dikey kayma sayısal+görsel olarak doğrulandı, yatay taşma yok,
koyu tema sağlıklı, bloker bulunamadı (runtime/CSS değişikliği GEREKMEDİ).

**Görsel QA açısından RC1 rebuild öncesi onaya sunulabilir.**
