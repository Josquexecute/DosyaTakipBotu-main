/** v0.6.x — AI yerel kural görevi: Eksik evrak mesajı (kurumsal mail). SAF; davranış güvenliği değişmez. */
import type { AiDraftProviderOutput } from '../ai-task-result-types';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';
import { withUser } from './task-common';
import { ev } from './task-evidence';
import { sec } from './task-formatters';
import { bulletList, mailDraft } from './task-draft-templates';
import { toneOpening, toneClosing } from './task-tone';

export function buildMissingDocumentsTask(input: AiDraftTaskInput): AiDraftProviderOutput {
  const ctx = input.caseContext;
  const docs = ctx.missingDocuments;
  const opening = toneOpening('kurumsal_mail');
  const closing = toneClosing('kurumsal_mail');
  const draft = docs.length
    ? withUser([mailDraft(opening, [
        'Dosyanın değerlendirme/kapanış sürecine devam edilebilmesi için aşağıdaki evrakların iletilmesini rica ederiz:',
        bulletList(docs)
      ], closing)], input)
    : withUser([mailDraft(opening, [
        'Dosya üzerinde kritik eksik evrak görünmemektedir. Yine de dosya kapsamı kullanıcı tarafından kontrol edilmelidir.'
      ], '')], input);
  return {
    taskType: 'missing_documents_message', title: 'Eksik Evrak Mesajı',
    summary: docs.length ? `${docs.length} eksik evrak` : 'Eksik kritik evrak yok',
    draftText: draft, sections: [sec('Mesaj', draft)],
    evidence: [ev('Eksik evrak', docs.length ? docs.join(', ') : 'Yok', 'case')],
    mevzuatReferences: [], warnings: ['Belirsiz evrak durumları için manuel kontrol gerekir.'],
    missingInputs: [], confidence: docs.length ? 'high' : 'medium'
  };
}
