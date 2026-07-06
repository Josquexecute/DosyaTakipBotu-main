# AI Değer Kaybı Yardımcısı — Ofis Kullanım Notu (v10)

> Bu not, değer kaybı ekranını ofiste kullanan eksper/asistan için pratik bir kılavuzdur.
> v10 yalnız metin/etiket/düzen sadeleştirmesidir; yeni işlev EKLEMEZ. Ekran salt-okunur ve
> önizleme önceliklidir (preview-first).

## 1. Amaç

Değer kaybı ekranındaki metin, başlık, buton ve durum ifadelerini ofis kullanıcısı için net,
güvenli ve tutarlı hale getirmek; hiçbir sonucu kesin tazminat gibi göstermemek.

## 2. Bu modül ne yapar?

- 01.07.2026 sonrası trafik/ZMSS dosyalarında değer kaybı **kontrol zorunluluğunu** işaretler.
- 5 kategoride **kontrol listesi** ve **istisna/uyarı** üretir.
- Yerel SEİK katsayı setiyle **ön hesap** (Reel Piyasa Analiz Ön Hesabı) sonucunu ÖNİZLER.
- Kullanıcı onayıyla **ön hesap özeti** ve **geçmiş özetleri** tutar; her kaydın **veri sürümü
  (tazelik)** durumunu gösterir.
- İç not / rapor açıklaması / eksik bilgi maili için **kopyalanabilir taslak metin** üretir.

## 3. Bu modül ne yapmaz?

- Kesin/nihai tazminat tutarı **belirlemez**.
- `takip.json`'a, Excel'e veya rapora **kendiliğinden yazmaz** (yalnız açık onayla kaydeder).
- Mail **göndermez**, rapor dosyası **üretmez**.
- İnternete/Google'a/AI servisine **istek atmaz**; katsayıları **otomatik güncellemez**.
- Ön hesabı/özeti/geçmişi **otomatik yeniden hesaplamaz** ve **otomatik kaydetmez**.
- Serbest metinden parça katsayısı **türetmez**; katsayı **uydurmaz**.

## 4. Ön hesap nedir?

"Ön hesap", girilen veriler ve yerel doğrulanmış katsayı seti üzerinden oluşturulan bir ÖN
DEĞERLENDİRMEDİR. Amaç, dosyanın değer kaybı yönünden nasıl ele alınacağını görmektir; ödenecek
kesin bir tutar değildir.

## 5. Kesin tazminat değildir uyarısı

Her hesap/kopya/özet/taslak yüzeyinde şu anlam korunur: **Bu çıktı kesin tazminat sonucu
değildir. Nihai değerlendirme eksper kanaati, dosya kapsamı ve ilgili mevzuat/SEİK esaslarıyla
birlikte yapılmalıdır.** "Kesin değer kaybı", "nihai tazminat", "ödenmesi gereken kesin tutar"
gibi ifadeler ekranda ve taslaklarda kullanılmaz.

## 6. Kayıtlı özet ve geçmiş ne anlama gelir?

- **Kayıtlı ön hesap özeti (güncel):** en son onayla kaydettiğiniz ön hesabın kompakt kaydı.
- **Geçmiş ön hesap özetleri:** daha önce kaydedilmiş özetler (en çok 5 kayıt; en eskisi düşer).
  Buradan **silme/geri yükleme/düzenleme yapılmaz** — yalnız görüntülenir.

## 7. Veri sürümü / tazelik uyarısı ne anlama gelir?

Her kayıt, kaydedildiği andaki form verisinin **veri sürümüne** bağlanır. Ekranda:

- **Güncel:** kayıt, mevcut form verileriyle aynı veri sürümüne aittir.
- **Eski veriyle oluşturulmuş olabilir:** form, kayıttan sonra değişmiş olabilir. Ön hesabı
  yenileyip yeniden kaydetmeniz önerilir (otomatik yapılmaz).
- **Veri sürümü bilinmiyor:** eski sürümde kaydedildiği için karşılaştırılamıyor (hata değildir).

"Güncel kayıtlı özet durumu" (güncel özet) ile "Geçmiş kayıt veri durumu" (geçmiş kayıtlar) ayrı
gösterilir. Uyarılar günlük işi **bloklamaz**; ham teknik değer (parmak izi/hash) gösterilmez.

## 8. Eksik/kontrol gereken bilgiler nasıl okunur?

"Ön Hesap İçin Eksik/Kontrol Gereken Bilgiler" özeti en fazla 8 madde gösterir; fazlası
"+N madde daha" olarak belirtilir. Hiç eksik yoksa: *"Eksik kritik veri görünmüyor; yine de
eksper kontrolü gereklidir."* Bu özet salt-okunurdur; hiçbir alanı otomatik doldurmaz.

## 9. SEİK katsayı seti bilgisi nasıl yorumlanır?

Ekranda: **Katsayı seti: seik-2026-07-v1 / yerel doğrulanmış set** ve *"Otomatik güncelleme
yoktur; yeni SEİK modülü gelirse yeniden doğrulama gerekir."* Bu ifade modülün geçersiz olduğu
anlamına GELMEZ; yalnız güncellemenin elle ve doğrulamalı yapıldığını hatırlatır (prosedür:
`docs/dev/SEIK_REVALIDATION_PROCEDURE.md`).

## 10. Günlük kullanımda dikkat edilecekler

- Bilinmeyen alanları **"Belirsiz"** bırakın; uydurma değer girmeyin.
- Kaydetmeden önce **önizleme/diff**'i kontrol edin; kayıt yalnız onayla yazılır.
- "Eski veriyle oluşturulmuş olabilir" görürseniz ön hesabı yenileyip yeniden kaydedin.
- Taslakları kopyalayıp kullanın; program mail göndermez/rapor üretmez.
- Sonuçları her zaman eksper kanaati ve dosya kapsamıyla birlikte değerlendirin.

## 11. Sonuç: v10 ofis kullanımına hazır mı?

Metinler "ön hesap" dili etrafında standartlaştı; butonlar kesin tazminat/Excel/mail/rapor/internet
çağrışımı yapmıyor; güncel/geçmiş tazelik durumları görsel olarak ayrıldı; eksik-veri özeti ve
katsayı seti bilgisi kullanıcıyı yanıltmadan/korkutmadan gösteriliyor; taslaklar nitelikseldir ve
tutar/hash içermez; yeni işlev, yeni yazma yolu, yeni bağımlılık eklenmedi.

**v10 ofis kullanımına hazırdır.**
