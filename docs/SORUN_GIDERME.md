# Sorun Giderme

Bu rehber HasarBotu v0.4.12 kullanımında sık görülebilecek sorunlar için ilk müdahale adımlarını özetler.

## Uygulama Açılmıyor

| Kontrol | Komut / işlem |
| --- | --- |
| Electron ikilisi eksik olabilir | `npm run fix:electron` |
| Build çıktısı eksik olabilir | `npm run build` |
| Bağımlılık eksik olabilir | `npm install` |
| Kaynak bütünlüğü şüpheli | `npm run ci` |

## Dosya Listesi Gelmiyor

- Aktif kök klasörün doğru seçildiğini kontrol edin.
- Klasör erişim izni ve pCloud senkron durumunu kontrol edin.
- Sorunlar panelinde kısmi senkron veya corrupt tracking uyarısı var mı bakın.
- Tek dosya yenileme yerine tam tarama gerekebilir.

## pCloud Çakışma Uyarısı

Uyarılar:

- pCloud conflicted copy.
- Same-revision different-write.
- Revision regression.

İlk müdahale:

1. Dosyada manuel işlem yapmayı durdurun.
2. Sorunlar panelindeki klasörü açın.
3. Diskteki `takip.json` ve varsa conflict kopyasını inceleyin.
4. Gerekirse [GERI_DONUS_PLANI.md](GERI_DONUS_PLANI.md) içindeki Disk Baseline Kabul akışını izleyin.

## Bozuk takip.json

- Uygulama ana dosyayı silmez ve varsayılan dosyayla ezmez.
- Kurtarma kopyası alınır.
- Teknik sorumlu JSON içeriğini incelemelidir.
- AppData cache temizliği tek başına canlı veriyi düzeltmez.

## Excel Kaydetmiyor

| Belirti | Açıklama |
| --- | --- |
| Önizleme yok | Excel önce uygulama içinden seçilmeli ve önizleme oluşturulmalı. |
| Aynı input/output yolu | Giriş dosyasının üzerine yazma engellenir. |
| Riskli kolon | Manuel kolon seçimi açık onay gerektirir. |
| Formüllü hücre | Formül ezme açık onay gerektirir. |
| Kategori sütunları yok | H-N başlıkları kontrol edilmeli. |

## AI İşçilik Sonucu Beklenenden Farklı

- C sütunundaki açıklamanın doğru dolu olduğunu kontrol edin.
- B grubunun destekleyici bilgi olduğunu, A'nın parça adı olmadığını unutmayın.
- Kontrol gerekli satırları elle düzeltin.
- Düzeltme/onay sonrası öğrenme sözlüğüne kaydedilir.
- Mevcut H-N değerleri otomatik doğru kabul edilmez.

## Fotoğraf AI'a Gönderilmiyor

Bu genellikle güvenlik hard-block davranışıdır.

- Aktif dosya ile seçilen fotoğraf aynı dosya klasöründe mi?
- Aynı plaka farklı dosya klasörü olabilir mi?
- Fotoğraf plaka klasörü dışından mı seçildi?

Hard-block doğru çalışıyorsa görsel Gemini'ye gönderilmez.

## HEIC / RAW Format Uyarısı

HEIC/RAW uyarısı eksik fotoğraf ile aynı şey değildir. Uygulama desteklenmeyen formatları ayrı KPI ve uyarı olarak gösterir.

## Hız ve Tarama Sorunları

- Tek dosya yenileme, tam yıl taramasından daha hafiftir.
- Büyük klasörlerde pCloud dosyalarının yerel olarak indiğinden emin olun.
- AppData local-cache gerektiğinde temizlenebilir; canlı takip verisi `_HASARBOTU/takip.json` içindedir.
