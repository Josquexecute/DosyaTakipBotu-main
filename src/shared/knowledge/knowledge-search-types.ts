import type { KnownKnowledgeTag } from './knowledge-tags';
import type { KnowledgeChunkPriority, KnowledgeSourceType } from './knowledge-types';

export interface KnowledgeSearchQuery {
  query: string;
  tags?: string[];
  sourceTypes?: KnowledgeSourceType[];
  limit?: number;
  minScore?: number;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType?: KnowledgeSourceType;
  section?: string;
  page?: number;
  priority?: KnowledgeChunkPriority;
  text: string;
  score: number;
  matchedTerms: string[];
  tags: KnownKnowledgeTag[];
  rationale: string;
  /** v0.6.0 P4-E3: Sonucun kaynagi — yerlesik (seed) ya da read-only kullanici bilgi deposu (user). Belirtilmezse seed kabul edilir. */
  origin?: 'seed' | 'user';
  /** v0.6.0 P4-E3: Kullanici kaynagi sonuclari icin gosterim etiketi (or. "Kullanıcı Kaynağı"). */
  sourceLabel?: string;
}

/**
 * v0.6.0 P4-E4: Kullanici bilgi deposunun SALT-OKUNUR durum ozeti (UI bos/hata mesajlari icin).
 * filePath/mutlak yol/AppData yolu ICERMEZ; yalniz sayisal/ozet bilgidir.
 */
export interface UserKnowledgeStoreSearchStatus {
  available: boolean;
  entryCount: number;
  matchedCount: number;
  readError?: string;
}

export interface KnowledgeSearchResponse {
  query: string;
  normalizedQuery: string;
  total: number;
  results: KnowledgeSearchResult[];
  warnings: string[];
  /** v0.6.0 P4-E4: kullanici bilgi deposu durum ozeti (read-only; UI filtre/bos-mesaj icin). */
  userStoreStatus?: UserKnowledgeStoreSearchStatus;
}
