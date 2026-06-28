# AGENTS.md — HasarBotu v0.6.4

HasarBotu, Baran Global Ekspertiz için **Electron + TypeScript** masaüstü uygulamasıdır (local-first, Windows x64). UI metinleri Türkçe kalır.

## Temel kurallar
- `takip.json` source of truth'tur; büyük rewrite yapma.
- Yeni dependency ekleme (zorunluysa önce raporla).
- Kalıcı yazma davranışı değişirse açık test/guard şart.
- Full path (tam dosya yolu) kullanıcıya, log'a veya AI promptuna sızdırılmaz; yalnız dosya adı.
- Sürüm 0.6.4 sabit kalır.

## Korunacak davranışlar (bozma)
- **Dashboard gate**: manuel klasör seçilmeden diğer ekranlar kilitli.
- **Gemini 503 hotfix**: 5xx/timeout/network → geçici hata + Tekrar Dene; uygulama kilitlenmez.
- **Araç Bağlamı** dosya-bazlı izolasyon: Şase/Motor başka dosyaya karışmaz, AI promptuna gitmez.
- **P4-E2-B** commit güvenliği: Bilgi Bankası read-only; kalıcı yazma yalnız dar kilit + commit servisi.
- **AI İşçilik Sözlüğü** kompakt yapı.
- Renderer'da native window.confirm/alert/prompt yok → uygulama-içi confirmDialog.

## Kod sonrası çalıştır
`npm run typecheck`, `npm run build`, `npm run test:behavior`, `node scripts/final-office-audit.mjs`, `npm run ci`, `npm audit`.

## Temiz ZIP
Şunları içermez: `node_modules`, dist-ui/dist-electron, release, .git, log/temp, `user-knowledge-store.json`, eski zip'ler.
