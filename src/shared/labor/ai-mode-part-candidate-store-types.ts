/**
 * v0.6.x — AI İşçilik v3.6: Kullanıcı onaylı AI Mode parça kodu aday store tipleri (SAF; ağ/scraping YOK).
 * Adaylar YALNIZ kullanıcı onayıyla yerel saklanır; Excel'e/D sütununa hiçbir zaman otomatik yazılmaz.
 */
import type { AiModeConfidence, AiModePartKind } from './ai-mode-part-search-types';
import type { PartCodeComparison } from './ai-mode-part-code-comparator';

export interface ApprovedAiModePartCandidateEntry {
  id: string;
  source: 'google_ai_mode_manual';
  approvedByUser: true;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;

  vehicleModel?: string;
  modelYear?: number;
  chassisPrefix?: string;
  engineCode?: string;
  plate?: string;

  rowNumber?: number;
  partGroup?: string;
  partName: string;
  existingPartCode?: string;
  candidatePartCode: string;
  partKind: AiModePartKind;

  compatibility?: string;
  confidence: AiModeConfidence;
  sources: string[];
  warnings: string[];
  rawEvidence: string;

  comparisonWithExistingCode?: PartCodeComparison;
}

export interface AiModePartCandidateStoreFile {
  version: 1;
  entries: ApprovedAiModePartCandidateEntry[];
  updatedAt: string;
}

export interface AiModePartCandidateStoreState {
  entries: ApprovedAiModePartCandidateEntry[];
  /** Depo bozuk olduğu için yok sayıldı mı. */
  corrupt: boolean;
  activeCount: number;
  passiveCount: number;
}

export interface AiModePartCandidateApproveResult extends AiModePartCandidateStoreState {
  added: number;
  skippedDuplicates: number;
}

/** Önizleme satırında gösterilen onaylı aday evidence (yalnız öneri; Excel'e yazmaz). */
export interface AiModeCandidateRowEvidence {
  candidatePartCode: string;
  partKind: AiModePartKind;
  confidence: AiModeConfidence;
  status: PartCodeComparison['status'];
  message: string;
  sourceCount: number;
}
