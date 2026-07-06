/** v0.6.x — AI yerel kural görevi: Dosya sorumlusuna mail taslağı. SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { withUser } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { toneOpening, toneClosing } from './task-tone';

export function buildClaimHandlerEmailTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const konu = ctx.isHeavyDamage === true ? 'ağır hasar değerlendirmesi' : ctx.missingDocuments.length ? 'eksik evrak talebi' : 'dosya durumu bilgilendirmesi';
  const draft = withUser([
    `Konu: ${konu} (${ctx.plate || '-'}${ctx.officeFileNo ? ` / ${ctx.officeFileNo}` : ''})`,
    toneOpening('dosya_sorumlusu_dili'),
    `${ctx.plate || '-'} plakalı ${ctx.officeFileNo ? `(${ctx.officeFileNo}) ` : ''}dosya ile ilgili ${konu} hususunda bilgilerinize sunarız.`,
    ctx.missingDocuments.length ? `Tamamlanması gereken evraklar: ${ctx.missingDocuments.join(', ')}.` : '',
    'İlgili hususların değerlendirilmesini ve gerekli geri dönüşün yapılmasını rica ederiz.',
    toneClosing('dosya_sorumlusu_dili')
  ], input);
  return {
    taskType: 'claim_handler_email_draft', title: 'Dosya Sorumlusuna Mail Taslağı',
    summary: `Konu: ${konu}`, draftText: draft, sections: [sec('Mail', draft)],
    evidence: [ev('Plaka', ctx.plate || '-', 'case'), ev('Dosya No', ctx.officeFileNo || '-', 'case'), ev('Konu', konu, 'calculation')],
    mevzuatReferences: [], warnings: ['Kesin olmayan alanlar "değerlendirme/kontrol" olarak ifade edilmiştir.'],
    missingInputs: [], confidence: 'medium'
  };
}
