# Mimari (ARCHITECTURE)

HasarBotu, **local-first** bir Electron masaüstü uygulamasıdır. Veri kaynağı, dosya sisteminde (genelde pCloud ile senkron) tutulan klasör yapısı ve her dosyanın `_HASARBOTU/takip.json` dosyasıdır. Uygulama bir sunucu/bulut servisi gerektirmez.

## Katmanlar

```
src/
  main/      Electron ana süreç (Node) — IPC, tarama, depolama, içe aktarma, AI istemci
  preload/   contextBridge ile güvenli köprü (renderer'a yalnızca beyaz-listeli API açılır)
  renderer/  Arayüz (vanilla TypeScript; framework yok) + styles.css
  shared/    Ana süreç ve renderer arasında paylaşılan tipler, kurallar, sözlükler
```

### Ana süreç (main)
- **IPC denetleyici** (`ipc.ts`) — tüm renderer çağrıları `ipcMain.handle` üzerinden, `safe()` sarmalayıcısıyla `ApiResult` döndürür.
- **Tarama** (`scanner/`) — `discoverCaseFolders` ile yıl/ay/dosya klasörlerini keşfeder; `folder-fingerprint` ile değişiklikleri yakalar; değişmeyen dosyalar önbellekten yeniden kullanılır.
- **Takip dosyası servisi** (`tracking/`) — `takip.json` okuma/yazma; `withFileLock` + revision/writeId iyimser eşzamanlılık; bozuk/çakışan dosyalarda **ana dosya korunur, default üretilmez**.
- **Depolama** (`storage/`) — `atomicWriteJson` (temp + fsync + atomic rename), dosya kilidi, çakışma/kopya tespiti.
- **İçe aktarma** (`import/`) — Excel okuma/yazma (kendi zip+XML), PDF metni (`pdf2json`), OCR (Tesseract/Poppler), belge/fotoğraf analizi, **AI parça okuma** (`gemini-client`, `parts-list-analyzer`).
- **Yerel önbellek** (`local-cache/`) — AppData altında yıl index'i, per-case cache, parmak izi, write-index ve kullanıcı parça sözlüğü.

### Renderer
- Tek yönlü `state → renderApp(state) → innerHTML` akışı; olaylar `document` üzerinde delege edilir.
- Renderer **doğrudan fs/path/electron/os/child_process kullanmaz**; tüm dosya/klasör verisi güvenli IPC ile gelir.

## Güvenlik
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- İçerik Güvenlik İlkesi (CSP) hem `index.html` hem de oturum başlığında uygulanır.
- `assertSafeCasePath` ile kök-dışı yol/`..` kaçışı engellenir; yol karşılaştırması Türkçe-güvenli normalize ile yapılır (ASCII I/İ sapması yok).
- Harici bağlantılar yalnızca beyaz-listeli host'larda açılır.
- API anahtarları (ör. Gemini) yalnızca yerel ayara kaydedilir; kaynak kodda veya senkron klasörde tutulmaz.

## Veri akışı (özet)
1. Tarama → klasörler keşfedilir, fingerprint hesaplanır.
2. Değişen dosyalar analiz edilir (evrak/fotoğraf), `takip.json` okunur, index güncellenir.
3. Renderer index'i listeler; kullanıcı mutasyonları (not/görev/alan) `mutate()` ile kilit altında yazılır.
4. Çok bilgisayarlı kullanımda write-index ile sessiz ezme/çakışma/kısmi-senkron tespiti yapılır.
