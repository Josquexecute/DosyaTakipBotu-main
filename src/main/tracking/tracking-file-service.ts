import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { CaseIdentity, CaseTrackingIssue, ConflictResolutionStrategy, ConflictTrackingCopyInfo, TrackingFile, TrackingWriteResult } from '../../shared/types';
import { TRACKING_FILE_NAME, TRACKING_FOLDER_NAME, TRACKING_SUMMARY_FILE_NAME } from '../../shared/constants';
import { atomicWriteJson, atomicWriteUtf8 } from '../storage/atomic-write';
import { isNodeError, readJsonFileOrNull } from '../storage/json-io';
import { isTrackingConflictCandidate } from '../storage/conflict-file-detector';
import { withFileLock } from '../storage/file-lock';
import { computerName, createDefaultTracking, nowIso, todayLocalDateInput } from './tracking-defaults';
import { getUnsupportedSchemaVersion, migrateTracking } from './tracking-schema';

const MAX_AUDIT_ITEMS = 500;

export interface TrackingReadResult {
  tracking: TrackingFile;
  created: boolean;
  corrupt: boolean;
  issue?: CaseTrackingIssue;
}

export type TrackingScanReadResult =
  | { state: 'ok'; tracking: TrackingFile; corrupt: false }
  | { state: 'absent'; tracking: TrackingFile; corrupt: false }
  | { state: 'absent-suspicious'; tracking: TrackingFile; corrupt: false; message: string };

export interface TrackingExistingReadResult {
  tracking: TrackingFile | null;
  issue?: CaseTrackingIssue;
  corrupt: boolean;
}

type TrackingIssueSource = NonNullable<CaseTrackingIssue['source']>;

export class TrackingFileService {
  constructor(private readonly lockRoot?: string) {}
  getTrackingPath(caseFolderPath: string): string {
    return path.join(caseFolderPath, TRACKING_FOLDER_NAME, TRACKING_FILE_NAME);
  }

  getSummaryPath(caseFolderPath: string): string {
    return path.join(caseFolderPath, TRACKING_FOLDER_NAME, TRACKING_SUMMARY_FILE_NAME);
  }

  getLockPath(caseFolderPath: string): string {
    if (this.lockRoot) {
      const hash = createHash('sha1').update(path.resolve(caseFolderPath).toUpperCase()).digest('hex');
      return path.join(this.lockRoot, `${hash}.lock`);
    }
    return `${this.getTrackingPath(caseFolderPath)}.lock`;
  }

  async ensureTracking(caseIdentity: CaseIdentity, user: string): Promise<TrackingReadResult> {
    const trackingPath = this.getTrackingPath(caseIdentity.folderPath);
    const trackingDir = path.dirname(trackingPath);
    const existingTrackingDirEntries = await fs.readdir(trackingDir).catch((error) => {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      throw error;
    });
    await fs.mkdir(trackingDir, { recursive: true });

    const existing = await this.readTrackingFileForIdentity(caseIdentity, { copyCorruptBackup: true });
    if (existing) return { tracking: existing, created: false, corrupt: false };

    if (await this.hasCorruptBackupSibling(trackingPath)) {
      throw new Error('Bu klasörde bozuk takip dosyası yedeği var. Kullanıcı onayı olmadan yeni takip.json oluşturulmadı.');
    }

    const hasExistingTrackingSidecar = (existingTrackingDirEntries ?? []).some((name) => name !== TRACKING_FILE_NAME);
    if (hasExistingTrackingSidecar) {
      throw new Error('Bu klasörde _HASARBOTU var ama takip.json yok. pCloud kısmi senkron/manuel silme şüphesi nedeniyle varsayılan takip dosyası oluşturulmadı.');
    }

    const tracking = createDefaultTracking(caseIdentity, user);
    await atomicWriteJson(trackingPath, tracking);
    await this.writeHumanSummary(caseIdentity.folderPath, tracking).catch(() => undefined);
    return { tracking, created: true, corrupt: false };
  }

