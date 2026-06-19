# UI Entegrasyon Notları

Bu doküman HasarBotu v0.5.0 arayüz düzeninin bakım notlarını özetler.

## Tasarım Yaklaşımı

Uygulama sigorta eksper operasyonu için yoğun bilgi gösteren bir masaüstü aracıdır. Arayüz:

- sade,
- yoğun ama taranabilir,
- form ve tablo odaklı,
- riskleri görünür kılan,
- tekrar eden ofis kullanımına uygun

olmalıdır.

## Ekranlar

| Ekran | Amaç |
| --- | --- |
| Dashboard | Operasyon özeti, günlük iş masası ve KPI'lar |
| Dosyalar | Filtrelenebilir dosya listesi ve Excel export |
| Dosya Detayı | Takip, görev, not, evrak/fotoğraf ve Excel araçları |
| Klasörler | Salt-okunur klasör gezgini |
| Ayarlar | Kullanıcı, kök klasör, Gemini ve sürüm kontrolü |
| Sorunlar / Risk | Veri güvenliği ve operasyon uyarıları |

## Entegrasyon İlkeleri

- Renderer doğrudan dosya sistemi kullanmaz.
- Kullanıcı onayı gerektiren işlemler modal/önizleme ile görünür olur.
- Excel ve AI işlemleri ayrı çıktı dosyası üretir.
- Hard-block hataları normal toast olarak geçiştirilmez; kullanıcı işlemi durdurulur.
- Kritik dropdown değerleri shared workflow sabitlerinden gelir.

## İlgili Dokümanlar

- [KULLANIM_KILAVUZU.md](KULLANIM_KILAVUZU.md)
- [TEKNIK_MIMARI.md](TEKNIK_MIMARI.md)
- [VERI_GUVENLIGI.md](VERI_GUVENLIGI.md)
