# EXE Üretim Rehberi

HasarBotu v0.4.12 Windows dağıtımı Electron Builder ile üretilir. Release çıktıları `release/` klasöründe tutulur.

## Ön Koşullar

```bash
npm install
npm run fix:electron
npm run typecheck
npm run build
npm run ci
```

Bu komutlar tamamlanmadan EXE üretimi yapılmamalıdır.

## Windows EXE Üretimi

```bash
npm run dist:win
```

Beklenen çıktılar:

| Çıktı | Amaç |
| --- | --- |
| `HasarBotu-Baran-Ekspertiz-Kurulum-v0.4.12-x64.exe` | NSIS kurulum paketi |
| `HasarBotu-Baran-Ekspertiz-Tasinabilir-v0.4.12-x64.exe` | Taşınabilir uygulama |

## Hash ve Release Notu

```bash
npm run release:hash
npm run release:notes
```

Beklenen ek çıktılar:

- `RELEASE_HASHES_SHA256.txt`
- `RELEASE_HASHES_SHA256.json`
- `RELEASE_NOTES_v0.4.12.md`

## Kuru Prova ve Aday Kontrolü

```bash
npm run release:dry-run
npm run release:candidate-check
```

`release:candidate-check` üretim adayının:

- fresh build alınıp alınmadığını,
- package sürümü ile `APP_VERSION` uyumunu,
- EXE, hash ve release notu varlığını,
- ofis hedef sürüm marker bilgisini

kontrol eder.

## Dağıtım Öncesi Son Liste

- [ ] `npm run ci` geçti.
- [ ] `npm run dist:win` iki EXE üretti.
- [ ] SHA-256 çıktıları üretildi.
- [ ] Release notu üretildi.
- [ ] Ofis hedef sürüm v0.4.12 olarak ayarlandı.
- [ ] Önceki stabil EXE ve son takip yedeği saklandı.
- [ ] Geri dönüş planı ekip tarafından biliniyor.
