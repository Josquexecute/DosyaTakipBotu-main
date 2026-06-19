# Pilot Kabul Planı

Bu plan HasarBotu v0.5.0 için sınırlı gerçek dosya ile yapılan **Saha Pilot v2** kabul sürecini tanımlar.

## Pilot Hazırlığı

- [ ] Pilot ay klasörü aktif veriden güvenli şekilde ayrıldı.
- [ ] Gerekirse `npm run pilot:copy-month` ile kontrollü pilot kopyası oluşturuldu.
- [ ] Pilot bilgisayarda v0.5.0 çalışıyor.
- [ ] `npm run pilot:collect` ile tanı paketi alınabileceği doğrulandı.

## Kabul Alanları

| Alan | Beklenti |
| --- | --- |
| Dashboard | Açık dosya, kapalı dosya, eksik evrak, eksik fotoğraf ve portal bekleyen sayıları doğru. |
| Dosyalar | Bendeki, Geciken, Bugün, Bu Hafta, Sahipsiz, Durgun ve Veri Kalitesi filtreleri doğru çalışıyor. |
| Evrak | Trafik/kasko eksikleri ve PDF plaka kontrolü makul sonuç veriyor. |
| Fotoğraf | KM, Vites, Şase/Şasi, Olay Yeri, HEIC/RAW ve bozuk fotoğraf uyarıları ayrışıyor. |
| Veri Kalitesi | Eksik sorumlu, eksik takip tarihi, kapalıda açık görev ve durgun dosya uyarıları görünür. |
| pCloud güvenliği | Conflicted copy, same-revision different-write ve revision regression sessiz ezmeye yol açmıyor. |
| Excel | Portal Excel dağıtımı ayrı çıktı dosyası üretir. |
| AI İşçilik | Önizleme/onay olmadan yazmaz; C sütunu ana açıklama olarak kullanılır. |

## Başarılı Pilot Kriterleri

- Sahipsiz, Durgun ve Veri Kalitesi filtreleri saha dosyalarında beklenen sonucu verir.
- En az bir dosyada not/görev ekleme, düzenleme ve silme testi geçer.
- Tek dosya yenileme tam yıl taramasına ihtiyaç duymadan seçili dosyayı günceller.
- Yanlış plakalı fotoğraf hard-block ile engellenir.
- AI İşçilik Dağıtıcı düşük güvenli satırı boş bırakmaz ve Kontrol gerekli işaretler.
- pCloud veya tracking riski görülen dosya Sorunlar / Risk paneline düşer.

## Pilot Sonrası

Pilot sonunda:

```bash
npm run pilot:collect
```

ile tanı paketi alınır ve kabul/ret kararı [CANLI_GECIS_KARARI.md](CANLI_GECIS_KARARI.md) dokümanına işlenir.
