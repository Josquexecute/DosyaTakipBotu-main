export const APP_VERSION = '0.4.12';
export const APP_NAME = 'HasarBotu / Baran Ekspertiz';
export const COMPANY_NAME = 'Baran Global Ekspertiz';
export const DEFAULT_PCLOUD_ROOT = 'P:\\BARAN GLOBAL EKSPERTİZ\\2026';
export const TRACKING_FOLDER_NAME = '_HASARBOTU';
export const TRACKING_FILE_NAME = 'takip.json';
export const TRACKING_SUMMARY_FILE_NAME = 'HASARBOTU_TAKIP_OZETI.txt';
export const CACHE_APP_FOLDER = 'Baran Ekspertiz';
export const CACHE_FOLDER_NAME = 'local-cache';
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'];
export const UNSUPPORTED_PREVIEW_EXTENSIONS = ['.heic', '.heif', '.raw', '.cr2', '.nef'];
export const REQUIRED_CASE_SUBFOLDERS = ['EVRAK', 'HASAR', 'OLAY YERİ', 'ONARIM'];

export const OFFICE_VERSION_FOLDER_NAME = '_HASARBOTU_OFFICE';
export const OFFICE_VERSION_FILE_NAME = 'office-version.json';


/**
 * Seçili pCloud kökünden aktif yılı çıkarır. Örn. P:\...\2027 -> 2027.
 * Yıl bulunamazsa bugünün yılına düşer; 2026 varsayılan akışı bozulmaz.
 */
export function inferYearFromRootPath(rootPath: string, fallbackYear = new Date().getFullYear()): number {
  const match = String(rootPath || '').match(/(?:^|[\\/])((?:20)\d{2})(?:[\\/]|$)/);
  if (match) {
    const year = Number(match[1]);
    if (Number.isInteger(year) && year >= 2000 && year <= 2099) return year;
  }
  return fallbackYear;
}
