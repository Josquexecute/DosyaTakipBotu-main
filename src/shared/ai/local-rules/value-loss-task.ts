/** v0.6.x — AI yerel kural görevi: Değer kaybı kontrolü (kontrol listesi). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { MOTOR_DEGER_KAYBI_FEE, MOTOR_DEGER_KAYBI_FEE_WITH_MADDI } from '../../fees/expertise-fee-calculator';
import { withUser, sigortaLabel, formatTL, triLabel } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { confidenceFromMissing } from './task-confidence';
import { pickMevzuatRefs } from './task-mevzuat-references';
import { collectMissing } from './task-control-warnings';
import { bulletList } from './task-draft-templates';

export function buildValueLossTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const eligible = ctx.sigortaTuru === 'trafik' || ctx.sigortaTuru === 'ihtiyari-mali-sorumluluk';
  const missing = collectMissing(ctx, ['dosyaTuru', 'degerKaybi']);
  const dkFee = `Tek başına ${formatTL(MOTOR_DEGER_KAYBI_FEE)} • maddi hasarla birlikte ${formatTL(MOTOR_DEGER_KAYBI_FEE_WITH_MADDI)}`;
  const draft = withUser([
    eligible
      ? `${sigortaLabel(ctx)} dosyasında değer kaybı yönünden kontrol taslağı (Ek-1.1 ile birlikte değerlendirilir):`
      : `Dosya türü ${sigortaLabel(ctx)}; değer kaybı genellikle trafik/ihtiyari mali sorumlulukta gündeme gelir. Dosya türü kontrol edilmelidir.`,
    'Kontrol listesi:',
    bulletList([
      `Dosya türü uygunluğu (trafik/ihtiyari) ve Ek-1.1 gerekliliği`,
      'Geçmiş hasar / SBM sorgusu',
      'Değer kaybına konu parça kontrolü',
      'Piyasa araştırması (yetkili bayi, galeri, online ilan) ve ekran görüntüsü',
      'Gerçek zarar ilkesi: kaza öncesi ve onarım sonrası ikinci el değer farkı'
    ]),
    `Değer kaybı ücreti (yardımcı bilgi): ${dkFee}.`,
    'Gerçek değer kaybı tutarı bu taslakta hesaplanmaz; eksper takdiri gerekir.'
  ], input);
  return {
    taskType: 'value_loss_check', title: 'Değer Kaybı Kontrolü',
    summary: eligible ? 'Değer kaybı kontrol listesi (Ek-1.1)' : 'Dosya türü kontrol gerekli',
    draftText: draft, sections: [sec('Kontrol listesi', draft)],
    evidence: [
      ev('Dosya türü', sigortaLabel(ctx), ctx.provenance.sigortaTuru ? 'aiHelperContext' : 'case'),
      ev('Değer kaybı', triLabel(ctx.hasValueLoss), ctx.provenance.hasValueLoss ? 'aiHelperContext' : 'case')
    ],
    mevzuatReferences: pickMevzuatRefs(input.mevzuatItems, ['değer kaybı', 'Ek-1.1', 'rapor şablonları']),
    warnings: ['Gerçek değer kaybı tutarı hesaplanmamıştır; eksper takdiri gerekir.'],
    missingInputs: missing, confidence: confidenceFromMissing(missing)
  };
}
