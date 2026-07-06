# Geçmiş Kayıt Tazeliği + Snapshot Karşılaştırma UX — AI Değer Kaybı Yardımcısı v9

> Bu belge v9 tasarım + doğrulama çıktısıdır. Geçmiş kayıt tazelik katmanı SALT-OKUNURDUR:
> veri değiştirmez, yeniden hesaplamaz, kaydetmez, geçmiş sırasını bozmaz, eski kayıtları
> geçersiz kılmaz.

## 1. Amaç

Kayıtlı ön hesap özeti geçmişindeki (`calculationSnapshotHistory`) her kaydın, mevcut KAYITLI
değer kaybı form verisiyle aynı "veri sürümüne" ait olup olmadığını kayıt bazında göstermek;
geçmiş için kompakt bir tazelik özeti (aggregate) sunmak.

## 2. Neden geçmiş kayıt tazeliği gerekli?

v8 yalnız GÜNCEL kayıtlı özet için tazelik gösteriyordu. Geçmişte birden fazla özet olabilir ve
kullanıcı form verisini değiştirmiş olabilir; hangi geçmiş kayıtların güncel veriyle uyumlu,
hangilerinin eski/bilinmeyen sürüme ait olduğu kayıt bazında görünmeli.

## 3. Mevcut snapshot tazeliği ile geçmiş kayıt tazeliği farkı

- **Güncel kayıtlı özet durumu** (`evaluateSnapshotFreshness`): `calculationSnapshot` için — v8'den
  DEĞİŞMEDEN çalışır.
- **Geçmiş kayıt veri durumu** (`evaluateHistoryFreshnessSummary` / `evaluateSnapshotItemFreshness`):
  her history item için ayrı hesaplanır ve güncel özet durumunu EZMEZ. Güncel özet fresh iken
  eski geçmiş kayıtları stale/unknown olabilir (probe ile doğrulandı).

## 4. History item freshness hesaplama kuralı

Mevcut KAYITLI form parmak izi (`createValueLossFormFingerprint(currentValueLoss)`) BİR KEZ
hesaplanır; her history item'ın `inputFingerprint`'i onunla karşılaştırılır. Kirli (kaydedilmemiş)
form durumuna göre hesaplanmaz. Ham hash mesaj/etiketlerde GÖSTERİLMEZ. Geçmiş dizisi
DEĞİŞTİRİLMEZ/YENİDEN SIRALANMAZ (girdi mutasyonsuz — probe).

## 5. Fresh / stale / unknown / none durumları

- history item/özet yok → `none`
- item parmak izi yok (eski sürüm) → `unknown` (bayat DEĞİL)
- item parmak izi = güncel form parmak izi → `fresh`
- farklı → `stale`
`stale` hata değildir; `unknown` bayat değildir; günlük iş bloklanmaz.

## 6. UI gösterimi

Kayıtlı Ön Hesap Özetleri bloğunda: "Güncel kayıtlı özet durumu: …" (v8 satırı korunur) + her
geçmiş kaydında "Veri durumu: Güncel / Eski veriyle oluşturulmuş olabilir / Veri sürümü bilinmiyor";
stale/unknown kayıtta kısa uyarı satırı. Salt-okunur; ham fingerprint yok; otomatik yeniden-hesap/
kayıt yok; silme/geri yükleme/düzenleme/rapor/mail/Excel/web butonu yok.

## 7. Geçmiş özeti aggregate satırı

Liste üstünde kompakt satır: "Geçmiş özeti: N kayıt · X güncel · Y eski · Z bilinmiyor"
(`evaluateHistoryFreshnessSummary` sayaçlarından). Geçmiş yoksa satır gösterilmez.

## 8. Checklist etkisi

Yeni madde "Ön hesap geçmişinde eski veriyle oluşturulmuş kayıt var mı?": geçmiş yok →
not_applicable/info; tümü fresh → ok/info; herhangi stale/unknown → control_needed/warning.
**ASLA kritik değil**; günlük dosya işini bloklamaz. Mevcut güncel-özet tazelik maddesi ve kritik
eksik-veri maddeleri DEĞİŞMEDİ.

## 9. Taslak etkisi

`report_explanation`'a YALNIZ geçmişte stale/unknown kayıt varken tek nitelik cümlesi eklenir
("… en son kayıtlı özet esas alınmalı ve gerekirse ön hesap yenilenmelidir."). Tümü fresh
olduğunda gürültü cümlesi EKLENMEZ; geçmiş boşsa cümle yok. Tutar/yuvarlanmış tutar/ham hash
ASLA eklenmez; final tazminat dili yoktur.

## 10. Geriye uyumluluk

Parmak izsiz eski geçmiş kayıtları GEÇERLİ kalır (`unknown`); normalize eski bağlamları aynen
yükler; hiçbir alan yeniden yazılmaz. Tazelik yalnız türetilmiş (derived) görüntüdür — kalıcı
veriye yazılmaz.

## 11. Yazma / Excel / mail / web güvenliği

freshness modülü saf (ağ/mail/Excel/dosya-yazımı token'sız); IPC değişmedi (86/3); yeni runtime
dependency yok; labor/AI-Mode importu yok; kayıt yalnız mevcut onaylı v2/v5/v6 mekanizmasıyla.

## 12. Kalan riskler

1. cyrb53 ~53-bit; teorik çakışma yalnız "stale yerine fresh" (bir hatırlatma kaçar) riskidir —
   güvenlik sonucu yok.
2. Geçmiş item tazeliği güncel KAYITLI forma görecelidir; kaydedilmemiş form düzenlemeleri v5.1
   kirli-form engeliyle ayrı ele alınır.
3. Geçmiş 5 kayıtla sınırlıdır (v6); daha eskiler zaten düşer.

## 13. Sonuç: v9 güvenle korunabilir mi?

Geçmiş kayıt tazelik katmanı tamamen salt-okunurdur; per-item durumlar, aggregate sayaçlar,
güncel/geçmiş ayrımı, sıra korunumu, mutasyonsuzluk, ham-hash gizliliği, checklist non-kritiklik
ve draft gürültüsüzlüğü regresyon testleriyle sabitlendi; geriye uyumluluk korundu; otomatik
hesap/yazma yok; tutar taslağa girmez.

**v9 güvenle korunabilir.**
