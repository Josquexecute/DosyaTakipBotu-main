# Canlı Kullanım Kılavuzu

Bu kısa rehber HasarBotu v0.4.12'nin canlı ofis kullanımında izlenecek günlük akışı özetler. Detaylı anlatım için [KULLANIM_KILAVUZU.md](KULLANIM_KILAVUZU.md) kullanılır.

## Günlük Başlangıç

1. Uygulamayı açın ve doğru kök klasörün seçili olduğunu kontrol edin.
2. Dashboard üzerindeki açık dosya, eksik evrak, eksik fotoğraf, portal bekleyen ve veri kalitesi özetlerini inceleyin.
3. Dosyalar ekranında Bendeki, Geciken, Bugün, Bu Hafta, Sahipsiz, Durgun ve Veri Kalitesi filtrelerini kullanın.
4. Sorunlar / Risk panelindeki pCloud, corrupt JSON ve revision/writeId uyarılarını kapatmadan kritik dosyalarda işlem yapmayın.

## Dosya İşleme

- Not ve görevler dosya detayından güncellenir.
- Sorumlu, takip tarihi ve son işlem bilgisi dosya bazında tutulur.
- Tek dosya yenileme seçili dosyayı hızlı günceller.
- Evrak & Fotoğraf ekranında eksik belge, fotoğraf ve format uyarıları kontrol edilir.

## Excel ve AI Kullanımı

- Portal Excel'leri önce önizlemeye alınır.
- AI İşçilik Dağıtıcı kullanıcı onayı olmadan yazmaz.
- Mevcut H-N değerleri otomatik doğru kabul edilmez.
- Yanlış plakalı veya farklı dosyaya ait fotoğraf AI'a gönderilmez; işlem hard-block ile durur.
- Gemini API anahtarı gerekiyorsa yalnızca yerel ayara girilir.

## Gün Sonu

- Açık görevler ve geciken takipler kontrol edilir.
- Sorunlar / Risk panelindeki kritik uyarılar notlanır.
- Gerekirse filtrelenmiş dosya listesi Excel olarak dışa aktarılır.
