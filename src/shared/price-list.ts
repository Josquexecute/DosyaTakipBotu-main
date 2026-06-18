import { normalizeSearch } from './turkish';

/**
 * Gömülü "Boya ve İşçilikler — Sade Fiyat Listesi" referansı.
 * Kaynak: Baran Global Ekspertiz standart fiyat listesi (Otomobil).
 * "ustTutar" = ilgili parça/işlem için referans (üst) işçilik/bedel tutarı.
 * Bu liste, İşçilik Dağıtıcı'da "Fiyat listesine göre hesapla" modunda
 * yüklenen Excel'in satırlarını eşleştirip tutar atamak için kullanılır.
 */
export interface PriceListEntry {
  grup: string;
  parca: string;
  islem: string;
  ustTutar: number;
  not: string;
}

export const BUILTIN_PRICE_LIST: readonly PriceListEntry[] = [
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Kaporta', ustTutar: 2500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Elektrik', ustTutar: 1500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Radar Sensörü', ustTutar: 1500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Macunlu Boya', ustTutar: 7500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Değişim Boya', ustTutar: 6500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Sedefli Macunlu Boya', ustTutar: 9500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Sedefli Değişim Boya', ustTutar: 8500, not: '' },
  { grup: 'Otomobil', parca: 'Kaput', islem: 'Kaporta', ustTutar: 2500, not: '' },
  { grup: 'Otomobil', parca: 'Kaput', islem: 'Döşeme', ustTutar: 1000, not: '' },
  { grup: 'Otomobil', parca: 'Kaput', islem: 'Macunlu Boya', ustTutar: 9500, not: '' },
  { grup: 'Otomobil', parca: 'Kaput', islem: 'Değişim Boya', ustTutar: 8500, not: '' },
  { grup: 'Otomobil', parca: 'Kaput', islem: 'Sedefli Macunlu Boya', ustTutar: 10500, not: '' },
  { grup: 'Otomobil', parca: 'Kaput', islem: 'Sedefli Değişim Boya', ustTutar: 9500, not: '' },
  { grup: 'Otomobil', parca: 'Kaput', islem: 'Menteşe Boya', ustTutar: 750, not: 'Parça başı' },
  { grup: 'Otomobil', parca: 'Ön Çamurluk', islem: 'Kaporta', ustTutar: 2500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Çamurluk', islem: 'Elektrik', ustTutar: 500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Çamurluk', islem: 'Macunlu Boya', ustTutar: 7500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Çamurluk', islem: 'Değişim Boya', ustTutar: 6500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Çamurluk', islem: 'Sedefli Macunlu Boya', ustTutar: 9500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Çamurluk', islem: 'Sedefli Değişim Boya', ustTutar: 8500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Kaporta', ustTutar: 2500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Elektrik', ustTutar: 1500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Döşeme', ustTutar: 1500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Cam', ustTutar: 1500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Macunlu Boya', ustTutar: 7500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Değişim Boya', ustTutar: 6500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Sedefli Macunlu Boya', ustTutar: 9500, not: '' },
  { grup: 'Otomobil', parca: 'Kapı', islem: 'Sedefli Değişim Boya', ustTutar: 8500, not: '' },
  { grup: 'Otomobil', parca: 'Sütun', islem: 'Boya', ustTutar: 3500, not: '' },
  { grup: 'Otomobil', parca: 'Direk', islem: 'Boya', ustTutar: 5000, not: '' },
  { grup: 'Otomobil', parca: 'Ön Panel', islem: 'Kaporta', ustTutar: 2500, not: '' },
  { grup: 'Otomobil', parca: 'Ön Panel', islem: 'Boya', ustTutar: 7500, not: 'Demir ise' },
  { grup: 'Otomobil', parca: 'Alt Izgara', islem: 'Kaporta', ustTutar: 1000, not: '' },
  { grup: 'Otomobil', parca: 'Tampon Spoyler', islem: 'Kaporta', ustTutar: 1000, not: '' },
  { grup: 'Otomobil', parca: 'Alt Muhafaza', islem: 'Kaporta', ustTutar: 1500, not: '' },
  { grup: 'Otomobil', parca: 'Radyatörler', islem: 'Kaporta', ustTutar: 1500, not: 'Mekanik' },
  { grup: 'Otomobil', parca: 'Klima Gazı', islem: 'Bedel', ustTutar: 2500, not: '' },
  { grup: 'Otomobil', parca: 'Antifriz', islem: 'Bedel', ustTutar: 1500, not: '' },
  { grup: 'Otomobil', parca: 'Jant', islem: 'Rot Balans', ustTutar: 2000, not: 'Bir lastik ise 2.000 TL; birden fazla lastik ise lastik sayısına göre bölünür. (Rot-balans/kalibrasyon teker sayısından bağımsızdır.)' },
  { grup: 'Otomobil', parca: 'Jant', islem: 'Boya', ustTutar: 2000, not: '' },
  { grup: 'Otomobil', parca: 'Lastik', islem: 'Bedel / İşçilik', ustTutar: 5000, not: 'Ebat ve markaya göre piyasa araştırması yapılır. Faturasız olarak 5.000 TL kadar işçilik girilebilir; lastik fiyatı 5.000 TL’den fazla ise faturalı girilecek.' },
  // İŞ NOTLAR.docx — Mobil onarım ve ek işçilik referans bedelleri.
  { grup: 'Otomobil', parca: 'Jant', islem: 'Mobil Onarım', ustTutar: 2500, not: 'Mobil onarım firması jant düzeltme + jant boyamayı birlikte yapar. Hasarlı jant fotoğrafı ve gerekirse rot-balans kontrol edilir.' },
  { grup: 'Otomobil', parca: 'Ön Tampon', islem: 'Mobil Onarım', ustTutar: 2500, not: 'Plastik kaynak/tamir + sök-tak (mobilci). Tampon boyası servis/usta tarafından ayrıca değerlendirilir.' },
  { grup: 'Otomobil', parca: 'Klima Gazı', islem: 'Mobil Onarım', ustTutar: 2500, not: 'Klima radyatörü söküldüğünde klima gazı eklenmesi gerekir.' },
  { grup: 'Otomobil', parca: 'Antifriz', islem: 'Mobil Onarım', ustTutar: 1500, not: 'Motor radyatörü söküldüğünde antifriz eklenmesi gerekir.' }
];

