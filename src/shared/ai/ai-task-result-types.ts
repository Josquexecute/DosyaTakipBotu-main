/**
 * v0.6.x — AI Orchestrator v1 (yerel kural) görev/sonuç tipleri.
 *
 * SAF/shared: ağ/dosya/IPC YOK. Bu sürümde gerçek dış AI yok; sonuç yalnız ÖNİZLEME içindir
 * (writePolicy = 'preview_only', provider = 'local_rules'). Çıktı "taslak / kontrol amaçlı"dır.
 *
 * Not: Mevcut AI Queue alt sistemindeki `AiTaskType` (ai-task-types.ts) ile karışmaması için
 * burada `AiDraftTaskType` adı kullanılır.
 */

export type AiDraftTaskType =
  | 'case_summary'
  | 'missing_documents_message'
  | 'report_template_check'
  | 'heavy_damage_explanation'
  | 'expert_note_draft'
  | 'claim_handler_email_draft'
  | 'service_request_message'
  | 'fee_calculation_summary'
  | 'deadline_risk_check'
  | 'value_loss_check';

export type AiDraftConfidence = 'high' | 'medium' | 'low';
export type AiDraftEvidenceSource = 'case' | 'aiHelperContext' | 'mevzuat' | 'calculation' | 'user';

export interface AiDraftSection {
  title: string;
  content: string;
}

export interface AiDraftEvidence {
  label: string;
  value: string;
  source: AiDraftEvidenceSource;
}

export interface AiDraftMevzuatReference {
  sourceId: string;
  title: string;
  legalReference?: string;
  rule?: string;
}

export interface AiDraftTaskResult {
  taskId: string;
  taskType: AiDraftTaskType;
  title: string;
  summary: string;
  draftText: string;
  sections: AiDraftSection[];
  evidence: AiDraftEvidence[];
  mevzuatReferences: AiDraftMevzuatReference[];
  warnings: string[];
  missingInputs: string[];
  confidence: AiDraftConfidence;
  createdAt: string;
  provider: 'local_rules';
  writePolicy: 'preview_only';
}

/** Local provider'ın ürettiği çekirdek (orchestrator taskId/createdAt/provider/writePolicy ekler). */
export type AiDraftProviderOutput = Omit<AiDraftTaskResult, 'taskId' | 'createdAt' | 'provider' | 'writePolicy'>;
