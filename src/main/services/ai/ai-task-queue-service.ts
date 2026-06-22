import { randomUUID } from 'node:crypto';
import type { AiTaskRequest, AiTaskResult } from '../../../shared/ai/ai-task-types';
import type {
  AiQueueEventSeverity,
  AiQueueHistoryEvent,
  AiQueuedTask,
  AiQueueTaskStatus,
  AiTaskProgress,
  AiTaskQueueEnqueueOptions,
  AiTaskQueueEvent,
  AiTaskQueueEventType,
  AiTaskQueueOptions,
  AiTaskQueueSnapshot
} from '../../../shared/ai/ai-queue-types';
import { AiOrchestratorService } from './ai-orchestrator-service';
import { createAiTaskProgress } from './ai-task-progress';
import { AiTaskQueueError, toAiQueueError } from './ai-task-queue-errors';

export interface AiTaskRunnerOptions {
  signal?: AbortSignal;
  onProgress?: (progress: AiTaskProgress) => void;
}

export interface AiTaskRunner {
  run(request: AiTaskRequest, options?: AiTaskRunnerOptions): Promise<AiTaskResult>;
}

type QueueRunOutcome =
  | { kind: 'result'; result: AiTaskResult }
  | { kind: 'error'; error: unknown }
  | { kind: 'canceled'; reason: string }
  | { kind: 'timed_out' };

type RunningControl = {
  abortController: AbortController;
  cancel: (reason: string) => void;
};

const DEFAULT_QUEUE_OPTIONS: AiTaskQueueOptions = {
  maxConcurrency: 1,
  defaultTimeoutMs: 120000,
  defaultMaxAttempts: 1,
  maxQueueSize: 100,
  keepFinishedLimit: 50
};

const EVENT_HISTORY_LIMIT = 100;
const DEFAULT_EVENT_READ_LIMIT = 20;

const PRIORITY_WEIGHT: Record<AiQueuedTask['priority'], number> = {
  high: 3,
  normal: 2,
  low: 1
};

export class AiTaskQueueService {
  private readonly tasks = new Map<string, AiQueuedTask>();
  private readonly listeners = new Set<(event: AiTaskQueueEvent) => void>();
  private readonly eventHistory: AiQueueHistoryEvent[] = [];
  private readonly runningControls = new Map<string, RunningControl>();
  private readonly activeRuns = new Set<Promise<void>>();
  private readonly drainResolvers = new Set<() => void>();
  private readonly options: AiTaskQueueOptions;
  private started = false;
  private drainedEventEmitted = false;

  constructor(
    private readonly runner: AiTaskRunner = new AiOrchestratorService(),
    options: Partial<AiTaskQueueOptions> = {}
  ) {
    this.options = normalizeQueueOptions(options);
  }

  getOptions(): AiTaskQueueOptions {
    return { ...this.options };
  }

  enqueue(request: AiTaskRequest, options: AiTaskQueueEnqueueOptions = {}): AiQueuedTask {
    if (this.tasks.size >= this.options.maxQueueSize) {
      throw new AiTaskQueueError('AI_QUEUE_FULL', 'AI gorev kuyrugu dolu.', true, { maxQueueSize: this.options.maxQueueSize });
    }

    const task: AiQueuedTask = {
      queueTaskId: randomUUID(),
      aiTaskId: request.taskId,
      taskType: request.taskType,
      status: 'queued',
      request,
      progress: createAiTaskProgress('queued', 0),
      attempts: 1,
      maxAttempts: clampPositiveInteger(options.maxAttempts ?? this.options.defaultMaxAttempts, this.options.defaultMaxAttempts),
      createdAt: new Date().toISOString(),
      timeoutMs: clampPositiveInteger(options.timeoutMs ?? this.options.defaultTimeoutMs, this.options.defaultTimeoutMs),
      priority: options.priority ?? 'normal'
    };

    this.tasks.set(task.queueTaskId, task);
    this.emit('task_queued', task);
    if (this.started) this.processQueue();
    return cloneTask(task);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.processQueue();
  }

  stop(): void {
    this.started = false;
  }

