/**
 * v0.6.x — AI İşçilik v3.11: D kodu yazma/restore yedeklerini listeler + kullanıcı onaylı TEK yedeği siler.
 * Yalnız uygulama içinden seçili Excel'in klasöründeki .yedek-/.restore-oncesi- dosyaları. Ana Excel/takip.json/klasör asla silinmez.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyAiModeBackup, validateAiModeBackupDelete } from '../../shared/labor/ai-mode-part-code-backup-validator';
import type { AiModeBackupDeleteArg, AiModeBackupDeleteResult, AiModeBackupFileInfo, AiModeBackupListArg, AiModeBackupListResult } from '../../shared/labor/ai-mode-part-code-backup-types';
import type { IpcDomainContext } from './ipc-domain-services';

export class AiModePartCodeBackupService {
  constructor(private readonly context: IpcDomainContext) {}

  /** Seçili Excel dosyasının klasöründeki yedekleri listeler (dosya yoksa boş liste; hata vermez). */
  async list(args: AiModeBackupListArg): Promise<AiModeBackupListResult> {
    const excelPath = path.resolve(String(args?.filePath || ''));
    if (!this.context.state.approvedExcelFiles.has(excelPath)) {
      throw new Error('Excel dosyası önce uygulama içinden (AI önizleme ile) seçilmelidir.');
    }
    const dir = path.dirname(excelPath);
    const originalName = path.basename(excelPath);
    const backups: AiModeBackupFileInfo[] = [];
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return { originalExcelPath: excelPath, backups: [], warnings: ['Yedek klasörü okunamadı.'] };
    }
    for (const name of names) {
      if (name === originalName) continue;
      const cls = classifyAiModeBackup(name, originalName);
      if (!cls) continue;
      const fullPath = path.join(dir, name);
      const info: AiModeBackupFileInfo = {
        filePath: fullPath,
        fileName: name,
        originalExcelPath: excelPath,
        backupKind: cls.backupKind,
        isLikelyForCurrentExcel: cls.isLikelyForCurrentExcel,
        warnings: cls.warnings
      };
      if (cls.createdAt) info.createdAt = cls.createdAt;
      try {
        const stat = await fs.stat(fullPath);
        info.sizeBytes = stat.size;
        if (!info.createdAt) info.createdAt = stat.mtime.toISOString();
      } catch { /* boyut okunamadı; yine listelenir */ }
      backups.push(info);
    }
    backups.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return { originalExcelPath: excelPath, backups, warnings: [] };
  }

  /** Kullanıcı onaylı TEK yedek dosyasını siler. Ana Excel/takip.json/klasör asla silinmez. */
  async delete(args: AiModeBackupDeleteArg): Promise<AiModeBackupDeleteResult> {
    const backupPath = path.resolve(String(args?.filePath || ''));
    const originalExcelPath = path.resolve(String(args?.originalExcelPath || ''));
    if (!this.context.state.approvedExcelFiles.has(originalExcelPath)) {
      throw new Error('Excel dosyası önce uygulama içinden (AI önizleme ile) seçilmelidir.');
    }
    const validation = validateAiModeBackupDelete({
      fileName: path.basename(backupPath),
      originalExcelFileName: path.basename(originalExcelPath),
      isSameAsOriginal: backupPath === originalExcelPath,
      isSameDirectory: path.dirname(backupPath) === path.dirname(originalExcelPath)
    });
    if (!validation.ok) throw new Error(`Yedek silme durduruldu: ${validation.blocking.join(' ')}`);

    try {
      await fs.stat(backupPath);
    } catch {
      throw new Error('Silinecek yedek dosya bulunamadı.');
    }
    await fs.rm(backupPath);
    return { ok: true, deletedPath: backupPath, message: `Yedek dosya silindi: ${path.basename(backupPath)}` };
  }
}
