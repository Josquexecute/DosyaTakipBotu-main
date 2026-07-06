# Özet Geçmişi + Cabrio + SEİK Metadata Doğrulama Raporu — AI Değer Kaybı Yardımcısı v6.1

> Bu belge bir DOĞRULAMA/sıkılaştırma denetimi çıktısıdır. v6 eklemeleri saldırgan (adversarial)
> probe'larla test edilmiş; bir ad-normalizasyon tutarsızlığı bulunup MINIMAL runtime
> düzeltmesiyle giderilmiştir.

## 1. Amaç

v6 ile eklenen `calculationSnapshotHistory` kayıt yolunun, kayıtlı özet/geçmiş UI'sının, taslak
referansının, cabrio yönlendirmesinin ve SEİK metadata bloğunun güvenliğini kanıtlamak;
"v6 güvenle korunabilir mi?" kararını vermek.

## 2. İncelenen dosyalar

Tüm `src/shared/value-loss/*` modülleri (history/cabrio-guidance dahil), renderer value-loss
bileşen/eşleme dosyaları, `main.ts` kayıt aksiyonları, behavior testleri ve v3.1/v4.1/v5.1
doğrulama dokümanları. Kayıt yolları: yalnız mevcut `tracking:update-value-loss-context`
IPC'si — ayrı/kontrolsüz yazma yolu YOKTUR.

## 3. v6 ile eklenen kalıcı veri alanları

`calculationSnapshotHistory` (kompakt geçmiş, en fazla 5) ve `vehicle.isCabrioOrConvertible`
(bool) — ikisi de `aiHelperContext.valueLoss` altında, geriye uyumlu (eski bağlamlar geçmişsiz/
bayraksız güvenle yüklenir; testli). SEİK metadata KALICI VERİ DEĞİLDİR (salt-okunur sabit).

## 4. Snapshot history veri yapısı

Geçmiş kaydı = kompakt özet (v5.1'de doğrulanan alanlar) + `id` (yerel görüntüleme kimliği,
sistem kimliği değildir) + `savedAt` + opsiyonel `label` (≤80). Probe (enjeksiyon denemesi):
`rawTracking`/`structuredParts`/`filePath` gibi anahtarlar normalize'da ATILIR; JSON taramasında
yerel yol/ham faktör/rapor-mail metni YOKTUR (kalıcı test).

## 5. History normalizasyon ve limit kuralları

Öğe: özet whitelist kuralları + id/savedAt zorunlu (yoksa öğe atılır) + label ≤80. Dizi: en yeni
başta varsayımıyla ilk 5 öğe (`VALUE_LOSS_SNAPSHOT_HISTORY_LIMIT = 5`); limit yalnız geçmiş
dizisini kırpar, başka alana dokunmaz. calculated olmayan geçmiş kaydına tutar SIZAMAZ
(builder + normalize çifte koruma; testli).

## 6. History kayıt akışı

