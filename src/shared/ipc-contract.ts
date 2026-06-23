import type {
  ApiResult,
  AppSettings,
  AutoLaborCategory,
  AutoLaborColumnInfo,
  AutoLaborPreview,
  AutoLaborSaveResult,
  CaseIndexItem,
  CaseListExportResult,
  CaseListExportRow,
  ConflictResolutionArgs,
  ConflictTrackingCopyInfo,
  DashboardSummary,
  DebugHealthReport,
  DeploymentStatus,
  PartsPhotoAnalysis,
  ExcelLaborDistributeResult,
  ExcelLaborPreview,
  FolderBrowseResult,
  ScanReport,
  ThumbnailResult,
  TrackingFile,
  TrackingWriteResult
} from './types';
import type { VehicleContext } from './vehicle/vehicle-context';
import type { UserPartTerm } from './parca-sozlugu';
import type { LaborLearningAdminKey, LaborLearningEntry, LaborLearningExportResult, LaborLearningImportResult, LaborLearningUpdateInput } from './labor-learning-dictionary';
import type { HeavyDamageAssessmentPreview, HeavyDamageAssessmentRecord, HeavyDamageClearArgs, HeavyDamageGenerateNoteArgs, HeavyDamageGetArgs, HeavyDamagePreviewArgs, HeavyDamageSaveArgs } from './heavy-damage-types';
import type { AiQueueHistoryEvent, AiQueuedTask, AiTaskQueuePriority, AiTaskQueueSnapshot } from './ai/ai-queue-types';
import type { AiPrivacyLevel, AiTaskType } from './ai/ai-task-types';
import type { KnowledgeChunk, KnowledgeImportCommitInput, KnowledgeImportCommitResult, KnowledgeImportDryRunResponse, KnowledgeImportTextPreview, KnowledgeSearchQuery, KnowledgeSearchResponse, KnowledgeSource } from './knowledge';

export type { ApiResult };
export type { LaborLearningAdminKey, LaborLearningEntry, LaborLearningExportResult, LaborLearningImportResult, LaborLearningUpdateInput } from './labor-learning-dictionary';
export type { HeavyDamageAssessmentPreview, HeavyDamageAssessmentRecord, HeavyDamageClearArgs, HeavyDamageGenerateNoteArgs, HeavyDamageGetArgs, HeavyDamagePreviewArgs, HeavyDamageSaveArgs } from './heavy-damage-types';
export type { AiQueueHistoryEvent, AiQueuedTask, AiTaskQueuePriority, AiTaskQueueSnapshot } from './ai/ai-queue-types';
export type { AiPrivacyLevel, AiTaskType } from './ai/ai-task-types';
export type { KnowledgeChunk, KnowledgeImportCommitInput, KnowledgeImportCommitResult, KnowledgeImportDryRunResponse, KnowledgeImportTextPreview, KnowledgeSearchQuery, KnowledgeSearchResponse, KnowledgeSource } from './knowledge';

