import { BrowserWindow, ipcMain, shell } from 'electron';
import type {
  ApiResult,
  AppSettings,
  AutoLaborPreview,
  AutoLaborSaveResult,
  CaseListExportRow,
  ConflictResolutionArgs,
  DebugHealthReport,
  ExcelLaborDistributeResult,
  ExcelLaborPreview,
  PartsPhotoAnalysis,
  ThumbnailResult,
  TodoItem
} from '../shared/types';
import { APP_VERSION } from '../shared/constants';
import { IPC_INVOKE_CHANNELS as IPC } from '../shared/ipc-contract';
import type {
  CaseListExportExcelArgs,
  LaborDistributeExcelArgs,
  LaborInspectExcelArgs,
  LaborAutoSaveArgs,
  PartsAnalyzePhotoArgs,
  PartsExportLaborArgs,
  PartsLearnTermArgs,
  TrackingAddNoteArgs,
  TrackingAddTodoArgs,
  TrackingDeleteNoteArgs,
  TrackingDeleteTodoArgs,
  TrackingUpdateChecklistArgs,
  TrackingUpdateFieldArgs,
  TrackingUpdateNoteArgs,
  TrackingUpdateTodoArgs
} from '../shared/ipc-contract';
import { LocalCacheStore } from './local-cache/local-cache-store';
import { assertSafeCasePath } from './security';
import type { LogLevel } from './debug-logger';
import {
  CasesQueryService,
  ConflictResolverService,
  DeploymentService,
  ExcelWorkflowService,
  FoldersService,
  IpcDomainContext,
  type IpcLogger,
  type MutationArgsBase,
  SettingsService,
  TrackingMutationService,
  createIpcRuntimeState,
  existsDirectory
} from './services/ipc-domain-services';

export type { IpcLogger };

export class IpcController {
  private readonly context: IpcDomainContext;
  private readonly settings: SettingsService;
  private readonly cases: CasesQueryService;
  private readonly folders: FoldersService;
  private readonly tracking: TrackingMutationService;
  private readonly conflicts: ConflictResolverService;
  private readonly excel: ExcelWorkflowService;
  private readonly deployment: DeploymentService;

  constructor(private readonly cache: LocalCacheStore, private readonly mainWindowProvider: () => BrowserWindow | null, private readonly logger?: IpcLogger) {
    const state = createIpcRuntimeState();
    this.context = new IpcDomainContext(cache, state, mainWindowProvider, logger);
    this.settings = new SettingsService(this.context);
    this.cases = new CasesQueryService(this.context);
    this.folders = new FoldersService(this.context);
    this.tracking = new TrackingMutationService(this.context, this.cases);
    this.conflicts = new ConflictResolverService(this.context, this.cases);
    this.excel = new ExcelWorkflowService(this.context);
    this.deployment = new DeploymentService(this.context);
  }

