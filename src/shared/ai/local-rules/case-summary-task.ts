/** v0.6.x — AI yerel kural görevi: Dosya özeti (kısa, düzenli ofis notu). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { withUser, sigortaLabel, formatTL, triLabel } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { confidenceFromMissing } from './task-confidence';
import { collectMissing, kontrolWarning } from './task-control-warnings';
import { kvLines } from './task-draft-templates';
import { nextControlSuggestion } from './task-output-quality';

export function buildCaseSummaryTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const missing = collectMissing(ctx, ['hasarTutari', 'dosyaTuru', 'agirHasar']);
  const kimlik = kvLines([['Plaka', ctx.plate || '-'], ['Dosya No', ctx.officeFileNo || '-'], ['İhbar No', ctx.noticeFileNo || '-'], ['Dosya türü', sigortaLabel(ctx)], ['Durum', ctx.status || '-']]);
  const hasar = kvLines([
    ['Hasar tutarı', ctx.grossDamageAmount !== null ? formatTL(ctx.grossDamageAmount) : 'Belirsiz'],
    ['Rayiç', ctx.marketValue !== null ? formatTL(ctx.marketValue) : 'Belirsiz'],
    ['Ağır/tam hasar', triLabel(ctx.isHeavyDamage)],
    ['Değer kaybı', triLabel(ctx.hasValueLoss)]
  ]);
  const draft = withUser([
    'Dosya özeti:',
    kimlik,
    hasar,
    ctx.missingDocuments.length ? `Eksik evrak: ${ctx.missingDocuments.join(', ')}.` : 'Eksik kritik evrak görünmemektedir.',
    nextControlSuggestion(missing)
  ], input);
  return {
    taskType: 'case_summary', title: 'Dosya Özeti',
    summary: `${ctx.plate || 'Dosya'} • ${sigortaLabel(ctx)} • ${ctx.status || 'durum belirsiz'}`,
    draftText: draft, sections: [sec('Özet', draft)],
    evidence: [
      ev('Plaka', ctx.plate || '-', 'case'),
      ev('Dosya No', ctx.officeFileNo || '-', 'case'),
      ev('Dosya türü', sigortaLabel(ctx), ctx.provenance.sigortaTuru && ctx.provenance.sigortaTuru !== 'auto' ? 'aiHelperContext' : 'case'),
      ev('Hasar tutarı', ctx.grossDamageAmount !== null ? formatTL(ctx.grossDamageAmount) : 'Belirsiz', 'case'),
      ev('Rayiç', ctx.marketValue !== null ? formatTL(ctx.marketValue) : 'Belirsiz', 'case'),
      ev('Ağır/tam hasar', triLabel(ctx.isHeavyDamage), 'case'),
      ev('Değer kaybı', triLabel(ctx.hasValueLoss), ctx.provenance.hasValueLoss ? 'aiHelperContext' : 'case'),
      ev('Eksik evrak', ctx.missingDocuments.length ? ctx.missingDocuments.join(', ') : 'Yok', 'case')
    ],
    mevzuatReferences: [],
    warnings: ['Bu özet otomatik üretilmiştir; dosya verisiyle teyit edilmelidir.', ...kontrolWarning(missing)],
    missingInputs: missing, confidence: confidenceFromMissing(missing)
  };
}