  async readForScan(caseIdentity: CaseIdentity, user: string): Promise<TrackingScanReadResult> {
    const trackingPath = this.getTrackingPath(caseIdentity.folderPath);
    const trackingDir = path.dirname(trackingPath);
    const existingTrackingDirEntries = await fs.readdir(trackingDir).catch((error) => {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      throw error;
    });

    const existing = await this.readTrackingFileForIdentity(caseIdentity, { copyCorruptBackup: true });
    if (existing) return { state: 'ok', tracking: existing, corrupt: false };

    if (await this.hasCorruptBackupSibling(trackingPath)) {
      throw new Error('Bu klasörde bozuk takip dosyası yedeği var. Kullanıcı onayı olmadan yeni takip.json oluşturulmadı.');
    }

    const hasExistingTrackingSidecar = (existingTrackingDirEntries ?? []).some((name) => name !== TRACKING_FILE_NAME);
    const tracking = createDefaultTracking(caseIdentity, user);
    tracking.metadata.writeId = '';
    tracking.audit = [];
    if (hasExistingTrackingSidecar) {
      return {
        state: 'absent-suspicious',
        tracking,
        corrupt: false,
        message: 'Bu klasörde _HASARBOTU var ama takip.json yok. pCloud kısmi senkron/manuel silme şüphesi nedeniyle tarama sırasında varsayılan takip dosyası oluşturulmadı.'
      };
    }
    return { state: 'absent', tracking, corrupt: false };
  }

  private async readTrackingFileForIdentity(caseIdentity: CaseIdentity, options: { copyCorruptBackup: boolean }): Promise<TrackingFile | null> {
    const trackingPath = this.getTrackingPath(caseIdentity.folderPath);
    let raw: unknown | null;
    try {
      raw = await readJsonFileOrNull<unknown>(trackingPath);
    } catch (error) {
      if (isTemporaryReadError(error)) {
        throw new Error(`Takip dosyası geçici olarak okunamadı; mevcut veri korunuyor: ${formatError(error)}`);
      }
      if (error instanceof SyntaxError) {
        if (options.copyCorruptBackup) await this.copyCorruptTrackingForRecovery(trackingPath, error).catch(() => undefined);
        throw new Error('Takip dosyası JSON olarak okunamadı. Ana takip.json yerinde korundu; varsayılan dosya oluşturulmadı. Manuel kontrol gerekli.');
      }
      throw error;
    }

    const unsupportedSchemaVersion = getUnsupportedSchemaVersion(raw);
    if (unsupportedSchemaVersion) {
      throw new Error(`Bu takip dosyası daha yeni bir HasarBotu sürümüyle oluşturulmuş olabilir (schemaVersion=${unsupportedSchemaVersion}). Dosya read-only kabul edildi; varsayılan dosya oluşturulmadı.`);
    }

    const migrated = migrateTracking(raw);
    if (migrated) {
      migrated.caseIdentity = {
        ...migrated.caseIdentity,
        ...caseIdentity,
        dosyaNo: migrated.caseIdentity.dosyaNo || caseIdentity.dosyaNo || '',
        officeFileNo: migrated.caseIdentity.officeFileNo || caseIdentity.officeFileNo || '',
        claimNoticeNo: migrated.caseIdentity.claimNoticeNo || caseIdentity.claimNoticeNo || ''
      };
      migrated.status.kapaliMi = caseIdentity.isClosedFolder || migrated.status.workflowStatus === 'Kapalı';
      return migrated;
    }

    if (raw !== null) {
      if (options.copyCorruptBackup) await this.copyCorruptTrackingForRecovery(trackingPath, new Error('Takip dosyası şeması geçersiz.')).catch(() => undefined);
      throw new Error('Takip dosyası şeması geçersiz. Ana takip.json yerinde korundu; varsayılan dosya oluşturulmadı. Manuel kontrol gerekli.');
    }

    return null;
  }

  async readExisting(caseFolderPath: string): Promise<TrackingFile | null> {
    const raw = await readJsonFileOrNull<unknown>(this.getTrackingPath(caseFolderPath));
    return migrateTracking(raw);
  }