export const IPC_INVOKE_CHANNELS = {
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsChooseRoot: 'settings:choose-root',
  dashboardGet: 'dashboard:get',
  casesList: 'cases:list',
  casesGet: 'cases:get',
  casesRefreshOne: 'cases:refresh-one',
  folderList: 'folder:list',
  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  photoGetThumbnail: 'photo:get-thumbnail',
  laborChooseExcel: 'labor:choose-excel',
  laborInspectExcel: 'labor:inspect-excel',
  laborDistributeExcel: 'labor:distribute-excel',
  partsAnalyzePhoto: 'parts:analyze-photo',
  partsGetUserTerms: 'parts:get-user-terms',
  partsLearnTerm: 'parts:learn-term',
  partsExportLaborExcel: 'parts:export-labor-excel',
  laborAutoPreview: 'labor:auto-preview',
  laborAutoSave: 'labor:auto-save',
  laborLearningList: 'labor-learning:list',
  laborLearningUpdate: 'labor-learning:update',
  laborLearningDisable: 'labor-learning:disable',
  laborLearningEnable: 'labor-learning:enable',
  laborLearningDelete: 'labor-learning:delete',
  laborLearningExport: 'labor-learning:export',
  laborLearningImport: 'labor-learning:import',
  aiQueueGetSnapshot: 'aiQueue:getSnapshot',
  aiQueueGetEvents: 'aiQueue:getEvents',
  aiQueueGetTask: 'aiQueue:getTask',
  aiQueueEnqueuePreview: 'aiQueue:enqueuePreview',
  aiQueueCancelTask: 'aiQueue:cancelTask',
  aiQueueClearFinished: 'aiQueue:clearFinished',
  knowledgeSearch: 'knowledge:search',
  knowledgeListSources: 'knowledge:listSources',
  knowledgeGetSource: 'knowledge:getSource',
  knowledgeGetChunk: 'knowledge:getChunk',
  knowledgeImportDryRunPlan: 'knowledge-import:dry-run-plan',
  knowledgeImportChooseFilesDryRun: 'knowledge-import:choose-files-dry-run',
  knowledgeImportPreviewTextFile: 'knowledge-import:preview-text-file',
  knowledgeImportCommitApprovedTextPreview: 'knowledge-import:commit-approved-text-preview',
  heavyDamagePreview: 'heavy-damage:preview',
  heavyDamageGet: 'heavy-damage:get',
  heavyDamageSave: 'heavy-damage:save',
  heavyDamageClear: 'heavy-damage:clear',
  heavyDamageGenerateNote: 'heavy-damage:generate-note',
  casesExportExcel: 'cases:export-excel',
  trackingUpdateChecklist: 'tracking:update-checklist',
  trackingAddTodo: 'tracking:add-todo',
  trackingUpdateTodo: 'tracking:update-todo',
  trackingDeleteTodo: 'tracking:delete-todo',
  trackingAddNote: 'tracking:add-note',
  trackingUpdateNote: 'tracking:update-note',
  trackingDeleteNote: 'tracking:delete-note',
  trackingUpdateField: 'tracking:update-field',
  trackingResolveConflict: 'tracking:resolve-conflict',
  trackingInspectConflictCopy: 'tracking:inspect-conflict-copy',
  trackingAcceptDiskBaseline: 'tracking:accept-disk-baseline',
  systemOpenFolder: 'system:open-folder',
  healthGet: 'health:get',
  deploymentGetStatus: 'deployment:get-status',
  deploymentRegisterClient: 'deployment:register-client'
} as const;

export const IPC_SEND_CHANNEL = {
  scanFinished: 'scan:finished',
  caseUpdated: 'case:updated',
  menuCommand: 'menu:command'
} as const;

export const IPC_SEND_CHANNELS = Object.values(IPC_SEND_CHANNEL);

export type IpcInvokeChannel = typeof IPC_INVOKE_CHANNELS[keyof typeof IPC_INVOKE_CHANNELS];
export type IpcSendChannel = typeof IPC_SEND_CHANNEL[keyof typeof IPC_SEND_CHANNEL];

export interface TrackingMutationArgsBase {
  folderPath: string;
  expectedRevision: number;
  expectedWriteId?: string;
  allowClosedMutation?: boolean;
}

export interface LaborInspectExcelArgs {
  filePath: string;
  targetTotal?: number;
  targetColumn?: string;
  usePriceList?: boolean;
}

export interface LaborDistributeExcelArgs {
  filePath: string;
  targetTotal: number;
  targetColumn?: string;
  allowRiskyColumn?: boolean;
  allowFormulaReplacement?: boolean;
  allowEqualDistribution?: boolean;
  usePriceList?: boolean;
  /** Kullanıcının uygulama içi tabloda elle değiştirdiği satır tutarları. */
  overrides?: Array<{ rowNumber: number; amount: number }>;
}

export interface PartsLearnTermArgs {
  alias: string;
  canonical: string;
  category?: string;
  laborPart?: string;
}

export interface PartsExportLaborArgs {
  rows: Array<{ description: string; partAmount: number; laborAmount: number }>;
}

/** v0.6.0 P1-B: read-only/preview AI queue IPC argümanları. Kalıcı yazma endpoint'i değildir. */
export interface AiQueueEnqueuePreviewArgs {
  taskId?: string;
  taskType: AiTaskType;
  caseId?: string;
  plate?: string;
  claimNo?: string;
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
  privacyLevel?: AiPrivacyLevel;
  timeoutMs?: number;
  priority?: AiTaskQueuePriority;
}

/** v0.4.7: Parça fotoğrafı okumada aktif dosya bağlamı — yanlış plakalı fotoğrafı engellemek için. */
export interface PartsAnalyzePhotoArgs {
  activePlate?: string;
  activeFolderPath?: string;
  /** v0.6.2: Aktif dosyanın AI-güvenli araç bağlamı (Şase/Motor HARİÇ). Yerel uyum değerlendirmesi için. */
  vehicleContext?: Omit<VehicleContext, 'chassisNo' | 'engineNo'>;
}

