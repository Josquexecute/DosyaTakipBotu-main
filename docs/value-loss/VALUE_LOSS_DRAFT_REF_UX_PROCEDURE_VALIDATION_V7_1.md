# Taslak Referansı + UX + SEİK Prosedür Doğrulama Raporu — AI Değer Kaybı Yardımcısı v7.1

> Bu belge bir DOĞRULAMA/sıkılaştırma denetimi çıktısıdır. v7 eklemeleri (kayıtlı özet taslak
> referansı, eksik-veri hızlı özeti, katsayı seti durum satırı, SEİK yeniden-doğrulama prosedür
> dokümanı) saldırgan (adversarial) probe'larla test edilmiştir.

## 1. Amaç

v7 ile eklenen üç yüzeyin güvenliğini bağımsız olarak kanıtlamak: (a) draft-builder kayıtlı özet
referans cümleleri, (b) hesap panelindeki eksik-veri hızlı özeti + katsayı seti durum satırı,
(c) `docs/dev/SEIK_REVALIDATION_PROCEDURE.md`. Karar: "v7 güvenle korunabilir mi?"

## 2. İncelenen dosyalar

`value-loss-draft-builder.ts` (factSentences), `value-loss-context-apply.ts` (draftFacts),
`value-loss-calculation-panel.ts` (renderMissingQuickSummary + renderCoefficientMetadata),
`value-loss-helper.ts` (snap-ref satırı), `value-loss-checklist.ts` (SEİK maddesi),
`docs/dev/SEIK_REVALIDATION_PROCEDURE.md`, behavior testleri. Kayıt yolları değişmedi; v7
hiçbir yeni yazma yolu eklemedi (yalnız salt-okunur UI + taslak metni + doküman).

## 3. Kayıtlı özet taslak referansı — güvenlik

- **Tutar sızıntısı YOK (probe):** tüm facts açık + calculated snapshot ile üç taslak türünün
  (internal_note / report_explanation / missing_info_mail) hiçbirinde sayı+TL kalıbı bulunmadı.
- **Snapshot yokken referans YOK (probe):** `calculationSnapshot` olmayan bağlamda "referans
  olarak bulunmaktadır" cümlesi hiç eklenmiyor.
- **Duruma özel doğru cümle (probe):** calculated → "girilen verilerle hesap yapılabilir durumda
  olduğunu göstermektedir…"; control_needed → "bazı veriler kontrol gerektirdiğinden ödenebilir
  tutar sonucu oluşturulmamıştır."; cannot_calculate → "zorunlu veri eksikleri nedeniyle tutar
  hesaplanmamıştır." Çapraz bulaşma yok (bir durumun cümlesi başka durumda çıkmıyor).
- **Manipüle status'te çökme YOK (probe):** `snapshotStatus` beklenmeyen değere zorlandığında
  yalnız generic referans cümlesi kalır; durum-cümlesi eklenmez, tutar sızmaz, hata oluşmaz.
- Referans cümleleri yalnız `report_explanation` gövdesinde + panel taslak bloğundaki UI önizleme
  satırında bulunur; `internal_note`/`missing_info_mail` gövdesine tutar/durum cümlesi girmez.

## 4. Yasak final tazminat ifadeleri

"kesin değer kaybı", "nihai tazminat", "ödenmesi gereken kesin tutar", "kesin tazminat" —
tüm taslak türlerinde (tüm facts açıkken dahil) regex-testli olarak YOKTUR.

## 5. Eksik-veri hızlı özeti (missing input quick summary)

- Kaynak: mevcut hesap sonucunun `missingInputs` + `warnings` birleşimi.
- **Cap anlamlı (probe):** 12 bilinmeyen parça senaryosunda birleşik 19 madde üretilir; panel
  `slice(0, MISSING_SUMMARY_CAP=8)` ile ilk 8'i gösterir, kalanı "+N madde daha" olarak sayar.
