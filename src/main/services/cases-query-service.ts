import path from 'node:path';
import type { CaseIndexItem, CaseTrackingIssue, ThumbnailResult, TrackingWriteResult } from '../../shared/types';
import type { TrackingMutationArgsBase as MutationArgsBase } from '../../shared/ipc-contract';
import { IPC_SEND_CHANNEL } from '../../shared/ipc-contract';
import { SUPPORTED_IMAGE_EXTENSIONS, inferYearFromRootPath } from '../../shared/constants';
import { normalizeSearch } from '../../shared/turkish';
import { nowIso } from '../tracking/tracking-defaults';
import { buildTrackingWriteIndexEntry, hashCasePath, LocalCacheStore } from '../local-cache/local-cache-store';
import { ThumbnailCache } from '../local-cache/thumbnail-cache';
import { PcloudYearScanner } from '../scanner/pcloud-year-scanner';
import { applyTrackingToCaseIndexItem, FolderAnalyzer, buildCaseIdentity, hasTrackingCacheDifference } from '../scanner/folder-analyzer';
import { parseDosyaNoFromFolderName, parsePlateFromFolderName } from '../scanner/case-folder-utils';
import { getFolderFingerprint } from '../scanner/folder-fingerprint';
import { analyzeDocuments } from '../import/document-analyzer';
import { assertSafeCasePath } from '../security';
import { existsDirectory } from './fs-utils';
import { slimCasesForList } from './case-list-helpers';
import { mapWithConcurrency, emptyDocumentAnalysis, emptyPhotoAnalysis, TRACKING_REFRESH_CONCURRENCY, TRACKING_REFRESH_MIN_INTERVAL_MS } from './cases-refresh-helpers';
import {
  caseIdentityFromIndexItem,
  clearIssueTypes,
  hasUnsafeTrackingIssue,
  missingPreviouslySeenTrackingIssue,
  pcloudConflictCopyIssue,
  revisionRegressionIssue,
  sameRevisionDifferentWriteIssue,
  TRACKING_READ_ISSUE_TYPES,
  upsertCaseIssue
} from './tracking-issue-helpers';
import type { IpcDomainContext } from './ipc-domain-services';

/**
 * Dosya (case) sorgulama servisi: dashboard, listeleme, tekil getir, tarama, kucuk resim ve mutasyon
 * sonrasi yerel onbellek tazeleme. ipc-domain-services.ts'ten ayristirildi; davranis birebir korunur.
 * takip.json YAZMAZ (yazma TrackingFileService'tedir); yalnizca divergence tespiti icin diskten OKUR
 * ve yerel cache (AppData) yazar.
 */

export class CasesQueryService {
  constructor(private readonly context: IpcDomainContext) {}

  async dashboard() {
    await this.context.ensureLoaded();
    await this.refreshCachedTrackingFromDisk();
    return this.context.cache.buildDashboard(this.context.state.index, this.context.state.rootAvailable);
  }

  async list(): Promise<CaseIndexItem[]> {
    await this.context.ensureLoaded();
    await this.refreshCachedTrackingFromDisk();
    return slimCasesForList(this.context.state.index?.cases ?? []);
  }

  async get(folderPath: string): Promise<CaseIndexItem | null> {
    await this.context.ensureLoaded();
    await this.refreshSingleCachedTrackingFromDisk(folderPath);
    return (this.context.state.index?.cases ?? []).find((item) => item.folderPath === folderPath) ?? null;
  }

  async refreshOne(folderPath: string): Promise<CaseIndexItem> {
    // v0.3.16: Detay ekranındaki Yenile tam yıl taraması değil, yalnızca seçili klasör analizi yapar.
    await this.context.ensureLoaded();
    return this.refreshSingleCaseAnalysis(folderPath);
  }

  async scanStart() {
    const settings = await this.context.getSettings();
    if (this.context.state.currentScanner) throw new Error('Tarama zaten devam ediyor. Önce mevcut taramayı durdurun.');
    const scanner = new PcloudYearScanner(this.context.cache, this.context.logger);
    this.context.state.currentScanner = scanner;
    try {
      const result = await scanner.scan(settings);
      this.context.state.index = result.index;
      this.context.state.rootAvailable = result.report.rootAvailable;
      this.context.state.lastScanAt = result.report.finishedAt;
      this.context.mainWindowProvider()?.webContents.send(IPC_SEND_CHANNEL.scanFinished, result.report);
      return result.report;
    } finally {
      if (this.context.state.currentScanner === scanner) this.context.state.currentScanner = null;
    }
  }