/** v0.4.11: AI İşçilik Dağıtıcı — kaydetme argümanları. */
export interface LaborAutoSaveArgs {
  filePath: string;
  rows: Array<{ rowNumber: number; amounts: Partial<Record<AutoLaborCategory, number>> }>;
  columns: AutoLaborColumnInfo[];
  allowFormulaReplacement?: boolean;
  /** Önizlemede kontrol gerekli işaretlenen satır sayısı; kayıt raporunda kullanıcıya geri verilir. */
  needsReviewRows?: number;
  /** Kullanıcının elle düzelttiği satırlar — öğrenen sözlüğe kaydedilir. */
  corrections?: Array<{ alias: string; partCode?: string; categories: AutoLaborCategory[]; amounts?: Partial<Record<AutoLaborCategory, number>>; amountLogic?: string; reason?: string }>;
}

export interface CaseListExportExcelArgs {
  rows: CaseListExportRow[];
}

/** v0.6.0 P3-G: read-only dry-run import plan IPC argumanlari. Yalniz dosya-adi metadata; icerik okunmaz, canWrite=false. */
export interface KnowledgeImportDryRunPlanArgs {
  files: Array<{ fileName: string; sizeBytes?: number }>;
  preferredSourceKind?: string;
  preferredTags?: string[];
}

export type TrackingUpdateChecklistArgs = TrackingMutationArgsBase & { key: string; completed: boolean };
export type TrackingAddTodoArgs = TrackingMutationArgsBase & { id?: string; title: string; priority: string; assignedTo: string; dueDate: string };
export type TrackingUpdateTodoArgs = TrackingMutationArgsBase & { id: string; completed?: boolean; title?: string; priority?: string; assignedTo?: string; dueDate?: string };
export type TrackingDeleteTodoArgs = TrackingMutationArgsBase & { id: string };
export type TrackingAddNoteArgs = TrackingMutationArgsBase & { id?: string; text: string };
export type TrackingUpdateNoteArgs = TrackingMutationArgsBase & { id: string; text: string };
export type TrackingDeleteNoteArgs = TrackingMutationArgsBase & { id: string };
export type TrackingUpdateFieldArgs = TrackingMutationArgsBase & { path: string; value: unknown };

