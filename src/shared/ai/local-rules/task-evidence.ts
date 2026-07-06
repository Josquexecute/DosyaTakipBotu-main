/**
 * v0.6.x — AI yerel kural görevleri için evidence (kullanılan veri) üreticisi. SAF; davranış değişmez.
 */
import type { AiDraftEvidence, AiDraftEvidenceSource } from '../ai-task-result-types';

/** Tek bir evidence satırı (label + değer + kaynak). */
export function ev(label: string, value: string, source: AiDraftEvidenceSource): AiDraftEvidence {
  return { label, value, source };
}
