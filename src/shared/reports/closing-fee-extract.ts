/**
 * v0.6.x — Kapanma (Ekspertiz) Ücreti çıkarımı (SAF).
 *
 * "EKSPERTİZ RAPORLARI/<yıl>/<AY YIL>/<PLAKA> EKSPERTİZ RAPORU.pdf" düzenindeki kesin
 * ekspertiz raporu METNİNDEN ücret ve eşleştirme alanlarını çıkarır. PDF'i BU MODÜL OKUMAZ
 * (ağ/dosya/IPC yok); metin, main tarafındaki mevcut pdf2json tabanlı okuyucudan gelir.
 * 28 gerçek raporluk öğrenme setiyle doğrulanmıştır (26 metin tabanlı + 2 özel-glif fontlu).
 */

export type ClosingFeeStatus = 'ok' | 'fee_missing' | 'unreadable';

export interface ClosingFeeExtraction {
  status: ClosingFeeStatus;
  /** Normalize edilmiş ücret (TL). Yalnız status 'ok' iken tanımlı. */
  feeTl?: number;
  feeRaw?: string;
  /** Sigorta şirketi hasar dosya no (ör. "11/18517538") — ofis dosya no ile eşleşebilir. */
  dosyaNo?: string;
  /** Eksper rapor no (ör. "2026/53"). */
  raporNo?: string;
  /** UzaktanEkspertiz / YerindeEkspertiz vb. */
  ekspertizTuru?: string;
  /** Rapor kayıt tarihi (gg.aa.yyyy) — varsa. */
  kayitTarihi?: string;
  /** Metin içindeki plaka (dosya adıyla çapraz doğrulama için). */
  plateInText?: string;
  warnings: string[];
}

/** Plakayı eşleştirme anahtarına indirger: boşluk/tire kaldır, Türkçe I/İ→I, büyük harf. */
export function normalizePlateKey(raw: string): string {
  return (raw ?? '')
    .replace(/[ıi]/g, 'I')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Rapor dosya adını çözer. Beklenen: "<PLAKA> EKSPERTİZ RAPORU.pdf".
 * Kodlama bozulmalarına toleranslıdır (İ→? gibi): "EKSPERT" kökü yeterli sayılır.
 */
export function parseReportFileName(fileName: string): { plateKey: string | null; isReport: boolean } {
  const base = (fileName ?? '').replace(/\.pdf$/i, '').trim();
  const m = /^([0-9]{2}\s?[A-ZÇĞİÖŞÜa-zçğıöşü]{1,4}\s?[0-9]{2,5})\s+EKSPERT/iu.exec(base);
  if (!m) return { plateKey: null, isReport: /EKSPERT/i.test(base) };
  return { plateKey: normalizePlateKey(m[1] ?? ''), isReport: true };
}

/**
 * TR/EN karışık tutar biçimlerini TL sayısına çevirir. Öğrenme setinde görülenler:
 * "1600", "6125.4", "2417.41", "3352.5"; olası TR biçimleri: "1.600,00", "2.400".
 * Tek nokta yalnız "1.600" gibi binlik desenindeyse binlik sayılır; aksi halde ondalıktır.
 */
export function parseTurkishAmount(raw: string): number | null {
  const s = (raw ?? '').trim().replace(/\s|TL$/gi, '');
  if (!/^[0-9][0-9.,]*$/.test(s)) return null;
  let normalized: string;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null;
  return Math.round(value * 100) / 100;
}

const grab = (text: string, re: RegExp): string | undefined => {
  const m = re.exec(text);
  return m?.[1]?.trim() || undefined;
};

/** Özel-glif (Type3) fontlu raporların çöp metnini sezer: anlamlı Türkçe kelime yoksa okunamazdır. */
export function looksUnreadableReportText(text: string): boolean {
  const t = text ?? '';
  if (t.length < 200) return true;
  return !/Ekspertiz|Rapor No|Plaka|Sigorta/i.test(t);
}

/**
 * Kesin ekspertiz raporu metninden kapanma ücretini ve eşleştirme alanlarını çıkarır.
 * Ücret çapası: "Ekspertiz Ücreti : <tutar>" (Ekspertiz Bilgileri bölümü). Bulunamazsa
 * 'fee_missing'; metin özel-glif çöpüyse 'unreadable' döner. Hiçbir yere yazmaz.
 */
export function extractClosingFeeFromText(text: string): ClosingFeeExtraction {
  const warnings: string[] = [];
  if (looksUnreadableReportText(text)) {
    return {
      status: 'unreadable',
      warnings: ['Rapor metni okunamadı (muhtemelen özel-glif fontlu PDF); ücret elle girilmeli veya OCR ile okunmalıdır.']
    };
  }
  const dosyaNo = grab(text, /Dosya No\s*:?\s*([0-9]{1,3}\s*\/\s*[0-9]{5,12})/i)?.replace(/\s+/g, '');
  const raporNo = grab(text, /Rapor No\s*:?\s*([0-9]{4}\s*\/\s*[0-9]{1,6})/i)?.replace(/\s+/g, '');
  const ekspertizTuru = grab(text, /Ekspertiz Türü\s*:?\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)/i);
  const kayitTarihi = grab(text, /Rapor\/Kayıt Tarihi\s*:?\s*[0-9.]+\s+[0-9.:]+\s*\/\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i)
    ?? grab(text, /Oluşturulma Tarihi\s*:?\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i);
  const plateInText = grab(text, /Plaka Numaras[ıi]\s*:?\s*([0-9]{2}\s?[A-ZÇĞİÖŞÜ]{1,4}\s?[0-9]{2,5})/i);

  // exactOptionalPropertyTypes: tanımsız alanlar nesneye hiç konmaz (koşullu spread).
  const fields = {
    ...(dosyaNo ? { dosyaNo } : {}),
    ...(raporNo ? { raporNo } : {}),
    ...(ekspertizTuru ? { ekspertizTuru } : {}),
    ...(kayitTarihi ? { kayitTarihi } : {}),
    ...(plateInText ? { plateInText } : {})
  };
  const feeRaw = grab(text, /Ekspertiz Ücreti\s*:?\s*([0-9][0-9.,]*)/i);
  if (!feeRaw) {
    warnings.push('Raporda "Ekspertiz Ücreti" alanı bulunamadı; ücret elle kontrol edilmelidir.');
    return { status: 'fee_missing', ...fields, warnings };
  }
  const feeTl = parseTurkishAmount(feeRaw);
  if (feeTl === null) {
    warnings.push(`Ücret değeri çözümlenemedi: "${feeRaw}".`);
    return { status: 'fee_missing', feeRaw, ...fields, warnings };
  }
  if (feeTl < 100 || feeTl > 500_000) {
    warnings.push('Ücret olağan aralık dışında görünüyor; elle doğrulanması önerilir.');
  }
  return { status: 'ok', feeTl, feeRaw, ...fields, warnings };
}
