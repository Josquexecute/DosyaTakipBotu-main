import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeSearch, normalizeTurkish } from '../../shared/turkish';
import { TRACKING_FOLDER_NAME } from '../../shared/constants';

export interface CaseFolderDiscovery {
  folderPath: string;
  folderName: string;
  plate: string;
  dosyaNo: string;
  officeFileNo: string;
  claimNoticeNo: string;
  monthFolder: string;
  isClosedFolder: boolean;
}

export type CaseSubfolderCanonical = 'EVRAK' | 'HASAR' | 'OLAY YERİ' | 'ONARIM';

const CASE_SUBFOLDER_ALIASES: Record<CaseSubfolderCanonical, string[]> = {
  EVRAK: ['EVRAK', 'BELGE', 'BELGELER', 'DOKUMAN'],
  HASAR: ['HASAR', 'FOTOGRAF', 'FOTOGRAFLAR', 'HASAR FOTOGRAFLARI'],
  'OLAY YERİ': ['OLAY YERI', 'OLAYYERI', 'OLAY YERI FOTOGRAFLARI', 'OLAYYERI FOTOGRAFLARI', 'KAZA YERI', 'KAZA YERI FOTOGRAFLARI', 'OLAY'],
  ONARIM: ['ONARIM', 'SERVIS', 'TAMIR']
};

const NON_CASE_FOLDER_NAMES = new Set([
  'SABLONLAR', 'ORTAK', 'ORTAK BELGELER', 'RAPOR', 'RAPORLAR', 'ARSIV', 'YEDEK',
  'EXCEL', 'TOPLU FOTO', 'FOTO AKTARIM', 'GENEL', 'ESKI'
]);

export async function discoverCaseFolders(rootPath: string): Promise<CaseFolderDiscovery[]> {
  const discovered: CaseFolderDiscovery[] = [];

  // 1) Eski akıllı keşif: plate, EVRAK/HASAR/NOTLAR işaretleri ve ay/kapalı ay konteynerlerini gezer.
  await walk(rootPath, [], 0, false, discovered);

  // 2) Ofis klasör yapısı destek modu:
  // 2026 -> Nisan 2026 -> 34BOP660
  // 2026 -> Nisan 2026 -> KAPALI NİSAN 2026 -> 01FJG08
  // Konteyner altındaki klasörler yine güçlü hasar dosyası sinyali olmadan dosya sayılmaz.
  await collectCasesFromKnownContainers(rootPath, [], 0, discovered);

  // 3) Hiçbir şey bulunamadıysa, seçilen klasörün kendisi tek dosya olabilir.
  if (discovered.length === 0 && await looksLikeSingleCaseFolder(rootPath)) {
    discovered.push(toDiscovery(rootPath, [path.basename(rootPath)]));
  }

  discovered.sort((a, b) => a.folderPath.localeCompare(b.folderPath, 'tr'));
  return dedupeByPath(discovered);
}

export async function findCaseSubfolder(caseFolderPath: string, canonical: CaseSubfolderCanonical): Promise<{ exists: boolean; path: string; actualName: string }> {
  const entries = await fs.readdir(caseFolderPath, { withFileTypes: true }).catch(() => []);
  const aliases = CASE_SUBFOLDER_ALIASES[canonical].map(normalizeSearch);
  const compactAliases = new Set(aliases.map((alias) => alias.replace(/[^A-Z0-9]/g, '')));
  const found = entries.find((entry) => {
    if (!entry.isDirectory()) return false;
    const normalizedName = normalizeSearch(entry.name);
    return aliases.includes(normalizedName) || compactAliases.has(normalizedName.replace(/[^A-Z0-9]/g, ''));
  });
  if (!found) return { exists: false, path: path.join(caseFolderPath, canonical), actualName: canonical };
  return { exists: true, path: path.join(caseFolderPath, found.name), actualName: found.name };
}

/**
 * v0.4.1 Klasörler: bir klasör adının EVRAK/HASAR/OLAY YERİ/ONARIM kanoniklerinden
 * hangisine denk geldiğini, ek I/O olmadan (yalnızca ad eşleştirme) döndürür.
 * Pasif klasör gezgini için kullanılır; tarama davranışını değiştirmez.
 */
