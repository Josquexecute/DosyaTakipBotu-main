# Canlı Kullanım Kılavuzu

Günlük çalışmada HasarBotu'nun güvenli kullanımı.

## Başlarken
1. İlk açılışta **Ayarlar → Ana Klasör Seç** ile aktif kök (yerel) klasörü seçin (genelde `...\BARAN GLOBAL EKSPERTIZ\2026`).
2. **Aktif kullanıcı**yı seçin. Tema/yakınlaştırma isteğe bağlıdır.
3. (Opsiyonel) AI parça okuma için **Gemini API anahtarı**nı girin.

## Günlük akış
1. **Yeniden Tara** (veya F5) ile dosyaları güncelleyin.
2. **Ana Sayfa**dan ilgili bölüme geçin; **Dosyalar** ekranında hızlı filtrelerle (Bendeki, Geciken, Bugün, Sahipsiz, Durgun, Veri Kalitesi) günün işini önceliklendirin.
3. **Operasyon**: sorumlu/durum/öncelik atayın, görev ve not ekleyin.
4. **Evrak & Fotoğraf**: eksikleri kontrol edin.
5. **Excel Araçları**: işçilik dağıtın veya parça listesi fotoğrafını okutup işçiliğe aktarın.

## Önemli kurallar
- Ana veri kaynağı her dosyanın `_HASARBOTU/takip.json` dosyasıdır. Bu klasörü elle silmeyin/taşımayın.
- Çakışma uyarısı çıkarsa **veriyi ezmeyin**; "Güvenli Birleştir" veya "Diskteki Sürüm" seçeneklerini kullanın.
- Tüm ofis bilgisayarları aynı EXE sürümünde olmalıdır.
- Orijinal portal Excel'leri değiştirilmez; dağıtım yeni bir `.xlsx` olarak kaydedilir.

## Sorun olursa
- Tanı paketi: `npm run pilot:collect` (geliştirici/kurulum için).
- Geri dönüş gerekiyorsa [GERI_DONUS_PLANI.md](GERI_DONUS_PLANI.md) uygulanır.
