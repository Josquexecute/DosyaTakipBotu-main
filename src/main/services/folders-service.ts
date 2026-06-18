import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { FolderBrowseResult, FolderNode, FolderTrackingStatus } from '../../shared/types';
import { OFFICE_VERSION_FOLDER_NAME, REQUIRED_CASE_SUBFOLDERS, TRACKING_FILE_NAME, TRACKING_FOLDER_NAME } from '../../shared/constants';
import { matchCaseSubfolderCanonical, parsePlateFromFolderName } from '../scanner/case-folder-utils';
import { assertSafeCasePath, normalizePathForCompare } from '../security';
import { existsDirectory } from './fs-utils';
import type { IpcDomainContext } from './ipc-domain-services';

/**
 * Yalnızca-okunur klasör gezgini servisi. ipc-domain-services.ts'ten ayrıştırıldı; davranış birebir korunur.
 * Aktif kök altındaki klasörleri güvenle gezer; dosya klasörlerini ve alt grupları (EVRAK/HASAR…) listeler.
 * takip.json YAZMAZ; yalnızca klasör durumunu (varsa revizyon/tarih) gösterim için okur.
 */
export class FoldersService {
  constructor(private readonly context: IpcDomainContext) {}

  async browse(folderPath?: string): Promise<FolderBrowseResult> {
    const settings = await this.context.getSettings();
    const rootPath = settings.rootPath;
    const rootAvailable = await existsDirectory(rootPath);
    const requested = folderPath && folderPath.trim() ? folderPath.trim() : rootPath;
    const target = path.resolve(requested);
    // Güvenlik: yalnızca kök altındaki yollar; üst klasöre kaçış reddedilir.
    assertSafeCasePath(target, rootPath);

    const atRoot = normalizePathForCompare(target) === normalizePathForCompare(path.resolve(rootPath));
    const parentPath = atRoot ? null : path.dirname(target);

    const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => [] as Dirent[]);
    const dirEntries = entries.filter((entry) => entry.isDirectory());
    const targetIsCase = isCaseFolderFromEntries(dirEntries);

    if (targetIsCase) {
      const nodes = buildCaseGroupNodes(target, dirEntries);
      const tracking = await readTrackingStatus(target, dirEntries);
      return { rootPath, currentPath: target, parentPath, atRoot, rootAvailable, targetIsCase: true, tracking, nodes };
    }

    const nodes: FolderNode[] = dirEntries
      .filter((entry) => entry.name !== TRACKING_FOLDER_NAME && entry.name !== OFFICE_VERSION_FOLDER_NAME)
      .map((entry) => {
        const childPath = path.join(target, entry.name);
        const plate = parsePlateFromFolderName(entry.name);
        const isCaseLike = plate !== entry.name;
        const node: FolderNode = {
          name: entry.name,
          path: childPath,
          kind: atRoot ? 'month' : isCaseLike ? 'case' : 'folder',
          exists: true,
          navigable: true,
          selectable: isCaseLike
        };
        if (isCaseLike) node.plate = plate;
        return node;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    return { rootPath, currentPath: target, parentPath, atRoot, rootAvailable, targetIsCase: false, nodes };
  }
}

function isCaseFolderFromEntries(dirEntries: Dirent[]): boolean {
  if (dirEntries.some((entry) => entry.name === TRACKING_FOLDER_NAME)) return true;
  return dirEntries.some((entry) => matchCaseSubfolderCanonical(entry.name) !== null);
}

function buildCaseGroupNodes(caseFolderPath: string, dirEntries: Dirent[]): FolderNode[] {
  const actualByCanonical = new Map<string, string>();
  for (const entry of dirEntries) {
    const canonical = matchCaseSubfolderCanonical(entry.name);
    if (canonical && !actualByCanonical.has(canonical)) actualByCanonical.set(canonical, entry.name);
  }
  return (REQUIRED_CASE_SUBFOLDERS as FolderNode['groupKey'][]).filter((key): key is NonNullable<FolderNode['groupKey']> => !!key).map((key) => {
    const actualName = actualByCanonical.get(key);
    return {
      name: actualName ?? key,
      path: path.join(caseFolderPath, actualName ?? key),
      kind: 'group' as const,
      groupKey: key,
      required: true,
      exists: actualName !== undefined,
      navigable: false,
      selectable: false
    };
  });
}

async function readTrackingStatus(caseFolderPath: string, dirEntries: Dirent[]): Promise<FolderTrackingStatus> {
  if (!dirEntries.some((entry) => entry.name === TRACKING_FOLDER_NAME)) return { exists: false };
  const trackingFile = path.join(caseFolderPath, TRACKING_FOLDER_NAME, TRACKING_FILE_NAME);
  const stat = await fs.stat(trackingFile).catch(() => null);
  if (!stat?.isFile()) return { exists: false };
  try {
    const parsed = JSON.parse(await fs.readFile(trackingFile, 'utf-8')) as { metadata?: { revision?: unknown; updatedAt?: unknown; updatedByComputer?: unknown } };
    const metadata = parsed?.metadata ?? {};
    const status: FolderTrackingStatus = { exists: true };
    if (typeof metadata.revision === 'number') status.revision = metadata.revision;
    if (typeof metadata.updatedAt === 'string') status.updatedAt = metadata.updatedAt;
    if (typeof metadata.updatedByComputer === 'string') status.updatedByComputer = metadata.updatedByComputer;
    return status;
  } catch {
    return { exists: true, issue: 'corrupt' };
  }
}
