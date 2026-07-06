/**
 * v0.6.x — AI İşçilik v3.2: Eksper onaylı öğrenme servisi (Excel önizleme + onay + yerel store yönetimi).
 * Excel'i YALNIZ OKUR; öğrenme kaydı kullanıcı onayıyla yerel depoya yazılır, Excel'e hiçbir şey yazılmaz.
 */
import { dialog, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import { buildAutoLaborPreview } from './labor-preview-service';
import { ExpertApprovedLearningStoreFile } from '../local-cache/expert-approved-learning-store-file';
import {
  buildExpertLearningPreview,
  expertSourceRowsFromAutoLabor
} from '../../shared/labor/expert-approved-learning-preview';
import {
  listUsableExpertEntries,
  mergeApprovedExpertEntries,
  normalizeExpertEntry,
  removeExpertEntry,
  replaceDuplicateExpertEntryWithApproval,
  setExpertEntryActive
} from '../../shared/labor/expert-approved-learning-store';
import type {
  ExpertApprovedLaborLearningEntry,
  ExpertLearningApproveResult,
  ExpertLearningPreviewResponse,
  ExpertLearningStoreState
} from '../../shared/labor/expert-approved-learning-types';
import type { ExpertLearningReplaceArgs } from '../../shared/ipc-contract';
import type { IpcDomainContext } from './ipc-domain-services';

export class ExpertApprovedLearningService {
  constructor(private readonly context: IpcDomainContext) {}

  private store(): ExpertApprovedLearningStoreFile {
    return new ExpertApprovedLearningStoreFile(this.context.cache.cacheRoot);
  }

  private toState(entries: ExpertApprovedLaborLearningEntry[], corrupt: boolean): ExpertLearningStoreState {
    const activeCount = entries.filter((e) => e.isActive).length;
    return { entries, corrupt, activeCount, passiveCount: entries.length - activeCount };
  }

  /** Eksper onaylı bir Excel seçtirir, satır satır öğrenilebilir adayları önizler (dosyaya YAZMAZ). */
  async previewExcel(): Promise<ExpertLearningPreviewResponse> {
    const settings = await this.context.getSettings();
    const window = this.context.mainWindowProvider();
    const options: OpenDialogOptions = {
      title: 'Eksper Onaylı İşçilik Dosyası — öğrenmek için Excel seçin',
      defaultPath: settings.rootPath,
      properties: ['openFile'],
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }]
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) throw new Error('Excel seçimi iptal edildi.');
    const excelPath = path.resolve(result.filePaths[0]);

    const { entries, corrupt } = await this.store().read();
    // Mevcut aktif kayıtları geçirerek araç bağlamı çıkarımını tetikle; preview.vehicleContext duplicate anahtarını hizalar.
    const preview = await buildAutoLaborPreview(excelPath, [], entries);
    const sourceRows = expertSourceRowsFromAutoLabor(preview);
    const { items, skipped } = buildExpertLearningPreview(sourceRows, preview.vehicleContext ?? {}, entries);
    return { fileName: preview.fileName, items, skipped, corrupt, storeCount: entries.length };
  }

  async list(): Promise<ExpertLearningStoreState> {
    const { entries, corrupt } = await this.store().read();
    return this.toState(entries, corrupt);
  }

  /** Kullanıcının seçtiği adayları onaylar; duplicate olanları atlar; yalnız onaylıları yerel depoya yazar. */
  async approve(candidates: unknown): Promise<ExpertLearningApproveResult> {
    if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('Onaylanacak öğrenme satırı bulunamadı.');
    const approved: ExpertApprovedLaborLearningEntry[] = [];
    for (const raw of candidates) {
      const entry = normalizeExpertEntry(raw);
      if (entry) approved.push({ ...entry, approvedByUser: true, isActive: true });
    }
    if (approved.length === 0) throw new Error('Geçerli öğrenme satırı bulunamadı (zorunlu alanlar eksik).');
    const { entries } = await this.store().read();
    const merged = mergeApprovedExpertEntries(entries, approved);
    await this.store().write(merged.entries);
    return { ...this.toState(merged.entries, false), added: merged.added, skippedDuplicates: merged.skippedDuplicates };
  }

  /** Kullanıcı onaylı duplicate yenileme: eski kaydı pasifleştirir (silmez), yeni onaylı kaydı aktif ekler. */
  async replaceDuplicate(args: ExpertLearningReplaceArgs): Promise<ExpertLearningApproveResult> {
    const duplicateId = typeof args?.duplicateId === 'string' ? args.duplicateId.trim() : '';
    if (!duplicateId) throw new Error('Yenilenecek mevcut kayıt kimliği (duplicateId) gereklidir.');
    const entry = normalizeExpertEntry(args?.entry);
    if (!entry) throw new Error('Geçerli öğrenme kaydı bulunamadı (zorunlu alanlar eksik).');
    const { entries } = await this.store().read();
    const result = replaceDuplicateExpertEntryWithApproval(entries, { ...entry, approvedByUser: true, isActive: true }, duplicateId);
    if (!result.replaced) throw new Error('Yenileme yapılamadı: mevcut kayıt bulunamadı.');
    await this.store().write(result.entries);
    return { ...this.toState(result.entries, false), added: 1, skippedDuplicates: 0 };
  }

  async deactivate(args: unknown): Promise<ExpertLearningStoreState> {
    const id = this.requireId(args);
    const { entries } = await this.store().read();
    const next = setExpertEntryActive(entries, id, false);
    await this.store().write(next);
    return this.toState(next, false);
  }

  async reactivate(args: unknown): Promise<ExpertLearningStoreState> {
    const id = this.requireId(args);
    const { entries } = await this.store().read();
    const next = setExpertEntryActive(entries, id, true);
    await this.store().write(next);
    return this.toState(next, false);
  }

  async delete(args: unknown): Promise<ExpertLearningStoreState> {
    const id = this.requireId(args);
    const { entries } = await this.store().read();
    const next = removeExpertEntry(entries, id);
    await this.store().write(next);
    return this.toState(next, false);
  }

  /** AI İşçilik önizlemesine verilecek AKTIF + onaylı kayıtlar (matcher girdisi). */
  async usableEntries(): Promise<ExpertApprovedLaborLearningEntry[]> {
    const { entries } = await this.store().read();
    return listUsableExpertEntries(entries);
  }

  private requireId(args: unknown): string {
    const id = args && typeof args === 'object' ? (args as { id?: unknown }).id : undefined;
    if (typeof id !== 'string' || !id.trim()) throw new Error('Geçerli bir kayıt kimliği (id) gereklidir.');
    return id.trim();
  }
}
