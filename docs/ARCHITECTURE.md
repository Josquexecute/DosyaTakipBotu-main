# Architecture

Bu dosya geriye dönük dokümantasyon uyumluluğu için korunur. HasarBotu v0.4.12 teknik mimarisinin güncel ve ayrıntılı anlatımı için [TEKNIK_MIMARI.md](TEKNIK_MIMARI.md) kullanılmalıdır.

## Kısa Özet

HasarBotu local-first Electron uygulamasıdır. Ana veri kaynağı her hasar dosyasındaki `_HASARBOTU/takip.json` dosyasıdır. AppData local-cache yeniden üretilebilir yardımcı katmandır.

Ana katmanlar:

- `src/main`: IPC, tracking, tarama, Excel, PDF, fotoğraf, AI ve local-cache servisleri.
- `src/preload`: güvenli contextBridge API yüzeyi.
- `src/renderer`: dashboard, dosya listesi, detay, klasörler ve ayarlar ekranları.
- `src/shared`: ortak tipler, workflow sabitleri, veri kalite ve işçilik kuralları.

Güvenlik ilkeleri:

- atomic write,
- revision/writeId,
- pCloud conflicted copy algılama,
- corrupt JSON koruması,
- yanlış plaka fotoğraf hard-block,
- renderer tarafında doğrudan dosya sistemi erişimi olmaması.