  async readExistingWithIssue(caseIdentity: CaseIdentity, source: TrackingIssueSource = 'tracking'): Promise<TrackingExistingReadResult> {
    const trackingPath = this.getTrackingPath(caseIdentity.folderPath);
    const trackingDir = path.dirname(trackingPath);
    const existingTrackingDirEntries = await fs.readdir(trackingDir).catch((error) => {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      throw error;
    });

    try {
      const tracking = await this.readTrackingFileForIdentity(caseIdentity, { copyCorruptBackup: true });
      if (tracking) return { tracking, corrupt: false };
    } catch (error) {
      const issue = trackingReadIssueFromError(error, source);
      return { tracking: null, issue, corrupt: issue.type === 'corrupt-tracking' };
    }

    if (await this.hasCorruptBackupSibling(trackingPath)) {
      return {
        tracking: null,
        corrupt: true,
        issue: {
          type: 'corrupt-tracking',
          severity: 'critical',
          title: 'Bozuk takip dosyası yedeği',
          message: 'Bu klasörde bozuk takip dosyası yedeği var. Kullanıcı onayı olmadan yeni takip.json oluşturulmadı.',
          detectedAt: nowIso(),
          source
        }
      };
    }

    const hasExistingTrackingSidecar = (existingTrackingDirEntries ?? []).some((name) => name !== TRACKING_FILE_NAME);
    if (hasExistingTrackingSidecar) {
      return {
        tracking: null,
        corrupt: false,
        issue: {
          type: 'partial-sync-missing-tracking',
          severity: 'critical',
          title: 'Kısmi senkron şüphesi',
          message: 'Bu klasörde _HASARBOTU var ama takip.json yok. pCloud kısmi senkron/manuel silme şüphesi nedeniyle varsayılan takip dosyası oluşturulmadı.',
          detectedAt: nowIso(),
          source
        }
      };
    }

    return { tracking: null, corrupt: false };
  }

  async mutate(
    caseFolderPath: string,
    expectedRevision: number,
    expectedWriteId: string | undefined,
    user: string,
    mutateFn: (tracking: TrackingFile) => void,
    caseIdentity?: CaseIdentity
  ): Promise<TrackingWriteResult> {
    const trackingPath = this.getTrackingPath(caseFolderPath);
    const owner = `${user}@${computerName()}`;

    return withFileLock(this.getLockPath(caseFolderPath), owner, async () => {
      let current = await this.readExisting(caseFolderPath);
      if (!current) {
        const created = await this.ensureTracking(caseIdentity ?? buildIdentityFromFolderPath(caseFolderPath), user);
        current = created.tracking;
      }
      const writeMismatch = Boolean(expectedWriteId && current.metadata.writeId && current.metadata.writeId !== expectedWriteId);
      if (current.metadata.revision !== expectedRevision || writeMismatch) {
        return {
          conflict: true,
          current,
          expectedRevision,
          currentRevision: current.metadata.revision,
          reason: writeMismatch ? 'same-revision-different-write' : 'revision-mismatch',
          message: writeMismatch
            ? 'Aynı revizyonda farklı kayıt tespit edildi. pCloud eşzamanlı yazma riski nedeniyle otomatik ezme yapılmadı.'
            : 'Bu dosya başka bir bilgisayarda güncellenmiş. Otomatik ezme yapılmadı.'
        };
      }

      const next = structuredCloneTracking(current);
      mutateFn(next);
      stampTracking(next, user, 'tracking-updated', 'Takip dosyası uygulama üzerinden güncellendi.');

      // Lock içindeyken tekrar diski okuyoruz; aynı revizyonu yazan ikinci işlem ezme yapamaz.
      const diskBeforeWrite = await this.readExisting(caseFolderPath);
      const diskWriteMismatch = Boolean(expectedWriteId && diskBeforeWrite?.metadata.writeId && diskBeforeWrite.metadata.writeId !== expectedWriteId);
      if (!diskBeforeWrite || diskBeforeWrite.metadata.revision !== expectedRevision || diskWriteMismatch) {
        return {
          conflict: true,
          current: diskBeforeWrite ?? current,
          expectedRevision,
          currentRevision: diskBeforeWrite?.metadata.revision ?? current.metadata.revision,
          reason: diskWriteMismatch ? 'same-revision-different-write' : 'revision-mismatch',
          message: diskWriteMismatch
            ? 'Yazma sırasında aynı revizyonda farklı writeId görüldü. pCloud kaynaklı sessiz ezme riski engellendi.'
            : 'Yazma sırasında takip dosyası değişti. Veri ezilmedi; dosyayı yenileyip tekrar deneyin.'
        };
      }

      await atomicWriteJson(trackingPath, next);
      await this.writeHumanSummarySafe(caseFolderPath, next);
      return { tracking: next, revision: next.metadata.revision };
    });
  }

