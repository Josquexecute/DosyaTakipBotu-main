# Değişiklik Günlüğü (CHANGELOG)

Tüm önemli değişiklikler bu dosyada tutulur. Sürümleme [SemVer](https://semver.org/lang/tr/) yaklaşımına yakındır.

## [0.6.0] — 2026-06-21

### Düzeltildi — Sürüm damgası hizalaması (hotfix)
- Kaynak kod v0.6.0 seviyesinde olmasına rağmen `package.json`, `package-lock.json` ve `APP_VERSION` hâlâ `0.5.0` raporluyordu. Bu, `DeploymentService` üzerinden yapılan ofis dağıtım/güncellik (`compareVersions(APP_VERSION, expectedVersion)`) kontrolünü yanlış etkileyebiliyordu.
- Runtime sürümü (`APP_VERSION`), `package.json`/`package-lock.json` sürümü ve final office audit sürüm kapısı (`scripts/final-office-audit.mjs`) `0.6.0` olarak hizalandı.
- README, `docs/` dokümanları ve docs changelog'undaki kullanıcıya görünen `v0.5.0` damgaları `v0.6.0` ile uyumlu hâle getirildi.

### Değişmedi
- Yeni özellik eklenmedi, refactor yapılmadı. `takip.json` şeması, atomic write / revision / writeId davranışı; Excel, AppData, Bilgi Bankası, AI Queue, Gemini, OCR ve ücretli sağlayıcı tarafı **değiştirilmedi**. Yalnızca sürüm damgaları ve doküman uyumu güncellendi.

## [0.5.0] — 2026-06-19

### Eklendi — Ağır Hasar AI ön değerlendirme
- **Ağır Hasar AI Ön Değerlendirme** akışı v0.5.0 release kapsamına alındı. Ekonomik hasar oranı ve yapısal kritik parça eşiği ayrı hesaplanır; sonuç rapor notu ve kurumsal mail taslağıyla desteklenir.
- **Gerçek senaryo fixture'ı:** `34 PME 968 / 49/18303851` dosyası için 2026 Hyundai i20 Kasko senaryosu eklendi. Hasar tutarı `650.172,10 TL`, rayiç `1.250.000 TL`, oran yaklaşık `%52`; ekonomik `%60` eşik aşılmasa da yapısal kritik eşik ayrıca değerlendirilir.
- **Ön Göğüs / firewall teyidi:** `Ön Göğüs` yalnızca eksper tarafından yapısal ön göğüs sacı/firewall olarak teyit edilirse 40 puan verir. Teyitsiz durumda sistem puan vermez, satırı kontrol gerekli bırakır ve torpido/plastik göğüs mü yoksa yapısal sac/firewall mı sorusunu üretir.
- **Mükerrer puan koruması:** airbag/emniyet kemeri ve ana elektrik/elektronik grupları tekrar tekrar sayılıp ağır hasar skorunu şişirmez; grup içindeki en güçlü kanıt puana dahil edilir.
- **Destek/kontrol satırları:** ön travers ve direksiyon mili gibi tek başına kesin ağır hasar puanı üretmemesi gereken satırlar kontrol/destek satırı olarak kalır.

### İyileştirildi — AI İşçilik Dağıtıcı
- Karar motoru v2 seviyesine çıkarıldı: güçlü pozitif evidence, negatif kurallar, çakışma çözümü ve açıklanabilir gerekçe üretimi genişletildi.
- Portal Excel fixture testleri büyütüldü: A sütununun parça adı olmadığı, B/C/D kolonlarının doğru kullanıldığı, mevcut H-N değerlerinin otomatik öğrenilmediği ve düşük güvenli satırların boş bırakılmadığı doğrulanır.
- Önizleme/kaydetme deneyimi profesyonelleştirildi: filtreler, arama, özet kartları, kullanıcı düzeltmesi, öğrenmeye aday satırlar, formül uyarısı, son onay modalı ve kaydetme sonrası rapor akışı kapsama alındı.
- Büyük Excel önizlemesinde sayfalama, aktif sayfa render modeli, uzun gerekçelerin varsayılan kapalı gösterimi ve arama debounce koruması eklendi.

### Release hazırlığı
- Paket sürümü, `APP_VERSION`, README, docs changelog, ofis dağıtım notları, EXE rehberi, canlı geçiş ve final office audit kapısı v0.5.0’a çekildi.
- EXE üretimi bu adımda yapılmadı; kaynak, kalite komutları ve release kontrol akışı v0.5.0 için hazırlandı.

## [0.4.11] — 2026-06-18

### Eklendi — AI destekli, öğrenen ve önizlemeli İşçilik Dağıtıcı
- **Portal Excel İşçilik Dağıtıcı'ya yeni "AI Otomatik İşçilik Dağıtıcı" akışı eklendi** (eski manuel/kolon-seçmeli akış geriye dönük korundu). Kullanıcı Excel'i seçer; sistem **tüm satırları analiz edip** parça adına/koduna göre **H..N işçilik kategori sütunlarını (Kaporta/Boya/Mekanik/Elektrik/Cam/Döşeme-Kilit/Onarım) otomatik doldurur**, **kaydetmeden önce önizleme** gösterir; kullanıcı düzeltip onaylar.
  - Her satıra **işçilik kararı + güven seviyesi (Yüksek/Orta/Düşük) + açıklanabilir gerekçe**; emin olunmayan satır boş kalmaz, en mantıklı işçilik yazılır ve **"Kontrol gerekli"** işaretlenir.
  - **Önizleme:** satır no, parça, kod, eski→yeni H..N değerleri (elle düzeltilebilir), kategori, güven, kontrol bayrağı, gerekçe + özet rapor (işlenen/yüksek güven/kontrol gerekli/değişen satır + kategori bazında toplamlar).
  - **Öğrenme:** kullanıcının elle düzelttiği kararlar `labor-learning.json`'a kaydedilir; sonraki Excel'lerde aynı/benzer parça (fuzzy eşleştirme) geldiğinde **kuraldan ÖNCE** kullanılır.
  - **Güvenlik:** kaydetmeden Excel'e yazılmaz; **kaydetmeden önce orijinalin yedeği alınır**; çıktı ayrı dosyaya yazılır (orijinal korunur); **hücre stilleri korunur**, tutarlar **kuruşsuz ve 250 TL katı**; **formül ezme yalnızca açık onayla**.
  - **Sınıflandırma kuralları + dağıtım kısıtları:** motor satırına cam, cam parçasına mekanik, elektrik parçasına kaporta/boya yazılmaz (far/stop dış parçalarda "Kontrol gerekli"); kaporta + boya birlikte dağıtılabilir. Çevrimdışı; yerel kural motoru + öğrenen sözlük + fiyat listesi (internet gerekmez).
- **Yeni modüller (Excel AI mantığı tek dosyaya yığılmadan):** `src/shared/labor-rules.ts`, `src/shared/labor-learning-dictionary.ts`, `src/main/services/labor-classifier-service.ts`, `src/main/services/labor-preview-service.ts`, `src/main/services/labor-excel-writer.ts`. IPC: `labor:auto-preview`, `labor:auto-save`. 19 yeni davranış testi (kurallar, sınıflandırma, öğrenme, yuvarlama, uçtan uca önizleme + güvenli yazma + yedek + orijinal korunur).

## [0.4.10] — 2026-06-18

### Güvenlik / Engelleme (güçlendirme)
- **Fotoğraf seçimi artık yalnızca plakaya değil, DOSYA KLASÖRÜ KİMLİĞİNE göre de doğrulanıyor.** Excel & Parça Veri Merkezi'nde seçilen fotoğrafın ait olduğu dosya klasörü (plaka + dosya no / ihbar föyü no'yu taşıyan klasör yolu) aktif dosyanın klasöründen farklıysa işlem **kesin engellenir** — **aynı plaka ama farklı dosya/föy klasörü** durumu dâhil. Modal mesajı aktif ve seçilen klasör/plakayı gösterir ("Aynı plaka ama FARKLI dosya klasörü…").
  - Fotoğraf aktif dosyanın klasörü/alt klasörü (EVRAK/HASAR…) içindeyse → izin.
  - Başka bir dosya klasörüne aitse (plaka aynı olsa bile) → hard-block (`PHOTO_PLATE_MISMATCH`).
  - Hiçbir dosya klasörüne ait değilse: plaka net farklıysa engel, aksi hâlde meşru geçici-klasör akışı korunur (yanlış-pozitif yok).
