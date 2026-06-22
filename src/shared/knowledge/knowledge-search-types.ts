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
}

export interface KnowledgeSearchResponse {
  query: string;
  normalizedQuery: string;
  total: number;
  results: KnowledgeSearchResult[];
  warnings: string[];
}
