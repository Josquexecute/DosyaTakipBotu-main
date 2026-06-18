import fs from 'node:fs/promises';
import path from 'node:path';
import type { PhotoAnalysis, PhotoPreview } from '../../shared/types';
import { SUPPORTED_IMAGE_EXTENSIONS, UNSUPPORTED_PREVIEW_EXTENSIONS } from '../../shared/constants';
import { normalizeSearch, safeFileDisplayName } from '../../shared/turkish';
import { findCaseSubfolder, listFilesRecursive } from '../scanner/case-folder-utils';

export async function analyzePhotos(caseFolderPath: string): Promise<PhotoAnalysis> {
  const hasar = await findCaseSubfolder(caseFolderPath, 'HASAR');
  const olayYeri = await findCaseSubfolder(caseFolderPath, 'OLAY YERİ');
  const listing = hasar.exists ? await listFilesRecursive(hasar.path) : { exists: false, files: [] as string[] };
  const olayListing = olayYeri.exists ? await listFilesRecursive(olayYeri.path) : { exists: false, files: [] as string[] };
  const previews: PhotoPreview[] = [];
  const unsupportedFiles: string[] = [];
  const corruptSuspects: string[] = [];

  for (const filePath of listing.files) {
    const fileName = safeFileDisplayName(path.relative(hasar.path, filePath) || path.basename(filePath));
    const ext = path.extname(fileName).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext) && !UNSUPPORTED_PREVIEW_EXTENSIONS.includes(ext)) continue;
    const normalized = normalizeSearch(fileName);
    const supported = SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
    if (!supported) unsupportedFiles.push(fileName);
    const corrupt = supported ? !(await hasValidImageHeader(filePath, ext)) : false;
    if (corrupt) corruptSuspects.push(fileName);
    previews.push({ fileName, filePath, kind: photoKind(normalized), supported, corrupt });
  }

  const olayYeriPhotoCount = await countOlayYeriPhotos(olayYeri.path, olayListing.files, unsupportedFiles, corruptSuspects);
  const validPreviews = previews.filter((p) => !p.corrupt);
  const damagePhotoCount = validPreviews.filter((p) => p.kind === 'hasar').length;
  const hasKm = validPreviews.some((p) => p.kind === 'km');
  const hasVites = validPreviews.some((p) => p.kind === 'vites');
  const hasSaseOrSasi = validPreviews.some((p) => p.kind === 'sase');
  const hasOlayYeri = olayYeriPhotoCount > 0;
  const warnings: string[] = [];
  if (!listing.exists) warnings.push('HASAR klasörü bulunamadı veya okunamadı.');
  if (unsupportedFiles.length > 0) warnings.push('HEIC/RAW gibi desteklenmeyen önizleme formatları var. Dosyalar listelenir, küçük resim üretilmez.');
  if (corruptSuspects.length > 0) warnings.push('Bozuk veya okunamayan fotoğraf dosyası tespit edildi. Bu dosyalar portala yüklenmeden önce kontrol edilmeli.');
  if (damagePhotoCount === 0) warnings.push('HASAR klasöründe HASAR 1, HASAR 2 şeklinde adlandırılmış fotoğraf bulunamadı.');
  if (!hasKm) warnings.push('KM fotoğrafı bulunamadı.');
  if (!hasVites) warnings.push('VİTES fotoğrafı bulunamadı.');
  if (!hasSaseOrSasi) warnings.push('ŞASE/ŞASİ fotoğrafı bulunamadı.');
  if (!olayListing.exists) warnings.push('OLAY YERİ klasörü bulunamadı veya okunamadı.');
  else if (!hasOlayYeri) warnings.push('OLAY YERİ fotoğrafı bulunamadı.');

  return {
    hasarFolderExists: listing.exists,
    totalImageFiles: previews.length + olayYeriPhotoCount,
    damagePhotoCount,
    hasKm,
    hasVites,
    hasSaseOrSasi,
    hasOlayYeri,
    olayYeriPhotoCount,
    unsupportedFiles,
    corruptSuspects,
    previews,
    warnings
  };
}

async function hasValidImageHeader(filePath: string, ext: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 4) return false;
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead < 4) return false;
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          return buffer[0] === 0xff && buffer[1] === 0xd8;
        case '.png':
          return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        case '.webp':
          return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
        case '.bmp':
          return buffer.subarray(0, 2).toString('ascii') === 'BM';
        case '.tif':
        case '.tiff':
          return buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
        default:
          return true;
      }
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function countOlayYeriPhotos(rootPath: string, files: string[], unsupportedFiles: string[], corruptSuspects: string[]): Promise<number> {
  let count = 0;
  for (const filePath of files) {
    const fileName = safeFileDisplayName(path.relative(rootPath, filePath) || path.basename(filePath));
    const ext = path.extname(fileName).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext) && !UNSUPPORTED_PREVIEW_EXTENSIONS.includes(ext)) continue;
    const displayName = `OLAY YERİ/${fileName}`;
    const supported = SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
    if (!supported) {
      unsupportedFiles.push(displayName);
      continue;
    }
    const corrupt = !(await hasValidImageHeader(filePath, ext));
    if (corrupt) corruptSuspects.push(displayName);
    else count += 1;
  }
  return count;
}

function photoKind(normalizedName: string): PhotoPreview['kind'] {
  if (/\bHASAR\s*0*\d+\b|\bHASAR0*\d+\b|\bHASAR\s*\(\s*\d+\s*\)/.test(normalizedName)) return 'hasar';
  if (/\bKM\b|KILOMETRE|KILOMETRAJ/.test(normalizedName)) return 'km';
  if (/VITES/.test(normalizedName)) return 'vites';
  if (/SASE|SASI|SASI NO|SASE NO|SASI NUMARASI|SASE NUMARASI/.test(normalizedName)) return 'sase';
  return 'other';
}
