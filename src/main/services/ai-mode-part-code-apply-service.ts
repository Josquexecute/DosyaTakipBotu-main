/**
 * v0.6.x — AI İşçilik v3.8: Kullanıcı onaylı seçili AI Mode adayını Excel D sütununa yazar (yalnız D hücresi).
 * Önce yedek alınır, sonra yalnız hedef hücre METİN olarak güncellenir; H-N/diğer kolonlar/formüller korunur.
 * Dosya yalnız uygulama içinden (AI önizleme ile) seçilmiş olmalı. Ağ/Google/scraping YOK; takip.json'a dokunmaz.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadWorkbook, writePartCodeCellExcel } from '../import/excel-importer';
import { normalizeSearch } from '../../shared/turkish';
import { buildPostWriteVerification, validateAiModePartCodeApply } from '../../shared/labor/ai-mode-part-code-apply-validator';
import { describeExcelWriteError, isExcelLockError } from './excel-lock-error-normalizer';
import { AiModePartCodeHistoryStoreFile } from '../local-cache/ai-mode-part-code-history-store-file';
import type { ApplyAiModePartCodeArg, ApplyAiModePartCodeResult } from '../../shared/labor/ai-mode-part-code-apply-types';
import type { IpcDomainContext } from './ipc-domain-services';

export class AiModePartCodeApplyService {
  constructor(private readonly context: IpcDomainContext) {}

  /** Seçili satırın D (parça kodu) sütununa aday kodu yazar. Doğrulama başarısızsa yazmaz (hata fırlatır). */
  async applyToDColumn(args: ApplyAiModePartCodeArg): Promise<ApplyAiModePartCodeResult> {
    const excelPath = path.resolve(String(args?.filePath || ''));
    if (!this.context.state.approvedExcelFiles.has(excelPath)) {
      throw new Error('Excel dosyası önce uygulama içinden (AI önizleme ile) seçilmelidir.');
    }
    if (!(await this.fileExists(excelPath))) throw new Error('Excel dosyası bulunamadı veya erişilemiyor.');
    const rowNumber = Number(args?.rowNumber);
    const column = String(args?.column || '').toUpperCase();
    const partNameColumn = String(args?.partNameColumn || '').toUpperCase();
    const candidatePartCode = String(args?.candidatePartCode || '').trim();
    if (!Number.isInteger(rowNumber) || rowNumber <= 1) throw new Error('Geçersiz satır numarası.');
    if (!/^[A-Z]+$/.test(column)) throw new Error('Geçersiz parça kodu sütunu.');

    const workbook = await loadWorkbook(excelPath);
    const cellAt = (col: string, row: number) => workbook.sheet.cells.find((c) => c.column === col && c.row === row);
    const targetCell = cellAt(column, rowNumber);
    const actualOldPartCode = targetCell?.value ?? '';
    const actualPartName = partNameColumn ? (cellAt(partNameColumn, rowNumber)?.value ?? '') : '';
    const isPartCodeColumn = workbook.sheet.cells.some((c) => c.column === column && c.row <= 15 && /KOD/.test(normalizeSearch(c.value)));

    const validation = validateAiModePartCodeApply({
      candidatePartCode,
      ...(args.expectedOldPartCode !== undefined ? { expectedOldPartCode: args.expectedOldPartCode } : {}),
      actualOldPartCode,
      ...(args.expectedPartName !== undefined ? { expectedPartName: args.expectedPartName } : {}),
      actualPartName,
      hasFormula: targetCell?.hasFormula === true,
      isPartCodeColumn,
      ...(args.confidence ? { confidence: args.confidence } : {})
    });
    if (!validation.ok) throw new Error(`D sütununa yazma durduruldu: ${validation.blocking.join(' ')}`);

    // Yedek + yalnız D hücresini güncelleyerek yerinde (in-place) değiştir; H-N/diğer kolonlar korunur.
    const dir = path.dirname(excelPath);
    const ext = path.extname(excelPath);
    const base = path.basename(excelPath, ext);
    const stamp = Date.now();
    const backupPath = path.join(dir, `${base}.yedek-${stamp}${ext}`);
    // Yedek alınamazsa yazma YAPILMAZ (geri alınabilirlik korunur).
    try {
      await fs.copyFile(excelPath, backupPath);
    } catch (error) {
      throw new Error(`Yedek alınamadığı için yazma yapılmadı. ${describeExcelWriteError(error).debugMessage}`);
    }
    const tmpOut = path.join(dir, `.${base}.aimode-${stamp}.tmp${ext}`);
    const written = await writePartCodeCellExcel(excelPath, tmpOut, rowNumber, column, candidatePartCode);
    // Güvenli yer değiştirme: POSIX atomic rename; Windows'ta hedef varsa sil+rename; kilitliyse net hata.
    try {
      await fs.rename(tmpOut, excelPath);
    } catch (firstErr) {
      if (isExcelLockError(firstErr)) {
        try {
          await fs.rm(excelPath, { force: true });
          await fs.rename(tmpOut, excelPath);
        } catch (secondErr) {
          await fs.rm(tmpOut, { force: true }).catch(() => undefined);
          throw new Error(describeExcelWriteError(secondErr).message);
        }
      } else {
        await fs.rm(tmpOut, { force: true }).catch(() => undefined);
        throw new Error(describeExcelWriteError(firstErr).message);
      }
    }

    const warnings = [...validation.warnings];
    let verifiedAfterWrite: ApplyAiModePartCodeResult['verifiedAfterWrite'];
    // v3.9: yalnız OKUMA amaçlı yeniden yükleme; başka hücreye yazmaz. Kilitliyse yazma başarılı kalır, uyarı eklenir.
    try {
      const reread = await loadWorkbook(excelPath);
      const dCell = reread.sheet.cells.find((c) => c.column === column && c.row === rowNumber);
      const cName = partNameColumn ? reread.sheet.cells.find((c) => c.column === partNameColumn && c.row === rowNumber)?.value : undefined;
      verifiedAfterWrite = buildPostWriteVerification({
        rowNumber,
        writtenCode: written.newValue,
        currentPartCode: dCell?.value ?? '',
        ...(cName ? { partName: cName } : {})
      });
      if (!verifiedAfterWrite.matchesWrittenCode) warnings.push('Yazma sonrası D sütunu beklenen kodla eşleşmedi; dosya kontrol edilmeli.');
    } catch {
      warnings.push('Yazma başarılı görünüyor; ancak satır yeniden doğrulanamadı (dosya kilitli olabilir). Excel dosyasını kapatıp yeniden analiz etmeniz önerilir.');
    }

    const undoInfo: ApplyAiModePartCodeResult['undoInfo'] = {
      available: true, filePath: excelPath, backupPath, rowNumber, column, newPartCode: written.newValue,
      note: 'Geri alma bilgisi hazırlandı. Geri alma işlemi sonraki sürümde eklenecek.'
    };
    if (written.oldValue) undoInfo.oldPartCode = written.oldValue;

    const verifyLine = verifiedAfterWrite
      ? ` ${verifiedAfterWrite.message}`
      : ' Yazma sonrası satır yeniden doğrulanamadı; Excel dosyasını kapatıp yeniden analiz etmeniz önerilir.';
    const result: ApplyAiModePartCodeResult = {
      ok: true,
      filePath: excelPath,
      rowNumber,
      column,
      partName: actualPartName,
      newPartCode: written.newValue,
      backupPath,
      warnings,
      message: `Satır ${rowNumber} ${column} sütunu güncellendi: ${written.oldValue ? written.oldValue : 'boş'} → ${written.newValue}. İşçilik (H-N) ve diğer kolonlara dokunulmadı.${verifyLine} Yedek: ${backupPath}`,
      undoInfo
    };
    if (verifiedAfterWrite) result.verifiedAfterWrite = verifiedAfterWrite;
    if (written.oldValue) result.oldPartCode = written.oldValue;
    if (args.candidateId) result.candidateId = args.candidateId;

    // v3.11: yalnız RAPOR amaçlı işlem geçmişi (best-effort; başarısızsa yazma sonucu bozulmaz). Ham cevap taşınmaz.
    try {
      await new AiModePartCodeHistoryStoreFile(this.context.cache.cacheRoot).append({
        id: `hist-apply-${stamp}`, type: 'apply_d_code', createdAt: new Date().toISOString(),
        filePath: excelPath, rowNumber, column, partName: actualPartName,
        ...(written.oldValue ? { oldPartCode: written.oldValue } : {}),
        newPartCode: written.newValue, backupPath, ok: true, message: result.message, warnings
      });
    } catch {
      result.warnings.push('İşlem geçmişine kaydedilemedi (yalnız rapor amaçlı).');
    }
    return result;
  }

  private async fileExists(p: string): Promise<boolean> {
    try { await fs.stat(p); return true; } catch { return false; }
  }
}
