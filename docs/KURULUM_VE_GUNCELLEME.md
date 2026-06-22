# Kurulum ve Güncelleme

Bu rehber HasarBotu v0.6.0 kaynak kodunu geliştirme ortamında çalıştırmak, kalite kontrollerini tamamlamak ve Windows EXE üretimine hazırlamak için kullanılır.

## Gereksinimler

| Gereksinim | Açıklama |
| --- | --- |
| Windows 10/11 x64 | Hedef masaüstü platformu |
| Node.js 20+ | Build ve geliştirme komutları için |
| npm | Paket yönetimi |
| PowerShell | Windows yardımcı scriptleri için |

## İlk Kurulum

```bash
npm install
npm run fix:electron
npm run typecheck
npm run build
npm start
```

`npm run fix:electron`, Electron ikilisinin Windows ortamında doğru indirildiğini ve `path.txt` kaydının düzgün olduğunu kontrol eder.

## Güncelleme Akışı

1. Yeni kaynak kod alınır.
2. Bağımlılıklar güncellenir:

```bash
npm install
```

3. Electron ikilisi kontrol edilir:

```bash
npm run fix:electron
```

4. Kalite kapıları çalıştırılır:

```bash
npm run typecheck
npm run build
npm run ci
```

5. Windows dağıtımı yapılacaksa EXE üretilir:

```bash
npm run dist:win
```

## Komut Referansı

| Komut | Ne yapar |
| --- | --- |
| `npm run fix:electron` | Electron Windows ikilisini kontrol eder ve gerekirse onarır. |
| `npm run typecheck` | Main, preload ve renderer TypeScript projelerini denetler. |
| `npm run build` | Temiz derleme üretir. |
| `npm run ci` | Verify, smoke, audit, typecheck, build, davranış testi ve final audit zincirini çalıştırır. |
| `npm run dist:win` | NSIS kurulum ve taşınabilir Windows EXE üretir. |
| `npm run release:hash` | Release EXE dosyaları için SHA-256 çıktıları üretir. |
| `npm run release:notes` | Release notlarını hash bilgileriyle hazırlar. |
| `npm run release:dry-run` | GitHub release öncesi kuru prova yapar. |
| `npm run release:candidate-check` | Üretim adayı saha kabul raporu üretir. |

## Canlı Ortam Ön Kontrolü

Canlı klasörlerde işlem öncesi salt-okunur kontrol:

```bash
npm run live:preflight
```

Takip dosyalarını yedeklemek için:

```bash
npm run live:backup-tracking
```

## Güncelleme Güvenlik Notları

- `_HASARBOTU/takip.json` dosyaları elle silinmez.
- AppData local-cache silinebilir; yeniden üretilebilir.
- pCloud conflicted copy veya revision/writeId uyarısı görülürse otomatik ezme yapılmaz.
- Ofise dağıtılacak EXE öncesi [OFIS_DAGITIM_KONTROL_LISTESI.md](OFIS_DAGITIM_KONTROL_LISTESI.md) tamamlanır.
