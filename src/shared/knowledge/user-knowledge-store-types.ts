import type { KnownKnowledgeTag } from './knowledge-tags';

/**
 * P4-E1: Kullanici bilgi deposu (User Knowledge Store) tasarimi.
 *
 * Bu depo, ileride import edilecek kullanici kaynaklarinin gidecegi AYRI ve baimsiz bir veri yapisidir.
 * Read-only seed/registry'den, takip.json'dan, Excel'den ve canli dosya klasorlerinden BAGIMSIZDIR.
 * Yalnizca AppData altinda kendi dosyasinda (user-knowledge-store.json) tutulur.
 */
export interface UserKnowledgeEntry {
  entryId: string;
  title: string;
  text: string;
  /** Deterministik icerik hash'i (dedup icin). */
  contentHash: string;
  /** Yalnizca dosya ADI; mutlak/Windows/pCloud yolu SAKLANMAZ. */
  sourceFileName: string;
  fileExtension: string;
  sourceType: string;
  tags: KnownKnowledgeTag[];
  /** Guvenli sabit kaynak (or. 'import-flow'); kullanici/yol bilgisi tasimaz. */
  importedBy: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface UserKnowledgeStoreMetadata {
  revision: number;
  updatedAt: string;
  writeId: string;
}

export interface UserKnowledgeStore {
  schemaVersion: 1;
  entries: UserKnowledgeEntry[];
  metadata: UserKnowledgeStoreMetadata;
}
