import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { LegacyNoteDocument } from '../../shared/types';
import { normalizeSearch, safeFileDisplayName } from '../../shared/turkish';

const MAX_LEGACY_NOTE_FILES = 8;
const MAX_LEGACY_NOTE_BYTES = 5 * 1024 * 1024;
const MAX_LEGACY_NOTE_TEXT = 4000;

interface ZipEntryInfo {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

export async function readLegacyNotes(caseFolderPath: string): Promise<LegacyNoteDocument[]> {
  const candidates = await findLegacyNoteFiles(caseFolderPath);
  const notes: LegacyNoteDocument[] = [];
  for (const filePath of candidates.slice(0, MAX_LEGACY_NOTE_FILES)) {
    notes.push(await readLegacyNoteFile(filePath));
  }
  return notes;
}

async function findLegacyNoteFiles(caseFolderPath: string): Promise<string[]> {
  const roots = [caseFolderPath, path.join(caseFolderPath, 'EVRAK')];
  const files: string[] = [];
  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile() && isLegacyNoteFile(entry.name)) files.push(path.join(root, entry.name));
    }
  }
  return [...new Set(files.map((file) => path.resolve(file)))].sort((a, b) => a.localeCompare(b, 'tr'));
}

function isLegacyNoteFile(fileName: string): boolean {
  const normalized = normalizeSearch(fileName);
  const ext = path.extname(fileName).toLowerCase();
  return (ext === '.docx' || ext === '.txt') && /^NOTLAR(?:\s|$)|^NOT(?:\s|$)|^DOSYA\s+NOT/.test(normalized);
}

async function readLegacyNoteFile(filePath: string): Promise<LegacyNoteDocument> {
  const fileName = safeFileDisplayName(path.basename(filePath));
  const ext = path.extname(fileName).toLowerCase();
  const sourceType: LegacyNoteDocument['sourceType'] = ext === '.txt' ? 'txt' : 'docx';
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return baseLegacyNote(fileName, filePath, sourceType, true, '', 'Eski not dosyası okunamadı.');
  if (stat.size === 0) return baseLegacyNote(fileName, filePath, sourceType, true, '', 'Eski not dosyası boş görünüyor.');
  if (stat.size > MAX_LEGACY_NOTE_BYTES) return baseLegacyNote(fileName, filePath, sourceType, false, '', 'Eski not dosyası güvenli okuma sınırını aşıyor.');

  try {
    const buffer = await fs.readFile(filePath);
    const text = sourceType === 'txt'
      ? normalizeLegacyNoteText(buffer.toString('utf8'))
      : normalizeLegacyNoteText(extractDocxText(buffer));
    return baseLegacyNote(fileName, filePath, sourceType, text.length === 0, text, text ? undefined : 'Eski not dosyasında okunabilir metin bulunamadı.');
  } catch (error) {
    return baseLegacyNote(fileName, filePath, sourceType, false, '', error instanceof Error ? error.message : 'Eski not dosyası okunamadı.');
  }
}

function baseLegacyNote(
  fileName: string,
  filePath: string,
  sourceType: LegacyNoteDocument['sourceType'],
  empty: boolean,
  text: string,
  warning?: string
): LegacyNoteDocument {
  return {
    fileName,
    filePath,
    sourceType,
    empty,
    text: text.slice(0, MAX_LEGACY_NOTE_TEXT),
    ...(warning ? { warning } : {})
  };
}

function extractDocxText(buffer: Buffer): string {
  const entries = readZipCentralDirectory(buffer);
  const textEntries = entries
    .filter((entry) => entry.name === 'word/document.xml' || /^word\/(?:header|footer|comments)\d*\.xml$/.test(entry.name))
    .sort((a, b) => a.name === 'word/document.xml' ? -1 : b.name === 'word/document.xml' ? 1 : a.name.localeCompare(b.name));
  if (textEntries.length === 0) throw new Error('DOCX içinde Word metin gövdesi bulunamadı.');
  return textEntries.map((entry) => xmlToPlainText(readZipEntry(buffer, entry))).join('\n\n');
}

function readZipCentralDirectory(buffer: Buffer): ZipEntryInfo[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error('DOCX ZIP dizini bulunamadı.');
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (centralDirectoryOffset + centralDirectorySize > buffer.length) throw new Error('DOCX ZIP dizini eksik görünüyor.');

  const entries: ZipEntryInfo[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount && offset + 46 <= buffer.length; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readZipEntry(buffer: Buffer, entry: ZipEntryInfo): Buffer {
  const local = entry.localHeaderOffset;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`DOCX ZIP girdisi okunamadı: ${entry.name}`);
  const fileNameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const dataStart = local + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`DOCX ZIP sıkıştırma yöntemi desteklenmiyor: ${entry.method}`);
}

function xmlToPlainText(buffer: Buffer): string {
  const xml = buffer.toString('utf8')
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n');
  return xml
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, (_match, text: string) => decodeXmlEntities(text))
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ');
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function normalizeLegacyNoteText(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_LEGACY_NOTE_TEXT);
}
