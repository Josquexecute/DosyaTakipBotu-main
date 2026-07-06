/**
 * v0.6.x — AI İşçilik v3.5: "Google AI Mode Parça Araştırma Köprüsü" paneli (MANUEL; ağ/scraping YOK).
 * Program yalnız prompt üretir; kullanıcı Google AI Mode'a kendi yapıştırır, cevabı geri yapıştırır.
 * Otomatik Google isteği YOK, Excel'e/D sütununa yazma YOK.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import { renderAiModeCandidates } from './ai-mode-part-search-candidates';
import { renderAiModePartCandidateStoreManager } from './ai-mode-part-candidate-store-manager';
import { renderAiModeApplyResult } from './ai-mode-part-code-apply-modal';
import { renderAiModeRestore } from './ai-mode-part-code-restore-panel';
import { renderAiModeBackupManager } from './ai-mode-part-code-backup-manager';
import { renderAiModeHistoryPanel } from './ai-mode-part-code-history-panel';

function rowOptions(state: UiState): string {
  const rows = state.autoLaborPreview?.rows ?? [];
  const selected = state.aiModePartSearch.selectedRowNumber;
  const opts = rows.map((r) => `<option value="${r.rowNumber}" ${r.rowNumber === selected ? 'selected' : ''}>Satır ${r.rowNumber} • ${escapeHtml(r.partName)} • kod: ${escapeHtml(r.partCode || 'boş')}</option>`).join('');
  return `<option value="">— Satır seçin —</option>${opts}`;
}

/** AI İşçilik ekranına eklenen AI Mode köprü panelini döner (önizleme yoksa boş string). */
export function renderAiModePartSearchPanel(state: UiState): string {
  const preview = state.autoLaborPreview;
  if (!preview) return '';
  const s = state.aiModePartSearch;
  const mode = s.mode;
  return `<section class="info-card wide ai-mode-panel">
    <h3>Google AI Mode Parça Araştırma Köprüsü
      <button class="info-button" title="Program OTOMATİK Google araması yapmaz. Sadece seçili satır için araştırma promptu hazırlar. Promptu Google Search AI Mode'a SİZ yapıştırırsınız; cevabı geri yapıştırınca program parça kodu adaylarını çıkarır. Hiçbir veri otomatik gönderilmez; hiçbir kod onayınız olmadan Excel'e yazılmaz.">i</button>
    </h3>
    <div class="ai-mode-row-pick">
      <label>Satır: <select data-aimode-row>${rowOptions(state)}</select></label>
      <span class="ai-mode-mode-toggle">Veri modu:
        <button class="secondary compact ${mode === 'masked' ? 'active' : ''}" data-action="aimode-mode" data-aimode-mode="masked">Maskeli (varsayılan)</button>
        <button class="secondary compact ${mode === 'full' ? 'active' : ''}" data-action="aimode-mode" data-aimode-mode="full">Tam veri</button>
      </span>
    </div>
    <div class="ai-mode-actions-bar">
      <button class="primary" data-action="aimode-generate">AI Mode Sorgusu Hazırla</button>
      <button class="secondary" data-action="aimode-bulk-empty">Parça Kodu Boş Satırlar İçin Sorgu Hazırla</button>
      ${s.generatedPrompt ? `<button class="secondary compact" data-action="aimode-copy">Promptu Kopyala</button>` : ''}
      ${s.generatedPrompt || s.candidates.length ? `<button class="secondary compact" data-action="aimode-clear">Temizle</button>` : ''}
    </div>
    <div class="ai-mode-privacy">Bu metni Google AI Mode'a yapıştırırsanız araç/dosya bilgileri Google'a MANUEL gönderilmiş olur. Program otomatik gönderim yapmaz. Maskeli mod tam şasi/motor/plaka göndermez.</div>
    ${s.message ? `<div class="app-alert info"><span>${escapeHtml(s.message)}</span></div>` : ''}
    ${s.generatedPrompt ? `<textarea class="ai-mode-prompt" rows="10" readonly aria-label="Üretilen AI Mode promptu">${escapeHtml(s.generatedPrompt)}</textarea>` : ''}
    <label class="ai-mode-response-label">AI Mode cevabını buraya yapıştırın:
      <textarea class="ai-mode-response" rows="6" data-aimode-response placeholder="Google AI Mode cevabını buraya yapıştırın…">${escapeHtml(s.pastedResponse)}</textarea>
    </label>
    <div class="ai-mode-actions-bar">
      <button class="primary" data-action="aimode-parse">Cevabı Ayrıştır</button>
    </div>
    ${renderAiModeCandidates(state)}
    ${renderAiModeApplyResult(state)}
    ${renderAiModeRestore(state)}
    ${renderAiModeBackupManager(state)}
    ${renderAiModeHistoryPanel(state)}
    ${renderAiModePartCandidateStoreManager(state)}
  </section>`;
}
