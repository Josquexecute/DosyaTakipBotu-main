import { app, dialog } from 'electron';
import type { OpenDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CaseListExportResult,
  CaseListExportRow,
  ExcelLaborDistributeResult,
  ExcelLaborPreview,
  PartsPhotoAnalysis
} from '../../shared/types';
import type { PartsAnalyzePhotoArgs } from '../../shared/ipc-contract';
import type { UserPartTerm } from '../../shared/parca-sozlugu';
import { buildMultiMoneyLaborWorkbook, distributeLaborExcel, inspectLaborExcel } from '../import/excel-importer';
import { analyzePartsPhoto } from '../import/parts-list-analyzer';
import { assertSelectedPhotoMatchesCase } from './case-asset-guard';
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
    return analyzePartsPhoto(selectedPath, apiKey, { userTerms });
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