  async resolveConflict(
    caseFolderPath: string,
    currentRevision: number,
    currentWriteId: string | undefined,
    user: string,
    strategy: ConflictResolutionStrategy,
    baseTrackingInput: unknown,
    localTrackingInput: unknown
  ): Promise<TrackingWriteResult> {
    const baseTracking = migrateTracking(baseTrackingInput);
    const localTracking = migrateTracking(localTrackingInput);
    if (!baseTracking || !localTracking) throw new Error('Çakışma çözümü için gönderilen yerel takip verisi geçersiz.');

    const owner = `${user}@${computerName()}`;
    return withFileLock(this.getLockPath(caseFolderPath), owner, async () => {
      const current = await this.readExisting(caseFolderPath);
      if (!current) throw new Error('Diskteki takip dosyası okunamadı veya desteklenmeyen/bozuk schema içeriyor.');
      const writeMismatch = Boolean(currentWriteId && current.metadata.writeId && current.metadata.writeId !== currentWriteId);
      if (current.metadata.revision !== currentRevision || writeMismatch) {
        return {
          conflict: true,
          current,
          expectedRevision: currentRevision,
          currentRevision: current.metadata.revision,
          reason: writeMismatch ? 'same-revision-different-write' : 'revision-mismatch',
          message: writeMismatch
            ? 'Çakışma çözülürken aynı revizyonda farklı kayıt tespit edildi. Güncel disk verisi tekrar gösterildi.'
            : 'Çakışma çözülürken dosya yeniden değişti. Güncel disk verisi tekrar gösterildi.'
        };
      }
      if (strategy === 'use-disk') {
        return { tracking: current, revision: current.metadata.revision };
      }

      const next = strategy === 'merge-safe'
        ? mergeTrackingFiles(baseTracking, localTracking, current)
        : structuredCloneTracking(localTracking);

      next.schemaVersion = 1;
      next.caseIdentity = current.caseIdentity;
      next.status.kapaliMi = next.status.workflowStatus === 'Kapalı' || next.caseIdentity.isClosedFolder;
      next.claimType = next.claimType ?? current.claimType ?? 'unknown';
      next.service = next.service ?? current.service ?? { name: '', source: 'manual', updatedAt: '', updatedBy: '' };
      next.metadata = { ...current.metadata };
      stampTracking(
        next,
        user,
        strategy === 'merge-safe' ? 'conflict-merged' : 'conflict-local-overwrite',
        strategy === 'merge-safe'
          ? 'Çakışma güvenli birleştirme ile çözüldü. Aynı alan çakışmalarında diskteki değer korundu.'
          : 'Çakışmada kullanıcının yerel sürümü açık onayla yazıldı.'
      );

      await atomicWriteJson(this.getTrackingPath(caseFolderPath), next);
      await this.writeHumanSummarySafe(caseFolderPath, next);
      return { tracking: next, revision: next.metadata.revision };
    });
  }


