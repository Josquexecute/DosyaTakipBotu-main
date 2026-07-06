# Teslim Raporu Şablonu (Delivery Report Template)

1. **Değişen dosyalar** — yeni/değişen dosyalar + satır sayıları.
2. **Ne yapıldı (implementation summary)** — akışın uçtan uca özeti.
3. **Bilinçli olarak yapılmayanlar** — kapsam dışı bırakılanlar ve nedeni.
4. **Güvenlik korumaları (safety statement)** — gate'ler, onay modalları, guard'lar.
5. **IPC** — invoke/event sayısı değişimi (örn. 86/3 sabit veya 86→87).
6. **takip.json yazım durumu** — var mı; varsa hangi alan, hangi onayla.
7. **Excel yazım durumu** — var mı; varsa hangi hücre/dosya, hangi onayla.
8. **Web/API durumu** — harici istek/scraping/mail var mı (beklenen: YOK).
9. **Testler** — typecheck/build/test:behavior (kontrol sayısı önce→sonra)/ci/
   final-office-audit (kontrol sayısı)/npm audit sonuçları.
10. **Riskler** — kalan riskler ve telafileri.
11. **Sonraki adım** — önerilen devam görevleri.

> Rapor Türkçe yazılır. Sonuç cümlesi görevin runtime davranışını değiştirip
> değiştirmediğini açıkça söyler.