  getTask(queueTaskId: string): AiQueuedTask | undefined {
    const task = this.tasks.get(queueTaskId);
    return task ? cloneTask(task) : undefined;
  }

  listTasks(): AiQueuedTask[] {
    return [...this.tasks.values()].map(cloneTask);
  }

  getSnapshot(): AiTaskQueueSnapshot {
    const tasks = this.listTasks();
    return {
      total: tasks.length,
      queued: tasks.filter((task) => task.status === 'queued').length,
      running: tasks.filter((task) => task.status === 'running').length,
      succeeded: tasks.filter((task) => task.status === 'succeeded').length,
      needsUserInput: tasks.filter((task) => task.status === 'needs_user_input').length,
      failed: tasks.filter((task) => task.status === 'failed').length,
      canceled: tasks.filter((task) => task.status === 'canceled').length,
      timedOut: tasks.filter((task) => task.status === 'timed_out').length,
      tasks
    };
  }

  getEvents(limit = DEFAULT_EVENT_READ_LIMIT): AiQueueHistoryEvent[] {
    const safeLimit = Math.min(EVENT_HISTORY_LIMIT, clampPositiveInteger(limit, DEFAULT_EVENT_READ_LIMIT));
    return this.eventHistory.slice(0, safeLimit).map(cloneHistoryEvent);
  }

  cancelTask(queueTaskId: string, reason = 'Kullanici istegiyle iptal edildi.'): boolean {
    const task = this.tasks.get(queueTaskId);
    if (!task || isTerminalStatus(task.status)) return false;

    if (task.status === 'queued') {
      this.markCanceled(task, reason);
      this.maybeEmitDrained();
      return true;
    }

    const control = this.runningControls.get(queueTaskId);
    if (!control) return false;
    control.abortController.abort();
    control.cancel(reason);
    return true;
  }

  retryTask(queueTaskId: string): AiQueuedTask {
    const previous = this.tasks.get(queueTaskId);
    if (!previous) throw new AiTaskQueueError('AI_QUEUE_TASK_NOT_FOUND', 'Tekrar denenecek AI gorevi bulunamadi.', false);
    if (!isTerminalStatus(previous.status)) throw new AiTaskQueueError('AI_QUEUE_TASK_NOT_FINISHED', 'Devam eden AI gorevi tekrar deneme icin kullanilamaz.', true);
    if (previous.status === 'succeeded') throw new AiTaskQueueError('AI_QUEUE_TASK_ALREADY_SUCCEEDED', 'Basarili AI gorevi tekrar deneme gerektirmez.', false);
    if (previous.attempts >= previous.maxAttempts) {
      throw new AiTaskQueueError('AI_QUEUE_RETRY_LIMIT_REACHED', 'AI gorevi icin tekrar deneme sinirina ulasildi.', true, {
        attempts: previous.attempts,
        maxAttempts: previous.maxAttempts
      });
    }

    const task: AiQueuedTask = {
      queueTaskId: randomUUID(),
      aiTaskId: previous.aiTaskId,
      taskType: previous.taskType,
      status: 'queued',
      request: previous.request,
      progress: createAiTaskProgress('queued', 0, 'Gorev tekrar siraya alindi'),
      attempts: previous.attempts + 1,
      maxAttempts: previous.maxAttempts,
      createdAt: new Date().toISOString(),
      timeoutMs: previous.timeoutMs,
      priority: previous.priority
    };
    this.tasks.set(task.queueTaskId, task);
    this.emit('task_queued', task);
    if (this.started) this.processQueue();
    return cloneTask(task);
  }

  clearFinished(): number {
    let removed = 0;
    for (const [taskId, task] of this.tasks) {
      if (!isTerminalStatus(task.status)) continue;
      this.tasks.delete(taskId);
      removed += 1;
    }
    this.maybeEmitDrained();
    return removed;
  }