export interface PriceListMatch {
  entry: PriceListEntry;
  score: number;
  label: string;
}

/**
 * Bir parça için varsayılan işçilik önerisi.
 * Parça listesinden gelen (genelde değişen) parça için makul bir başlangıç işçiliği döndürür;
 * eksper sonra düzeltir. Öncelik: Değişim Boya > Macunlu Boya > Boya > Kaporta > Bedel > ilk kayıt.
 */
export function suggestLaborForPart(parca: string): { islem: string; tutar: number } | null {
  const norm = normalizeSearch(parca);
  if (!norm) return null;
  const entries = BUILTIN_PRICE_LIST.filter((entry) => normalizeSearch(entry.parca) === norm);
  if (entries.length === 0) return null;
  const priority = ['DEGISIM BOYA', 'MACUNLU BOYA', 'BOYA', 'KAPORTA', 'BEDEL', 'ROT BALANS', 'ELEKTRIK'];
  for (const key of priority) {
    const hit = entries.find((entry) => normalizeSearch(entry.islem).includes(key));
    if (hit) return { islem: hit.islem, tutar: hit.ustTutar };
  }
  const first = entries[0]!;
  return { islem: first.islem, tutar: first.ustTutar };
}

function normalizedTokens(value: string): string[] {
  const normalized = normalizeSearch(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

// Bir referans token'ı (örn. "MACUNLU", "BOYA") açıklamada var mı?
// Kısa ekler (<=2) yalnızca tam kelime olarak; uzun token'lar önek/sonek esnekliğiyle eşleşir
// (BOYAMA~BOYA, TAMPONU~TAMPON, MACUN~MACUNLU). Böylece "ÖN"/"ON" gibi kısa parçalar
// "TAMPON" içinde yanlış eşleşme yapmaz.
function tokenMatches(token: string, descWords: string[], descNorm: string): boolean {
  if (token.length <= 2) return descWords.includes(token);
  if (descWords.includes(token)) return true;
  if (descWords.some((word) => word.length >= 3 && (word.startsWith(token) || token.startsWith(word)))) return true;
  return token.length >= 5 && descNorm.includes(token);
}

/**
 * Yüklenen Excel satırının açıklamasını fiyat listesiyle eşleştirir.
 * Bir kalemin eşleşmesi için parçanın TÜM token'ları VE işlemin TÜM token'ları açıklamada
 * bulunmalıdır. Birden fazla aday varsa en spesifik olan (en uzun parça+işlem) seçilir; böylece
 * "Sedefli Macunlu Boya" > "Macunlu Boya" > "Boya" önceliklenir.
 */
export function matchPriceListEntry(description: string, list: readonly PriceListEntry[] = BUILTIN_PRICE_LIST): PriceListMatch | null {
  const descNorm = normalizeSearch(description);
  if (!descNorm) return null;
  const descWords = descNorm.split(' ').filter(Boolean);
  let best: PriceListMatch | null = null;
  for (const entry of list) {
    const parcaTokens = normalizedTokens(entry.parca);
    const islemTokens = normalizedTokens(entry.islem);
    if (parcaTokens.length === 0 || islemTokens.length === 0) continue;
    if (!parcaTokens.every((token) => tokenMatches(token, descWords, descNorm))) continue;
    if (!islemTokens.every((token) => tokenMatches(token, descWords, descNorm))) continue;
    // İşlem daha spesifik bir ayırt edici olduğu için biraz daha ağır puanlanır.
    const score = parcaTokens.join('').length * 2 + islemTokens.join('').length * 3;
    if (!best || score > best.score) best = { entry, score, label: `${entry.parca} / ${entry.islem}` };
  }
  return best;
}
