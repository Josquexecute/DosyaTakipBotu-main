/**
 * v0.6.x — AI taslak TONLARI. SAF; ağ/dosya/IPC YOK.
 * Her görev tipine uygun varsayılan ton + hitap/kapanış metni sağlar (ofis kullanımına uygun Türkçe).
 */
import type { AiDraftTaskType } from '../ai-task-result-types';

export type AiDraftTone =
  | 'kisa_ofis_notu'
  | 'kurumsal_mail'
  | 'teknik_eksper_aciklamasi'
  | 'servis_talep_dili'
  | 'dosya_sorumlusu_dili';

/** Görev tipi → varsayılan ton. */
export const TASK_DEFAULT_TONE: Record<AiDraftTaskType, AiDraftTone> = {
  case_summary: 'kisa_ofis_notu',
  missing_documents_message: 'kurumsal_mail',
  report_template_check: 'teknik_eksper_aciklamasi',
  heavy_damage_explanation: 'teknik_eksper_aciklamasi',
  expert_note_draft: 'kisa_ofis_notu',
  claim_handler_email_draft: 'dosya_sorumlusu_dili',
  service_request_message: 'servis_talep_dili',
  fee_calculation_summary: 'teknik_eksper_aciklamasi',
  deadline_risk_check: 'teknik_eksper_aciklamasi',
  value_loss_check: 'teknik_eksper_aciklamasi'
};

/** Tona göre hitap (boş olabilir; not/teknik açıklama tonlarında hitap yok). */
export function toneOpening(tone: AiDraftTone): string {
  switch (tone) {
    case 'kurumsal_mail': return 'Merhaba,';
    case 'servis_talep_dili': return 'Merhaba,';
    case 'dosya_sorumlusu_dili': return 'Sayın İlgili,';
    default: return '';
  }
}

/** Tona göre kapanış (boş olabilir). */
export function toneClosing(tone: AiDraftTone): string {
  switch (tone) {
    case 'kurumsal_mail': return 'Bilginize sunarız.';
    case 'servis_talep_dili': return 'İlginiz için teşekkür ederiz.';
    case 'dosya_sorumlusu_dili': return 'Saygılarımızla.';
    default: return '';
  }
}
