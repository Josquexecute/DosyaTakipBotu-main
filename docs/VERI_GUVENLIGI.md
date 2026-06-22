# Veri Güvenliği

HasarBotu v0.6.0 local-first çalışır. Uygulamanın ana veri güvenliği hedefi, canlı dosya klasörlerinde kullanıcı verisini sessizce ezmemek ve riskli senaryoları görünür hale getirmektir.

## Source of Truth

Her hasar dosyasının otoritatif kaydı kendi klasöründeki dosyadır:

```text
<dosya klasörü>/_HASARBOTU/takip.json
```

Bu dosya:

- dosya durumu,
- sorumlu,
- takip ve son işlem tarihleri,
- notlar,
- yapılacaklar,
- rücu/KTT/ağır hasar yardımcı alanları,
- parça/işçilik takip alanları,
- metadata revision ve writeId

bilgilerini taşır.

AppData local-cache yalnızca performans ve ekran deneyimi için kullanılır. Cache silinirse uygulama klasörleri yeniden tarayarak veriyi tekrar oluşturabilir.

## Atomic Write

`takip.json` yazımı doğrudan dosyanın üzerine yapılmaz. Uygulama geçici dosya üretir, veriyi yazar, flush/fsync dener ve ardından güvenli rename akışıyla hedef dosyayı günceller. Windows Defender, Explorer önizleme ve pCloud kısa süreli kilitlerinde retry uygulanır.

Amaç:

- yarım yazılmış JSON üretmemek,
- mevcut dosyayı mümkün olduğunca korumak,
- hata olursa geçici çıktı bilgisini raporlamak.

## Revision ve WriteId

Her başarılı takip mutasyonu:

- revision değerini artırır,
- yeni writeId üretir,
- son işlem tarihini günceller.

Uygulama yazmadan önce diskteki revision/writeId ile beklenen değeri karşılaştırır. Aynı revision ama farklı writeId görülürse bu pCloud veya çoklu PC kaynaklı sessiz ezme riski olarak değerlendirilir ve otomatik yazma durdurulur.

## Corrupt JSON Koruması

Bozuk `takip.json` görüldüğünde:

- ana dosya silinmez,
- varsayılan boş takip dosyasıyla ezilmez,
- kurtarma kopyası alınır,
- sorun Sorunlar / Risk paneline taşınır.

Desteklenmeyen yeni schema dosyaları da read-only korunur.

## pCloud Conflicted Copy Algılama

Uygulama pCloud kaynaklı conflicted copy izlerini dosya sorunlarına ekler. Bu durumda kullanıcıdan veya teknik sorumludan manuel inceleme beklenir; doğru veri belirlenmeden otomatik merge yapılmaz.

Kısmi senkron şüphesi varsa, örneğin `_HASARBOTU` klasörü var ama `takip.json` yoksa uygulama varsayılan takip dosyası üretmez. Böylece henüz inmemiş canlı veri yanlışlıkla ezilmez.

## AppData Local Cache

Local cache:

- yıl indeksini,
- küçük resim cache bilgisini,
- yerel ayarları,
- öğrenen sözlükleri,
- write-index baseline bilgisini

tutabilir.

Bu alan canlı verinin yerine geçmez. Sorun halinde temizlenebilir; ancak öğrenen sözlük silinirse kullanıcı onaylı kişisel eşleşmeler de kaybolabilir.

## Yanlış Plaka Fotoğraf Hard-Block

Parça listesi fotoğrafı Gemini ile okunmadan önce aktif dosya bağlamı kontrol edilir.

Hard-block durumları:

- seçilen fotoğraf farklı plaka klasöründen geliyorsa,
- seçilen fotoğraf aynı plaka ama farklı dosya/föy klasöründeyse,
- aktif dosya ile seçilen dosyanın klasör kimliği uyuşmuyorsa.

Bu durumda görsel Gemini'ye gönderilmez ve işlem modal uyarıyla durur. Amaç yanlış dosyanın parça listesini aktif dosyaya işlememektir.

## Aynı Plaka Farklı Dosya Senaryosu

Aynı araç/plaka birden fazla hasar dosyasında bulunabilir. HasarBotu yalnızca plaka eşleşmesini yeterli kabul etmez; dosya klasörü kimliğini de dikkate alır. Aynı plaka farklı klasördeyse işlem güvenlik nedeniyle engellenir.

## Excel Güvenliği

- AI işçilik Excel akışı önizleme ve son onay olmadan yazmaz.
- Giriş dosyasıyla aynı çıktı yolu engellenir.
- Formüllü hücrelerin ezilmesi açık onay gerektirir.
- AI İşçilik Dağıtıcı orijinal dosyayı korur ve ayrı çıktı dosyası üretir.
- Mevcut H-N değerleri otomatik öğrenme verisi kabul edilmez.
