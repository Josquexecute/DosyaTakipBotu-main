/**
 * v0.6.x — AI İşçilik v3.11: "D Kodu Yedekleri" yönetim paneli (listele + yol kopyala + TEK yedek sil).
 * Tek tek yedek silme + tek yedekten geri yükleme (v3.12). Ana Excel/takip.json/klasör asla silinmez; çoklu/otomatik işlem yok.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import type { AiModeBackupFileInfo } from '../../../shared/labor/ai-mode-part-code-backup-types';

function renderRestoreResult(state: UiState): string {
  const r = state.aiModePartSearch.backupRestoreResult;
  if (!r) return '';
  if (!r.ok) {
    return `<div class="ai-mode-restore-result ai-mode-restore-failed"><b>Yedekten geri yükleme başarısız oldu.</b><div class="ai-mode-cand-warn">${escapeHtml(r.message)}</div></div>`;
  }
  const verify = r.verifiedAfterRestore
    ? `<div class="${r.verifiedAfterRestore.sizeMatchesBackup ? 'ai-mode-verify-ok' : 'ai-mode-cand-warn'}">Doğrulama: ${escapeHtml(r.verifiedAfterRestore.message)}</div>`
    : '';
  return `<div class="ai-mode-restore-result">
    <b>Yedekten geri yükleme tamamlandı</b>
    <div class="ai-mode-store-meta">Hedef dosya: <code>${escapeHtml(r.filePath)}</code></div>
    <div class="ai-mode-store-meta">Kullanılan yedek: <code>${escapeHtml(r.restoredFromBackupPath)}</code></div>
    ${r.preRestoreBackupPath ? `<div class="ai-mode-store-meta">Restore öncesi mevcut dosya ayrıca yedeklendi: <code>${escapeHtml(r.preRestoreBackupPath)}</code></div>` : ''}
    ${verify}
    <div class="ai-mode-store-meta">Yeniden analiz etmeniz önerilir.</div>
  </div>`;
}

const KIND_TR: Record<string, string> = {
  before_d_code_apply: 'D yazımı öncesi', before_restore: 'Restore öncesi', unknown: 'bilinmiyor'
};

function formatSize(n?: number): string {
  if (typeof n !== 'number') return '—';
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(0)} KB`;
}

function renderBackup(state: UiState, b: AiModeBackupFileInfo): string {
  const warn = b.warnings.length ? `<div class="ai-mode-cand-warn">⚠ ${escapeHtml(b.warnings.join(' '))}</div>` : '';
  return `<li class="ai-mode-backup-entry">
    <div><b>${escapeHtml(KIND_TR[b.backupKind] ?? b.backupKind)}</b> <span class="ai-mode-store-meta">${escapeHtml(b.fileName)}</span></div>
    <div class="ai-mode-store-meta">Boyut: ${escapeHtml(formatSize(b.sizeBytes))} • Tarih: ${escapeHtml((b.createdAt || '').slice(0, 19).replace('T', ' ') || '—')}${b.isLikelyForCurrentExcel ? ' • bu dosyaya ait' : ''}</div>
    ${warn}
    <div class="ai-mode-store-actions">
      ${b.isLikelyForCurrentExcel ? `<button class="secondary compact warning" data-action="aimode-backup-restore" data-path="${escapeHtml(b.filePath)}">Bu Yedekten Geri Yükle</button>` : ''}
      <button class="secondary compact" data-action="aimode-copy-path" data-path="${escapeHtml(b.filePath)}">Yolu Kopyala</button>
      <button class="secondary compact danger" data-action="aimode-backup-delete" data-path="${escapeHtml(b.filePath)}">Sil</button>
    </div>
  </li>`;
}

/** Yedek yönetim bölümünü döner (önizleme yoksa boş). */
export function renderAiModeBackupManager(state: UiState): string {
  const preview = state.autoLaborPreview;
  if (!preview) return '';
  const list = state.aiModePartSearch.backupList;
  if (!list) {
    return `<div class="ai-mode-backup"><button class="secondary compact" data-action="aimode-backups-list">D Kodu Yedeklerini Göster</button></div>`;
  }
  return `<div class="ai-mode-backup">
    <div class="ai-mode-store-summary"><b>D Kodu Yedekleri</b><span>${list.backups.length} yedek</span><button class="secondary compact" data-action="aimode-backups-list">Yenile</button></div>
    ${list.warnings.length ? `<div class="ai-mode-cand-warn">${list.warnings.map((w) => escapeHtml(w)).join(' ')}</div>` : ''}
    ${list.backups.length === 0 ? '<p class="ai-mode-store-empty">Bu Excel dosyası için yedek bulunamadı.</p>' : `<ul class="ai-mode-backup-list">${list.backups.map((b) => renderBackup(state, b)).join('')}</ul>`}
    ${renderRestoreResult(state)}
  </div>`;
}
