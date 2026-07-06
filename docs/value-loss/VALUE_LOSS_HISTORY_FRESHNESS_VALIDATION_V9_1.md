# Geçmiş Kayıt Tazeliği + Snapshot Karşılaştırma — Doğrulama/Sertleştirme (v9.1)

> Bu belge v9.1 DOĞRULAMA/SERTLEŞTİRME çıktısıdır. Yeni ürün özelliği eklemez; v9 geçmiş
> kayıt tazelik katmanının salt-okunur, mutasyonsuz ve güvenli olduğunu kanıtlar. v9 kodu
> incelendi; runtime düzeltmesi GEREKMEDİ (bu görev runtime-nötrdür — yalnız doküman + test).

## 1. Amaç

v9 ile gelen geçmiş kayıt (`calculationSnapshotHistory`) tazelik değerlendirmesinin — per-item
durum, aggregate sayaç, güncel/geçmiş ayrımı — determinist, mutasyonsuz, sıra-koruyan, ham-hash
sızdırmayan ve yasak final tazminat dili içermeyen bir SALT-OKUNUR görüntü katmanı olduğunu
doğrulamak ve regresyon testleriyle sabitlemek.

## 2. İncelenen dosyalar

- `src/shared/value-loss/value-loss-snapshot-freshness.ts` (helper: item + summary)
- `src/shared/value-loss/value-loss-form-fingerprint.ts` (cyrb53, saf)
- `src/shared/value-loss/value-loss-calculation-snapshot.ts` (inputFingerprint alanı)
- `src/shared/value-loss/value-loss-context-types.ts` / `-normalizer.ts` (history + fingerprint alanları)
- `src/shared/value-loss/value-loss-context-apply.ts` (checklist/draft türetimi)
- `src/shared/value-loss/value-loss-checklist.ts` (`vl-rapor-gecmis-guncel`)
- `src/shared/value-loss/value-loss-draft-builder.ts` (nitelik cümlesi)
- `src/renderer/app/components/value-loss-calculation-panel.ts` + `value-loss-helper.ts` (UI)
- `src/renderer/main.ts` (kayıt akışı — değişmedi)
- `scripts/behavior-regression-tests.mjs` (v9 + v9.1 testleri)
- `docs/value-loss/VALUE_LOSS_HISTORY_FRESHNESS_V9.md`, `..._V8_1.md`, `..._V8.md`

## 3. v9 ile eklenen history freshness davranışı

`evaluateSnapshotItemFreshness(currentValueLoss, snapshotLike)` tek kayıt için;
`evaluateHistoryFreshnessSummary(currentValueLoss)` tüm geçmiş için per-item durum + kompakt
sayaç (total/fresh/stale/unknown; none her zaman 0) döner. Güncel kayıtlı özet durumu (v8
`evaluateSnapshotFreshness`) DEĞİŞMEDEN çalışır; iki katman birbirinden bağımsızdır.

## 4. History item freshness hesaplama kuralı

Mevcut KAYITLI form parmak izi (`createValueLossFormFingerprint`) BİR KEZ hesaplanır; her history
item'ın `inputFingerprint`'i onunla karşılaştırılır:

- item/özet yok → `none`
- item parmak izi yok (eski sürüm) → `unknown` (bayat DEĞİL)
- parmak izi = güncel form parmak izi → `fresh`
- parmak izi ≠ güncel form parmak izi → `stale`

Kirli (kaydedilmemiş) forma göre hesaplanmaz; `stale` hata değildir, `unknown` bayat değildir.
`statusFromFingerprints` saf ve deterministtir (aynı girdi → aynı sonuç).

## 5. Aggregate sayaç doğrulaması

