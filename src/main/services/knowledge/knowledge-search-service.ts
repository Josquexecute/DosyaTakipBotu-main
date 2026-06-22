import type { KnownKnowledgeTag } from '../../../shared/knowledge/knowledge-tags';
import type { KnowledgeSearchQuery, KnowledgeSearchResponse, KnowledgeSearchResult } from '../../../shared/knowledge/knowledge-search-types';
import type { KnowledgeChunk, KnowledgeChunkPriority, KnowledgeSource } from '../../../shared/knowledge/knowledge-types';
import { normalizeKnowledgeText, tokenizeKnowledgeText } from './knowledge-normalizer';
import { KnowledgeSourceRegistry } from './knowledge-source-registry';
import { sanitizeKnowledgeSearchQuery } from './knowledge-safety-service';

const PRIORITY_SCORE: Record<KnowledgeChunkPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 4
};

export class KnowledgeSearchService {
  constructor(private readonly registry = new KnowledgeSourceRegistry()) {}

  search(input: KnowledgeSearchQuery | string): KnowledgeSearchResponse {
    const query = sanitizeKnowledgeSearchQuery(input);
    const normalizedQuery = normalizeKnowledgeText(query.query);
    const queryTerms = tokenizeKnowledgeText(query.query);
    const warnings: string[] = [];
    if (!normalizedQuery && query.tags.length === 0 && query.sourceTypes.length === 0) {
      warnings.push('Arama metni veya filtre girilmedi.');
      return { query: query.query, normalizedQuery, total: 0, results: [], warnings };
    }

    const scored: KnowledgeSearchResult[] = [];
    for (const chunk of this.registry.listChunks(true)) {
      const source = this.registry.sourceForChunk(chunk);
      if (!source || !source.isEnabled) continue;
      if (query.sourceTypes.length > 0 && !query.sourceTypes.includes(source.sourceType)) continue;
      const combinedTags = uniqueTags([...source.tags, ...chunk.tags]);
      if (query.tags.length > 0 && !query.tags.every((tag) => combinedTags.includes(tag))) continue;
      const result = this.scoreChunk({ chunk, source, combinedTags, normalizedQuery, queryTerms, queryTags: query.tags, sourceTypeFiltered: query.sourceTypes.length > 0 });
      if (result && result.score >= query.minScore) scored.push(result);
    }

    scored.sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId) || a.chunkId.localeCompare(b.chunkId));
    return {
      query: query.query,
      normalizedQuery,
      total: scored.length,
      results: scored.slice(0, query.limit),
      warnings
    };
  }

  listSources(): KnowledgeSource[] {
    return this.registry.listSources(true);
  }

  getSource(sourceId: string): KnowledgeSource | null {
    return this.registry.getSource(sourceId) ?? null;
  }

  getChunk(chunkId: string): KnowledgeChunk | null {
    return this.registry.getChunk(chunkId) ?? null;
  }

  private scoreChunk(args: {
    chunk: KnowledgeChunk;
    source: KnowledgeSource;
    combinedTags: KnownKnowledgeTag[];
    normalizedQuery: string;
    queryTerms: string[];
    queryTags: KnownKnowledgeTag[];
    sourceTypeFiltered: boolean;
  }): KnowledgeSearchResult | null {
    const titleText = normalizeKnowledgeText(`${args.source.title} ${args.chunk.title}`);
    const tagText = normalizeKnowledgeText(args.combinedTags.join(' '));
    const matchedTerms = new Set<string>();
    let score = 0;

    if (args.normalizedQuery.length >= 3 && args.chunk.normalizedText.includes(args.normalizedQuery)) score += 8;

    for (const term of args.queryTerms) {
      if (args.chunk.normalizedText.includes(term)) {
        score += 3;
        matchedTerms.add(term);
      }
      if (titleText.includes(term)) {
        score += 2;
        matchedTerms.add(term);
      }
      if (tagText.includes(term)) {
        score += 4;
        matchedTerms.add(term);
      }
    }

    for (const tag of args.queryTags) {
      if (args.combinedTags.includes(tag)) {
        score += 5;
        matchedTerms.add(tag);
      }
    }

    if (args.sourceTypeFiltered) score += 2;
    if (score > 0) score += PRIORITY_SCORE[args.chunk.priority];
    if (score <= 0) return null;

    return {
      chunkId: args.chunk.chunkId,
      sourceId: args.source.sourceId,
      sourceTitle: args.source.title,
      sourceType: args.source.sourceType,
      ...(args.chunk.section ? { section: args.chunk.section } : {}),
      ...(args.chunk.page !== undefined ? { page: args.chunk.page } : {}),
      priority: args.chunk.priority,
      text: args.chunk.text,
      score,
      matchedTerms: [...matchedTerms].sort((a, b) => a.localeCompare(b)),
      tags: args.combinedTags,
      rationale: buildRationale(score, matchedTerms, args.chunk.priority)
    };
  }
}

function uniqueTags(tags: readonly KnownKnowledgeTag[]): KnownKnowledgeTag[] {
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
}

function buildRationale(score: number, matchedTerms: Set<string>, priority: KnowledgeChunkPriority): string {
  const terms = [...matchedTerms].sort((a, b) => a.localeCompare(b));
  const termText = terms.length ? `Eslesen terimler: ${terms.join(', ')}.` : 'Filtre eslesmesi.';
  return `${termText} Oncelik: ${priority}. Skor: ${score}.`;
}
