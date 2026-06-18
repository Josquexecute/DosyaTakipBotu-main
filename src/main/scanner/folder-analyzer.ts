import type { CaseIdentity, CaseIndexItem, FolderFingerprint, TrackingFile } from '../../shared/types';
import { normalizeSearch, plateKey } from '../../shared/turkish';
import type { CaseFolderDiscovery } from './case-folder-utils';
import { analyzeDocuments } from '../import/document-analyzer';
import { analyzePhotos } from '../import/photo-analyzer';
import { analyzeCaseFolderContents } from '../import/case-folder-content-analyzer';
import { TrackingFileService } from '../tracking/tracking-file-service';

export class FolderAnalyzer {
  constructor(private readonly tracking: TrackingFileService) {}

  async analyze(caseIdentity: CaseIdentity, fingerprint: FolderFingerprint, user: string): Promise<{ item: CaseIndexItem; createdTracking: boolean; corruptTracking: boolean }> {
    const trackingRead = await this.tracking.readForScan(caseIdentity, user);
    const t = trackingRead.tracking;
    const [documentAnalysis, photoAnalysis, folderContents] = await Promise.all([
      analyzeDocuments(caseIdentity.folderPath, t.claimType, caseIdentity.plate),
      analyzePhotos(caseIdentity.folderPath),
      analyzeCaseFolderContents(caseIdentity.folderPath)
    ]);
    const officeFileNo = t.caseIdentity.officeFileNo ?? '';
    const claimNoticeNo = t.caseIdentity.claimNoticeNo || documentAnalysis.claimNoticeNo || t.caseIdentity.dosyaNo || '';
    const item: CaseIndexItem = applyTrackingToCaseIndexItem({
      id: plateKey(caseIdentity.folderPath),
      plate: caseIdentity.plate,
      dosyaNo: caseIdentity.dosyaNo,
      officeFileNo,
      claimNoticeNo,
      monthFolder: caseIdentity.monthFolder,
      folderPath: caseIdentity.folderPath,
      isClosedFolder: caseIdentity.isClosedFolder,
      claimType: t.claimType !== 'unknown' ? t.claimType : documentAnalysis.claimType,
      workflowStatus: t.status.workflowStatus,
      dosyaDurumu: t.status.dosyaDurumu,
      oncelik: t.assignment.oncelik,
      sorumlu: t.assignment.sorumlu,
      serviceName: t.service?.name ?? '',
      eksper: t.assignment.eksper,
      raportor: t.assignment.raportor,
      takipTarihi: t.assignment.takipTarihi,
      revision: t.metadata.revision,
      updatedAt: t.metadata.updatedAt,
      documentAnalysis,
      photoAnalysis,
      folderContents,
      tracking: t,
      fingerprint,
      searchText: '',
      statusIsClosed: t.status.kapaliMi,
      caseIssues: trackingRead.state === 'absent-suspicious' ? [{
        type: 'partial-sync-missing-tracking',
        severity: 'critical',
        title: 'Kısmi senkron şüphesi',
        message: trackingRead.message,
        detectedAt: new Date().toISOString(),
        source: 'scanner'
      }] : [],
      ...(trackingRead.corrupt ? { corruptTracking: true } : {})
    }, t);
    return { item, createdTracking: false, corruptTracking: trackingRead.corrupt };
  }
}

export function applyTrackingToCaseIndexItem(item: CaseIndexItem, tracking: TrackingFile): CaseIndexItem {
  const nextDosyaNo = tracking.caseIdentity.dosyaNo || item.dosyaNo;
  const nextOfficeFileNo = tracking.caseIdentity.officeFileNo || item.officeFileNo || '';
  const nextClaimNoticeNo = tracking.caseIdentity.claimNoticeNo || item.documentAnalysis.claimNoticeNo || item.claimNoticeNo || nextDosyaNo;
  const next: CaseIndexItem = {
    ...item,
    dosyaNo: nextDosyaNo,
    officeFileNo: nextOfficeFileNo,
    claimNoticeNo: nextClaimNoticeNo,
    workflowStatus: tracking.status.workflowStatus,
    dosyaDurumu: tracking.status.dosyaDurumu,
    claimType: tracking.claimType !== 'unknown' ? tracking.claimType : item.documentAnalysis.claimType,
    oncelik: tracking.assignment.oncelik,
    sorumlu: tracking.assignment.sorumlu,
    serviceName: tracking.service?.name ?? '',
    eksper: tracking.assignment.eksper,
    raportor: tracking.assignment.raportor,
    takipTarihi: tracking.assignment.takipTarihi,
    revision: tracking.metadata.revision,
    updatedAt: tracking.metadata.updatedAt,
    tracking,
    statusIsClosed: tracking.status.kapaliMi
  };
  next.searchText = normalizeSearch([
    next.plate,
    nextOfficeFileNo,
    nextClaimNoticeNo,
    nextDosyaNo,
    next.monthFolder,
    next.folderPath,
    tracking.assignment.sorumlu,
    tracking.service?.name ?? '',
    tracking.claimType,
    tracking.assignment.eksper,
    tracking.assignment.raportor,
    tracking.status.dosyaDurumu,
    tracking.status.workflowStatus
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(' '));
  return next;
}

export function hasTrackingCacheDifference(item: CaseIndexItem, tracking: TrackingFile): boolean {
  return item.revision !== tracking.metadata.revision
    || item.updatedAt !== tracking.metadata.updatedAt
    || item.tracking.metadata.writeId !== tracking.metadata.writeId
    || item.dosyaNo !== tracking.caseIdentity.dosyaNo
    || item.officeFileNo !== (tracking.caseIdentity.officeFileNo || '')
    || item.claimNoticeNo !== (tracking.caseIdentity.claimNoticeNo || item.documentAnalysis.claimNoticeNo || tracking.caseIdentity.dosyaNo || '')
    || item.sorumlu !== tracking.assignment.sorumlu
    || item.serviceName !== (tracking.service?.name ?? '')
    || item.claimType !== (tracking.claimType !== 'unknown' ? tracking.claimType : item.documentAnalysis.claimType)
    || item.eksper !== tracking.assignment.eksper
    || item.raportor !== tracking.assignment.raportor
    || item.takipTarihi !== tracking.assignment.takipTarihi
    || item.oncelik !== tracking.assignment.oncelik
    || item.workflowStatus !== tracking.status.workflowStatus
    || item.dosyaDurumu !== tracking.status.dosyaDurumu
    || item.statusIsClosed !== tracking.status.kapaliMi;
}

export function buildCaseIdentity(discovery: CaseFolderDiscovery): CaseIdentity {
  return {
    caseKey: discovery.folderName,
    plate: discovery.plate,
    dosyaNo: discovery.dosyaNo,
    officeFileNo: discovery.officeFileNo || '',
    claimNoticeNo: discovery.claimNoticeNo || '',
    folderPath: discovery.folderPath,
    monthFolder: discovery.monthFolder,
    isClosedFolder: discovery.isClosedFolder
  };
}
