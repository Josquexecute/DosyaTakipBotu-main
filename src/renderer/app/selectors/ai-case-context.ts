/**
 * v0.6.x — AI Yardımcıları seçili dosya bağlamı (renderer barrel).
 * Saf domain mantığı `src/shared/ai-context/ai-case-context.ts`'tedir (main+renderer ortak, testlenebilir).
 */
export type { AiCaseContext, AiFieldProvenance } from '../../../shared/ai-context/ai-case-context';
export { buildAiCaseContext, applyAiHelperOverride } from '../../../shared/ai-context/ai-case-context';
