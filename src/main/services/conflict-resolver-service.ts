import type { ConflictResolutionArgs } from '../../shared/types';
import { assertSafeCasePath } from '../security';
import { nowIso } from '../tracking/tracking-defaults';
import { applyTrackingToCaseIndexItem } from '../scanner/folder-analyzer';
import { clearIssueTypes } from './tracking-issue-helpers';
import type { IpcDomainContext } from './ipc-domain-services';
import type { CasesQueryService } from './ipc-domain-services';

/**
 * Çakışma çözümü servisi. ipc-domain-services.ts'ten ayrıştırıldı; davranış birebir korunur.
 * takip.json yazma/okuma mantığı TrackingFileService'te kalır — bu servis yalnızca onu orkestre eder
 * (güvenli yol kontrolü, mutasyon izni, çözüm sonrası önbellek tazeleme, disk baseline kabulü).
 */
export class ConflictResolverService {
  constructor(private readonly context: IpcDomainContext, private readonly cases: CasesQueryService) {}

  async resolveConflict(args: ConflictResolutionArgs) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(args.folderPath, settings.rootPath);
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const result = await this.context.tracking.resolveConflict(args.folderPath, args.currentRevision, args.currentWriteId, settings.activeUser, args.strategy, args.baseTracking, args.localTracking);
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async inspectConflictCopy(folderPath: string) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(folderPath, settings.rootPath);
    const inspection = await this.context.tracking.inspectFirstConflictCopy(folderPath);
    if (inspection) return inspection;

    // v0.3.13: pCloud Drive modunda conflict copy oluşmayabilir.
    // Bu durumda cache'teki güvenli sürümü yerel taraf, diskteki mevcut takip.json'u current taraf olarak döndürürüz.
    await this.context.ensureLoaded();
    const cached = (this.context.state.index?.cases ?? []).find((item) => item.folderPath === folderPath)?.tracking ?? null;
    const current = await this.context.tracking.readExisting(folderPath);
    if (cached && current && cached.metadata.writeId !== current.metadata.writeId) {
      return {
        folderPath,
        fileName: 'cache-vs-disk',
        filePath: this.context.tracking.getTrackingPath(folderPath),
        current,
        conflictTracking: cached
      };
    }
    throw new Error('Bu dosyada okunabilir takip conflict kopyası veya cache/disk farkı bulunamadı. Klasörü açıp _HASARBOTU içini manuel kontrol edin.');
  }

  async acceptDiskBaseline(folderPath: string) {
    const settings = await this.context.getSettings();
    assertSafeCasePath(folderPath, settings.rootPath);
    const tracking = await this.context.tracking.readExisting(folderPath);
    if (!tracking) throw new Error('Diskteki takip.json okunamadı; baseline kabul edilemedi.');
    await this.context.cache.recordSeenTracking(folderPath, tracking, settings.rootPath);
    await this.context.ensureLoaded();
    const cases = this.context.state.index?.cases ?? [];
    this.context.state.index = this.context.state.index ? {
      ...this.context.state.index,
      generatedAt: nowIso(),
      cases: cases.map((item) => item.folderPath === folderPath ? clearIssueTypes(applyTrackingToCaseIndexItem(item, tracking), ['revision-regression', 'same-revision-different-write']) : item)
    } : this.context.state.index;
    const updated = this.context.state.index?.cases.find((item) => item.folderPath === folderPath) ?? null;
    if (updated) await this.context.cache.writeCaseCache(updated);
    return { ok: true, tracking };
  }
}
