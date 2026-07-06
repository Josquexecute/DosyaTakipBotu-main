# HasarBotu — RC1 Smoke Test Sonuç Formu

> Bu form, `RC1_SMOKE_TEST_CHECKLIST.md` yürütülürken doldurulur. Test yürütülmeden
> doldurulamaz; boş form "geçti" anlamına GELMEZ.

## 1. Test bilgileri

- Testi yapan: ______________________
- Tarih / saat: ______________________
- Süre: ______________________

## 2. Test edilen sürüm / commit / tarih

- Uygulama sürümü: ______________________
- Commit/kaynak durumu: ______________________
- Davranış kontrol sayısı (ci çıktısından): ______________________

## 3. Test ortamı

- Bilgisayar / OS: ______________________
- Aktif çalışma klasörü (yerel yol olduğu teyit edildi mi?): Evet ☐ Hayır ☐
- İnternet/Gemini anahtarı kullanıldı mı? (gerekmez): ______________________

## 4. Test edilen dosyalar

| # | Dosya tipi | Plaka/Dosya No | Not |
|---|---|---|---|
| 1 | Normal trafik dosyası | | |
| 2 | Kasko / onarım dosyası | | |
| 3 | Değer kaybı ihtimali olan trafik dosyası | | |

## 5. Genel sonuç tablosu

Checklist'teki her adım (5-19) için bir satır doldurulur:

| Adım | Beklenen Sonuç | Gerçek Sonuç | Durum | Not |
|---|---|---|---|---|
| 5 - Açılış | Hatasız açılış | | ☐ Geçti ☐ Kaldı | |
| 6 - Klasör seçimi | Yerel klasör seçimi + kilit | | ☐ Geçti ☐ Kaldı | |
| 7 - Dosya listesi | 3 dosya doğru listelenir | | ☐ Geçti ☐ Kaldı | |
| 8 - Detay ekranı | Detay + yenileme + sekme | | ☐ Geçti ☐ Kaldı | |
| 9 - Not ekle/sil | Onaylı silme, donma yok | | ☐ Geçti ☐ Kaldı | |
| 10 - Takip/sorumlu/servis | Güncelleme + filtre | | ☐ Geçti ☐ Kaldı | |
| 11 - Evrak/foto kontrolü | Göstergeler + plaka sert bloğu | | ☐ Geçti ☐ Kaldı | |
| 12 - HEIC ayrımı | Önizleme/desteklenmeyen ayrımı | | ☐ Geçti ☐ Kaldı | |
| 13 - Dashboard/KPI | Tutarlı KPI + filtreler | | ☐ Geçti ☐ Kaldı | |
| 14 - Excel import | Önizleme, onaysız yazma yok | | ☐ Geçti ☐ Kaldı | |
| 15 - Excel export | Kullanıcı-başlatmalı, doğru içerik | | ☐ Geçti ☐ Kaldı | |
| 16 - AI İşçilik Dağıtıcı | Onay modalsız yazmaz; H..N doğru | | ☐ Geçti ☐ Kaldı | |
| 17 - Ağır Hasar AI | Önizleme + onaylı kayıt | | ☐ Geçti ☐ Kaldı | |
| 18 - AI Değer Kaybı | Ön hesap + onaylı kayıt + tazelik | | ☐ Geçti ☐ Kaldı | |
| 19 - Kapat/aç kalıcılık | Veriler aynen; takip.json sağlam | | ☐ Geçti ☐ Kaldı | |

## Hata şiddeti tanımları

```txt
P0: Uygulama açılmıyor, veri kaybı, takip.json bozulması, kritik yazma hatası.
P1: Ana iş akışı çalışmıyor, AI/Excel ana akışı kırık, yanlış dosyaya yazma riski.
P2: Kullanımı zorlaştıran ama işi durdurmayan hata.
P3: Görsel/metin/cila notu.
```

## 6. P0 hata listesi

| # | Adım | Açıklama | Ekran görüntüsü |
|---|---|---|---|
| | | | |

## 7. P1 hata listesi

| # | Adım | Açıklama | Ekran görüntüsü |
|---|---|---|---|
| | | | |

## 8. P2/P3 notlar

| # | Şiddet | Açıklama |
|---|---|---|
| | | |

## 9. Modül bazlı sonuçlar

| Modül | Sonuç | Not |
|---|---|---|
| Çekirdek (liste/detay/not/filtre) | ☐ Geçti ☐ Kaldı | |
| Foto/evrak kontrolleri | ☐ Geçti ☐ Kaldı | |
| Dashboard/KPI | ☐ Geçti ☐ Kaldı | |

## 10. AI İşçilik sonucu

☐ Geçti ☐ Kaldı — Not: ______________________

## 11. Ağır Hasar AI sonucu

☐ Geçti ☐ Kaldı — Not: ______________________

## 12. AI Değer Kaybı sonucu

☐ Geçti ☐ Kaldı — Not: ______________________

## 13. Excel akışları sonucu

☐ Geçti ☐ Kaldı (import / export / dağıtıcı ayrı ayrı notlanır): ______________________

## 14. Kapanış / tekrar açılış sonucu

☐ Geçti ☐ Kaldı — takip.json elle doğrulandı mı?: Evet ☐ Hayır ☐

## 15. Karar

Aşağıdaki İKİ seçenekten biri açıkça işaretlenir (P0 veya P1 varsa ikincisi ZORUNLUDUR):

- ☐ **RC1 smoke test geçti; final source freeze aşamasına geçilebilir.**
- ☐ **RC1 smoke test kaldı; P0/P1 düzeltme gerekir.**

İmza / onaylayan: ______________________