  async inspectFirstConflictCopy(caseFolderPath: string): Promise<ConflictTrackingCopyInfo | null> {
    const current = await this.readExisting(caseFolderPath);
    if (!current) return null;
    const trackingFolder = path.dirname(this.getTrackingPath(caseFolderPath));
    const entries = await fs.readdir(trackingFolder, { withFileTypes: true }).catch(() => []);
    const candidates = entries
      .filter((entry) => entry.isFile() && isTrackingConflictCandidate(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'tr'));
    for (const fileName of candidates) {
      const filePath = path.join(trackingFolder, fileName);
      try {
        const raw = await readJsonFileOrNull<unknown>(filePath);
        const conflictTracking = migrateTracking(raw);
        if (!conflictTracking) continue;
        return { folderPath: caseFolderPath, fileName, filePath, current, conflictTracking };
      } catch {
        // Geçersiz conflict kopyası merge akışına alınmaz; banner/sorun olarak görünmeye devam eder.
      }
    }
    return null;
  }

  /**
   * Okunabilir özet (HASARBOTU_TAKIP_OZETI.txt) yazımını güvenli sarar.
   * Özet İKİNCİL çıktıdır: ana veri (takip.json) zaten yazıldıktan sonra çağrılır. Özet yazılamazsa
   * (pCloud kilidi, izin, geçici I/O hatası vb.) ana işlem BAŞARISIZ sayılmaz; yalnızca uyarı loglanır.
   * mutate() ve resolveConflict() bu davranışı paylaşır.
   */
  private async writeHumanSummarySafe(caseFolderPath: string, tracking: TrackingFile): Promise<void> {
    try {
      await this.writeHumanSummary(caseFolderPath, tracking);
    } catch (error) {
      console.warn(`HASARBOTU özeti (${TRACKING_SUMMARY_FILE_NAME}) yazılamadı; ana veri (takip.json) yazıldı, işlem başarılı sayılıyor. Klasör: ${caseFolderPath}`, error);
    }
  }

  async writeHumanSummary(caseFolderPath: string, tracking: TrackingFile): Promise<void> {
    const lines = [
      'HASARBOTU TAKİP ÖZETİ',
      '=====================',
      `Plaka: ${tracking.caseIdentity.plate}`,
      `Dosya No: ${tracking.caseIdentity.officeFileNo || '-'}`,
      `İhbar Föyü No: ${tracking.caseIdentity.claimNoticeNo || tracking.caseIdentity.dosyaNo || '-'}`,
      `Sigorta Dosya No: ${tracking.caseIdentity.dosyaNo || '-'}`,
      `Klasör: ${tracking.caseIdentity.folderPath}`,
      `Durum: ${tracking.status.dosyaDurumu} / ${tracking.status.workflowStatus}`,
      `Sorumlu: ${tracking.assignment.sorumlu}`,
      `Eksper: ${tracking.assignment.eksper}`,
      `Raportör: ${tracking.assignment.raportor}`,
      `Takip Tarihi: ${tracking.assignment.takipTarihi || '-'}`,
      `Son İşlem Tarihi: ${tracking.assignment.sonIslemTarihi || '-'}`,
      `Öncelik: ${tracking.assignment.oncelik}`,
      `Dosya Tipi: ${tracking.claimType || 'unknown'}`,
      `Servis: ${tracking.service?.name || '-'}`,
      `Revision: ${tracking.metadata.revision}`,
      `WriteId: ${tracking.metadata.writeId || '-'}`,
      `Güncellendi: ${tracking.metadata.updatedAt}`,
      '',
      'Portal Kontrol Listesi:',
      ...tracking.portalChecklist.map((item) => `- [${item.completed ? 'x' : ' '}] ${item.label}`),
      '',
      'Aktif Görevler:',
      ...tracking.todos.filter((t) => !t.completed).map((todo) => `- ${todo.title} (${todo.priority})`),
      '',
      'Son Notlar:',
      ...tracking.notes.slice(-5).map((note) => `- ${note.createdAt} ${note.createdBy}: ${note.text}`),
      '',
      'UYARI: Ana kaynak _HASARBOTU/takip.json dosyasıdır. Bu TXT yalnızca okunabilir özettir.'
    ];
    await atomicWriteUtf8(this.getSummaryPath(caseFolderPath), lines.join('\n') + '\n');
  }

