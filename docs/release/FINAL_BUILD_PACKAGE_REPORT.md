# HasarBotu — Final Build Paket Raporu (2026-07-06)

> **EN GÜNCEL: FINAL CANDIDATE** — `release/HasarBotu-Final-Candidate-20260706/`.
> Kaynak donduruldu (`FINAL_SOURCE_FREEZE_DECISION.md`: "Final source freeze yapılabilir.");
> yerel git deposu başlatıldı, `v0.6.4-final-candidate` etiketi atıldı (remote yok → push/
> release-draft manuel adım olarak belgelendi). Smoke test kullanıcı/ofis sahibi kararıyla
> kabul edildi (adım-adım form yürütülmedi); bilinen P0/P1 yok. İçerik: scroll P1 + P2 UX +
> bilgi rozetleri (behavior 1501). Final dağıtım ofis kullanım onayına bağlıdır; gerçek
> kullanımdan önce Ayarlar'dan gerçek çalışma klasörü seçilmelidir. Aşağıdaki eski paketler
> geçersizdir.

> **(ARŞİV) Scroll/P2 rebuild paketi:** `release/HasarBotu-RC1-After-Scroll-P2-20260706/` — scroll P1
> fix'i + bağlam-önizlemesi P2 netleştirmesini İÇERİR (behavior 1497). Etiket: **"RC1 build
> artifact after scroll/P2 fixes — final office approval pending"**. Aşağıdaki eski paket
> (`HasarBotu-RC1-20260706/`, fix ÖNCESİ build) bu rebuild ile GEÇERSİZ KILINMIŞTIR — final
> release DEĞİLDİR; gerçek smoke test hâlâ bekliyor. Smoke testten ÖNCE kullanıcı Ayarlar'dan
> gerçek çalışma klasörünü seçmeli (`.fixtures\2026` kullanılmamalı). Ayrıntı: yeni paketin
> `RELEASE_MANIFEST.md` dosyası.

---

## (ARŞİV) İlk RC1 paketi — scroll fix ÖNCESİ (geçersiz)

> Paket etiketi: **RC1 build artifact — final office approval pending** (smoke test formu boş).
> Çıktılar YEREL: `release/HasarBotu-RC1-20260706/`. Hiçbir şey yüklenmedi/yayınlanmadı.

## 1. Ne build edildi?

`npm run dist:win` (projenin mevcut resmi komutu; electron-builder 26, win x64, publish=never):

- `HasarBotu-Baran-Ekspertiz-Kurulum-0.6.4.exe` — NSIS kurulum, 95,00 MB, imzalı.
- `HasarBotu-Baran-Ekspertiz-Tasinabilir-0.6.4.exe` — taşınabilir, 94,78 MB, imzalı.

Orijinal çıktılar `release/` kökünde korunup tarihli klasöre kopyalandı.

## 2. Ne ZIP'lendi?

`HasarBotu-rc1-source-20260706.zip` (4,34 MB, 415 girdi): `src/ scripts/ docs/` + gizli
talimat dizinleri (`.agents .claude .cursor .github`) + `package.json package-lock.json
tsconfig*.json vite.renderer.config.ts AGENTS/CLAUDE/CODEX/README/CHANGELOG`.

## 3. Ne hariç tutuldu?

`node_modules dist-electron dist-ui release .git pilot-logs *.log .env* *.local
settings.local.json desktop.ini Thumbs.db`. Repo'da gerçek `takip.json`/vaka/pCloud verisi ve
secret bulunmadığı taramayla doğrulandı; ZIP içi ayrıca girdilerin üzerinden ikinci kez tarandı
(temiz).

## 4. Komut sonuçları (build öncesi tam zincir)

typecheck 0 · build 0 · behavior **1488** · ci 0 (0 HATA) · final-office-audit **282** ·
npm audit **0** · dev-harness **31** · IPC **86/3**. Hiçbir komut başarısız olmadı; runtime
düzeltmesi gerekmedi.

## 5. SHA-256

```txt
28367b6df1745bdb0abdc2f929a65d9b502502ecff9b3fcc6f2219ed1489658b  HasarBotu-Baran-Ekspertiz-Kurulum-0.6.4.exe
2a68b43b55224c2ce257530f72aa1162ea22c5d19fa5547360013bd654895456  HasarBotu-Baran-Ekspertiz-Tasinabilir-0.6.4.exe
6ff48c00e022d906c06d46e723559cc6f3234bb3e1efb0f3522d96099b71e877  HasarBotu-rc1-source-20260706.zip
```

## 6. Smoke test durumu

**PENDING** — `RC1_SMOKE_TEST_RESULT_FORM.md` doldurulmamış; test yürütülmedi. Bu yüzden
paket "final release passed" olarak ETİKETLENMEDİ.

## 7. Son karar

**RC1 build artifact created; final office approval pending.** Smoke test geçip
`FINAL_SOURCE_FREEZE_GATE.md` kararı verilmeden bu paket ofise final olarak dağıtılmamalıdır.
