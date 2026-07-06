/** v0.6.x — AI yerel kural görevi: Rapor şablonu kontrolü (Genelge 2026/11). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { deriveTemplateInput } from '../../ai-context/ai-case-context';
import { selectReportTemplate } from '../../mevzuat/report-template-rules';
import { withUser, sigortaLabel, triLabel } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { confidenceFromMissing } from './task-confidence';
import { pickMevzuatRefs } from './task-mevzuat-references';
import { collectMissing } from './task-control-warnings';
import { bulletList } from './task-draft-templates';

export function buildReportTemplateCheckTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const tpl = deriveTemplateInput(ctx);
  const result = tpl.sigortaTuru
    ? selectReportTemplate({ sigortaTuru: tpl.sigortaTuru, degerKaybiDahil: tpl.degerKaybiDahil, agirVeyaTamHasar: tpl.agirVeyaTamHasar })
    : { template: null as 'Ek-1.1' | 'Ek-1.2' | 'Ek-2' | null, reason: 'Dosya türü belirsiz; şablon belirlenemedi.', legalReference: 'Genelge 2026/11 m.4', caution: 'Dosya türü netleştirilmeli; manuel kontrol gerekli.' };
  const missing = collectMissing(ctx, ['dosyaTuru']);
  const refs = pickMevzuatRefs(input.mevzuatItems, ['rapor şablonları', result.template ?? 'şablon', ctx.sigortaTuru === 'kasko' ? 'kasko' : 'trafik']);
  const etki = ctx.sigortaTuru === 'kasko'
    ? 'Kasko etkisi: Ek-2 Kara Araçları Kasko şablonu; muafiyet ve kıymet kazanma tenzili kalemleri kontrol edilmelidir.'
    : ctx.isHeavyDamage === true || ctx.isTotalLoss === true
      ? 'Ağır/tam hasar etkisi: değer kaybı hariç (Ek-1.2) yönünde değerlendirilir.'
      : 'Değer kaybı etkisi: trafik/ihtiyari araç hasarında değer kaybı dahil (Ek-1.1) değerlendirilir.';
  const draft = withUser([
    result.template ? `Önerilen rapor şablonu: ${result.template}.` : 'Rapor şablonu belirlenemedi; dosya türü netleştirilmelidir.',
    `Gerekçe: ${result.reason}`,
    etki,
    `Mevzuat: ${result.legalReference}`,
    `Kontrol edilmesi gereken alanlar:\n${bulletList([
      ctx.sigortaTuru === null ? 'Dosya türü netleştirilmeli' : '',
      'Değer kaybı durumu (var/yok)',
      'Ağır/tam hasar durumu'
    ])}`
  ], input);
  return {
    taskType: 'report_template_check', title: 'Rapor Şablonu Kontrolü',
    summary: result.template ? `Önerilen: ${result.template}` : 'Şablon belirsiz',
    draftText: draft, sections: [sec('Öneri', draft)],
    evidence: [
      ev('Dosya türü', sigortaLabel(ctx), ctx.provenance.sigortaTuru ? 'aiHelperContext' : 'case'),
      ev('Önerilen şablon', result.template ?? 'Belirsiz', 'calculation'),
      ev('Değer kaybı', triLabel(ctx.hasValueLoss), ctx.provenance.hasValueLoss ? 'aiHelperContext' : 'case'),
      ev('Ağır/tam hasar', triLabel(ctx.isHeavyDamage), 'case')
    ],
    mevzuatReferences: refs, warnings: [result.caution], missingInputs: missing, confidence: confidenceFromMissing(missing)
  };
}
