/**
 * v0.6.x — AI Orchestrator v1 YEREL KURAL sağlayıcısı (DISPATCHER).
 *
 * SAF/shared: ağ/dosya/IPC/AI-model YOK. taskType'a göre ilgili görev builder'ını çağırır; bilinmeyen
 * taskType için güvenli fallback üretir. Taslak metin üretimi görev dosyalarındadır (bu dosyada yok).
 */
import type { AiDraftProviderOutput, AiDraftTaskType } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { HELPER_NOTE } from './task-common';
import { buildCaseSummaryTask } from './case-summary-task';
import { buildMissingDocumentsTask } from './missing-documents-task';
import { buildReportTemplateCheckTask } from './report-template-check-task';
import { buildHeavyDamageExplanationTask } from './heavy-damage-explanation-task';
import { buildExpertNoteTask } from './expert-note-task';
import { buildClaimHandlerEmailTask } from './claim-handler-email-task';
import { buildServiceRequestTask } from './service-request-task';
import { buildFeeSummaryTask } from './fee-summary-task';
import { buildDeadlineRiskTask } from './deadline-risk-task';
import { buildValueLossTask } from './value-loss-task';

const BUILDERS: Record<AiDraftTaskType, (input: AiDraftTaskInput) => AiDraftProviderOutput> = {
  case_summary: buildCaseSummaryTask,
  missing_documents_message: buildMissingDocumentsTask,
  report_template_check: buildReportTemplateCheckTask,
  heavy_damage_explanation: buildHeavyDamageExplanationTask,
  expert_note_draft: buildExpertNoteTask,
  claim_handler_email_draft: buildClaimHandlerEmailTask,
  service_request_message: buildServiceRequestTask,
  fee_calculation_summary: buildFeeSummaryTask,
  deadline_risk_check: buildDeadlineRiskTask,
  value_loss_check: buildValueLossTask
};

export function runLocalRuleProvider(input: AiDraftTaskInput): AiDraftProviderOutput {
  const builder = BUILDERS[input.taskType];
  return builder ? builder(input) : fallback(input.taskType);
}

function fallback(taskType: AiDraftTaskType): AiDraftProviderOutput {
  return {
    taskType, title: 'Taslak', summary: 'Bu görev için taslak üretilemedi.',
    draftText: HELPER_NOTE, sections: [], evidence: [], mevzuatReferences: [],
    warnings: ['Görev tipi tanınmadı.'], missingInputs: ['Görev tipi'], confidence: 'low'
  };
}
