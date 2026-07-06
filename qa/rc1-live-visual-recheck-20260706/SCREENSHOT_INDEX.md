# RC1 Canlı Görsel Recheck — Screenshot Dizini (2026-07-06)

1920x1080 sanal viewport, %100 zoom, 250 sentetik fixture (gerçek ofis verisi YOK).
Sayısal metrikler: `scroll-metrics.json` · Uyarı denetimi: `selection-warning-audit.json`.

| Screenshot | Sayfa/Durum | Konum | Alındı | Not |
|---|---|---|---|---|
| 00_SelectionWarning_preSelection.png | Seçim ÖNCESİ uyarı kanıtı | — | ✓ | Topbar bağlam dosyası gösterirken uyarı görünür (P2 kanıtı) |
| 01_Ana_Sayfa_top.png | Ana Sayfa | Üst | ✓ | Sığıyor |
| 01_dark_Ana_Sayfa_dark_top.png | Ana Sayfa (koyu) | Üst | ✓ | |
| 02_Dosyalar_top.png | Dosyalar | Üst | ✓ | İç-scroll |
| 03_Rapor_Fatura_Uyum_top.png | Rapor/Fatura Uyum | Üst | ✓ | Sığıyor |
| 04_Mevzuat_AI_Yardimcilari_top/bottom.png | Mevzuat & AI Yardımcıları | Üst+Alt | ✓ | KAYIYOR 1540/1006, altta scrollTop=534 |
| 05_Klasorler_top.png | Klasörler | Üst | ✓ | İç-scroll |
| 06_Operasyon_top.png | Operasyon | Üst | ✓ | İç-scroll |
| 07_Evrak_Fotograf_top.png | Evrak & Fotoğraf | Üst | ✓ | İç-scroll |
| 08_Portal_top.png | Portal | Üst | ✓ | İç-scroll |
| 09_Excel_Araclari_top.png | Excel Araçları | Üst | ✓ | İç-scroll |
| 10_Agir_Hasar_top.png | Ağır Hasar | Üst | ✓ | İç-scroll |
| 11_Durum_Panosu_top.png | Durum Panosu | Üst | ✓ | Sığıyor |
| 12_Ayarlar_top/bottom.png | Ayarlar | Üst+Alt | ✓ | KAYIYOR 5826/1006, altta scrollTop=4820 |
| 13_Mevzuat_AI_Deger_Kaybi_top/bottom.png | AI Değer Kaybı | Üst+Alt | ✓ | KAYIYOR 2611/1006, altta scrollTop=1605 |
| 13_dark_Mevzuat_AI_Deger_Kaybi_dark_top/bottom.png | AI Değer Kaybı (koyu) | Üst+Alt | ✓ | Koyu temada da kayıyor |
| 14_Mevzuat_Bilgi_Bankasi_top/bottom.png | Mevzuat Bilgi Bankası | Üst+Alt | ✓ | KAYIYOR 1540/1006 |
| 15_Excel_Iscilik_Dagitici_top.png | Portal Excel İşçilik Dağıtıcı | Üst | ✓ | Excel seçilmemiş durum |
| 16_Agir_Hasar_AI_On_Degerlendirme_top.png | Ağır Hasar AI Ön Değerlendirme | Üst | ✓ | Seçili fixture ile |
| 17_Evrak_Fotograf_Thumbnail_View_top.png | Evrak küçük resim görünümü | Üst | ✓ | Fixture görselleri sahte bayt |
| 18_Dosya_Detay_top.png | Dosya Detay (seçili dosya) | Üst | ✓ | İç-scroll |

Toplam: **26/26 başarılı**; eksik yok. Kayan 5 durumda alt kare + gerçek scrollTop değeri kanıtlı;
tüm karelerde sidebar/topbar/statusbar mevcut.