Sayaçlar item durumlarından türetilir: `total = items.length`, `fresh/stale/unknown = filter(status).length`,
`none = 0`. Karışık geçmiş (1 fresh + 1 stale + 1 fingerprint'siz) → total 3, fresh 1, stale 1,
unknown 1. `unknown` asla `stale` sayılmaz; `none` asla `stale` sayılmaz. Boş geçmiş → total 0.
Testlerle sabitlendi.

## 6. Sıra korunumu ve mutasyonsuzluk

`items` dizisi `history.map(...)` ile üretilir → görüntüleme sırası KORUNUR; duruma/savedAt'e göre
YENİDEN SIRALANMAZ. Helper girdi `valueLoss`, `calculationSnapshotHistory` dizisini, tek tek history
item nesnelerini, güncel `calculationSnapshot`'ı ve `inputFingerprint`/`savedAt`/`id` alanlarını
DEĞİŞTİRMEZ. Deep-clone before/after eşitliği ve tekrarlı çağrıda özdeş çıktı testlerle kanıtlandı.

## 7. Current snapshot freshness ile history freshness ayrımı

`evaluateSnapshotFreshness` (güncel özet) ile geçmiş özeti bağımsızdır:
- güncel fresh + eski geçmiş stale → doğru temsil
- güncel stale + bir geçmiş item fresh → doğru temsil
- güncel unknown + geçmiş fresh → doğru temsil
- güncel özet yok + geçmiş var → güvenli (aggregate yine çalışır)

History freshness güncel özet etiketini EZMEZ; güncel özet tutarı geçmiş tazeliğini, geçmiş item
tutarı güncel özet tazeliğini ETKİLEMEZ (parmak izi tutarı dışlar — v8.1 doğrulaması).

## 8. Fresh / stale / unknown / none davranışı

Etiketler Türkçe ve kullanıcı-güvenlidir (`Güncel` / `Eski veriyle oluşturulmuş olabilir` /
`Veri sürümü bilinmiyor` / `Kayıt yok`). Mesajlar ham hash İÇERMEZ, final tazminat dili İÇERMEZ,
otomatik yeniden hesaplama talimatı VERMEZ. `stale` mesajı yalnız ÖNERİ olarak "yenile/yeniden
kaydet" der (otomatik aksiyon değil); `unknown` mesajı "eski sürüm / veri sürümü bilinmiyor" der,
"bayat" demez.

## 9. Eski fingerprint'siz geçmiş kayıt uyumluluğu

Parmak izsiz eski geçmiş kayıtları GEÇERLİ kalır (`unknown`); normalize eski bağlamları aynen
yükler; hiçbir alan yeniden yazılmaz. Tazelik yalnız türetilmiş (derived) görüntüdür.

## 10. UI history freshness güvenliği

Panel: aggregate satırı ("Geçmiş özeti: N kayıt · X güncel · Y eski · Z bilinmiyor"), her kayıtta
"Veri durumu: …", stale/unknown uyarı satırı; güncel özet satırı (v8) korunur. Ham fingerprint/hash
GÖSTERİLMEZ; silme/geri-yükleme/düzenleme/rapor/mail/Excel/indir butonu YOKTUR. Render saf HTML
string üretir; kayıt/yeniden-hesap TETİKLEMEZ.

## 11. Checklist history freshness güvenliği

`vl-rapor-gecmis-guncel`: geçmiş yok → not_applicable/info; tümü fresh → ok/info; herhangi
stale/unknown (karışık dahil) → control_needed/warning. **ASLA kritik değildir** ve günlük dosya
işini yalnız geçmiş eski/bilinmiyor diye BLOKLAMAZ. v8 güncel-özet maddesi (`vl-rapor-ozet-guncel`)
ayrı ve korunur; kritik eksik-veri maddeleri DEĞİŞMEDİ.

## 12. Taslak builder history freshness güvenliği

`report_explanation`'a YALNIZ geçmişte stale/unknown kayıt varken tek kompakt nitelik cümlesi
eklenir; tümü fresh → cümle yok, geçmiş yok → cümle yok, özet yok → cümle yok. Tutar/yuvarlanmış
tutar/ham hash ASLA eklenmez. Taslak builder'ın yazma/mail/rapor/web yan etkisi yoktur.

## 13. Yasak final tazminat ifadeleri kontrolü

Geçmiş tazelik cümlelerinde şu ifadeler YOKTUR: `kesin değer kaybı`, `nihai tazminat`,
`ödenmesi gereken kesin tutar`, `kesin tazminat`. Regex testleriyle sabitlendi.

## 14. Yazma / Excel / mail / web güvenliği

freshness modülü saf (`fetch`/`axios`/`XMLHttpRequest`/`websocket`/`puppeteer`/`playwright`/
`serpapi`/`nodemailer`/`writeFile`/`.xlsx`/labor importu token'sız); IPC DEĞİŞMEDİ (86 invoke / 3
event); yeni runtime dependency YOK; AI İşçilik / AI Mode part-code importu YOK; `takip.json` yazımı
yalnız mevcut onaylı v2/v5/v6 mekanizmasıyla, geçmiş tazeliği hiçbir kalıcı veriye YAZMAZ.

## 15. Kalan riskler

1. cyrb53 ~53-bit; teorik çakışma yalnız "stale yerine fresh" (bir hatırlatma kaçar) riskidir —
   güvenlik/yazma sonucu yok.
2. Geçmiş item tazeliği güncel KAYITLI forma görecelidir; kaydedilmemiş form düzenlemeleri v5.1
   kirli-form engeliyle ayrı ele alınır.
3. Geçmiş 5 kayıtla sınırlıdır (v6); daha eskiler zaten düşer.

Bu riskler v9'da zaten belgeliydi; v9.1 kapsamında yeni risk oluşmadı.

## 16. Sonuç: v9 güvenle korunabilir mi?

v9 kodu bağımsız denetlendi: helper determinist ve mutasyonsuz, aggregate sayaçları doğru, sıra
korunuyor, güncel/geçmiş ayrımı doğru, fresh/stale/unknown/none davranışı doğru, UI ham hash
sızdırmıyor ve yıkıcı buton içermiyor, checklist maddesi asla kritik değil, taslak yalnız gerektiğinde
tek nitelik cümlesi ekliyor, yasak final tazminat dili yok, yeni yazma yolu yok. Runtime düzeltmesi
gerekmedi; yalnız bu doğrulama dokümanı ve ek regresyon testleri eklendi.

**v9 güvenle korunabilir.**
