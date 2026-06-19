# Teknik Mimari

HasarBotu v0.5.0 Electron, TypeScript ve local-first dosya sistemi yaklaşımıyla geliştirilmiş bir masaüstü uygulamasıdır.

## Katmanlar

```text
src/main
  Electron ana süreç
  IPC handler'ları
  Dosya tarama, tracking, Excel, PDF, fotoğraf ve AI servisleri

src/preload
  contextBridge ile izinli API yüzeyi

src/renderer
  Vanilla TypeScript UI bileşenleri
  Dashboard, dosyalar, detay, ayarlar, klasörler

src/shared
  Ortak tipler
  Workflow sabitleri
  Veri kalite kuralları
  İşçilik sınıflandırma kuralları
  Ağır hasar ön değerlendirme kuralları
```

## Veri Akışı

1. Scanner klasörleri okur ve dosya kimliğini çıkarır.
2. Tracking servisi `_HASARBOTU/takip.json` durumunu okur.
3. Evrak, fotoğraf, pCloud conflict ve kalite analizleri dosya indeksine eklenir.
4. Renderer güvenli IPC üzerinden liste ve dashboard verisini alır.
5. Kullanıcı mutasyonu main process içinde revision/writeId kontrolüyle diske yazılır.

## Tracking Modeli

`takip.json` her dosyanın source of truth kaydıdır. AppData cache bu kaydın yerine geçmez.

Güvenlik mekanizmaları:

- atomic write,
- file lock,
- optimistic concurrency,
- revision,
- writeId,
- corrupt JSON kopya-yedek,
- pCloud conflicted copy algılama,
- local write-index baseline.

## Renderer Güvenliği

Renderer doğrudan `fs`, `path`, `electron`, `os` veya `child_process` kullanmaz. Dosya sistemi erişimi yalnızca preload üzerinden izinli IPC kanallarıyla yapılır.

Electron güvenlik ilkeleri:

- contextIsolation açık,
- nodeIntegration kapalı,
- sandbox açık,
- webSecurity açık,
- Content Security Policy tanımlı.

## Excel ve AI Servisleri

Excel işlemleri main process içindedir. AI İşçilik Dağıtıcı:

- portal kolonlarını başlık ve sabit düzen bilgisiyle okur,
- A sütununu parça adı kabul etmez,
- C açıklamasını ana karar kaynağı yapar,
- B grup ve D kod bilgisini destek olarak kullanır,
- H-N kategori kolonlarını önizleme ile doldurur,
- kullanıcı onayından sonra ayrı dosyaya yazar.

Parça listesi fotoğraf okuma Gemini API kullanabilir. Yanlış plaka veya farklı dosya klasörü tespit edilirse görsel gönderilmez.

## Ağır Hasar AI Servisi

Ağır Hasar AI Ön Değerlendirme, `src/shared/heavy-damage-rules.ts` ve ilgili main/renderer bileşenleriyle çalışır.

- Ekonomik eşik `%60` hasar/rayiç oranı üzerinden hesaplanır.
- Yapısal eşik skor modeliyle ayrı değerlendirilir; ekonomik eşik aşılmasa bile yapısal eşik aşımı görünür kalır.
- `Ön Göğüs` için yapısal ön göğüs sacı/firewall teyidi ayrı alan olarak taşınır.
- Airbag/emniyet kemeri ve elektrik/elektronik grupları mükerrer puan şişirmeyecek şekilde tekilleştirilir.
- Rapor notu ve mail taslağı kullanıcıya ön değerlendirme sunar; nihai karar kullanıcı onayına bağlıdır.

## Kalite Kapıları

| Komut | Kapsam |
| --- | --- |
| `npm run verify` | Proje bütünlüğü ve beklenen dosya/script kontrolleri |
| `npm run smoke` | Temel smoke kontrolleri |
| `npm run typecheck` | TypeScript tip kontrolü |
| `npm run build` | Üretim build çıktısı |
| `npm run test:behavior` | Davranış regresyonları |
| `npm run final-office-audit` | Ofis dağıtım ve üretim güvenliği denetimi |
| `npm run ci` | Tam zincir |

## Release Mimari Notu

EXE üretimi yalnızca build çıktıları ve `package.json` ile paketlenir. `node_modules`, test fixture'ları ve geliştirme kaynakları runtime paketine doğrudan dahil edilmez.
