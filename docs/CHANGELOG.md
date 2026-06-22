# Changelog

Bu doküman HasarBotu v0.6.0 için kullanıcı ve operasyon odaklı güncel değişiklik özetidir. Ayrıntılı teknik geçmiş gerekiyorsa kök `CHANGELOG.md` arşiv olarak ayrıca incelenebilir.

## v0.6.0

### Sürüm damgası hizalaması (hotfix)

- Kaynak kod v0.6.0 seviyesindeyken `package.json`, `package-lock.json` ve `APP_VERSION` `0.5.0` gösteriyordu; bu, ofis dağıtım/güncellik kontrolünü yanlış etkileyebiliyordu.
- Runtime sürümü, paket sürümü, final office audit sürüm kapısı ve kullanıcıya görünen doküman damgaları `v0.6.0` ile hizalandı.
- Davranış değişmedi: `takip.json` source of truth, atomic write, revision/writeId, Excel, AppData, Bilgi Bankası, AI Queue, Gemini ve OCR tarafına dokunulmadı; yeni özellik/refactor yapılmadı.

## v0.5.0

### AI İşçilik Dağıtıcı

- Karar motoru v2 seviyesine çıkarıldı: pozitif evidence, negatif kurallar, çakışma çözümü ve açıklanabilir gerekçe üretimi güçlendirildi.
- Gerçek portal Excel kolon yapısı korunur: A sıra no, B DVN/parça grubu, C ana açıklama, D parça kodu, H-N işçilik kolonlarıdır.
- Motor/mekanik parçaya Cam, cam parçasına Mekanik, elektrik parçasına gelişigüzel Kaporta yazılmaması için regresyon testleri genişletildi.
- Önizleme ekranına filtreler, arama, özet kartları, satır düzeltme alanları, öğrenmeye aday bilgisi, formül uyarısı ve son onay modalı eklendi.
- Büyük Excel dosyalarında aktif sayfa render modeli, sayfa boyutu seçimi ve uzun gerekçelerin varsayılan kapalı gösterimiyle donma riski azaltıldı.
- Kaydetme sonrası rapor; çıktı/yedek yolu, değişen satır, kontrol gerekli satır, kullanıcı düzeltmesi, öğrenme kaydı, kategori toplamı, uyarı/hata ve kısmi yazma şüphesini gösterir.

### Ağır Hasar AI Ön Değerlendirme

- `34 PME 968 / 49/18303851` gerçek dosya senaryosu fixture olarak eklendi.
- Ekonomik `%60` eşik ile yapısal kritik parça eşiği ayrı hesaplanır ve ayrı raporlanır.
- `Ön Göğüs` yalnızca eksper teyidiyle yapısal ön göğüs sacı/firewall kabul edilir; teyitsizse 40 puan verilmez ve kontrol gerekli işaretlenir.
- Airbag/emniyet kemeri ve elektrik/elektronik gruplarında mükerrer puan şişmesi engellendi.
- Rapor notu ve kurumsal mail taslağı üretimi eklendi.

### Veri Güvenliği ve Release

- `takip.json` source of truth, atomic write, revision/writeId, corrupt JSON ve pCloud conflicted copy korumaları aynı şekilde korunur.
- Yanlış plaka fotoğraf seçimindeki hard-block davranışı değiştirilmedi.
- Kurulum, EXE üretimi, release, ofis dağıtım, canlı geçiş ve geri dönüş dokümanları v0.5.0’a göre güncellendi.
- `package.json`, `package-lock.json`, `APP_VERSION`, final office audit hedefi ve ofis hedef sürüm örnekleri v0.5.0’a çekildi.