export function matchCaseSubfolderCanonical(folderName: string): CaseSubfolderCanonical | null {
  const normalized = normalizeSearch(folderName);
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  for (const canonical of Object.keys(CASE_SUBFOLDER_ALIASES) as CaseSubfolderCanonical[]) {
    const aliases = CASE_SUBFOLDER_ALIASES[canonical].map(normalizeSearch);
    if (aliases.includes(normalized)) return canonical;
    if (aliases.map((alias) => alias.replace(/[^A-Z0-9]/g, '')).includes(compact)) return canonical;
  }
  return null;
}

export const CASE_FILE_RECURSIVE_SCAN_DEPTH = 16;

export async function listFilesRecursive(folderPath: string, maxDepth = CASE_FILE_RECURSIVE_SCAN_DEPTH): Promise<{ exists: boolean; files: string[] }> {
  const rootStat = await fs.stat(folderPath).catch(() => null);
  if (!rootStat?.isDirectory()) return { exists: false, files: [] };
  const files: string[] = [];
  await walkFiles(folderPath, 0, maxDepth, files);
  files.sort((a, b) => a.localeCompare(b, 'tr'));
  return { exists: true, files };
}

export function parsePlateFromFolderName(folderName: string): string {
  const normalized = normalizeSearch(folderName);
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  const strict = compact.match(/^(0[1-9]|[1-7][0-9]|8[01])([A-Z]{1,3})(\d{2,5})/);
  if (strict) return `${strict[1]}${strict[2]}${strict[3]}`;
  const loose = normalized.match(/\b(0[1-9]|[1-7][0-9]|8[01])\s*([A-Z]{1,3})\s*(\d{2,5})\b/);
  if (loose) return `${loose[1]}${loose[2]}${loose[3]}`;
  return folderName;
}


