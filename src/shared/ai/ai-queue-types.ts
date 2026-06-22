import type { AiTaskRequest, AiTaskResult, AiTaskType } from './ai-task-types';

export type AiQueueTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'needs_user_input'
  | 'failed'
  | 'canceled'
  | 'timed_out';

export type AiTaskProgressPhase =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'finalizing'
  | 'done'
  | 'canceled'
  | 'error';

export type AiTaskQueuePriority = 'low' | 'normal' | 'high';

export interface AiTaskProgress {
  phase: AiTaskProgressPhase;
  percent: number;
  message: string;
  updatedAt: string;
}

export interface AiQueueError {
  code: string;
  message: string;
  recoverable: boolean;
  details?: unknown;
}

export interface AiQueuedTask {
  queueTaskId: string;
  aiTaskId: string;
  taskType: AiTaskType;
  status: AiQueueTaskStatus;
  request: AiTaskRequest;
  result?: AiTaskResult;
  error?: AiQueueError;
  progress: AiTaskProgress;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  canceledAt?: string;
  timeoutMs: number;
  priority: AiTaskQueuePriority;
}

export interface AiTaskQueueSnapshot {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  needsUserInput: number;
  failed: number;
  canceled: number;
  timedOut: number;
  tasks: AiQueuedTask[];
}

export interface AiTaskQueueOptions {
  maxConcurrency: number;
  defaultTimeoutMs: number;
  defaultMaxAttempts: number;
  maxQueueSize: number;
  keepFinishedLimit: number;
}

export interface AiTaskQueueEnqueueOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  priority?: AiTaskQueuePriority;
}

export type AiTaskQueueEventType =
  | 'task_queued'
  | 'task_started'
  | 'task_progress'
  | 'task_succeeded'
  | 'task_needs_user_input'
  | 'task_failed'
  | 'task_canceled'
  | 'task_timed_out'
  | 'queue_drained';

export type AiQueueEventSeverity = 'info' | 'success' | 'warning' | 'error';

export interface AiQueueHistoryEvent {
  eventId: string;
  type: AiTaskQueueEventType;
  queueTaskId: string;
  aiTaskId: string;
  taskType: AiTaskType;
  status: AiQueueTaskStatus;
  message: string;
  createdAt: string;
  severity: AiQueueEventSeverity;
  progressPercent?: number;
}

export interface AiTaskQueueEvent {
  eventId: string;
  type: AiTaskQueueEventType;
  task: AiQueuedTask;
  createdAt: string;
  severity: AiQueueEventSeverity;
  message: string;
  progressPercent?: number;
}
