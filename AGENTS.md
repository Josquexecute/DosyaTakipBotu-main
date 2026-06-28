# AGENTS.md — HasarBotu / Baran Global Ekspertiz

Bu dosya, depo üzerinde çalışan AI ajanları (Codex, Claude vb.) ve geliştiriciler için
yol göstericidir. Amaç: değişiklikleri **güvenli, Türkçe, local-first ve regresyonsuz**
tutmak. Mevcut sürüm: **v0.6.4** (Electron masaüstü, Windows x64 hedef).

---

## 1. Proje özeti

HasarBotu, sigorta eksper hasar dosyalarını klasör yapısı üzerinden tarayan, her dosyanın
durumunu **local-first** yöneten, evrak/fotoğraf risklerini gösteren, Excel işçilik akışını
güvenli önizlemeyle çalıştıran ve AI (Gemini ücretsiz katman) destekli yardımcılar sunan bir
**Electron + TypeScript** uygulamasıdır. UI tamamen **Türkçe**dir.

- Ana veri kaynağı (source of truth): her dosyanın `_HASARBOTU/takip.json` dosyası.
- AppData `local-cache` yeniden üretilebilir hız/önizleme katmanıdır; otorite değildir.
- AI yalnız ek değerlendirme verir; **nihai karar eksper onayına tabidir**.

## 2. Mimari ve dizin yapısı

```text
src/
  main/      Electron ana süreç: IPC (ipc.ts), tracking (atomic write/revision/writeId),
             tarama (scanner/), Excel/PDF/fotoğraf (import/), AI servisleri (services/ai/),
             bilgi bankası (services/knowledge/), local-cache/, storage/ (atomic-write, file-lock)
  preload/   contextBridge köprüsü → window.hasarbotu (yalnız ipc-contract kanalları)
  renderer/  Vanilla TS arayüz. main.ts = uygulama mantığı; app/components/* = HTML render;
             app/state.ts = UiState; styles.css; index.html
  shared/    Ortak tipler (types.ts), ipc-contract.ts, workflow/kural sabitleri, saf yardımcılar
scripts/     Build, audit, release, Windows ve saha kabul komutları (.mjs / .ps1)
docs/        Mimari, kullanım, kurulum, veri güvenliği, operasyon rehberleri
dist-electron/  tsc + esbuild çıktısı (ana süreç + preload)  — build üretir, repoya girmez
dist-ui/        tsc + copy-static çıktısı (renderer ESM)      — build üretir, repoya girmez
```

Entry point: `dist-electron/main/main.js` (package.json `main`).

### Süreçler arası akış
Renderer → `window.hasarbotu.*` (preload) → `IPC_INVOKE_CHANNELS` (src/shared/ipc-contract.ts)
→ `ipcMain.handle` (src/main/ipc.ts, hepsi `this.safe(...)` ile sarılı) → domain servisleri.
Yanıt tipi her zaman `ApiResult<T>` = `{ ok:true, data } | { ok:false, error:{ code, message } }`.
Yeni bir IPC eklerken **4 yeri** birlikte güncelle: `ipc-contract.ts` (kanal + `HasarbotuApi`),
`preload.ts` (köprü), `ipc.ts` (handler), ve ilgili servis.

## 3. Çalıştırma ve doğrulama komutları

Kod değişikliğinden sonra **sırayla** çalıştır (AGENTS kuralı):

```bash
npm run typecheck                  # 3 tsconfig (main/preload/renderer) --noEmit
npm run build                      # clean → typecheck → main(tsc) → preload(esbuild) → renderer(tsc+copy-static)
npm run test:behavior              # plain Node davranış regresyonu (~590 kontrol)
node scripts/final-office-audit.mjs# ofis final denetimi (~282 kontrol, sürüm kapısı dahil)
npm run ci                         # verify+smoke+tüm auditler+typecheck+build+test:behavior+final-office-audit
npm audit                          # 0 açık beklenir
```

- Uygulamayı çalıştır: `npm start` (build + `electron .`; electron binary gerekir).
- Windows kurulum (EXE): `npm run dist:win` (electron-builder, nsis x64).
- `npm run ci` tek başına en kapsamlı geçittir; PR/teslim öncesi yeşil olmalı.

> Not: `npm run test:behavior` **plain Node** altında çalışır ve bu makinede electron binary
> kurulu olmayabilir. Bu nedenle davranış testinin import ettiği `dist-electron/main/**`
> modülleri **modül yükleme anında `require('electron')` ÇAĞIRMAMALI**. Electron yalnız
> fonksiyon içinde tembel alınmalı: `const { dialog } = require('electron') as typeof import('electron');`
> (örn. `report-invoice-service.ts`). Tip importları (`import type { BrowserWindow } from 'electron'`) serbesttir.

## 4. Güvenlik ve veri modeli (bozma)

- BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true` (src/main/security.ts `SECURITY_FLAGS`). Renderer'dan **doğrudan dosya
  sistemi erişimi yoktur**; her şey IPC üzerinden.
- `takip.json` yazımı: atomic write + `revision`/`writeId` + pCloud "conflicted copy" algılama
  + bozuk JSON koruması. Çok bilgisayarlı ofiste veri ezilmesi bu mekanizmalarla engellenir.
- Bilgi Bankası kalıcı yazma yalnız dar kilit + özel commit servisi ile
  `user-knowledge-store.json`'a yapılır (P4-E2-B commit güvenliği — bozma).
- **Tam dosya yolu** kullanıcıya, log'a veya AI promptuna **sızdırılmaz**; yalnız dosya adı.
- Yanlış plakalı parça fotoğrafı Gemini'ye gönderilmez (hard-block).

### AI (Gemini)
- Anahtar koda gömülmez; yerel ayardan okunur (`settings.geminiApiKey`).
- Model: `gemini-2.5-flash` (ücretsiz katman). Transport: `src/main/import/gemini-client.ts`.
- GEÇİCİ hatalar (HTTP 5xx/503, zaman aşımı, ağ) → `AI_SERVICE_TRANSIENT` kodu + tek Türkçe
  mesaj + "Tekrar Dene" (Gemini 503 hotfix — bozma). Uygulama kilitlenmez.

## 5. Çalışma kuralları (mevcut + korunacaklar)

- Proje Electron + TypeScript uygulamasıdır; **mevcut sürüm korunur**, büyük rewrite yapma.
- `takip.json` source of truth kalır.
- **Yeni dependency ekleme**; zorunluysa önce raporla.
- UI metinleri **Türkçe** olacak (`scripts/turkish-ui-audit.mjs` denetler).
- Kalıcı yazma yapan her değişiklik **açık test/guard** ile korunacak.
- Dosya yolu/full path kullanıcıya, log'a veya AI promptuna sızdırılmayacak.
- P4-E2-B commit güvenliği korunacak.
- Dashboard gate, Gemini 503 hotfix, Araç Bağlamı (dosya-bazlı izolasyon) ve AI İşçilik
  Sözlüğü kompakt yapı korunacak.
- **Onaylar**: renderer'da native `window.confirm/alert/prompt` KULLANMA. Electron'da
  (sandbox + contextIsolation) bloklayan nested modal donmaya/deadlock'a yol açar. Bunun yerine
  `confirmDialog(...)` (main.ts) + `renderConfirmModal` (layout.ts) + `state.confirmModal` kullan.
- Kod değişikliği sonrası bölüm 3'teki komutları çalıştır.
- ZIP temiz kaynak olacak; `node_modules`, `dist*`, `out`, `release`, `.git`, `coverage`,
  `pilot-logs`, `user-knowledge-store.json` içermeyecek.

## 6. Guard / audit sistemi (kritik)

`scripts/*.mjs` denetimleri kaynak metnini **literal string** ile tarar. Bu nedenle:

- Yorumlarda/sabitlerde **yasaklı token** bulundurma (örn. servis dosyasında `.write(`,
  `writeFile`, `takip.json`, `.xlsx`; prompt fonksiyonunda `filePath`/`selectedPath`). Guard,
  kasıtsız bile olsa bu metni görürse build'i kırar.
- Yeni bir davranış eklediğinde, projenin konvansiyonuna uyup ilgili audit'e **guard** ekle
  (örn. v0.6.4 donma düzeltmesi için `final-office-audit.mjs`'de "native window.confirm yok"
  guard'ı). Böylece gelecekte geri gelmesi engellenir.
- `final-office-audit.mjs` **sürüm kapısı** içerir (`pkg.version === '0.6.4'` ve
  `APP_VERSION === pkg.version`). Sürümü değiştirirsen bu kapıyı ve gerekiyorsa README/docs'u hizala.

Başlıca denetimler (hepsi `npm run ci` içinde): `verify`, `smoke`, `feature:audit`,
`audit:turkish`, `audit:ipc-fields`, `audit:ipc-contract`, `compat:windows`,
`audit:preload-bundle`, `audit:renderer-stability`, `audit:daily-work`, `audit:field-pilot-v2`,
`test:behavior`, `final-office-audit`.

## 7. Bilinen tuzaklar (gotchas)

- **Renderer beyaz ekran**: dist-ui ESM importları `.js` uzantısı ve barrel/dizin importları
  `/index.js` ile çözülmeli (`scripts/copy-static.mjs` yamalar; runtime import guard yakalar).
  `render()` tek render hatasında tüm UI'yi beyaz bırakmaz (try/catch → `renderFatalError`).
- **Native dialog donması**: bkz. bölüm 5/6 (confirmDialog). Silme/onay akışları buradan geçer.
- **Behavior test electron'suz Node**: bkz. bölüm 3 (tembel `require('electron')`).
- **Araç Bağlamı**: yalnız AKTİF dosyanın `takip.json`'una yazılır; Şase/Motor gibi alanlar
  AI promptuna gitmez. Cross-case izolasyon bozulmamalı.

## 8. Sürüm ve paketleme

- Sürüm üç yerde tutulur ve hizalı olmalı: `package.json`, `package-lock.json`,
  `src/shared/constants.ts` (`APP_VERSION`) + `final-office-audit.mjs` sürüm kapısı.
- Teslim ZIP'i **yalnız kaynak**: `src/`, `scripts/`, `docs/`, `.github/`, tüm `tsconfig*.json`,
  `vite.renderer.config.ts`, `package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`,
  dotfile'lar. Build çıktıları ve `node_modules` dahil edilmez. SHA-256 ile birlikte raporlanır.
