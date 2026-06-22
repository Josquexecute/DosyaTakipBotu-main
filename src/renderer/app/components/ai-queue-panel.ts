import type { UiState } from '../state';
import { escapeHtml, formatDate } from '../validation';
import { icon } from '../icons';
import type { AiQueueHistoryEvent, AiQueuedTask, AiQueueTaskStatus, AiTaskProgress } from '../../../shared/ai/ai-queue-types';
import type { AiPreviewWrite, AiTaskResult } from '../../../shared/ai/ai-task-types';

const ACTIVE_STATUSES = new Set<AiQueueTaskStatus>(['queued', 'running']);
const ATTENTION_STATUSES = new Set<AiQueueTaskStatus>(['needs_user_input', 'failed', 'timed_out']);
const FINISHED_STATUSES = new Set<AiQueueTaskStatus>(['succeeded', 'needs_user_input', 'failed', 'canceled', 'timed_out']);
const COMPLETED_STATUSES = new Set<AiQueueTaskStatus>(['succeeded', 'canceled']);
const MAX_VISIBLE_TASKS = 50;
const MAX_VISIBLE_EVENTS = 20;

export function renderAiQueuePanel(state: UiState): string {
  const snapshot = state.aiQueueSnapshot;
  const sortedTasks = sortAiQueueTasks(snapshot?.tasks ?? []);
  const visibleTasks = sortedTasks.slice(0, MAX_VISIBLE_TASKS);
  const selected = visibleTasks.find((task) => task.queueTaskId === state.aiQueueSelectedTaskId) ?? visibleTasks[0] ?? null;
  const hasFinished = sortedTasks.some((task) => FINISHED_STATUSES.has(task.status));
  const hasActive = sortedTasks.some((task) => ACTIVE_STATUSES.has(task.status));
  const rows = visibleTasks.length
    ? renderTaskGroups(visibleTasks, selected?.queueTaskId, state)
    : `<div class="ai-queue-empty">
        <b>Şu anda AI görevi yok.</b>
        <span>AI görevleri çalıştığında durumları burada görünecek.</span>
      </div>`;

  return `<div class="info-card wide ai-queue-panel">
    <div class="ai-queue-header">
      <div>
        <h3>${icon('sync')} AI Görev Durumu</h3>
        <p class="settings-help">Kuyruktaki yerel AI ön değerlendirme görevlerini izleyin. Sonuçlar salt okunur önizlemedir; nihai karar kullanıcı/eksper onayına tabidir.</p>
      </div>
      <div class="settings-header-actions">
        <button class="secondary compact" data-action="ai-queue-toggle-auto-refresh" type="button">${state.aiQueueAutoRefreshEnabled ? 'Otomatik yenileme açık' : 'Otomatik yenileme kapalı'}</button>
        <button class="secondary compact" data-action="ai-queue-refresh" type="button" ${state.aiQueueLoading ? 'disabled' : ''}>${icon('refresh')}<span>Yenile</span></button>
        <button class="secondary compact" data-action="ai-queue-clear-finished" type="button" ${hasFinished && !state.aiQueueLoading ? '' : 'disabled'}>${icon('close')}<span>Bitmiş görevleri temizle</span></button>
      </div>
    </div>
    ${renderSummary(snapshot)}
    <div class="app-alert info">${icon('info')}<span>AI sonuçları ön değerlendirmedir. Nihai karar kullanıcı/eksper onayına tabidir. Bu panel AI sonuçlarını otomatik olarak takip.json veya Excel'e yazmaz.</span></div>
    ${renderRefreshStatus(state, hasActive)}
    ${renderQueueEvents(state)}
    ${state.aiQueueError ? `<div class="app-alert warning">${icon('warning')}<span>${escapeHtml(state.aiQueueError)}</span></div>` : ''}
    ${state.aiQueueLoading ? `<div class="app-alert info">${icon('sync')}<span>AI görev durumu okunuyor...</span></div>` : ''}
    ${state.aiQueueLastLoadedAt ? `<small class="settings-help inline">Son okuma: ${escapeHtml(formatDate(state.aiQueueLastLoadedAt))}</small>` : ''}
    <div class="ai-queue-workspace">
      <div class="ai-queue-list" aria-label="AI görev listesi">
        ${visibleTasks.length < sortedTasks.length ? `<small class="settings-help inline">Performans için son ${MAX_VISIBLE_TASKS} görev gösteriliyor.</small>` : ''}
        ${rows}
      </div>
      ${selected ? renderTaskDetail(selected) : renderNoTaskDetail()}
    </div>
  </div>`;
}

