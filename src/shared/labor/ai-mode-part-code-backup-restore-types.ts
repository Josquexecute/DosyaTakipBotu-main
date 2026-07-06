/**
 * v0.6.x — AI İşçilik v3.12: Genel yedekten (listeden seçili .yedek-/.restore-oncesi-) hedef Excel'i geri yükleme tipleri.
 * Yalnız kullanıcı açık onayıyla; restore öncesi mevcut dosya ayrıca yedeklenir. Toplu/otomatik restore YOK.
 */
import type { AiModeBackupKind } from './ai-mode-part-code-backup-types';

export interface RestoreAiModeBackupArg {
  filePath: string;
  backupPath: string;
  backupKind: Exclude<AiModeBackupKind, 'unknown'>;
}

export interface AiModeBackupRestoreVerification {
  fileExists: boolean;
  sizeBytes?: number;
  backupSizeBytes?: number;
  sizeMatchesBackup: boolean;
  message: string;
}

export interface RestoreAiModeBackupResult {
  ok: boolean;
  filePath: string;
  restoredFromBackupPath: string;
  preRestoreBackupPath?: string;
  backupKind: AiModeBackupKind;
  verifiedAfterRestore?: AiModeBackupRestoreVerification;
  warnings: string[];
  message: string;
  debugMessage?: string;
}
