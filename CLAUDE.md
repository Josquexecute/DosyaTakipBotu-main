# CLAUDE.md — HasarBotu Operasyonel Talimatlar (Claude benzeri kod ajanları için)

Bu dosya `AGENTS.md`'nin operasyonel özetidir. Çelişki olursa `AGENTS.md` esastır.

## Koda Başlamadan Önce (Before Coding)

- Önce `AGENTS.md`'yi oku (bağlayıcı kurallar orada).
- Düzenlemeden önce mevcut mimariyi incele; yeni desen eklemeden önce mevcut desenleri bul
  (örn. saf `src/shared/**` modül → main servis → IPC → renderer bileşen → behavior testi zinciri).
- Küçük, eklemeli değişiklikleri tercih et; yeni mimari icat etme.
- Açıkça istenmedikçe EXE/build artifact üretme.
- Kesinlikle gerekmiyorsa dependency ekleme.
- Testleri ve guard'ları gevşetme.

## Kod Stili (Coding Style)

- Saf (pure) shared helper'ları tercih et; main servisleri ve renderer bileşenlerini küçük tut.
- Açık (explicit) tipler kullan; gizli yan etkilerden kaçın.
- Dev dosyalardan kaçın; 400 satırı geçen dosya oluşturma.
- Sessiz yazma yok; geniş mutasyon yok; global state hack'i yok.
- Yorum/sabit metinlerde guard'ların taradığı yasaklı token'lardan kaçın
  (behavior testleri kaynak metni tarar).

## Değişiklik Stratejisi (Change Strategy)

- Eski davranışı koru; başarı ilan etmeden önce test ekle ve çalıştır.
- IPC'yi minimal tut; gerekmiyorsa IPC değiştirme (kontrat + ipc.ts + preload üçlüsü birlikte).
- İlgisiz modüllere dokunma: Değer Kaybı görevi AI İşçilik'i, AI İşçilik görevi Değer Kaybı'nı
  gerekmedikçe değiştirmez.
- Tüm AI çıktıları preview-first; tüm yazmalar açık kullanıcı onayıyla (confirmDialog).
- Kaydetme akışlarında mevcut güvenli mutate (atomic write + revision/writeId) mekanizmasını kullan.

## Yasak Eylemler (Forbidden Actions)

- Ücretli API bağımlılığı; hardcoded API key/secret.
- Gizli ağ çağrısı; görev kapsamı dışında `fetch`/`axios`/`XMLHttpRequest`.
- Scraping; `puppeteer` / `playwright`; otomatik Google Search / AI Mode sorgusu.
- Geniş dosya silme; joker (wildcard) silme; doğrulanmamış hedefe recursive silme.
- Kontrolsüz `takip.json` mutasyonu; otomatik Excel yazımı.
- Otomatik rapor üretimi; otomatik mail gönderimi.
- Test zayıflatma; guard silme; secret commit etme.

## Rapor Stili (Report Style)

Raporlar açıkça aksi istenmedikçe TÜRKÇE yazılır ve şunları içerir:

- Değişen dosyalar
- Behavior kontrol sayısı (eski → yeni)
- final-office-audit sonucu
- npm audit sonucu
- IPC invoke/event sayısı
- En büyük dosya satır sayısı
- Açık beyan: `takip.json` yazımı / Excel yazımı / mail gönderimi / web-API-Google-scraping /
  harici dependency var mı?
- Kalan riskler
- Sonraki adım

## Zorunlu Komutlar

```bash
npm run typecheck
npm run build
npm run test:behavior
npm run ci
node scripts/final-office-audit.mjs
npm audit
```

Dev harness değiştiyse: `npm run test:dev-harness`.

<!-- BEGIN @agent-native/skills -->
When operating as Claude Fable, use the /efficient-fable skill always.
<!-- END @agent-native/skills -->
