# AGENTS.md — HasarBotu / DosyaTakipBotu Geliştirme Anayasası (Dev Harness v1)

Bu dosya, koda dokunan HER yapay zekâ ajanı (Claude, Codex, Cursor, Gemini, Copilot vb.) ve
geliştirici için BAĞLAYICI kurallar içerir. Koda başlamadan önce tamamını oku.
İkinci adım: varsa `CLAUDE.md` (operasyonel talimatlar) ve `docs/dev/` şablonlarını oku.

## Proje Kimliği (Project Identity)

HasarBotu / DosyaTakipBotu; Baran Global Ekspertiz iş akışı için **Electron + TypeScript**
masaüstü uygulamasıdır (local-first, Windows x64). Türkçe trafik/kasko/motor sigorta hasar
dosyası takibi ve eksper iş akışı desteği sağlar: hasar dosya klasörleri, evraklar, fotoğraflar,
Excel içe aktarımları, hasar raporu yardımcıları ve değer kaybı (Value Loss) desteği.
UI metinleri Türkçe kalır. Sürüm 0.6.4 sabit kalır. Ürün ücretsiz çalışır kalmalıdır.

## Değişmez Mimari Kurallar (Non-Negotiable Architecture Rules)

- `takip.json` **source of truth**'tur; başka hiçbir depo onun yerine geçemez.
- SQLite kullanılacaksa YALNIZ yeniden kurulabilir yerel cache/index olabilir; asla source of truth olamaz.
- pCloud yalnız MANUEL yedek/arşiv içindir; canlı ortak çalışma kökü DEĞİLDİR.
- Aktif çalışma yerel klasör tabanlıdır.
- Zorunlu ücretli API/SaaS/bulut veritabanı/hosted AI/OCR servisi/abonelik YASAK (**no paid API**).
- Otomatik dışa veri aktarımı YASAK; internet erişimi görev kapsamı dışında eklenmez.
- Açık kullanıcı onayı (**user approval**) olmadan hiçbir kalıcı yazma yapılmaz.
- Tüm AI çıktıları **preview-first**'tür: önce önizleme, sonra kullanıcı onayı, en son yazma.
- EXE/build artifact yalnız açıkça istendiğinde üretilir.
- Büyük rewrite yapma; küçük, eklemeli (additive) değişiklikler tercih edilir.
- Yeni dependency ekleme (zorunluysa önce raporla).

## Veri Güvenliği (Data Safety)

- Mevcut `takip.json` uyumluluğu korunur; migrasyonlar yalnız geriye uyumlu olabilir.
- writeId/revision guard'ları ve atomic write davranışı korunur.
- Bozuk JSON kurtarma davranışı korunur.
- İlgisiz tracking alanları SESSİZCE değiştirilmez.
- `tracking.aiHelperContext` altına alan eklenecekse: alan izole edilir, preview/confirm akışı kullanılır
  ve sanitize/migrate zinciri alanı taşır (aksi halde yükleme sırasında silinir).
- Kalıcı yazma davranışı değişirse açık test/guard şart.
- Full path (tam dosya yolu) kullanıcıya, log'a veya AI promptuna sızdırılmaz; yalnız dosya adı.

## Excel Güvenliği (Excel Safety)

- Portal Excel kolon eşleşmesi BOZULMAZ.
- AI İşçilik H-N yazım kuralları dar kapsamlı kalır; kapsam genişletilmez.
- D sütunu parça kodu yazımı yalnız açık kullanıcı onayı + doğrulama ile yapılır.
- Her Excel yazımı preview/diff/confirmation gerektirir.
- Tek-hücre yazıcılar diğer hücrelere DOKUNMAZ; stil/formül/diğer hücreler korunur.
- Formüllü/korumalı hücrelerin üzerine yazılmaz.
- Yedek/geri yükleme zinciri (`.yedek-*`, `.restore-oncesi-*`, `.manuel-restore-oncesi-*`) korunur.
- Mevcut güvenli mekanizma ve kapsam kanıtlayan test olmadan Excel dosyası baştan yazılmaz.

## AI Modül Kuralları (AI Module Rules)

- **AI İşçilik**: preview-first, kanıt (evidence) temelli; confidence/reason zorunlu. Sınıflandırıcı
  davranışı korunur; zenginleştirme yalnız EKLEMELİ olabilir.
- **AI Mode parça kodu köprüsü**: manuel prompt üret + yanıt yapıştır akışıdır. Google'a otomatik
  istek, scraping veya tarayıcı otomasyonu YASAK (ilerideki ayrı bir görevde açıkça değişmedikçe).
