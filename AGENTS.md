# HasarBotu Codex Kuralları

- Proje Electron + TypeScript uygulamasıdır; mevcut sürüm korunur.
- `takip.json` source of truth kalir. Buyuk rewrite yapma.
- Yeni dependency ekleme; zorunluysa once raporla.
- UI metinleri Türkçe olacak.
- Kalici yazma yapan her degisiklik acik test/guard ile korunacak.
- Dosya yolu/full path kullaniciya, log'a veya AI promptuna sizdirilmayacak.
- P4-E2-B commit guvenligi korunacak.
- Dashboard gate, Gemini 503 hotfix, Araç Bağlamı izolasyonu ve AI İşçilik Sözlüğü kompakt yapı korunacak.
- Kod degisikligi sonrasi calistir: `npm run typecheck`, `npm run build`, `npm run test:behavior`, `node scripts/final-office-audit.mjs`, `npm run ci`, `npm audit`.
- ZIP temiz kaynak olacak; `node_modules`, `dist`, `out`, `release`, `.git`, `coverage`, `user-knowledge-store.json` icermeyecek.
