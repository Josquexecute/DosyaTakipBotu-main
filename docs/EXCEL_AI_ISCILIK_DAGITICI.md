# Excel / AI İşçilik Dağıtıcı

AI İşçilik Dağıtıcı, portal Excel dosyalarında parça açıklamalarını okuyup H-N işçilik kolonları için öneri üretir. v0.6.0 ile gerçek portal kolon yapısı sabitlenmiştir.

## Portal Excel Kolon Yapısı

| Kolon | Anlam | AI davranışı |
| --- | --- | --- |
| A | Sıra no / satır numarası | Parça adı olarak kullanılmaz. |
| B | DVN grubu / parça grubu | Destekleyici sınıflandırma bilgisi olarak kullanılır. |
| C | Asıl parça / işçilik açıklaması | Ana analiz kaynağıdır. |
| D | Parça kodu | Varsa karar desteği ve öğrenme anahtarı için kullanılır. |
| F | Parça sahiplenme bedeli | Tutar desteği olarak okunabilir. |
| G | Parça orijinal bedeli | Tutar desteği olarak okunabilir. |
| H | Kaporta | İşçilik kategori kolonu. |
| I | Mekanik | İşçilik kategori kolonu. |
| J | Elektrik | İşçilik kategori kolonu. |
| K | Döşeme-Kilit | İşçilik kategori kolonu. |
| L | Cam | İşçilik kategori kolonu. |
| M | Boya | İşçilik kategori kolonu. |
| N | Onarım | İşçilik kategori kolonu. |

## Temel Kurallar

- A sütunu hiçbir zaman parça adı kabul edilmez.
- C sütunu ana açıklamadır.
- B sütunu destekleyici grup bilgisidir.
- D sütunu parça kodudur.
- Her satır için işçilik önerisi üretilir.
- Düşük güvenli satır boş bırakılmaz; en mantıklı kategori yazılır ve **Kontrol gerekli** işaretlenir.
- Önizleme oluşmadan Excel kaydedilmez.
- Kullanıcı onayı olmadan dosyaya yazma yapılmaz.
- Çıktı ayrı dosyaya kaydedilir; orijinal Excel korunur.

## Önizleme Ekranında Gösterilen Alanlar

| Alan | Açıklama |
| --- | --- |
| Satır no | Excel satır numarası |
| Grup | B sütunu DVN/parça grubu |
| Parça açıklaması | C sütunu ana açıklama |
| Parça kodu | D sütunu |
| Eski H-N değerleri | Portal Excel'deki mevcut işçilik kolonları |
| Yeni H-N değerleri | AI önerisinin yazacağı kolon değerleri |
| Seçilen işçilik türü | Kaporta, Mekanik, Elektrik, Döşeme-Kilit, Cam, Boya, Onarım |
| Güven seviyesi | Yüksek, Orta veya Düşük |
| Kontrol gerekli mi? | Kullanıcı incelemesi gereken satırlar |
| Karar gerekçesi | Kural, öğrenme veya fiyat listesi temelli açıklama |
| Düzenleme alanı | Kullanıcının satırı elle düzeltmesi için |

## v0.6.0 Önizleme ve Kontrol Deneyimi

Önizleme ekranı artık büyük portal Excel dosyalarında hızlı kontrol için tasarlanmıştır:

- Tüm satırlar, değişen satırlar, kontrol gerekli satırlar, yüksek/orta/düşük güven, eski değeri sıfırlanacak satırlar ve öğrenmeye aday satırlar filtrelenebilir.
- Arama; parça açıklaması, DVN grubu, parça kodu, işçilik türü ve karar gerekçesi üstünde çalışır.
- Üst özet kartları toplam satır, değişecek satır, kontrol gerekli satır, güven dağılımı, sıfırlanacak H-N hücresi ve öğrenmeye aday karar sayısını gösterir.
- Uzun karar gerekçeleri varsayılan kapalı gelir; kullanıcı gerektiğinde satır detayını açar.
- Büyük tablolarda yalnızca aktif sayfa render edilir. Sayfa başına 25, 50 veya 100 satır seçilebilir.