function renderSummary(snapshot: UiState['aiQueueSnapshot']): string {
  const active = (snapshot?.queued ?? 0) + (snapshot?.running ?? 0);
  const attention = (snapshot?.needsUserInput ?? 0) + (snapshot?.failed ?? 0) + (snapshot?.timedOut ?? 0);
  const values = [
    ['Toplam', snapshot?.total ?? 0],
    ['Aktif', active],
    ['Sırada', snapshot?.queued ?? 0],
    ['Çalışan', snapshot?.running ?? 0],
    ['Dikkat', attention],
    ['Tamamlanan', snapshot?.succeeded ?? 0],
    ['İptal', snapshot?.canceled ?? 0],
    ['Zaman Aşımı', snapshot?.timedOut ?? 0]
  ];
  return `<div class="ai-queue-summary">${values.map(([label, value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('')}</div>`;
}

function renderRefreshStatus(state: UiState, hasActive: boolean): string {
  const label = state.aiQueueAutoRefreshEnabled
    ? hasActive ? 'Otomatik yenileme açık: aktif görevlerde 5 saniyede bir güncellenir.' : 'Otomatik yenileme açık: aktif görev yokken daha seyrek güncellenir.'
    : 'Otomatik yenileme kapalı: Yenile düğmesiyle elle güncelleyebilirsiniz.';
  return `<div class="ai-queue-refresh-status ${state.aiQueueAutoRefreshEnabled ? 'enabled' : 'disabled'}">${escapeHtml(label)}</div>`;
}

function renderQueueEvents(state: UiState): string {
  const events = state.aiQueueEvents.slice(0, MAX_VISIBLE_EVENTS);
  const lastEvent = events[0] ?? null;
  const error = state.aiQueueEventsError
    ? `<div class="app-alert warning">${icon('warning')}<span>AI olay gecmisi okunamadi: ${escapeHtml(state.aiQueueEventsError)}</span></div>`
    : '';
  return `<section class="ai-queue-events-panel" aria-label="AI Gorev Olaylari">
    <div class="ai-queue-last-event ${lastEvent ? eventSeverityClass(lastEvent.severity) : 'empty'}">
      <b>Son olay</b>
      ${lastEvent ? renderQueueEventSummary(lastEvent) : '<span>Henuz AI olayi yok.</span>'}
    </div>
    ${error}
    ${renderQueueEventHistory(events)}
  </section>`;
}

function renderQueueEventHistory(events: AiQueueHistoryEvent[]): string {
  if (events.length === 0) {
    return `<details class="ai-queue-events">
      <summary>Son olaylar (0)</summary>
      <p class="settings-help">Henuz AI olayi yok.</p>
    </details>`;
  }
  return `<details class="ai-queue-events">
    <summary>Son olaylar (${events.length})</summary>
    <div class="ai-queue-event-list">
      ${events.map(renderQueueEventRow).join('')}
    </div>
    ${events.length >= MAX_VISIBLE_EVENTS ? `<small class="settings-help inline">Son ${MAX_VISIBLE_EVENTS} olay gosteriliyor.</small>` : ''}
  </details>`;
}

function renderQueueEventSummary(event: AiQueueHistoryEvent): string {
  return `<span>${escapeHtml(event.message)}</span>
    <small>${escapeHtml(formatDate(event.createdAt))} • ${escapeHtml(event.taskType)} • ${escapeHtml(statusLabel(event.status))}${renderEventProgressSuffix(event)}</small>`;
}

