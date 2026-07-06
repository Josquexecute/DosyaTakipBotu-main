# CODEX.md — HasarBotu

1. Önce `AGENTS.md`'yi oku (bağlayıcı kurallar).
2. Sonra varsa `CLAUDE.md`'yi oku (operasyonel talimatlar).
3. Küçük, kapsamı dar (scoped) değişiklikler yap; büyük rewrite yapma.
4. EXE üretme; dependency ekleme.
5. `takip.json` source of truth'tur; preview-first; açık kullanıcı onayı olmadan yazma yok.
6. Zorunlu testleri çalıştır:
   `npm run typecheck && npm run build && npm run test:behavior && npm run ci && node scripts/final-office-audit.mjs && npm audit`
7. Yapılandırılmış TÜRKÇE teslim raporu ver (format: `AGENTS.md` → "Teslim Raporu Formatı").
