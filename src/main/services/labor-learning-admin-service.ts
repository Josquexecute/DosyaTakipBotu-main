import { dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  deleteLearned,
  exportLaborLearningJson,
  importLaborLearningJson,
  setLearnedActive,
  updateLearned,
  type LaborLearningAdminKey,
  type LaborLearningEntry,
  type LaborLearningExportResult,
  type LaborLearningImportResult,
  type LaborLearningUpdateInput
} from '../../shared/labor-learning-dictionary';
import type { IpcDomainContext } from './ipc-domain-services';

export class LaborLearningAdminService {
  constructor(private readonly context: IpcDomainContext) {}

  async list(): Promise<LaborLearningEntry[]> {
    return this.context.cache.readLaborLearning();
  }

  async update(args: LaborLearningUpdateInput): Promise<LaborLearningEntry[]> {
    const entries = await this.context.cache.readLaborLearning();
    const next = updateLearned(entries, args);
    await this.context.cache.writeLaborLearning(next);
    return next;
  }

  async disable(args: LaborLearningAdminKey): Promise<LaborLearningEntry[]> {
    const entries = await this.context.cache.readLaborLearning();
    const next = setLearnedActive(entries, args, false);
    await this.context.cache.writeLaborLearning(next);
    return next;
  }

  async enable(args: LaborLearningAdminKey): Promise<LaborLearningEntry[]> {
    const entries = await this.context.cache.readLaborLearning();
    const next = setLearnedActive(entries, args, true);
    await this.context.cache.writeLaborLearning(next);
    return next;
  }

  async delete(args: LaborLearningAdminKey): Promise<LaborLearningEntry[]> {
    const entries = await this.context.cache.readLaborLearning();
    const next = deleteLearned(entries, args);
    await this.context.cache.writeLaborLearning(next);
    return next;
  }

  async export(): Promise<LaborLearningExportResult> {
    const entries = await this.context.cache.readLaborLearning();
    const settings = await this.context.getSettings();
    const window = this.context.mainWindowProvider();
    const defaultName = `hasarbotu-ai-iscilik-ogrenme-sozlugu-${new Date().toISOString().slice(0, 10)}.json`;
    const options: SaveDialogOptions = {
      title: 'AI işçilik öğrenme sözlüğünü dışa aktar',
      defaultPath: path.join(settings.rootPath || process.cwd(), defaultName),
      filters: [{ name: 'JSON dosyası', extensions: ['json'] }]
    };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) throw new Error('Dışa aktarma iptal edildi.');
    const filePath = result.filePath.endsWith('.json') ? result.filePath : `${result.filePath}.json`;
    await fs.writeFile(filePath, exportLaborLearningJson(entries), 'utf-8');
    return { filePath, count: entries.length };
  }

  async import(): Promise<LaborLearningImportResult> {
    const settings = await this.context.getSettings();
    const window = this.context.mainWindowProvider();
    const options: OpenDialogOptions = {
      title: 'AI işçilik öğrenme sözlüğünü içe aktar',
      defaultPath: settings.rootPath || process.cwd(),
      properties: ['openFile'],
      filters: [{ name: 'JSON dosyası', extensions: ['json'] }]
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) throw new Error('İçe aktarma iptal edildi.');
    const filePath = result.filePaths[0];
    const raw = await fs.readFile(filePath, 'utf-8');
    const existing = await this.context.cache.readLaborLearning();
    const imported = importLaborLearningJson(existing, raw);
    await this.context.cache.writeLaborLearning(imported.entries);
    return imported;
  }
}
