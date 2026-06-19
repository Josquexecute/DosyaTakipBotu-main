# Geri Dönüş Planı

Bu plan HasarBotu v0.5.0 canlı kullanımında kritik sorun görülürse veri kaybı oluşturmadan önceki stabil duruma dönmek için kullanılır.

## Tetikleyiciler

- Uygulama açılmıyor veya dosya listesi yüklenmiyor.
- Birden fazla dosyada corrupt JSON uyarısı görülüyor.
- pCloud conflicted copy, same-revision different-write veya revision regression uyarıları yaygınlaşıyor.
- Excel/AI işçilik dağıtımı beklenmeyen çıktı üretiyor.
- Ofis bilgisayarlarında farklı sürümler aynı anda kullanılıyor.

## Temel İlke

`_HASARBOTU/takip.json` ana veridir ve elle silinmez, taşınmaz veya üzerine yazılmaz. AppData local-cache otoritatif değildir; gerektiğinde yeniden üretilebilir.

## Acil Durdurma

1. Tüm kullanıcılara HasarBotu'nu kapattırın.
2. Aktif dosya klasörlerinde manuel `takip.json` düzenlemesi yapmayın.
3. Sorun görülen bilgisayar, sürüm, saat ve dosya klasörünü not alın.
4. Mümkünse `npm run pilot:collect` ile tanı paketi alın.

## Önceki Sürüme Dönüş

1. Sorunlu EXE kaldırılır veya kullanılmaz hale getirilir.
2. Önceki stabil kurulum veya taşınabilir EXE açılır.
3. Aktif kök klasör değiştirilmez.
4. Dosya listesi yeniden taratılır.
5. Birkaç dosyada not/görev ekleme testi yapılır.

## Disk Baseline Kabul

Bir dosyada aynı revizyonda farklı writeId veya revision regression uyarısı varsa uygulama diskteki veriyi sessizce ezmez.

Gerekli durumda **Disk Baseline Kabul** uygulanır: diskteki güncel `takip.json` doğru kabul edilir ve uygulamanın yerel **local write-index baseline** kaydı bu revision/writeId değeriyle yeniden hizalanır. Bu işlem eski cache bilgisinin canlı disk verisinin üzerine yazılmasını engeller.

Bu adım yalnızca ilgili dosyada disk içeriği incelendikten sonra uygulanmalıdır.

## Local Cache Sıfırlama

AppData içindeki local-cache bozulduysa:

- Uygulama kapatılır.
- Yalnızca local-cache temizlenir.
- Uygulama tekrar açılarak klasör yapısı yeniden taratılır.

Bu işlem `_HASARBOTU/takip.json` dosyalarını değiştirmez.

## Excel / AI İşçilik Geri Dönüşü

- Orijinal portal Excel üzerine doğrudan yazma yapılmaz.
- AI İşçilik Dağıtıcı çıktı dosyası ayrı kaydedilir.
- Hatalı çıktı görüldüyse çıktı dosyası kullanılmaz; orijinal Excel yeniden önizlemeye alınır.
- Yanlış öğrenme şüphesi varsa öğrenme sözlüğü kaydı teknik sorumlu tarafından düzeltilir veya silinir.

## Başarılı Geri Dönüş Kriterleri

- Uygulama açılıyor.
- Dosya listesi yükleniyor.
- Yeni not/görev kaydı revision artırıyor.
- pCloud/revision uyarıları açıklanmış veya kapanmış durumda.
- Ofis bilgisayarları aynı stabil sürümde.
