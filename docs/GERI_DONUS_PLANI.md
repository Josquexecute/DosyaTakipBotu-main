# Geri Dönüş (Rollback) Planı

Canlı kullanımda kritik bir sorun çıkarsa hızlı ve veri kaybı olmadan eski duruma dönüş adımları.

## Tetikleyiciler
- Çözülemeyen veri çakışması veya sessiz ezme şüphesi.
- Bozuk takip dosyalarının yaygınlaşması.
- Uygulamanın açılmaması veya tarama hatası.

## İlke
**Hiçbir adımda `_HASARBOTU/takip.json` ana dosyaları silinmez veya elle ezilmez.** Uygulama bozuk dosyada bile ana veriyi yerinde korur ve kopya-yedek alır.

## Adımlar

### 1. Uygulamayı durdur, eski sürüme dön
- Sorunlu sürümü kapatın; bir önceki kararlı EXE'yi kurun (bkz. [OFIS_DAGITIM_KONTROL_LISTESI.md](OFIS_DAGITIM_KONTROL_LISTESI.md)).
- Aktif kök klasör değişmez; veri yerinde kalır.

### 2. Çakışma/regresyon durumunda Disk Baseline Kabul
Bir dosyada "aynı revizyonda farklı writeId" veya "revizyon gerilemesi" uyarısı varsa:
- Diskteki güncel veriyi doğru kabul etmek için **"Diskteki Sürümü Kullan"** ile ilerleyin.
- Gerekirse **Disk Baseline Kabul** adımı uygulanır: uygulamanın yerel **local write-index baseline** kaydı, diskteki mevcut `takip.json` (revizyon + writeId) ile yeniden hizalanır. Böylece eski güvenli veri yeni disk içeriğinin üstüne yazılmaz ve tekrarlayan yanlış uyarı kesilir.

### 3. Yerel önbelleği sıfırla (gerekirse)
- Yerel önbellek (AppData) silinebilir; **otoritatif veri değildir**, uygulama yeniden tarayarak yeniden oluşturur.

### 4. Tanı topla
- `npm run pilot:collect` ile tanı paketi alın ve geliştiriciye iletin.

## Doğrulama
- Geri dönüş sonrası birkaç dosyada not/görev ekleme test edilir; revision normal artmalı, uyarı çıkmamalı.
