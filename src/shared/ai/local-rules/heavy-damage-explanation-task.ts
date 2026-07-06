/** v0.6.x — AI yerel kural görevi: Ağır/tam hasar açıklaması (rapor + mail taslağı). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { withUser, formatTL, triLabel, joinDraft } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { confidenceFromMissing } from './task-confidence';
import { pickMevzuatRefs } from './task-mevzuat-references';
import { collectMissing } from './task-control-warnings';
import { kvLines, mailDraft } from './task-draft-templates';
import { computeRatio, ratioLabel } from './task-output-quality';

export function buildHeavyDamageExplanationTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const missing = collectMissing(ctx, ['hasarTutari', 'rayic']);
  const ratio = computeRatio(ctx.damageRatio, ctx.grossDamageAmount, ctx.marketValue);
  const hasarStr = ctx.grossDamageAmount !== null ? formatTL(ctx.grossDamageAmount) : 'belirsiz';
  const rayicStr = ctx.marketValue !== null ? formatTL(ctx.marketValue) : 'belirsiz';

  const raporText = joinDraft([
    `${ctx.plate || 'Araç'} dosyasında ağır/tam hasar yönünden değerlendirme taslağı:`,
    kvLines([['Hasar tutarı', hasarStr], ['Rayiç bedel', rayicStr], ['Onarım/rayiç oranı', ratioLabel(ratio)]]),
    'Güvenlik/kritik parça bilgisi raporda kontrol edilmelidir; kritik parça zararı ağır hasar kararını etkiler.',
    'Bu, eksper kanaatine yardımcı bir taslaktır; kesin ağır hasar/pert kararı eksper tarafından verilir.'
  ]);
  const mailText = mailDraft('Merhaba,', [
    `Dosya üzerinde yapılan incelemede hasar tutarı/rayiç oranı ${ratioLabel(ratio)} olarak değerlendirilmektedir.`,
    'Ayrıca güvenlik/kritik parçalar yönünden kontrol gerekmektedir.',
    'Bu kapsamda dosyanın ağır hasar/tam hasar yönünden değerlendirilmesi gerektiği kanaatindeyiz.'
  ], 'Bilginize sunarız.');
  const draft = withUser(['RAPOR AÇIKLAMASI TASLAĞI', raporText, 'DOSYA SORUMLUSUNA MAİL TASLAĞI', mailText], input);

  const warnings = ['Kesin ağır hasar/pert kararı verilmemiştir; eksper kanaati gereklidir.'];
  if (ctx.isHeavyDamage === null) warnings.push('Ağır/tam hasar durumu dosyadan netleşmedi; kontrol gerekli.');
  warnings.push('Hasar gören güvenlik/kritik parça bilgisi kontrol edilmeli.');
  return {
    taskType: 'heavy_damage_explanation', title: 'Ağır Hasar / Tam Hasar Açıklaması',
    summary: ratio !== null ? `Onarım/rayiç ~${ratioLabel(ratio)}` : 'Oran belirsiz',
    draftText: draft,
    sections: [sec('Rapor açıklaması taslağı', raporText), sec('Dosya sorumlusuna mail taslağı', mailText)],
    evidence: [
      ev('Hasar tutarı', ctx.grossDamageAmount !== null ? formatTL(ctx.grossDamageAmount) : 'Belirsiz', 'case'),
      ev('Rayiç', ctx.marketValue !== null ? formatTL(ctx.marketValue) : 'Belirsiz', 'case'),
      ev('Onarım/rayiç oranı', ratioLabel(ratio), 'calculation'),
      ev('Ağır/tam hasar', triLabel(ctx.isHeavyDamage), 'case')
    ],
    mevzuatReferences: pickMevzuatRefs(input.mevzuatItems, ['ağır hasar', 'tam hasar', 'rayiç', 'rapor şablonları']),
    warnings, missingInputs: missing, confidence: confidenceFromMissing(missing)
  };
}
