import type { KnownKnowledgeTag } from './knowledge-tags';

export type KnowledgeSourceType =
  | 'guide'
  | 'note'
  | 'template'
  | 'policy_rule'
  | 'fault_rule'
  | 'heavy_damage_rule'
  | 'labor_rule'
  | 'document_rule'
  | 'office_note';

export type KnowledgeSourceOwner = 'system' | 'office' | 'user';
export type KnowledgeChunkPriority = 'low' | 'normal' | 'high' | 'critical';

export interface KnowledgeSource {
  sourceId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  version?: string;
  createdAt: string;
  updatedAt?: string;
  tags: KnownKnowledgeTag[];
  description?: string;
  owner?: KnowledgeSourceOwner;
  isEnabled: boolean;
  chunkCount?: number;
}

export interface KnowledgeChunk {
  chunkId: string;
  sourceId: string;
  title: string;
  text: string;
  normalizedText: string;
  tags: KnownKnowledgeTag[];
  section?: string;
  page?: number;
  priority: KnowledgeChunkPriority;
  createdAt: string;
}

export interface KnowledgeRegistryData {
  sources: KnowledgeSource[];
  chunks: KnowledgeChunk[];
}
