# HasarBotu — RC1 Hazırlık Denetimi (Uygulama Geneli Release Gate)

> Bu belge uygulama-geneli RC1 hazırlık kapısı denetim çıktısıdır. Özellik eklemez, runtime
> davranışı değiştirmez (denetim runtime-nötr tamamlandı — bloker bulunmadı). EXE üretimi bu
> görevin kapsamı DIŞINDADIR.

## 1. Amaç

HasarBotu'nun bütününün (yalnız değer kaybı değil) RC1 smoke test / final kaynak dondurma
aşamasına geçmeye hazır olup olmadığına karar vermek.

## 2. Denetim kapsamı

Çekirdek tracking (tarama/okuma/yazma/çakışma), UI/iş akışı yüzeyleri, Excel iş akışları,
4 AI modülü (İşçilik, Ağır Hasar, Değer Kaybı, Orchestrator/AI Mode), güvenlik/dependency,
build/test kapıları. Kanıt: kaynak incelemesi + mevcut 1470 davranış kontrolü + 282 ofis final
denetimi + bu görevle eklenen RC1 guard testleri.

## 3. İncelenen modüller

`src/main/tracking/tracking-file-service.ts`, `src/main/storage/atomic-write.ts`,
`src/main/local-cache/*`, `src/main/scanner/pcloud-year-scanner.ts`, `src/main/ipc.ts` +
`src/shared/ipc-contract.ts`, `src/main/services/*` (labor-excel-writer, excel-workflow,
heavy-damage-assessment, knowledge-import-commit, case-asset-guard), `src/main/import/*`
(excel-importer, gemini-client, ocr), `src/renderer/main.ts` + bileşenler (cases/detail/
dashboard/layout/heavy-damage/ai-mode/value-loss), `src/shared/*` saf modüller, guard/test
altyapısı (behavior testleri, final-office-audit, dev-harness).

## 4. takip.json / source-of-truth kontrolü

- `takip.json` dosya klasöründe TEK gerçek kaynaktır; AppData local-cache
  (`%APPDATA%/.../local-cache/`: yıl indeksi, parmak izleri, thumbnail, ayarlar) yalnız
  TÜRETİLMİŞ önbellektir — önbellekten dosya klasörüne geri yazma yolu yoktur.
- SQLite/veritabanı source-of-truth YOKTUR (dependency + kaynak taraması; RC1 guard testi).
- pCloud yalnız manuel yedek/arşivdir; canlı pCloud kökü varsayımı yok. Kısmi senkron
  durumunda `_HASARBOTU` klasörü olup takip.json yoksa dosya OTOMATİK OLUŞTURULMAZ
  (pcloud-year-scanner koruması).

## 5. Yazma yolları ve onay mekanizması

- Tüm takip.json yazımları `TrackingFileService.mutate()` üzerinden: kilit + revision kontrolü
  + writeId kontrolü + **yazmadan hemen önce disk yeniden okuma** (çift kontrol; satır 224-256)
  + `atomicWriteJson` (temp + fsync + rename + Windows/pCloud retry). Sessiz ezme engellenir.
- Mutasyonlar DAR kapsamlıdır: `updateField` whitelist'li, `updateValueLossContext` yalnız
  kendi alt alanını yazar; renderer'dan gelen bütün-nesne yazma fonksiyonu YOKTUR.
- Onay kapıları yıkıcılığa göre: silme/temizleme/çakışma-ezme/bilgi-kayıt aksiyonları
  confirmDialog'ludur (not/görev ekleme gibi düşük riskli hızlı düzenlemeler bilinçli olarak
  onaysızdır). AI çıktıları için tümü onaylıdır (bkz. §7-9).
- Bilgi bankası importu yalnız dar kilitli özel commit servisiyle
  `user-knowledge-store.json`'a yazar (takip.json/Excel/case klasörü hedefi kilitle yasak).

## 6. IPC durumu

