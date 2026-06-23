import type { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSettings, CaseIndexFile } from '../../shared/types';
import { inferYearFromRootPath } from '../../shared/constants';
import { LocalCacheStore } from '../local-cache/local-cache-store';
import { PcloudYearScanner } from '../scanner/pcloud-year-scanner';
import { TrackingFileService } from '../tracking/tracking-file-service';
import { assertSafeCasePath } from '../security';
import { safeFileDisplayName } from '../../shared/turkish';
import { chooseTrackingItemId } from '../../shared/tracking-item-id';
import { nowIso } from '../tracking/tracking-defaults';
import { CLAIM_TYPES, DOSYA_DURUMLARI, PRIORITIES, WORKFLOW_STATUSES } from '../../shared/workflow';
import { VEHICLE_CONTEXT_FIELDS } from '../../shared/vehicle/vehicle-context';
import { normalizeSettings } from './settings-normalizer';
import { existsDirectory } from './fs-utils';

// v0.4.8 Barrel: ipc.ts ve diğer importlar bu modülden okumaya devam etsin diye taşınan
// servisler ve yardımcılar buradan yeniden dışa aktarılır (davranış değişmez).
export { existsDirectory } from './fs-utils';
export { ExcelWorkflowService } from './excel-workflow-service';
export { LaborLearningAdminService } from './labor-learning-admin-service';
export { HeavyDamageAssessmentService } from './heavy-damage-assessment-service';
export { DeploymentService } from './deployment-service';
export { FoldersService } from './folders-service';
export { SettingsService } from './settings-service';
export { ConflictResolverService } from './conflict-resolver-service';
export { CasesQueryService } from './cases-query-service';
import type { CasesQueryService } from './cases-query-service';
import type { LogLevel } from '../debug-logger';
import type { TrackingMutationArgsBase } from '../../shared/ipc-contract';

export type MutationArgsBase = TrackingMutationArgsBase;

export interface IpcLogger { log(level: LogLevel, message: string, details?: unknown): Promise<void>; }

export interface IpcRuntimeState {
  settings: AppSettings | null;
  index: CaseIndexFile | null;
  rootAvailable: boolean;
  lastScanAt: string;
  currentScanner: PcloudYearScanner | null;
  approvedExcelFiles: Set<string>;
  refreshTrackingPromise: Promise<void> | null;
  lastTrackingRefreshAt: number;
}

export function createIpcRuntimeState(): IpcRuntimeState {
  return {
    settings: null,
    index: null,
    rootAvailable: false,
    lastScanAt: '',
    currentScanner: null,
    approvedExcelFiles: new Set<string>(),
    refreshTrackingPromise: null,
    lastTrackingRefreshAt: 0
  };
}

export class IpcDomainContext {
  readonly tracking: TrackingFileService;

  constructor(
    readonly cache: LocalCacheStore,
    readonly state: IpcRuntimeState,
    readonly mainWindowProvider: () => BrowserWindow | null,
    readonly logger?: IpcLogger
  ) {
    this.tracking = new TrackingFileService(cache.locksDir);
  }

  async readSettingsFromDisk(): Promise<AppSettings> {
    this.state.settings = normalizeSettings(await this.cache.getSettings());
    return this.state.settings;
  }

  async getSettings(): Promise<AppSettings> {
    if (!this.state.settings) this.state.settings = normalizeSettings(await this.cache.getSettings());
    return this.state.settings;
  }

  async ensureLoaded(): Promise<void> {
    if (!this.state.settings) this.state.settings = normalizeSettings(await this.cache.getSettings());
    if (!this.state.index) this.state.index = await this.cache.readIndex(inferYearFromRootPath(this.state.settings.rootPath, 2026));
    this.state.rootAvailable = await existsDirectory(this.state.settings.rootPath);
  }

  async clearCacheForRootChange(previousRoot: string, nextRoot: string): Promise<void> {
    const previousYear = inferYearFromRootPath(previousRoot, 2026);
    const nextYear = inferYearFromRootPath(nextRoot, previousYear);
    await this.cache.clearYearCache(previousYear);
    if (nextYear !== previousYear) await this.cache.clearYearCache(nextYear);
  }
}

/**
 * v0.4.1 Klasörler: pCloud klasör ağacının YALNIZCA-OKUNUR pasif gezgini.
 * Yalnızca fs.readdir/stat/readFile kullanır; hiçbir koşulda klasör/dosya oluşturmaz,
 * silmez, yeniden adlandırmaz veya değiştirmez. _HASARBOTU/takip.json ASLA üretilmez.
 * Her gezinme adımında en fazla bir dizin okuması + (dosya klasöründe) takip.json okuması yapar.
 */
