import type { AiProvider, AiProviderInfo } from '../../../../shared/ai/ai-provider-types';
import type { AiTaskRequest, AiTaskResult } from '../../../../shared/ai/ai-task-types';
import { AI_TASK_TYPES } from '../../../../shared/ai/ai-task-types';

export class NoopAiProvider implements AiProvider {
  getProviderInfo(): AiProviderInfo {
    return {
      providerId: 'noop-ai-provider',
      displayName: 'Guvenli No-Op AI Provider',
      cost: 'free',
      locality: 'local',
      usesInternet: false,
      requiresApiKey: false,
      supportsTaskTypes: AI_TASK_TYPES,
      modes: ['noop']
    };
  }

  canHandle(_taskRequest: AiTaskRequest): boolean {
    return true;
  }

  async run(taskRequest: AiTaskRequest): Promise<AiTaskResult> {
    return {
      taskId: taskRequest.taskId,
      taskType: taskRequest.taskType,
      status: 'needs_user_input',
      providerId: this.getProviderInfo().providerId,
      mode: 'noop',
      summary: 'Bu AI gorevi icin henuz aktif yerel kural uygulamasi yok. Kalici veri yazilmadi.',
      confidence: 'low',
      recommendations: [],
      warnings: [{ code: 'AI_NOOP_PROVIDER', message: 'No-op provider karar uretmez ve dosyaya yazmaz.', severity: 'info' }],
      userQuestions: [{ id: 'manual-review', question: 'Bu gorev icin kullanici incelemesi gerekiyor mu?', required: true }],
      rationale: [{ code: 'NOOP_SAFE_DEFAULT', message: 'Guvenli varsayilan olarak yalnizca onizleme/uyari donduruldu.' }],
      sources: [{ id: 'noop-provider', label: 'Yerel no-op provider', kind: 'system' }],
      previewWrites: [],
      requiresUserApproval: true,
      canWriteAutomatically: false,
      createdAt: new Date().toISOString()
    };
  }
}