  onEvent(listener: (event: AiTaskQueueEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async drainForTests(): Promise<void> {
    if (this.isDrained()) return;
    await new Promise<void>((resolve) => this.drainResolvers.add(resolve));
  }

  private processQueue(): void {
    if (!this.started) {
      this.maybeEmitDrained();
      return;
    }
    while (this.getRunningCount() < this.options.maxConcurrency) {
      const task = this.pickNextQueuedTask();
      if (!task) break;
      const run = this.runTask(task).finally(() => {
        this.activeRuns.delete(run);
        this.processQueue();
        this.maybeEmitDrained();
      });
      this.activeRuns.add(run);
    }
    this.maybeEmitDrained();
  }

  private async runTask(task: AiQueuedTask): Promise<void> {
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.updateProgress(task, createAiTaskProgress('preparing', 10));
    this.emit('task_started', task);

    const abortController = new AbortController();
    let cancelTask: (reason: string) => void = () => undefined;
    const cancelPromise = new Promise<QueueRunOutcome>((resolve) => {
      cancelTask = (reason) => resolve({ kind: 'canceled', reason });
    });
    this.runningControls.set(task.queueTaskId, { abortController, cancel: cancelTask });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<QueueRunOutcome>((resolve) => {
      timeoutHandle = setTimeout(() => resolve({ kind: 'timed_out' }), task.timeoutMs);
    });

    this.updateProgress(task, createAiTaskProgress('running', 40));
    const runPromise: Promise<QueueRunOutcome> = this.runner.run(task.request, {
      signal: abortController.signal,
      onProgress: (progress) => this.updateProgress(task, progress)
    }).then(
      (result): QueueRunOutcome => ({ kind: 'result', result }),
      (error): QueueRunOutcome => ({ kind: 'error', error })
    );

    const outcome = await Promise.race([runPromise, cancelPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    this.runningControls.delete(task.queueTaskId);

    if (outcome.kind === 'canceled') {
      abortController.abort();
      this.markCanceled(task, outcome.reason);
      return;
    }
    if (outcome.kind === 'timed_out') {
      abortController.abort();
      this.markTimedOut(task);
      return;
    }
    this.updateProgress(task, createAiTaskProgress('finalizing', 90));
    if (outcome.kind === 'error') {
      this.markFailed(task, outcome.error);
      return;
    }
    this.applyResult(task, outcome.result);
  }

  private applyResult(task: AiQueuedTask, result: AiTaskResult): void {
    task.result = result;
    task.finishedAt = new Date().toISOString();
    if (result.status === 'ok') {
      task.status = 'succeeded';
      this.updateProgress(task, createAiTaskProgress('done', 100));
      this.emit('task_succeeded', task);
    } else if (result.status === 'needs_user_input' || result.status === 'blocked') {
      task.status = 'needs_user_input';
      this.updateProgress(task, createAiTaskProgress('done', 100, 'Gorev kullanici girdisi bekliyor'));
      this.emit('task_needs_user_input', task);
    } else {
      task.status = 'failed';
      task.error = result.error
        ? { code: result.error.code, message: result.error.message, recoverable: true, ...(result.error.details === undefined ? {} : { details: result.error.details }) }
        : { code: 'AI_TASK_RESULT_ERROR', message: result.summary || 'AI gorevi hata sonucu dondurdu.', recoverable: true };
      this.updateProgress(task, createAiTaskProgress('error', 100));
      this.emit('task_failed', task);
    }
    this.pruneFinished();
  }

  private markFailed(task: AiQueuedTask, error: unknown): void {
    task.status = 'failed';
    task.error = toAiQueueError(error, 'AI_QUEUE_RUN_FAILED', true);
    task.finishedAt = new Date().toISOString();
    this.updateProgress(task, createAiTaskProgress('error', 100));
    this.emit('task_failed', task);
    this.pruneFinished();
  }

  private markCanceled(task: AiQueuedTask, reason: string): void {
    task.status = 'canceled';
    task.error = { code: 'AI_QUEUE_TASK_CANCELED', message: reason, recoverable: true };
    task.canceledAt = new Date().toISOString();
    task.finishedAt = task.canceledAt;
    this.updateProgress(task, createAiTaskProgress('canceled', 100));
    this.emit('task_canceled', task);
    this.pruneFinished();
  }

  private markTimedOut(task: AiQueuedTask): void {
    task.status = 'timed_out';
    task.error = { code: 'AI_QUEUE_TASK_TIMED_OUT', message: `AI gorevi ${task.timeoutMs} ms icinde tamamlanamadi.`, recoverable: true };
    task.finishedAt = new Date().toISOString();
    this.updateProgress(task, createAiTaskProgress('error', 100, 'Gorev zaman asimina ugradi'));
    this.emit('task_timed_out', task);
    this.pruneFinished();
  }

  private updateProgress(task: AiQueuedTask, progress: AiTaskProgress): void {
    task.progress = {
      ...progress,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent)))
    };
    this.emit('task_progress', task);
  }

  private emit(type: AiTaskQueueEventType, task: AiQueuedTask): void {
    if (type !== 'queue_drained') this.drainedEventEmitted = false;
    const createdAt = new Date().toISOString();
    const clonedTask = cloneTask(task);
    const historyEvent = createHistoryEvent(type, clonedTask, createdAt);
    this.eventHistory.unshift(cloneHistoryEvent(historyEvent));
    if (this.eventHistory.length > EVENT_HISTORY_LIMIT) this.eventHistory.splice(EVENT_HISTORY_LIMIT);
    const event: AiTaskQueueEvent = {
      ...historyEvent,
      task: clonedTask
    };
    for (const listener of this.listeners) listener(event);
  }

  private pickNextQueuedTask(): AiQueuedTask | undefined {
    return [...this.tasks.values()]
      .filter((task) => task.status === 'queued')
      .sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        return priorityDiff || a.createdAt.localeCompare(b.createdAt);
      })[0];
  }

  private getRunningCount(): number {
    return [...this.tasks.values()].filter((task) => task.status === 'running').length;
  }

  private pruneFinished(): void {
    if (this.options.keepFinishedLimit < 0) return;
    const finished = [...this.tasks.values()]
      .filter((task) => isTerminalStatus(task.status))
      .sort((a, b) => (a.finishedAt ?? a.canceledAt ?? a.createdAt).localeCompare(b.finishedAt ?? b.canceledAt ?? b.createdAt));
    const overflow = finished.length - this.options.keepFinishedLimit;
    if (overflow <= 0) return;
    for (const task of finished.slice(0, overflow)) this.tasks.delete(task.queueTaskId);
  }

  private isDrained(): boolean {
    return ![...this.tasks.values()].some((task) => task.status === 'queued' || task.status === 'running') && this.activeRuns.size === 0;
  }

  private maybeEmitDrained(): void {
    if (!this.isDrained()) {
      this.drainedEventEmitted = false;
      return;
    }
    if (this.drainedEventEmitted) {
      this.resolveDrainWaiters();
      return;
    }
    this.drainedEventEmitted = true;
    const task = [...this.tasks.values()][0] ?? createSyntheticDrainedTask();
    this.emit('queue_drained', task);
    this.resolveDrainWaiters();
  }

  private resolveDrainWaiters(): void {
    for (const resolve of this.drainResolvers) resolve();
    this.drainResolvers.clear();
  }
}

