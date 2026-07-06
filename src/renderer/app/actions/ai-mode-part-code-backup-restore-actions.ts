/**
 * v0.6.x — AI İşçilik v3.12: Genel yedekten geri yükleme aksiyon yardımcıları (SAF state + onay metni).
 * IPC/confirmDialog/render caller'a (main.ts) aittir. Yalnız hedef Excel değişir; son-undo restore akışından AYRI.
 */
import { state } from '../state';
import type { AiModeBackupFileInfo } from '../../../shared/labor/ai-mode-part-code-backup-types';
import type { RestoreAiModeBackupResult } from '../../../shared/labor/ai-mode-part-code-backup-restore-types';

const KIND_LABEL: Record<string, string> = {
  before_d_code_apply: 'D yazımı öncesi yedek', before_restore: 'Restore öncesi yedek', unknown: 'bilinmeyen'
};

/** Seçili yedeği path'ten bulur (listeden). */
export function findBackupByPath(backupPath: string): AiModeBackupFileInfo | undefined {
  return state.aiModePartSearch.backupList?.backups.find((b) => b.filePath === backupPath);
}

/** Genel yedekten geri yükleme onay metni (çok satırlı). */
export function buildBackupRestoreConfirmMessage(backup: AiModeBackupFileInfo): string {
  return [
    'Bu işlem, seçili yedek dosyayı hedef Excel dosyasının üzerine geri yükleyecektir.',
    '',
    `Hedef dosya: ${backup.originalExcelPath}`,
    `Seçili yedek: ${backup.filePath}`,
    `Yedek türü: ${KIND_LABEL[backup.backupKind] ?? backup.backupKind}`,
    `Yedek tarihi: ${(backup.createdAt || '').slice(0, 19).replace('T', ' ') || 'bilinmiyor'}`,
    `Yedek boyutu: ${typeof backup.sizeBytes === 'number' ? `${backup.sizeBytes} bayt` : 'bilinmiyor'}`,
    '',
    'Restore öncesinde mevcut dosyanın ayrıca yedeği alınacaktır. Bu işlem mevcut Excel dosyasını yedekteki sürümle değiştirir.',
    'İşçilik (H-N) için özel yazma yapılmayacaktır. İşlem sonrası yeniden analiz önerilir.',
    'İşlem yalnızca açık onayınızla yapılır. Devam edilsin mi?'
  ].join('\n');
}

export function applyBackupRestoreResult(result: RestoreAiModeBackupResult): void {
  state.aiModePartSearch.backupRestoreResult = result;
}
