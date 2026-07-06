/**
 * v0.6.x — AI İşçilik v3.10: "Son D Kodu Yazımını Geri Al" butonu + onay metni + restore sonuç raporu (renderer).
 * Buton yalnız son işlem geri alınabilir (undo.available + backup/dosya/satır) durumunda görünür. Toplu restore YOK.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';

/** Undo bilgisinden çok satırlı onay metni üretir. */
export function buildRestoreConfirmMessage(state: UiState): string {
  const u = state.aiModePartSearch.lastApplyUndo;
  return [
    'Bu işlem, son D sütunu parça kodu yazımını geri almak için yedek dosyadan geri yükleme yapacaktır.',
    '',
    `Hedef dosya: ${u?.filePath ?? '-'}`,
    `Geri yüklenecek yedek: ${u?.backupPath ?? '-'}`,
    `Satır: ${u?.rowNumber ?? '-'}`,
    `Beklenen eski kod: ${u?.oldPartCode || 'boş'}`,
    `Mevcut son yazılan kod: ${u?.newPartCode ?? '-'}`,
    '',
    'Restore öncesinde mevcut dosyanın ayrıca yedeği alınacaktır.',
    'İşlem yalnızca açık onayınızla yapılır. Devam edilsin mi?'
  ].join('\n');
}

function renderRestoreResult(state: UiState): string {
  const r = state.aiModePartSearch.restoreResult;
  if (!r) return '';
  if (!r.ok) {
    return `<div class="ai-mode-restore-result ai-mode-restore-failed">
      <b>Geri alma başarısız oldu.</b>
      <div class="ai-mode-cand-warn">${escapeHtml(r.message)}</div>
    </div>`;
  }
  const verify = r.matchesExpectedCode
    ? `<div class="ai-mode-verify-ok">D sütunu beklenen eski koda döndü: ${escapeHtml(r.currentPartCodeAfterRestore || 'boş')}.</div>`
    : `<div class="ai-mode-cand-warn">Restore tamamlandı ancak D sütunu beklenen eski kodla eşleşmedi; dosya manuel kontrol edilmeli.</div>`;
  return `<div class="ai-mode-restore-result">
    <b>Son D kodu yazımı geri alındı</b>
    <div>Satır ${r.rowNumber} ${escapeHtml(r.column)} sütunu tekrar eski koda döndü: ${escapeHtml(r.currentPartCodeAfterRestore || 'boş')}</div>
    ${verify}
    <div class="ai-mode-store-meta">Kullanılan yedek: <code>${escapeHtml(r.restoredFromBackupPath)}</code></div>
    ${r.preRestoreBackupPath ? `<div class="ai-mode-store-meta">Restore öncesi mevcut dosya ayrıca yedeklendi: <code>${escapeHtml(r.preRestoreBackupPath)}</code></div>` : ''}
    <div class="ai-mode-store-meta">İşçilik (H-N) kolonlarına özel yazma yapılmadı.</div>
  </div>`;
}

/** Geri alma butonu (uygunsa) + restore sonucunu döner. */
export function renderAiModeRestore(state: UiState): string {
  const u = state.aiModePartSearch.lastApplyUndo;
  const canRestore = Boolean(u?.available && u.backupPath && u.filePath && Number.isInteger(u.rowNumber));
  const button = canRestore
    ? `<div class="ai-mode-restore"><button class="secondary compact warning" data-action="aimode-restore-last">Son D Kodu Yazımını Geri Al</button></div>`
    : '';
  return `${button}${renderRestoreResult(state)}`;
}
