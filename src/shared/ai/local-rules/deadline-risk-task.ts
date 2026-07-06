/** v0.6.x — AI yerel kural görevi: EKSİST / süre risk kontrolü (bölümlü). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { ATAMA_SAATLERI } from '../../deadlines/eksist-deadline-rules';
import { withUser } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { confidenceFromMissing } from './task-confidence';
import { pickMevzuatRefs } from './task-mevzuat-references';
import { collectMissing } from './task-control-warnings';
import { bulletList, kvLines } from './task-draft-templates';

export function buildDeadlineRiskTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const dosyaTuru = ctx.sigortaTuru === 'trafik' ? 'Trafik' : 'Diğer motorlu araç';
  const raporSure = ctx.sigortaTuru === 'trafik' ? '3 iş günü' : '5 iş günü';
  const missing = collectMissing(ctx, ['dosyaTuru', 'atamaTarihi', 'onRaporTarihi', 'raporaHazirTarihi']);
  const kurallar = bulletList([
    `Atama saatleri: ${ATAMA_SAATLERI.join(' / ')}`,
    'İş kabulü: 6 saat',
    'Ekspertiz: aynı il ilk iş günü / farklı il 2 iş günü',
    `Rapor tamamlama: ${raporSure}`,
    'Ön rapor sonrası 15 gün • Onarım 30 gün • İtiraz 3 iş günü'
  ]);
  const tarihler = kvLines([
    ['Atama/ekspertiz talep tarihi', ctx.appointmentDate || ''],
    ['Ön rapor tarihi', ctx.preliminaryReportDate || ''],
    ['Rapora hazır tarihi', ctx.reportReadyDate || '']
  ]) || 'Dosyadan tarih bilgisi gelmedi.';
  const draft = withUser([
    `EKSİST / süre kuralları kontrolü (${dosyaTuru}):`,
    'Geçerli kurallar:', kurallar,
    'Dosyadan gelen tarihler:', tarihler,
    missing.length ? `Eksik tarih/bilgi (kontrol gerekli): ${missing.join(', ')}.` : '',
    'Resmî tatil ve hafta sonu kontrolü kullanıcı sorumluluğundadır; bu kesin hukuki süre hesabı değildir.'
  ], input);
  return {
    taskType: 'deadline_risk_check', title: 'EKSİST / Süre Risk Kontrolü',
    summary: `${dosyaTuru} • rapor ${raporSure}`,
    draftText: draft, sections: [sec('Süre kuralları', draft)],
    evidence: [
      ev('Dosya türü', dosyaTuru, ctx.provenance.sigortaTuru ? 'aiHelperContext' : 'case'),
      ev('Rapor süresi', raporSure, 'mevzuat'),
      ev('Atama tarihi', ctx.appointmentDate || 'Belirsiz', ctx.provenance.appointmentDate ? 'aiHelperContext' : 'case')
    ],
    mevzuatReferences: pickMevzuatRefs(input.mevzuatItems, ['süre', 'iş kabul', 'ön rapor', 'atama saatleri']),
    warnings: ['Resmî tatil/hafta sonu teyidi kullanıcı sorumluluğundadır.', 'Kesin hukuki süre hesabı değildir.'],
    missingInputs: missing, confidence: confidenceFromMissing(missing)
  };
}
