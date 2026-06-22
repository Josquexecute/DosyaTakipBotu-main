import type { KnowledgeImportApprovalState, KnowledgeImportPlan } from './knowledge-import-types';
import { getKnowledgeImportApprovalState, type KnowledgeImportApprovalReducerState } from './knowledge-import-approval';
import { KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED } from './knowledge-import-write-lock';

/**
 * P4-E2-A/B: Import commit plani (saf on izleme).
 *
 * Onaylanan (approved_but_not_executed) ve .txt/.md uygun adaylarin commit edilecegini SAF olarak hesaplar.
 * lockOpen = kalici yazma kilidi durumu (KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED). willCommit yalnizca
 * (eligible && lockOpen) olur. Bu modul dosya/IPC/depo YAZMAZ; yalnizca plan uretir. Gercek yazma yalnizca
 * kullanici son onayi + IPC + commit service ile, ayri kullanici bilgi deposuna yapilir.
 */

const COMMIT_ELIGIBLE_EXTENSIONS = ['.txt', '.md'];
const COMMIT_TARGET_STORE = 'user-knowledge-store.json';

export interface KnowledgeImportCommitCandidate {
  candidateId: string;
  fileName: string;
  fileExtension: string;
  approvalState: KnowledgeImportApprovalState;
  approved: boolean;
  eligible: boolean;
  willCommit: boolean;
  status: string;
}

export interface KnowledgeImportCommitPlan {
  lockOpen: boolean;
  willWrite: boolean;
  targetStore: string;
  candidates: KnowledgeImportCommitCandidate[];
  totals: { total: number; approved: number; eligible: number; wouldCommit: number; willCommit: number; skipped: number };
  notes: string[];
}

export function buildKnowledgeImportCommitPlan(
  plan: KnowledgeImportPlan | null,
  approvalState: KnowledgeImportApprovalReducerState
): KnowledgeImportCommitPlan {
  const lockOpen = KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED;
  const candidates: KnowledgeImportCommitCandidate[] = (plan?.candidates ?? []).map((candidate) => {
    const decided = getKnowledgeImportApprovalState(approvalState, plan?.planId ?? '', candidate.candidateId);
    const approved = decided === 'approved_but_not_executed';
    const eligibleExtension = COMMIT_ELIGIBLE_EXTENSIONS.includes(candidate.fileExtension.toLowerCase());
    const notRejected = candidate.permission !== 'not_allowed';
    const eligible = approved && eligibleExtension && notRejected;
    const willCommit = eligible && lockOpen;
    const status = !approved
      ? 'Onaylanmadi'
      : !notRejected
        ? 'Reddedildi (izin yok)'
        : !eligibleExtension
          ? 'Yalniz .txt/.md commit edilebilir'
          : !lockOpen
            ? 'Uygun; ancak kalici yazma kilidi kapali (yazilmaz)'
            : 'Commit icin uygun (son onay gerekir)';
    return {
      candidateId: candidate.candidateId,
      fileName: candidate.fileName,
      fileExtension: candidate.fileExtension,
      approvalState: decided,
      approved,
      eligible,
      willCommit,
      status
    };
  });
  const approved = candidates.filter((candidate) => candidate.approved).length;
  const eligible = candidates.filter((candidate) => candidate.eligible).length;
  const willCommit = candidates.filter((candidate) => candidate.willCommit).length;
  return {
    lockOpen,
    willWrite: willCommit > 0,
    targetStore: COMMIT_TARGET_STORE,
    candidates,
    totals: { total: candidates.length, approved, eligible, wouldCommit: eligible, willCommit, skipped: candidates.length - eligible },
    notes: [
      'Commit plani saf on izlemedir; bu modul kendi basina YAZMAZ.',
      'Gercek yazma yalnizca kullanici son onayi + IPC + commit service ile, ayri kullanici bilgi deposuna yapilir.'
    ]
  };
}
