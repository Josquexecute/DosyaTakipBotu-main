import { escapeHtml } from '../validation';
import type { AiDraftTaskResult } from '../../../shared/ai/ai-task-result-types';
import { aiDraftTaskLabel } from '../../../shared/ai/ai-orchestrator-types';

// v0.6.x: AI Taslak oturum geçmişi (son 5). YALNIZ UI state; dosyaya/local-cache'e yazılmaz.

const CONF_LABEL: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

export function renderAiTaskHistory(history: readonly AiDraftTaskResult[], activeId: string | undefined): string {
  if (!history.length) return '';
  return `<div class="aih-task-block">
    <h5>Oturum geçmişi (son ${history.length})</h5>
    <p class="muted">Yalnız bu oturumda tutulur; uygulama kapanınca silinir, dosyaya yazılmaz.</p>
    <div class="aih-history">
      ${history.map((r) => `<button class="aih-history-row ${activeId === r.taskId ? 'active' : ''}" data-action="aih-task-history" data-task-id="${escapeHtml(r.taskId)}">
        <span class="aih-history-title"><b>${escapeHtml(aiDraftTaskLabel(r.taskType))}</b><small>${escapeHtml(r.summary)}</small></span>
        <span class="aih-history-meta"><span class="aih-conf aih-conf-${r.confidence === 'high' ? 'yuksek' : r.confidence === 'medium' ? 'orta' : 'dusuk'}">${escapeHtml(CONF_LABEL[r.confidence] ?? r.confidence)}</span><small>${escapeHtml(new Date(r.createdAt).toLocaleTimeString('tr-TR'))}</small></span>
      </button>`).join('')}
    </div>
  </div>`;
}