  register(): void {
    ipcMain.handle(IPC.settingsGet, () => this.safe(() => this.settings.get()));
    ipcMain.handle(IPC.settingsSave, (_event, settings: AppSettings) => this.safe(() => this.settings.save(settings)));
    ipcMain.handle(IPC.settingsChooseRoot, () => this.safe(() => this.settings.chooseRoot()));

    ipcMain.handle(IPC.dashboardGet, () => this.safe(() => this.cases.dashboard()));
    ipcMain.handle(IPC.casesList, () => this.safe(() => this.cases.list()));
    ipcMain.handle(IPC.casesGet, (_event, folderPath: string) => this.safe(() => this.cases.get(folderPath)));
    ipcMain.handle(IPC.casesRefreshOne, (_event, folderPath: string) => this.safe(() => this.cases.refreshOne(folderPath)));
    ipcMain.handle(IPC.folderList, (_event, folderPath?: string) => this.safe(() => this.folders.browse(folderPath)));
    ipcMain.handle(IPC.scanStart, () => this.safe(() => this.cases.scanStart()));
    ipcMain.handle(IPC.scanCancel, () => this.safe(() => this.cases.scanCancel()));
    ipcMain.handle(IPC.photoGetThumbnail, (_event, filePath: string) => this.safe((): Promise<ThumbnailResult> => this.cases.getThumbnail(filePath)));

    ipcMain.handle(IPC.laborChooseExcel, () => this.safe((): Promise<ExcelLaborPreview | null> => this.excel.chooseExcel()));
    ipcMain.handle(IPC.laborInspectExcel, (_event, args: LaborInspectExcelArgs) => this.safe((): Promise<ExcelLaborPreview> => this.excel.inspectExcel(args)));
    ipcMain.handle(IPC.laborDistributeExcel, (_event, args: LaborDistributeExcelArgs) => this.safe((): Promise<ExcelLaborDistributeResult> => this.excel.distributeExcel(args)));
    ipcMain.handle(IPC.partsAnalyzePhoto, (_event, args?: PartsAnalyzePhotoArgs) => this.safe((): Promise<PartsPhotoAnalysis> => this.excel.analyzePartsPhoto(args)));
    ipcMain.handle(IPC.laborAutoPreview, () => this.safe((): Promise<AutoLaborPreview> => this.excel.autoLaborPreview()));
    ipcMain.handle(IPC.laborAutoSave, (_event, args: LaborAutoSaveArgs) => this.safe((): Promise<AutoLaborSaveResult> => this.excel.autoLaborSave(args)));
    ipcMain.handle(IPC.partsGetUserTerms, () => this.safe(() => this.excel.getUserPartTerms()));
    ipcMain.handle(IPC.partsLearnTerm, (_event, args: PartsLearnTermArgs) => this.safe(() => this.excel.learnPartTerm(args)));
    ipcMain.handle(IPC.partsExportLaborExcel, (_event, args: PartsExportLaborArgs) => this.safe(() => this.excel.exportPartsLaborExcel(args)));
    ipcMain.handle(IPC.casesExportExcel, (_event, args: CaseListExportExcelArgs) => this.safe(() => this.excel.exportCaseList(args)));

    ipcMain.handle(IPC.trackingUpdateChecklist, (_event, args: TrackingUpdateChecklistArgs) => this.safe(() => this.tracking.updateChecklist(args)));
    ipcMain.handle(IPC.trackingAddTodo, (_event, args: TrackingAddTodoArgs) => this.safe(() => this.tracking.addTodo(args)));
    ipcMain.handle(IPC.trackingUpdateTodo, (_event, args: TrackingUpdateTodoArgs) => this.safe(() => this.tracking.updateTodo(args)));
    ipcMain.handle(IPC.trackingDeleteTodo, (_event, args: TrackingDeleteTodoArgs) => this.safe(() => this.tracking.deleteTodo(args)));
    ipcMain.handle(IPC.trackingAddNote, (_event, args: TrackingAddNoteArgs) => this.safe(() => this.tracking.addNote(args)));
    ipcMain.handle(IPC.trackingUpdateNote, (_event, args: TrackingUpdateNoteArgs) => this.safe(() => this.tracking.updateNote(args)));
    ipcMain.handle(IPC.trackingDeleteNote, (_event, args: TrackingDeleteNoteArgs) => this.safe(() => this.tracking.deleteNote(args)));
    ipcMain.handle(IPC.trackingUpdateField, (_event, args: TrackingUpdateFieldArgs) => this.safe(() => this.tracking.updateField(args)));

    ipcMain.handle(IPC.trackingResolveConflict, (_event, args: ConflictResolutionArgs) => this.safe(() => this.conflicts.resolveConflict(args)));
    ipcMain.handle(IPC.trackingInspectConflictCopy, (_event, folderPath: string) => this.safe(() => this.conflicts.inspectConflictCopy(folderPath)));
    ipcMain.handle(IPC.trackingAcceptDiskBaseline, (_event, folderPath: string) => this.safe(() => this.conflicts.acceptDiskBaseline(folderPath)));

    ipcMain.handle(IPC.systemOpenFolder, (_event, folderPath: string) => this.safe(async () => {
      const settings = await this.context.getSettings();
      assertSafeCasePath(folderPath, settings.rootPath);
      await shell.openPath(folderPath);
      return true;
    }));

    ipcMain.handle(IPC.healthGet, () => this.safe(async (): Promise<DebugHealthReport> => {
      const settings = await this.context.getSettings();
      await this.context.ensureLoaded();
      return {
        appVersion: APP_VERSION,
        electronVersion: process.versions.electron ?? '',
        platform: process.platform,
        cacheRoot: this.cache.cacheRoot,
        rootPath: settings.rootPath,
        rootAvailable: this.context.state.rootAvailable,
        caseCount: this.context.state.index?.cases.length ?? 0,
        lastScanAt: this.context.state.lastScanAt || this.context.state.index?.generatedAt || '',
        cspEnabled: true,
        security: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
      };
    }));

    ipcMain.handle(IPC.deploymentGetStatus, () => this.safe(() => this.deployment.getStatus(false)));
    ipcMain.handle(IPC.deploymentRegisterClient, () => this.safe(() => this.deployment.getStatus(true)));
  }

  private async safe<T>(operation: () => Promise<T>): Promise<ApiResult<T>> {
    try {
      return { ok: true, data: await operation() };
    } catch (error) {
      await this.logger?.log('ERROR', 'IPC işlemi hata verdi', { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }).catch(() => undefined);
      // Özel hata kodu varsa (ör. PHOTO_PLATE_MISMATCH) renderer'ın modal/akış kararı için korunur.
      const code = (error as { code?: unknown })?.code;
      return { ok: false, error: { code: typeof code === 'string' && code ? code : 'HASARBOTU_ERROR', message: error instanceof Error ? error.message : 'Bilinmeyen hata', details: String(error) } };
    }
  }
}
