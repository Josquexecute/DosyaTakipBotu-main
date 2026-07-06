/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v1: 01.07.2026 ve sonrası trafik/ZMSS dosyalarında
 * değer kaybı KONTROL zorunluluğu tespiti (SAF: ağ/dosya/electron/DOM yok; yalnız girdiden türetir).
 *
 * Bu modül kesin tutar/karar üretmez. "Ağır hasar varsa değer kaybı yoktur" gibi kör karar VERMEZ;
 * ağır/tam hasar ve eksik veri durumlarında uyarı + kontrol mantığı kurar.
 */

/** Yeni dönem değer kaybı kontrol zorunluluğunun başladığı tarih. */
export const VALUE_LOSS_EFFECTIVE_DATE = '2026-07-01';
const EFFECTIVE_YMD = 20260701;

export type ValueLossSigortaTuru = 'trafik' | 'kasko' | 'ihtiyari-mali-sorumluluk' | null;

export interface ValueLossRequirementInput {
  /** Çözümlenmiş sigorta türü (null = belirsiz). */
  sigortaTuru: ValueLossSigortaTuru;
  /** Atama tarihi (ISO `yyyy-aa-gg` veya `gg.aa.yyyy`). */
  assignmentDate?: string | null;
  /** İhbar tarihi (atama yoksa kullanılır). */
  noticeDate?: string | null;
  /** Dosya açılış tarihi (atama/ihbar yoksa kullanılır). */
  fileOpenDate?: string | null;
  isHeavyDamage?: boolean | null;
  isTotalLoss?: boolean | null;
  /** Değer kaybının açıkça kapsam dışı olarak işaretlendiği durum. */
  valueLossExplicitlyExcluded?: boolean | null;
  hasPastHeavyDamage?: boolean | null;
  /** Onarılan/değişen parça bilgisi elde mevcut mu (false/null = eksik). */
  hasPartDamageInfo?: boolean | null;
  /** Rayiç / emsal piyasa referansı mevcut mu (false/null = eksik). */
  hasMarketReference?: boolean | null;
}

export interface ValueLossRequirementResult {
  status: 'required' | 'not_required' | 'control_needed' | 'unknown';
  reasons: string[];
  warnings: string[];
  effectiveDate: string;
}

function isUnknownBool(value: boolean | null | undefined): boolean {
  return value === null || value === undefined;
}

/** Tarih metnini karşılaştırılabilir sayıya (yyyyaagg) çevirir; okunamazsa null. */
function toYmd(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  return null;
}

/** Verilen tarih 01.07.2026 eşiğinde/sonrasında mı? Okunamazsa/boşsa null. */
export function isDateOnOrAfterEffective(value: string | null | undefined): boolean | null {
  const ymd = toYmd(value);
  return ymd === null ? null : ymd >= EFFECTIVE_YMD;
}

/** Öncelik sırasıyla ilk okunabilen tarihi seçer; hiçbiri yoksa hadAny ile ayırır. */
function pickRequirementDate(input: ValueLossRequirementInput): { ymd: number | null; hadAny: boolean } {
  const candidates = [input.assignmentDate, input.noticeDate, input.fileOpenDate];
  for (const c of candidates) {
    const y = toYmd(c);
    if (y !== null) return { ymd: y, hadAny: true };
  }
  const hadAny = candidates.some((c) => typeof c === 'string' && c.trim().length > 0);
  return { ymd: null, hadAny };
}

/**
 * Değer kaybı kontrol zorunluluğunu değerlendirir. Trafik/ZMSS odaklıdır; kasko için zorunluluk
 * uyarısı vermez. Ağır/tam hasar ve eksik veride kör "yok" kararı yerine `control_needed` döner.
 */
