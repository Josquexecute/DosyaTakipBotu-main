/**
 * v0.6.x — AI Orchestrator v1 girdi tipi + görev meta verisi (Türkçe etiketler).
 * SAF/shared: ağ/dosya/IPC YOK.
 */
import type { AiDraftTaskType } from './ai-task-result-types';
import type { AiCaseContext } from '../ai-context/ai-case-context';
import type { MevzuatKnowledgeItem } from '../mevzuat/mevzuat-types';
import type { AiPrivacyMode } from './ai-runtime-config-types';

export interface AiDraftTaskInput {
  taskType: AiDraftTaskType;
  caseContext: AiCaseContext;
  mevzuatItems: readonly MevzuatKnowledgeItem[];
  userInstruction?: string;
  privacyMode?: AiPrivacyMode;
  /** Bu sürümde yalnız 'local_rules'. */
  mode: 'local_rules';
}

/** UI dropdown için görev tipi → Türkçe etiket + kısa açıklama. */
export const AI_DRAFT_TASKS: ReadonlyArray<{ type: AiDraftTaskType; label: string; desc: string }> = [
  { type: 'case_summary', label: 'Dosya özeti', desc: 'Seçili dosyanın kısa özeti' },
  { type: 'missing_documents_message', label: 'Eksik evrak mesajı', desc: 'Eksik evrak talep taslağı' },
  { type: 'report_template_check', label: 'Rapor şablonu kontrolü', desc: 'Ek-1.1 / Ek-1.2 / Ek-2 gerekçesi' },
  { type: 'heavy_damage_explanation', label: 'Ağır hasar / tam hasar açıklaması', desc: 'Oran/rayiç taslak açıklaması' },
  { type: 'expert_note_draft', label: 'Eksper iç not taslağı', desc: 'Kısa takip notu' },
  { type: 'claim_handler_email_draft', label: 'Dosya sorumlusuna mail taslağı', desc: 'Kurumsal mail taslağı' },
  { type: 'service_request_message', label: 'Servis talep mesajı', desc: 'Servise kısa teknik mesaj' },
  { type: 'fee_calculation_summary', label: 'Ekspertiz ücreti hesap özeti', desc: 'EK-1 ücret özeti' },
  { type: 'deadline_risk_check', label: 'EKSİST / süre risk kontrolü', desc: 'Süre kuralları kontrolü' },
  { type: 'value_loss_check', label: 'Değer kaybı kontrolü', desc: 'Değer kaybı kontrol listesi' }
];

export function aiDraftTaskLabel(type: AiDraftTaskType): string {
  return AI_DRAFT_TASKS.find((t) => t.type === type)?.label ?? type;
}
