import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppSettings, CaseIdentity, CaseIndexFile, CaseIndexItem, CaseTrackingIssue, FolderFingerprint, ScanIssue, ScanReport, TrackingWriteIndexFile } from '../../shared/types';
import { inferYearFromRootPath } from '../../shared/constants';
import { buildTrackingWriteIndexEntry, hashCasePath, LocalCacheStore } from '../local-cache/local-cache-store';
import { TrackingFileService } from '../tracking/tracking-file-service';
import { getFolderFingerprint } from './folder-fingerprint';
import { applyTrackingToCaseIndexItem, buildCaseIdentity, FolderAnalyzer, hasTrackingCacheDifference } from './folder-analyzer';
import { discoverCaseFolders } from './case-folder-utils';

interface ScanLogger { log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, details?: unknown): Promise<void>; }

const TRACKING_READ_ISSUE_TYPES = new Set<CaseTrackingIssue['type']>(['corrupt-tracking', 'unsupported-schema', 'partial-sync-missing-tracking', 'scan-failed-folder']);

export class PcloudYearScanner {
  private readonly tracking: TrackingFileService;
  private readonly analyzer: FolderAnalyzer;
  private abortRequested = false;

  constructor(private readonly cache: LocalCacheStore, private readonly logger?: ScanLogger) {
    this.tracking = new TrackingFileService(cache.locksDir);
    this.analyzer = new FolderAnalyzer(this.tracking);
  }

  requestAbort(): void {
    this.abortRequested = true;
  }

