import { normalizeKnowledgeTags } from '../../../shared/knowledge/knowledge-tags';
import { KNOWLEDGE_DEFAULT_SEARCH_LIMIT, normalizeKnowledgeLimit } from '../../../shared/knowledge/knowledge-safety';
import type { KnowledgeSearchQuery } from '../../../shared/knowledge/knowledge-search-types';
import type { KnowledgeSourceType } from '../../../shared/knowledge/knowledge-types';

const SOURCE_TYPES = new Set<KnowledgeSourceType>([
  'guide',
  'note',
  'template',
  'policy_rule',
  'fault_rule',
  'heavy_damage_rule',
  'labor_rule',
  'document_rule',
  'office_note'
]);

export interface SanitizedKnowledgeSearchQuery {
  query: string;
  tags: ReturnType<typeof normalizeKnowledgeTags>;
  sourceTypes: KnowledgeSourceType[];
  limit: number;
  minScore: number;
}

export function sanitizeKnowledgeSearchQuery(input: KnowledgeSearchQuery | string): SanitizedKnowledgeSearchQuery {
  const query = typeof input === 'string' ? input : input?.query;
  const sourceTypes = typeof input === 'string' ? [] : normalizeSourceTypes(input?.sourceTypes);
  const limit = typeof input === 'string' ? KNOWLEDGE_DEFAULT_SEARCH_LIMIT : normalizeKnowledgeLimit(input?.limit);
  const minScoreInput = typeof input === 'string' ? undefined : input?.minScore;
  const minScore = Number.isFinite(Number(minScoreInput)) ? Math.max(0, Number(minScoreInput)) : 1;
  return {
    query: safeQuery(query),
    tags: typeof input === 'string' ? [] : normalizeKnowledgeTags(input?.tags),
    sourceTypes,
    limit,
    minScore
  };
}

function normalizeSourceTypes(input: readonly unknown[] | undefined): KnowledgeSourceType[] {
  const values = new Set<KnowledgeSourceType>();
  for (const item of input ?? []) {
    if (typeof item === 'string' && SOURCE_TYPES.has(item as KnowledgeSourceType)) values.add(item as KnowledgeSourceType);
  }
  return [...values];
}

function safeQuery(input: unknown): string {
  return typeof input === 'string'
    ? input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
    : '';
}
