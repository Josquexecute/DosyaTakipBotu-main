import { normalizeKnowledgeTags } from '../../../shared/knowledge/knowledge-tags';
import type { KnowledgeChunk, KnowledgeRegistryData, KnowledgeSource } from '../../../shared/knowledge/knowledge-types';
import { normalizeKnowledgeIndexText } from './knowledge-normalizer';
import { loadBuiltInKnowledgeSeeds } from './knowledge-seed-service';

export class KnowledgeSourceRegistry {
  private readonly sources = new Map<string, KnowledgeSource>();
  private readonly chunks = new Map<string, KnowledgeChunk>();

  constructor(data: KnowledgeRegistryData = loadBuiltInKnowledgeSeeds()) {
    for (const source of data.sources) this.registerSource(source);
    for (const chunk of data.chunks) this.registerChunk(chunk);
  }

  listSources(includeDisabled = true): KnowledgeSource[] {
    return [...this.sources.values()]
      .filter((source) => includeDisabled || source.isEnabled)
      .sort((a, b) => a.title.localeCompare(b.title, 'tr') || a.sourceId.localeCompare(b.sourceId))
      .map((source) => cloneSource(source, this.chunkCountForSource(source.sourceId)));
  }

  listChunks(enabledOnly = true): KnowledgeChunk[] {
    return [...this.chunks.values()]
      .filter((chunk) => {
        if (!enabledOnly) return true;
        return this.sources.get(chunk.sourceId)?.isEnabled === true;
      })
      .sort((a, b) => a.chunkId.localeCompare(b.chunkId))
      .map(cloneChunk);
  }

  getSource(sourceId: string): KnowledgeSource | undefined {
    const source = this.sources.get(sourceId);
    return source ? cloneSource(source, this.chunkCountForSource(source.sourceId)) : undefined;
  }

  getChunk(chunkId: string): KnowledgeChunk | undefined {
    const chunk = this.chunks.get(chunkId);
    return chunk ? cloneChunk(chunk) : undefined;
  }

  sourceForChunk(chunk: KnowledgeChunk): KnowledgeSource | undefined {
    const source = this.sources.get(chunk.sourceId);
    return source ? cloneSource(source, this.chunkCountForSource(source.sourceId)) : undefined;
  }

  private chunkCountForSource(sourceId: string): number {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.sourceId === sourceId) count += 1;
    }
    return count;
  }

  private registerSource(input: KnowledgeSource): void {
    const source: KnowledgeSource = {
      ...input,
      sourceId: safeId(input.sourceId),
      title: safeText(input.title, 'Bilgi kaynagi'),
      tags: normalizeKnowledgeTags(input.tags),
      isEnabled: input.isEnabled === true
    };
    if (!source.sourceId) return;
    this.sources.set(source.sourceId, source);
  }

  private registerChunk(input: KnowledgeChunk): void {
    const source = this.sources.get(input.sourceId);
    if (!source) return;
    const chunk: KnowledgeChunk = {
      ...input,
      chunkId: safeId(input.chunkId),
      sourceId: source.sourceId,
      title: safeText(input.title, source.title),
      text: safeText(input.text, ''),
      normalizedText: input.normalizedText || normalizeKnowledgeIndexText(source.title, input.title, input.text, input.tags.join(' ')),
      tags: normalizeKnowledgeTags([...input.tags, ...source.tags]),
      priority: input.priority ?? 'normal'
    };
    if (!chunk.chunkId || !chunk.text) return;
    this.chunks.set(chunk.chunkId, chunk);
  }
}

function safeId(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';
}

function safeText(value: unknown, fallback: string): string {
  const cleaned = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return cleaned || fallback;
}

function cloneSource(source: KnowledgeSource, chunkCount?: number): KnowledgeSource {
  const cloned: KnowledgeSource = { ...source, tags: [...source.tags] };
  if (chunkCount !== undefined) cloned.chunkCount = chunkCount;
  return cloned;
}

function cloneChunk(chunk: KnowledgeChunk): KnowledgeChunk {
  return { ...chunk, tags: [...chunk.tags] };
}
