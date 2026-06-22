import type { AiTaskRequest, AiTaskRequestDraft, AiTaskResult } from '../../../shared/ai/ai-task-types';
import { AiSafetyError, buildBlockedAiResult, ensureAiResultSafety, normalizeAiTaskRequest } from '../../../shared/ai/ai-safety';

export class AiSafetyService {
  normalizeRequest(request: AiTaskRequestDraft): AiTaskRequest {
    return normalizeAiTaskRequest(request);
  }

  ensureSafeResult(request: AiTaskRequest, result: AiTaskResult): AiTaskResult {
    return ensureAiResultSafety(request, result);
  }

  buildBlockedResult(request: AiTaskRequestDraft, error: unknown): AiTaskResult {
    if (error instanceof AiSafetyError) {
      return buildBlockedAiResult(request, { code: error.code, message: error.message, details: error.details });
    }
    const message = error instanceof Error ? error.message : String(error);
    return buildBlockedAiResult(request, { code: 'AI_SAFETY_BLOCKED', message });
  }
}
