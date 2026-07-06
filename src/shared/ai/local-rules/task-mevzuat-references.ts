/**
 * v0.6.x — AI yerel kural görevleri için mevzuat referansı seçimi. SAF; davranış değişmez.
 */
import type { AiDraftMevzuatReference } from '../ai-task-result-types';
import type { MevzuatKnowledgeItem } from '../../mevzuat/mevzuat-types';

/** Verilen terimlerle (tag/topic/başlık/kural) eşleşen mevzuat maddelerinden referans listesi (en fazla `max`). */
export function pickMevzuatRefs(items: readonly MevzuatKnowledgeItem[], terms: readonly string[], max = 3): AiDraftMevzuatReference[] {
  const needles = terms.map((t) => t.toLocaleLowerCase('tr-TR')).filter(Boolean);
  if (!needles.length) return [];
  const refs: AiDraftMevzuatReference[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const blob = [item.topic, item.title, item.rule, ...item.tags].join(' ').toLocaleLowerCase('tr-TR');
    if (!needles.some((n) => blob.includes(n))) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    refs.push({ sourceId: item.sourceId, title: item.title, legalReference: item.legalReference, rule: item.rule });
    if (refs.length >= max) break;
  }
  return refs;
}
