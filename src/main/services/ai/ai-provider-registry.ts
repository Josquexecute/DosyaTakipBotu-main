import type { AiProvider, AiProviderInfo } from '../../../shared/ai/ai-provider-types';
import type { AiTaskRequest } from '../../../shared/ai/ai-task-types';
import { NoopAiProvider } from './providers/noop-ai-provider';
import { RuleAiProvider } from './providers/rule-ai-provider';

export class AiProviderRegistry {
  constructor(private readonly providers: readonly AiProvider[]) {}

  listProviders(): AiProviderInfo[] {
    return this.providers.map((provider) => provider.getProviderInfo());
  }

  selectProvider(request: AiTaskRequest): AiProvider {
    return this.providers.find((provider) => provider.canHandle(request)) ?? new NoopAiProvider();
  }
}

export function createDefaultAiProviderRegistry(): AiProviderRegistry {
  return new AiProviderRegistry([
    new RuleAiProvider(),
    new NoopAiProvider()
  ]);
}
