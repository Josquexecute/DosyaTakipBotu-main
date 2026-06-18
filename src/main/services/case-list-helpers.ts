import type { CaseIndexItem } from '../../shared/types';

/**
 * Dosya (case) listeleme yardımcıları. ipc-domain-services.ts'ten ayrıştırıldı; davranış birebir korunur.
 * Liste ekranı için dosyaları "inceltir": audit ve büyük notes/todos gövdeleri taşınmaz,
 * önizleme/örnek dosya sayıları sınırlanır. Tam veri cases:get ile hydrate edilir.
 */

const CASE_LIST_SAMPLE_LIMIT = 8;
const CASE_LIST_PREVIEW_LIMIT = 12;
const CASE_LIST_NOTE_LIMIT = 3;
const CASE_LIST_OPEN_TODO_LIMIT = 8;

export function slimCasesForList(cases: CaseIndexItem[]): CaseIndexItem[] {
  return cases.map((item) => {
    const openTodos = item.tracking.todos.filter((todo) => !todo.completed);
    const lastNote = item.tracking.notes.at(-1);
    return {
      ...item,
      trackingSummary: {
        noteCount: item.tracking.notes.length,
        todoCount: item.tracking.todos.length,
        openTodoCount: openTodos.length,
        lastNoteText: lastNote?.text ?? '',
        lastNoteBy: lastNote?.createdBy ?? '',
        lastNoteAt: lastNote?.createdAt ?? ''
      },
      tracking: {
        ...item.tracking,
        // v0.3.15: liste ekranı audit ve büyük notes/todos gövdelerini taşımaz. Tam veri cases:get ile hydrate edilir.
        audit: [],
        notes: item.tracking.notes.slice(-CASE_LIST_NOTE_LIMIT),
        todos: openTodos.slice(0, CASE_LIST_OPEN_TODO_LIMIT)
      },
      folderContents: {
        ...item.folderContents,
        groups: item.folderContents.groups.map((group) => ({
          ...group,
          sampleFiles: group.sampleFiles.slice(0, CASE_LIST_SAMPLE_LIMIT)
        }))
      },
      photoAnalysis: {
        ...item.photoAnalysis,
        previews: item.photoAnalysis.previews.slice(0, CASE_LIST_PREVIEW_LIMIT)
      }
    };
  });
}
