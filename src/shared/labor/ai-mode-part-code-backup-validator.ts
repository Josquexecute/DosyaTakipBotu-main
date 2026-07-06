/**
 * v0.6.x — AI İşçilik v3.11: Yedek dosya sınıflandırma + silme güvenliği DOĞRULAMASI (SAF).
 * Yalnız .yedek-/.restore-oncesi- desenli yedekler tanınır/silinebilir; ana Excel/takip.json/klasör asla.
 */
import type { AiModeBackupKind } from './ai-mode-part-code-backup-types';

const YEDEK_RE = /^(.*)\.yedek-(\d+)\.xlsx$/i;
const RESTORE_RE = /^(.*)\.restore-oncesi-(\d+)\.xlsx$/i;

export interface BackupClassification {
  backupKind: Exclude<AiModeBackupKind, 'unknown'>;
  createdAt?: string;
  isLikelyForCurrentExcel: boolean;
  warnings: string[];
}

/** Dosya adını yedek türüne göre sınıflandırır; tanınan yedek değilse null. */
export function classifyAiModeBackup(fileName: string, originalExcelFileName: string): BackupClassification | null {
  const yedek = fileName.match(YEDEK_RE);
  const restore = fileName.match(RESTORE_RE);
  const match = yedek ?? restore;
  if (!match) return null;
  const base = originalExcelFileName.replace(/\.xlsx$/i, '');
  const isLikelyForCurrentExcel = (match[1] ?? '').toLowerCase() === base.toLowerCase();
  const ts = Number(match[2]);
  const warnings: string[] = [];
  if (!isLikelyForCurrentExcel) warnings.push('Bu yedek farklı bir Excel dosyası için olabilir; geri yükleme için otomatik uygun sayılmaz.');
  const out: BackupClassification = {
    backupKind: yedek ? 'before_d_code_apply' : 'before_restore',
    isLikelyForCurrentExcel,
    warnings
  };
  if (Number.isFinite(ts) && ts > 0) out.createdAt = new Date(ts).toISOString();
  return out;
}

export interface BackupDeleteValidationInput {
  fileName?: string;
  originalExcelFileName?: string;
  isSameAsOriginal?: boolean;
  isSameDirectory?: boolean;
}

export interface BackupDeleteValidationResult {
  ok: boolean;
  blocking: string[];
}

/** Yedek silme isteğini doğrular; yalnız tanınan yedek + ana Excel değil + aynı klasör → ok. */
export function validateAiModeBackupDelete(input: BackupDeleteValidationInput): BackupDeleteValidationResult {
  const blocking: string[] = [];
  const fileName = (input.fileName ?? '').trim();
  if (!fileName) blocking.push('Silinecek dosya adı boş.');
  else if (!/\.xlsx$/i.test(fileName)) blocking.push('Yalnız .xlsx yedek dosyaları silinebilir.');
  else if (/^takip\.json$/i.test(fileName)) blocking.push('takip.json silinemez.');
  else if (!classifyAiModeBackup(fileName, input.originalExcelFileName ?? '')) blocking.push('Dosya tanınan yedek deseninde değil (.yedek-/.restore-oncesi-); silme durduruldu.');
  if (input.isSameAsOriginal) blocking.push('Ana Excel dosyası silinemez.');
  if (input.isSameDirectory === false) blocking.push('Yedek dosya, Excel dosyasıyla aynı klasörde değil; silme durduruldu.');
  return { ok: blocking.length === 0, blocking };
}