function renderQueueEventRow(event: AiQueueHistoryEvent): string {
  return `<div class="ai-queue-event-row ${eventSeverityClass(event.severity)}">
    <span class="status-chip ${eventSeverityClass(event.severity)}">${escapeHtml(eventSeverityLabel(event.severity))}</span>
    <div>
      <b>${escapeHtml(eventTypeLabel(event.type))}</b>
      <span>${escapeHtml(event.message)}</span>
      <small>${escapeHtml(formatDate(event.createdAt))} • ${escapeHtml(event.taskType)} • ${escapeHtml(statusLabel(event.status))}${renderEventProgressSuffix(event)}</small>
    </div>
  </div>`;
}

function renderEventProgressSuffix(event: AiQueueHistoryEvent): string {
  if (event.progressPercent === undefined) return '';
  const percent = Math.max(0, Math.min(100, Math.round(event.progressPercent)));
  return ` • ${percent}%`;
}

function renderTaskGroups(tasks: AiQueuedTask[], selectedTaskId: string | undefined, state: UiState): string {
  const active = tasks.filter((task) => ACTIVE_STATUSES.has(task.status));
  const attention = tasks.filter((task) => ATTENTION_STATUSES.has(task.status));
  const completed = tasks.filter((task) => COMPLETED_STATUSES.has(task.status));
  return [
    renderTaskGroup('Aktif görevler', 'Sırada veya çalışan görevler', active, selectedTaskId, state),
    renderTaskGroup('Dikkat isteyenler', 'Kullanıcı onayı, hata veya zaman aşımı', attention, selectedTaskId, state),
    renderTaskGroup('Tamamlanan son görevler', 'Tamamlanan veya iptal edilen görevler', completed, selectedTaskId, state)
  ].filter(Boolean).join('');
}

function renderTaskGroup(title: string, description: string, tasks: AiQueuedTask[], selectedTaskId: string | undefined, state: UiState): string {
  if (tasks.length === 0) return '';
  return `<section class="ai-queue-group">
    <div class="ai-queue-group-title"><b>${escapeHtml(title)}</b><small>${escapeHtml(description)} (${tasks.length})</small></div>
    ${tasks.map((task) => renderTaskRow(task, selectedTaskId === task.queueTaskId, state)).join('')}
  </section>`;
}

function renderTaskRow(task: AiQueuedTask, active: boolean, state: UiState): string {
  const percent = progressPercent(task.progress);
  const canCancel = task.status === 'queued' || task.status === 'running';
  const canceling = state.aiQueueCancelingTaskId === task.queueTaskId;
  const timestamp = task.startedAt ?? task.createdAt;
  return `<div class="ai-queue-row ${active ? 'active' : ''} ${ACTIVE_STATUSES.has(task.status) ? 'is-active-task' : ''}">
    <button class="ai-queue-row-main" data-action="ai-queue-select" data-queue-task-id="${escapeHtml(task.queueTaskId)}" type="button">
      <span class="status-chip ${statusClass(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
      <b>${escapeHtml(task.taskType)}</b>
      <small>${escapeHtml(shortProgressMessage(task.progress))}</small>
      <small>${escapeHtml(formatDate(timestamp))} • ${percent}% • ${escapeHtml(task.progress.phase)}</small>
      <span class="ai-queue-progress" aria-label="İlerleme %${percent}"><span style="width:${percent}%"></span></span>
    </button>
    ${canCancel ? `<button class="secondary danger compact" data-action="ai-queue-cancel" data-queue-task-id="${escapeHtml(task.queueTaskId)}" type="button" ${canceling || state.aiQueueLoading ? 'disabled' : ''}>${canceling ? 'İptal ediliyor' : 'İptal Et'}</button>` : ''}
  </div>`;
}

