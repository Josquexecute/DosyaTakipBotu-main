import type {
  AiPreviewWrite,
  AiProviderPolicy,
  AiTaskError,
  AiTaskRequest,
  AiTaskRequestDraft,
  AiTaskResult,
  AiWarning
} from './ai-task-types';

export const AI_FINAL_APPROVAL_WARNING_CODE = 'AI_REQUIRES_USER_APPROVAL';
export const AI_FINAL_APPROVAL_WARNING =
  'AI sonucu nihai karar degildir; kalici yazma icin kullanici/eksper onayi gerekir.';

export const DEFAULT_AI_PROVIDER_POLICY: AiProviderPolicy = {
  allowPaidProviders: false,
  allowExternalProviders: false,
  allowLocalModel: false,
  preferDeterministicRules: true
};

export class AiSafetyError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'AiSafetyError';
  }
}

export function normalizeAiTaskRequest(request: AiTaskRequestDraft): AiTaskRequest {
  if (!request.taskId || !request.taskId.trim()) throw new AiSafetyError('AI_TASK_ID_REQUIRED', 'AI gorevi icin taskId zorunludur.');
  if (!request.taskType) throw new AiSafetyError('AI_TASK_TYPE_REQUIRED', 'AI gorevi icin taskType zorunludur.');

  const providerPolicy: AiProviderPolicy = {
    ...DEFAULT_AI_PROVIDER_POLICY,
    ...request.providerPolicy,
    allowPaidProviders: request.providerPolicy?.allowPaidProviders === true,
    allowExternalProviders: request.providerPolicy?.allowExternalProviders === true,
    allowLocalModel: request.providerPolicy?.allowLocalModel === true,
    preferDeterministicRules: request.providerPolicy?.preferDeterministicRules !== false
  };

  if (providerPolicy.allowPaidProviders) {
    throw new AiSafetyError('AI_PAID_PROVIDER_NOT_ALLOWED', 'Bu surumde ucretli AI provider kullanimi engellidir.');
  }
  if (providerPolicy.allowExternalProviders) {
    throw new AiSafetyError('AI_EXTERNAL_PROVIDER_NOT_ALLOWED', 'Bu asamada harici AI provider kullanimi kapali tutulur.');
  }

  return {
    taskId: request.taskId,
    taskType: request.taskType,
    ...(request.caseId ? { caseId: request.caseId } : {}),
    ...(request.plate ? { plate: request.plate } : {}),
    ...(request.claimNo ? { claimNo: request.claimNo } : {}),
    input: request.input ?? {},
    ...(request.context ? { context: request.context } : {}),
    privacyLevel: request.privacyLevel ?? 'local_only',
    providerPolicy,
    requiresUserApproval: true,
    createdAt: request.createdAt ?? new Date().toISOString()
  };
}

export function ensureAiResultSafety(request: Pick<AiTaskRequest, 'taskId' | 'taskType'>, result: AiTaskResult): AiTaskResult {
  return {
    ...result,
    taskId: result.taskId || request.taskId,
    taskType: result.taskType || request.taskType,
    warnings: ensureApprovalWarning(result.warnings),
    previewWrites: result.previewWrites.map(ensurePreviewWriteSafety),
    requiresUserApproval: true,
    canWriteAutomatically: false
  };
}

export function buildBlockedAiResult(request: Pick<AiTaskRequestDraft, 'taskId' | 'taskType'>, error: AiTaskError): AiTaskResult {
  return {
    taskId: request.taskId || 'ai-task-blocked',
    taskType: request.taskType || 'generic_rule_assist',
    status: 'blocked',
    providerId: 'ai-safety',
    mode: 'noop',
    summary: 'AI gorevi guvenlik kurallari nedeniyle calistirilmadi.',
    confidence: 'low',
    recommendations: [],
    warnings: ensureApprovalWarning([{ code: error.code, message: error.message, severity: 'error' }]),
    userQuestions: [],
    rationale: [{ code: error.code, message: error.message }],
    sources: [{ id: 'ai-safety', label: 'Yerel AI guvenlik kurallari', kind: 'system' }],
    previewWrites: [],
    requiresUserApproval: true,
    canWriteAutomatically: false,
    error,
    createdAt: new Date().toISOString()
  };
}

function ensurePreviewWriteSafety(write: AiPreviewWrite): AiPreviewWrite {
  return {
    ...write,
    requiresUserApproval: true
  };
}

function ensureApprovalWarning(warnings: readonly AiWarning[]): AiWarning[] {
  const list = [...warnings];
  if (!list.some((warning) => warning.code === AI_FINAL_APPROVAL_WARNING_CODE)) {
    list.push({ code: AI_FINAL_APPROVAL_WARNING_CODE, message: AI_FINAL_APPROVAL_WARNING, severity: 'warning' });
  }
  return list;
}
