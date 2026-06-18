import path from 'node:path';
import type { CaseIdentity, CaseIndexItem, CaseTrackingIssue, TrackingFile } from '../../shared/types';
import { hashCasePath, type LocalCacheStore } from '../local-cache/local-cache-store';
import { nowIso } from '../tracking/tracking-defaults';

/**
 * Takip (takip.json) okuma/çakışma tespiti ve dosya-sorunu (caseIssues) yardımcıları.
 * ipc-domain-services.ts'ten ayrıştırıldı; davranış birebir korunur. pCloud eşzamanlı yazma,
 * revizyon gerilemesi, kayıp takip ve çakışma kopyası gibi durumları sessiz ezme olmadan işaretler.
 */

export type TrackingWriteIndex = Awaited<ReturnType<LocalCacheStore['readTrackingWriteIndex']>>;

export const TRACKING_READ_ISSUE_TYPES: CaseTrackingIssue['type'][] = ['corrupt-tracking', 'unsupported-schema', 'partial-sync-missing-tracking', 'scan-failed-folder'];

export function sameRevisionDifferentWriteIssue(item: CaseIndexItem, tracking: TrackingFile, writeIndex: TrackingWriteIndex): CaseTrackingIssue | null {
  const hash = hashCasePath(item.folderPath);
  const previous = writeIndex.entries[hash];
  const writeId = tracking.metadata.writeId || '';
  if (!previous || !previous.lastSeenWriteId || !writeId) return null;
  if (previous.lastSeenRevision !== tracking.metadata.revision || previous.lastSeenWriteId === writeId) return null;
  return {
    type: 'same-revision-different-write',
    severity: 'critical',
    title: 'Aynı revizyonda farklı kayıt',
    message: 'Diskteki takip.json aynı revizyonda farklı writeId taşıyor. pCloud eşzamanlı yazma/sessiz ezme riski nedeniyle otomatik yenileme durduruldu.',
    detectedAt: nowIso(),
    source: 'tracking',
    action: 'compare'
  };
}

export function revisionRegressionIssue(item: CaseIndexItem, tracking: TrackingFile, writeIndex: TrackingWriteIndex): CaseTrackingIssue | null {
  const hash = hashCasePath(item.folderPath);
  const previous = writeIndex.entries[hash];
  if (!previous) return null;
  if (tracking.metadata.revision >= previous.lastSeenRevision) return null;
  return {
    type: 'revision-regression',
    severity: 'critical',
    title: 'Revizyon gerilemesi',
    message: `Diskteki takip.json revizyonu önceki güvenli kayıttan düşük görünüyor (${previous.lastSeenRevision} -> ${tracking.metadata.revision}). pCloud rollback/eski kopya/default reset riski nedeniyle otomatik yenileme durduruldu.`,
    detectedAt: nowIso(),
    source: 'tracking',
    action: 'compare'
  };
}

export function missingPreviouslySeenTrackingIssue(item: CaseIndexItem, writeIndex: TrackingWriteIndex): CaseTrackingIssue | null {
  const hash = hashCasePath(item.folderPath);
  const previous = writeIndex.entries[hash];
  const previousWriteId = previous?.lastSeenWriteId || item.tracking.metadata.writeId || '';
  if (!previousWriteId) return null;
  const previousRevision = previous?.lastSeenRevision ?? item.tracking.metadata.revision;
  return {
    type: 'partial-sync-missing-tracking',
    severity: 'critical',
    title: 'Takip dosyası kayıp görünüyor',
    message: `Bu dosya için daha önce takip.json görülmüştü (son güvenli revizyon ${previousRevision}). Şu anda disk üzerinde takip.json okunamıyor veya bulunamıyor; pCloud kısmi senkron/manuel silme/rollback riski nedeniyle yerel cache varsayılan veriyle değiştirilmedi.`,
    detectedAt: nowIso(),
    source: 'tracking',
    action: 'compare'
  };
}

export function caseIdentityFromIndexItem(item: CaseIndexItem): CaseIdentity {
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

export function pcloudConflictCopyIssue(item: CaseIndexItem): CaseTrackingIssue | null {
  if (item.documentAnalysis.conflictFiles.length === 0) return null;
  return {
    type: 'pcloud-conflict-copy',
    severity: 'critical',
    title: 'pCloud çakışma kopyası',
    message: `Bu dosyada conflict/kopya tespit edildi: ${item.documentAnalysis.conflictFiles.join(', ')}`,
    detectedAt: nowIso(),
    source: 'tracking',
    action: 'compare'
  };
}

export function hasUnsafeTrackingIssue(item: CaseIndexItem): boolean {
  return (item.caseIssues ?? []).some((issue) => issue.type === 'revision-regression'
    || issue.type === 'same-revision-different-write'
    || issue.type === 'partial-sync-missing-tracking'
    || issue.type === 'corrupt-tracking'
    || issue.type === 'unsupported-schema'
    || issue.type === 'scan-failed-folder');
}

export function upsertCaseIssue(item: CaseIndexItem, issue: CaseTrackingIssue): CaseIndexItem {
  const rest = (item.caseIssues ?? []).filter((existing) => existing.type !== issue.type || existing.message !== issue.message);
  return withCaseIssues(item, [issue, ...rest]);
}

export function clearIssueTypes(item: CaseIndexItem, types: CaseTrackingIssue['type'][]): CaseIndexItem {
  const nextIssues = (item.caseIssues ?? []).filter((issue) => !types.includes(issue.type));
  if (nextIssues.length === (item.caseIssues ?? []).length) return item;
  return withCaseIssues(item, nextIssues);
}

export function withCaseIssues(item: CaseIndexItem, issues: CaseTrackingIssue[]): CaseIndexItem {
  const { trackingIssue: _oldTrackingIssue, ...rest } = item;
  const next: CaseIndexItem = { ...rest, caseIssues: issues };
  const critical = issues.find((issue) => issue.severity === 'critical');
  if (critical) return { ...next, trackingIssue: critical };
  return next;
}
