import { KNOWLEDGE_IMPORT_CAN_WRITE, KNOWLEDGE_IMPORT_DRY_RUN_MODE, KNOWLEDGE_IMPORT_NOT_PERFORMED_ACTIONS } from './knowledge-import-safety';
import type { KnowledgeImportCandidate, KnowledgeImportPlan } from './knowledge-import-types';
import { applyKnowledgeImportApprovalDecision, createKnowledgeImportApprovalState, type KnowledgeImportApprovalReducerState } from './knowledge-import-approval';

/**
 * P3-D: Statik (deterministik) ORNEK dry-run import plani.
 *
 * Bu yalnizca pasif goruntuleme/illustrasyon icindir. Gercek dosya taramasi, dosya icerigi okuma,
 * parser, IPC, kalici yazma veya harici/ucretli servis YOKTUR. Plan her zaman canWrite=false uretir.
 * Veri tamamen sabittir; her cagride ayni sonucu doner ve hicbir yan etki olusturmaz.
 */
const SAMPLE_CREATED_AT = '2026-06-21T00:00:00.000Z';
const SAMPLE_PLAN_ID = 'ornek-dry-run-plan-static';

export function buildSampleKnowledgeImportPlan(): KnowledgeImportPlan {
  const candidates: KnowledgeImportCandidate[] = [
    {
      candidateId: 'ornek-aday-1-agir-hasar',
      fileName: 'Agir Hasar Kritik Parca Rehberi.pdf',
      fileExtension: '.pdf',
      detectedSourceKind: 'heavy_damage_guide',
      detectedSourceType: 'heavy_damage_rule',
      detectedTags: ['agir_hasar', 'kritik_parca', 'pert'],
      detectedTitle: 'Agir Hasar Kritik Parca Rehberi',
      permission: 'requires_user_approval',
      requiresUserApproval: true,
      canWrite: false,
      warnings: [],
      reasons: ['Kaynak tipi tahmin edildi; gercek import ileride kullanici incelemesi gerektirir.']
    },
    {
      candidateId: 'ornek-aday-2-gelecek-uygun',
      fileName: 'gelecek import uygun kaynak.md',
      fileExtension: '.md',
      detectedSourceKind: 'expert_note',
      detectedSourceType: 'office_note',
      detectedTags: ['eksper_notu', 'iscilik'],
      detectedTitle: 'gelecek import uygun kaynak',
      permission: 'approved_for_future_import',
      requiresUserApproval: true,
      canWrite: false,
      warnings: [],
      reasons: ['Gelecekteki import icin uygun olarak isaretlendi; bu surumde calistirilmaz.']
    },
    {
      candidateId: 'ornek-aday-3-belirsiz',
      fileName: 'belirsiz kaynak.pdf',
      fileExtension: '.pdf',
      detectedSourceKind: 'unknown',
      detectedTags: [],
      detectedTitle: 'belirsiz kaynak',
      permission: 'dry_run_only',
      requiresUserApproval: false,
      canWrite: false,
      warnings: ['Kaynak tipi kesinlesmedigi icin gercek import oncesi manuel eslestirme gerekir.'],
      reasons: ['Kaynak tipi kesin olarak taninamadi; yalnizca plan asamasinda kalir.']
    },
    {
      candidateId: 'ornek-aday-4-yasakli',
      fileName: 'tehlikeli.exe',
      fileExtension: '.exe',
      detectedSourceKind: 'unknown',
      detectedTags: [],
      detectedTitle: 'tehlikeli',
      permission: 'not_allowed',
      requiresUserApproval: false,
      canWrite: false,
      warnings: ['Bu uzanti guvenlik politikasinda kabul edilmez.'],
      reasons: ['.exe uzantisi guvenlik politikasinda yasakli; plana alinmaz.']
    }
  ];

  return {
    planId: SAMPLE_PLAN_ID,
    createdAt: SAMPLE_CREATED_AT,
    mode: KNOWLEDGE_IMPORT_DRY_RUN_MODE,
    candidates,
    totals: {
      totalCandidates: candidates.length,
      allowedForDryRun: candidates.filter((candidate) => candidate.permission !== 'not_allowed').length,
      requiresApproval: candidates.filter((candidate) => candidate.permission === 'requires_user_approval').length,
      notAllowed: candidates.filter((candidate) => candidate.permission === 'not_allowed').length
    },
    warnings: ['Bu, statik bir ornek dry-run plandir; gercek dosya taramasi yapilmadi.'],
    canWrite: KNOWLEDGE_IMPORT_CAN_WRITE,
    notPerformedActions: [...KNOWLEDGE_IMPORT_NOT_PERFORMED_ACTIONS]
  };
}

/**
 * P3-F: Statik ORNEK onay durumu (bellek-ici). Ornek plana birkac karar uygulanmis reducer state'i doner.
 * Yalnizca pasif goruntuleme icindir; import calistirmaz, kalici yazma yapmaz, IPC kullanmaz.
 */
export function buildSampleKnowledgeImportApprovalState(): KnowledgeImportApprovalReducerState {
  let state = createKnowledgeImportApprovalState();
  state = applyKnowledgeImportApprovalDecision(state, { planId: SAMPLE_PLAN_ID, candidateId: 'ornek-aday-1-agir-hasar', decision: 'approve_for_future_import', decidedAt: SAMPLE_CREATED_AT });
  state = applyKnowledgeImportApprovalDecision(state, { planId: SAMPLE_PLAN_ID, candidateId: 'ornek-aday-3-belirsiz', decision: 'needs_manual_review', decidedAt: SAMPLE_CREATED_AT });
  state = applyKnowledgeImportApprovalDecision(state, { planId: SAMPLE_PLAN_ID, candidateId: 'ornek-aday-4-yasakli', decision: 'reject', decidedAt: SAMPLE_CREATED_AT });
  return state;
}
