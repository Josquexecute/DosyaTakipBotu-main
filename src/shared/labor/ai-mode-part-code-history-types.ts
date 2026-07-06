/**
 * v0.6.x — AI İşçilik v3.11: Son N D kodu apply/restore işlem geçmişi tipleri + saf yardımcılar (yerel; rapor amaçlı).
 * takip.json DEĞİLDİR. Ham Google AI Mode cevabı (rawEvidence) geçmişe YAZILMAZ. Maksimum son 100 kayıt.
 */
export type AiModePartCodeHistoryType = 'apply_d_code' | 'restore_d_code' | 'restore_backup';

export interface AiModePartCodeHistoryEntry {
  id: string;
  type: AiModePartCodeHistoryType;
  createdAt: string;
  filePath: string;
  /** apply/restore_d_code için satır no; restore_backup (dosya bazlı) için verilmez. */
  rowNumber?: number;
  column?: string;
  partName?: string;
  oldPartCode?: string;
  newPartCode?: string;
  backupPath?: string;
  restoredFromBackupPath?: string;
  preRestoreBackupPath?: string;
  ok: boolean;
  message: string;
  warnings: string[];
}

export interface AiModePartCodeHistoryStore {
  version: 1;
  entries: AiModePartCodeHistoryEntry[];
  updatedAt: string;
}

export interface AiModePartCodeHistoryListResult {
  entries: AiModePartCodeHistoryEntry[];
  corrupt: boolean;
}

export const AI_MODE_HISTORY_MAX = 100;

const TYPES: AiModePartCodeHistoryType[] = ['apply_d_code', 'restore_d_code', 'restore_backup'];

/** Bilinmeyen veriyi güvenle geçmiş kaydına çevirir (zorunlu alan yoksa null). Ham cevap alanı TAŞINMAZ. */
export function normalizeHistoryEntry(value: unknown): AiModePartCodeHistoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!TYPES.includes(v.type as AiModePartCodeHistoryType)) return null;
  if (typeof v.filePath !== 'string' || !v.filePath) return null;
  const entry: AiModePartCodeHistoryEntry = {
    id: typeof v.id === 'string' && v.id ? v.id : `hist-${typeof v.createdAt === 'string' ? v.createdAt : Date.now()}`,
    type: v.type as AiModePartCodeHistoryType,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString(),
    filePath: v.filePath,
    ok: v.ok === true,
    message: typeof v.message === 'string' ? v.message : '',
    warnings: Array.isArray(v.warnings) ? v.warnings.filter((w): w is string => typeof w === 'string') : []
  };
  if (typeof v.rowNumber === 'number') entry.rowNumber = v.rowNumber;
  if (typeof v.column === 'string') entry.column = v.column;
  for (const k of ['partName', 'oldPartCode', 'newPartCode', 'backupPath', 'restoredFromBackupPath', 'preRestoreBackupPath'] as const) {
    if (typeof v[k] === 'string' && v[k]) (entry as unknown as Record<string, unknown>)[k] = v[k];
  }
  return entry;
}

/** Yeni kaydı en başa ekler ve son AI_MODE_HISTORY_MAX kayıtla sınırlar (SAF). */
export function appendHistoryEntry(entries: readonly AiModePartCodeHistoryEntry[], entry: AiModePartCodeHistoryEntry): AiModePartCodeHistoryEntry[] {
  return [entry, ...entries].slice(0, AI_MODE_HISTORY_MAX);
}
