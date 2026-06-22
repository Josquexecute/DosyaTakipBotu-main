import type { AiTaskProgress, AiTaskProgressPhase } from '../../../shared/ai/ai-queue-types';

export const AI_QUEUE_PROGRESS_MESSAGES: Record<AiTaskProgressPhase, string> = {
  queued: 'Gorev siraya alindi',
  preparing: 'AI gorevi hazirlaniyor',
  running: 'AI gorevi calisiyor',
  finalizing: 'Sonuc guvenlik kontrolunden geciriliyor',
  done: 'Gorev tamamlandi',
  canceled: 'Gorev iptal edildi',
  error: 'Gorev hata ile sonuclandi'
};

export function createAiTaskProgress(
  phase: AiTaskProgressPhase,
  percent: number,
  message = AI_QUEUE_PROGRESS_MESSAGES[phase]
): AiTaskProgress {
  return {
    phase,
    percent: clampProgressPercent(percent),
    message,
    updatedAt: new Date().toISOString()
  };
}

export function clampProgressPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
