/**
 * v0.6.x — AI İşçilik v3.11: "Son D Kodu İşlem Geçmişi" paneli (yalnız gösterim; rapor amaçlı).
 * Geçmiş takip.json değildir; Excel'e yazma/silme içermez. Ham Google AI Mode cevabı geçmişte tutulmaz.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import type { AiModePartCodeHistoryEntry } from '../../../shared/labor/ai-mode-part-code-history-types';

const TYPE_TR: Record<string, string> = { apply_d_code: 'D kodu yazma', restore_d_code: 'Geri alma (son işlem)', restore_backup: 'Yedekten geri yükleme' };

function fileName(p: string): string {
  return p.replace(/^.*[\\/]/, '');
}

function renderEntry(e: AiModePartCodeHistoryEntry): string {
  const warn = e.warnings.length ? `<div class="ai-mode-cand-warn">⚠ ${escapeHtml(e.warnings.join(' '))}</div>` : '';
  const backup = e.backupPath || e.restoredFromBackupPath || e.preRestoreBackupPath;
  return `<li class="ai-mode-history-entry ${e.ok ? '' : 'ai-mode-restore-failed'}">
    <div><b>${escapeHtml(TYPE_TR[e.type] ?? e.type)}</b> <span class="ai-mode-store-meta">${escapeHtml((e.createdAt || '').slice(0, 19).replace('T', ' '))} • ${e.ok ? 'başarılı' : 'başarısız'}</span></div>
    <div class="ai-mode-store-meta">${escapeHtml(fileName(e.filePath))}${typeof e.rowNumber === 'number' ? ` • Satır ${e.rowNumber} ${escapeHtml(e.column ?? 'D')} • ${escapeHtml(e.oldPartCode || 'boş')} → ${escapeHtml(e.newPartCode || 'boş')}` : ' • dosya bazlı geri yükleme'}</div>
    ${backup ? `<div class="ai-mode-store-meta">Yedek: <code>${escapeHtml(backup)}</code> <button class="secondary compact" data-action="aimode-copy-path" data-path="${escapeHtml(backup)}">Yolu Kopyala</button></div>` : ''}
    ${warn}
  </li>`;
}

/** Son işlem geçmişi bölümünü döner. */
export function renderAiModeHistoryPanel(state: UiState): string {
  const preview = state.autoLaborPreview;
  if (!preview) return '';
  const history = state.aiModePartSearch.history;
  if (!history) {
    return `<div class="ai-mode-history"><button class="secondary compact" data-action="aimode-history-list">Son D Kodu İşlem Geçmişini Göster</button></div>`;
  }
  const recent = history.entries.slice(0, 15);
  return `<div class="ai-mode-history">
    <div class="ai-mode-store-summary"><b>Son D Kodu İşlem Geçmişi</b><span>${history.entries.length} kayıt</span><button class="secondary compact" data-action="aimode-history-list">Geçmişi Yenile</button></div>
    ${history.corrupt ? '<div class="ai-mode-cand-warn">Geçmiş dosyası bozuk olduğu için yok sayıldı.</div>' : ''}
    ${recent.length === 0 ? '<p class="ai-mode-store-empty">Henüz D kodu apply/restore işlemi yok.</p>' : `<ul class="ai-mode-history-list">${recent.map(renderEntry).join('')}</ul>`}
  </div>`;
}