  async scan(settings: AppSettings): Promise<{ index: CaseIndexFile; report: ScanReport }> {
    this.abortRequested = false;
    const startedAt = new Date().toISOString();
    const warnings: string[] = [];
    const issues: ScanIssue[] = [];
    const activeYear = inferYearFromRootPath(settings.rootPath, 2026);
    const previousIndex = await this.cache.readIndex(activeYear);
    const previousByPath = new Map((previousIndex?.cases ?? []).map((item) => [item.folderPath, item]));
    const previousFingerprints = await this.cache.readFingerprints();
    const previousWriteIndex = await this.cache.readTrackingWriteIndex(settings.rootPath);
    const nextWriteIndex: TrackingWriteIndexFile = { schemaVersion: 1, rootPath: settings.rootPath, generatedAt: new Date().toISOString(), entries: { ...previousWriteIndex.entries } };
    const rootAvailable = await existsDirectory(settings.rootPath);
    const cases: CaseIndexItem[] = [];
    let changedCases = 0;
    let reusedCases = 0;
    let createdTrackingFiles = 0;
    let corruptTrackingFiles = 0;
    let conflictFiles = 0;
    let failedCases = 0;

    if (!rootAvailable) {
      warnings.push('pCloud kök klasörü erişilebilir değil. Uygulama yerel önbellek üzerinden çalışıyor.');
      const fallback = previousIndex ?? { schemaVersion: 1 as const, rootPath: settings.rootPath, generatedAt: startedAt, cases: [] };
      const report: ScanReport = {
        startedAt,
        finishedAt: new Date().toISOString(),
        rootPath: settings.rootPath,
        rootAvailable: false,
        totalCases: fallback.cases.length,
        changedCases: 0,
        reusedCases: fallback.cases.length,
        createdTrackingFiles: 0,
        corruptTrackingFiles: 0,
        failedCases: 0,
        conflictFiles: fallback.cases.reduce((sum, item) => sum + item.documentAnalysis.conflictFiles.length, 0),
        warnings,
        issues
      };
      return { index: fallback, report };
    }

    const discoveredCases = await discoverCaseFolders(settings.rootPath);
    const nextFingerprints: Record<string, FolderFingerprint> = {};

    for (const [index, discovered] of discoveredCases.entries()) {
      if (this.abortRequested) {
        warnings.push('Tarama kullanıcı isteğiyle durduruldu.');
        break;
      }
      const caseFolderPath = discovered.folderPath;
      try {
        const fingerprint = await getFolderFingerprint(caseFolderPath);
        nextFingerprints[caseFolderPath] = fingerprint;
        const previous = previousByPath.get(caseFolderPath);
        const previousFingerprint = previousFingerprints[caseFolderPath];
        if (previous && previousFingerprint?.hash === fingerprint.hash) {
          const refreshed = await this.tryRefreshTrackingOnly(previous);
          const refreshedWithIssues = applyLiveIssues(refreshed.item, previousWriteIndex, nextWriteIndex, issues, previous);
          cases.push(refreshedWithIssues);
          if (refreshed.changed || refreshedWithIssues !== refreshed.item) changedCases += 1;
          else reusedCases += 1;
          conflictFiles += refreshedWithIssues.documentAnalysis.conflictFiles.length;
          if ((index + 1) % 25 === 0) await delay(1);
          continue;
        }
        const identity = buildCaseIdentity(discovered);
        const analyzed = await this.analyzer.analyze(identity, fingerprint, settings.activeUser);
        const finalFingerprint = analyzed.createdTracking ? await getFolderFingerprint(caseFolderPath) : fingerprint;
        analyzed.item.fingerprint = finalFingerprint;
        nextFingerprints[caseFolderPath] = finalFingerprint;
        const analyzedWithIssues = applyLiveIssues(analyzed.item, previousWriteIndex, nextWriteIndex, issues, previous);
        cases.push(analyzedWithIssues);
        changedCases += 1;
        if (analyzed.createdTracking) createdTrackingFiles += 1;
        if (analyzed.corruptTracking) corruptTrackingFiles += 1;
        conflictFiles += analyzedWithIssues.documentAnalysis.conflictFiles.length;
      } catch (error) {
        failedCases += 1;
        const previous = previousByPath.get(caseFolderPath);
        if (isCorruptTrackingError(error)) corruptTrackingFiles += 1;
        const message = error instanceof Error ? error.message : String(error);
        const issueType = isPartialSyncMissingTrackingError(message) ? 'partial-sync-missing-tracking' : isUnsupportedSchemaError(message) ? 'unsupported-schema' : isCorruptTrackingError(error) ? 'corrupt-tracking' : 'scan-failed-folder';
        const caseIssue: CaseTrackingIssue = {
          type: issueType,
          severity: 'critical',
          title: issueTitle(issueType),
          message,
          detectedAt: new Date().toISOString(),
          source: 'scanner'
        };
        if (previous) {
          const issuePatch: Partial<CaseIndexItem> = issueType !== 'scan-failed-folder'
            ? {
                corruptTracking: true,
                caseIssues: dedupeIssues([caseIssue, ...(previous.caseIssues ?? []).filter((issue) => issue.type !== issueType)]),
                trackingIssue: {
                  type: issueType,
                  severity: 'critical',
                  title: issueType === 'unsupported-schema' ? 'Desteklenmeyen takip dosyası' : issueType === 'partial-sync-missing-tracking' ? 'Kısmi senkron şüphesi' : 'Takip dosyası bozuk',
                  message,
                  detectedAt: new Date().toISOString(),
                  source: 'scanner'
                } satisfies CaseTrackingIssue
              }
            : {};
          cases.push({ ...previous, ...issuePatch });
          reusedCases += 1;
          conflictFiles += previous.documentAnalysis.conflictFiles.length;
        }
        issues.push({
          folderPath: caseFolderPath,
          folderName: discovered.folderName,
          type: issueType,
          severity: 'critical',
          message
        });
        warnings.push(`${discovered.folderName}: klasör taranamadı, varsa eski önbellek korundu. ${message}`);
        await this.logger?.log('ERROR', 'Klasör taranamadı', { folderPath: caseFolderPath, issueType, message }).catch(() => undefined);
      }
      if ((index + 1) % 25 === 0) await delay(1);
    }

    cases.sort((a, b) => a.isClosedFolder === b.isClosedFolder
      ? b.updatedAt.localeCompare(a.updatedAt)
      : Number(a.isClosedFolder) - Number(b.isClosedFolder));

    const index: CaseIndexFile = {
      schemaVersion: 1,
      rootPath: settings.rootPath,
      generatedAt: new Date().toISOString(),
      cases
    };
    await this.cache.writeIndex(index, activeYear);
    await this.cache.writeFingerprints(nextFingerprints);
    nextWriteIndex.generatedAt = new Date().toISOString();
    await this.cache.writeTrackingWriteIndex(nextWriteIndex);
    const report: ScanReport = {
      startedAt,
      finishedAt: new Date().toISOString(),
      rootPath: settings.rootPath,
      rootAvailable,
      totalCases: cases.length,
      changedCases,
      reusedCases,
      createdTrackingFiles,
      corruptTrackingFiles,
      failedCases,
      conflictFiles,
      warnings,
      issues
    };
    return { index, report };
  }
  private async tryRefreshTrackingOnly(previous: CaseIndexItem): Promise<{ item: CaseIndexItem; changed: boolean }> {
    try {
      const read = await this.tracking.readExistingWithIssue(caseIdentityFromIndexItem(previous), 'scanner');
      if (read.issue) {
        return {
          item: withCaseIssues(previous, dedupeIssues([read.issue, ...(previous.caseIssues ?? []).filter((issue) => issue.type !== read.issue?.type)])),
          changed: true
        };
      }
      const tracking = read.tracking;
      if (!tracking) return { item: previous, changed: false };
      const base = clearTrackingReadIssues(previous);
      const trackingChanged = hasTrackingCacheDifference(base, tracking);
      return { item: trackingChanged ? applyTrackingToCaseIndexItem(base, tracking) : base, changed: trackingChanged || base !== previous };
    } catch {
      // Bozuk veya senkron sırasında yarım gelen takip.json eski cache'i bozmasın.
      // Bir sonraki tam analiz/corrupt akışı dosyayı ayrıca raporlar.
      return { item: previous, changed: false };
    }
  }

}


