# RC1 Görsel QA — Screenshot Dizini (2026-07-06)

Tümü 1920x1080 sanal viewport, %100 uygulama zoom'u (aksi belirtilmedikçe), 250 sentetik
fixture dosyasıyla (.fixtures\2026 — gerçek ofis verisi YOK). "Alt" görüntüsü yalnız sayfa
kayıyorsa alınmıştır (kaymayan sayfalar iç-scroll'lu ya da ekrana sığıyor).

| Screenshot | Sayfa/Durum | Konum | Alındı mı? | Not |
|---|---|---|---|---|
| 01_Ana_Sayfa_top.png | Ana Sayfa | Üst | ✓ | Kategori kartları ekrana sığıyor |
| 01_dark_Ana_Sayfa_dark_top.png | Ana Sayfa (koyu tema) | Üst | ✓ | html.dark ile |
| 02_Dosyalar_top.png | Dosyalar | Üst | ✓ | Liste iç-scroll'lu (sayfa kaymaz) |
| 03_Rapor_Fatura_Uyum_top.png | Rapor / Fatura Uyum | Üst | ✓ | Sığıyor |
| 04_Mevzuat_AI_Yardimcilari_top.png | Mevzuat & AI Yardımcıları | Üst | ✓ | Sayfa kayıyor (1851/1006) |
| 04_Mevzuat_AI_Yardimcilari_bottom.png | Mevzuat & AI Yardımcıları | Alt | ✓ | Alt içerik erişilebilir |
| 05_Klasorler_top.png | Klasörler | Üst | ✓ | İç-scroll'lu |
| 06_Operasyon_top.png | Operasyon | Üst | ✓ | Focus sayfası, iç-scroll |
| 07_Evrak_Fotograf_top.png | Evrak & Fotoğraf | Üst | ✓ | Focus sayfası, iç-scroll |
| 08_Portal_top.png | Portal | Üst | ✓ | Focus sayfası, iç-scroll |
| 09_Excel_Araclari_top.png | Excel Araçları | Üst | ✓ | Focus sayfası, iç-scroll |
| 10_Agir_Hasar_top.png | Ağır Hasar | Üst | ✓ | Focus sayfası, iç-scroll |
| 11_Durum_Panosu_top.png | Durum Panosu | Üst | ✓ | Sığıyor |
| 12_Ayarlar_top.png | Ayarlar | Üst | ✓ | Sayfa kayıyor (5826/1006) |
| 12_Ayarlar_bottom.png | Ayarlar | Alt | ✓ | |
| 13_Mevzuat_AI_Deger_Kaybi_top.png | AI Değer Kaybı Yardımcısı | Üst | ✓ | Sayfa kayıyor (3026/1006) |
| 13_Mevzuat_AI_Deger_Kaybi_bottom.png | AI Değer Kaybı Yardımcısı | Alt | ✓ | Katsayı seti + taslak butonları erişilebilir (eski P1'in kanıtı) |
| 13_zoom90_..._top/bottom.png | AI Değer Kaybı (%90 zoom) | Üst+Alt | ✓ | Kayma çalışıyor (2591/1006) |
| 13_zoom125_..._top/bottom.png | AI Değer Kaybı (%125 zoom) | Üst+Alt | ✓ | Kayma çalışıyor (2738/1006) |
| 13_dark_..._top/bottom.png | AI Değer Kaybı (koyu tema) | Üst+Alt | ✓ | Koyu temada da kayma + okunurluk |
| 14_Mevzuat_Bilgi_Bankasi_top.png | Mevzuat Bilgi Bankası | Üst | ✓ | Sayfa kayıyor (1851/1006) |
| 14_Mevzuat_Bilgi_Bankasi_bottom.png | Mevzuat Bilgi Bankası | Alt | ✓ | |
| 15_Excel_Iscilik_Dagitici_top.png | Excel İşçilik Dağıtıcı | Üst | ✓ | Excel seçilmemiş durum (Dağıtıcı, Excel Araçları içinde) |
| 16_Agir_Hasar_AI_Detay_top.png | Ağır Hasar AI değerlendirme | Üst | ✓ | Seçili fixture dosyasıyla |
| 17_Evrak_Fotograf_Thumbnail_View_top.png | Evrak & Fotoğraf küçük resim | Üst | ✓ | Fixture görselleri sahte bayt içerdiğinden resim içeriği boş görünebilir (beklenen) |
| 18_Dosya_Detay_top.png | Dosyalar + seçili dosya | Üst | ✓ | Çalışma alanı iç-scroll'lu |

Toplam: 29/29 başarılı. Eksik/başarısız yakalama YOK. Ayrıntılı sayısal metrikler:
`capture-results.json`.
