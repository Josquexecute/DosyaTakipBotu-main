# Canlı Geçiş Kararı

Bu doküman HasarBotu v0.4.12'nin ofis kullanımına alınması için kısa karar kaydıdır.

## Kabul Kapıları

- [ ] `npm run typecheck` geçti.
- [ ] `npm run build` geçti.
- [ ] `npm run ci` geçti.
- [ ] `npm run final-office-audit` geçti.
- [ ] `npm audit` temiz.
- [ ] Windows EXE üretildi ve SHA-256 çıktısı alındı.
- [ ] Ofis hedef sürümü v0.4.12 olarak kaydedildi.
- [ ] Önceki stabil EXE ve takip yedeği saklandı.

## Canlı Kullanım Şartları

- `_HASARBOTU/takip.json` dosyaları source of truth olarak kabul edilir.
- pCloud conflicted copy ve revision/writeId uyarıları sessizce geçilmez.
- Yanlış plaka fotoğraf hard-block davranışı korunur.
- AI İşçilik Dağıtıcı önizleme/onay akışıyla kullanılır.
- Excel çıktıları ayrı dosya olarak kaydedilir.

## Karar

Dağıtım sorumlusu bu listeyi tamamladıktan sonra [OFIS_DAGITIM_KONTROL_LISTESI.md](OFIS_DAGITIM_KONTROL_LISTESI.md) ile ofis bilgisayarlarını sırayla günceller.
