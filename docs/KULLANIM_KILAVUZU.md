# Kullanım Kılavuzu

HasarBotu v0.6.0, Baran Global Ekspertiz'in hasar dosyalarını tek masaüstü uygulamasında takip etmesi için hazırlanmıştır. Uygulama dosya klasörlerini okur, her dosyanın takip bilgisini `_HASARBOTU/takip.json` içinde tutar ve kullanıcı onayı olmadan kritik veri yazmaz.

## İlk Açılış

1. Uygulamayı açın.
2. Aktif yıl/ana klasör seçimini kontrol edin.
3. Dosya listesinin yüklenmesini bekleyin.
4. Dashboard üzerinde açık dosya, eksik evrak, eksik fotoğraf, portal bekleyen ve veri kalitesi özetlerini inceleyin.
5. Gemini kullanılacaksa API anahtarını Ayarlar ekranında yerel olarak kaydedin.

## Günlük İş Akışı

| Adım | Ekran | Amaç |
| --- | --- | --- |
| 1 | Dashboard | Günün risk ve iş yükünü görmek |
| 2 | Dosyalar | Plaka, dosya no, sorumlu, servis, durum ve kalite filtreleriyle dosya bulmak |
| 3 | Dosya detayı | Not, görev, sorumlu, takip tarihi, ağır hasar ön değerlendirmesi ve operasyon alanlarını güncellemek |
| 4 | Evrak & Fotoğraf | Eksik belge/fotoğraf, HEIC/RAW, bozuk fotoğraf ve plaka risklerini kontrol etmek |
| 5 | Excel & Parça Veri Merkezi | AI işçilik önizlemesi/kaydetme ve parça listesi fotoğraf okuma yapmak |
| 6 | Sorunlar / Risk | pCloud, corrupt JSON, revision/writeId ve veri kalitesi uyarılarını kapatmak |

## Dosyalar Ekranı

Dosyalar ekranı yoğun ofis kullanımına göre tasarlanmıştır:

- Plaka, dosya no, ihbar no, sorumlu ve servis araması.
- Açık dosya, eksik evrak, eksik fotoğraf, format uyarısı, risk ve veri kalitesi filtreleri.
- Bendeki, Geciken, Bugün, Bu Hafta, Sahipsiz ve Durgun iş filtreleri.
- Filtrelenmiş listeyi Excel olarak dışa aktarma.
- Seçili dosyayı tam yıl taraması yapmadan yenileme.

## Dosya Detayı

Dosya detayında şu alanlar yönetilir:

- Dosya durumu ve workflow statüsü.
- Sorumlu, öncelik, takip tarihi ve son işlem tarihi.
- Notlar ve yapılacaklar.
- Rücu, KTT kusur ve ağır hasar yardımcı alanları.
- Parça/işçilik takip bilgileri.
- Evrak ve fotoğraf kontrol özeti.

Her mutasyon `takip.json` içinde revision artırır ve yeni writeId üretir. Diskte aynı anda farklı bir kayıt görülürse uygulama sessizce ezmez; kullanıcıya risk olarak bildirir.

## Ağır Hasar AI Ön Değerlendirme

v0.6.0 ile ağır hasar ekranında ekonomik oran ve yapısal kritik parça eşiği ayrı değerlendirilir.

- Rayiç ve hasar tutarı ekonomik `%60` eşik için hesaplanır.
- Yapısal kritik parçalar ayrıca puanlanır; tek başına eşiği aşan parça varsa ekonomik oran düşük kalsa da risk açık gösterilir.
- `Ön Göğüs` satırı eksper tarafından yapısal ön göğüs sacı/firewall olarak teyit edilmeden 40 puan almaz.
- Teyitsiz `Ön Göğüs` satırında sistem kontrol gerekli sorusu üretir: torpido/plastik göğüs mü, yapısal sac/firewall mı?
- Sonuç notu ve mail taslağı nihai eksper kararının yerine geçmez; dosya sorumlusu tarafından incelenir.

## Evrak ve Fotoğraf Kontrolü

Uygulama klasör içeriğine göre temel belge ve fotoğraf kontrolü yapar:

- Trafik/kasko dosya tipine göre evrak eksikleri.
- İhbar PDF metninden plaka kontrolü.
- HASAR fotoğrafları, KM, Vites, Şase/Şasi ve Olay Yeri fotoğrafları.
- HEIC/RAW gibi desteklenmeyen formatları gerçek eksik fotoğraftan ayrı gösterme.
- Bozuk fotoğraf header şüphesi.

Parça listesi fotoğrafı AI ile okunurken aktif dosya bağlamı kontrol edilir. Fotoğraf farklı dosya klasöründen geliyorsa veya aynı plaka olsa bile farklı dosya klasöründeyse işlem hard-block ile durur.

## Excel & Parça Veri Merkezi

Bu bölüm üç ana iş için kullanılır:

1. AI Otomatik İşçilik Dağıtıcı ile Excel önizleme, düzeltme ve onaylı kaydetme.
2. AI İşçilik Dağıtıcı ile H-N işçilik kolonlarına öneri üretme.
3. Parça listesi fotoğrafını Gemini ile okuyup temiz parça + işçilik Excel'i üretme.

AI İşçilik Dağıtıcı her zaman önce önizleme üretir. Kullanıcı satırları görmeden ve kaydetme konumu seçmeden Excel yazılmaz.

Detay: [EXCEL_AI_ISCILIK_DAGITICI.md](EXCEL_AI_ISCILIK_DAGITICI.md)

## Sorunlar / Risk Paneli

Panelde görülebilecek kritik uyarılar:

- Bozuk veya desteklenmeyen `takip.json`.
- pCloud conflicted copy.
- Same-revision different-write.
- Revision regression.
- Kısmi senkron veya eksik takip dosyası.
- Eksik evrak/fotoğraf ve veri kalitesi sorunları.

Bu uyarılar kapatılmadan canlı dosyada işlem yapmak önerilmez. Geri dönüş gerektiğinde [GERI_DONUS_PLANI.md](GERI_DONUS_PLANI.md) izlenir.
