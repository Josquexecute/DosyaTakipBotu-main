/**
 * P4-E2-B: Kalici import yazma kilidi — DAR kapsamli ACIK.
 *
 * Kalici import yazimi artik ETKIN (enabled), ANCAK yalnizca TEK ve dar bir yola izin verilir:
 * onaylanmis .txt/.md icerik onizlemesinin AppData altindaki ayri kullanici bilgi deposuna kaydedilmesi.
 * Bunun disindaki her hedef/operasyon (takip.json, Excel, seed/registry, case klasoru, pCloud kok, vb.) yasaktir.
 */

/** Kalici import yazimi ETKIN; ama yalnizca asagidaki dar allowlist (target + operation) gecer. */
export const KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED = true as const;

export const KNOWLEDGE_IMPORT_WRITE_LOCK_VERSION = 'v0.6.0' as const;

/** Izin verilen TEK yazma hedefi: ayri kullanici bilgi deposu. */
export const KNOWLEDGE_IMPORT_ALLOWED_WRITE_TARGET = 'user-knowledge-store' as const;

/** Izin verilen TEK yazma operasyonu: onaylanmis .txt/.md icerik onizlemesini commit. */
export const KNOWLEDGE_IMPORT_ALLOWED_WRITE_OPERATION = 'commit-approved-text-preview' as const;

export const KNOWLEDGE_IMPORT_WRITE_LOCK_REASON =
  `Kalici import yazimi yalnizca '${KNOWLEDGE_IMPORT_ALLOWED_WRITE_OPERATION}' operasyonuyla '${KNOWLEDGE_IMPORT_ALLOWED_WRITE_TARGET}' hedefine izinlidir; diger tum hedef/operasyonlar yasaktir.`;

/** Kalici import yaziminin ASLA yapilamayacagi hedefler (denetim ve dokumantasyon icin). */
export const KNOWLEDGE_IMPORT_FORBIDDEN_WRITE_TARGETS = [
  'takip.json',
  'Excel',
  'AppData bilgi bankasi seed/registry',
  'case dosya klasoru',
  'canli calisma klasoru',
  'pCloud kok'
] as const;

export class KnowledgeImportWriteLockedError extends Error {
  constructor(detail: string) {
    super(`Kalici import yazimi izinsiz: ${detail}. ${KNOWLEDGE_IMPORT_WRITE_LOCK_REASON}`);
    this.name = 'KnowledgeImportWriteLockedError';
  }
}

/**
 * Dar kilit kapisi: kalici import yazma yolu, yazmadan ONCE bu fonksiyonu cagirmalidir.
 * Yalnizca tam olarak (KNOWLEDGE_IMPORT_ALLOWED_WRITE_TARGET, KNOWLEDGE_IMPORT_ALLOWED_WRITE_OPERATION) gecer;
 * bunun disindaki her hedef/operasyon (veya kilit kapaliysa) hata firlatir.
 */
export function assertKnowledgeImportPersistentWriteAllowed(target: string, operation: string): void {
  if (!KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED) {
    throw new KnowledgeImportWriteLockedError(`${operation} -> ${target}`);
  }
  if (target !== KNOWLEDGE_IMPORT_ALLOWED_WRITE_TARGET || operation !== KNOWLEDGE_IMPORT_ALLOWED_WRITE_OPERATION) {
    throw new KnowledgeImportWriteLockedError(`izin verilmeyen hedef/operasyon: ${operation} -> ${target}`);
  }
}
