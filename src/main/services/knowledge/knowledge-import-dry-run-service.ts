import { dialog } from 'electron';
import type { BrowserWindow, OpenDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { KnowledgeImportDryRunResponse } from '../../../shared/knowledge';
import { buildDryRunPlan } from './knowledge-import-planner';

const MAX_FILES = 200;

/**
 * P4-A: Dosya secici + SADECE metadata dry-run.
 *
 * Kullanici dosya secer. Yalnizca dosya ADI (basename) ve BOYUTU (fs.stat metadata) alinir;
 * dosya ICERIGI acilmaz/okunmaz, parser yok, gorsel-metin yok, kalici yazma yok.
 * Saf buildDryRunPlan planlayicisi ile canWrite=false plan uretilir. filePath plana tasinmaz.
 */
export async function chooseFilesForKnowledgeImportDryRun(window: BrowserWindow | null): Promise<KnowledgeImportDryRunResponse | null> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Bilgi bankasi import icin dosya sec (yalniz dry-run plan; icerik okunmaz)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Belge/gorsel', extensions: ['pdf', 'docx', 'md', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'xlsx'] }]
  };
  const result = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) return null;

  const files: Array<{ fileName: string; sizeBytes?: number }> = [];
  for (const filePath of result.filePaths.slice(0, MAX_FILES)) {
    const fileName = path.basename(filePath);
    if (!fileName) continue;
    let sizeBytes: number | undefined;
    try {
      // SADECE metadata: dosya boyutu. Dosya icerigi acilmaz/okunmaz.
      const info = await fs.stat(filePath);
      sizeBytes = info.size;
    } catch {
      sizeBytes = undefined;
    }
    files.push(sizeBytes !== undefined ? { fileName, sizeBytes } : { fileName });
  }
  // filePath plana gecmez; planlayici yalniz dosya-adi/boyut metadata ile calisir, canWrite=false uretir.
  return buildDryRunPlan({ mode: 'dry_run', files });
}
