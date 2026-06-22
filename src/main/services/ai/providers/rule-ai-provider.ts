import type { AiProvider, AiProviderInfo } from '../../../../shared/ai/ai-provider-types';
import type { AiRecommendation, AiTaskRequest, AiTaskResult } from '../../../../shared/ai/ai-task-types';

export class RuleAiProvider implements AiProvider {
  getProviderInfo(): AiProviderInfo {
    return {
      providerId: 'rule-ai-provider',
      displayName: 'Yerel Kural AI Provider',
      cost: 'free',
      locality: 'local',
      usesInternet: false,
      requiresApiKey: false,
      supportsTaskTypes: ['generic_rule_assist'],
      modes: ['rule', 'template']
    };
  }

  canHandle(taskRequest: AiTaskRequest): boolean {
    return taskRequest.taskType === 'generic_rule_assist' && taskRequest.providerPolicy.preferDeterministicRules;
  }

  async run(taskRequest: AiTaskRequest): Promise<AiTaskResult> {
    const text = extractPromptText(taskRequest.input);
    const recommendations: AiRecommendation[] = text
      ? [{
          id: 'rule-review',
          title: 'Yerel kural incelemesi',
          detail: 'Girilen metin yerel kural provider tarafindan taslak olarak degerlendirildi.',
          confidence: 'medium'
        }]
      : [];
    const needsInput = text.length === 0;

    return {
      taskId: taskRequest.taskId,
      taskType: taskRequest.taskType,
      status: needsInput ? 'needs_user_input' : 'ok',
      providerId: this.getProviderInfo().providerId,
      mode: 'rule',
      summary: needsInput
        ? 'Degerlendirme icin metin veya kural girdisi gerekli.'
        : `Yerel kural provider ${text.length} karakterlik girdiyi onizleme olarak degerlendirdi.`,
      confidence: needsInput ? 'low' : 'medium',
      recommendations,
      warnings: needsInput ? [{ code: 'AI_RULE_INPUT_REQUIRED', message: 'Kural provider bos girdiyle karar uretmez.', severity: 'warning' }] : [],
      userQuestions: needsInput ? [{ id: 'provide-input', question: 'Incelenecek metin veya kural girdisi nedir?', required: true }] : [],
      rationale: [{
        code: 'LOCAL_RULE_PROVIDER',
        message: 'Sonuc internet kullanmadan, deterministik yerel provider iskeletiyle uretildi.'
      }],
      sources: [{ id: 'rule-provider', label: 'Yerel kural provider', kind: 'rule' }],
      previewWrites: [],
      requiresUserApproval: true,
      canWriteAutomatically: false,
      createdAt: new Date().toISOString()
    };
  }
}

function extractPromptText(input: Record<string, unknown>): string {
  const value = input.text ?? input.prompt ?? input.note ?? input.description;
  return typeof value === 'string' ? value.trim() : '';
}
