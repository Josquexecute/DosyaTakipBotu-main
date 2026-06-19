import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { AppSettings, CaseIndexFile, CaseIndexItem, DashboardSummary, FolderFingerprint, TrackingFile, TrackingWriteIndexEntry, TrackingWriteIndexFile } from '../../shared/types';
import { CACHE_APP_FOLDER, CACHE_FOLDER_NAME, DEFAULT_PCLOUD_ROOT } from '../../shared/constants';
import { readJsonFileOrNull } from '../storage/json-io';
import { normalizePathForCompare } from '../../shared/path-normalization';
import { normalizeSearch } from '../../shared/turkish';
import type { UserPartTerm } from '../../shared/parca-sozlugu';
import { deleteLearned, normalizeLaborLearningEntry, recordLearned, touchLearnedUsage, type LaborCorrection, type LaborLearningAdminKey, type LaborLearningDeleteCriteria, type LaborLearningEntry } from '../../shared/labor-learning-dictionary';
import { atomicWriteJson } from '../storage/atomic-write';

export class LocalCacheStore {
  readonly cacheRoot: string;
  readonly casesDir: string;
  readonly thumbnailsDir: string;
  readonly logsDir: string;
  readonly locksDir: string;

  constructor(appDataPath: string) {
    this.cacheRoot = path.join(appDataPath, CACHE_APP_FOLDER, CACHE_FOLDER_NAME);
    this.casesDir = path.join(this.cacheRoot, 'cases');
    this.thumbnailsDir = path.join(this.cacheRoot, 'thumbnails');
    this.logsDir = path.join(this.cacheRoot, 'logs');
    this.locksDir = path.join(this.cacheRoot, 'locks');
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.casesDir, { recursive: true });
    await fs.mkdir(this.thumbnailsDir, { recursive: true });
    await fs.mkdir(this.logsDir, { recursive: true });
    await fs.mkdir(this.locksDir, { recursive: true });
  }

  settingsPath(): string { return path.join(this.cacheRoot, 'app-settings.json'); }
  scanStatePath(): string { return path.join(this.cacheRoot, 'scan-state.json'); }
  indexPath(year = 2026): string { return path.join(this.cacheRoot, `year-${year}-index.json`); }
  fingerprintsPath(): string { return path.join(this.cacheRoot, 'folder-fingerprints.json'); }
  trackingWriteIndexPath(): string { return path.join(this.cacheRoot, 'tracking-write-index.json'); }

  async getSettings(): Promise<AppSettings> {
    await this.ensure();
    const saved = await readJsonFileOrNull<Partial<AppSettings>>(this.settingsPath());
    const defaults = defaultSettings();
    const merged: AppSettings = {
      ...defaults,
      ...(saved ?? {}),
      scanIntervals: { ...defaults.scanIntervals, ...(saved?.scanIntervals ?? {}) }
    };
    // Hotfix 4: canlı pCloud kullanımında 60 sn auto-scan I/O fırtınası yaratıyordu.
    // Eski ayarlardaki düşük değerler güvenli varsayılan olan 5 dakikaya yükseltilir.
    if (!Number.isFinite(merged.scanIntervals.fullYearLightMs) || merged.scanIntervals.fullYearLightMs < 300000) {
      merged.scanIntervals.fullYearLightMs = 300000;
    }
    await atomicWriteJson(this.settingsPath(), merged, { allowLocalCacheReplace: true, label: 'Yerel ayar dosyası' });
    return merged;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.ensure();
    await atomicWriteJson(this.settingsPath(), settings, { allowLocalCacheReplace: true, label: 'Yerel ayar dosyası' });
  }

  async clearYearCache(year = 2026): Promise<void> {
    await this.ensure();
    await Promise.all([
      fs.unlink(this.indexPath(year)).catch(() => undefined),
      fs.unlink(this.fingerprintsPath()).catch(() => undefined),
      fs.unlink(this.trackingWriteIndexPath()).catch(() => undefined),
      fs.rm(this.casesDir, { recursive: true, force: true }).then(() => fs.mkdir(this.casesDir, { recursive: true })).catch(() => undefined)
    ]);
  }

  async readIndex(year = 2026): Promise<CaseIndexFile | null> {
    await this.ensure();
    const index = await readJsonFileOrNull<CaseIndexFile>(this.indexPath(year));
    if (!index) return null;
    return this.mergeCaseCaches(index);
  }

  async writeIndex(index: CaseIndexFile, year = 2026): Promise<void> {
    await this.ensure();
    // v0.3.15: yıl index dosyası yerel önbellektir; takip.json esas kaynak olduğu için
    // büyük audit/fotoğraf örneklerini burada taşımayız. Detay gerektiğinde diskten cases:get ile hydrate edilir.
    const compactIndex = compactIndexForDisk(index);
    await atomicWriteJson(this.indexPath(year), compactIndex, { allowLocalCacheReplace: true, label: 'Yerel liste önbelleği' });
    await this.pruneCaseCaches(new Set(compactIndex.cases.map((item) => normalizePathForCompare(item.folderPath))));
  }

  caseCachePath(casePath: string): string {
    return path.join(this.casesDir, `${hashCasePath(casePath)}.json`);
  }

  async writeCaseCache(item: CaseIndexItem): Promise<void> {
    await this.ensure();
    await atomicWriteJson(this.caseCachePath(item.folderPath), compactCaseForDisk(item), { allowLocalCacheReplace: true, label: 'Yerel tekil dosya önbelleği' });
  }

  private async mergeCaseCaches(index: CaseIndexFile): Promise<CaseIndexFile> {
    const entries = await fs.readdir(this.casesDir, { withFileTypes: true }).catch(() => []);
    if (entries.length === 0) return index;
    const byPath = new Map(index.cases.map((item) => [item.folderPath, item]));
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      const cached = await readJsonFileOrNull<CaseIndexItem>(path.join(this.casesDir, entry.name)).catch(() => null);
      if (!cached?.folderPath) continue;
      const existing = byPath.get(cached.folderPath);
      // RC5: Per-case cache yalnızca güncel index içinde var olan dosyayı zenginleştirir.
      // Silinmiş/taşınmış klasörler AppData cache dosyasından ghost case olarak listeye geri dönmez.
      if (!existing) continue;
      if (!shouldUseCaseCache(cached, existing)) continue;
      byPath.set(cached.folderPath, { ...existing, ...cached });
    }
    return { ...index, cases: Array.from(byPath.values()) };
  }

  private async pruneCaseCaches(activeCasePaths: Set<string>): Promise<void> {
    const entries = await fs.readdir(this.casesDir, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) return;
      const filePath = path.join(this.casesDir, entry.name);
      const cached = await readJsonFileOrNull<CaseIndexItem>(filePath).catch(() => null);
      if (!cached?.folderPath || !activeCasePaths.has(normalizePathForCompare(cached.folderPath))) {
        await fs.unlink(filePath).catch(() => undefined);
      }
    }));
  }

  async readFingerprints(): Promise<Record<string, FolderFingerprint>> {
    await this.ensure();
    return (await readJsonFileOrNull<Record<string, FolderFingerprint>>(this.fingerprintsPath())) ?? {};
  }

  async writeFingerprints(fingerprints: Record<string, FolderFingerprint>): Promise<void> {
    await this.ensure();
    await atomicWriteJson(this.fingerprintsPath(), fingerprints, { allowLocalCacheReplace: true, label: 'Yerel parmak izi önbelleği' });
  }


  async readTrackingWriteIndex(rootPath = ''): Promise<TrackingWriteIndexFile> {
    await this.ensure();
    const saved = await readJsonFileOrNull<TrackingWriteIndexFile>(this.trackingWriteIndexPath()).catch(() => null);
    if (saved?.schemaVersion === 1 && saved.entries && typeof saved.entries === 'object') return saved;
    return { schemaVersion: 1, rootPath, generatedAt: new Date().toISOString(), entries: {} };
  }

  async writeTrackingWriteIndex(index: TrackingWriteIndexFile): Promise<void> {
    await this.ensure();
    await atomicWriteJson(this.trackingWriteIndexPath(), index, { allowLocalCacheReplace: true, label: 'Yerel yazma kimliği önbelleği' });
  }

  async recordSeenTracking(casePath: string, tracking: TrackingFile, rootPath = ''): Promise<void> {
    const writeId = tracking.metadata.writeId || '';
    if (!writeId) return;
    const index = await this.readTrackingWriteIndex(rootPath);
    const hash = hashCasePath(casePath);
    index.rootPath = rootPath || index.rootPath;
    index.generatedAt = new Date().toISOString();
    index.entries[hash] = buildTrackingWriteIndexEntry(casePath, tracking, hash);
    await this.writeTrackingWriteIndex(index);
  }

  userPartsDictPath(): string { return path.join(this.cacheRoot, 'user-parts-dictionary.json'); }

  async readUserPartTerms(): Promise<UserPartTerm[]> {
    await this.ensure();
    const saved = await readJsonFileOrNull<unknown>(this.userPartsDictPath()).catch(() => null);
    if (!Array.isArray(saved)) return [];
    const terms: UserPartTerm[] = [];
    for (const item of saved) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const alias = typeof record.alias === 'string' ? record.alias.trim() : '';
      const canonical = typeof record.canonical === 'string' ? record.canonical.trim() : '';
      if (!alias || !canonical) continue;
      terms.push({
        alias,
        canonical,
        ...(typeof record.category === 'string' && record.category ? { category: record.category } : {}),
        ...(typeof record.laborPart === 'string' && record.laborPart ? { laborPart: record.laborPart } : {})
      });
    }
    return terms;
  }

  async writeUserPartTerms(terms: UserPartTerm[]): Promise<void> {
    await this.ensure();
    await atomicWriteJson(this.userPartsDictPath(), terms, { allowLocalCacheReplace: true, label: 'Yerel parça sözlüğü' });
  }

  /** Bir öğrenme kaydı ekler/günceller (aynı ham terimi tek tutar) ve güncel sözlüğü döndürür. */
  async addUserPartTerm(term: UserPartTerm): Promise<UserPartTerm[]> {
    const alias = (term.alias || '').trim().slice(0, 120);
    const canonical = (term.canonical || '').trim().slice(0, 120);
    if (!alias || !canonical) return this.readUserPartTerms();
    const aliasKey = normalizeSearch(alias);
    const existing = await this.readUserPartTerms();
    const next: UserPartTerm = {
      alias,
      canonical,
      ...(term.category ? { category: String(term.category).slice(0, 60) } : {}),
      ...(term.laborPart ? { laborPart: String(term.laborPart).slice(0, 80) } : {})
    };
    const merged = [next, ...existing.filter((entry) => normalizeSearch(entry.alias) !== aliasKey)].slice(0, 2000);
    await this.writeUserPartTerms(merged);
    return merged;
  }

  laborLearningPath(): string { return path.join(this.cacheRoot, 'labor-learning.json'); }

  /** Öğrenen işçilik eşleştirme sözlüğünü okur (AI destekli İşçilik Dağıtıcı için). */
  async readLaborLearning(): Promise<LaborLearningEntry[]> {
    await this.ensure();
    const saved = await readJsonFileOrNull<unknown>(this.laborLearningPath()).catch(() => null);
    if (!Array.isArray(saved)) return [];
    const out: LaborLearningEntry[] = [];
    for (const item of saved) {
      const entry = normalizeLaborLearningEntry(item);
      if (entry) out.push(entry);
    }
    return out;
  }

  async writeLaborLearning(entries: LaborLearningEntry[]): Promise<void> {
    await this.ensure();
    await atomicWriteJson(this.laborLearningPath(), entries, { allowLocalCacheReplace: true, label: 'Öğrenen işçilik sözlüğü' });
  }

  /** Bir işçilik düzeltmesini öğrenen sözlüğe ekler/günceller ve güncel sözlüğü döndürür. */
  async addLaborLearning(correction: LaborCorrection): Promise<LaborLearningEntry[]> {
    const existing = await this.readLaborLearning();
    const merged = recordLearned(existing, correction);
    await this.writeLaborLearning(merged);
    return merged;
  }

  /** Yanlış öğrenmeyi silmek/düzeltmek için altyapı: normalize ad + opsiyonel parça kodu ile kaldırır. */
  async deleteLaborLearning(criteria: LaborLearningDeleteCriteria): Promise<LaborLearningEntry[]> {
    const existing = await this.readLaborLearning();
    const next = deleteLearned(existing, criteria);
    await this.writeLaborLearning(next);
    return next;
  }

  async touchLaborLearningUsage(usages: LaborLearningAdminKey[]): Promise<LaborLearningEntry[]> {
    const existing = await this.readLaborLearning();
    const next = touchLearnedUsage(existing, usages);
    await this.writeLaborLearning(next);
    return next;
  }

  buildDashboard(index: CaseIndexFile | null, rootAvailable: boolean): DashboardSummary {
    const cases: CaseIndexItem[] = index?.cases ?? [];
    const openCasesList = cases.filter((c) => !isCaseClosed(c));
    const todayKey = localDateKey(new Date());
    const weekLimit = addDaysKey(new Date(), 7);
    const openTodos = openCasesList.flatMap((c) => c.tracking.todos.filter((todo) => !todo.completed));
    return {
      totalCases: cases.length,
      openCases: openCasesList.length,
      closedCases: cases.length - openCasesList.length,
      // v0.3.16: Dashboard aksiyon alınacak açık dosyaları sayar; kapalı arşiv ayları KPI'yı kırmızı tutmaz.
      missingDocuments: openCasesList.filter((c) => c.documentAnalysis.missingCritical.length > 0).length,
      missingPhotos: openCasesList.filter(hasMissingPhotoAction).length,
      unsupportedPhotos: openCasesList.filter((c) => c.photoAnalysis.unsupportedFiles.length > 0).length,
      portalPending: openCasesList.filter((c) => c.tracking.portalChecklist.some((i) => !i.completed)).length,
      overdueFollowUps: openCasesList.filter((c) => c.takipTarihi && c.takipTarihi < todayKey).length,
      rucuPotential: openCasesList.filter((c) => c.tracking.rucu.potansiyel || c.documentAnalysis.counterpartyPolicyCandidate).length,
      heavyDamageEnabled: openCasesList.filter((c) => c.tracking.heavyDamage.enabled).length,
      openTasks: openTodos.length,
      overdueTasks: openTodos.filter((todo) => todo.dueDate && todo.dueDate < todayKey).length,
      todayTasks: openTodos.filter((todo) => todo.dueDate === todayKey).length,
      weekTasks: openTodos.filter((todo) => todo.dueDate && todo.dueDate >= todayKey && todo.dueDate <= weekLimit).length,
      conflicts: openCasesList.reduce((sum, c) => sum + c.documentAnalysis.conflictFiles.length, 0),
      lastScanAt: index?.generatedAt ?? '',
      rootAvailable
    };
  }
}

