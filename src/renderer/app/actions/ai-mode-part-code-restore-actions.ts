/**
 * v0.6.x — AI İşçilik v3.10: Son D sütunu yazımını geri alma aksiyon yardımcıları (SAF state + arg kurulumu).
 * IPC/confirmDialog/render caller'a (main.ts) aittir. Yalnız restore edilen Excel değişir; H-N/store'lara dokunmaz.
 */
import { state } from '../state';
import type { RestoreAiModePartCodeArg, RestoreAiModePartCodeResult } from '../../../shared/labor/ai-mode-part-code-restore-types';

/** Son yazma undo bilgisinden restore argümanını kurar (undo uygun değilse null). */
export function buildRestoreArg(): RestoreAiModePartCodeArg | null {
  const undo = state.aiModePartSearch.lastApplyUndo;
  if (!undo || !undo.available || !undo.backupPath || !undo.filePath || !Number.isInteger(undo.rowNumber)) return null;
  const arg: RestoreAiModePartCodeArg = {
    filePath: undo.filePath,
    backupPath: undo.backupPath,
    rowNumber: undo.rowNumber,
    column: undo.column,
    expectedNewPartCode: undo.newPartCode
  };
  if (undo.oldPartCode !== undefined) arg.expectedOldPartCode = undo.oldPartCode;
  return arg;
}

/** Restore sonucunu uygular; başarılıysa undo tüketilir (buton kaybolur), başarısızsa undo korunur. */
export function applyRestoreResult(result: RestoreAiModePartCodeResult): void {
  state.aiModePartSearch.restoreResult = result;
  if (result.ok && state.aiModePartSearch.lastApplyUndo) {
    state.aiModePartSearch.lastApplyUndo = { ...state.aiModePartSearch.lastApplyUndo, available: false };
  }
}
