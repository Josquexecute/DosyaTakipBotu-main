import type { UiState } from '../state';
import { selectedCase } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { AI_DRAFT_TASKS } from '../../../shared/ai/ai-orchestrator-types';
import { maskSensitiveText } from '../../../shared/ai/ai-privacy-masker';
import { buildEffectiveAiContext } from '../utils/ai-extra-context-mapping';
import { renderAiTaskResultCard } from './ai-task-result-card';
import { renderAiTaskHistory } from './ai-task-history';

// v0.6.x: "AI Taslak Üretici" — seçili dosya + mevzuat + ek bilgilerle YEREL kural motoruyla taslak üretir.
// Harici AI kullanılmaz; üretilen metinler dosyaya otomatik yazılmaz (yalnız önizleme/kopyalama).

export function renderAiTaskGenerator(state: UiState): string {
  const t = state.aiHelpers.task;
  const ctx = buildEffectiveAiContext(selectedCase(), state.aiHelpers.extra);
  // Gizlilik önizlemesi: harici gönderim YOK; yine de maskelenmiş örnek gösterilir.
  const sample = `${ctx?.plate ?? ''} ${ctx?.insurer ?? ''} ${t.userInstruction}`.trim() || 'Örnek metin (dosya seçili değil).';
  const masked = maskSensitiveText(sample);

  return `<div class="aih-task-card">
    <div class="aih-task-headline">${icon('ai')}<b>AI Taslak Üretici</b></div>
    <p class="settings-help">Bu alan seçili dosya, mevzuat bilgi bankası ve dosya ek bilgilerine göre yerel kural motoruyla taslak üretir. Harici AI kullanılmaz. Üretilen metinler dosyaya otomatik yazılmaz.</p>
    <div class="aih-form">
      <label class="aih-field"><span>Görev tipi</span>
        <select data-aih="task.taskType">
          ${AI_DRAFT_TASKS.map((task) => `<option value="${task.type}" ${t.taskType === task.type ? 'selected' : ''}>${escapeHtml(task.label)}</option>`).join('')}
        </select>
      </label>
      <label class="aih-field aih-field-wide"><span>Kullanıcı ek talimatı (opsiyonel)</span>
        <textarea data-aih="task.userInstruction" rows="2" placeholder="Örn. servise kısa ve resmî bir ton kullan">${escapeHtml(t.userInstruction)}</textarea></label>
    </div>
    <div class="aih-task-actions">
      <button class="primary" data-action="aih-task-run">${icon('ai')}<span>Taslak üret</span></button>
      <button class="secondary compact" data-action="aih-task-clear">Temizle</button>
    </div>
    <details class="aih-privacy-preview">
      <summary>Gizlilik önizlemesi (maskeli)</summary>
      <p class="muted">Online sağlayıcı kapalıdır, veri gönderilmez. İleride harici AI açılırsa hassas alanlar şöyle maskelenir:</p>
      <pre class="aih-mask-sample">${escapeHtml(masked)}</pre>
    </details>
    ${renderAiTaskResultCard(t.result, t.copyError)}
    ${renderAiTaskHistory(t.history, t.result?.taskId)}
  </div>`;
}
