import type {
  KnowledgeImportApprovalDecision,
  KnowledgeImportApprovalDecisionType,
  KnowledgeImportApprovalState
} from './knowledge-import-types';

/**
 * P3-E: Bellek-ici (in-memory) import onay karari indirgeyicisi (reducer).
 *
 * Saf ve immutable. Hicbir kosulda gercek import calistirmaz; diske, AppData veya tarayici
 * deposuna yazmaz; IPC kullanmaz; ayristirici, gorsel-metin veya harici servis cagirmaz.
 * "approved_but_not_executed" dahil tum kararlar yalnizca bellekte tutulan NIYET kayitlaridir;
 * uygulama (execution) bu surumde YOKTUR. canExecuteImport her zaman false uretilir.
 */

/** Bu reducer hicbir kosulda import calistirmaz. Type seviyesinde sabit false. */
export const KNOWLEDGE_IMPORT_APPROVAL_CAN_EXECUTE = false as const;

export interface KnowledgeImportApprovalEntry {
  planId: string;
  candidateId: string;
  state: KnowledgeImportApprovalState;
  decision: KnowledgeImportApprovalDecisionType;
  decidedAt: string;
  note?: string;
}

export interface KnowledgeImportApprovalReducerState {
  /** plan+candidate -> son karar. Yalnizca bellekte tutulur; kalici degildir. */
  entries: KnowledgeImportApprovalEntry[];
  /** Bu reducer hicbir kosulda import calistirmaz. */
  canExecuteImport: false;
}

export interface KnowledgeImportApprovalSummary {
  total: number;
  approvedButNotExecuted: number;
  rejected: number;
  userReviewRequired: number;
  /** Onaylanmis olsa bile bu surumde import calistirilmadi. */
  executed: 0;
  canExecuteImport: false;
}

export function createKnowledgeImportApprovalState(): KnowledgeImportApprovalReducerState {
  return { entries: [], canExecuteImport: KNOWLEDGE_IMPORT_APPROVAL_CAN_EXECUTE };
}

export function approvalStateForDecision(decision: KnowledgeImportApprovalDecisionType): KnowledgeImportApprovalState {
  switch (decision) {
    case 'approve_for_future_import': return 'approved_but_not_executed';
    case 'reject': return 'rejected';
    case 'needs_manual_review': return 'user_review_required';
  }
}

function approvalKey(planId: string, candidateId: string): string {
  return `${planId}::${candidateId}`;
}

/**
 * Karari uygular ve YENI state doner (immutable; girdi state degistirilmez).
 * Hicbir yan etki olusturmaz ve hicbir kosulda import calistirmaz.
 */
export function applyKnowledgeImportApprovalDecision(
  state: KnowledgeImportApprovalReducerState,
  decision: KnowledgeImportApprovalDecision
): KnowledgeImportApprovalReducerState {
  const planId = String(decision?.planId ?? '').trim();
  const candidateId = String(decision?.candidateId ?? '').trim();
  if (!planId || !candidateId) return state;

  const entry: KnowledgeImportApprovalEntry = {
    planId,
    candidateId,
    state: approvalStateForDecision(decision.decision),
    decision: decision.decision,
    decidedAt: decision.decidedAt || new Date().toISOString(),
    ...(decision.note ? { note: String(decision.note).slice(0, 500) } : {})
  };

  const key = approvalKey(planId, candidateId);
  const withoutPrevious = state.entries.filter((existing) => approvalKey(existing.planId, existing.candidateId) !== key);
  return { entries: [...withoutPrevious, entry], canExecuteImport: KNOWLEDGE_IMPORT_APPROVAL_CAN_EXECUTE };
}

export function getKnowledgeImportApprovalState(
  state: KnowledgeImportApprovalReducerState,
  planId: string,
  candidateId: string
): KnowledgeImportApprovalState {
  const key = approvalKey(planId, candidateId);
  return state.entries.find((entry) => approvalKey(entry.planId, entry.candidateId) === key)?.state ?? 'not_requested';
}

export function summarizeKnowledgeImportApprovals(state: KnowledgeImportApprovalReducerState): KnowledgeImportApprovalSummary {
  return {
    total: state.entries.length,
    approvedButNotExecuted: state.entries.filter((entry) => entry.state === 'approved_but_not_executed').length,
    rejected: state.entries.filter((entry) => entry.state === 'rejected').length,
    userReviewRequired: state.entries.filter((entry) => entry.state === 'user_review_required').length,
    executed: 0,
    canExecuteImport: KNOWLEDGE_IMPORT_APPROVAL_CAN_EXECUTE
  };
}
