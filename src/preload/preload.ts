import { contextBridge, ipcRenderer } from 'electron';
import { IPC_INVOKE_CHANNELS as IPC, IPC_SEND_CHANNELS } from '../shared/ipc-contract';
import type {
  ApiResult,
  CaseListExportExcelArgs,
  HasarbotuApi,
  HeavyDamageClearArgs,
  HeavyDamageGenerateNoteArgs,
  HeavyDamageGetArgs,
  HeavyDamagePreviewArgs,
  HeavyDamageSaveArgs,
  LaborAutoSaveArgs,
  LaborLearningAdminKey,
  LaborLearningUpdateInput,
  LaborDistributeExcelArgs,
  LaborInspectExcelArgs,
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
import type { AppSettings, ConflictResolutionArgs } from '../shared/types';

const validSendChannels = new Set<string>(IPC_SEND_CHANNELS);

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<ApiResult<T>>;

const api: HasarbotuApi = {
  getSettings: <T>() => invoke<T>(IPC.settingsGet),
  saveSettings: <T>(settings: AppSettings) => invoke<T>(IPC.settingsSave, settings),
  chooseRoot: <T>() => invoke<T>(IPC.settingsChooseRoot),
  getDashboard: <T>() => invoke<T>(IPC.dashboardGet),
  listCases: <T>() => invoke<T>(IPC.casesList),
  getCase: <T>(folderPath: string) => invoke<T>(IPC.casesGet, folderPath),
  refreshCase: <T>(folderPath: string) => invoke<T>(IPC.casesRefreshOne, folderPath),
  listFolders: <T>(folderPath?: string) => invoke<T>(IPC.folderList, folderPath),
  scanNow: <T>() => invoke<T>(IPC.scanStart),
  cancelScan: <T>() => invoke<T>(IPC.scanCancel),
  getPhotoThumbnail: <T>(filePath: string) => invoke<T>(IPC.photoGetThumbnail, filePath),
  chooseLaborExcel: <T>() => invoke<T>(IPC.laborChooseExcel),
  inspectLaborExcel: <T>(args: LaborInspectExcelArgs) => invoke<T>(IPC.laborInspectExcel, args),
  distributeLaborExcel: <T>(args: LaborDistributeExcelArgs) => invoke<T>(IPC.laborDistributeExcel, args),
  analyzePartsPhoto: <T>(args?: PartsAnalyzePhotoArgs) => invoke<T>(IPC.partsAnalyzePhoto, args),
  autoLaborPreview: <T>() => invoke<T>(IPC.laborAutoPreview),
  autoLaborSave: <T>(args: LaborAutoSaveArgs) => invoke<T>(IPC.laborAutoSave, args),
  laborLearningList: <T>() => invoke<T>(IPC.laborLearningList),
  laborLearningUpdate: <T>(args: LaborLearningUpdateInput) => invoke<T>(IPC.laborLearningUpdate, args),
  laborLearningDisable: <T>(args: LaborLearningAdminKey) => invoke<T>(IPC.laborLearningDisable, args),
  laborLearningEnable: <T>(args: LaborLearningAdminKey) => invoke<T>(IPC.laborLearningEnable, args),
  laborLearningDelete: <T>(args: LaborLearningAdminKey) => invoke<T>(IPC.laborLearningDelete, args),
  laborLearningExport: <T>() => invoke<T>(IPC.laborLearningExport),
  laborLearningImport: <T>() => invoke<T>(IPC.laborLearningImport),
  heavyDamagePreview: <T>(args: HeavyDamagePreviewArgs) => invoke<T>(IPC.heavyDamagePreview, args),
  heavyDamageGet: <T>(args: HeavyDamageGetArgs) => invoke<T>(IPC.heavyDamageGet, args),
  heavyDamageSave: <T>(args: HeavyDamageSaveArgs) => invoke<T>(IPC.heavyDamageSave, args),
  heavyDamageClear: <T>(args: HeavyDamageClearArgs) => invoke<T>(IPC.heavyDamageClear, args),
  heavyDamageGenerateNote: <T>(args: HeavyDamageGenerateNoteArgs) => invoke<T>(IPC.heavyDamageGenerateNote, args),
  getPartUserTerms: <T>() => invoke<T>(IPC.partsGetUserTerms),
  learnPartTerm: <T>(args: PartsLearnTermArgs) => invoke<T>(IPC.partsLearnTerm, args),
  exportPartsLaborExcel: <T>(args: PartsExportLaborArgs) => invoke<T>(IPC.partsExportLaborExcel, args),
  exportCaseListExcel: <T>(args: CaseListExportExcelArgs) => invoke<T>(IPC.casesExportExcel, args),
  updateChecklist: <T>(args: TrackingUpdateChecklistArgs) => invoke<T>(IPC.trackingUpdateChecklist, args),
  addTodo: <T>(args: TrackingAddTodoArgs) => invoke<T>(IPC.trackingAddTodo, args),
  updateTodo: <T>(args: TrackingUpdateTodoArgs) => invoke<T>(IPC.trackingUpdateTodo, args),
  deleteTodo: <T>(args: TrackingDeleteTodoArgs) => invoke<T>(IPC.trackingDeleteTodo, args),
  addNote: <T>(args: TrackingAddNoteArgs) => invoke<T>(IPC.trackingAddNote, args),
  updateNote: <T>(args: TrackingUpdateNoteArgs) => invoke<T>(IPC.trackingUpdateNote, args),
  deleteNote: <T>(args: TrackingDeleteNoteArgs) => invoke<T>(IPC.trackingDeleteNote, args),
  resolveConflict: <T>(args: ConflictResolutionArgs) => invoke<T>(IPC.trackingResolveConflict, args),
  inspectConflictCopy: <T>(folderPath: string) => invoke<T>(IPC.trackingInspectConflictCopy, folderPath),
  acceptDiskBaseline: <T>(folderPath: string) => invoke<T>(IPC.trackingAcceptDiskBaseline, folderPath),
  updateField: <T>(args: TrackingUpdateFieldArgs) => invoke<T>(IPC.trackingUpdateField, args),
  openFolder: <T>(folderPath: string) => invoke<T>(IPC.systemOpenFolder, folderPath),
  getHealth: <T>() => invoke<T>(IPC.healthGet),
  getDeploymentStatus: <T>() => invoke<T>(IPC.deploymentGetStatus),
  registerDeploymentClient: <T>() => invoke<T>(IPC.deploymentRegisterClient),
  on: (channel: string, callback: (payload: unknown) => void) => {
    if (!validSendChannels.has(channel)) return () => undefined;
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
};

contextBridge.exposeInMainWorld('hasarbotu', api);
