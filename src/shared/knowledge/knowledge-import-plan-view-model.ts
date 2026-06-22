import type {
  KnowledgeImportApprovalState,
  KnowledgeImportCandidate,
  KnowledgeImportPermissionLevel,
  KnowledgeImportPlan
} from './knowledge-import-types';
import { getKnowledgeImportApprovalState, type KnowledgeImportApprovalReducerState } from './knowledge-import-approval';

export interface KnowledgeImportPlanMetricView {
  label: string;
  value: number | string;
  tone: 'neutral' | 'ok' | 'warning' | 'danger';
}

export interface KnowledgeImportCandidateView {
  candidateId: string;
  fileName: string;
  fileExtension: string;
  detectedSourceType: string;
  detectedSourceKind: string;
  detectedTags: string[];
  detectedTitle: string;
  permission: KnowledgeImportPermissionLevel;
  permissionLabel: string;
  permissionTone: 'ok' | 'warning' | 'danger' | 'info';
  approvalState: KnowledgeImportApprovalState;
  approvalLabel: string;
  /** true: durum bellek-ici karardan turetildi; false: izin seviyesinden gelen varsayilan. */
  approvalDecided: boolean;
  warnings: string[];
  reasons: string[];
  canWrite: false;
}

export interface KnowledgeImportPlanViewModel {
  planId: string;
  createdAt: string;
  modeLabel: string;
  canWriteLabel: string;
  canWrite: false;
  metrics: KnowledgeImportPlanMetricView[];
  warnings: string[];
  safetyNotes: string[];
  candidates: KnowledgeImportCandidateView[];
}

export const KNOWLEDGE_IMPORT_PLAN_SAFETY_NOTES = [
  'Bu ekran sadece import planini gosterir.',
  'Bu asamada dosya icerigi okunmaz.',
  'Bu asamada bilgi bankasina kalici kaynak eklenmez.',
  'takip.json, Excel veya AppData yazilmaz.',
  'Onay akisi hazirlik durumundadir; bu surumde import calistirilmaz.',
  'Plan canWrite=false olarak uretilir.'
] as const;

export function buildKnowledgeImportPlanViewModel(plan: KnowledgeImportPlan, approvalState?: KnowledgeImportApprovalReducerState): KnowledgeImportPlanViewModel {
  return {
    planId: plan.planId,
    createdAt: plan.createdAt,
    modeLabel: plan.mode === 'dry_run' ? 'dry_run' : String(plan.mode),
    canWrite: false,
    canWriteLabel: plan.canWrite === false ? 'Yazma kapali' : 'Yazma kapali olmalidir',
    metrics: [
      { label: 'Toplam aday', value: plan.totals.totalCandidates, tone: 'neutral' },
      { label: 'Dry-run adayi', value: plan.totals.allowedForDryRun, tone: 'ok' },
      { label: 'Onay gerektirir', value: plan.totals.requiresApproval, tone: 'warning' },
      { label: 'Reddedildi', value: plan.totals.notAllowed, tone: 'danger' },
      { label: 'Mod', value: plan.mode, tone: 'neutral' },
      { label: 'Kalici yazma', value: 'Kapali', tone: 'danger' }
    ],
    warnings: [...plan.warnings],
    safetyNotes: [...KNOWLEDGE_IMPORT_PLAN_SAFETY_NOTES],
    candidates: plan.candidates.map((candidate) => buildCandidateView(candidate, approvalState, plan.planId))
  };
}

export function buildCandidateView(candidate: KnowledgeImportCandidate, approvalState?: KnowledgeImportApprovalReducerState, planId = ''): KnowledgeImportCandidateView {
  const permissionDefaultState = approvalStateForPermission(candidate.permission);
  const decidedState = approvalState ? getKnowledgeImportApprovalState(approvalState, planId, candidate.candidateId) : 'not_requested';
  const approvalDecided = decidedState !== 'not_requested';
  const finalApprovalState = approvalDecided ? decidedState : permissionDefaultState;
  return {
    candidateId: candidate.candidateId,
    fileName: candidate.fileName,
    fileExtension: candidate.fileExtension || '-',
    detectedSourceType: candidate.detectedSourceType ?? '-',
    detectedSourceKind: candidate.detectedSourceKind,
    detectedTags: [...candidate.detectedTags],
    detectedTitle: candidate.detectedTitle ?? '-',
    permission: candidate.permission,
    permissionLabel: permissionLabel(candidate.permission),
    permissionTone: permissionTone(candidate.permission),
    approvalState: finalApprovalState,
    approvalLabel: approvalLabel(finalApprovalState),
    approvalDecided,
    warnings: [...candidate.warnings],
    reasons: [...candidate.reasons],
    canWrite: false
  };
}

export function permissionLabel(permission: KnowledgeImportPermissionLevel): string {
  switch (permission) {
    case 'not_allowed': return 'Reddedildi';
    case 'dry_run_only': return 'Sadece plan';
    case 'requires_user_approval': return 'Kullanici onayi gerekir';
    case 'approved_for_future_import': return 'Gelecek import icin uygun';
  }
}

export function approvalStateForPermission(permission: KnowledgeImportPermissionLevel): KnowledgeImportApprovalState {
  switch (permission) {
    case 'not_allowed': return 'rejected';
    case 'dry_run_only': return 'preview_only';
    case 'requires_user_approval': return 'user_review_required';
    case 'approved_for_future_import': return 'approved_but_not_executed';
  }
}

export function approvalLabel(state: KnowledgeImportApprovalState): string {
  switch (state) {
    case 'not_requested': return 'Onay istenmedi';
    case 'preview_only': return 'Sadece on izleme';
    case 'user_review_required': return 'Kullanici incelemesi gerekir';
    case 'approved_but_not_executed': return 'Onaylandi ama calistirilmadi';
    case 'rejected': return 'Reddedildi';
  }
}

function permissionTone(permission: KnowledgeImportPermissionLevel): KnowledgeImportCandidateView['permissionTone'] {
  switch (permission) {
    case 'not_allowed': return 'danger';
    case 'dry_run_only': return 'info';
    case 'requires_user_approval': return 'warning';
    case 'approved_for_future_import': return 'ok';
  }
}