- Yeni saf yardımcı `resolveCaseFolderFromPath` (yol → ait olduğu dosya klasörü + plaka) ve `samePath` (Türkçe/büyük-küçük/ayraç normalize). 3 yeni davranış testi (aynı plaka/farklı klasör engellenir; alt klasör engellenmez; klasör kimliği çözülür). IPC/renderer arayüzü değişmedi (mevcut `activeFolderPath` kullanılır).

### Saha stabilite kontrolü (EXE öncesi)
- Not/görev/alan mutasyonlarında kilitlenme riski yok (per-dosya mutation queue hata-güvenli; file-lock `finally`'de daima serbest, 30 sn timeout + stale temizliği). Kapalı dosya düzenleme kilidi çift korumalı (renderer onayı + main `assertMutationAllowed`). takip.json conflict/corrupt/missing korumaları, tek dosya yenileme (tam tarama yok), liste/dashboard çift-okuma throttle'ı ve dashboard KPI'larının yalnızca açık dosyaları sayması doğrulandı. `npm audit`: 0 açık. **Yeni P0/P1 bulunmadı; sadece yukarıdaki güvenlik güçlendirmesi eklendi.**

## [0.4.9] — 2026-06-18

### Refactor (davranış değişmeden — tam modülerleştirme)
- **`ipc-domain-services.ts` tamamen domain servislerine bölündü.** Bu sürümde taşınanlar:
  - `FoldersService` → [folders-service.ts](src/main/services/folders-service.ts) (yalnızca-okunur klasör gezgini)
  - `SettingsService` → [settings-service.ts](src/main/services/settings-service.ts) (ayarlar / kök seçimi)
  - `ConflictResolverService` → [conflict-resolver-service.ts](src/main/services/conflict-resolver-service.ts) (çakışma çözümü orkestrasyonu)
  - `CasesQueryService` → [cases-query-service.ts](src/main/services/cases-query-service.ts) (**dashboard, listeleme, tarama, küçük resim ve mutasyon sonrası yerel önbellek tazeleme**) + temiz yardımcıları [cases-refresh-helpers.ts](src/main/services/cases-refresh-helpers.ts)
- **takip.json yazma-okuma katmanına dokunulmadı.** `TrackingFileService` (takip.json IO) ve `TrackingMutationService` (not/görev/alan mutasyonları) yerinde kaldı; CasesQueryService takip.json YAZMAZ, yalnızca divergence tespiti için OKUR ve yerel cache (AppData) yazar.
- **Excel & Parça Veri Merkezi hard-block davranışı korundu:** yanlış plakalı fotoğraf seçiminde `PHOTO_PLATE_MISMATCH` modal engelleme aynen çalışır.
- `ipc-domain-services.ts` artık yalnızca `IpcDomainContext` + `TrackingMutationService` + alan/not temizleyicilerini içerir ve diğer servisleri **barrel** ile yeniden dışa aktarır (`ipc.ts` importları değişmedi). Servisler bağlamı `import type` ile alır (çalışma-zamanı döngüsü yok). Dosya **906 → ~330 satıra** indi. Denetim grep yolları güncellendi.

## [0.4.8] — 2026-06-18

### Düzeltildi (P1)
- **`resolveConflict()` artık ikincil özet yazımı hatasında ana işlemi düşürmüyor.** `takip.json` başarıyla yazıldıysa çakışma çözümü başarılı sayılır; okunabilir özet (`HASARBOTU_TAKIP_OZETI.txt`) yazılamazsa (pCloud kilidi/izin/geçici I/O) yalnızca `console.warn` ile uyarılır. Davranış `mutate()` ile ortak bir `writeHumanSummarySafe` yardımcısı üzerinden tutarlı hâle getirildi. Ana veri akışı ve `takip.json` şeması korunur. (1 yeni davranış testi: özet yazımı patlatılınca resolveConflict yine başarılı + takip.json yazılı.)

### Refactor (davranış değişmeden)
- **`ipc-domain-services.ts` daha küçük domain servislerine bölündü:** `ExcelWorkflowService` → [excel-workflow-service.ts](src/main/services/excel-workflow-service.ts) (Excel & Parça Veri Merkezi; **yanlış plaka hard-block / `PHOTO_PLATE_MISMATCH` davranışı korundu**), `DeploymentService` → [deployment-service.ts](src/main/services/deployment-service.ts) (ofis sürüm/dağıtım kontrolleri), ortak `existsDirectory` → [fs-utils.ts](src/main/services/fs-utils.ts). `ipc-domain-services.ts` barrel olarak bu servisleri yeniden dışa aktarır; `ipc.ts` importları değişmedi. Servis dosyaları `IpcDomainContext`'i `import type` ile alır (çalışma-zamanı döngüsü yok). Dosya **1152 → 906 satıra** indi.
- Denetim grep yolları (feature-audit / final-office-audit) taşınan koda göre güncellendi; pCloud/AppData/local-cache yazma güvenliği değişmedi.

## [0.4.7] — 2026-06-18

### Güvenlik / Engelleme
- **Yanlış plakalı fotoğraf seçimi artık SERT engellenir (uyarı değil).** Excel & Parça Veri Merkezi'nde fotoğraf seçerken, fotoğrafın ait olduğu klasör/plaka aktif dosyanın plakasıyla uyuşmuyorsa işlem durdurulur: fotoğraf Gemini'ye gönderilmez, veri merkezine/Excel'e/rapora eklenmez. Kullanıcıya kapatılmadan geçilemeyen bir **modal pop-up** gösterilir: *"Seçilen fotoğraf bu dosyaya ait görünmüyor. Aktif plaka: XXX, seçilen klasör/plaka: YYY. İşlem güvenlik nedeniyle engellendi."*
- **Merkezi plaka doğrulama fonksiyonu** (`src/shared/plate-match.ts` + `src/main/services/case-asset-guard.ts`): Plaka biçimi tanıma, sadeleştirilmiş karşılaştırma ve yol-tabanlı plaka çözümü. Aynı/farklı PC, kopya klasör ve "klasör içi foto" durumlarını yanlış-pozitif üretmeden ele alır; yalnızca pozitif uyuşmazlıkta engeller. 11 yeni davranış testi.

### Refactor (davranış değişmeden)
- **`ipc-domain-services.ts` domain modüllerine bölündü** (güvenli, kademeli; her adımda typecheck/build/test): saf yardımcılar ayrı dosyalara taşındı — `settings-normalizer.ts` (ayarlar/sürüm), `tracking-issue-helpers.ts` (çakışma/revizyon tespiti), `case-list-helpers.ts` (liste inceltme). Servis sınıfları orkestrasyon katmanı olarak kaldı; dışa aktarımlar ve davranış birebir korundu.
- IPC hata sarmalayıcısı özel hata kodlarını (ör. `PHOTO_PLATE_MISMATCH`) renderer'a iletir; böylece kritik uyuşmazlıklarda modal tetiklenir.

## [0.4.6] — 2026-06-17

### Değişti
- **Durum Panosu "Tümünü Excel'e Aktar" artık panoda görüneni aktarır.** Bir filtre/arama aktifse yalnızca filtrelenen dosyalar Excel'e yazılır; buton etiketi duruma göre "Filtreliyi Excel'e Aktar (N)" / "Tümünü Excel'e Aktar (N)" olarak güncellenir.
- **Durum Panosu varsayılan olarak yalnızca AÇIK dosyaları gösterir.** Kapalı dosyalar klasöründeki / kapanmış (Kapalı, statusIsClosed, kapaliMi) dosyalar gizlenir.

### Eklendi
- **Durum Panosu — Gelişmiş Filtreleme:** "Gelişmiş" düğmesiyle açılan panel: sorumlu filtresi, "Kapalı dosyaları da göster", "Sadece eksik/risk içerenler", "Sadece açık görevi olanlar" ve tek tuşla "Temizle". Özet ve sayım filtrelenmiş kümeyi yansıtır.
- **Kaydırılabilir parça öneri listesi:** Excel Araçları → parça öğretme satırında, "Gerçek Ad" için kategoriye göre gruplanmış, **kaydırma çubuklu** açılır liste (native `<select>` + `<optgroup>`); seçilince input dolar, serbest yazım korunur.
- **İŞ NOTLARI — Saha Referansı:** "İŞ NOTLAR" belgesindeki iç operasyon notları programa entegre edildi (`src/shared/is-notlari.ts`); İşçilik/Excel sekmesinde katlanır referans kartı olarak gösterilir (mobil onarım bedelleri, ön takım/soğutma/bagaj mantığı, fotoğraf ve süreç kuralları).

### İyileştirildi
- **İşçilik Dağıtıcı öğrenen usta-sözlüğüne bağlandı:** "Boya ve İşçilikler" listesiyle doğrudan eşleşmeyen Excel satırları, öğrenen usta sözlüğü ile resmi parça adına çevrilip (ör. *tabla → Salıncak*, *motor kulağı → Motor Takozu*, *beşik → Alt Beşik/Travers*) işçiliğe bağlanır. Kullanıcı parça öğrettikçe dağıtım da iyileşir.
- **Usta sözlüğü genişletildi (İŞ NOTLAR):** Fren Diski/Balatası/Kaliperi/Hortumu, Porya, Arka Panel, Bagaj Havuzu/Kapağı eklendi; tabla→Salıncak, travers→Alt Beşik, motor radyatörü→Su Radyatörü, arka tampon demiri, şase ucu eş anlamlıları işlendi.
- **Fiyat listesi referansı:** Jant/Ön Tampon/Klima Gazı/Antifriz için mobil onarım bedelleri ve rot-balans notu İŞ NOTLAR'a göre güncellendi.

### Düzeltildi (bağımsız inceleme)
- **Gemini tutar parse (TR para formatı):** Parça fotoğrafı okumada tutar STRING geldiğinde (ör. `"2.500"`, `"₺ 1.250,50"`) düz `Number()` yanlış sonuç veriyordu (`"2.500"` → 2.5). Artık TR/EN uyumlu `parseMoney` kullanılıyor (`"2.500"` → 2500, `"1.250,50"` → 1250.50). Adet ayrıştırması da metinden rakam çekecek şekilde sağlamlaştırıldı. 4 yeni davranış testi eklendi.
- **Yön belirsizliği uyarısı:** Yön içermeyen genel ifadeler (ör. "tampon", "far", "çamurluk", "panel") otomatik "Ön ..." varsayılıyordu. Eşleşme korunuyor ama artık `ambiguousSide` işaretleniyor; listede "⚠ yön?" rozeti ve toplu uyarı gösteriliyor. 4 yeni davranış testi eklendi.
- **Plaka eşleşme kontrolü:** Fotoğraftan okunan plaka, seçili dosyanın plakasıyla uyuşmazsa "yanlış fotoğraf olabilir" uyarısı verilir.
- **Yerel model metni:** Güvenlik hata mesajı "pCloud kök klasörü" yerine "aktif ana klasör" diyor (yerel çalışma modeliyle uyumlu).
- **Bakım:** Demo/screenshot mock sürümleri 0.4.6'ya çekildi; `local-settings-store.ts` çıpa modülüne açıklama eklendi.

## [0.4.5] — 2026-06-17

### Eklendi
- **Durum Panosu** (yeni "kategori" sayfası, sol menüde Ağır Hasar'ın altında ve Ana Sayfa kartı): Tüm dosyaların son durumu tek panoda.
  - Dosya no'ya göre sıralı; **50 dosya/sayfa** sayfalama (sayfa sayısı dosya sayısına göre sınırsız, « Önceki / numaralar / Sonraki »).
  - Operasyon durumu filtresi, sıralama (Dosya No / Plaka / Son İşlem / Duruma göre) ve panoya özel arama.
  - Üstte durum dağılımı özeti; her satırda durum + son işlem ("3 gün önce"), eksik özeti + ilerleme çubuğu (%), sorumlu/eksper/takip, **son bırakılan not** ve **aktif görev**.
  - Tek tuşla **"Tümünü Excel'e Aktar"** (filtreden bağımsız, tüm dosyalar). Satıra tıklayınca dosyanın Operasyon detayına gider.

## [0.4.4] — 2026-06-17

### Eklendi
- **AI destekli parça listesi fotoğrafı okuma (Google Gemini, ücretsiz katman):** El yazısı/karışık parça/teklif listesi fotoğrafını okuyup yapılandırılmış listeye çevirir (`Excel Araçları → Parça Listesi Fotoğrafı Seç ve Oku`). API anahtarı yalnızca yerel ayara kaydedilir.
- **Gömülü "usta parça sözlüğü" + normalizasyon motoru** (`src/shared/parca-sozlugu.ts`): Usta dilini gerçek/resmi parça adına çevirir (ör. *amartisör → Amortisör*, *davlumbaz → Çamurluk Davlumbazı*, *şarşıman → Şanzıman*, *intercol → İntercooler*). Sağ/sol yön ayrıştırması, kategori ve işçilik bağı.
- **Öğrenen sözlük + satır içi düzeltme:** Yanlış/eksik okunan satırı düzeltip "Öğret" → kişisel sözlüğe kalıcı kaydedilir (`user-parts-dictionary.json`), bir daha otomatik tanınır; öğrenilen terim gömülü sözlüğü ezer.
- **İşçiliğe Aktar (Excel):** Okunan parçaları gömülü fiyat listesiyle eşleyip Parça + İşçilik Excel'i üretir.
- **Panoya Kopyala:** Okunan temiz listeyi (resmi adlar) portala hızlı girmek için panoya kopyalar.
- Daha iyi okuma: adet/tutar, işlem/durum notu (onarım/değişim/boyalı) ve marka/model çıkarımı.

### Düzeltildi
- Sürüm karşılaştırması (`compareVersions`) yalnızca major sürümü kıyaslıyordu; artık tam sürümü karşılaştırır (ofis "sürüm geride" uyarısı doğru çalışır).
- Ofis hedef sürüm dosyası yokken çıkan kurulum hatırlatması artık üst bant olarak gösterilmez (yalnızca gerçek sürüm sorununda çıkar).

## [0.4.3]

### Eklendi
- Gömülü "Boya ve İşçilikler" fiyat listesine göre satır bazında işçilik atama.
- Uygulama içi **düzenlenebilir işçilik tablosu** (satır tutarlarını elle düzenleme/atama).

### Düzeltildi
- Excel ayrıştırma: boş `t="s"` hücresinin yanlış paylaşılan dizeyle dolması; çok parçalı `inlineStr` zengin metin kaybı.
- Not düzenleme/silme kilidi: her takip mutasyonunda yapılan gereksiz tam-klasör yeniden analizinin kaldırılması.
- Düşük çözünürlüklü ekranlarda pencerenin sığması (responsive pencere sınırları).
- Tema düğmesi metni ("Koyu/Açık Tema") ve canlı yakınlaştırma yüzdesi göstergesi.

## [0.4.2]

- Liste-öncelikli "Dosyalar" görünümü, UI sadeleştirme ve stabilite düzeltmeleri.
