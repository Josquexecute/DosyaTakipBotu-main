/**
 * v0.6.x — AI İşçilik v3.10: Son D sütunu yazımını yedekten GERİ ALIR (yalnız restore edilen Excel değişir).
 * Restore öncesi mevcut dosya AYRICA yedeklenir; sonra yedek dosya hedefin üzerine güvenli şekilde geri yüklenir.
 * Kullanıcı açık onayı ŞART (renderer confirmDialog). H-N özel yazma YOK; takip.json'a dokunmaz; ağ/Google YOK.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadWorkbook } from '../import/excel-importer';
import { normalizePartCode } from '../../shared/labor/ai-mode-part-code-comparator';
import { validateAiModePartCodeRestore } from '../../shared/labor/ai-mode-part-code-restore-validator';
import { describeExcelWriteError, isExcelLockError } from './excel-lock-error-normalizer';
import { AiModePartCodeHistoryStoreFile } from '../local-cache/ai-mode-part-code-history-store-file';
import type { RestoreAiModePartCodeArg, RestoreAiModePartCodeResult } from '../../shared/labor/ai-mode-part-code-restore-types';
import type { IpcDomainContext } from './ipc-domain-services';

export class AiModePartCodeRestoreService {
  constructor(private readonly context: IpcDomainContext) {}

  /** Son D sütunu yazımını yedekten geri alır; restore öncesi mevcut dosyayı ayrıca yedekler. */
  async restoreLastApply(args: RestoreAiModePartCodeArg): Promise<RestoreAiModePartCodeResult> {
    const filePath = path.resolve(String(args?.filePath || ''));
    const backupPath = path.resolve(String(args?.backupPath || ''));
    const rowNumber = Number(args?.rowNumber);
    const column = String(args?.column || '').toUpperCase();

    if (!this.context.state.approvedExcelFiles.has(filePath)) {
      throw new Error('Excel dosyası önce uygulama içinden (AI önizleme ile) seçilmelidir.');
    }
    const validation = validateAiModePartCodeRestore({ filePath, backupPath, rowNumber, column });
    if (!validation.ok) throw new Error(`Geri alma durduruldu: ${validation.blocking.join(' ')}`);
    if (!(await this.fileExists(filePath))) throw new Error('Hedef Excel dosyası bulunamadı veya erişilemiyor.');
    if (!(await this.fileExists(backupPath))) throw new Error('Yedek dosya bulunamadı; geri alma yapılamaz.');

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const stamp = Date.now();

    // Restore ÖNCESİ mevcut dosyanın ayrı yedeği (alınamazsa restore yapılmaz).
    const preRestoreBackupPath = path.join(dir, `${base}.restore-oncesi-${stamp}${ext}`);
    try {
      await fs.copyFile(filePath, preRestoreBackupPath);
    } catch (error) {
      throw new Error(`Restore öncesi yedek alınamadığı için geri alma yapılmadı. ${describeExcelWriteError(error).debugMessage}`);
    }

    // Yedeği geçici dosyaya kopyala, sonra hedefin üzerine güvenli rename.
    const tmpOut = path.join(dir, `.${base}.restore-${stamp}.tmp${ext}`);
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
      const failed: RestoreAiModePartCodeResult = {
        ok: false, filePath, restoredFromBackupPath: backupPath, preRestoreBackupPath,
        rowNumber, column, matchesExpectedCode: false, warnings: [normalized.message],
        message: `Geri alma başarısız oldu. ${normalized.message}`, debugMessage: normalized.debugMessage
      };
      await this.recordHistory(failed, backupPath, preRestoreBackupPath, args.expectedOldPartCode);
      return failed;
    }

    // Restore SONRASI ilgili satırı yeniden oku ve eski koda dönmüş mü doğrula (yalnız OKUMA).
    const warnings: string[] = [];
    let currentPartCodeAfterRestore: string | undefined;
    let matchesExpectedCode = false;
    try {
      const reread = await loadWorkbook(filePath);
      currentPartCodeAfterRestore = reread.sheet.cells.find((c) => c.column === column && c.row === rowNumber)?.value ?? '';
      matchesExpectedCode = normalizePartCode(currentPartCodeAfterRestore) === normalizePartCode(args.expectedOldPartCode);
      if (!matchesExpectedCode) warnings.push('Restore tamamlandı ancak D sütunu beklenen eski kodla eşleşmedi; dosya manuel kontrol edilmeli.');
    } catch {
      warnings.push('Geri alma yapıldı ancak satır yeniden doğrulanamadı (dosya kilitli olabilir). Excel dosyasını kapatıp kontrol edin.');
    }

    const result: RestoreAiModePartCodeResult = {
      ok: true,
      filePath,
      restoredFromBackupPath: backupPath,
      preRestoreBackupPath,
      rowNumber,
      column,
      matchesExpectedCode,
      warnings,
      message: `Son D kodu yazımı geri alındı. Satır ${rowNumber} ${column} sütunu yedekteki haline döndürüldü${currentPartCodeAfterRestore !== undefined ? `: ${currentPartCodeAfterRestore || 'boş'}` : ''}. Restore öncesi mevcut dosya ayrıca yedeklendi. İşçilik (H-N) kolonlarına özel yazma yapılmadı.`
    };
    if (args.expectedOldPartCode !== undefined) result.expectedRestoredCode = args.expectedOldPartCode;
    if (currentPartCodeAfterRestore !== undefined) result.currentPartCodeAfterRestore = currentPartCodeAfterRestore;
    await this.recordHistory(result, backupPath, preRestoreBackupPath, args.expectedOldPartCode);
    return result;
  }

  /** v3.11: yalnız RAPOR amaçlı geçmiş kaydı (best-effort; başarısızsa restore sonucu bozulmaz). Ham cevap taşınmaz. */
  private async recordHistory(result: RestoreAiModePartCodeResult, backupPath: string, preRestoreBackupPath: string, expectedOldPartCode?: string): Promise<void> {
    try {
      await new AiModePartCodeHistoryStoreFile(this.context.cache.cacheRoot).append({
        id: `hist-restore-${Date.now()}`, type: 'restore_d_code', createdAt: new Date().toISOString(),
        filePath: result.filePath, rowNumber: result.rowNumber, column: result.column,
        ...(expectedOldPartCode ? { oldPartCode: expectedOldPartCode } : {}),
        ...(result.currentPartCodeAfterRestore !== undefined ? { newPartCode: result.currentPartCodeAfterRestore } : {}),
        restoredFromBackupPath: backupPath, preRestoreBackupPath,
        ok: result.ok, message: result.message, warnings: result.warnings
      });
    } catch { /* geçmiş yalnız rapor amaçlıdır; sessiz geçilir */ }
  }

  private async fileExists(p: string): Promise<boolean> {
    try { await fs.stat(p); return true; } catch { return false; }
  }
}
