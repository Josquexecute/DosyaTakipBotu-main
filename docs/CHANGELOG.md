# Changelog

Bu doküman HasarBotu v0.4.12 için kullanıcı ve operasyon odaklı güncel değişiklik özetidir. Ayrıntılı teknik geçmiş gerekiyorsa kök `CHANGELOG.md` arşiv olarak ayrıca incelenebilir.

## v0.4.12

### AI İşçilik Dağıtıcı

- Gerçek portal Excel kolon yapısı v0.4.12 dokümantasyonuna işlendi.
- A sütununun sıra no olduğu, parça adı olarak kullanılmayacağı netleştirildi.
- C sütununun ana parça/işçilik açıklaması olduğu vurgulandı.
- B sütunu grup, D sütunu parça kodu olarak anlatıldı.
- H-N mevcut değerlerinin otomatik öğrenme verisi olmadığı açıklandı.
- Önizleme, kullanıcı düzeltmesi, onay ve öğrenme sırası belgelendi.

### Veri Güvenliği

- `takip.json` source of truth yaklaşımı ayrı dokümana taşındı.
- Atomic write, revision/writeId, corrupt JSON ve pCloud conflicted copy korumaları açıklandı.
- Yanlış plaka fotoğraf seçiminde hard-block davranışı belgelendi.
- Aynı plaka farklı dosya klasörü senaryosu güvenlik notlarına eklendi.

### Operasyon

- Kurulum, EXE üretimi, release, ofis dağıtım ve geri dönüş dokümanları v0.4.12'ye göre düzenlendi.
- Eski kısa dokümanlar audit uyumluluğu korunarak güncel rehberlere yönlendirildi.
- README kurumsal giriş sayfası olarak yeniden yapılandırıldı.
