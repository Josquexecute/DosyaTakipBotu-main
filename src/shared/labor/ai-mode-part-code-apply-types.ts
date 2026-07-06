/**
 * v0.6.x — AI İşçilik v3.8: Seçili AI Mode adayını Excel D sütununa YAZMA tipleri (yalnız D sütunu; ağ YOK).
 * Yazma yalnız kullanıcının açık onayıyla ve satır/hücre doğrulamalarından sonra yapılır. H-N/diğer kolonlar korunur.
 */
import type { AiModeConfidence } from './ai-mode-part-search-types';

export interface ApplyAiModePartCodeArg {
  filePath: string;
  rowNumber: number;
  /** Parça kodu (D) sütun harfi — önizlemede tespit edilen partCodeColumn. */
  column: string;
  /** Parça adı (C) sütun harfi — satır uyumu doğrulaması için. */
  partNameColumn: string;
  candidatePartCode: string;
  /** Modalda gösterilen mevcut D kodu — Excel değişmişse yazma durdurulur. */
  expectedOldPartCode?: string;
  /** Modalda gösterilen parça adı — satır uyuşmuyorsa yazma durdurulur. */
  expectedPartName?: string;
  candidateId?: string;
  confidence?: AiModeConfidence;
}

/** v3.9: yazma sonrası ilgili satırın yeniden okunmasıyla oluşan doğrulama. */
export interface PostWriteVerification {
  rowNumber: number;
  partName?: string;
  currentPartCode?: string;
  matchesWrittenCode: boolean;
  message: string;
}

/** v3.9: son D kodu yazma işlemi için geri alma (undo) hazırlığı (gerçek restore SONRAKİ sürümde). */
export interface PartCodeApplyUndoInfo {
  available: boolean;
  filePath: string;
  backupPath?: string;
  rowNumber: number;
  column: string;
  oldPartCode?: string;
  newPartCode: string;
  note: string;
}

export interface ApplyAiModePartCodeResult {
  ok: boolean;
  filePath: string;
  rowNumber: number;
  column: string;
  partName: string;
  oldPartCode?: string;
  newPartCode: string;
  candidateId?: string;
  backupPath?: string;
  warnings: string[];
  message: string;
  verifiedAfterWrite?: PostWriteVerification;
  undoInfo?: PartCodeApplyUndoInfo;
}

/** v3.9: renderer session'ında tutulan son yazma undo durumu (buton YOK; yalnız bilgi). */
export interface LastPartCodeApplyUndoState {
  available: boolean;
  filePath: string;
  backupPath?: string;
  rowNumber: number;
  column: string;
  oldPartCode?: string;
  newPartCode: string;
  createdAt: string;
  note: string;
}
