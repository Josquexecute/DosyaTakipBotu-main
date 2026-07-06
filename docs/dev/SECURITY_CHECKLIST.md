# Güvenlik Kontrol Listesi (Security Checklist)

Teslimden önce her maddeyi işaretle:

- [ ] **takip.json**: kullanıcı onayı olmadan yazılmıyor; yalnız izole alan; atomic write +
      revision/writeId guard korunuyor; migrasyon geriye uyumlu.
- [ ] **Excel**: otomatik yazma yok; preview/diff/confirm var; tek-hücre yazıcılar diğer
      hücrelere dokunmuyor; kolon eşleşmesi ve yedek/geri yükleme zinciri bozulmadı.
- [ ] **Web/API**: fetch/axios/websocket/scraping/tarayıcı otomasyonu eklenmedi; ücretli
      servis bağımlılığı yok.
- [ ] **Mail/rapor üretimi**: otomatik mail gönderimi ve otomatik rapor dosyası üretimi yok;
      taslaklar yalnız önizleme.
- [ ] **Secrets**: API key/şifre/gizli bilgi commit edilmedi; loglanmadı.
- [ ] **User approval**: her kalıcı yazma açık kullanıcı onayından (confirmDialog) geçiyor.
- [ ] **Backup/restore**: Excel yedek zinciri ve restore akışları aynen çalışıyor.
- [ ] **AI preview-first**: tüm AI çıktıları önce önizleme; otomatik uygulanmıyor.
- [ ] **Değer Kaybı dili**: kesin tazminat/kesin ödeme ifadesi yok; ön hesap + eksper
      kanaati vurgusu ve disclaimer var; katsayı uydurulmadı.
- [ ] **Source guards**: behavior testleri, IPC audit'leri ve final-office-audit zayıflatılmadı;
      yeni kod guard token tuzaklarına takılmıyor.
