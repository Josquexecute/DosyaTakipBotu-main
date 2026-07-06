/**
 * v0.6.x — AI İşçilik v3.2: "Eksper Onaylı İşçilikten Öğren" paneli (kontrollü, preview-first).
 * Eksper Bey'in bitmiş işçilik Excel'i yerel olarak öğretilir; yalnız kullanıcı onayıyla store'a yazılır.
 * Excel'e/dosyaya YAZMA YOK; mevcut AI İşçilik preview/apply gate'i bu panelden etkilenmez.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import { renderExpertLearningPreviewTable } from './expert-learning-preview-table';
import { renderExpertLearningStoreManager } from './expert-learning-store-manager';

/** AI İşçilik ekranına eklenen eksper öğrenme bölümünü döner. */
export function renderExpertLearningPanel(state: UiState): string {
  const el = state.expertLearning;
  const preview = el.preview;
  const selectedCount = el.selectedIds.length;
  const busyAttr = el.busy ? 'disabled' : '';

  return `<section class="info-card wide expert-learning-panel">
    <h3>Eksper Onaylı İşçilikten Öğren
      <button class="info-button" title="Eksper Bey'in bitmiş/onaylı işçilik Excel'inden YEREL öğrenme örnekleri çıkarılır. Hiçbir kayıt onayınız olmadan kaydedilmez; Excel'e yazılmaz. Öğrenilen kayıtlar sonraki AI önizlemelerinde yalnız kanıt/eşleşme/fark olarak kullanılır.">i</button>
    </h3>
    <p class="expert-learning-intro">Tamamlanmış bir işçilik dağıtımı dosyasını seçin; program satır satır öğrenilebilir örnekleri çıkarır. Güvenli satırlar otomatik seçilir, diğerlerini tek tek onaylarsınız.</p>
    <div class="expert-learning-actions-bar">
      <button class="primary" data-action="expert-learning-preview" ${busyAttr}>${el.busy ? 'Analiz ediliyor…' : 'Eksper Dosyası Seç ve Analiz Et'}</button>
      ${preview && preview.items.length ? `<button class="secondary" data-action="expert-learning-select-safe" ${busyAttr}>Tüm Güvenli Satırları Seç</button>` : ''}
      ${preview && selectedCount ? `<button class="primary" data-action="expert-learning-approve" ${busyAttr}>Seçili Satırları Onayla ve Öğren (${selectedCount})</button>` : ''}
      ${preview ? `<button class="secondary compact" data-action="expert-learning-clear" ${busyAttr}>Temizle</button>` : ''}
    </div>
    ${el.error ? `<div class="app-alert error"><span>${escapeHtml(el.error)}</span></div>` : ''}
    ${el.message ? `<div class="app-alert info"><span>${escapeHtml(el.message)}</span></div>` : ''}
    ${preview ? `<div class="expert-learning-file">Kaynak: <b>${escapeHtml(preview.fileName)}</b></div>` : ''}
    ${renderExpertLearningPreviewTable(state)}
    ${renderExpertLearningStoreManager(state)}
  </section>`;
}