- **Boş durum ulaşılabilir (probe):** temiz calculated senaryoda birleşik 0 madde → "Eksik kritik
  veri görünmüyor; yine de eksper kontrolü gereklidir." metni gösterilir.
- **Mutlak yol sızıntısı YOK (probe):** hiçbir madde sürücü harfiyle başlayan Windows yolu veya
  kullanıcı-dizini (macOS home) yolu içermez; kullanıcı parça adları `escapeHtml` ile kaçışlanır.
- Salt-okunur: otomatik doldurma/yazma/ağ/AI/Excel yok (kaynak guard).

## 6. Katsayı seti durum bilgisi

Panelde net durum satırı: "Katsayı seti: **seik-2026-07-v1** / yerel doğrulanmış set" +
"Otomatik güncelleme yoktur; yeni SEİK modülü gelirse yeniden doğrulama gerekir." Ayrıntılı
"Katsayı Seti Bilgisi" bloğu (v6 metadata) korunur. **Güncelle/İndir butonu YOK**; internet
kontrolü/indirme çağrısı YOK (kaynak guard).

## 7. SEİK yeniden-doğrulama prosedür dokümanı

`docs/dev/SEIK_REVALIDATION_PROCEDURE.md` 15 zorunlu bölümü içerir (amaç, ne zaman, kaynak/sürüm,
ana katsayı, parça katsayı, TAM/LOKAL, hava yastığı/katsayı-dışı, duplicate/VLOOKUP, grup
eşlemeleri, otobüs/araç türü, cabrio, snapshot/history geriye uyumluluk, zorunlu test komutları,
teslim raporu formatı, son karar). **Otomatik web güncellemesi/indirme/Excel yazımı EKLENMEZ**;
belge bunu açıkça vurgular. Son karar formatı: "geçilebilir." / "düzeltme gerekir.".

## 8. Checklist

SEİK güncellik maddesi prosedür dokümanına işaret eder (**info önem, kritik değil**); kayıtlı
özet maddesi opsiyonel/info; mevcut kritik eksik-veri maddelerinin davranışı değişmedi.

## 9. Yazma / Excel / mail / web güvenliği

Panel + draft-builder saf/salt-okunur (ağ/mail/Excel/dosya-yazımı token'sız); IPC değişmedi
(86/3); yeni runtime dependency yok; tek yazma yolu mevcut onaylı v2/v5/v6 mekanizmasıdır;
geniş tracking mutasyonu yoktur.

## 10. Kalan riskler

1. **Özet-tazelik uyarısı bilinçli EKLENMEDİ:** form güncelleme zamanına göre bayatlık
   karşılaştırması için güvenilir zaman-damgası altyapısı olmadığından (görev kuralı: uydurma
   staleness mantığı kurma) referans satırı/cümlesi kayıtlı özetin durumunu gösterir ancak
   "form değişti, özet bayat olabilir" uyarısı vermez. Kayıtlı özet kullanıcı onaylı tarihî
   kayıttır; kullanıcı yeni özet kaydederek günceller.
2. Eksik-veri hızlı özeti mevcut sonucun anlık kopyasıdır; kalıcı değildir.
3. SEİK prosedürü manuel süreçtir (otomatik tetik yok; bilinçli).

## 11. Sonuç: v7 güvenle korunabilir mi?

Saldırgan probe'lar (tutar sızıntısı, çapraz-bulaşma, manipüle status, snapshot-yok, cap
anlamlılığı, yol sızıntısı, boş-durum) v7 yüzeylerinde GÜVENLİK AÇIĞI BULMADI; runtime
düzeltmesi gerekmedi. Tüm değişmezler (tutar-yok, yasak-dil-yok, salt-okunur, otomatik-güncelleme-yok,
kritik-değil-checklist) doğrulandı ve regresyon testleriyle sabitlendi.

**v7 güvenle korunabilir.**
