# HasarBotu Dokümantasyon Merkezi

Bu klasör HasarBotu v0.6.0 için kullanım, kurulum, veri güvenliği, Excel/AI işçilik dağıtımı ve ofis release süreçlerini tek merkezde toplar.

## Ana Dokümanlar

| Doküman | Amaç | Hedef okur |
| --- | --- | --- |
| [KULLANIM_KILAVUZU.md](KULLANIM_KILAVUZU.md) | Günlük ofis kullanım akışı | Operasyon ekibi |
| [KURULUM_VE_GUNCELLEME.md](KURULUM_VE_GUNCELLEME.md) | Geliştirme, kurulum ve güncelleme komutları | Geliştirici / teknik sorumlu |
| [EXE_URETIM_REHBERI.md](EXE_URETIM_REHBERI.md) | Windows kurulum ve taşınabilir EXE üretimi | Release sorumlusu |
| [OFIS_DAGITIM_KONTROL_LISTESI.md](OFIS_DAGITIM_KONTROL_LISTESI.md) | Ofis bilgisayarlarına dağıtım kontrol listesi | Teknik sorumlu |
| [GERI_DONUS_PLANI.md](GERI_DONUS_PLANI.md) | Sorun halinde güvenli rollback akışı | Teknik sorumlu |
| [VERI_GUVENLIGI.md](VERI_GUVENLIGI.md) | `takip.json`, atomic write, pCloud ve fotoğraf hard-block prensipleri | Geliştirici / yönetici |
| [EXCEL_AI_ISCILIK_DAGITICI.md](EXCEL_AI_ISCILIK_DAGITICI.md) | Portal Excel kolonları, önizleme, öğrenme ve güvenlik kuralları | Operasyon / geliştirici |
| [KULLANIM_KILAVUZU.md](KULLANIM_KILAVUZU.md#ağır-hasar-ai-ön-değerlendirme) | Ağır Hasar AI ön değerlendirme, yapısal eşik ve firewall teyidi | Operasyon / geliştirici |
| [SORUN_GIDERME.md](SORUN_GIDERME.md) | Sık karşılaşılan sorunlar ve ilk müdahale | Operasyon / destek |
| [TEKNIK_MIMARI.md](TEKNIK_MIMARI.md) | Katmanlar, veri akışı, test ve kalite kapıları | Geliştirici |
| [CHANGELOG.md](CHANGELOG.md) | v0.6.0 dokümantasyon ve ürün özeti | Tüm ekip |

## Uyumluluk İçin Korunan Dokümanlar

Bazı eski dosya adları audit ve saha kabul komutları tarafından beklenir. Bu dosyalar silinmez; içerikleri v0.6.0 ile uyumlu tutulur.

| Dosya | Durum |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Teknik mimari kısa yönlendirme |
| [CANLI_KULLANIM_KILAVUZU.md](CANLI_KULLANIM_KILAVUZU.md) | Canlı kullanım hızlı rehberi |
| [CANLI_GECIS_KARARI.md](CANLI_GECIS_KARARI.md) | Canlı geçiş karar kaydı |
| [PILOT_KABUL_PLANI.md](PILOT_KABUL_PLANI.md) | Saha Pilot v2 kabul planı |
| [PILOT_SAHA_TEST_FORMU.md](PILOT_SAHA_TEST_FORMU.md) | Pilot saha test formu |
| [STITCH_UI_INTEGRATION.md](STITCH_UI_INTEGRATION.md) | UI entegrasyon notları |
| [V0.4.0_PRODUCTION_CANDIDATE.md](V0.4.0_PRODUCTION_CANDIDATE.md) | Audit uyumlu üretim adayı notu; içerik v0.6.0'ye göre günceldir |

## Dokümantasyon İlkeleri

- Dokümanlarda yalnızca mevcut ürün davranışı anlatılır.
- Kod, script, test veya `takip.json` şeması bu klasörden değiştirilmez.
- Sürüm referansı v0.6.0 olarak tutulur.
- Detaylı rehberler ana dokümanlara taşınır; eski dosyalar kısa ve yönlendirici kalır.
