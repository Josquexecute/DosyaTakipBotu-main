/**
 * v0.6.x — AI İşçilik v3.12: Genel yedekten (listeden seçili) hedef Excel'i geri yükler (yalnız hedef Excel değişir).
 * Restore öncesi mevcut dosya AYRICA yedeklenir; sonra seçili yedek hedefin üzerine güvenli şekilde geri yüklenir.
 * Kullanıcı açık onayı ŞART (renderer confirmDialog). H-N/D özel yazma YOK; takip.json'a dokunmaz; ağ/Google YOK.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateAiModeBackupRestore } from '../../shared/labor/ai-mode-part-code-backup-restore-validator';
import { describeExcelWriteError, isExcelLockError } from './excel-lock-error-normalizer';
import { AiModePartCodeHistoryStoreFile } from '../local-cache/ai-mode-part-code-history-store-file';
import type { RestoreAiModeBackupArg, RestoreAiModeBackupResult } from '../../shared/labor/ai-mode-part-code-backup-restore-types';
import type { IpcDomainContext } from './ipc-domain-services';

export class AiModePartCodeBackupRestoreService {
  constructor(private readonly context: IpcDomainContext) {}

  /** Seçili yedek dosyasını hedef Excel'in üzerine geri yükler; restore öncesi mevcut dosyayı ayrıca yedekler. */
  async restoreFromBackup(args: RestoreAiModeBackupArg): Promise<RestoreAiModeBackupResult> {
    const filePath = path.resolve(String(args?.filePath || ''));
    const backupPath = path.resolve(String(args?.backupPath || ''));
    const backupKind = args?.backupKind === 'before_restore' ? 'before_restore' : 'before_d_code_apply';

    if (!this.context.state.approvedExcelFiles.has(filePath)) {
      throw new Error('Excel dosyası önce uygulama içinden (AI önizleme ile) seçilmelidir.');
    }
    const validation = validateAiModeBackupRestore({
      filePath, backupPath,
      targetFileName: path.basename(filePath),
      backupFileName: path.basename(backupPath),
      isSameAsTarget: filePath === backupPath,
      isSameDirectory: path.dirname(filePath) === path.dirname(backupPath)
    });
    if (!validation.ok) throw new Error(`Geri yükleme durduruldu: ${validation.blocking.join(' ')}`);
    if (!(await this.fileExists(filePath))) throw new Error('Hedef Excel dosyası bulunamadı veya erişilemiyor.');

    let backupSizeBytes: number;
    try {
      backupSizeBytes = (await fs.stat(backupPath)).size;
    } catch {
      throw new Error('Yedek dosya bulunamadı/okunamadı; geri yükleme yapılamaz.');
    }
    if (backupSizeBytes === 0) throw new Error('Yedek dosya boş (0 bayt); geri yükleme yapılmadı.');

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const stamp = Date.now();

    // Restore ÖNCESİ mevcut dosyanın ayrı yedeği (alınamazsa restore yok).
    const preRestoreBackupPath = path.join(dir, `${base}.manuel-restore-oncesi-${stamp}${ext}`);
    try {
      await fs.copyFile(filePath, preRestoreBackupPath);
    } catch (error) {
      throw new Error(`Restore öncesi yedek alınamadığı için geri yükleme yapılmadı. ${describeExcelWriteError(error).debugMessage}`);
    }

    // Yedeği geçici dosyaya kopyala, sonra hedefin üzerine güvenli rename.
    const tmpOut = path.join(dir, `.${base}.backup-restore-${stamp}.tmp${ext}`);
    try {
      await fs.copyFile(backupPath, tmpOut);
      try {
        await fs.rename(tmpOut, filePath);
      } catch (firstErr) {
        if (isExcelLockError(firstErr)) {
          await fs.rm(filePath, { force: true });
          await fs.rename(tmpOut, filePath);
        } else {
          throw firstErr;
        }
      }
    } catch (error) {
      await fs.rm(tmpOut, { force: true }).catch(() => undefined);
      const normalized = describeExcelWriteError(error);
      const failed: RestoreAiModeBackupResult = {
        ok: false, filePath, restoredFromBackupPath: backupPath, preRestoreBackupPath, backupKind,
        warnings: [normalized.message], message: `Yedekten geri yükleme başarısız oldu. ${normalized.message}`, debugMessage: normalized.debugMessage
      };
      await this.recordHistory(failed);
      return failed;
    }

    // Restore SONRASI doğrulama: hedef var mı + boyut yedekle eşleşiyor mu (yalnız stat; hücre yazmaz).
    const warnings: string[] = [];
    let verifiedAfterRestore: RestoreAiModeBackupResult['verifiedAfterRestore'];
    try {
      const stat = await fs.stat(filePath);
      const sizeMatchesBackup = stat.size === backupSizeBytes;
      verifiedAfterRestore = {
        fileExists: true, sizeBytes: stat.size, backupSizeBytes, sizeMatchesBackup,
        message: sizeMatchesBackup ? 'Hedef dosya oluşturuldu ve boyut yedekle eşleşiyor.' : 'Hedef dosya oluşturuldu ancak boyut yedekle eşleşmedi; dosya kontrol edilmeli.'
      };
      if (!sizeMatchesBackup) warnings.push('Restore sonrası hedef dosya boyutu yedekle eşleşmedi; dosya kontrol edilmeli.');
    } catch {
      warnings.push('Geri yükleme yapıldı ancak hedef dosya doğrulanamadı (dosya kilitli olabilir). Excel dosyasını kapatıp kontrol edin.');
    }

    const result: RestoreAiModeBackupResult = {
      ok: true, filePath, restoredFromBackupPath: backupPath, preRestoreBackupPath, backupKind, warnings,
      message: `Yedekten geri yükleme tamamlandı. Hedef dosya seçili yedekten geri yüklendi; restore öncesi mevcut dosya ayrıca yedeklendi. İşçilik (H-N)/D için özel yazma yapılmadı.`
    };
    if (verifiedAfterRestore) result.verifiedAfterRestore = verifiedAfterRestore;
    await this.recordHistory(result);
    return result;
  }

  /** v3.12: yalnız RAPOR amaçlı geçmiş kaydı (best-effort; başarısızsa restore sonucu bozulmaz). Ham cevap taşınmaz. */
  private async recordHistory(result: RestoreAiModeBackupResult): Promise<void> {
    try {
      await new AiModePartCodeHistoryStoreFile(this.context.cache.cacheRoot).append({
        id: `hist-backup-restore-${Date.now()}`, type: 'restore_backup', createdAt: new Date().toISOString(),
        filePath: result.filePath, column: 'D',
        restoredFromBackupPath: result.restoredFromBackupPath,
        ...(result.preRestoreBackupPath ? { preRestoreBackupPath: result.preRestoreBackupPath } : {}),
        ok: result.ok, message: result.message, warnings: result.warnings
      });
    } catch { /* geçmiş yalnız rapor amaçlıdır; sessiz geçilir */ }
  }

  private async fileExists(p: string): Promise<boolean> {
    try { await fs.stat(p); return true; } catch { return false; }
  }
}