  private async copyCorruptTrackingForRecovery(trackingPath: string, error: unknown): Promise<void> {
    const backupPath = `${trackingPath}.corrupt-${timestampForFile()}.bak`;
    try {
      await fs.copyFile(trackingPath, backupPath);
    } catch {
      // Ana takip.json kesinlikle rename/sil yapılmaz; kopya alınamazsa da ana dosya yerinde kalır.
    }
    await fs.writeFile(`${backupPath}.error.txt`, String(error), 'utf-8').catch(() => undefined);
  }

  private async hasCorruptBackupSibling(trackingPath: string): Promise<boolean> {
    const dir = path.dirname(trackingPath);
    const base = path.basename(trackingPath);
    const entries = await fs.readdir(dir).catch(() => []);
    return entries.some((name) => name.startsWith(`${base}.corrupt-`) && name.endsWith('.bak'));
  }
}

function buildIdentityFromFolderPath(caseFolderPath: string): CaseIdentity {
  const folderName = path.basename(caseFolderPath);
  const monthFolder = path.basename(path.dirname(caseFolderPath));
  const normalizedClosed = `${monthFolder} ${caseFolderPath}`.toLocaleUpperCase('tr-TR');
  return {
    caseKey: folderName,
    plate: folderName,
    dosyaNo: '',
    officeFileNo: '',
    claimNoticeNo: '',
    folderPath: caseFolderPath,
    monthFolder,
    isClosedFolder: normalizedClosed.includes('KAPALI')
  };
}

function stampTracking(tracking: TrackingFile, user: string, action: string, text: string): void {
  tracking.metadata.revision += 1;
  tracking.metadata.updatedAt = nowIso();
  tracking.metadata.updatedByComputer = computerName();
  tracking.metadata.writeId = randomUUID();
  tracking.assignment.sonIslemTarihi = todayLocalDateInput();
  tracking.audit.push({ at: tracking.metadata.updatedAt, by: user, computer: tracking.metadata.updatedByComputer, action, text });
  if (tracking.audit.length > MAX_AUDIT_ITEMS) tracking.audit = tracking.audit.slice(-MAX_AUDIT_ITEMS);
}


function timestampForFile(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}