function normalizeQueueOptions(options: Partial<AiTaskQueueOptions>): AiTaskQueueOptions {
  return {
    maxConcurrency: clampPositiveInteger(options.maxConcurrency ?? DEFAULT_QUEUE_OPTIONS.maxConcurrency, DEFAULT_QUEUE_OPTIONS.maxConcurrency),
    defaultTimeoutMs: clampPositiveInteger(options.defaultTimeoutMs ?? DEFAULT_QUEUE_OPTIONS.defaultTimeoutMs, DEFAULT_QUEUE_OPTIONS.defaultTimeoutMs),
    defaultMaxAttempts: clampPositiveInteger(options.defaultMaxAttempts ?? DEFAULT_QUEUE_OPTIONS.defaultMaxAttempts, DEFAULT_QUEUE_OPTIONS.defaultMaxAttempts),
    maxQueueSize: clampPositiveInteger(options.maxQueueSize ?? DEFAULT_QUEUE_OPTIONS.maxQueueSize, DEFAULT_QUEUE_OPTIONS.maxQueueSize),
    keepFinishedLimit: Number.isFinite(options.keepFinishedLimit) ? Math.max(0, Math.floor(options.keepFinishedLimit ?? DEFAULT_QUEUE_OPTIONS.keepFinishedLimit)) : DEFAULT_QUEUE_OPTIONS.keepFinishedLimit
  };
}

function clampPositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function isTerminalStatus(status: AiQueueTaskStatus): boolean {
  return status === 'succeeded'
    || status === 'needs_user_input'
    || status === 'failed'
    || status === 'canceled'
    || status === 'timed_out';
}

function createHistoryEvent(type: AiTaskQueueEventType, task: AiQueuedTask, createdAt: string): AiQueueHistoryEvent {
  const progressPercent = Number.isFinite(task.progress?.percent) ? Math.max(0, Math.min(100, Math.round(task.progress.percent))) : undefined;
  return {
    eventId: randomUUID(),
    type,
    queueTaskId: task.queueTaskId,
    aiTaskId: task.aiTaskId,
    taskType: task.taskType,
    status: task.status,
    message: eventMessage(type, task),
    createdAt,
    severity: eventSeverity(type),
    ...(progressPercent === undefined ? {} : { progressPercent })
  };
}

function eventSeverity(type: AiTaskQueueEventType): AiQueueEventSeverity {
  switch (type) {
    case 'task_succeeded': return 'success';
    case 'task_needs_user_input':
    case 'task_canceled': return 'warning';
    case 'task_failed':
    case 'task_timed_out': return 'error';
    case 'task_queued':
    case 'task_started':
    case 'task_progress':
    case 'queue_drained':
      return 'info';
  }
}

function eventMessage(type: AiTaskQueueEventType, task: AiQueuedTask): string {
  switch (type) {
    case 'task_queued': return 'AI gorevi siraya alindi';
    case 'task_started': return 'AI gorevi calismaya basladi';
    case 'task_progress': return task.progress?.message || 'AI gorevi ilerliyor';
    case 'task_succeeded': return 'AI gorevi tamamlandi';
    case 'task_needs_user_input': return 'AI gorevi kullanici onayi bekliyor';
    case 'task_failed': return task.error?.message || 'AI gorevi hata aldi';
    case 'task_canceled': return task.error?.message || 'AI gorevi iptal edildi';
    case 'task_timed_out': return task.error?.message || 'AI gorevi zaman asimina ugradi';
    case 'queue_drained': return 'AI gorev kuyrugu bosaldi';
  }
}

function cloneHistoryEvent(event: AiQueueHistoryEvent): AiQueueHistoryEvent {
  return { ...event };
}

function cloneTask(task: AiQueuedTask): AiQueuedTask {
  return {
    ...task,
    request: { ...task.request, input: { ...task.request.input }, ...(task.request.context ? { context: { ...task.request.context } } : {}) },
    ...(task.result ? { result: { ...task.result, warnings: [...task.result.warnings], recommendations: [...task.result.recommendations], userQuestions: [...task.result.userQuestions], rationale: [...task.result.rationale], sources: [...task.result.sources], previewWrites: [...task.result.previewWrites] } } : {}),
    ...(task.error ? { error: { ...task.error } } : {}),
    progress: { ...task.progress }
  };
}

function createSyntheticDrainedTask(): AiQueuedTask {
  const now = new Date().toISOString();
  return {
    queueTaskId: 'queue-drained',
    aiTaskId: 'queue-drained',
    taskType: 'generic_rule_assist',
    status: 'succeeded',
    request: {
      taskId: 'queue-drained',
      taskType: 'generic_rule_assist',
      input: {},
      privacyLevel: 'local_only',
      providerPolicy: { allowPaidProviders: false, allowExternalProviders: false, allowLocalModel: false, preferDeterministicRules: true },
      requiresUserApproval: true,
      createdAt: now
    },
    progress: createAiTaskProgress('done', 100),
    attempts: 1,
    maxAttempts: 1,
    createdAt: now,
    finishedAt: now,
    timeoutMs: DEFAULT_QUEUE_OPTIONS.defaultTimeoutMs,
    priority: 'normal'
  };
}
