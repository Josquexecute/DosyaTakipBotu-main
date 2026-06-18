# HasarBotu - DosyaTakipBotu

[![Sürüm](https://img.shields.io/badge/sürüm-v0.4.12-1f6feb)](#v0412-yenilikleri)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-2563eb)](#windows-exe-üretimi)
[![Electron](https://img.shields.io/badge/Electron-41-47848f)](#sistem-mimarisi-kısa-özeti)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6)](#geliştirme-komutları)
[![Lisans](https://img.shields.io/badge/lisans-UNLICENSED-lightgrey)](#lisans--kurum-içi-kullanım-notu)

Baran Global Ekspertiz için geliştirilen **sigorta eksper dosya takip otomasyonu**. Hasar dosyalarını klasör yapısı üzerinden tarar, her dosyanın durumunu local-first şekilde yönetir, evrak/fotoğraf risklerini görünür kılar, Excel işçilik süreçlerini güvenli önizleme ile çalıştırır ve çok bilgisayarlı ofis kullanımında veri ezilmesini engellemeye odaklanır.

> Güncel sürüm: **v0.4.12**  
> Hedef kullanım: Baran Global Ekspertiz kurum içi Windows masaüstü operasyonu

## Öne Çıkan Özellikler

| Alan | Yetenek |
| --- | --- |
| Dosya takip | Yıl/ay/dosya klasörlerini tarar; dosya durumu, sorumlu, takip tarihi, not, görev ve audit bilgisini yönetir. |
| Local-first veri | Her dosyanın otoritatif kaydı kendi `_HASARBOTU/takip.json` dosyasıdır. AppData cache yalnızca hız ve ekran deneyimi içindir. |
| Dashboard | Açık/kapalı dosyalar, eksik evrak, eksik fotoğraf, portal bekleyen işler, geciken takipler, veri kalitesi ve risk göstergeleri. |
| Sorunlar paneli | Bozuk takip dosyası, pCloud conflicted copy, revision/writeId uyuşmazlığı, eksik evrak/fotoğraf ve plaka uyuşmazlığı gibi riskleri öne çıkarır. |
| Tek dosya yenileme | Seçili dosyayı tam yıl taraması yapmadan yeniler; gereksiz pCloud okumasını azaltır. |
| Evrak ve fotoğraf kontrolü | Trafik/kasko evrak gereksinimleri, KM/Vites/Şase/Olay Yeri fotoğraf kontrolleri, HEIC/RAW format ayrımı ve bozuk fotoğraf şüphesi. |
| Yanlış plaka hard-block | Parça listesi fotoğrafı aktif dosyaya ait değilse Gemini'ye gönderilmez; aynı plaka ama farklı dosya klasörü de engellenir. |
| Excel araçları | Portal Excel işçilik dağıtımı, filtrelenmiş dosya listesi export, parça + işçilik Excel üretimi. |
| AI İşçilik Dağıtıcı | Gerçek portal Excel kolonlarına göre H-N işçilik önerisi üretir; önizleme, kullanıcı düzeltmesi, kontrollü öğrenme ve ayrı çıktı dosyası akışı kullanır. |
| Öğrenen sözlük | Kullanıcı onaylı/düzeltilmiş kararlar yerel sözlüğe alınır; mevcut H-N değerleri otomatik eğitim verisi kabul edilmez. |

## v0.4.12 Yenilikleri

- AI İşçilik Dağıtıcı gerçek portal Excel kolon yapısına göre sabitlendi.
- Parça adı artık A sütunundan değil, **C sütunundaki açıklamadan** okunur.
- B sütunu DVN/parça grubu destek bilgisi, D sütunu parça kodu olarak kullanılır.
- H-N kolonlarındaki mevcut değerler otomatik öğrenme verisi yapılmaz.
- Her satıra öneri verilir; düşük güvenli satırlar boş bırakılmaz, **Kontrol gerekli** olarak işaretlenir.
- Cam/çamurluk, motor/mekanik, elektrik ve kaporta sınıflandırmaları için güvenlik kuralları güçlendirildi.
- Önizleme olmadan yazma ve kullanıcı onayı olmadan kaydetme akışı kapalı tutulur.

## Sistem Mimarisi Kısa Özeti

HasarBotu bir Electron masaüstü uygulamasıdır. Ana süreç dosya sistemi, Excel, PDF/OCR, local cache ve güvenli IPC işlemlerini yönetir; renderer tarafı yalnızca güvenli preload köprüsü üzerinden konuşur.

```text
src/
  main/        Electron ana süreç, IPC servisleri, tarama, Excel/PDF/fotoğraf analizi
  preload/     Güvenli contextBridge API katmanı
  renderer/    Vanilla TypeScript arayüz bileşenleri
  shared/      Ortak tipler, kurallar, workflow sabitleri, veri kalite yardımcıları
scripts/       Build, audit, release, Windows ve saha kabul komutları
docs/          Kullanım, kurulum, mimari, veri güvenliği ve operasyon rehberleri
```

Veri modeli local-first çalışır:

```text
Dosya klasörü
  _HASARBOTU/
    takip.json     # source of truth

AppData/HasarBotu
  local-cache/     # yeniden üretilebilir cache ve öğrenen sözlük
```

## Ekran ve Operasyon Akışı

1. **Ana Sayfa / Dashboard:** Günlük iş masası, risk göstergeleri ve kritik özetler izlenir.
2. **Dosyalar:** Plaka, dosya no, sorumlu, servis, durum ve kalite filtreleriyle operasyon listesi yönetilir.
3. **Dosya Detayı:** Evrak, fotoğraf, rücu/KTT/ağır hasar, not, görev ve işçilik bilgileri tek dosyada güncellenir.
4. **Excel & Parça Veri Merkezi:** Portal Excel dağıtımı, AI işçilik önizlemesi ve parça listesi fotoğraf okuma akışları çalıştırılır.
5. **Sorunlar / Risk:** pCloud çakışması, corrupt JSON, plaka uyuşmazlığı, eksik evrak/fotoğraf ve kalite uyarıları incelenir.

Detaylı kullanım için: [docs/KULLANIM_KILAVUZU.md](docs/KULLANIM_KILAVUZU.md)

## Kurulum

Gereksinimler:

- Windows 10/11 x64
- Node.js 20+
- npm

```bash
npm install
npm run fix:electron
npm run typecheck
npm run build
npm start
```

Detaylı kurulum ve güncelleme akışı: [docs/KURULUM_VE_GUNCELLEME.md](docs/KURULUM_VE_GUNCELLEME.md)

## Geliştirme Komutları

| Komut | Açıklama |
| --- | --- |
| `npm run typecheck` | Main, preload ve renderer TypeScript tip kontrolü. |
| `npm run build` | Temiz build üretir: `dist-electron/` ve `dist-ui/`. |
| `npm start` | Build sonrası Electron uygulamasını açar. |
| `npm run test:behavior` | Davranış regresyon testlerini çalıştırır. |
| `npm run ci` | Verify, smoke, audit, typecheck, build, davranış testleri ve final office audit zinciri. |
| `npm run final-office-audit` | Ofis dağıtım ve üretim davranışı final denetimi. |
| `npm audit` | npm güvenlik denetimi. |

## Test ve Kalite Kontrolleri

Release öncesi beklenen temel kapı:

```bash
npm run typecheck
npm run build
npm run ci
npm run test:behavior
npm run final-office-audit
npm audit
```

Saha/Windows akışları için ek komutlar:

```bash
npm run live:preflight
npm run live:backup-tracking
npm run release:candidate-check
```

Kalite stratejisi ve davranış kapsamı için: [docs/TEKNIK_MIMARI.md](docs/TEKNIK_MIMARI.md)

## Windows EXE Üretimi

```bash
npm run dist:win
```

Çıktılar `release/` klasöründe üretilir:

- `HasarBotu-Baran-Ekspertiz-Kurulum-v0.4.12-x64.exe`
- `HasarBotu-Baran-Ekspertiz-Tasinabilir-v0.4.12-x64.exe`

EXE rehberi: [docs/EXE_URETIM_REHBERI.md](docs/EXE_URETIM_REHBERI.md)

## Release Kontrol Akışı

```bash
npm run release:hash
npm run release:notes
npm run release:dry-run
npm run release:candidate-check
```

Ofis dağıtım checklist'i: [docs/OFIS_DAGITIM_KONTROL_LISTESI.md](docs/OFIS_DAGITIM_KONTROL_LISTESI.md)  
Geri dönüş planı: [docs/GERI_DONUS_PLANI.md](docs/GERI_DONUS_PLANI.md)

## Veri Güvenliği Notları

- `_HASARBOTU/takip.json` source of truth olarak korunur.
- Yazmalar atomic write, revision ve writeId kontrolleriyle yapılır.
- Bozuk JSON rename edilip kaybedilmez; ana dosya korunur ve kurtarma kopyası alınır.
- pCloud conflicted copy ve same-revision different-write durumları risk olarak raporlanır.
- Yanlış plakalı veya farklı dosyaya ait fotoğrafta parça okuma hard-block ile durdurulur.
- Gemini API anahtarı kaynak koda veya pCloud'a yazılmaz; yerel ayarda saklanır.

Detay: [docs/VERI_GUVENLIGI.md](docs/VERI_GUVENLIGI.md)

## Excel / AI İşçilik Dağıtıcı Kullanımı

AI İşçilik Dağıtıcı, portal Excel'inde:

- A sütununu sıra no kabul eder.
- B sütununu DVN/parça grubu destek bilgisi kabul eder.
- C sütununu ana parça/işçilik açıklaması kabul eder.
- D sütununu parça kodu kabul eder.
- H-N sütunlarını işçilik kategorileri olarak işler.

Uygulama önce önizleme üretir. Kullanıcı satırları inceler, gerekirse düzeltir ve onaylar. Sadece onaylı/düzeltilmiş kararlar öğrenme sözlüğüne yazılır. Detaylı rehber: [docs/EXCEL_AI_ISCILIK_DAGITICI.md](docs/EXCEL_AI_ISCILIK_DAGITICI.md)

## Sık Sorunlar ve Çözüm

| Sorun | İlk kontrol |
| --- | --- |
| Electron açılmıyor | `npm run fix:electron` ve ardından `npm run build` çalıştırın. |
| Excel kaydetmiyor | Önizleme oluştu mu, çıktı yolu giriş dosyasından farklı mı kontrol edin. |
| pCloud çakışma uyarısı | Sorunlar panelindeki dosyayı inceleyin; gerekirse Disk Baseline Kabul akışını uygulayın. |
| Fotoğraf AI'a gitmiyor | Aktif dosya ve seçilen fotoğraf klasörü aynı dosyaya mı ait kontrol edin. |
| Eksik evrak/fotoğraf şişkin görünüyor | HEIC/RAW format uyarısı ile gerçek eksik fotoğraf uyarısını ayrı değerlendirin. |

Detay: [docs/SORUN_GIDERME.md](docs/SORUN_GIDERME.md)

## Yol Haritası

- Saha kullanımından gelen yanlış pozitif risk uyarılarını azaltmak.
- AI işçilik öğrenme sözlüğü için yönetim ekranını daha görünür hale getirmek.
- Excel önizleme raporlarını ofis içi denetim çıktısı olarak zenginleştirmek.
- Dokümantasyon ve release notlarını her üretim adayıyla birlikte güncel tutmak.

## Lisans / Kurum İçi Kullanım Notu

Bu proje **UNLICENSED** ve **private** olarak tutulur. Baran Global Ekspertiz kurum içi operasyonu için hazırlanmıştır; üçüncü taraflara dağıtım, kaynak paylaşımı veya ticari yeniden kullanım ayrıca yetkilendirme gerektirir.

Dokümantasyon merkezi: [docs/README.md](docs/README.md)
