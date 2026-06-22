import type { KnownKnowledgeTag } from './knowledge-tags';
import type { KnowledgeSourceType } from './knowledge-types';

export type KnowledgeImportPermissionLevel =
  | 'not_allowed'
  | 'dry_run_only'
  | 'requires_user_approval'
  | 'approved_for_future_import';

export type KnowledgeImportSourceKind =
  | 'heavy_damage_guide'
  | 'fault_scenario_guide'
  | 'fault_ratio_image'
  | 'expert_note'
  | 'insurance_company_note'
  | 'settlement_template'
  | 'policy_note'
  | 'vehicle_info_guide'
  | 'claim_tracking_sheet'
  | 'unknown';

export type KnowledgeImportApprovalState =
  | 'not_requested'
  | 'preview_only'
  | 'user_review_required'
  | 'approved_but_not_executed'
  | 'rejected';

export type KnowledgeImportApprovalDecisionType =
  | 'approve_for_future_import'
  | 'reject'
  | 'needs_manual_review';

export interface KnowledgeImportApprovalDecision {
  planId: string;
  candidateId: string;
  decision: KnowledgeImportApprovalDecisionType;
  decidedAt: string;
  note?: string;
}

export interface KnowledgeImportFileInput {
  fileName: string;
  filePath?: string;
  sizeBytes?: number;
}

export interface KnowledgeImportCandidate {
  candidateId: string;
  fileName: string;
  fileExtension: string;
  filePath?: string;
  sizeBytes?: number;
  detectedSourceKind: KnowledgeImportSourceKind;
  detectedSourceType?: KnowledgeSourceType;
  detectedTags: KnownKnowledgeTag[];
  detectedTitle?: string;
  permission: KnowledgeImportPermissionLevel;
  requiresUserApproval: boolean;
  canWrite: false;
  warnings: string[];
  reasons: string[];
}

export interface KnowledgeImportPlanTotals {
  totalCandidates: number;
  allowedForDryRun: number;
  requiresApproval: number;
  notAllowed: number;
}

export interface KnowledgeImportPlan {
  planId: string;
  createdAt: string;
  mode: 'dry_run';
  candidates: KnowledgeImportCandidate[];
  totals: KnowledgeImportPlanTotals;
  warnings: string[];
  canWrite: false;
  notPerformedActions: string[];
}

export interface KnowledgeImportDryRunRequest {
  files: KnowledgeImportFileInput[];
  preferredSourceKind?: KnowledgeImportSourceKind;
  preferredTags?: string[];
  mode: 'dry_run';
}

export interface KnowledgeImportDryRunResponse {
  plan: KnowledgeImportPlan;
  warnings: string[];
}

/** v0.6.0 P4-C: yalniz .txt/.md duz-metin icerik onizlemesi (yazmasiz). canWrite her zaman false. */
export interface KnowledgeImportTextPreview {
  fileName: string;
  fileExtension: string;
  sizeBytes: number;
  text: string;
  truncated: boolean;
  canWrite: false;
}

/** v0.6.0 P4-E2-B: TEK onaylanmis .txt/.md icerik onizlemesini commit etmek icin guvenli girdi. filePath ICERMEZ. */
export interface KnowledgeImportCommitInput {
  candidateId?: string;
  fileName: string;
  fileExtension: string;
  content: string;
  title?: string;
  tags?: string[];
  sourceType?: string;
  approvalState?: KnowledgeImportApprovalState;
}

export interface KnowledgeImportCommitResult {
  ok: boolean;
  committed: number;
  skippedDuplicate: number;
  rejected: number;
  storeRevision?: number;
  writeId?: string;
  message: string;
  entryIds: string[];
}
