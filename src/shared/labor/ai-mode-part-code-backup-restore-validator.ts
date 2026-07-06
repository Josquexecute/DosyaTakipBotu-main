/**
 * v0.6.x — AI İşçilik v3.12: Genel yedekten restore DOĞRULAMASI (SAF). Yanlış yedeği yanlış Excel'e basmayı önler.
 * Yalnız hedef Excel'in base adıyla eşleşen, aynı klasördeki, tanınan .yedek-/.restore-oncesi- yedekleri kabul eder.
 */
import { classifyAiModeBackup } from './ai-mode-part-code-backup-validator';

export interface BackupRestoreValidationInput {
  filePath?: string;
  backupPath?: string;
  targetFileName?: string;
  backupFileName?: string;
  isSameAsTarget?: boolean;
  isSameDirectory?: boolean;
}

export interface BackupRestoreValidationResult {
  ok: boolean;
  blocking: string[];
}

const XLSX_RE = /\.xlsx$/i;

/** Genel yedekten restore isteğini doğrular; güvenli değilse ok=false (restore yapılmamalı). */
export function validateAiModeBackupRestore(input: BackupRestoreValidationInput): BackupRestoreValidationResult {
  const blocking: string[] = [];
  const filePath = (input.filePath ?? '').trim();
  const backupPath = (input.backupPath ?? '').trim();

  if (!filePath) blocking.push('Hedef Excel dosya yolu boş.');
  else if (!XLSX_RE.test(filePath)) blocking.push('Hedef dosya .xlsx değil.');
  if (!backupPath) blocking.push('Yedek dosya yolu boş.');
  else if (!XLSX_RE.test(backupPath)) blocking.push('Yedek dosya .xlsx değil.');
  if (input.isSameAsTarget) blocking.push('Hedef dosya ile yedek aynı olamaz.');
  if (input.isSameDirectory === false) blocking.push('Yedek dosya, Excel dosyasıyla aynı klasörde değil; restore durduruldu.');

  const cls = classifyAiModeBackup(input.backupFileName ?? '', input.targetFileName ?? '');
  if (!cls) blocking.push('Yedek dosya tanınan desende değil (.yedek-/.restore-oncesi-); restore durduruldu.');
  else if (!cls.isLikelyForCurrentExcel) blocking.push('Yedek dosya bu Excel dosyasına ait görünmüyor; yanlış geri yükleme riskine karşı restore durduruldu.');

  return { ok: blocking.length === 0, blocking };
}