function renderTaskDetail(task: AiQueuedTask): string {
  const result = task.result;
  const writes = result?.previewWrites ?? [];
  return `<div class="ai-queue-detail">
    <div class="ai-queue-detail-heading">
      <div>
        <h4>${escapeHtml(task.taskType)} / ${escapeHtml(task.aiTaskId)}</h4>
        <small>${escapeHtml(task.queueTaskId)}</small>
      </div>
      <span class="status-chip ${statusClass(task.status)}">${escapeHtml(statusLabel(task.status))}</span>
    </div>
    <div class="ai-queue-meta">
      <span><small>Provider</small><b>${escapeHtml(result?.providerId ?? '-')}</b></span>
      <span><small>Durum</small><b>${escapeHtml(statusLabel(task.status))}</b></span>
      <span><small>Progress</small><b>${progressPercent(task.progress)}%</b></span>
      <span><small>Phase</small><b>${escapeHtml(task.progress.phase)}</b></span>
      <span><small>Deneme</small><b>${task.attempts}/${task.maxAttempts}</b></span>
      <span><small>Güven</small><b>${escapeHtml(confidenceLabel(result?.confidence))}</b></span>
      <span><small>Oluşturma</small><b>${escapeHtml(formatDate(task.createdAt))}</b></span>
      <span><small>Başlama</small><b>${escapeHtml(formatDate(task.startedAt ?? ''))}</b></span>
      <span><small>Bitiş</small><b>${escapeHtml(formatDate(task.finishedAt ?? task.canceledAt ?? ''))}</b></span>
      <span><small>Timeout</small><b>${Math.round(task.timeoutMs / 1000)} sn</b></span>
    </div>
    ${renderProgress(task.progress)}
    ${task.error ? `<div class="app-alert error">${icon('warning')}<span>${escapeHtml(task.error.message)}</span></div>` : ''}
    ${result ? renderResult(result) : '<div class="app-alert info"><span>Bu görev için henüz sonuç oluşmadı.</span></div>'}
    <details class="ai-queue-preview-writes">
      <summary>PreviewWrites salt okunur (${writes.length})</summary>
      ${writes.length ? writes.map(renderPreviewWrite).join('') : '<p class="settings-help">Bu sonuçta yazma önizlemesi yok.</p>'}
    </details>
  </div>`;
}

function renderNoTaskDetail(): string {
  return `<div class="ai-queue-detail ai-queue-detail-empty">
    <h4>Görev seçilmedi</h4>
    <p class="settings-help">AI görevi olmadığında burada sadece durum bilgisi görünür.</p>
  </div>`;
}

function renderResult(result: AiTaskResult): string {
  const unsafeWrite = result.canWriteAutomatically !== false || result.requiresUserApproval !== true || result.previewWrites.some((write) => write.requiresUserApproval !== true);
  return `<div class="ai-queue-result">
    <div class="app-alert ${unsafeWrite ? 'error' : 'success'}">${icon(unsafeWrite ? 'warning' : 'check')}<span>${unsafeWrite ? 'Güvenlik uyarısı: sonuç otomatik veri değişikliği için uygun değil.' : 'Sonuç yalnızca kullanıcı onaylı önizleme olarak tutuluyor.'}</span></div>
    <p><b>Özet:</b> ${escapeHtml(result.summary || '-')}</p>
    ${renderList('Öneriler', result.recommendations.map((item) => `${item.title}: ${item.detail} (${confidenceLabel(item.confidence)})`))}
    ${renderList('Uyarılar', result.warnings.map((item) => `${item.severity}: ${item.message}`))}
    ${renderList('Kullanıcı soruları', result.userQuestions.map((item) => `${item.required ? 'Zorunlu' : 'Opsiyonel'}: ${item.question}`))}
    ${renderList('Gerekçe', result.rationale.map((item) => `${item.code}: ${item.message}`))}
    ${renderList('Kaynaklar', result.sources.map((item) => `${item.kind}: ${item.label}`))}
  </div>`;
}