- **AI Değer Kaybı (Value Loss)**: kesin tazminat dili YASAK; "kesin ödenecek tutar" ifadesi YASAK;
  açıkça onaylanmadıkça preview-only; gerçek zarar ilkesi ve piyasa kanıtı esastır.
- **AI Orchestrator** local_rules davranışı bozulmaz.
- Harici AI sağlayıcı eklenecekse: varsayılan KAPALI, kullanıcı yapılandırmalı, maskeli prompt
  önizlemesi ve açık onay zorunlu.

## Değer Kaybı Kuralları (Value Loss Rules)

- 01.07.2026 ve sonrası trafik/ZMSS dosyalarında değer kaybı kontrolü gerekir.
- Gerçek zarar ilkesi ve reel piyasa analizi (real market analysis) esas alınır.
- Piyasa kanıtı gerekir; uygulanabilir durumlarda en az 3 emsal ilan.
- Katsayı UYDURULMAZ. Katsayı seti veya yapılandırılmış parça verisi yoksa sonuç
  `control_needed` / `cannot_calculate` döner; tutar üretilmez.
- Ön hesap sonuçları kesin tazminat gibi SUNULMAZ; disclaimer zorunludur.
- Değer kaybı sonuçları tracking'e, Excel'e, rapora veya maile OTOMATİK yazılmaz.

## Korunacak Davranışlar (bozma)

- **Dashboard gate**: manuel klasör seçilmeden diğer ekranlar kilitli.
- **Gemini 503 hotfix**: 5xx/timeout/network → geçici hata + Tekrar Dene; uygulama kilitlenmez.
- **Araç Bağlamı** dosya-bazlı izolasyon: Şase/Motor başka dosyaya karışmaz, AI promptuna gitmez.
- **P4-E2-B** commit güvenliği: Bilgi Bankası read-only; kalıcı yazma yalnız dar kilit + commit servisi.
- **AI İşçilik Sözlüğü** kompakt yapı.
- Renderer'da native window.confirm/alert/prompt yok → uygulama-içi confirmDialog.
- Mevcut behavior testleri, source guard'lar, IPC audit'leri ve final-office-audit ZAYIFLATILMAZ.

## Zorunlu Testler (Testing Requirements)

Her görev sonunda çalıştır:

```bash
npm run typecheck
npm run build
npm run test:behavior
npm run ci
node scripts/final-office-audit.mjs
npm audit
```

Dev harness değiştiyse ek olarak: `npm run test:dev-harness`.
Kod tek dosyaya yığılmaz; 400 satırı geçen yeni/değişen dosya oluşturulmaz.

## Teslim Raporu Formatı (Delivery Report Format)

Her teslim raporu Türkçe yazılır ve şunları içerir:

1. Değişen dosyalar
2. Ne yapıldı (implementation summary)
3. Bilinçli olarak NE yapılmadı
4. Güvenlik korumaları
5. `takip.json` yazımı var mı?
6. Excel yazımı var mı?
7. Mail/rapor üretimi var mı?
8. Web/API/Google/scraping var mı?
9. IPC invoke/event sayısı değişimi
10. En büyük yeni/değişen dosya satır sayısı
11. Test/build sonuçları
12. Behavior kontrol sayısı (önce → sonra)
13. final-office-audit sonucu
14. npm audit sonucu
15. Kalan riskler
16. Sonraki adım

## Yasaklar ve Source Guard Beklentileri

- Ücretli API bağımlılığı, gizli ağ çağrısı, API key/secret commit'i YASAK.
- Görev kapsamı dışında ağ erişimi, scraping, tarayıcı otomasyonu YASAK.
- Geniş/joker dosya silme YASAK; silme yalnız doğrulanmış tek hedefe yapılır.
- Otomatik Excel yazımı, otomatik `takip.json` yazımı, otomatik mail/rapor üretimi YASAK.
- Test/guard zayıflatma ve silme YASAK.
- Behavior testleri kaynak metni tarar: yorum/sabitlerde yasaklı token'lardan kaçın
  (`npm run test:behavior` yeşil kalmalı).

## Temiz ZIP

Şunları içermez: `node_modules`, dist-ui/dist-electron, release, .git, log/temp,
`user-knowledge-store.json`, eski zip'ler.

<!-- BEGIN @agent-native/skills -->
When operating as Claude Fable, use the /efficient-fable skill always.
<!-- END @agent-native/skills -->