**86 invoke / 3 event** — değişmedi (IPC kontrat denetimi `npm run ci` içinde). ~34 kanal
mutasyon yapar (hepsi dar kapsamlı servislerle), ~52 kanal salt-okunurdur. Bu görevde IPC
değişikliği yapılmadı.

## 7. AI İşçilik durumu

Önizleme `detail.ts` (auto-labor kartı); Excel'e yazma yalnız `labor:auto-save` ile ve son onay
modalından sonra; yazmadan önce orijinal Excel'in yedeği alınır. Kanıt testleri: "AI işçilik son
onay modalı olmadan Excel yazmaz" (satır 2021), kayıt sonucu/kısmi yazma raporu testleri
(2024-2025). Bu görevde değişiklik yapılmadı.

## 8. Ağır Hasar AI durumu

Önizleme `heavy-damage-assessment.ts`; kayıt `heavy-damage:save` + `userConfirmed !== true`
ise main servis yazmayı REDDEDER. Kanıt testleri: "önizleme kullanıcı onayı olmadan kayıt
sayılmaz" (1664), "main servis son onay olmadan takip.json içine yazmaz" (1741), renderer onay
zinciri (1744). Bu görevde değişiklik yapılmadı.

## 9. AI Değer Kaybı durumu

v10.1 final audit tamamlandı (`docs/value-loss/VALUE_LOSS_FINAL_AUDIT_V10_1.md`):
**"Değer Kaybı Yardımcısı RC hazırlığına geçebilir."** Modül RC hazırlığı için donduruldu;
bu görevde dokunulmadı. 11 doküman zinciri + preview-first + 2 onay-kapılı yazma aksiyonu
kalıcı testlidir.

## 10. Excel iş akışları durumu

- **Import:** salt-okunur parse + önizleme eşlemesi; dry-run `canWrite=false` (test 667).
- **Export:** filtreli liste dışa aktarımı yalnız kullanıcı butonu + kayıt-yeri diyaloğu ile
  (tek export butonu — office-audit kontrolü).
- **AI İşçilik Dağıtıcı:** H..N portal kategori sütunları doğru eşlenir (test 958, 972);
  yazma onay modallı + yedekli.
- **Yanlış klasör/plaka sert bloğu:** `assertSelectedPhotoMatchesCase` — yanlış plaka
  (test 739) ve aynı plaka/farklı klasör (test 749) sert engellenir; KORUNUYOR.
- **Sessiz Excel yazımı YOK:** tüm xlsx yazma çağrı noktaları kullanıcı-niyeti kapılıdır
  (labor-excel-writer / case-list-exporter / commit servisi); regex guard testleri mevcut
  (1130, 2207, 2854).

## 11. Dashboard / liste / detay ekranları durumu

Dosya listesi, detay, notlar, takip tarihi, sorumlu/servis filtreleri, dashboard/KPI,
evrak/foto göstergeleri, HEIC/desteklenmeyen foto ayrımı (KPI + önizleme ayrımı), operasyon
sekmesi ve toast davranışı — tüm yüzeyler mevcut ve bileşen dosyalarında bilinen-kırık
işareti (TODO/FIXME/BUG) YOK. Detay yenileme ve liste seçim fallback'i mevcut davranış
testleri + office-audit kapsamında. Bloker yok.

## 12. Güvenlik / dependency / web-api kontrolü

- Runtime dependency: yalnız `pdf2json` (testle donuk). devDependencies yalnız derleme
  araçları; SQLite/mail/scraping/cloud paketi YOK (RC1 guard testi). Electron 41.7.1.
- Ağ yüzeyi: uygulamanın TEK bilinçli ağ çıkışı `src/main/import/gemini-client.ts`'tir
  (opsiyonel Gemini ücretsiz-katman görsel/metin analizi). Anahtar KODA GÖMÜLÜ DEĞİLDİR;
  kullanıcı Ayarlar'dan girer; anahtar yoksa özellik açık hatayla durur. Bunun dışında
  src'de `fetch`/axios/XMLHttpRequest/WebSocket/scraping YOK (RC1 guard testi bunu
  "fetch yalnız gemini-client'ta" kuralı olarak kalıcılaştırdı).
