/** v0.6.x — AI yerel kural görevi: Ekspertiz ücreti hesap özeti (düzenli tablo metni). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { deriveFeePrefill } from '../../ai-context/ai-case-context';
import { calculateMotorExpertiseFee } from '../../fees/expertise-fee-calculator';
import { withUser, formatTL } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { confidenceFromMissing } from './task-confidence';
import { pickMevzuatRefs } from './task-mevzuat-references';
import { kvLines } from './task-draft-templates';

export function buildFeeSummaryTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const missing: string[] = [];
  if (ctx.grossDamageAmount === null) missing.push('Brüt hasar tutarı');
  const prefill = deriveFeePrefill(ctx);
  const fee = calculateMotorExpertiseFee({
    brutHasarTutari: ctx.grossDamageAmount ?? 0,
    ...(prefill.vehicleClass ? { vehicleClass: prefill.vehicleClass } : {}),
    sehirDisi: prefill.sehirDisi,
    degerKaybi: prefill.degerKaybi
  });
  for (const m of fee.missingInputs) if (!missing.includes(m)) missing.push(m);
  const tablo = kvLines([
    ['Brüt hasar tutarı', ctx.grossDamageAmount !== null ? formatTL(ctx.grossDamageAmount) : 'belirsiz'],
    ['Kademe', String(fee.kademe)],
    ['Temel ücret', formatTL(fee.baseFee)],
    ['Araç grubu çarpanı', fee.vehicleMultiplier !== 1 ? `×${fee.vehicleMultiplier}` : ''],
    ['Değer kaybı ücreti', fee.degerKaybiFee > 0 ? formatTL(fee.degerKaybiFee) : ''],
    ['KTT tanzim ücreti', fee.kttFee > 0 ? formatTL(fee.kttFee) : ''],
    ['KDV hariç toplam', formatTL(fee.subtotalKdvHaric)]
  ]);
  const draft = withUser([
    'Ekspertiz ücreti yardımcı hesap özeti (SEDDK taban tarifesi, KDV hariç):',
    tablo,
    'Bu, resmî nihai ücret değildir; yardımcı hesaptır. Araç grubu/şehir dışı gibi alanlar eksper kontrolü gerektirir.'
  ], input);
  return {
    taskType: 'fee_calculation_summary', title: 'Ekspertiz Ücreti Hesap Özeti',
    summary: `KDV hariç ~${formatTL(fee.subtotalKdvHaric)}`,
    draftText: draft, sections: [sec('Ücret özeti', draft)],
    evidence: [
      ev('Brüt hasar', ctx.grossDamageAmount !== null ? formatTL(ctx.grossDamageAmount) : 'Belirsiz', 'case'),
      ev('Kademe', String(fee.kademe), 'calculation'),
      ev('KDV hariç toplam', formatTL(fee.subtotalKdvHaric), 'calculation')
    ],
    mevzuatReferences: pickMevzuatRefs(input.mevzuatItems, ['ücret', 'EK-1']),
    warnings: ['Resmî nihai ücret değildir; yardımcı hesaptır.', 'Araç grubu otomatik türetilmez; kontrol gerekli.'],
    missingInputs: missing, confidence: confidenceFromMissing(missing)
  };
}
