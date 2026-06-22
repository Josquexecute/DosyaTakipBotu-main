import type { AiQueueError } from '../../../shared/ai/ai-queue-types';

export class AiTaskQueueError extends Error {
  constructor(readonly code: string, message: string, readonly recoverable: boolean, readonly details?: unknown) {
    super(message);
    this.name = 'AiTaskQueueError';
  }
}

export function toAiQueueError(error: unknown, fallbackCode = 'AI_QUEUE_ERROR', recoverable = true): AiQueueError {
  if (error instanceof AiTaskQueueError) {
    return {
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
      ...(error.details === undefined ? {} : { details: error.details })
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: fallbackCode, message, recoverable };
}
