/**
 * v0.6.x — AI İşçilik v3.11: Yedek yönetimi UI aksiyonları (SAF state). IPC/confirmDialog/render caller'a (main.ts) aittir.
 * Yalnız yerel yedek listesi/silme; ana Excel/takip.json/klasör silme YOK; toplu silme YOK.
 */
import { state } from '../state';
import type { AiModeBackupListResult } from '../../../shared/labor/ai-mode-part-code-backup-types';

export function applyBackupList(result: AiModeBackupListResult): void {
  state.aiModePartSearch.backupList = result;
}

/** Silinen yedeği listeden düşürür (yeniden yüklemeden). */
export function removeBackupFromList(deletedPath: string): void {
  const list = state.aiModePartSearch.backupList;
  if (!list) return;
  state.aiModePartSearch.backupList = { ...list, backups: list.backups.filter((b) => b.filePath !== deletedPath) };
}