export function parseDosyaNoFromFolderName(folderName: string): string {
  const source = normalizeTurkish(folderName)
    .replace(/[^A-Z0-9#:/\-\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const compactPlate = parsePlateFromFolderName(folderName).replace(/[^A-Z0-9]/g, '');

  const explicit = source.match(/\b(?:DOSYA|HASAR|IHBAR|ARSIV)\s*(?:NO|NUMARASI)?\s*[:#\- ]*([A-Z0-9]{0,4}\s*(?:20\d{2}|\d{2})\s*[-/ ]\s*\d{4,10}|\d{6,12})\b/);
  const explicitValue = explicit ? normalizeDosyaNoCandidate(explicit[1] ?? '', compactPlate) : '';
  if (explicitValue) return explicitValue;

  const yearDash = source.match(/\b((?:20\d{2}|\d{2})\s*[-/ ]\s*\d{5,10})\b/);
  const yearDashValue = yearDash ? normalizeDosyaNoCandidate(yearDash[1] ?? '', compactPlate) : '';
  if (yearDashValue) return yearDashValue;

  const longNumberMatches = [...source.matchAll(/\b(\d{7,12})\b/g)];
  for (const match of longNumberMatches) {
    const value = normalizeDosyaNoCandidate(match[1] ?? '', compactPlate);
    if (value) return value;
  }

  return '';
}

function normalizeDosyaNoCandidate(candidate: string, compactPlate: string): string {
  const cleaned = normalizeTurkish(candidate)
    .replace(/[^A-Z0-9\-/\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const separated = cleaned.match(/^((?:20\d{2}|\d{2}))\s*[-/ ]\s*(\d{4,10})$/);
  const compactCandidate = separated
    ? `${separated[1]}-${separated[2]}`
    : cleaned.replace(/[^A-Z0-9]/g, '');
  if (!compactCandidate) return '';
  if (compactCandidate.replace(/-/g, '') === compactPlate) return '';
  if (/^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}\d{2,5}$/.test(compactCandidate.replace(/-/g, ''))) return '';
  return compactCandidate;
}

export function isClosedFolderName(name: string): boolean {
  return normalizeSearch(name).startsWith('KAPALI');
}

export function isLikelyYearFolderName(name: string): boolean {
  return /^20\d{2}$/.test(normalizeSearch(name));
}

export function isLikelyMonthFolderName(name: string): boolean {
  const n = normalizeSearch(name);
  return /(OCAK|SUBAT|MART|NISAN|MAYIS|HAZIRAN|TEMMUZ|AGUSTOS|EYLUL|EKIM|KASIM|ARALIK) 20\d{2}/.test(n);
}

export function isLikelyPlateFolderName(name: string): boolean {
  const n = normalizeSearch(name);
  const compact = n.replace(/[^A-Z0-9]/g, '');
  return /^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}\d{2,5}/.test(compact);
}

async function walk(
  currentPath: string,
  relativeParts: string[],
  depth: number,
  parentIsCaseContainer: boolean,
  out: CaseFolderDiscovery[]
): Promise<boolean> {
  if (depth > 6) return false;
  const name = path.basename(currentPath);
  if (isSkippableFolder(name)) return false;

  const currentIsMonth = isLikelyMonthFolderName(name);
  const currentIsClosed = isClosedFolderName(name);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  const childDirNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const hasCaseSignal = hasCaseFolderSignalFromEntries(name, entries);

  // Ay/kapalı ay konteyneri altındaki her klasöre yazmak yerine gerçek hasar dosyası sinyali aranır.
  const canBeCase = !currentIsMonth
    && !currentIsClosed
    && !isRecognizedCaseSubfolder(name)
    && hasCaseSignal;

  if (canBeCase) {
    out.push(toDiscovery(currentPath, relativeParts));
    return true;
  }

  if (depth >= 5) return false;
  const nextParentIsCaseContainer = currentIsMonth || currentIsClosed;
  const sortedDirs = childDirNames.sort((a, b) => a.localeCompare(b, 'tr'));
  for (const child of sortedDirs) {
    await walk(path.join(currentPath, child), [...relativeParts, child], depth + 1, nextParentIsCaseContainer, out);
  }
  return false;
}

async function collectCasesFromKnownContainers(
  currentPath: string,
  relativeParts: string[],
  depth: number,
  out: CaseFolderDiscovery[]
): Promise<void> {
  if (depth > 7) return;
  const name = path.basename(currentPath);
  if (isSkippableFolder(name) || isRecognizedCaseSubfolder(name)) return;

  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  const childDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'tr'));

  const currentLooksLikeCase = !isLikelyMonthFolderName(name)
    && !isClosedFolderName(name)
    && !isLikelyYearFolderName(name)
    && hasCaseFolderSignalFromEntries(name, entries);

  // Kullanıcı doğrudan dosya klasörünü seçtiyse EVRAK/HASAR altına inip onları ayrı dosya sayma.
  if (relativeParts.length === 0 && currentLooksLikeCase) return;

  const currentIsContainer = relativeParts.length === 0
    || isLikelyYearFolderName(name)
    || isLikelyMonthFolderName(name)
    || isClosedFolderName(name);

  for (const childName of childDirs) {
    if (isSkippableFolder(childName) || isRecognizedCaseSubfolder(childName)) continue;
    const childPath = path.join(currentPath, childName);
    const childParts = [...relativeParts, childName];
    const childIsContainer = isLikelyYearFolderName(childName)
      || isLikelyMonthFolderName(childName)
      || isClosedFolderName(childName);

    if (childIsContainer) {
      await collectCasesFromKnownContainers(childPath, childParts, depth + 1, out);
      continue;
    }

    if (currentIsContainer) {
      const childEntries = await fs.readdir(childPath, { withFileTypes: true }).catch(() => []);
      if (hasCaseFolderSignalFromEntries(childName, childEntries)) out.push(toDiscovery(childPath, childParts));
      else await collectCasesFromKnownContainers(childPath, childParts, depth + 1, out);
      continue;
    }

    await collectCasesFromKnownContainers(childPath, childParts, depth + 1, out);
  }
}

async function looksLikeSingleCaseFolder(folderPath: string): Promise<boolean> {
  const name = path.basename(folderPath);
  if (isSkippableFolder(name) || isRecognizedCaseSubfolder(name) || isLikelyMonthFolderName(name) || isClosedFolderName(name) || isLikelyYearFolderName(name)) return false;
  const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => []);
  return hasCaseFolderSignalFromEntries(name, entries);
}

function isKnownCaseFile(name: string): boolean {
  const n = normalizeSearch(name);
  return n === 'NOTLAR DOCX'
    || n === 'NOTLAR YENI DOCX'
    || n.includes('KTT')
    || n.includes('RUHSAT')
    || n.includes('EHLIYET')
    || n.includes('POLICE')
    || n.includes('POLICE JPG')
    || n.includes('POLICE JPEG')
    || n.includes('POLICE PDF')
    || isLikelyClaimNoticeFile(name);
}

function hasCaseFolderSignalFromEntries(folderName: string, entries: Dirent[]): boolean {
  if (isKnownNonCaseFolderName(folderName)) return false;
  if (isLikelyPlateFolderName(folderName)) return true;
  const childDirNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (childDirNames.some((child) => isRecognizedCaseSubfolder(child))) return true;
  if (childDirNames.includes(TRACKING_FOLDER_NAME)) return true;
  return entries.some((entry) => entry.isFile() && isKnownCaseFile(entry.name));
}

function isLikelyClaimNoticeFile(name: string): boolean {
  const n = normalizeSearch(name);
  if (!/\.PDF$/.test(n)) return false;
  return /\b\d{1,3}[-_ ]\d{5,12}\b/.test(name) || /IHBAR|FOY|HASAR DOSYA|DOSYA NO|CLAIM/.test(n);
}

function toDiscovery(folderPath: string, relativeParts: string[]): CaseFolderDiscovery {
  const folderName = relativeParts[relativeParts.length - 1] ?? path.basename(folderPath);
  const parentParts = relativeParts.slice(0, -1);
  const physicalParentName = path.basename(path.dirname(folderPath));
  const parentCandidates = [...parentParts, physicalParentName].filter(Boolean);
  const closedPart = [...parentCandidates].reverse().find(isClosedFolderName);
  const monthPart = parentCandidates.find(isLikelyMonthFolderName)
    ?? closedPart
    ?? parentParts[parentParts.length - 1]
    ?? physicalParentName
    ?? '';
  return {
    folderPath,
    folderName,
    plate: parsePlateFromFolderName(folderName),
    dosyaNo: parseDosyaNoFromFolderName(folderName),
    officeFileNo: '',
    claimNoticeNo: '',
    monthFolder: monthPart,
    isClosedFolder: parentCandidates.some(isClosedFolderName)
  };
}

function isRecognizedCaseSubfolder(name: string): boolean {
  const n = normalizeSearch(name);
  return Object.values(CASE_SUBFOLDER_ALIASES).some((aliases) => aliases.map(normalizeSearch).includes(n));
}

function isSkippableFolder(name: string): boolean {
  return name === TRACKING_FOLDER_NAME || name.startsWith('.') || name.startsWith('_') || isKnownNonCaseFolderName(name);
}

function isKnownNonCaseFolderName(name: string): boolean {
  return NON_CASE_FOLDER_NAMES.has(normalizeSearch(name));
}

async function walkFiles(currentPath: string, depth: number, maxDepth: number, out: string[]): Promise<void> {
  if (depth > maxDepth) return;
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === TRACKING_FOLDER_NAME || entry.name.startsWith('.')) continue;
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isFile()) out.push(fullPath);
    if (entry.isDirectory()) await walkFiles(fullPath, depth + 1, maxDepth, out);
  }
}

async function listDirectChildDirectories(folderPath: string): Promise<Array<{ name: string; folderPath: string }>> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, folderPath: path.join(folderPath, entry.name) }));
}

function dedupeByPath(input: CaseFolderDiscovery[]): CaseFolderDiscovery[] {
  const seen = new Set<string>();
  const output: CaseFolderDiscovery[] = [];
  for (const item of input) {
    const key = path.resolve(item.folderPath).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}