export function evaluateValueLossRequirement(input: ValueLossRequirementInput): ValueLossRequirementResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const effectiveDate = VALUE_LOSS_EFFECTIVE_DATE;

  // 1) Kasko: değer kaybı zorunluluğu trafik/ZMSS kapsamındadır.
  if (input.sigortaTuru === 'kasko') {
    reasons.push('Kasko dosyası; değer kaybı zorunluluğu trafik/ZMSS kapsamındadır. Kasko için ayrı zorunluluk uyarısı verilmez.');
    return { status: 'not_required', reasons, warnings, effectiveDate };
  }

  // 2) Değer kaybı açıkça kapsam dışı işaretlenmiş.
  if (input.valueLossExplicitlyExcluded === true) {
    reasons.push('Değer kaybı bu dosyada açıkça kapsam dışı olarak işaretlenmiş.');
    return { status: 'not_required', reasons, warnings, effectiveDate };
  }

  const isTrafikLike = input.sigortaTuru === 'trafik' || input.sigortaTuru === 'ihtiyari-mali-sorumluluk';

  // 3) Dosya türü belirsiz (trafik mi kasko mu anlaşılamıyor).
  if (!isTrafikLike) {
    reasons.push('Dosya türü (trafik/ZMSS mi kasko mu) netleştirilemedi; zorunluluk için tür teyidi gerekir.');
    const { hadAny } = pickRequirementDate(input);
    if (!hadAny && isUnknownBool(input.isHeavyDamage) && isUnknownBool(input.isTotalLoss)) {
      return { status: 'unknown', reasons, warnings, effectiveDate };
    }
    return { status: 'control_needed', reasons, warnings, effectiveDate };
  }

  // 4) Trafik/ZMSS: tarih değerlendirmesi.
  const { ymd, hadAny } = pickRequirementDate(input);
  if (ymd === null) {
    reasons.push(hadAny
      ? 'Atama/ihbar/açılış tarihi okunamadı; 01.07.2026 eşiğine göre değerlendirme için tarih teyidi gerekir.'
      : 'Atama/ihbar/açılış tarihi bilinmiyor; 01.07.2026 zorunluluk eşiği için tarih gerekir.');
    return { status: 'control_needed', reasons, warnings, effectiveDate };
  }
  if (ymd < EFFECTIVE_YMD) {
    reasons.push('İlgili tarih 01.07.2026 öncesi; yeni dönem değer kaybı kontrol zorunluluğu kapsamı dışında.');
    warnings.push('Tarih öncesi olsa da genel değer kaybı değerlendirmesi eksper takdirine bağlı olabilir.');
    return { status: 'not_required', reasons, warnings, effectiveDate };
  }

  // 01.07.2026 ve sonrası trafik/ZMSS: zorunluluk mevcut.
  reasons.push('01.07.2026 ve sonrası trafik/ZMSS dosyası; hasar tespiti ile birlikte değer kaybı yönünden de değerlendirme yapılması gerekir.');

  // Ağır/tam hasar: kör karar verme; önce kontrol.
  if (input.isTotalLoss === true || input.isHeavyDamage === true) {
    reasons.push('Ağır/tam hasar durumu değer kaybı sonucunu etkileyebileceğinden önce kontrol edilmelidir.');
    warnings.push('Dosyada ağır/tam hasar göstergesi var; değer kaybı sınırlı olabilir veya uygulanmayabilir. Kesin karar için kontrol gerekir.');
    return { status: 'control_needed', reasons, warnings, effectiveDate };
  }

  // Diğer kontrol tetikleyicileri (eksik veri / geçmiş hasar).
  const triggers: string[] = [];
  if (input.hasPastHeavyDamage === true) triggers.push('Geçmiş ağır hasar bilgisi mevcut; değer kaybı etkisi kontrol edilmelidir.');
  if (input.hasPartDamageInfo !== true) triggers.push('Onarılan/değişen parça bilgisi eksik; değer kaybı için parça verisi tamamlanmalıdır.');
  if (input.hasMarketReference !== true) triggers.push('Rayiç/emsal piyasa bilgisi yok; reel piyasa analizi için veri gerekir.');
  if (triggers.length > 0) {
    reasons.push(...triggers);
    warnings.push('Değer kaybı değerlendirmesi zorunlu ancak eksik/kontrol gerektiren veriler var; tamamlanınca hesaplanabilir.');
    return { status: 'control_needed', reasons, warnings, effectiveDate };
  }

  // Tür uygun, tarih sonrası, ağır/tam hasar yok, veri tam: kontrol/değerlendirme zorunlu.
  reasons.push('Değer kaybı yönünden değerlendirme ve reel piyasa analizi zorunludur.');
  return { status: 'required', reasons, warnings, effectiveDate };
}
