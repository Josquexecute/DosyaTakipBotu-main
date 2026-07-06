/**
 * v0.6.x — AI yerel kural görevleri için güven (confidence) hesabı. SAF; davranış değişmez.
 */
import type { AiDraftConfidence } from '../ai-task-result-types';

/** Eksik girdi sayısına göre güven seviyesi (0 → yüksek, 1-2 → orta, 3+ → düşük). */
export function confidenceFromMissing(missingInputs: readonly string[]): AiDraftConfidence {
  if (missingInputs.length === 0) return 'high';
  if (missingInputs.length <= 2) return 'medium';
  return 'low';
}
