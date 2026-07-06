/**
 * v0.6.x — Değer Kaybı Ek Bilgi Formu (v2) kaydetme öncesi ÖNİZLEME/diff bileşeni.
 *
 * Diff render anında saf modüllerle hesaplanır (kayıtlı veri ↔ formdaki aday). Kaydet butonu
 * yalnız değişiklik varsa aktiftir; asıl kayıt onay modalı + güvenli mutate ile main.ts'te yapılır.
 */
import type { UiState } from '../state';
import { selectedCase } from '../state';
import { escapeHtml } from '../validation';
import { normalizeValueLossContext } from '../../../shared/value-loss/value-loss-context-normalizer';
import { diffValueLossContext, VALUE_LOSS_SAVE_SCOPE_NOTE } from '../../../shared/value-loss/value-loss-context-diff';
import { valueLossFormToInput, preservedSnapshotFields } from '../utils/value-loss-form-mapping';

/** Önizleme + Kaydet alanını döner (form paneli içinde kullanılır). */
export function renderValueLossContextPreview(state: UiState): string {
  const item = selectedCase();
  if (!item) return '<p class="muted">Kaydetmek için önce bir dosya seçin.</p>';
  const saved = item.tracking?.aiHelperContext?.valueLoss ?? null;
  // v5/v6: normal kayıt mevcut özeti VE geçmişi KORUR (yalnız kendi onaylı aksiyonlarıyla değişirler).
  const candidate = normalizeValueLossContext({
    ...valueLossFormToInput(state.aiHelpers.vlForm, state.aiHelpers.vlParts),
    ...preservedSnapshotFields(saved)
  });
  const rows = diffValueLossContext(saved, candidate);
  const hasChanges = rows.length > 0;
  const saving = state.aiHelpers.valueLoss.saving;
  const previewOpen = state.aiHelpers.valueLoss.previewOpen;

  const diffBlock = previewOpen
    ? `<div class="vl-diff">
        <b>Önizleme — değişecek alanlar (${rows.length})</b>
        ${hasChanges
          ? `<ul class="vl-diff-list">${rows.map((r) => `<li><span class="vl-diff-label">${escapeHtml(r.label)}:</span> <span class="vl-diff-old">${escapeHtml(r.oldLabel)}</span> → <span class="vl-diff-new">${escapeHtml(r.newLabel)}</span></li>`).join('')}</ul>`
          : '<p class="muted">Kayıtlı veriyle form aynı; kaydedilecek değişiklik yok.</p>'}
        <p class="muted vl-scope-note">${escapeHtml(VALUE_LOSS_SAVE_SCOPE_NOTE)}</p>
      </div>`
    : '';

  return `<div class="vl-preview-area">
    <div class="vl-draft-actions">
      <button class="secondary compact ${previewOpen ? 'active' : ''}" data-action="aih-vl-preview">${previewOpen ? 'Önizlemeyi Kapat' : 'Önizleme'}</button>
      <button class="primary compact" data-action="aih-vl-save" ${!hasChanges || saving ? 'disabled' : ''} title="Kaydetmeden önce onay istenir">${saving ? 'Kaydediliyor…' : 'Değer Kaybı Bilgilerini Kaydet'}</button>
      <button class="secondary compact" data-action="aih-vl-form-reset">Dosyadan Yeniden Doldur</button>
    </div>
    ${!hasChanges ? '<p class="muted">Değişiklik yok; Kaydet pasif.</p>' : ''}
    ${diffBlock}
  </div>`;
}
