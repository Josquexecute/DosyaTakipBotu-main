import path from 'node:path';
import type { CaseFolderContents, FolderContentGroup } from '../../shared/types';
import { safeFileDisplayName } from '../../shared/turkish';
import { findCaseSubfolder, listFilesRecursive, type CaseSubfolderCanonical } from '../scanner/case-folder-utils';

const GROUPS: CaseSubfolderCanonical[] = ['EVRAK', 'HASAR', 'OLAY YERİ', 'ONARIM'];

export async function analyzeCaseFolderContents(caseFolderPath: string): Promise<CaseFolderContents> {
  const groups: FolderContentGroup[] = [];
  for (const key of GROUPS) {
    const located = await findCaseSubfolder(caseFolderPath, key);
    const listing = located.exists ? await listFilesRecursive(located.path) : { exists: false, files: [] as string[] };
    const sampleFiles = listing.files
      .map((file) => safeFileDisplayName(path.relative(located.path, file) || path.basename(file)));
    const warnings: string[] = [];
    if (!listing.exists) warnings.push(`${key} klasörü bulunamadı veya okunamadı.`);
    groups.push({ key, exists: listing.exists, filesScanned: listing.files.length, sampleFiles, warnings });
  }
  return {
    groups,
    totalFilesScanned: groups.reduce((sum, group) => sum + group.filesScanned, 0),
    warnings: groups.flatMap((group) => group.warnings)
  };
}
