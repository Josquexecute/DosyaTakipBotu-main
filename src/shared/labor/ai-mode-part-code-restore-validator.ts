/**
 * v0.6.x — AI İşçilik v3.10: Restore isteği DOĞRULAMASI (SAF). ok=false ise geri alma yapılmamalıdır.
 * Yalnız uygulamanın kendi ürettiği yedek desenine (.yedek-/.restore-oncesi-) izin verir; başka dosya restore edilmez.
 */
export interface RestoreValidationInput {
  filePath?: string;
  backupPath?: string;
  rowNumber?: number;
  column?: string;
}

export interface RestoreValidationResult {
  ok: boolean;
  blocking: string[];
}

const XLSX_RE = /\.xlsx$/i;
const BACKUP_NAME_RE = /\.(yedek|restore-oncesi)-\d+\.xlsx$/i;

function samePathLoose(a: string, b: string): boolean {
  return a.replace(/[\\/]+/g, '/').toLowerCase() === b.replace(/[\\/]+/g, '/').toLowerCase();
}

/** Restore argümanını doğrular; güvenli değilse ok=false. */
export function validateAiModePartCodeRestore(input: RestoreValidationInput): RestoreValidationResult {
  const blocking: string[] = [];
  const filePath = (input.filePath ?? '').trim();
  const backupPath = (input.backupPath ?? '').trim();

  if (!filePath) blocking.push('Hedef Excel dosya yolu boş.');
  else if (!XLSX_RE.test(filePath)) blocking.push('Hedef dosya .xlsx değil.');

  if (!backupPath) blocking.push('Yedek dosya yolu boş.');
  else if (!XLSX_RE.test(backupPath)) blocking.push('Yedek dosya .xlsx değil.');
  else if (!BACKUP_NAME_RE.test(backupPath)) blocking.push('Yedek dosya beklenen yedek desenine uymuyor; güvenlik için restore durduruldu.');

  if (filePath && backupPath && samePathLoose(filePath, backupPath)) blocking.push('Hedef dosya ile yedek aynı olamaz.');

  if (!Number.isInteger(input.rowNumber) || (input.rowNumber ?? 0) <= 1) blocking.push('Geçersiz satır numarası.');
  if (!input.column || !/^[A-Z]+$/i.test(input.column)) blocking.push('Geçersiz parça kodu sütunu.');

  return { ok: blocking.length === 0, blocking };
}
