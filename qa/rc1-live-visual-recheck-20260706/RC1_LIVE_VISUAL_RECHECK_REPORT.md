# RC1 Canlı Görsel Recheck Raporu (2026-07-06)

## 1. Amaç

Scroll düzeltmesi sonrası uygulamayı CANLI, sayfa sayfa, üstten alta yeniden kontrol etmek;
kullanıcının iki inceleme notunu (fixture kök yolu, seçim uyarısı) özel olarak denetlemek.

## 2. Test ortamı

Windows, kaynaktan `electron .` (EXE DEĞİL), 1920x1080 sanal viewport, %100 zoom,
v0.6.4 + scroll fix (behavior 1492 tabanı).

## 3. Capture yöntemi

CDP (`--remote-debugging-port`) + Node yerleşik WebSocket — dependency YOK. Gezinme gerçek DOM
tıklamalarıyla (nav butonları, dosya satırı, araç kartları). 26/26 screenshot canlı uygulamadan.

## 4. Kullanılan fixture veri notu

250 sentetik dosya (`npm run fixtures` → `.fixtures\2026`). Gerçek ofis verisi/case klasörü
KULLANILMADI ve DOKUNULMADI.

## 5. Sayfa bazlı görsel sonuçlar

12 ana sayfa + 6 iç durum + koyu tema: tümü açıldı, beyaz ekran/çakışma/okunmaz etiket yok.
Ayrıntı: `SCREENSHOT_INDEX.md`.

## 6. Scroll / alt kırpılma kontrolü

`scroll-metrics.json` sayısal kanıt: kayan 5 durum (AI Yardımcıları 1540/1006 · Ayarlar
5826/1006 · Değer Kaybı 2611/1006 · Bilgi Bankası 1540/1006 · Değer Kaybı koyu 2611/1006)
altta gerçek `scrollTop` değerine ulaştı (534/4820/1605/534/1605) → **alt kırpılma YOK**.
Kalan sayfalar ya sığıyor ya tasarım gereği iç-scroll kullanıyor (sh==ch; kırpılma değil).

## 7. Yatay taşma kontrolü

20/20 durumda `scrollWidth == clientWidth` → **kontrolsüz yatay taşma YOK**.

## 8. Selection warning audit sonucu

Akış birebir uygulandı (`selection-warning-audit.json`):

- **Seçim ÖNCESİ:** Operasyon/Evrak/Portal/Excel/Ağır Hasar nav tıklamaları sayfayı AÇMADI
  (dosyalar'da kaldı; 7 kilitli nav) ve uyarı görünür — kilit GERÇEK, uyarı teknik olarak DOĞRU.
  AI Yardımcıları (bilinçli izinli sekme) açıldı; uyarı orada da görünür.
- **Karıştırıcı nokta:** Topbar ve "Seçili Dosya Bağlamı" paneli seçim öncesinde de otomatik
  bağlam dosyası gösteriyor ("80HB0241") — kullanıcı "dosya seçili görünüyor ama uyarı var"
  algısına düşüyor. Otomatik bağlam önizlemesi TASARIM GEREĞİ manuel seçim sayılmıyor
  ("Otomatik son-klasör yükleme kilidi AÇMAZ; yalnız manuel seçim açar").
- **Seçim SONRASI:** Dosyalar'da kayda tıklanınca topbar 01HB0000'a değişti, uyarı 6 sayfanın
  TAMAMINDA kayboldu, 6 sayfa da açıldı → uyarı BAYAT DEĞİL.

**Sınıflandırma: P2** — uyarı doğru ve bloklamıyor; ancak topbar'daki otomatik bağlam
göstergesiyle birlikte KARIŞTIRICI. Görev kuralı gereği P2 düzeltilmedi; öneri: seçim öncesi
topbar bağlam rozetine "önizleme" ibaresi veya uyarı metnine "üstte görünen dosya yalnız
önizlemedir" eki (ayrı, onaylı bir görevde).

## 9. Fixture root/settings yan etkisi kontrolü

`settings-side-effect-note.md` ayrıntılı: izolasyon denemesi (APPDATA env) Electron tarafından
yok sayıldı → gerçek profil kullanıldı; koşu ÖNCESİ yedek alındı; ayar dosyası bayt-aynı
yeniden yazıldı (SHA-256 öncesi==sonrası kanıtlı) → **bu koşu YENİ kirlilik eklemedi**.
Önceki koşudan kalan `.fixtures\2026` değeri duruyor; özgün değer bilinmediğinden otomatik
geri yükleme güvenli değil — kullanıcı Ayarlar'dan kendi klasörünü yeniden seçmeli (tek adım).

## 10. Dark theme kontrolü

`html.dark` ile Ana Sayfa + Değer Kaybı: koyu yüzeyler doğru, etiketler okunur, kayma çalışıyor.

## 11. Eksik screenshot var mı?

**Hayır — 26/26.**

## 12. Bloker var mı?

**P0/P1 YOK.** Tek bulgu §8'deki P2 (karıştırıcı ama bloklamayan uyarı/rozet kombinasyonu) +
§9'daki ortam yan etkisi notu (uygulama hatası değil, QA ortam konusu).

## 13. Son karar

**Canlı görsel recheck geçti; RC1 rebuild öncesi kullanıcı onayına sunulabilir.**
