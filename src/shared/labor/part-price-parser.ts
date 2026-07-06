/**
 * v0.6.x — AI İşçilik v3: Türkçe/karma para formatı güvenli parse (SAF; ağ/dosya yok).
 * Destekler: "23.382₺", "23.382,00", "23382", "23,382.00". Formül sonucu sayısalsa doğrudan kullanılır.
 */

export interface PriceParseResult {
  /** Parse edilebildiyse tutar; aksi halde null. */
  value: number | null;
  /** Ham değer sayısala çevrilemedi mi (ör. okunamayan formül). */
  unreadable: boolean;
}

/** Türkçe/karma para metnini güvenli sayıya çevirir. Çözülemezse null. */
export function parseTurkishPrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized = cleaned;

  if (hasDot && hasComma) {
    // Son görülen ayraç ondalıktır; diğeri binliktir.
    const decimalSep = cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',') ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = cleaned.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    // Yalnız virgül: 1-2 hane sonu → ondalık; aksi (ör. 3 hane) → binlik.
    normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.split(',').join('');
  } else if (hasDot) {
    // Yalnız nokta: 3 hane sonu → binlik (TR), 1-2 hane sonu → ondalık.
    normalized = /\.\d{3}$/.test(cleaned) ? cleaned.split('.').join('') : cleaned;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Excel hücresinden (formül sonucu numeric varsa öncelikli) güvenli fiyat okur. */
export function readPriceCell(numeric: number | null | undefined, value: unknown): PriceParseResult {
  if (typeof numeric === 'number' && Number.isFinite(numeric)) return { value: numeric, unreadable: false };
  const parsed = parseTurkishPrice(value);
  if (parsed !== null) return { value: parsed, unreadable: false };
  // Değer var ama sayıya çevrilemedi (ör. okunamayan formül) → kontrol gerekli.
  const hasContent = typeof value === 'string' ? value.trim().length > 0 : value != null;
  return { value: null, unreadable: hasContent };
}
