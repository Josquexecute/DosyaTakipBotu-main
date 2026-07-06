# HasarBotu — Final Source Freeze Kapısı

> Bu kapı, RC1 smoke testi GEÇTİKTEN sonra uygulanır. EXE üretimi bu belgenin kapsamı
> dışındadır ve ayrı/açık talimatla yapılır.

## 1. Amaç

Kaynak kodun sürüm için dondurulma koşullarını, freeze sonrası izin/yasak sınırlarını ve
final karara giden komut zincirini tek yerde tanımlamak.

## 2. Final source freeze ne demektir?

Freeze anından itibaren kaynak kod yalnız aşağıdaki §7'deki istisnalarla değişir; tüm diğer
değişiklikler bir SONRAKİ sürümün konusudur. Amaç: smoke testte doğrulanan davranışın
paketlenecek kaynakla birebir aynı kalması.

## 3. Freeze öncesi zorunlu koşullar

- [ ] RC1 hazırlık denetimi geçti (`RC1_PREPARATION_AUDIT.md`: "HasarBotu RC1 smoke test
      aşamasına geçebilir.").
- [ ] Değer kaybı final audit kararı mevcut (`VALUE_LOSS_FINAL_AUDIT_V10_1.md`).
- [ ] §8 komut zinciri tamamı yeşil.
- [ ] `takip.json` source-of-truth / pCloud yalnız-manuel-yedek / preview-first kuralları
      belge ve testlerde korunuyor.

## 4. RC1 smoke test sonucu şartı

`RC1_SMOKE_TEST_RESULT_FORM.md` doldurulmuş ve karar açıkça şu olmalıdır:
**"RC1 smoke test geçti; final source freeze aşamasına geçilebilir."**
Form boşsa veya karar işaretlenmemişse freeze YAPILAMAZ.

## 5. P0/P1 hata politikası

- Açık P0 veya P1 varken freeze YAPILAMAZ.
- P0/P1 düzeltmesi yapılırsa: minimal fix + regresyon testi + §8 zinciri yeniden yeşil +
  etkilenen smoke adımları YENİDEN test edilir.
- P2/P3 freeze'i bloklamaz; sürüm notuna "bilinen sınırlamalar" olarak yazılır.

## 6. Freeze sonrası yasaklar

- Yeni özellik (new feature)
- Yeni IPC kanalı
- Büyük refactor
- Yeni AI modülü
- Yeni Excel davranışı
- Yeni yazma yolu
- Dependency ekleme
- Source-of-truth değişikliği
- Otomatik yedekleme/bulut davranışı

## 7. Freeze sonrası izin verilenler

- P0/P1 bug fix (minimal, regresyon testli)
- Yalnız yazım hatası (typo) doküman düzeltmesi
- Sürüm notu / changelog güncellemesi
- Paketleme metadata düzeltmesi
- Smoke testte doğrulanmış bloker düzeltmesi

## 8. Zorunlu komut zinciri

Freeze kararı öncesi ve freeze sonrası her istisna değişikliğinde TAMAMI çalıştırılır:

```bash
npm run typecheck
npm run build
npm run test:behavior
npm run ci
node scripts/final-office-audit.mjs
npm audit
npm run test:dev-harness
```

Beklenen taban: behavior ≥ 1480 · office-audit 282 · IPC 86/3 · npm audit 0 · dev-harness 31.

## 9. Final EXE öncesi kontrol

EXE üretimi AYRI görevdir ve açık talimat gerektirir. Ön koşullar: bu kapının kararı
"yapılabilir" + sürüm/changelog hazır + `EXE_URETIM_REHBERI.md` ve
`OFIS_DAGITIM_KONTROL_LISTESI.md` izlenir + üretim sonrası hash/sürüm notu doğrulaması.

## 10. Son karar

Aşağıdaki İKİ seçenekten biri açıkça yazılır:

- **Final source freeze yapılabilir.**
- **Final source freeze yapılamaz; önce P0/P1 düzeltme gerekir.**

Karar tarihi/veren: ______________________