function isTemporaryReadError(error: unknown): boolean {
  return isNodeError(error) && ['EBUSY', 'EPERM', 'EACCES', 'EIO'].includes(String(error.code));
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function trackingReadIssueFromError(error: unknown, source: TrackingIssueSource): CaseTrackingIssue {
  const message = error instanceof Error ? error.message : String(error);
  const type: CaseTrackingIssue['type'] = /daha yeni.*schemaVersion|read-only|desteklenmeyen/i.test(message)
    ? 'unsupported-schema'
    : /_HASARBOTU var ama takip\.json yok|kısmi senkron|partial-sync/i.test(message)
      ? 'partial-sync-missing-tracking'
      : /geçici olarak okunamadı|gecici olarak okunamadi|EBUSY|EPERM|EACCES|EIO/i.test(message)
        ? 'scan-failed-folder'
        : 'corrupt-tracking';
  return {
    type,
    severity: 'critical',
    title: issueTitle(type),
    message,
    detectedAt: nowIso(),
    source
  };
}

function issueTitle(type: CaseTrackingIssue['type']): string {
  if (type === 'unsupported-schema') return 'Desteklenmeyen takip dosyası';
  if (type === 'partial-sync-missing-tracking') return 'Kısmi senkron şüphesi';
  if (type === 'scan-failed-folder') return 'Takip dosyası geçici okunamadı';
  return 'Takip dosyası bozuk';
}

function mergeTrackingFiles(base: TrackingFile, local: TrackingFile, current: TrackingFile): TrackingFile {
  const next = structuredCloneTracking(current);
  next.assignment.sorumlu = chooseValue(base.assignment.sorumlu, local.assignment.sorumlu, current.assignment.sorumlu);
  next.assignment.eksper = chooseValue(base.assignment.eksper, local.assignment.eksper, current.assignment.eksper);
  next.assignment.raportor = chooseValue(base.assignment.raportor, local.assignment.raportor, current.assignment.raportor);
  next.assignment.takipTarihi = chooseValue(base.assignment.takipTarihi, local.assignment.takipTarihi, current.assignment.takipTarihi);
  next.assignment.oncelik = chooseValue(base.assignment.oncelik, local.assignment.oncelik, current.assignment.oncelik);
  next.status.dosyaDurumu = chooseValue(base.status.dosyaDurumu, local.status.dosyaDurumu, current.status.dosyaDurumu);
  next.status.workflowStatus = chooseValue(base.status.workflowStatus, local.status.workflowStatus, current.status.workflowStatus);
  next.status.kapaliMi = next.status.workflowStatus === 'Kapalı' || next.caseIdentity.isClosedFolder;
  next.claimType = chooseValue(base.claimType, local.claimType, current.claimType);
  next.service = chooseObjectByField(base.service, local.service, current.service);
  next.rucu = chooseObjectByField(base.rucu, local.rucu, current.rucu);
  next.labor = chooseObjectByField(base.labor, local.labor, current.labor);
  next.kttKusur = chooseObjectByField(base.kttKusur, local.kttKusur, current.kttKusur);
  next.heavyDamage = chooseObjectByField(base.heavyDamage, local.heavyDamage, current.heavyDamage);
  const assessment = chooseValue(base.heavyDamageAssessment, local.heavyDamageAssessment, current.heavyDamageAssessment);
  if (assessment) next.heavyDamageAssessment = assessment;
  else delete next.heavyDamageAssessment;
  next.portalChecklist = mergeArrayById(base.portalChecklist, local.portalChecklist, current.portalChecklist, 'key');
  next.todos = mergeArrayById(base.todos, local.todos, current.todos, 'id');
  next.notes = mergeArrayById(base.notes, local.notes, current.notes, 'id');
  return next;
}

function chooseObjectByField<T extends object>(base: T, local: T, current: T): T {
  const output = { ...current } as Record<string, unknown>;
  const baseRecord = base as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const currentRecord = current as Record<string, unknown>;
  const keys = new Set([...Object.keys(baseRecord), ...Object.keys(localRecord), ...Object.keys(currentRecord)]);
  for (const key of keys) {
    output[key] = chooseValue(baseRecord[key], localRecord[key], currentRecord[key]);
  }
  return output as T;
}

function mergeArrayById<T, K extends keyof T>(base: T[], local: T[], current: T[], idKey: K): T[] {
  const baseMap = new Map(base.map((item) => [String(item[idKey]), item]));
  const localMap = new Map(local.map((item) => [String(item[idKey]), item]));
  const currentMap = new Map(current.map((item) => [String(item[idKey]), item]));
  const ids = [...new Set([...baseMap.keys(), ...localMap.keys(), ...currentMap.keys()])];
  const merged: T[] = [];

  for (const id of ids) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const c = currentMap.get(id);
    if (!b) {
      if (c) merged.push(c);
      else if (l) merged.push(l);
      continue;
    }
    if (!l && !c) continue;
    if (!l && c) {
      if (!isEqual(c, b)) merged.push(c);
      continue;
    }
    if (l && !c) {
      // Disk tarafı öğeyi silmiş olabilir. Yerel taraf base'e göre değişmemişse silme korunur.
      // Yerel taraf aynı öğeyi düzenlediyse sessiz veri kaybı yaşamamak için yerel düzenleme korunur.
      if (!isEqual(l, b)) merged.push(l);
      continue;
    }
    if (l && c) {
      if (isEqual(l, b)) merged.push(c);
      else if (isEqual(c, b)) merged.push(l);
      else if (isEqual(l, c)) merged.push(c);
      else merged.push(c); // Aynı kayıtta iki taraf farklı değiştiyse diskteki güvenli değer korunur.
    }
  }
  return merged;
}

function chooseValue<T>(baseValue: T, localValue: T, currentValue: T): T {
  if (isEqual(localValue, baseValue)) return currentValue;
  if (isEqual(currentValue, baseValue)) return localValue;
  if (isEqual(localValue, currentValue)) return currentValue;
  return currentValue;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index]!;
      if (key !== rightKeys[index] || !isEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function structuredCloneTracking(input: TrackingFile): TrackingFile {
  return JSON.parse(JSON.stringify(input)) as TrackingFile;
}
