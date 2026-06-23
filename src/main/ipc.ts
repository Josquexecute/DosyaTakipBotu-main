import { randomUUID } from 'node:crypto';
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
import { AI_TASK_TYPES, type AiTaskRequest, type AiTaskType } from '../shared/ai/ai-task-types';
import type { AiTaskQueueEnqueueOptions } from '../shared/ai/ai-queue-types';
import type {
  AiQueueEnqueuePreviewArgs,
  CaseListExportExcelArgs,
  HeavyDamageClearArgs,
  HeavyDamageGenerateNoteArgs,
  HeavyDamageGetArgs,
  HeavyDamagePreviewArgs,
  HeavyDamageSaveArgs,
  KnowledgeImportCommitInput,
  KnowledgeImportDryRunPlanArgs,
  LaborDistributeExcelArgs,
  LaborInspectExcelArgs,
  KnowledgeSearchQuery,
  LaborLearningAdminKey,
  LaborLearningUpdateInput,
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
import { UserKnowledgeStoreFile } from './local-cache/user-knowledge-store';
import { assertSafeCasePath } from './security';
import type { LogLevel } from './debug-logger';
import type { KnowledgeSearchResponse, KnowledgeSearchResult } from '../shared/knowledge';
import { AiTaskQueueService } from './services/ai/ai-task-queue-service';
import { KnowledgeSearchService } from './services/knowledge/knowledge-search-service';
import { searchUserKnowledgeEntries, mergeUserKnowledgeIntoResponse } from './services/knowledge/user-knowledge-search-service';
import { buildDryRunPlan } from './services/knowledge/knowledge-import-planner';
import { chooseFilesForKnowledgeImportDryRun } from './services/knowledge/knowledge-import-dry-run-service';
import { previewTextFileForKnowledgeImport } from './services/knowledge/knowledge-import-text-preview-service';
import { commitApprovedKnowledgeImportTextPreview } from './services/knowledge/knowledge-import-commit-service';
import {
  CasesQueryService,
  ConflictResolverService,
  DeploymentService,
  ExcelWorkflowService,
  FoldersService,
  HeavyDamageAssessmentService,
  IpcDomainContext,
  LaborLearningAdminService,
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
  private readonly laborLearning: LaborLearningAdminService;
  private readonly aiQueue: AiTaskQueueService;
  private readonly knowledge: KnowledgeSearchService;
  private readonly heavyDamage: HeavyDamageAssessmentService;
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
    this.laborLearning = new LaborLearningAdminService(this.context);
    this.aiQueue = new AiTaskQueueService();
    this.aiQueue.start();
    this.knowledge = new KnowledgeSearchService();
    this.heavyDamage = new HeavyDamageAssessmentService(this.context, this.cases);
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
    ipcMain.handle(IPC.laborLearningList, () => this.safe(() => this.laborLearning.list()));
    ipcMain.handle(IPC.laborLearningUpdate, (_event, args: LaborLearningUpdateInput) => this.safe(() => this.laborLearning.update(args)));
    ipcMain.handle(IPC.laborLearningDisable, (_event, args: LaborLearningAdminKey) => this.safe(() => this.laborLearning.disable(args)));
    ipcMain.handle(IPC.laborLearningEnable, (_event, args: LaborLearningAdminKey) => this.safe(() => this.laborLearning.enable(args)));
    ipcMain.handle(IPC.laborLearningDelete, (_event, args: LaborLearningAdminKey) => this.safe(() => this.laborLearning.delete(args)));
    ipcMain.handle(IPC.laborLearningExport, () => this.safe(() => this.laborLearning.export()));
    ipcMain.handle(IPC.laborLearningImport, () => this.safe(() => this.laborLearning.import()));
    ipcMain.handle(IPC.aiQueueGetSnapshot, () => this.safe(async () => this.aiQueue.getSnapshot()));
    ipcMain.handle(IPC.aiQueueGetEvents, (_event, limit?: number) => this.safe(async () => this.aiQueue.getEvents(Number(limit))));
    ipcMain.handle(IPC.aiQueueGetTask, (_event, queueTaskId: string) => this.safe(async () => this.aiQueue.getTask(String(queueTaskId || '')) ?? null));
    ipcMain.handle(IPC.aiQueueEnqueuePreview, (_event, args: AiQueueEnqueuePreviewArgs) => this.safe(async () => this.aiQueue.enqueue(buildSafeAiQueuePreviewRequest(args), buildSafeAiQueueOptions(args))));
    ipcMain.handle(IPC.aiQueueCancelTask, (_event, queueTaskId: string, reason?: string) => this.safe(async () => this.aiQueue.cancelTask(String(queueTaskId || ''), safeShortText(reason, 'Kullanici istegiyle iptal edildi.'))));
    ipcMain.handle(IPC.aiQueueClearFinished, () => this.safe(async () => this.aiQueue.clearFinished()));
    ipcMain.handle(IPC.knowledgeSearch, (_event, query: KnowledgeSearchQuery | string) => this.safe(async () => this.searchKnowledgeWithUserStore(query)));
    ipcMain.handle(IPC.knowledgeListSources, () => this.safe(async () => this.knowledge.listSources()));
    ipcMain.handle(IPC.knowledgeGetSource, (_event, sourceId: string) => this.safe(async () => this.knowledge.getSource(String(sourceId || ''))));
    ipcMain.handle(IPC.knowledgeGetChunk, (_event, chunkId: string) => this.safe(async () => this.knowledge.getChunk(String(chunkId || ''))));
    ipcMain.handle(IPC.knowledgeImportDryRunPlan, (_event, args: KnowledgeImportDryRunPlanArgs) => this.safe(async () => buildSafeKnowledgeImportDryRunPlan(args)));
    ipcMain.handle(IPC.knowledgeImportChooseFilesDryRun, () => this.safe(async () => chooseFilesForKnowledgeImportDryRun(this.mainWindowProvider())));
    ipcMain.handle(IPC.knowledgeImportPreviewTextFile, () => this.safe(async () => previewTextFileForKnowledgeImport(this.mainWindowProvider())));
    ipcMain.handle(IPC.knowledgeImportCommitApprovedTextPreview, (_event, args: KnowledgeImportCommitInput) => this.safe(async () => commitApprovedKnowledgeImportTextPreview(this.cache.cacheRoot, args)));
    ipcMain.handle(IPC.heavyDamagePreview, (_event, args: HeavyDamagePreviewArgs) => this.safe(() => this.heavyDamage.preview(args)));
    ipcMain.handle(IPC.heavyDamageGet, (_event, args: HeavyDamageGetArgs) => this.safe(() => this.heavyDamage.get(args)));
    ipcMain.handle(IPC.heavyDamageSave, (_event, args: HeavyDamageSaveArgs) => this.safe(() => this.heavyDamage.save(args)));
    ipcMain.handle(IPC.heavyDamageClear, (_event, args: HeavyDamageClearArgs) => this.safe(() => this.heavyDamage.clear(args)));
    ipcMain.handle(IPC.heavyDamageGenerateNote, (_event, args: HeavyDamageGenerateNoteArgs) => this.safe(() => this.heavyDamage.generateNote(args)));
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

  // P4-E3: Seed (yerlesik) aramaya, AppData altindaki kullanici bilgi deposunu SALT-OKUNUR dahil eder.
  // Yalniz UserKnowledgeStoreFile.read kullanilir; bu yolda YAZMA/commit/silme yoktur. Depo yok/bos/bozuksa
  // veya okuma hatasi olursa seed arama calismaya devam eder; kullanici sonucu 0 olur ve gerekirse uyari eklenir.
  private async searchKnowledgeWithUserStore(query: KnowledgeSearchQuery | string): Promise<KnowledgeSearchResponse> {
    const seed = this.knowledge.search(query);
    let userResults: KnowledgeSearchResult[] = [];
    let entryCount = 0;
    let available = true;
    let readError: string | undefined;
    try {
      const store = await new UserKnowledgeStoreFile(this.cache.cacheRoot).read();
      entryCount = store.entries.length;
      userResults = searchUserKnowledgeEntries(store.entries, query);
    } catch {
      available = false;
      readError = 'Kullanıcı bilgi deposu okunamadı.';
    }
    return mergeUserKnowledgeIntoResponse(seed, userResults, { available, entryCount, matchedCount: userResults.length, ...(readError ? { readError } : {}) });
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

function buildSafeAiQueuePreviewRequest(args: AiQueueEnqueuePreviewArgs): AiTaskRequest {
  const taskType = normalizeAiTaskType(args?.taskType);
  return {
    taskId: safeShortText(args?.taskId, `ai-preview-${randomUUID()}`),
    taskType,
    ...(args?.caseId ? { caseId: safeShortText(args.caseId, '') } : {}),
    ...(args?.plate ? { plate: safeShortText(args.plate, '') } : {}),
    ...(args?.claimNo ? { claimNo: safeShortText(args.claimNo, '') } : {}),
    input: plainRecord(args?.input),
    ...(isPlainRecord(args?.context) ? { context: plainRecord(args.context) } : {}),
    privacyLevel: 'local_only',
    providerPolicy: {
      allowPaidProviders: false,
      allowExternalProviders: false,
      allowLocalModel: false,
      preferDeterministicRules: true
    },
    requiresUserApproval: true,
    createdAt: new Date().toISOString()
  };
}

function buildSafeAiQueueOptions(args: AiQueueEnqueuePreviewArgs | undefined): AiTaskQueueEnqueueOptions {
  const timeoutMs = sanitizePositiveInteger(args?.timeoutMs);
  return {
    ...(timeoutMs ? { timeoutMs } : {}),
    priority: args?.priority === 'high' || args?.priority === 'low' ? args.priority : 'normal'
  };
}

function normalizeAiTaskType(value: unknown): AiTaskType {
  return typeof value === 'string' && (AI_TASK_TYPES as readonly string[]).includes(value) ? value as AiTaskType : 'generic_rule_assist';
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 200));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizePositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

/**
 * v0.6.0 P3-G: read-only dry-run import plani. Yalniz dosya-adi/boyut metadata kullanilir; filePath kabul edilmez,
 * dosya icerigi okunmaz, parser/OCR yok ve plan canWrite=false doner. Saf buildDryRunPlan planlayicisi cagrilir.
 */
function buildSafeKnowledgeImportDryRunPlan(args: KnowledgeImportDryRunPlanArgs) {
  const files = (Array.isArray(args?.files) ? args.files : []).slice(0, 200)
    .map((file) => {
      const fileName = typeof file?.fileName === 'string' ? file.fileName.replace(/\s+/g, ' ').trim().slice(0, 260) : '';
      const sizeBytes = Number(file?.sizeBytes);
      return Number.isFinite(sizeBytes) && sizeBytes >= 0 ? { fileName, sizeBytes: Math.floor(sizeBytes) } : { fileName };
    })
    .filter((file) => file.fileName.length > 0);
  return buildDryRunPlan({
    mode: 'dry_run',
    files,
    ...(typeof args?.preferredSourceKind === 'string' && args.preferredSourceKind ? { preferredSourceKind: args.preferredSourceKind } : {}),
    ...(Array.isArray(args?.preferredTags) ? { preferredTags: args.preferredTags } : {})
  });
}

function safeShortText(value: unknown, fallback: string): string {
  const cleaned = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    : '';
  return cleaned || fallback;
}