- Mail gönderimi YOK (nodemailer/sendMail/mailto taraması temiz — RC1 guard testi).
- Rapor üretimi yan yolu YOK; otomatik Google/web/AI isteği YOK (Gemini çağrısı yalnız
  kullanıcının başlattığı analiz akışında).
- Mutlak yol sızıntısı: kullanıcıya/geliştiriciye özgü yol YOK. Kalan eşleşmeler bilinçlidir:
  `DEFAULT_PCLOUD_ROOT` ayar şablonu, Tesseract/poppler standart kurulum yolları,
  ayarlar ekranı placeholder/yardım örnekleri.
- 400 satır kuralı: bu görev 400 satırı aşan dosya OLUŞTURMADI. Mevcut aşan dosyalar
  (renderer/main.ts 3588, excel-importer.ts 1076 vb.) belgeli legacy monolitlerdir; RC1
  için bloker değildir.

## 13. Test komutları

`npm run typecheck` ✓ (0) · `npm run build` ✓ (0) · `npm run test:behavior` ✓ ·
`npm run ci` ✓ · `node scripts/final-office-audit.mjs` ✓ · `npm audit` ✓ ·
`npm run test:dev-harness` ✓. Güncel sayılar teslim raporunda.

## 14. final-office-audit sonucu

**282 kontrol, geçti.** Kapsam: AGENTS yönetişimi, sürüm tutarlılığı, IPC kontrat güvenliği,
bilgi bankası kapsamı, import dry-run/commit kilidi, dosya sistemi dayanıklılığı (kısmi
senkron/bozuk dosya/şema), UI tutarlılığı, Excel iş akışları.

## 15. npm audit sonucu

**0 vulnerabilities.**

## 16. test:dev-harness sonucu

**31 kontrol, geçti.**

## 17. Kalan riskler

1. Legacy monolit dosyalar (renderer/main.ts vb.) — davranışsal risk değil, bakım riski;
   RC sonrası kademeli bölme önerilir.
2. Gemini istemcisi dış servise bağlıdır (kullanıcı tercihiyle); servis kesintisi yalnız o
   özelliği etkiler, çekirdek akışlar yereldir.
3. pCloud kısmi senkron senaryoları: revision/writeId + çift kontrol + otomatik-oluşturmama
   korumaları mevcut; yine de smoke testte gerçek klasörle doğrulanmalıdır.
4. Değer kaybı modülündeki belgeli tasarım sınırları (cyrb53, geçmiş cap 5) — v10.1'de
   raporlandı, bloker değil.

## 18. RC1 smoke test önerisi

Manuel smoke test (bu denetimde YÜRÜTÜLMEDİ; RC1 aşamasında yapılmalı):

1. Temiz klasörde uygulamayı aç.
2. Lokal aktif dosya klasörü seç.
3. 3 gerçek dosya ile test: normal trafik dosyası; kasko/onarım dosyası; değer kaybı
   ihtimali olan trafik dosyası.
4. Dosya listesi açılıyor mu?
5. Detay ekranı açılıyor mu?
6. Not ekleme/silme çalışıyor mu?
7. Evrak/hasar/olay yeri/onarım foto kontrolü çalışıyor mu?
8. AI İşçilik önizleme çalışıyor mu?
9. Ağır Hasar AI önizleme çalışıyor mu?
10. Değer Kaybı ön hesap/snapshot/freshness çalışıyor mu?
11. Excel import/export akışı bozulmamış mı?
12. Uygulama kapat/aç sonrası kayıtlar korunuyor mu?

## 19. Son karar

Çekirdek yazma mimarisi (atomic + revision/writeId + çift kontrol) sağlam; tüm AI çıktıları
preview-first ve onay-kapılı; Excel akışları kullanıcı-niyeti kapılı ve sert bloklu; IPC ve
dependency donuk; ağ yüzeyi tek ve bilinçli; testler/denetimler yeşil; bloker bulunmadı.

**HasarBotu RC1 smoke test aşamasına geçebilir.**
