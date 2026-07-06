/**
 * v0.6.x — AI İşçilik v3.11: D kodu yazma/restore yedek dosyalarını listeleme/silme tipleri (yalnız yerel dosya).
 * Yalnız uygulamanın ürettiği .yedek-/.restore-oncesi- yedekleri; ana Excel/takip.json asla listelenmez/silinmez.
 */
export type AiModeBackupKind = 'before_d_code_apply' | 'before_restore' | 'unknown';

export interface AiModeBackupFileInfo {
  filePath: string;
  fileName: string;
  originalExcelPath: string;
  backupKind: AiModeBackupKind;
  createdAt?: string;
  sizeBytes?: number;
  isLikelyForCurrentExcel: boolean;
  warnings: string[];
}

export interface AiModeBackupListArg {
  filePath: string;
}

export interface AiModeBackupListResult {
  originalExcelPath: string;
  backups: AiModeBackupFileInfo[];
  warnings: string[];
}

export interface AiModeBackupDeleteArg {
  filePath: string;
  originalExcelPath: string;
}

export interface AiModeBackupDeleteResult {
  ok: boolean;
  deletedPath: string;
  message: string;
}