function applyLiveIssues(
  item: CaseIndexItem,
  previousWriteIndex: TrackingWriteIndexFile,
  nextWriteIndex: TrackingWriteIndexFile,
  scanIssues: ScanIssue[],
  previousItem?: CaseIndexItem
): CaseIndexItem {
  const issues: CaseTrackingIssue[] = [...(item.caseIssues ?? [])].filter((issue) => issue.type !== 'same-revision-different-write' && issue.type !== 'revision-regression' && issue.type !== 'pcloud-conflict-copy');
  for (const issue of issues) {
    if (TRACKING_READ_ISSUE_TYPES.has(issue.type)) pushScanIssue(scanIssues, item, issue);
  }
  const tracking = item.tracking;
  const hash = hashCasePath(item.folderPath);
  const previous = previousWriteIndex.entries[hash];
  const writeId = tracking.metadata.writeId || '';
  const previousWriteId = previous?.lastSeenWriteId || previousItem?.tracking.metadata.writeId || '';
  const revisionRegression = Boolean(previous && tracking.metadata.revision < previous.lastSeenRevision);
  const sameRevisionDifferentWrite = Boolean(
    previous
    && previous.lastSeenRevision === tracking.metadata.revision
    && previous.lastSeenWriteId
    && writeId
    && previous.lastSeenWriteId !== writeId
  );
  const missingPreviouslySeenTracking = Boolean(previousWriteId && !writeId);

  if (revisionRegression && previous) {
    const issue: CaseTrackingIssue = {
      type: 'revision-regression',
      severity: 'critical',
      title: 'Revizyon gerilemesi',
      message: `Bu dosyada takip revizyonu gerilemiş görünüyor (${previous.lastSeenRevision} → ${tracking.metadata.revision}). pCloud rollback/eski kopya/default reset riski var; cache otomatik yenilenmedi.`,
      detectedAt: new Date().toISOString(),
      source: 'scanner',
      action: 'compare'
    };
    issues.push(issue);
    scanIssues.push({ folderPath: item.folderPath, folderName: item.plate || path.basename(item.folderPath), type: issue.type, severity: issue.severity, message: issue.message });
  } else if (sameRevisionDifferentWrite) {
    const issue: CaseTrackingIssue = {
      type: 'same-revision-different-write',
      severity: 'critical',
      title: 'Aynı revizyonda farklı kayıt',
      message: 'Bu dosyada aynı revizyonda farklı writeId görüldü. pCloud eşzamanlı yazma/sessiz ezme riski var.',
      detectedAt: new Date().toISOString(),
      source: 'scanner',
      action: 'compare'
    };
    issues.push(issue);
    scanIssues.push({ folderPath: item.folderPath, folderName: item.plate || path.basename(item.folderPath), type: issue.type, severity: issue.severity, message: issue.message });
  } else if (missingPreviouslySeenTracking && !issues.some((issue) => issue.type === 'partial-sync-missing-tracking')) {
    const issue: CaseTrackingIssue = {
      type: 'partial-sync-missing-tracking',
      severity: 'critical',
      title: 'Takip dosyası kayıp görünüyor',
      message: `Bu dosya için daha önce takip.json görülmüştü (son güvenli revizyon ${previous?.lastSeenRevision ?? previousItem?.tracking.metadata.revision ?? tracking.metadata.revision}). Şu anda disk üzerinde takip.json okunamıyor veya bulunamıyor; pCloud kısmi senkron/manuel silme/rollback riski nedeniyle cache otomatik yenilenmedi.`,
      detectedAt: new Date().toISOString(),
      source: 'scanner',
      action: 'compare'
    };
    issues.push(issue);
    scanIssues.push({ folderPath: item.folderPath, folderName: item.plate || path.basename(item.folderPath), type: issue.type, severity: issue.severity, message: issue.message });
  } else if (writeId) {
    nextWriteIndex.entries[hash] = buildTrackingWriteIndexEntry(item.folderPath, tracking, hash);
  }

  if (item.documentAnalysis.conflictFiles.length > 0) {
    const issue: CaseTrackingIssue = {
      type: 'pcloud-conflict-copy',
      severity: 'critical',
      title: 'pCloud çakışma kopyası',
      message: `Bu dosyada conflict/kopya tespit edildi: ${item.documentAnalysis.conflictFiles.join(', ')}`,
      detectedAt: new Date().toISOString(),
      source: 'scanner',
      action: 'compare'
    };
    issues.push(issue);
    scanIssues.push({ folderPath: item.folderPath, folderName: item.plate || path.basename(item.folderPath), type: issue.type, severity: issue.severity, message: issue.message });
  }

  // Same revision/farklı writeId veya revision regression görüldüğünde yeni disk içeriğini sessizce cache'e uygulamayız.
  // Belge/fotoğraf/fingerprint gibi okuma tarafı bilgileri güncellenebilir; takip alanları eski güvenli cache'te kalır.
  const outputItem = (sameRevisionDifferentWrite || revisionRegression || missingPreviouslySeenTracking) && previousItem
    ? {
        ...previousItem,
        documentAnalysis: item.documentAnalysis,
        photoAnalysis: item.photoAnalysis,
        folderContents: item.folderContents,
        fingerprint: item.fingerprint,
        searchText: item.searchText
      }
    : item;

  if (issues.length === 0) return (outputItem.caseIssues?.length ?? 0) > 0 ? withCaseIssues(outputItem, []) : outputItem;
  return withCaseIssues(outputItem, dedupeIssues(issues));
}

