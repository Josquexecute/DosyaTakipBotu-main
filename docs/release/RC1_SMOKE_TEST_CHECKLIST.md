# HasarBotu — RC1 Manuel Smoke Test Kontrol Listesi

> Bu test MANUELDİR ve ofiste gerçek verilerle yürütülür. İnternet GEREKTİRMEZ (opsiyonel
> Gemini özelliği test kapsamı dışında bırakılabilir), ücretli servis GEREKTİRMEZ, EXE build
> GEREKTİRMEZ (mevcut geliştirme çalıştırması yeterlidir). pCloud CANLI KÖK OLARAK KULLANILMAZ —
> test yerel aktif klasörde yapılır. Sonuçlar `RC1_SMOKE_TEST_RESULT_FORM.md`'ye işlenir.

## 1. Amaç

RC1 hazırlık denetimi (bkz. `RC1_PREPARATION_AUDIT.md`) kod tarafını doğruladı; bu test gerçek
ofis verisiyle uçtan uca kullanıcı akışlarını doğrular. Geçerse final source freeze kapısına
geçilir.

## 2. Test öncesi koşullar

- [ ] `npm run ci` yeşil (1480 davranış kontrolü) ve `final-office-audit` 282.
- [ ] Test edilecek sürüm/commit numarası not edildi.
- [ ] Gerçek dosyaların YEDEĞİ alındı (test klasörüne KOPYALANDI — orijinaller üzerinde test yapılmaz).

## 3. Test ortamı

- [ ] Windows ofis bilgisayarı (hedef donanım).
- [ ] Yerel diskte aktif çalışma klasörü (pCloud sürücüsü DEĞİL).
- [ ] İnternet bağlantısı gerekmiyor; Gemini anahtarı girilmemiş olabilir.

## 4. Test edilecek gerçek dosya tipleri (tam 3 dosya — zorunlu)

1. **Normal trafik dosyası**
2. **Kasko / onarım dosyası**
3. **Değer kaybı ihtimali olan trafik dosyası**

## 5. Genel uygulama açılış testi

- [ ] Uygulama hatasız açılıyor; beyaz ekran yok; konsol kritik hatası yok.

## 6. Klasör seçimi testi

- [ ] Yerel aktif klasör seçilebiliyor; seçim öncesi gezinme kilidi çalışıyor.
- [ ] Yanlış/boş klasörde anlamlı mesaj gösteriliyor, çökme yok.

## 7. Dosya listesi testi

- [ ] 3 test dosyası listede görünüyor; plaka/dosya no doğru.
- [ ] Liste seçim fallback'i: seçili dosya kaybolursa liste güvenli davranıyor.

## 8. Dosya detay ekranı testi

- [ ] Her 3 dosyanın detayı açılıyor; alanlar doğru dolu; detay yenileme çalışıyor.
- [ ] Operasyon sekmesi durumunu koruyor.

## 9. Not ekleme / silme testi

- [ ] Not ekleniyor; içerik doğru kaydediliyor.
- [ ] Not silme ONAY SORUYOR (uygulama içi dialog); silme sonrası ekran donmuyor.

## 10. Takip tarihi / sorumlu / servis testi

- [ ] Takip tarihi güncelleniyor ve listede/filtrede yansıyor.
- [ ] Sorumlu ve servis filtreleri doğru daraltıyor.

## 11. Evrak / hasar / olay yeri / onarım foto kontrolü

- [ ] Evrak/foto varlık göstergeleri 3 dosyada gerçek içeriğe uyuyor.
- [ ] Yanlış plakalı foto seçimi SERT ENGELLENİYOR (bloklama mesajı görülmeli).

## 12. HEIC / foto önizleme ayrımı

- [ ] Desteklenen fotolar önizleniyor; HEIC/desteklenmeyenler ayrı sayılıyor (KPI) ve çökme yok.

## 13. Dashboard / KPI / filtre testi

- [ ] Dashboard açılıyor; KPI sayıları 3 dosyayla tutarlı; filtre kombinasyonları çalışıyor.

## 14. Excel import testi

- [ ] Import önizleme/eşleme gösteriyor; ONAYSIZ hiçbir yere yazmıyor.

## 15. Excel export testi

- [ ] Filtreli liste dışa aktarımı yalnız kullanıcı butonu + kayıt yeri diyaloğuyla çalışıyor.
- [ ] Üretilen dosya beklenen satır/sütunları içeriyor.

## 16. AI İşçilik Dağıtıcı testi

- [ ] Önizleme üretiliyor; son onay modalı ÇIKMADAN Excel'e yazılMIYOR.
- [ ] Onay sonrası H..N kategori sütunları doğru; yazım öncesi yedek oluşuyor.

## 17. Ağır Hasar AI testi

- [ ] Önizleme üretiliyor; onaysız kayıt YOK; onayla kayıt sonrası detayda görünüyor.

## 18. AI Değer Kaybı testi (3. dosyada)

- [ ] Zorunluluk/kontrol listesi doğru; ön hesap önizleniyor (kesin tazminat dili YOK).
- [ ] Form kaydı ve özet kaydı ONAY istiyor; geçmiş + tazelik (Güncel/Eski/bilinmiyor) görünüyor.

## 19. Kapat / aç kalıcılık testi

- [ ] Uygulama kapatılıp açılınca notlar/alanlar/özetler AYNEN duruyor; `takip.json` bozulmamış
      (revision artışı normal; dosya elle açılıp doğrulanabilir).

## 20. Hata kaydı nasıl tutulacak?

Her sapma `RC1_SMOKE_TEST_RESULT_FORM.md`'deki tabloya işlenir: adım no + beklenen + gerçek +
P0/P1/P2/P3 şiddeti + not. Ekran görüntüsü varsa dosya adı nota yazılır.

## 21. Geçme / kalma kararı

- **P0 veya P1 hata varsa test KALIR** → final source freeze BLOKLANIR; düzeltme + yeniden test.
- Yalnız P2/P3 varsa test GEÇER (P2/P3'ler nota alınır, freeze'i bloklamaz).
- Karar, result formdaki iki seçenekten biriyle açıkça yazılır.