// FoldersService (+ isCaseFolderFromEntries/buildCaseGroupNodes/readTrackingStatus) -> folders-service.ts

// SettingsService -> settings-service.ts

// CasesQueryService -> cases-query-service.ts

export class TrackingMutationService {
  constructor(private readonly context: IpcDomainContext, private readonly cases: CasesQueryService) {}

  async updateChecklist(args: MutationArgsBase & { key: string; completed: boolean }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      const item = tracking.portalChecklist.find((x) => x.key === args.key);
      if (!item) throw new Error('Kontrol listesi kalemi bulunamadı.');
      item.completed = args.completed;
      if (args.completed) {
        item.completedAt = nowIso();
        item.completedBy = settings.activeUser;
      } else {
        delete item.completedAt;
        delete item.completedBy;
      }
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async addTodo(args: MutationArgsBase & { id?: string; title: string; priority: string; assignedTo: string; dueDate: string }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      const title = safeFileDisplayName(args.title.trim());
      if (!title) throw new Error('Görev başlığı boş olamaz.');
      const id = chooseTrackingItemId(args.id, 'todo', tracking.todos.map((todo) => todo.id), () => `todo-${randomUUID()}`);
      tracking.todos.push({
        id,
        title,
        completed: false,
        priority: assertOneOf(args.priority, PRIORITIES, 'Görev önceliği geçersiz.'),
        assignedTo: safeFileDisplayName(args.assignedTo || settings.activeUser),
        dueDate: sanitizeDateInput(args.dueDate),
        createdAt: nowIso()
      });
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async updateTodo(args: MutationArgsBase & { id: string; completed?: boolean; title?: string; priority?: string; assignedTo?: string; dueDate?: string }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      const todo = tracking.todos.find((x) => x.id === args.id);
      if (!todo) throw new Error('Görev bulunamadı.');
      if (typeof args.completed === 'boolean') {
        todo.completed = args.completed;
        if (args.completed) todo.completedAt = nowIso();
        else delete todo.completedAt;
      }
      if (args.title !== undefined) {
        const title = safeFileDisplayName(args.title.trim());
        if (!title) throw new Error('Görev başlığı boş olamaz.');
        todo.title = title;
      }
      if (args.priority !== undefined) todo.priority = assertOneOf(args.priority, PRIORITIES, 'Görev önceliği geçersiz.');
      if (args.assignedTo !== undefined) todo.assignedTo = safeFileDisplayName(args.assignedTo.trim()) || settings.activeUser;
      if (args.dueDate !== undefined) todo.dueDate = sanitizeDateInput(args.dueDate);
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async deleteTodo(args: MutationArgsBase & { id: string }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      const before = tracking.todos.length;
      tracking.todos = tracking.todos.filter((x) => x.id !== args.id);
      if (tracking.todos.length === before) throw new Error('Silinecek görev bulunamadı.');
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async addNote(args: MutationArgsBase & { id?: string; text: string }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const text = sanitizeNoteText(args.text);
    if (!text) throw new Error('Not metni boş olamaz.');
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      const id = chooseTrackingItemId(args.id, 'note', tracking.notes.map((note) => note.id), () => `note-${randomUUID()}`);
      tracking.notes.push({ id, createdAt: nowIso(), createdBy: settings.activeUser, text });
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async updateNote(args: MutationArgsBase & { id: string; text: string }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const text = sanitizeNoteText(args.text);
    if (!text) throw new Error('Not metni boş olamaz.');
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      const note = tracking.notes.find((x) => x.id === args.id);
      if (!note) throw new Error('Not bulunamadı.');
      note.text = text;
      note.createdBy = note.createdBy || settings.activeUser;
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async deleteNote(args: MutationArgsBase & { id: string }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      const before = tracking.notes.length;
      tracking.notes = tracking.notes.filter((x) => x.id !== args.id);
      if (tracking.notes.length === before) throw new Error('Silinecek not bulunamadı.');
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async updateField(args: MutationArgsBase & { path: string; value: unknown }) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const allowed = new Set([
      'assignment.sorumlu', 'assignment.eksper', 'assignment.raportor', 'assignment.takipTarihi', 'assignment.oncelik',
      'caseIdentity.officeFileNo', 'caseIdentity.claimNoticeNo',
      'claimType', 'service.name',
      'status.dosyaDurumu', 'status.workflowStatus',
      'rucu.varMi', 'rucu.potansiyel', 'rucu.durum', 'rucu.not',
      'labor.parcaListesiIstendi', 'labor.parcaKodlariIstendi', 'labor.parcaIscilikGirildi', 'labor.not',
      'kttKusur.not', 'heavyDamage.enabled', 'heavyDamage.not', 'heavyDamage.skor',
      // v0.6.2: Araç bağlamı alanları (Şase/Motor/marka/model/yıl/yakıt) yalnız AKTİF dosyanın takip dosyasına yazilir.
      'vehicleContext.plate', 'vehicleContext.chassisNo', 'vehicleContext.engineNo',
      'vehicleContext.make', 'vehicleContext.model', 'vehicleContext.modelYear',
      'vehicleContext.fuelType', 'vehicleContext.engineDisplacement', 'vehicleContext.transmission',
      'vehicleContext.bodyType', 'vehicleContext.damageDirection'
    ]);
    if (!allowed.has(args.path)) throw new Error('Bu alan güvenli güncelleme listesinde yok.');
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      setNestedValue(tracking as unknown as Record<string, unknown>, args.path, sanitizeFieldValue(args.path, args.value));
      if (args.path === 'service.name') {
        tracking.service.source = 'manual';
        tracking.service.updatedAt = nowIso();
        tracking.service.updatedBy = settings.activeUser;
      }
      tracking.status.kapaliMi = tracking.status.workflowStatus === 'Kapalı' || tracking.caseIdentity.isClosedFolder;
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }
}

// ConflictResolverService -> conflict-resolver-service.ts

// ExcelWorkflowService -> excel-workflow-service.ts; DeploymentService -> deployment-service.ts (barrel ile yeniden dışa aktarılır).

// mapWithConcurrency + TRACKING_REFRESH_* + emptyDocumentAnalysis/emptyPhotoAnalysis -> cases-refresh-helpers.ts

function setNestedValue(target: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split('.');
  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object') throw new Error('Güncellenecek alan bulunamadı.');
    cursor = next as Record<string, unknown>;
  }
  const key = parts.at(-1);
  if (!key) throw new Error('Geçersiz alan yolu.');
  cursor[key] = value;
}

function sanitizeFieldValue(fieldPath: string, value: unknown): unknown {
  const textFields = new Set([
    'assignment.sorumlu', 'assignment.eksper', 'assignment.raportor', 'assignment.takipTarihi',
    'caseIdentity.officeFileNo', 'caseIdentity.claimNoticeNo',
    'service.name',
    'rucu.durum', 'rucu.not', 'labor.not', 'kttKusur.not', 'heavyDamage.not',
    ...VEHICLE_CONTEXT_FIELDS.map((field) => `vehicleContext.${field}`)
  ]);
  const booleanFields = new Set([
    'rucu.varMi', 'rucu.potansiyel',
    'labor.parcaListesiIstendi', 'labor.parcaKodlariIstendi', 'labor.parcaIscilikGirildi',
    'heavyDamage.enabled'
  ]);

  if (fieldPath === 'claimType') return assertOneOf(value, CLAIM_TYPES, 'Dosya tipi geçersiz.');
  if (fieldPath === 'status.workflowStatus') return assertOneOf(value, WORKFLOW_STATUSES, 'Operasyon durumu geçersiz.');
  if (fieldPath === 'status.dosyaDurumu') return assertOneOf(value, DOSYA_DURUMLARI, 'Dosya durumu geçersiz.');
  if (fieldPath === 'assignment.oncelik') return assertOneOf(value, PRIORITIES, 'Öncelik geçersiz.');
  if (fieldPath === 'heavyDamage.skor') {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Ağır hasar skoru 0 ile 100 arasında olmalıdır.');
    return Math.round(n);
  }
  if (booleanFields.has(fieldPath)) {
    if (typeof value !== 'boolean') throw new Error('Bu alan yalnızca açık/kapalı değeri alabilir.');
    return value;
  }
  if (textFields.has(fieldPath)) {
    if (typeof value !== 'string') throw new Error('Bu alan metin değeri almalıdır.');
    return safeFileDisplayName(value.trim());
  }
  throw new Error('Geçersiz alan değeri.');
}

function sanitizeNoteText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, 4000);
}

function sanitizeDateInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = safeFileDisplayName(value.trim());
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : '';
}

function assertOneOf<T extends readonly string[]>(value: unknown, allowed: T, message: string): T[number] {
  if (typeof value !== 'string') throw new Error(message);
  const cleaned = safeFileDisplayName(value.trim());
  if (!allowed.includes(cleaned)) throw new Error(message);
  return cleaned as T[number];
}

// readJsonSafe / readOfficeVersionClients -> deployment-service.ts
// sanitizeCaseListExportRow -> excel-workflow-service.ts
// existsDirectory -> fs-utils.ts (yukarıda re-export edilir)
