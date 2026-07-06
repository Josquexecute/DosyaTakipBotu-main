/**
 * v0.6.x — AI İşçilik v3.10: Son D sütunu yazımını yedekten GERİ ALMA tipleri (yalnız restore edilen Excel değişir).
 * Restore yalnız kullanıcı açık onayıyla; restore öncesi mevcut dosya ayrıca yedeklenir. Toplu/otomatik restore YOK.
 */
export interface RestoreAiModePartCodeArg {
  filePath: string;
  backupPath: string;
  rowNumber: number;
  /** Parça kodu (D) sütun harfi — restore sonrası satır doğrulaması için. */
  column: string;
  expectedOldPartCode?: string;
  expectedNewPartCode?: string;
}

export interface RestoreAiModePartCodeResult {
  ok: boolean;
  filePath: string;
  restoredFromBackupPath: string;
  preRestoreBackupPath?: string;
  rowNumber: number;
  column: string;
  expectedRestoredCode?: string;
  currentPartCodeAfterRestore?: string;
  matchesExpectedCode: boolean;
  warnings: string[];
  message: string;
  debugMessage?: string;
}