Tek giriş: "Ön Hesap Özetini Kaydet" onaylı aksiyonu — güncel özeti günceller VE geçmişe bir
kayıt ekler (`appendSnapshotHistory`: en yeni başta, cap 5; aynı-saniye kayıtlarda kimlikler
benzersiz — probe'landı). Hesap yenileme, gerekçe kopyalama ve normal form kaydı geçmişe ASLA
eklemez (kaynak-assert'li). v5.1 kirli-form engeli aynen aktiftir.

## 7. Diff / onay mesajı kapsamı

Onay metni: **"Bu işlem yalnızca aiHelperContext.valueLoss.calculationSnapshot ve
calculationSnapshotHistory alanlarını güncelleyecektir."** Probe: kayıt girdisinin diff'i yalnız
"Ön hesap özeti / tarihi / geçmişi" satırlarıdır (başka alan satırı YOK). Geçmiş diff'i sayı
özetidir ("3 kayıt → 4 kayıt"; limitte "5 kayıt → 5 kayıt (son 5 kayıt korundu)"); JSON dökümü yok.

## 8. Normal form kaydının snapshot/history verisini koruması

Ortak `preservedSnapshotFields(saved)` yardımcısı normal kayıt + önizleme girdisine özeti VE
geçmişi aynen taşır — form kaydı bunları silemez/eziyemez (kaynak + davranış testli).

## 9. structuredParts / damageAmount korunumu

Özet/geçmiş kaydı girdisi KAYITLI alanlardan kurulur (v5.1 tasarımı) → `vehicle`, `damage`
(structuredParts + damageAmount), `marketAnalysis`, `evidence` birebir korunur (round-trip
derin-eşitlik testi v5.1'den beri yeşil; geçmiş eklenmesi bunu değiştirmedi — probe 4).

## 10. calculated history davranışı

amount + roundedAmount saklanır; disclaimer/status/katsayı kaynağı/formül-faktör özetleri her
kayıtta bulunur; UI'da yuvarlanmış tutar yalnız calculated kayıtlarda görünür
(`formatSnapshotLabel` calculated-dışında tutar üretmez).

## 11. control_needed / cannot_calculate history davranışı

Tutar alanları üretilmez ve normalize sızmayı düşürür; uyarı başında "tanı amaçlıdır; ödenebilir
tutar hesaplanmadı" notu korunur (özet builder'dan miras).

## 12. Saved snapshot/history UI güvenliği

"Kayıtlı Ön Hesap Özetleri" bloğu: güncel özet + en-yeni-önce liste (tarih/durum/tutar[yalnız
calculated]/uyarı-eksik sayısı/kaynak/disclaimer ✓ göstergesi). **Silme/geri yükleme/düzenleme/
rapor/mail/Excel butonu YOKTUR** (regex-testli); blok salt görüntülemedir, render yazma yapmaz.

## 13. Taslak builder saved snapshot referansı

Referans cümleleri YALNIZ kayıtlı özet varken eklenir; calculated için "hesaplanabilir durumda
kaydedilmiştir; nihai değerlendirme eksper kanaati..." (tutarsız), tanı durumları için
"tanı amaçlıdır; ... ödenebilir tutar sonucu oluşturulmamıştır". Tutar taslağa ASLA girmez.

## 14. Yasak final tazminat ifadeleri kontrolü

"kesin değer kaybı", "nihai tazminat", "ödenmesi gereken kesin tutar", "kesin tazminat" —
taslak/kopya/özet/geçmiş çıktılarında regex-testli olarak YOKTUR; disclaimer zorunludur.

## 15. Cabrio / üstü açılır araç yönlendirmesi

`isCabrioOrConvertible` güvenli normalize edilir (yalnız true/false). Bayrak → esaslar 3.7
yönlendirmesi ("özel satırları bilinçli seçin; otomatik ikame yapılmaz"). Parça adı otomatik
DEĞİŞTİRİLMEZ, katsayı otomatik EZİLMEZ, satır otomatik SEÇİLMEZ — cabrio satırı kaynak değeri
(4.5, satır 264-265) ile aynen çözülür ve hesap preview-only kalır (testli).

## 16. Cabrio özel satır ve uyumsuzluk davranışı

Cabrio-özel satır (`TİCARİ VE CABRİO` adlı) → özel-satır kontrol uyarısı; bayraksız araçta bu
satır → **critical uyumsuzluk uyarısı**. **v6.1'de bulunan ve düzeltilen tutarsızlık:** checklist
tetikleyicisi ad eşleşmesinde boşluk sadeleştirmesi yapmıyordu (çift boşluklu adda guidance
uyarırken checklist maddesi `not_applicable` kalıyordu) → apply modülü artık guidance ile AYNI
`normalizeValueLossPartName` normalizasyonunu kullanır (regresyon testli). Checklist maddesi
ilgisiz durumda `not_applicable` (kritik değil).

## 17. SEİK metadata / update-watch davranışı

`SEIK_2026_V1_COEFFICIENT_METADATA`: sürüm + kaynak modül adı + v3.1/v4.1/v5.1 doğrulama
dokümanı yolları (repo-göreli; yerel TAM yol içermez — probe'landı) + 4 bilinen varsayım
(J=TAM, airbag hariç, D 5001+ saat, OTOBÜS türe bağlı) + "internet kontrolü ve otomatik
güncelleme YAPILMAZ" notu. UI bloğu salt bilgidir; hiçbir ağ/indirme çağrısı yoktur (guard
testli). Checklist güncellik maddesi info önemindedir (kritik değil).

## 18. Yazma / Excel / mail / web güvenliği

history/cabrio modülleri saf (ağ/mail/Excel/dosya-yazımı token'sız); IPC değişmedi (86/3);
yeni runtime dependency yok; tek yazma yolu mevcut onaylı mekanizmadır; geniş tracking
mutasyonu yoktur.

## 19. Kalan riskler

1. Geçmiş 5 kayıtla sınırlı; daha eskiler düşer (bilinçli kompaktlık; diff cap notu gösterir).
2. Geçmiş kayıtları kayıt anındaki katsayı seti sürümünü yansıtır (metadata + savedAt ile izlenebilir).
3. Cabrio yönlendirmesi bilgi/kontrol düzeyindedir; 3.7 ikamesi bilinçli olarak otomatikleştirilmemiştir.
4. SEİK güncellik maddesi kalıcı hatırlatmadır (set değişmedikçe geçerli; kullanıcı işaretleyemez).

## 20. Sonuç: v6 güvenle korunabilir mi?

Saldırgan probe'lar tek gerçek sorun buldu (cabrio ad-normalizasyon tutarsızlığı) ve bu sorun
tek satırlık runtime sıkılaştırmasıyla giderilip regresyon testiyle sabitlendi; geçmiş
kompaktlığı, tutar sızmazlığı, kayıt kapsamı, koruma zinciri, UI salt-görüntüleme, taslak
nitelik-referansı ve metadata'nın ağsız doğası doğrulandı.

**v6 güvenle korunabilir.**
