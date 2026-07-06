# HasarBotu — Copilot Talimatları

Ayrıntılı ve bağlayıcı kurallar için önce repo kökündeki `AGENTS.md`'yi oku. Kritik özet:

- `takip.json` source of truth'tur; SQLite yalnız yeniden kurulabilir yerel cache olabilir.
- Tüm AI çıktıları preview-first'tür; açık kullanıcı onayı olmadan hiçbir kalıcı yazma yapılmaz.
- Ücretli API / zorunlu bulut servisi YASAK (no paid API); otomatik ağ erişimi/scraping YASAK.
- Excel yazımı yüksek risklidir: preview/diff/confirm zorunlu; tek-hücre yazıcılar diğer hücrelere dokunmaz.
- Değer Kaybı (Value Loss): kesin tazminat dili yasak; katsayı uydurma yasak.
- 400 satırı geçen dosya oluşturma; testleri/guard'ları zayıflatma.
- Zorunlu testler: `npm run typecheck`, `npm run build`, `npm run test:behavior`, `npm run ci`,
  `node scripts/final-office-audit.mjs`, `npm audit`.
