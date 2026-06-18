import path from 'node:path';
import { parsePlateFromFolderName } from '../scanner/case-folder-utils';
import { isPathInsideNormalized, normalizePathForCompare } from '../../shared/path-normalization';
import {
  evaluatePlateMatch,
  looksLikePlate,
  normalizePlateForCompare,
  plateMismatchMessage,
  PHOTO_PLATE_MISMATCH_CODE
} from '../../shared/plate-match';

/** Saf yol-içinde kontrolü (electron bağımlılığı olmadan; security.isPathInside ile aynı davranış). */
function isPathInside(childPath: string, parentPath: string): boolean {
  return isPathInsideNormalized(path.resolve(childPath), path.resolve(parentPath));
}

/** İki yol aynı klasörü mü gösteriyor (büyük/küçük, Türkçe ve ayraç farkları normalize edilerek). */
function samePath(a: string, b: string): boolean {
  return normalizePathForCompare(path.resolve(a)) === normalizePathForCompare(path.resolve(b));
}

/**
 * Bir dosya yolundan, üst klasörleri gezerek dosyanın AİT OLDUĞU dosya (case) klasörünü bulur:
 * adı gerçek plaka biçimine uyan en yakın üst klasör. Bulunamazsa null döner.
 * parsePlateFromFolderName eşleşme yoksa adı aynen döndürdüğü için sonuç plaka biçimiyle doğrulanır.
 */
export function resolveCaseFolderFromPath(filePath: string, maxDepth = 8): { folder: string; plate: string } | null {
  let dir = path.dirname(path.resolve(filePath));
  for (let i = 0; i < maxDepth; i++) {
    const base = path.basename(dir);
    if (!base) break;
    const normalized = normalizePlateForCompare(parsePlateFromFolderName(base));
    if (looksLikePlate(normalized)) return { folder: dir, plate: normalized };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Bir dosya yolundan, üst klasör adlarından plaka çıkarır (yoksa boş string). */
export function resolvePlateFromPath(filePath: string, maxDepth = 8): string {
  return resolveCaseFolderFromPath(filePath, maxDepth)?.plate ?? '';
}

export interface CasePhotoGuardInput {
  /** Aktif dosyanın plakası (gösterim biçimi). */
  activePlate: string;
  /** Aktif dosyanın klasör yolu (varsa). */
  activeFolderPath: string;
  /** Kullanıcının seçtiği fotoğraf/dosya yolu. */
  selectedFilePath: string;
}

export interface CasePhotoGuardOutcome {
  selectedPlate: string;
  insideActiveFolder: boolean;
}

function blockError(message: string): Error & { code?: string } {
  const error = new Error(message) as Error & { code?: string };
  error.code = PHOTO_PLATE_MISMATCH_CODE;
  return error;
}

/** Farklı dosya klasörü (aynı veya farklı plaka) için engelleme mesajı. */
function differentFolderMessage(activePlate: string, activeFolder: string, selectedPlate: string, selectedFolder: string, samePlate: boolean): string {
  const activeName = path.basename(path.resolve(activeFolder)) || activeFolder;
  const selectedName = path.basename(path.resolve(selectedFolder)) || selectedFolder;
  const plakaNot = samePlate
    ? ' Aynı plaka ama FARKLI dosya klasörü; yanlış dosyadan fotoğraf seçilmiş olabilir.'
    : '';
  return `Seçilen fotoğraf bu dosyaya ait görünmüyor. Aktif dosya: ${activeName} (plaka ${activePlate || '-'}); seçilen klasör: ${selectedName} (plaka ${selectedPlate || '-'}).${plakaNot} İşlem güvenlik nedeniyle engellendi.`;
}

/**
 * Seçilen fotoğrafın aktif dosyaya ait olduğunu doğrular. AİT DEĞİLSE hata fırlatır (hard-block):
 *  1) Fotoğraf aktif dosya klasörünün İÇİNDEYSE → ait kabul edilir (izin).
 *  2) Fotoğraf BAŞKA bir dosya (case) klasörüne aitse (adı plaka biçiminde bir üst klasör) ve bu klasör
 *     aktif klasör DEĞİLSE → engellenir. Bu, AYNI PLAKA ama farklı dosya/föy klasörü durumunu da kapsar
 *     (klasör yolu = dosya no / ihbar föyü kimliği). Mesaj aktif ve seçilen klasör/plakayı gösterir.
 *  3) Hiçbir dosya klasörüne ait değilse (plaka okunamıyor): aktif klasör yoksa plaka net farklıysa engellenir,
 *     aksi hâlde uyuşmazlık kanıtlanamaz ve engellenmez (yanlış-pozitif / meşru geçici klasör akışı korunur).
 */
export function assertSelectedPhotoMatchesCase(input: CasePhotoGuardInput): CasePhotoGuardOutcome {
  const selectedFilePath = String(input.selectedFilePath || '');
  const activeFolderPath = String(input.activeFolderPath || '');
  const insideActiveFolder = activeFolderPath ? isPathInside(selectedFilePath, activeFolderPath) : false;
  const owning = resolveCaseFolderFromPath(selectedFilePath);
  const selectedPlate = owning?.plate ?? '';
  if (insideActiveFolder) return { selectedPlate, insideActiveFolder };

  // 2) Foto başka bir dosya klasörüne ait ve aktif klasör değil → engelle (aynı plaka olsa bile).
  if (activeFolderPath && owning && !samePath(owning.folder, activeFolderPath)) {
    const match = evaluatePlateMatch(input.activePlate, owning.plate);
    const samePlate = match.comparable && match.matches;
    throw blockError(differentFolderMessage(input.activePlate, activeFolderPath, owning.plate, owning.folder, samePlate));
  }

  // 3) Dosya klasörü kimliği belirlenemedi / aktif klasör yok → yalnızca plaka net farklıysa engelle.
  const match = evaluatePlateMatch(input.activePlate, selectedPlate);
  if (match.comparable && !match.matches) {
    throw blockError(plateMismatchMessage(input.activePlate, selectedPlate));
  }
  return { selectedPlate, insideActiveFolder };
}