function dedupeIssues(input: CaseTrackingIssue[]): CaseTrackingIssue[] {
  const seen = new Set<string>();
  const out: CaseTrackingIssue[] = [];
  for (const issue of input) {
    const key = `${issue.type}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function clearTrackingReadIssues(item: CaseIndexItem): CaseIndexItem {
  const current = item.caseIssues ?? [];
  const next = current.filter((issue) => !TRACKING_READ_ISSUE_TYPES.has(issue.type));
  return next.length === current.length ? item : withCaseIssues(item, next);
}

function caseIdentityFromIndexItem(item: CaseIndexItem): CaseIdentity {
  return {
    ...item.tracking.caseIdentity,
    caseKey: item.tracking.caseIdentity.caseKey || path.basename(item.folderPath),
    plate: item.plate,
    dosyaNo: item.dosyaNo,
    officeFileNo: item.officeFileNo,
    claimNoticeNo: item.claimNoticeNo,
    folderPath: item.folderPath,
    monthFolder: item.monthFolder,
    isClosedFolder: item.isClosedFolder
  };
}

function pushScanIssue(scanIssues: ScanIssue[], item: CaseIndexItem, issue: CaseTrackingIssue): void {
  const folderName = item.plate || path.basename(item.folderPath);
  if (scanIssues.some((existing) => existing.folderPath === item.folderPath && existing.type === issue.type && existing.message === issue.message)) return;
  scanIssues.push({ folderPath: item.folderPath, folderName, type: issue.type, severity: issue.severity, message: issue.message });
}

function issueTitle(type: CaseTrackingIssue['type']): string {
  if (type === 'unsupported-schema') return 'Desteklenmeyen takip dosyası';
  if (type === 'partial-sync-missing-tracking') return 'Kısmi senkron şüphesi';
  if (type === 'scan-failed-folder') return 'Klasör taraması başarısız';
  return 'Takip dosyası bozuk';
}

async function existsDirectory(folderPath: string): Promise<boolean> {
  try {
    return (await fs.stat(folderPath)).isDirectory();
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPartialSyncMissingTrackingError(text: string): boolean {
  return /_HASARBOTU var ama takip\.json yok|kısmi senkron|partial-sync/i.test(text);
}

function isCorruptTrackingError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /takip dosyası|JSON|şema|sema|schema|okunamadı/i.test(text);
}

function isUnsupportedSchemaError(text: string): boolean {
  return /daha yeni.*schemaVersion|read-only|desteklenmeyen/i.test(text);
}


function withCaseIssues(item: CaseIndexItem, issues: CaseTrackingIssue[]): CaseIndexItem {
  const critical = issues.find((issue) => issue.severity === 'critical');
  const { trackingIssue: _oldTrackingIssue, ...rest } = item;
  const next: CaseIndexItem = { ...rest, caseIssues: issues };
  if (critical) return { ...next, trackingIssue: critical };
  return next;
}