export interface HasarbotuApi {
  getSettings<T = AppSettings>(): Promise<ApiResult<T>>;
  saveSettings<T = AppSettings>(settings: AppSettings): Promise<ApiResult<T>>;
  chooseRoot<T = AppSettings>(): Promise<ApiResult<T>>;
  getDashboard<T = DashboardSummary>(): Promise<ApiResult<T>>;
  listCases<T = CaseIndexItem[]>(): Promise<ApiResult<T>>;
  getCase<T = CaseIndexItem | null>(folderPath: string): Promise<ApiResult<T>>;
  refreshCase<T = CaseIndexItem>(folderPath: string): Promise<ApiResult<T>>;
  listFolders<T = FolderBrowseResult>(folderPath?: string): Promise<ApiResult<T>>;
  scanNow<T = ScanReport>(): Promise<ApiResult<T>>;
  cancelScan<T = boolean>(): Promise<ApiResult<T>>;
  getPhotoThumbnail<T = ThumbnailResult>(filePath: string): Promise<ApiResult<T>>;
  chooseLaborExcel<T = ExcelLaborPreview | null>(): Promise<ApiResult<T>>;
  inspectLaborExcel<T = ExcelLaborPreview>(args: LaborInspectExcelArgs): Promise<ApiResult<T>>;
  distributeLaborExcel<T = ExcelLaborDistributeResult>(args: LaborDistributeExcelArgs): Promise<ApiResult<T>>;
  analyzePartsPhoto<T = PartsPhotoAnalysis>(args?: PartsAnalyzePhotoArgs): Promise<ApiResult<T>>;
  autoLaborPreview<T = AutoLaborPreview>(): Promise<ApiResult<T>>;
  autoLaborSave<T = AutoLaborSaveResult>(args: LaborAutoSaveArgs): Promise<ApiResult<T>>;
  laborLearningList<T = LaborLearningEntry[]>(): Promise<ApiResult<T>>;
  laborLearningUpdate<T = LaborLearningEntry[]>(args: LaborLearningUpdateInput): Promise<ApiResult<T>>;
  laborLearningDisable<T = LaborLearningEntry[]>(args: LaborLearningAdminKey): Promise<ApiResult<T>>;
  laborLearningEnable<T = LaborLearningEntry[]>(args: LaborLearningAdminKey): Promise<ApiResult<T>>;
  laborLearningDelete<T = LaborLearningEntry[]>(args: LaborLearningAdminKey): Promise<ApiResult<T>>;
  laborLearningExport<T = LaborLearningExportResult>(): Promise<ApiResult<T>>;
  laborLearningImport<T = LaborLearningImportResult>(): Promise<ApiResult<T>>;
  getAiQueueSnapshot<T = AiTaskQueueSnapshot>(): Promise<ApiResult<T>>;
  getAiQueueEvents<T = AiQueueHistoryEvent[]>(limit?: number): Promise<ApiResult<T>>;
  getAiQueueTask<T = AiQueuedTask | null>(queueTaskId: string): Promise<ApiResult<T>>;
  enqueueAiPreview<T = AiQueuedTask>(args: AiQueueEnqueuePreviewArgs): Promise<ApiResult<T>>;
  cancelAiQueueTask<T = boolean>(queueTaskId: string, reason?: string): Promise<ApiResult<T>>;
  clearAiQueueFinished<T = number>(): Promise<ApiResult<T>>;
  searchKnowledge<T = KnowledgeSearchResponse>(query: KnowledgeSearchQuery | string): Promise<ApiResult<T>>;
  listKnowledgeSources<T = KnowledgeSource[]>(): Promise<ApiResult<T>>;
  getKnowledgeSource<T = KnowledgeSource | null>(sourceId: string): Promise<ApiResult<T>>;
  getKnowledgeChunk<T = KnowledgeChunk | null>(chunkId: string): Promise<ApiResult<T>>;
  dryRunKnowledgeImportPlan<T = KnowledgeImportDryRunResponse>(args: KnowledgeImportDryRunPlanArgs): Promise<ApiResult<T>>;
  chooseFilesForKnowledgeImportDryRun<T = KnowledgeImportDryRunResponse | null>(): Promise<ApiResult<T>>;
  previewTextFileForKnowledgeImport<T = KnowledgeImportTextPreview | null>(): Promise<ApiResult<T>>;
  commitApprovedKnowledgeImportTextPreview<T = KnowledgeImportCommitResult>(args: KnowledgeImportCommitInput): Promise<ApiResult<T>>;
  heavyDamagePreview<T = HeavyDamageAssessmentPreview>(args: HeavyDamagePreviewArgs): Promise<ApiResult<T>>;
  heavyDamageGet<T = HeavyDamageAssessmentRecord | null>(args: HeavyDamageGetArgs): Promise<ApiResult<T>>;
  heavyDamageSave<T = TrackingWriteResult>(args: HeavyDamageSaveArgs): Promise<ApiResult<T>>;
  heavyDamageClear<T = TrackingWriteResult>(args: HeavyDamageClearArgs): Promise<ApiResult<T>>;
  heavyDamageGenerateNote<T = string>(args: HeavyDamageGenerateNoteArgs): Promise<ApiResult<T>>;
  getPartUserTerms<T = UserPartTerm[]>(): Promise<ApiResult<T>>;
  learnPartTerm<T = UserPartTerm[]>(args: PartsLearnTermArgs): Promise<ApiResult<T>>;
  exportPartsLaborExcel<T = CaseListExportResult>(args: PartsExportLaborArgs): Promise<ApiResult<T>>;
  exportCaseListExcel<T = CaseListExportResult>(args: CaseListExportExcelArgs): Promise<ApiResult<T>>;
  updateChecklist<T = TrackingWriteResult>(args: TrackingUpdateChecklistArgs): Promise<ApiResult<T>>;
  addTodo<T = TrackingWriteResult>(args: TrackingAddTodoArgs): Promise<ApiResult<T>>;
  updateTodo<T = TrackingWriteResult>(args: TrackingUpdateTodoArgs): Promise<ApiResult<T>>;
  deleteTodo<T = TrackingWriteResult>(args: TrackingDeleteTodoArgs): Promise<ApiResult<T>>;
  addNote<T = TrackingWriteResult>(args: TrackingAddNoteArgs): Promise<ApiResult<T>>;
  updateNote<T = TrackingWriteResult>(args: TrackingUpdateNoteArgs): Promise<ApiResult<T>>;
  deleteNote<T = TrackingWriteResult>(args: TrackingDeleteNoteArgs): Promise<ApiResult<T>>;
  resolveConflict<T = TrackingWriteResult>(args: ConflictResolutionArgs): Promise<ApiResult<T>>;
  inspectConflictCopy<T = ConflictTrackingCopyInfo>(folderPath: string): Promise<ApiResult<T>>;
  acceptDiskBaseline<T = { ok: boolean; tracking: TrackingFile }>(folderPath: string): Promise<ApiResult<T>>;
  updateField<T = TrackingWriteResult>(args: TrackingUpdateFieldArgs): Promise<ApiResult<T>>;
  openFolder<T = boolean>(folderPath: string): Promise<ApiResult<T>>;
  getHealth<T = DebugHealthReport>(): Promise<ApiResult<T>>;
  getDeploymentStatus<T = DeploymentStatus>(): Promise<ApiResult<T>>;
  registerDeploymentClient<T = DeploymentStatus>(): Promise<ApiResult<T>>;
  on(channel: string, callback: (payload: unknown) => void): () => void;
}