  async scanCancel(): Promise<boolean> {
    if (!this.context.state.currentScanner) return false;
    this.context.state.currentScanner.requestAbort();
    return true;
  }

  async getThumbnail(filePath: string): Promise<ThumbnailResult> {
    const settings = await this.context.getSettings();
    assertSafeCasePath(filePath, settings.rootPath);
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      return { filePath, dataUrl: null, cacheHit: false, reason: 'Bu fotoğraf formatı küçük resim için desteklenmiyor.' };
    }
    return new ThumbnailCache(this.context.cache.thumbnailsDir).getThumbnailDataUrl(filePath);
  }

  async assertMutationAllowed(folderPath: string, allowClosedMutation: boolean): Promise<void> {
    await this.context.ensureLoaded();
    const cached = (this.context.state.index?.cases ?? []).find((item) => item.folderPath === folderPath);
    const diskTracking = cached?.tracking ?? await this.context.tracking.readExisting(folderPath);
    const closed = cached?.isClosedFolder === true
      || cached?.statusIsClosed === true
      || diskTracking?.status.kapaliMi === true
      || diskTracking?.status.workflowStatus === 'Kapalı';
    if (closed && !allowClosedMutation) {
      throw new Error('Bu dosya kapalı. Değişiklik için kullanıcıdan açık onay alınmalıdır.');
    }
  }

  expectedWriteIdFor(args: MutationArgsBase): string | undefined {
    if (args.expectedWriteId) return args.expectedWriteId;
    return (this.context.state.index?.cases ?? []).find((item) => item.folderPath === args.folderPath)?.tracking.metadata.writeId;
  }

  async refreshMutationResult(folderPath: string, result: TrackingWriteResult): Promise<void> {
    if ('conflict' in result) return;
    const settings = await this.context.getSettings();
    await this.context.ensureLoaded();
    const previousCases = this.context.state.index?.cases ?? [];
    const previous = previousCases.find((item) => item.folderPath === folderPath);
    const folderName = path.basename(folderPath);
    const monthFolder = previous?.monthFolder ?? path.basename(path.dirname(folderPath));
    const isClosedFolder = previous?.isClosedFolder ?? normalizeSearch(`${monthFolder} ${folderPath}`).includes('KAPALI');
    const identity = buildCaseIdentity({
      folderPath,
      folderName,
      plate: previous?.plate ?? parsePlateFromFolderName(folderName),
      dosyaNo: previous?.dosyaNo ?? parseDosyaNoFromFolderName(folderName),
      officeFileNo: previous?.officeFileNo ?? result.tracking.caseIdentity.officeFileNo ?? '',
      claimNoticeNo: previous?.claimNoticeNo ?? result.tracking.caseIdentity.claimNoticeNo ?? '',
      monthFolder,
      isClosedFolder
    });
    // Not/görev/alan gibi takip mutasyonları klasördeki belgeleri/fotoğrafları DEĞİŞTİRMEZ. Bu yüzden
    // her not ekleme/silmede tüm PDF'leri yeniden ayrıştırmak ve taranmış PDF'lerde OCR çalıştırmak
    // gereksizdir; ayrıca pCloud'da henüz inmemiş sanal dosyalarda bu okumalar OS seviyesinde uzun süre
    // askıda kalıp ilgili dosyanın mutasyon kuyruğunu kilitleyebilir (kullanıcıda "not yazamıyorum" kilidi).
    // Mevcut analiz/parmak izi yeniden kullanılır; ağır analiz yalnızca claim tipi değişince ya da
    // tarama / "Dosyayı Yenile" sırasında tazelenir.
    const claimTypeUnchanged = Boolean(previous?.documentAnalysis && previous.documentAnalysis.claimType === result.tracking.claimType);
    const fingerprint = claimTypeUnchanged
      ? previous!.fingerprint
      : await getFolderFingerprint(folderPath).catch(() => previous?.fingerprint);
    const documentAnalysis = claimTypeUnchanged
      ? previous!.documentAnalysis
      : await analyzeDocuments(folderPath, result.tracking.claimType, identity.plate).catch(() => previous?.documentAnalysis ?? null);
    const previousPhotoAnalysis = previous ? previous.photoAnalysis : emptyPhotoAnalysis();
    const previousFolderContents = previous ? previous.folderContents : { groups: [], totalFilesScanned: 0, warnings: [] };
    const baseItem: CaseIndexItem = previous ?? {
      id: normalizeSearch(folderPath),
      plate: identity.plate,
      dosyaNo: identity.dosyaNo,
      officeFileNo: result.tracking.caseIdentity.officeFileNo || '',
      claimNoticeNo: result.tracking.caseIdentity.claimNoticeNo || documentAnalysis?.claimNoticeNo || identity.dosyaNo || '',
      monthFolder,
      folderPath,
      isClosedFolder,
      claimType: result.tracking.claimType,
      workflowStatus: result.tracking.status.workflowStatus,
      dosyaDurumu: result.tracking.status.dosyaDurumu,
      oncelik: result.tracking.assignment.oncelik,
      sorumlu: result.tracking.assignment.sorumlu,
      serviceName: result.tracking.service?.name ?? '',
      eksper: result.tracking.assignment.eksper,
      raportor: result.tracking.assignment.raportor,
      takipTarihi: result.tracking.assignment.takipTarihi,
      revision: result.tracking.metadata.revision,
      updatedAt: result.tracking.metadata.updatedAt,
      documentAnalysis: documentAnalysis ?? emptyDocumentAnalysis(result.tracking.claimType),
      photoAnalysis: previousPhotoAnalysis,
      folderContents: previousFolderContents,
      tracking: result.tracking,
      fingerprint: fingerprint ?? { folderPath, mtimeMs: 0, size: 0, childCount: 0, evrakMtimeMs: 0, hasarMtimeMs: 0, trackingMtimeMs: 0, hash: '' },
      searchText: '',
      statusIsClosed: result.tracking.status.kapaliMi
    };
    const patched = applyTrackingToCaseIndexItem({ ...baseItem, documentAnalysis: documentAnalysis ?? baseItem.documentAnalysis, fingerprint: fingerprint ?? baseItem.fingerprint }, result.tracking);
    const nextCases = previousCases.some((item) => item.folderPath === folderPath)
      ? previousCases.map((item) => item.folderPath === folderPath ? patched : item)
      : [...previousCases, patched];
    this.context.state.index = { schemaVersion: 1, rootPath: settings.rootPath, generatedAt: nowIso(), cases: nextCases };
    if (previous) await this.context.cache.writeCaseCache(patched);
    else await this.context.cache.writeIndex(this.context.state.index, inferYearFromRootPath(settings.rootPath, 2026));
    if (fingerprint) {
      const fingerprints = await this.context.cache.readFingerprints();
      fingerprints[folderPath] = fingerprint;
      await this.context.cache.writeFingerprints(fingerprints);
    }
    this.context.state.rootAvailable = await existsDirectory(settings.rootPath);
    this.context.state.lastScanAt = this.context.state.index.generatedAt;
    await this.context.cache.recordSeenTracking(folderPath, result.tracking, settings.rootPath);
    this.context.mainWindowProvider()?.webContents.send(IPC_SEND_CHANNEL.caseUpdated, patched);
  }

  private async refreshCachedTrackingFromDisk(): Promise<void> {
    const nowMs = Date.now();
    // Hotfix 6: cases:list ve dashboard:get aynı anda çağrıldığında aynı pCloud okumalarını iki kez yapma.
    if (nowMs - this.context.state.lastTrackingRefreshAt < TRACKING_REFRESH_MIN_INTERVAL_MS) return;
    if (this.context.state.refreshTrackingPromise) return this.context.state.refreshTrackingPromise;
    this.context.state.refreshTrackingPromise = this.refreshCachedTrackingFromDiskInternal().finally(() => {
      this.context.state.lastTrackingRefreshAt = Date.now();
      this.context.state.refreshTrackingPromise = null;
    });
    return this.context.state.refreshTrackingPromise;
  }

  private async refreshCachedTrackingFromDiskInternal(): Promise<void> {
    if (!this.context.state.index || this.context.state.index.cases.length === 0) return;
    let changed = false;
    const settings = await this.context.getSettings();
    const writeIndex = await this.context.cache.readTrackingWriteIndex(settings.rootPath);
    const nextWriteIndex = { ...writeIndex, entries: { ...writeIndex.entries }, generatedAt: nowIso(), rootPath: settings.rootPath };
    const changedCaseCaches: CaseIndexItem[] = [];
    const nextCases = await mapWithConcurrency(this.context.state.index.cases, TRACKING_REFRESH_CONCURRENCY, async (item) => {
      const refreshed = await this.refreshCaseItemTrackingFromDisk(item, writeIndex, nextWriteIndex);
      if (refreshed !== item) {
        changed = true;
        changedCaseCaches.push(refreshed);
      }
      return refreshed;
    });
    await this.context.cache.writeTrackingWriteIndex(nextWriteIndex);
    if (!changed) return;
    this.context.state.index = {
      ...this.context.state.index,
      generatedAt: nowIso(),
      // v0.3.15: cases:list/dashboard refresh sonrası büyük year-index dosyasını her seferinde yazmayız.
      // Değişen takip verileri tekil case cache dosyalarına gider; readIndex bunları ana index üzerine merge eder.
      cases: nextCases
    };
    await Promise.all(changedCaseCaches.map((item) => this.context.cache.writeCaseCache(item)));
    this.context.state.lastScanAt = this.context.state.index.generatedAt;
  }

  private async refreshSingleCaseAnalysis(folderPath: string): Promise<CaseIndexItem> {
    const settings = await this.context.getSettings();
    assertSafeCasePath(folderPath, settings.rootPath);
    if (!await existsDirectory(folderPath)) throw new Error('Seçili dosya klasörü bulunamadı.');
    await this.context.ensureLoaded();
    const previousCases = this.context.state.index?.cases ?? [];
    const previous = previousCases.find((item) => item.folderPath === folderPath);
    const folderName = path.basename(folderPath);
    const monthFolder = previous?.monthFolder ?? path.basename(path.dirname(folderPath));
    const identity = buildCaseIdentity({
      folderPath,
      folderName,
      plate: previous?.plate ?? parsePlateFromFolderName(folderName),
      dosyaNo: previous?.dosyaNo ?? parseDosyaNoFromFolderName(folderName),
      officeFileNo: previous?.officeFileNo ?? '',
      claimNoticeNo: previous?.claimNoticeNo ?? '',
      monthFolder,
      isClosedFolder: previous?.isClosedFolder ?? normalizeSearch(`${monthFolder} ${folderPath}`).includes('KAPALI')
    });
    const fingerprint = await getFolderFingerprint(folderPath);
    const analyzed = await new FolderAnalyzer(this.context.tracking).analyze(identity, fingerprint, settings.activeUser);
    const refreshed = await this.applySingleRefreshSafety(previous, { ...analyzed.item }, settings.rootPath);
    const cases: CaseIndexItem[] = previousCases.some((item) => item.folderPath === folderPath)
      ? previousCases.map((item) => item.folderPath === folderPath ? refreshed : item)
      : [...previousCases, refreshed];
    const nextIndex = { schemaVersion: 1 as const, rootPath: settings.rootPath, generatedAt: nowIso(), cases };
    this.context.state.index = nextIndex;
    this.context.state.rootAvailable = await existsDirectory(settings.rootPath);
    this.context.state.lastScanAt = nextIndex.generatedAt;
    await Promise.all([
      this.context.cache.writeCaseCache(refreshed),
      ...(hasUnsafeTrackingIssue(refreshed) ? [] : [this.context.cache.recordSeenTracking(folderPath, refreshed.tracking, settings.rootPath)]),
      this.context.cache.writeFingerprints({ ...(await this.context.cache.readFingerprints()), [folderPath]: fingerprint })
    ]);
    this.context.mainWindowProvider()?.webContents.send(IPC_SEND_CHANNEL.caseUpdated, refreshed);
    return refreshed;
  }

  private async applySingleRefreshSafety(previous: CaseIndexItem | undefined, analyzed: CaseIndexItem, rootPath: string): Promise<CaseIndexItem> {
    const writeIndex = await this.context.cache.readTrackingWriteIndex(rootPath);
    const issues: CaseTrackingIssue[] = [...(analyzed.caseIssues ?? [])];
    const missing = missingPreviouslySeenTrackingIssue(analyzed, writeIndex);
    const regression = revisionRegressionIssue(analyzed, analyzed.tracking, writeIndex);
    const divergence = sameRevisionDifferentWriteIssue(analyzed, analyzed.tracking, writeIndex);
    const conflictCopy = pcloudConflictCopyIssue(analyzed);
    for (const issue of [missing, regression, divergence, conflictCopy]) {
      if (issue) issues.push(issue);
    }

    const blocking = Boolean(missing || regression || divergence);
    let output = blocking && previous
      ? {
          ...previous,
          documentAnalysis: analyzed.documentAnalysis,
          photoAnalysis: analyzed.photoAnalysis,
          folderContents: analyzed.folderContents,
          fingerprint: analyzed.fingerprint,
          searchText: analyzed.searchText
        }
      : analyzed;

    if (issues.length > 0) {
      for (const issue of issues) output = upsertCaseIssue(output, issue);
      return output;
    }
    return clearIssueTypes(output, ['same-revision-different-write', 'revision-regression', 'pcloud-conflict-copy', ...TRACKING_READ_ISSUE_TYPES]);
  }

  private async refreshSingleCachedTrackingFromDisk(folderPath: string): Promise<void> {
    if (!this.context.state.index) return;
    const index = this.context.state.index.cases.findIndex((item) => item.folderPath === folderPath);
    if (index === -1) return;
    const previous = this.context.state.index.cases[index];
    if (!previous) return;
    const settings = await this.context.getSettings();
    const writeIndex = await this.context.cache.readTrackingWriteIndex(settings.rootPath);
    const nextWriteIndex = { ...writeIndex, entries: { ...writeIndex.entries }, generatedAt: nowIso(), rootPath: settings.rootPath };
    const refreshed = await this.refreshCaseItemTrackingFromDisk(previous, writeIndex, nextWriteIndex);
    await this.context.cache.writeTrackingWriteIndex(nextWriteIndex);
    if (refreshed === previous) return;
    const cases = [...this.context.state.index.cases];
    cases[index] = refreshed;
    this.context.state.index = { ...this.context.state.index, generatedAt: nowIso(), cases };
    await this.context.cache.writeCaseCache(refreshed);
    this.context.state.lastScanAt = this.context.state.index.generatedAt;
  }

  private async refreshCaseItemTrackingFromDisk(item: CaseIndexItem, writeIndex: Awaited<ReturnType<LocalCacheStore['readTrackingWriteIndex']>>, nextWriteIndex: Awaited<ReturnType<LocalCacheStore['readTrackingWriteIndex']>>): Promise<CaseIndexItem> {
    try {
      const read = await this.context.tracking.readExistingWithIssue(caseIdentityFromIndexItem(item), 'tracking');
      if (read.issue) return upsertCaseIssue(item, read.issue);
      const tracking = read.tracking;
      if (!tracking) {
        const missingIssue = missingPreviouslySeenTrackingIssue(item, writeIndex);
        return missingIssue ? upsertCaseIssue(item, missingIssue) : clearIssueTypes(item, TRACKING_READ_ISSUE_TYPES);
      }
      const regression = revisionRegressionIssue(item, tracking, writeIndex);
      if (regression) return upsertCaseIssue(item, regression);
      const divergence = sameRevisionDifferentWriteIssue(item, tracking, writeIndex);
      if (divergence) return upsertCaseIssue(item, divergence);
      const hash = hashCasePath(item.folderPath);
      if (tracking.metadata.writeId) nextWriteIndex.entries[hash] = buildTrackingWriteIndexEntry(item.folderPath, tracking, hash);
      if (!hasTrackingCacheDifference(item, tracking)) return clearIssueTypes(item, ['same-revision-different-write', 'revision-regression', ...TRACKING_READ_ISSUE_TYPES]);
      return clearIssueTypes(applyTrackingToCaseIndexItem(item, tracking), ['same-revision-different-write', 'revision-regression', ...TRACKING_READ_ISSUE_TYPES]);
    } catch {
      return item;
    }
  }
}
