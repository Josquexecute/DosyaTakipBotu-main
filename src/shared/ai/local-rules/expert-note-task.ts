/** v0.6.x — AI yerel kural görevi: Eksper iç not taslağı (kısa ofis notu). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { withUser } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { collectMissing } from './task-control-warnings';

export function buildExpertNoteTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const missing = collectMissing(ctx, ['hasarTutari', 'agirHasar']);
  const kontrol = [
    ...missing,
    ...(ctx.missingDocuments.length ? [`eksik evrak (${ctx.missingDocuments.join(', ')})`] : [])
  ];
  const draft = withUser([
    'Dosya kontrol edildi.',
    ctx.isHeavyDamage === true ? 'Ağır hasar yönünden değerlendirme gerekmektedir.' : 'Ağır hasar durumu kontrol edilmelidir.',
    kontrol.length ? `Eksik/kontrol edilecek alanlar: ${kontrol.join(', ')}.` : 'Eksik/kontrol edilecek alan görünmemektedir; rapor süreci ilerletilebilir.'
  ], input);
  return {
    taskType: 'expert_note_draft', title: 'Eksper İç Not Taslağı',
    summary: 'Kısa takip notu', draftText: draft, sections: [sec('Not', draft)],
    evidence: [ev('Durum', ctx.status || '-', 'case'), ev('Eksik evrak', ctx.missingDocuments.length ? ctx.missingDocuments.join(', ') : 'Yok', 'case')],
    mevzuatReferences: [], warnings: ['Ofis içi yardımcı not; nihai değerlendirme eksper sorumluluğundadır.'],
    missingInputs: missing, confidence: 'medium'
  };
}
