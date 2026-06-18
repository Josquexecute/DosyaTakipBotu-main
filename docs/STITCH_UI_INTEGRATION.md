# Stitch Arayüz Entegrasyonu

Uygulamanın görsel sistemi, `src/renderer/stitch/` altındaki Stitch referans tasarımlarından türetilmiştir. Tasarım kaynağı `src/renderer/stitch/DESIGN.md` (HasarBotu Enterprise / Dense Functionalist) ve ekran görselleridir.

## İlkeler
- **Yoğun ama sade (Dense Functionalist):** Operasyon paneli; az tıklamayla çok bilgi. Liste-öncelikli düzen.
- **Tek stil kaynağı:** Tüm renkler ve aralıklar `styles.css` içindeki CSS değişkenleri (`:root` ve `html.dark`) üzerinden gelir.
- **Uzak bağımlılık yok:** Üretim paketinde CDN, uzak font veya icon servisi kullanılmaz. İkonlar basit Unicode glifleridir (`app/icons.ts`); tema değişkenlerine uyum sağlar.

## Uygulama
- Stitch ekranları (`stitch/screens/*`) referans alınarak bileşenler `src/renderer/app/components/` altında saf string-render fonksiyonları olarak yazılmıştır (`layout`, `home`, `cases`, `detail`, `folders`, `settings`, `dashboard`).
- Koyu/açık tema, yakınlaştırma ve responsive kırılımlar (1840px → 700px) `styles.css` içinde tanımlıdır.
- Tasarım referansları yalnızca görsel rehberdir; gerçek davranış vanilla TypeScript bileşenlerinde uygulanır.

> Not: `verify-project` denetimi, Stitch referansının üretim paketinde uzak font/CDN/icon izi içermediğini doğrular.
