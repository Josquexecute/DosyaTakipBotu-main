# HasarBotu — Final Source Freeze Kararı (2026-07-06)

## 1. Amaç

v0.6.4 kaynak durumunu Final Candidate paketi için dondurmak; freeze sonrası değişiklik
sınırlarını ve GitHub devri durumunu kayda geçirmek.

## 2. Freeze kapsamı

`src/ scripts/ docs/ qa/(md+json raporlar)` + kök yapılandırma dosyaları + ajan talimat
dizinleri. Build çıktıları (`dist-*`, `release/`), `node_modules`, `.fixtures`, loglar ve
yerel ayar dosyaları kapsam DIŞI (.gitignore ile).

## 3. Dahil edilen son düzeltmeler

1. AI Değer Kaybı v10.1 final audit ("RC hazırlığına geçebilir").
2. Uygulama-geneli RC1 hazırlık denetimi ("smoke teste geçebilir").
3. Scroll/taşma P1 fix'i (CSS-only; sayfa düzeyi dikey kaydırma).
4. Görsel QA (29/29) + canlı recheck (26/26).
5. Bağlam-önizlemesi P2 UX netleştirmesi (önizleme/gerçek seçim ayrımı).
6. Kompakt bilgi rozeti (ⓘ) katmanı — 19 yerleşim, saf `info-tip` bileşeni.

## 4. Test/audit tabanı

behavior **1501** · final-office-audit **282** · IPC **86 invoke / 3 event** ·
npm audit **0** · dev-harness **31** · typecheck/build/ci **0 hata** (freeze anında koşuldu).

## 5. Smoke test / kullanıcı onayı durumu

Detaylı manuel form doldurulmadı; kullanıcı/ofis sahibi kararıyla RC1 smoke test başarılı
kabul edildi ve P0/P1 açık hata bildirilmedi. (Adım adım form sonucu ÜRETİLMEDİ;
`RC1_SMOKE_TEST_RESULT_FORM.md` boş durur — kabul, sahip kararı olarak kayıtlıdır.)

## 6. P0/P1 açık hata durumu

Bilinen açık P0/P1 YOK. Scroll P1 düzeltildi ve regresyon testli; seçim-uyarısı P2 kapatıldı.

## 7. Git/GitHub durumu

Klasör önceden git deposu DEĞİLDİ. Bu freeze ile YEREL git deposu başlatıldı; kaynak
`chore(release): final candidate freeze` mesajıyla commit'lendi ve `v0.6.4-final-candidate`
etiketi atıldı. **Remote YOK** → push ve GitHub release draft YAPILMADI (kimlik/remote
yapılandırılınca manuel adımlar release notlarında ve manifest'te listelidir; gh CLI kurulu).

## 8. Freeze sonrası yasaklar

Yeni özellik · yeni IPC · büyük refactor · yeni AI modülü · yeni Excel davranışı · yeni yazma
yolu · dependency ekleme · source-of-truth değişikliği · otomatik yedekleme/bulut davranışı.

## 9. Freeze sonrası izin verilenler

P0/P1 bug fix (minimal+regresyon testli) · typo-only doküman düzeltmesi · sürüm notu/changelog ·
paketleme metadata düzeltmesi · sahada doğrulanmış bloker düzeltmesi. Her istisnada 7 komutluk
zincir yeniden koşulur (bkz. `FINAL_SOURCE_FREEZE_GATE.md`).

## 10. Final candidate build kararı

Taban yeşil + kullanıcı kabulü kayıtlı → resmi `npm run dist:win` ile Final Candidate paketi
üretilecek; etiket: **"Final Candidate — office owner approval accepted, final deployment
pending"** (geri döndürülemez nihai üretim sürümü İLAN EDİLMEZ).

## 11. Son karar

**Final source freeze yapılabilir.**