function renderList(title: string, items: string[]): string {
  if (items.length === 0) return '';
  return `<details class="ai-queue-detail-list">
    <summary>${escapeHtml(title)} (${items.length})</summary>
    <ul>${items.slice(0, 12).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </details>`;
}

function renderPreviewWrite(write: AiPreviewWrite): string {
  const payload = {
    target: write.target,
    operation: write.operation,
    fieldPath: write.fieldPath,
    before: write.before ?? null,
    after: write.after,
    reason: write.reason,
    requiresUserApproval: write.requiresUserApproval
  };
  return `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
}

function renderProgress(progress: AiTaskProgress): string {
  const percent = progressPercent(progress);
  return `<div class="ai-queue-progress-block">
    <div><b>${percent}%</b><span>${escapeHtml(shortProgressMessage(progress))}</span></div>
    <span class="ai-queue-progress"><span style="width:${percent}%"></span></span>
  </div>`;
}

function sortAiQueueTasks(tasks: AiQueuedTask[]): AiQueuedTask[] {
  return [...tasks].sort((a, b) => taskGroupRank(a.status) - taskGroupRank(b.status) || taskTimestamp(b) - taskTimestamp(a));
}

function taskGroupRank(status: AiQueueTaskStatus): number {
  if (ACTIVE_STATUSES.has(status)) return 0;
  if (ATTENTION_STATUSES.has(status)) return 1;
  return 2;
}

function taskTimestamp(task: AiQueuedTask): number {
  const value = task.startedAt ?? task.createdAt ?? task.finishedAt ?? task.canceledAt ?? '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function progressPercent(progress: AiTaskProgress): number {
  const value = Number(progress.percent);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shortProgressMessage(progress: AiTaskProgress): string {
  const message = (progress.message || progress.phase || '-').trim();
  return message.length > 90 ? `${message.slice(0, 87)}...` : message;
}

function statusLabel(status: AiQueueTaskStatus): string {
  switch (status) {
    case 'queued': return 'Sırada';
    case 'running': return 'Çalışıyor';
    case 'succeeded': return 'Tamamlandı';
    case 'needs_user_input': return 'Kullanıcı onayı/soru gerekli';
    case 'failed': return 'Hata';
    case 'canceled': return 'İptal edildi';
    case 'timed_out': return 'Zaman aşımı';
  }
}

function statusClass(status: AiQueueTaskStatus): string {
  if (status === 'succeeded') return 'ok';
  if (status === 'running') return 'ok';
  if (status === 'failed' || status === 'timed_out') return 'error';
  if (status === 'canceled' || status === 'needs_user_input' || status === 'queued') return 'warning';
  return '';
}

function eventSeverityClass(severity: AiQueueHistoryEvent['severity']): string {
  if (severity === 'success') return 'success';
  if (severity === 'warning') return 'warning';
  if (severity === 'error') return 'error';
  return 'info';
}

function eventSeverityLabel(severity: AiQueueHistoryEvent['severity']): string {
  switch (severity) {
    case 'success': return 'Basarili';
    case 'warning': return 'Dikkat';
    case 'error': return 'Hata';
    case 'info': return 'Bilgi';
  }
}

function eventTypeLabel(type: AiQueueHistoryEvent['type']): string {
  switch (type) {
    case 'task_queued': return 'Siraya alindi';
    case 'task_started': return 'Basladi';
    case 'task_progress': return 'Ilerleme';
    case 'task_succeeded': return 'Tamamlandi';
    case 'task_needs_user_input': return 'Onay bekliyor';
    case 'task_failed': return 'Hata aldi';
    case 'task_canceled': return 'Iptal edildi';
    case 'task_timed_out': return 'Zaman asimi';
    case 'queue_drained': return 'Kuyruk bosaldi';
  }
}

function confidenceLabel(confidence?: string): string {
  if (confidence === 'high') return 'Yüksek';
  if (confidence === 'medium') return 'Orta';
  if (confidence === 'low') return 'Düşük';
  return '-';
}
