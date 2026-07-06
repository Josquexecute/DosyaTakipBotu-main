import { app, dialog } from 'electron';
import type { OpenDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AutoLaborPreview,
  AutoLaborSaveResult,
  CaseListExportResult,
  CaseListExportRow,
  ExcelLaborDistributeResult,
  ExcelLaborPreview,
  PartsPhotoAnalysis
} from '../../shared/types';
import type { LaborAutoSaveArgs, PartsAnalyzePhotoArgs } from '../../shared/ipc-contract';
import type { UserPartTerm } from '../../shared/parca-sozlugu';
import { lookupLearned } from '../../shared/labor-learning-dictionary';
import { listUsableExpertEntries } from '../../shared/labor/expert-approved-learning-store';
import { listUsableCandidates } from '../../shared/labor/ai-mode-part-candidate-store';
import type { LaborVehicleContext } from '../../shared/labor/labor-vehicle-context';
import { ExpertApprovedLearningStoreFile } from '../local-cache/expert-approved-learning-store-file';
import { AiModePartCandidateStoreFile } from '../local-cache/ai-mode-part-candidate-store-file';
import { buildMultiMoneyLaborWorkbook, distributeLaborExcel, inspectLaborExcel } from '../import/excel-importer';
import { analyzePartsPhoto } from '../import/parts-list-analyzer';
import { assertSelectedPhotoMatchesCase } from './case-asset-guard';
import { buildAutoLaborPreview } from './labor-preview-service';
import { saveAutoLaborExcel } from './labor-excel-writer';
import { exportCaseListToExcel } from '../import/case-list-exporter';
import type { IpcDomainContext } from './ipc-domain-services';

/**
 * Excel & Parça Veri Merkezi servisi. ipc-domain-services.ts'ten ayrıştırıldı; davranış birebir korunur.
 * İşçilik dağıtımı, parça fotoğrafı okuma (Gemini), öğrenen sözlük ve dosya listesi dışa aktarımı.
 * Yanlış plakalı fotoğraf seçiminde (PHOTO_PLATE_MISMATCH) Gemini'ye gönderilmez — sert engelleme korunur.
 */
function sanitizeCaseListExportRow(row: CaseListExportRow): CaseListExportRow {
  return {
    officeFileNo: String(row.officeFileNo || ''),
    claimNoticeNo: String(row.claimNoticeNo || ''),
    plate: String(row.plate || ''),
    claimType: String(row.claimType || ''),
    workflowStatus: String(row.workflowStatus || ''),
    dosyaDurumu: String(row.dosyaDurumu || ''),
    sorumlu: String(row.sorumlu || ''),
    serviceName: String(row.serviceName || ''),
    takipTarihi: String(row.takipTarihi || ''),
    sonIslemTarihi: String(row.sonIslemTarihi || ''),
    missingDocuments: Number(row.missingDocuments || 0),
    missingPhotos: Number(row.missingPhotos || 0),
    unsupportedPhotos: Number(row.unsupportedPhotos || 0),
    openTodos: Number(row.openTodos || 0),
    folderPath: String(row.folderPath || '')
  };
}

export class ExcelWorkflowService {
  constructor(private readonly context: IpcDomainContext) {}

