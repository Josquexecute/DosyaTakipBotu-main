import type { AiProviderInfo } from '../../../shared/ai/ai-provider-types';
import type { AiTaskProgress } from '../../../shared/ai/ai-queue-types';
import type { AiTaskRequest, AiTaskRequestDraft, AiTaskResult } from '../../../shared/ai/ai-task-types';
import { AiProviderRegistry, createDefaultAiProviderRegistry } from './ai-provider-registry';
import { AiSafetyService } from './ai-safety-service';
import { createAiTaskProgress } from './ai-task-progress';

export interface AiOrchestratorRunOptions {
  signal?: AbortSignal;
  onProgress?: (progress: AiTaskProgress) => void;
}

export class AiOrchestratorService {
  constructor(
    private readonly registry: AiProviderRegistry = createDefaultAiProviderRegistry(),
    private readonly safety: AiSafetyService = new AiSafetyService()
  ) {}

  listProviders(): AiProviderInfo[] {
    return this.registry.listProviders();
  }

  async run(requestDraft: AiTaskRequestDraft, options: AiOrchestratorRunOptions = {}): Promise<AiTaskResult> {
    if (options.signal?.aborted) {
      return this.safety.buildBlockedResult(requestDraft, new Error('AI gorevi calismadan once iptal edildi.'));
    }
    options.onProgress?.(createAiTaskProgress('preparing', 10));
    let request: AiTaskRequest;
    try {
      request = this.safety.normalizeRequest(requestDraft);
    } catch (error) {
      return this.safety.buildBlockedResult(requestDraft, error);
    }

    const provider = this.registry.selectProvider(request);
    try {
      options.onProgress?.(createAiTaskProgress('running', 60));
      const result = await provider.run(request);
      options.onProgress?.(createAiTaskProgress('finalizing', 90));
      if (options.signal?.aborted) {
        return this.safety.ensureSafeResult(request, buildProviderErrorResult(request, provider.getProviderInfo().providerId, new Error('AI gorevi iptal edildi.')));
      }
      return this.safety.ensureSafeResult(request, result);
    } catch (error) {
      return this.safety.ensureSafeResult(request, buildProviderErrorResult(request, provider.getProviderInfo().providerId, error));
    }
  }
}

function buildProviderErrorResult(request: AiTaskRequest, providerId: string, error: unknown): AiTaskResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    taskId: request.taskId,
    taskType: request.taskType,
    status: 'error',
    providerId,
    mode: 'noop',
    summary: 'AI provider calisirken hata olustu. Kalici veri yazilmadi.',
    confidence: 'low',
    recommendations: [],
    warnings: [{ code: 'AI_PROVIDER_ERROR', message, severity: 'error' }],
    userQuestions: [],
    rationale: [{ code: 'PROVIDER_ERROR', message }],
    sources: [{ id: providerId, label: providerId, kind: 'system' }],
    previewWrites: [],
    requiresUserApproval: true,
    canWriteAutomatically: false,
    error: { code: 'AI_PROVIDER_ERROR', message },
    createdAt: new Date().toISOString()
  };
}
