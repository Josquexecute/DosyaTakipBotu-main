export const KNOWLEDGE_LOCAL_ONLY = true;
export const KNOWLEDGE_DEFAULT_SEARCH_LIMIT = 10;
export const KNOWLEDGE_MAX_SEARCH_LIMIT = 50;

export const KNOWLEDGE_READ_ONLY_CHANNELS = [
  'knowledge:search',
  'knowledge:listSources',
  'knowledge:getSource',
  'knowledge:getChunk'
] as const;

export const KNOWLEDGE_FORBIDDEN_ACTION_PATTERN = /(write|save|apply|import|export|delete|edit|sync|upload|download|copy|persist|provider)/i;

export function normalizeKnowledgeLimit(value: unknown, fallback = KNOWLEDGE_DEFAULT_SEARCH_LIMIT): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(KNOWLEDGE_MAX_SEARCH_LIMIT, Math.floor(parsed));
}

export function isKnowledgeReadOnlyChannel(channel: string): boolean {
  return (KNOWLEDGE_READ_ONLY_CHANNELS as readonly string[]).includes(channel);
}

export function isForbiddenKnowledgeChannel(channel: string): boolean {
  return channel.startsWith('knowledge:') && KNOWLEDGE_FORBIDDEN_ACTION_PATTERN.test(channel);
}