function shouldUseCaseCache(cached: CaseIndexItem, existing: CaseIndexItem | undefined): boolean {
  if (!existing) return true;
  const cachedRevision = cached.tracking?.metadata?.revision ?? cached.revision ?? 0;
  const existingRevision = existing.tracking?.metadata?.revision ?? existing.revision ?? 0;
  if (cachedRevision > existingRevision) return true;
  if (cachedRevision < existingRevision) return false;
  const cachedTime = Date.parse(cached.updatedAt || cached.tracking?.metadata?.updatedAt || '');
  const existingTime = Date.parse(existing.updatedAt || existing.tracking?.metadata?.updatedAt || '');
  if (Number.isFinite(cachedTime) && Number.isFinite(existingTime)) return cachedTime >= existingTime;
  return true;
}

const DISK_PHOTO_PREVIEW_LIMIT = 48;
const DISK_SAMPLE_FILE_LIMIT = 16;

function compactIndexForDisk(index: CaseIndexFile): CaseIndexFile {
  return { ...index, cases: index.cases.map(compactCaseForDisk) };
}

function compactCaseForDisk(item: CaseIndexItem): CaseIndexItem {
  return {
    ...item,
    tracking: { ...item.tracking, audit: [] },
    photoAnalysis: { ...item.photoAnalysis, previews: item.photoAnalysis.previews.slice(0, DISK_PHOTO_PREVIEW_LIMIT) },
    folderContents: {
      ...item.folderContents,
      groups: item.folderContents.groups.map((group) => ({ ...group, sampleFiles: group.sampleFiles.slice(0, DISK_SAMPLE_FILE_LIMIT) }))
    }
  };
}

