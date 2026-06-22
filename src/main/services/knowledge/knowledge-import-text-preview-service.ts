import { dialog } from 'electron';
import type { BrowserWindow, OpenDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { KnowledgeImportTextPreview } from '../../../shared/knowledge';

const PREVIEW_MAX_BYTES = 256 * 1024; // okunacak azami ham boyut (buyuk dosyada bile sadece bu kadar okunur)
const PREVIEW_MAX_CHARS = 20000; // onizlemede gosterilecek azami karakter
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md']);

/**
 * P4-C: SADECE .txt/.md duz-metin icerik onizlemesi (YAZMASIZ).
 *
 * Yalnizca .txt veya .md uzantili dosya okunur. PDF/DOCX/XLSX veya ikili formatlar ACILMAZ ve PARSE EDILMEZ,
 * gorsel-metin cikarimi yoktur. Icerik utf-8 olarak ve boyut sinirinda (en fazla PREVIEW_MAX_BYTES) okunur;
 * yalnizca bellek-ici onizleme doner. Hicbir kalici yazma yapilmaz; canWrite=false.
 */
export async function previewTextFileForKnowledgeImport(window: BrowserWindow | null): Promise<KnowledgeImportTextPreview | null> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Duz-metin (.txt/.md) icerik onizleme — yazmasiz',
    properties: ['openFile'],
    filters: [{ name: 'Duz metin', extensions: ['txt', 'md'] }]
  };
  const result = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths[0]) return null;

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const fileExtension = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(fileExtension)) {
    throw new Error('Yalnizca .txt veya .md duz-metin dosyalari onizlenebilir. Diger formatlar bu adimda okunmaz.');
  }

  const info = await fs.stat(filePath);
  const readLength = Math.min(PREVIEW_MAX_BYTES, Math.max(0, info.size));
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(readLength);
    const { bytesRead } = await handle.read(buffer, 0, readLength, 0);
    const raw = buffer.subarray(0, bytesRead).toString('utf-8');
    const text = raw.slice(0, PREVIEW_MAX_CHARS);
    const truncated = info.size > bytesRead || raw.length > PREVIEW_MAX_CHARS;
    return { fileName, fileExtension, sizeBytes: info.size, text, truncated, canWrite: false };
  } finally {
    await handle.close();
  }
}
