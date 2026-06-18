# HasarBotu — Baran Global Ekspertiz

Türkçe, masaüstü (Electron) **hasar dosyası takip ve ekspertiz asistanı** uygulaması. Sigorta hasar dosyalarını klasör yapısı üzerinden tarar; evrak/fotoğraf kontrolü, işçilik/parça hesabı, portal kontrol listesi, rücu/KTT/ağır hasar takibi ve çok bilgisayarlı (pCloud) çakışma yönetimi sağlar.

**v0.4.5** ile gelen yenilik: tüm dosyaların **sayfalı Durum Panosu** (50 dosya/sayfa). Ayrıca **AI destekli parça listesi fotoğrafı okuma** — servislerin el yazısıyla gönderdiği karışık parça listelerini okuyup usta dilini gerçek parça adına çeviren, zamanla öğrenen bir asistan.

> Sürüm: **0.4.5** · Lisans: UNLICENSED (özel/şirket içi) · Platform: Windows (x64)

---

## Öne çıkan özellikler

- **Dosya tarama & takip:** Yıl/ay/dosya klasör yapısını tarar, her dosya için `_HASARBOTU/takip.json` ile durum, sorumlu, görev, not ve denetim kaydı tutar.
- **Durum Panosu:** Tüm dosyaların son durumu tek panoda — dosya no'ya göre sıralı, **50 dosya/sayfa** sayfalama, filtre/arama/sıralama, durum dağılımı, ilerleme %, son not + aktif görev ve tek tuşla "Tümünü Excel'e Aktar".
- **Local-first & çakışma güvenli:** Atomik yazma + dosya kilidi + iyimser eşzamanlılık (revision/writeId); pCloud kaynaklı sessiz ezme/çakışma/kısmi-senkron tespiti.
- **Evrak & fotoğraf kontrolü:** Trafik/kasko evrak gereksinimleri, eksik evrak/fotoğraf uyarıları, taranmış ihbar PDF'inde OCR ile plaka doğrulama.
- **İşçilik Excel dağıtıcı:** Portal Excel'ine hedef toplam işçilik dağıtımı (oranlı/eşit) veya **gömülü "Boya ve İşçilikler" fiyat listesine göre** satır bazında tutar atama; **uygulama içi düzenlenebilir işçilik tablosu**.
- **AI parça listesi okuma (Gemini):** Parça listesi fotoğrafını okur, **usta dilini gerçek parça adına** çevirir (örn. *amartisör → Amortisör*, *davlumbaz → Çamurluk Davlumbazı*, *intercol → İntercooler*).
- **Öğrenen usta sözlüğü:** Yanlış/eksik okunan terimi düzeltip **"Öğret"** dersen kişisel sözlüğüne kalıcı kaydedilir; bir daha otomatik tanınır (öğrenilen terim gömülü sözlüğü ezer).
- **İşçiliğe aktar & kopyala:** Okunan parçaları gömülü fiyat listesiyle eşleyip **Parça + İşçilik Excel'i** üretir; temiz listeyi panoya kopyalar.
- **Operasyon panosu:** Bugün iş masası filtreleri, veri kalitesi/risk uyarıları, kompakt dosya listesi, koyu/açık tema, responsive pencere.

---

## Teknoloji

- **Electron 41** + **TypeScript** (main / preload / renderer / shared katmanları)
- Vanilla TS renderer (framework yok), `tsc` + `esbuild` ile derleme
- Çalışma zamanı bağımlılığı: `pdf2json` (PDF metni). Excel/zip işlemleri kendi içinde (zlib).
- OCR (opsiyonel): Tesseract + Poppler (Windows)
- AI okuma (opsiyonel): Google Gemini API (ücretsiz katman)

---

## Kurulum (geliştirme)

Gereksinim: **Node.js 20+** ve **npm**.

```bash
npm install
npm run build        # main + preload + renderer derlenir (dist-electron / dist-ui)
npm start            # uygulamayı geliştirme modunda açar
```

> İlk `electron .` öncesi Electron ikilisinin inmiş olması gerekir. Gerekirse:
> ```bash
> npm run fix:electron     # Windows: Electron ikilisini onarır/indirir
> ```

## Windows kurulum paketi (EXE) üretme

```bash
npm run dist:win     # NSIS kurulum + taşınabilir EXE -> release/
```

---

## AI parça okuma için Gemini kurulumu (ücretsiz)

1. [aistudio.google.com](https://aistudio.google.com) → Google hesabıyla gir → **"Get API key" / "Create API key"** (kart gerektirmez).
2. Uygulamada **Ayarlar → Gemini API anahtarı** alanına yapıştır ve kaydet.
3. **Excel Araçları → Parça Listesi Fotoğrafı Seç ve Oku** ile fişi okut.

**Gizlilik notu:** Anahtar yalnızca bu bilgisayarın yerel ayarına (AppData) kaydedilir; kaynak kodda/pCloud'da tutulmaz. Ücretsiz katmanda gönderilen görsel Google tarafından model iyileştirmede kullanılabilir; kişisel veri içeren görsellerde dikkatli olun.

---

## Proje yapısı

```
src/
  main/        Electron ana süreç (IPC, tarama, depolama, içe aktarma, AI istemcisi)
  preload/     Güvenli köprü (contextBridge)
  renderer/    Arayüz (vanilla TS bileşenler + styles.css)
  shared/      Ortak tipler, sözlükler (price-list.ts, parca-sozlugu.ts), kurallar
scripts/       Derleme, denetim (audit) ve sürüm araçları
docs/          Ekran görüntüleri ve dokümanlar
```

## Doğrulama / denetim

```bash
npm run typecheck         # tip kontrolü
npm run test:behavior     # davranış regresyon testleri
npm run ci                # tüm denetim + build zinciri
```

---

Bu yazılım Baran Global Ekspertiz için özel olarak geliştirilmiştir. Ayrıntılı sürüm geçmişi için bkz. [CHANGELOG.md](CHANGELOG.md).
