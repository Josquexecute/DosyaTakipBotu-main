/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v4: onarım ağırlığı sınıflayıcı (SAF).
 *
 * Kaynak: SEİK uygulama esasları 3.4 + Hesaplama!F16 formül deseni:
 * işçilik / yeni parça fiyatı oranı < %15 → hafif; %15-%30 → orta; > %30 → ağır.
 * Excel deseninde sınırlar: <0.15 hafif; >=0.15 ve <0.3 orta; >=0.3 ağır — ANCAK esaslar 3.4
 * "%15'ine kadar hafif" ve görev sözleşmesi 0.15→hafif / 0.30→orta / 0.30 üzeri→ağır der;
 * sınır değerlerde eksper lehine alt sınıf uygulanır (0.15 dahil hafif, 0.30 dahil orta).
 */
import type { ValueLossRepairSeverity } from './value-loss-part-input-types';

export interface RepairSeverityResult {
  severity: ValueLossRepairSeverity;
  laborToNewPartRatio?: number;
  warnings: string[];
}

/** İşçilik/yeni parça oranından onarım ağırlığını sınıflar; eksik/geçersiz veride 'unknown'. */
export function classifyRepairSeverity(laborAmount: unknown, newPartPrice: unknown): RepairSeverityResult {
  const warnings: string[] = [];
  if (typeof laborAmount !== 'number' || !Number.isFinite(laborAmount)) {
    return { severity: 'unknown', warnings };
  }
  if (typeof newPartPrice !== 'number' || !Number.isFinite(newPartPrice)) {
    return { severity: 'unknown', warnings };
  }
  if (newPartPrice <= 0) {
    warnings.push('Yeni parça fiyatı 0 veya negatif; onarım ağırlığı sınıflanamadı.');
    return { severity: 'unknown', warnings };
  }
  if (laborAmount < 0) {
    warnings.push('İşçilik bedeli negatif; onarım ağırlığı sınıflanamadı.');
    return { severity: 'unknown', warnings };
  }
  const ratio = Math.round((laborAmount / newPartPrice) * 10000) / 10000;
  const severity: ValueLossRepairSeverity = ratio <= 0.15 ? 'light' : ratio <= 0.3 ? 'medium' : 'heavy';
  return { severity, laborToNewPartRatio: ratio, warnings };
}
