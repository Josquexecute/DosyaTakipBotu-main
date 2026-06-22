export const AI_TASK_TYPES = [
  'labor_distribution',
  'heavy_damage_assessment',
  'document_check',
  'expert_note_draft',
  'email_draft',
  'fault_assessment',
  'policy_deductible_check',
  'generic_rule_assist'
] as const;

export type AiTaskType = (typeof AI_TASK_TYPES)[number];
export type AiPrivacyLevel = 'local_only' | 'may_use_local_model' | 'external_requires_explicit_approval';
export type AiTaskStatus = 'ok' | 'needs_user_input' | 'blocked' | 'error';
export type AiProviderMode = 'rule' | 'template' | 'noop' | 'local_model';
export type AiConfidence = 'low' | 'medium' | 'high';
export type AiPreviewOperation = 'create' | 'update' | 'append';

export interface AiProviderPolicy {
  allowPaidProviders: boolean;
  allowExternalProviders: boolean;
  allowLocalModel: boolean;
  preferDeterministicRules: boolean;
}

export interface AiTaskRequest {
  taskId: string;
  taskType: AiTaskType;
  caseId?: string;
  plate?: string;
  claimNo?: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
  privacyLevel: AiPrivacyLevel;
  providerPolicy: AiProviderPolicy;
  requiresUserApproval: true;
  createdAt: string;
}

export type AiTaskRequestDraft = Omit<AiTaskRequest, 'privacyLevel' | 'providerPolicy' | 'requiresUserApproval' | 'createdAt'> & {
  privacyLevel?: AiPrivacyLevel;
  providerPolicy?: Partial<AiProviderPolicy>;
  requiresUserApproval?: boolean;
  createdAt?: string;
};

export interface AiRecommendation {
  id: string;
  title: string;
  detail: string;
  confidence: AiConfidence;
}

export interface AiWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface AiUserQuestion {
  id: string;
  question: string;
  required: boolean;
}

export interface AiRationaleItem {
  code: string;
  message: string;
}

export interface AiSourceRef {
  id: string;
  label: string;
  kind: 'rule' | 'template' | 'input' | 'knowledge' | 'system';
}

export interface AiPreviewWrite {
  target: string;
  operation: AiPreviewOperation;
  fieldPath: string;
  before?: unknown;
  after: unknown;
  reason: string;
  requiresUserApproval: true;
}

export interface AiTaskError {
  code: string;
  message: string;
  details?: unknown;
}

export interface AiTaskResult {
  taskId: string;
  taskType: AiTaskType;
  status: AiTaskStatus;
  providerId: string;
  mode: AiProviderMode;
  summary: string;
  confidence: AiConfidence;
  recommendations: AiRecommendation[];
  warnings: AiWarning[];
  userQuestions: AiUserQuestion[];
  rationale: AiRationaleItem[];
  sources: AiSourceRef[];
  previewWrites: AiPreviewWrite[];
  requiresUserApproval: true;
  canWriteAutomatically: false;
  error?: AiTaskError;
  createdAt: string;
}
