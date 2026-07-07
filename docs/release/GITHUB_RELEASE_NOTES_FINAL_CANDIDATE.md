# HasarBotu v0.6.4 — Final Candidate

**Sürüm/etiket:** `v0.6.4-final-candidate` · **Durum:** Final Candidate — ofis sahibi onayı
alındı, final dağıtım ofis kullanım onayına bağlı. (Nihai üretim sürümü DEĞİLDİR.)

## Ne değişti (bu candidate'e giden son tur)

- **Scroll/taşma P1 düzeltmesi:** sol menü sayfaları içerik ekrana sığmadığında artık sayfa
  düzeyinde dikey kayar; alt içerik kırpılmaz (CSS-only; topbar/statusbar sabit).
- **Bağlam önizlemesi P2 netleştirmesi:** manuel dosya seçimi öncesi üst bar ve bağlam kartı
  "Önizleme" olarak etiketlenir; kilit uyarısı önizlemenin seçim sayılmadığını açıkça söyler.
- **Kompakt bilgi rozetleri (ⓘ):** 19 jargonlu kontrole hover açıklaması (Riskli/Durgun/
  Takip Tarihi/Revizyon/Rücu/Güven/Rayiç/SBM/araç grubu vb.).
- Değer Kaybı v10 UX freeze + v10.1 final audit; uygulama-geneli RC1 hazırlık denetimi.

## Ana modüller

Dosya takip çekirdeği (takip.json tek kaynak; atomic write + revision/writeId koruması) ·
Dashboard/Durum Panosu · Evrak & Fotoğraf kontrolleri (plaka sert bloğu) · Excel import/
export/İşçilik Dağıtıcı · 4 AI yardımcısı · Mevzuat Bilgi Bankası (yerel).

## Modül durumları

- **AI Değer Kaybı:** v10.1 final audit geçti; preview-first, 2 onay-kapılı kayıt, kesin
  tazminat dili yok, SEİK katsayı zinciri belgeli.
- **Ağır Hasar AI:** önizleme + son onaysız takip.json'a yazmaz (testli).
- **AI İşçilik:** son onay modalsız Excel'e yazmaz; yazım öncesi yedek; H..N portal
  sütunları doğrulanmış.
- **Excel akışları:** import salt-okunur önizleme; export kullanıcı-başlatmalı; sessiz
  yazım yok.

## Bilinen sınırlamalar

Geçmiş özet cap 5 · cyrb53 tazelik parmak izi ~53-bit (yalnız hatırlatma hassasiyeti) ·
SEİK yeni modül yayınlarsa katsayı seti elle yeniden doğrulanır · legacy büyük dosyalar
(bakım notu) · opsiyonel Gemini özelliği kullanıcı anahtarı gerektirir (anahtar koda gömülü
değildir).

## İlk çalıştırmada ZORUNLU kullanıcı aksiyonu

1. **Ayarlar → gerçek YEREL aktif çalışma klasörünü seçin.**
2. **`.fixtures\2026` KULLANMAYIN** (test/QA fixture kökü).
3. **pCloud'u canlı kök olarak KULLANMAYIN** (yalnız manuel yedek/arşiv).

## Smoke test durumu

RC1 smoke test, kullanıcı/ofis sahibi kararıyla ilerlenmesi kabul edilerek kapatıldı; P0/P1
açık hata bildirilmedi. (Detaylı adım-adım form yürütülmedi; kabul kaydı
`FINAL_SOURCE_FREEZE_DECISION.md` §5'tedir.)

## Build/test tabanı

behavior **1501** · final-office-audit **282** · IPC **86/3** · npm audit **0** ·
dev-harness **31** · typecheck/build/ci temiz.

## Artefaktlar

- `HasarBotu-Baran-Ekspertiz-Kurulum-0.6.4-final-candidate.exe` (NSIS kurulum)
- `HasarBotu-Baran-Ekspertiz-Tasinabilir-0.6.4-final-candidate.exe` (taşınabilir)
- `HasarBotu-final-candidate-source-20260706.zip` (temiz kaynak)
- `SHA256SUMS.txt`

## SHA-256

```txt
7c04c27e83e05dded2d27772118319c491566b1c50ccc3fbc1f873b14bfaf38c  HasarBotu-Baran-Ekspertiz-Kurulum-0.6.4-final-candidate.exe
95bf052e0bb5e29d26623f78c56902a0dac0b3edf3fa791d0bbd696a3b7cd04e  HasarBotu-Baran-Ekspertiz-Tasinabilir-0.6.4-final-candidate.exe
22f753d6eef7ce750b170a8e506b895c33cb801bece9e0717f72e5a4c4ec1a2b  HasarBotu-final-candidate-source-20260706.zip
```

## GitHub yükleme (manuel — remote yapılandırılınca)

Yerel repo + `v0.6.4-final-candidate` etiketi hazır. Remote eklendikten ve `gh auth login`
sonrasında:

```bash
git remote add origin <github-repo-url>
git push origin master
git push origin v0.6.4-final-candidate
gh release create v0.6.4-final-candidate --draft --title "HasarBotu v0.6.4 Final Candidate" --notes-file docs/release/GITHUB_RELEASE_NOTES_FINAL_CANDIDATE.md release/HasarBotu-Final-Candidate-20260706/*.exe release/HasarBotu-Final-Candidate-20260706/*.zip release/HasarBotu-Final-Candidate-20260706/SHA256SUMS.txt
```

(Draft olarak açın; public/final yayına ofis onayından sonra geçin.)