function isCaseClosed(item: CaseIndexItem): boolean {
  return item.isClosedFolder === true || item.statusIsClosed === true || item.workflowStatus === 'Kapalı' || item.tracking.status.kapaliMi === true;
}

function hasMissingPhotoAction(item: CaseIndexItem): boolean {
  const p = item.photoAnalysis;
  return !p.hasarFolderExists
    || p.damagePhotoCount === 0
    || !p.hasKm
    || !p.hasVites
    || !p.hasSaseOrSasi
    || p.hasOlayYeri !== true;
}

function defaultSettings(): AppSettings {
  return {
    rootPath: DEFAULT_PCLOUD_ROOT,
    rootPathConfirmed: false,
    theme: 'light',
    zoom: 1,
    activeUser: 'Ömer Faruk İşleyen',
    activeComputer: os.hostname() || 'BILINMEYEN-PC',
    users: ['Ömer Faruk İşleyen', 'Enes Özmen', 'Baran Gürbüz', 'Berfin Kapar'],
    scanIntervals: {
      fullYearLightMs: 300000
    }
  };
}



export function hashCasePath(casePath: string): string {
  return crypto.createHash('sha1').update(normalizePathForCompare(path.resolve(casePath))).digest('hex');
}

export function buildTrackingWriteIndexEntry(casePath: string, tracking: TrackingFile, casePathHash = hashCasePath(casePath)): TrackingWriteIndexEntry {
  return {
    casePathHash,
    casePath,
    lastSeenRevision: tracking.metadata.revision,
    lastSeenWriteId: tracking.metadata.writeId || '',
    lastSeenAt: new Date().toISOString()
  };
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysKey(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return localDateKey(next);
}
