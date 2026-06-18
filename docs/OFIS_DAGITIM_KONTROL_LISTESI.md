# Ofis Dağıtım Kontrol Listesi

Tüm ofis bilgisayarlarının **aynı ve doğru** sürümde, güvenli şekilde kurulduğunu garanti eder.

## Sürüm hizalama
- [ ] Yayınlanacak sürüm belirlendi (ör. v0.4.5) ve `package.json`, `APP_VERSION`, `package-lock.json` aynı.
- [ ] Ofis hedef sürümü kaydı oluşturuldu:
  `npm run live:version-check -- -RootPath "D:\BARAN_GLOBAL_EKSPERTIZ\2026" -ExpectedVersion 0.4.5 -SetExpected -RegisterThisPC`
- [ ] Her bilgisayar **"Bu PC'yi Kaydet"** ile ofis listesine eklendi.
- [ ] Ayarlar → "Sürüm ve Kurulum Kontrolü" tüm PC'lerde aynı sürümü gösteriyor (birden çok sürüm uyarısı yok).

## Kurulum (her bilgisayar)
- [ ] NSIS kurulum veya taşınabilir EXE çalıştırıldı.
- [ ] Gerekirse `npm run fix:electron` ile Electron ikilisi onarıldı (geliştirme kurulumunda).
- [ ] İlk açılışta aktif kök klasör doğru seçildi.

## Güvenlik / veri
- [ ] Aktif kök yerel klasör (pCloud yalnızca yedek/arşiv).
- [ ] `_HASARBOTU` klasörleri elle silinmeyecek şekilde kullanıcı bilgilendirildi.
- [ ] (Opsiyonel) Her PC'de Gemini API anahtarı yalnızca yerel ayara girildi.

## Doğrulama
- [ ] `npm run live:preflight` raporu temiz.
- [ ] Birkaç dosyada not/görev testi başarılı.
