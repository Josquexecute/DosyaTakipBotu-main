# Görev Şablonu (Task Template)

## Goal (Amaç)
<!-- Tek cümleyle: bu görev bitince kullanıcı ne yapabilecek? -->

## Scope (Kapsam)
<!-- Yapılacak işin sınırları; hangi modüller/akışlar etkilenecek. -->

## Out of Scope (Kapsam Dışı)
<!-- Bilinçli olarak YAPILMAYACAK işler (örn. hesap motoru, Excel entegrasyonu, EXE). -->

## Safety Constraints (Güvenlik Kısıtları)
- takip.json'a kullanıcı onayı olmadan yazma yok
- Excel'e kullanıcı onayı olmadan yazma yok
- Harici API / ağ / scraping yok; ücretli servis yok
- Preview-first; 400 satır sınırı; test/guard zayıflatma yok
<!-- Göreve özgü ek kısıtlar -->

## Files Likely to Change (Değişmesi Muhtemel Dosyalar)
<!-- src/shared/..., src/main/..., src/renderer/..., scripts/behavior-regression-tests.mjs -->

## Tests to Run (Çalıştırılacak Testler)
```bash
npm run typecheck && npm run build && npm run test:behavior && npm run ci
node scripts/final-office-audit.mjs
npm audit
```

## Delivery Report Format (Teslim Raporu)
`docs/dev/DELIVERY_REPORT_TEMPLATE.md` formatında, Türkçe.
