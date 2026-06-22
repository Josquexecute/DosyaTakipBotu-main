import type { AiProviderMode, AiTaskRequest, AiTaskResult, AiTaskType } from './ai-task-types';

export interface AiProviderInfo {
  providerId: string;
  displayName: string;
  cost: 'free';
  locality: 'local';
  usesInternet: false;
  requiresApiKey: false;
  supportsTaskTypes: readonly AiTaskType[];
  modes: readonly AiProviderMode[];
}

export interface AiProvider {
  getProviderInfo(): AiProviderInfo;
  canHandle(taskRequest: AiTaskRequest): boolean;
  run(taskRequest: AiTaskRequest): Promise<AiTaskResult>;
}
