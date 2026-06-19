# Ofis Dağıtım Kontrol Listesi

Bu kontrol listesi HasarBotu v0.5.0'nin Baran Global Ekspertiz ofis bilgisayarlarına güvenli ve tutarlı şekilde dağıtılması için kullanılır.

## 1. Sürüm Hazırlığı

- [ ] `package.json`, `package-lock.json` ve `APP_VERSION` v0.5.0 ile uyumlu.
- [ ] `npm run typecheck` geçti.
- [ ] `npm run build` geçti.
- [ ] `npm run ci` geçti.
- [ ] `npm run final-office-audit` geçti.
- [ ] `npm audit` temiz.

## 2. Release Çıktıları

- [ ] `npm run dist:win` ile kurulum ve taşınabilir EXE üretildi.
- [ ] `npm run release:hash` ile SHA-256 dosyaları üretildi.
- [ ] `npm run release:notes` ile release notu üretildi.
- [ ] `npm run release:dry-run` kuru prova tamamlandı.
- [ ] `npm run release:candidate-check` raporu incelendi.

## 3. Ofis Sürüm Hizalaması

Ofis hedef sürümü v0.5.0 olarak kaydedin:

```powershell
npm run live:version-check -- -RootPath "D:\BARAN_GLOBAL_EKSPERTIZ\2026" -ExpectedVersion 0.5.0 -SetExpected -RegisterThisPC
```

- [ ] Her bilgisayar "Bu PC'yi Kaydet" akışıyla kayıt altına alındı.
- [ ] Ayarlar ekranındaki "Sürüm ve Kurulum Kontrolü" tüm bilgisayarlarda aynı sürümü gösteriyor.
- [ ] Eski EXE kısayolları kaldırıldı veya devre dışı bırakıldı.

## 4. Veri Güvenliği

- [ ] `_HASARBOTU/takip.json` dosyalarının source of truth olduğu ekibe anlatıldı.
- [ ] `_HASARBOTU` klasörleri elle silinmeyecek.
- [ ] pCloud conflicted copy uyarılarının Sorunlar panelinde izleneceği biliniyor.
- [ ] Canlı klasörde `npm run live:preflight` raporu incelendi.
- [ ] Dağıtım öncesi `npm run live:backup-tracking` ile takip yedeği alınabiliyor.

## 5. Excel / AI İşçilik

- [ ] Kullanıcılar AI İşçilik Dağıtıcı'nın önce önizleme ürettiğini biliyor.
- [ ] Filtre, arama, güven seviyesi, kontrol gerekli ve değişen satır filtreleri örnek Excel üzerinde denendi.
- [ ] Mevcut H-N kolonlarının otomatik eğitim verisi kabul edilmediği anlatıldı.
- [ ] Düşük güvenli satırlarda "Kontrol gerekli" işaretinin inceleneceği anlatıldı.
- [ ] Kaydetmeden önce son onay modalı ve kaydetme sonrası rapor akışı görüldü.
- [ ] Büyük Excel dosyalarında sayfalama ve kapalı gerekçe davranışı kontrol edildi.
- [ ] Yanlış plakalı fotoğraf seçiminde hard-block davranışı test edildi.
- [ ] Gemini API anahtarı gerekiyorsa yalnızca yerel ayara girildi.

## 6. Ağır Hasar AI

- [ ] Ekonomik `%60` eşik ve yapısal kritik parça eşiğinin ayrı gösterildiği doğrulandı.
- [ ] `Ön Göğüs` satırında yapısal sac/firewall teyidi olmadan 40 puan verilmediği doğrulandı.
- [ ] Yapısal teyit verildiğinde rapor notu ve mail taslağı üretildiği görüldü.
- [ ] Airbag/emniyet ve elektrik/elektronik gruplarında mükerrer puan şişmesi olmadığı test edildi.

## 7. Kabul

- [ ] En az bir açık dosyada not/görev ekleme testi yapıldı.
- [ ] Tek dosya yenileme çalıştı.
- [ ] Filtrelenmiş dosya listesi Excel export çalıştı.
- [ ] Portal Excel işçilik önizleme ve ayrı çıktı kaydetme akışı test edildi.
- [ ] Geri dönüş planı ve önceki stabil EXE hazır.