## Son Onay ve Kaydetme Raporu

Kaydet düğmesi doğrudan Excel'e yazmaz. Önce son onay modalı açılır ve şu bilgiler gösterilir:

- kaç satır işlenecek,
- kaç satır değişecek,
- kaç satır kontrol gerekli veya düşük güvenli,
- kaç satır kullanıcı tarafından düzeltildi,
- kaç öğrenme kaydı oluşacak,
- kaç eski H-N hücresi sıfırlanacak,
- formüllü hücre uyarısı,
- çıktı ve yedek dosya yolları.

Kaydetme tamamlanınca sonuç raporu çıktı/yedek yolu, kategori toplamları, kullanıcı düzeltmesi, öğrenme kaydı, uyarı/hata ve kısmi yazma şüphesini açıkça gösterir. Hata durumunda işlem başarılı gösterilmez.

## Öğrenme Sözlüğü

Öğrenme yalnızca kullanıcı kararıyla yapılır:

1. AI önizleme oluşturur.
2. Kullanıcı satırı inceler.
3. Kullanıcı satırı onaylar veya elle düzeltir.
4. Sadece onaylanan/düzeltilen karar öğrenme sözlüğüne kaydedilir.

Öğrenme kaydı şu bilgileri saklar:

- normalize parça adı,
- parça kodu,
- işçilik kategorisi,
- kullanıcı karar gerekçesi,
- tarih,
- varsa tutar dağılımı.

Mevcut H-N değerleri otomatik eğitim verisi değildir. Portal Excel'de gelişigüzel doldurulmuş işçilik kolonları öğrenme sözlüğüne yazılmaz.

## Karar Mantığı

| Örnek açıklama | Beklenen kategori |
| --- | --- |
| Tampon, kaput, çamurluk, kapı, panel, marşpiyel, travers, sac, şase | Kaporta |
| Boyanacak dış gövde parçaları | Boya |
| Motor, şanzıman, radyatör, turbo, alternatör, şarj dinamosu, klima kompresörü, egzoz, yürür aksam, süspansiyon | Mekanik |
| Far, stop, sensör, kamera, radar, beyin, sigorta kutusu, tesisat, kablo, soket, elektronik modül | Elektrik |
| Ön cam, arka cam, kapı camı, kelebek camı, cam fitili, cam krikosu | Cam |
| Koltuk, döşeme, tavan döşemesi, emniyet kemeri, airbag, torpido, iç trim, kilit | Döşeme-Kilit |
| Özel onarım satırları | Onarım |

## Güvenlik Kuralları

- Motor/mekanik parçaya rastgele Cam yazılmaz.
- Cam parçasına mekanik yazılmaz.
- Elektrik parçasına varsayılan Kaporta yazılmaz.
- `Çamurluk` kelimesi `cam` içeriyor diye Cam sayılmaz.
- `Çamurluk davlumbazı` Kaporta olarak önerilir; boya gerekliliği net değilse Kontrol gerekli işaretlenir.
- Motor elektrik tesisatı Elektrik olarak değerlendirilir.
- Motor kaputu Kaporta ve gerekiyorsa Boya olarak değerlendirilir.
- Far, stop, radar, kamera ve sensör satırları Elektrik önceliklidir.

## Kullanım Akışı

1. Excel & Parça Veri Merkezi ekranına gidin.
2. **AI İşçilik Dağıtıcı** ile portal Excel dosyasını seçin.
3. Önizleme tablosunda her satırı inceleyin.
4. Kontrol gerekli satırları düzeltin.
5. Onaylanan veya düzeltilen satırları kaydedin.
6. Çıktı dosyası için yeni bir `.xlsx` yolu seçin.
7. Raporlanan değişen satırları kontrol edin.

## Ne Yapılmaz?

- A sütunu parça adı kabul edilmez.
- H-N mevcut değerleri otomatik eğitim verisi yapılmaz.
- Tüm satırlara varsayılan Kaporta yazılmaz.
- Düşük güvenli satırlar boş bırakılmaz.
- Kullanıcı onayı olmadan Excel'e yazılmaz.
