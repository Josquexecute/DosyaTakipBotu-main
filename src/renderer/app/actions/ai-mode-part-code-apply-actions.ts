/**
 * v0.6.x — AI İşçilik v3.8: D sütununa yazma aksiyon yardımcıları (SAF state + arg kurulumu).
 * IPC çağrısı/confirmDialog/render caller'a (main.ts) aittir. Yalnız D sütunu; H-N/diğer kolonlara dokunmaz.
 */
import { state } from '../state';
import type { AutoLaborRowPreview } from '../../../shared/types';
import type { ApplyAiModePartCodeArg, ApplyAiModePartCodeResult, LastPartCodeApplyUndoState } from '../../../shared/labor/ai-mode-part-code-apply-types';

/** Önizleme satırı + aktif önizlemeden D sütunu yazma argümanını kurar (aday/satır uygun değilse null). */
export function buildApplyToDColumnArg(row: AutoLaborRowPreview): ApplyAiModePartCodeArg | null {
  const preview = state.autoLaborPreview;
  const cand = row.aiModeCandidate;
  if (!preview || !cand || !cand.candidatePartCode || !preview.partCodeColumn) return null;
  const arg: ApplyAiModePartCodeArg = {
    filePath: preview.filePath,
    rowNumber: row.rowNumber,
    column: preview.partCodeColumn,
    partNameColumn: preview.partNameColumn,
    candidatePartCode: cand.candidatePartCode,
    expectedPartName: row.partName,
    confidence: cand.confidence
  };
  if (row.partCode) arg.expectedOldPartCode = row.partCode;
  return arg;
}

export function applyAiModeApplyResult(result: ApplyAiModePartCodeResult): void {
  state.aiModePartSearch.applyResult = result;
  // v3.9: son yazma için geri alma hazırlığını (buton yok) session'da tut.
  if (result.undoInfo?.available) {
    const u = result.undoInfo;
    const undo: LastPartCodeApplyUndoState = {
      available: true, filePath: u.filePath, rowNumber: u.rowNumber, column: u.column,
      newPartCode: u.newPartCode, createdAt: new Date().toISOString(), note: u.note
    };
    if (u.backupPath) undo.backupPath = u.backupPath;
    if (u.oldPartCode) undo.oldPartCode = u.oldPartCode;
    state.aiModePartSearch.lastApplyUndo = undo;
  }
}