  async chooseExcel(): Promise<ExcelLaborPreview | null> {
    const settings = await this.context.getSettings();
    const window = this.context.mainWindowProvider();
    const dialogOptions: OpenDialogOptions = {
      title: 'İşçilik Excel dosyasını seçin',
      defaultPath: settings.rootPath,
      properties: ['openFile'],
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }]
    };
    const result = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) return null;
    const excelPath = path.resolve(result.filePaths[0]);
    this.context.state.approvedExcelFiles.add(excelPath);
    return inspectLaborExcel(excelPath);
  }

  /**
   * v0.4.11 AI İşçilik Dağıtıcı — adım 1: Excel seç, TÜM satırları analiz et, H..N işçilik sütunlarını
   * öğrenen sözlük + kural + fiyat listesiyle otomatik doldur, ÖNİZLEME döndür (dosyaya YAZMAZ).
   */
  async autoLaborPreview(vehicle: LaborVehicleContext = {}): Promise<AutoLaborPreview> {
    const settings = await this.context.getSettings();
    const window = this.context.mainWindowProvider();
    const dialogOptions: OpenDialogOptions = {
      title: 'AI İşçilik Dağıtıcı — Excel dosyasını seçin',
      defaultPath: settings.rootPath,
      properties: ['openFile'],
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }]
    };
    const result = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) throw new Error('Excel seçimi iptal edildi.');
    const excelPath = path.resolve(result.filePaths[0]);
    this.context.state.approvedExcelFiles.add(excelPath);
    const learned = await this.context.cache.readLaborLearning();
    // v3.2: aktif eksper onaylı kayıtlar matcher'a verilir (yalnız evidence/öneri; Excel'e otomatik UYGULANMAZ).
    const expertEntries = await this.readUsableExpertEntries();
    const aiModeCandidates = await this.readUsableAiModeCandidates();
    const preview = await buildAutoLaborPreview(excelPath, learned, expertEntries, vehicle, aiModeCandidates);
    const usages = preview.rows
      .filter((row) => row.source === 'learned')
      .map((row) => lookupLearned(learned, row.partName, row.partCode)?.entry)
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => ({ normalizedName: entry.normalizedName, ...(entry.partCode ? { partCode: entry.partCode } : {}) }));
    if (usages.length > 0) await this.context.cache.touchLaborLearningUsage(usages);
    return preview;
  }

  /** Aktif + onaylı eksper öğrenme kayıtlarını okur (bozuk/eksik depo Excel akışını bozmaz → boş döner). */
  private async readUsableExpertEntries() {
    try {
      const { entries } = await new ExpertApprovedLearningStoreFile(this.context.cache.cacheRoot).read();
      return listUsableExpertEntries(entries);
    } catch {
      return [];
    }
  }

  /** Aktif + onaylı AI Mode parça kodu adaylarını okur (bozuk/eksik depo Excel akışını bozmaz → boş döner). */
  private async readUsableAiModeCandidates() {
    try {
      const { entries } = await new AiModePartCandidateStoreFile(this.context.cache.cacheRoot).read();
      return listUsableCandidates(entries);
    } catch {
      return [];
    }
  }

  /**
   * v0.4.11 AI İşçilik Dağıtıcı — adım 2: KULLANICI ONAYINDAN SONRA kaydet. Önce orijinalin yedeğini alır,
   * onaylı/düzeltilmiş tutarları H..N sütunlarına yazar (yeni dosyaya), kullanıcı düzeltmelerini öğrenir.
   */
  async autoLaborSave(args: LaborAutoSaveArgs): Promise<AutoLaborSaveResult> {
    const excelPath = path.resolve(String(args?.filePath || ''));
    if (!this.context.state.approvedExcelFiles.has(excelPath)) throw new Error('Excel dosyası önce uygulama içinden (AI önizleme ile) seçilmelidir.');
    if (!Array.isArray(args.rows) || args.rows.length === 0) throw new Error('Yazılacak işçilik satırı bulunamadı.');
    if (!Array.isArray(args.columns) || args.columns.length === 0) throw new Error('İşçilik kategori sütunları belirlenemedi; bu Excel için AI dağıtım yapılamıyor.');

    const window = this.context.mainWindowProvider();
    const defaultName = `${path.basename(excelPath, path.extname(excelPath))}-AI-iscilik.xlsx`;
    const saveOptions = {
      title: 'AI işçilik dağıtılmış Excel dosyasını kaydet',
      defaultPath: path.join(path.dirname(excelPath), defaultName),
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }]
    };
    const saved = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (saved.canceled || !saved.filePath) throw new Error('Excel kaydetme işlemi iptal edildi.');
    const outputPath = path.resolve(saved.filePath.endsWith('.xlsx') ? saved.filePath : `${saved.filePath}.xlsx`);

    const writerResult = await saveAutoLaborExcel({
      filePath: excelPath,
      outputPath,
      rows: args.rows.map((r) => ({ rowNumber: Number(r.rowNumber), amounts: r.amounts })),
      columns: args.columns,
      ...(args.allowFormulaReplacement ? { allowFormulaReplacement: true } : {})
    });
    this.context.state.approvedExcelFiles.add(writerResult.outputPath);

    // Kullanıcı düzeltmelerini öğren (kuraldan öncelikli olacak şekilde kalıcı sözlüğe yaz).
    let learnedCount = 0;
    for (const correction of args.corrections ?? []) {
      const alias = String(correction?.alias || '').trim();
      const categories = Array.isArray(correction?.categories) ? correction.categories : [];
      if (!alias || categories.length === 0) continue;
      await this.context.cache.addLaborLearning({
        alias,
        ...(correction.partCode ? { partCode: String(correction.partCode) } : {}),
        categories,
        ...(correction.amounts ? { amounts: correction.amounts } : {}),
        amountLogic: correction.amountLogic ? String(correction.amountLogic) : 'kullanıcı düzeltmesi',
        ...(correction.reason ? { reason: String(correction.reason) } : {})
      });
      learnedCount += 1;
    }

    const needsReviewRows = Number.isFinite(Number(args.needsReviewRows)) ? Math.max(0, Math.round(Number(args.needsReviewRows))) : 0;
    return {
      outputPath: writerResult.outputPath,
      backupPath: writerResult.backupPath,
      changedRows: writerResult.changedRows,
      needsReviewRows,
      learnedCount,
      writtenCells: writerResult.writtenCells
    };
  }

  async inspectExcel(args: { filePath: string; targetTotal?: number; targetColumn?: string; usePriceList?: boolean }): Promise<ExcelLaborPreview> {
    const excelPath = path.resolve(String(args.filePath || ''));
    if (!this.context.state.approvedExcelFiles.has(excelPath)) throw new Error('Excel dosyası önce uygulama içinden seçilmelidir.');
    const usePriceList = args.usePriceList === true;
    // v0.4.6: Fiyat listesi modunda öğrenen usta sözlüğü de devreye girsin.
    const userTerms = usePriceList ? await this.context.cache.readUserPartTerms() : [];
    return inspectLaborExcel(excelPath, Number(args.targetTotal), { targetColumn: String(args.targetColumn || ''), usePriceList, userTerms });
  }

  async distributeExcel(args: { filePath: string; targetTotal: number; targetColumn?: string; allowRiskyColumn?: boolean; allowFormulaReplacement?: boolean; allowEqualDistribution?: boolean; usePriceList?: boolean; overrides?: Array<{ rowNumber: number; amount: number }> }): Promise<ExcelLaborDistributeResult> {
    const excelPath = path.resolve(String(args.filePath || ''));
    if (!this.context.state.approvedExcelFiles.has(excelPath)) throw new Error('Excel dosyası önce uygulama içinden seçilmelidir.');
    const usePriceList = args.usePriceList === true;
    // v0.4.6: Öğrenen usta sözlüğü; fiyat listesiyle doğrudan eşleşmeyen satırlar resmi ada çevrilip eşlenir.
    const userTerms = usePriceList ? await this.context.cache.readUserPartTerms() : [];
    const preview = await inspectLaborExcel(excelPath, Number(args.targetTotal), { targetColumn: String(args.targetColumn || ''), usePriceList, userTerms });
    const defaultName = `${path.basename(excelPath, path.extname(excelPath))}-isçilik-dagitilmis.xlsx`;
    const window = this.context.mainWindowProvider();
    const saveOptions = {
      title: 'Dağıtılmış Excel dosyasını kaydet',
      defaultPath: path.join(path.dirname(excelPath), defaultName),
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }]
    };
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) throw new Error('Excel kaydetme işlemi iptal edildi.');
    const outputPath = path.resolve(result.filePath.endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`);
    const distributed = await distributeLaborExcel(preview.filePath, Number(args.targetTotal), outputPath, {
      targetColumn: String(args.targetColumn || preview.targetColumn || ''),
      allowRiskyColumn: args.allowRiskyColumn === true,
      allowFormulaReplacement: args.allowFormulaReplacement === true,
      allowEqualDistribution: args.allowEqualDistribution === true,
      usePriceList,
      userTerms,
      ...(Array.isArray(args.overrides) ? { overrides: args.overrides } : {})
    });
    this.context.state.approvedExcelFiles.add(outputPath);
    return distributed;
  }

  async analyzePartsPhoto(args?: PartsAnalyzePhotoArgs): Promise<PartsPhotoAnalysis> {
    const settings = await this.context.getSettings();
    const apiKey = (settings.geminiApiKey ?? '').trim();
    if (!apiKey) throw new Error('Gemini API anahtarı tanımlı değil. Ayarlar ekranındaki "AI / Parça Okuma" bölümünden anahtarınızı girin.');
    const window = this.context.mainWindowProvider();
    const dialogOptions: OpenDialogOptions = {
      title: 'Parça listesi fotoğrafını seçin',
      defaultPath: settings.rootPath,
      properties: ['openFile'],
      filters: [{ name: 'Görsel', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] }]
    };
    const result = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) throw new Error('Fotoğraf seçimi iptal edildi.');
    const selectedPath = path.resolve(result.filePaths[0]);
    // v0.4.7 HARD-BLOCK: Seçilen fotoğraf aktif dosyaya ait değilse Gemini'ye GÖNDERİLMEZ,
    // veri merkezine eklenmez. Uyuşmazlıkta PHOTO_PLATE_MISMATCH fırlatılır → renderer modal gösterir.
    assertSelectedPhotoMatchesCase({
      activePlate: String(args?.activePlate ?? ''),
      activeFolderPath: String(args?.activeFolderPath ?? ''),
      selectedFilePath: selectedPath
    });
    const userTerms = await this.context.cache.readUserPartTerms();
    // v0.6.2: Yalnız AKTİF dosyanın AI-güvenli araç bağlamı (Şase/Motor hariç) yerel uyum değerlendirmesi için verilir; Gemini'ye gönderilmez.
    return analyzePartsPhoto(selectedPath, apiKey, { userTerms, ...(args?.vehicleContext ? { vehicleContext: args.vehicleContext } : {}) });
  }

  async exportPartsLaborExcel(args: { rows: Array<{ description: string; partAmount: number; laborAmount: number }> }): Promise<CaseListExportResult> {
    const rows = (Array.isArray(args?.rows) ? args.rows : []).slice(0, 500).map((row) => ({
      description: String(row?.description ?? '').slice(0, 200),
      partAmount: Number.isFinite(Number(row?.partAmount)) ? Number(row.partAmount) : 0,
      laborAmount: Number.isFinite(Number(row?.laborAmount)) ? Number(row.laborAmount) : 0
    })).filter((row) => row.description.trim().length > 0);
    if (rows.length === 0) throw new Error('Aktarılacak parça satırı bulunamadı.');
    const settings = await this.context.getSettings();
    const window = this.context.mainWindowProvider();
    const defaultName = `parca-iscilik-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const saveOptions = {
      title: 'Parça + İşçilik listesini Excel olarak kaydet',
      defaultPath: path.join(settings.rootPath || app.getPath('desktop'), defaultName),
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }]
    };
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) throw new Error('Excel kaydetme işlemi iptal edildi.');
    const outputPath = path.resolve(result.filePath.endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buildMultiMoneyLaborWorkbook(rows));
    return { outputPath, rowCount: rows.length };
  }

  async getUserPartTerms(): Promise<UserPartTerm[]> {
    return this.context.cache.readUserPartTerms();
  }

  async learnPartTerm(args: { alias: string; canonical: string; category?: string; laborPart?: string }): Promise<UserPartTerm[]> {
    const alias = String(args?.alias ?? '').trim();
    const canonical = String(args?.canonical ?? '').trim();
    if (!alias) throw new Error('Öğretilecek terim (okunan metin) boş olamaz.');
    if (!canonical) throw new Error('Gerçek parça adı boş olamaz.');
    return this.context.cache.addUserPartTerm({
      alias,
      canonical,
      ...(args.category ? { category: String(args.category) } : {}),
      ...(args.laborPart ? { laborPart: String(args.laborPart) } : {})
    });
  }

  async exportCaseList(args: { rows: CaseListExportRow[] }): Promise<CaseListExportResult> {
    const rows = Array.isArray(args.rows) ? args.rows.slice(0, 5000) : [];
    const defaultName = `hasarbotu-dosya-listesi-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const settings = await this.context.getSettings();
    const window = this.context.mainWindowProvider();
    const saveOptions = {
      title: 'Filtrelenmiş dosya listesini Excel olarak kaydet',
      defaultPath: path.join(settings.rootPath || app.getPath('desktop'), defaultName),
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }]
    };
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) throw new Error('Excel dışa aktarma işlemi iptal edildi.');
    const outputPath = path.resolve(result.filePath.endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`);
    return exportCaseListToExcel(rows.map(sanitizeCaseListExportRow), outputPath);
  }
}
