/** v0.6.x — AI yerel kural görevi: Servis talep mesajı (teknik, kısa). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { withUser } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { bulletList } from './task-draft-templates';
import { toneClosing } from './task-tone';

export function buildServiceRequestTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const draft = withUser([
    `Sayın ${ctx.serviceName || 'Servis'} yetkilisi,`,
    `${ctx.plate || '-'} plakalı araca ilişkin ekspertiz dosyası için aşağıdaki hususlarda teknik açıklama ve görsellerin iletilmesini rica ederiz:`,
    bulletList([
      ctx.missingDocuments.length ? `Eksik evrak: ${ctx.missingDocuments.join(', ')}` : '',
      'Hasar fotoğrafları ve hasar açıklaması',
      'Parça/işçilik açıklaması ve onarım kapsamı',
      'Tam boya / lokal boya gerekçesi',
      ctx.isHeavyDamage === true ? 'Ağır hasar için teknik açıklama' : ''
    ]),
    toneClosing('servis_talep_dili')
  ], input);
  return {
    taskType: 'service_request_message', title: 'Servis Talep Mesajı',
    summary: 'Servise teknik bilgi/belge talebi', draftText: draft, sections: [sec('Mesaj', draft)],
    evidence: [ev('Servis', ctx.serviceName || '-', 'case'), ev('Eksik evrak', ctx.missingDocuments.length ? ctx.missingDocuments.join(', ') : 'Yok', 'case')],
    mevzuatReferences: [], warnings: ['Kısa teknik talep; içerik dosyaya göre düzenlenmelidir.'],
    missingInputs: [], confidence: 'medium'
  };
}
