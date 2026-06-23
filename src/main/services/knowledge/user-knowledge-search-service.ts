import type { KnownKnowledgeTag } from '../../../shared/knowledge/knowledge-tags';
import type { KnowledgeSearchQuery, KnowledgeSearchResponse, KnowledgeSearchResult, UserKnowledgeStoreSearchStatus } from '../../../shared/knowledge/knowledge-search-types';
import type { KnowledgeSourceType } from '../../../shared/knowledge/knowledge-types';
import type { UserKnowledgeEntry } from '../../../shared/knowledge/user-knowledge-store-types';
import { normalizeKnowledgeText, tokenizeKnowledgeText } from './knowledge-normalizer';
import { sanitizeKnowledgeSearchQuery } from './knowledge-safety-service';

/**
 * P4-E3: User Knowledge Store kayitlarini Bilgi Bankasi aramasina SALT-OKUNUR dahil eder.
 *
 * Bu modul tamamen saftir: diske dokunmaz, IPC cagirmaz, depo dosya sinifini kullanmaz.
 * Depo okumasi cagiran katmanda (ipc) yapilir; burada yalniz onceden okunmus entry dizisi
 * metin-eslestirme ile aranir. Entry'nin dosya ADI gosterilebilir; mutlak/Windows/pCloud yolu
 * zaten entry'de tutulmaz ve buradan da hicbir sekilde uretilmez.
 */
export const USER_KNOWLEDGE_RESULT_LABEL = 'Kullanıcı Kaynağı';
export const USER_KNOWLEDGE_STORE_LABEL = 'Yerel Kullanıcı Deposu';
export const USER_KNOWLEDGE_STORE_FILE_LABEL = 'user-knowledge-store.json';
export const USER_KNOWLEDGE_STORE_READ_WARNING = 'Kullanıcı bilgi deposu okunamadı; yalnız yerleşik kaynaklar gösteriliyor.';

const KNOWLEDGE_SOURCE_TYPES = new Set<KnowledgeSourceType>([
  'guide', 'note', 'template', 'policy_rule', 'fault_rule', 'heavy_damage_rule', 'labor_rule', 'document_rule', 'office_note'
]);

function compareResults(a: KnowledgeSearchResult, b: KnowledgeSearchResult): number {
  return b.score - a.score || a.sourceId.localeCompare(b.sourceId) || a.chunkId.localeCompare(b.chunkId);
}

function normalizeEntryTags(tags: unknown): KnownKnowledgeTag[] {
  return Array.isArray(tags) ? (tags.filter((tag) => typeof tag === 'string') as KnownKnowledgeTag[]) : [];
}

function mapEntryToResult(entry: UserKnowledgeEntry, entryTags: KnownKnowledgeTag[], score: number, matchedTerms: Set<string>): KnowledgeSearchResult {
  const sourceType = KNOWLEDGE_SOURCE_TYPES.has(entry.sourceType as KnowledgeSourceType) ? (entry.sourceType as KnowledgeSourceType) : undefined;
  // Yalniz dosya ADI gosterilir; mutlak/Windows/pCloud yolu map EDILMEZ.
  return {
    chunkId: `user:${entry.entryId}`,
    sourceId: `user:${entry.entryId}`,
    sourceTitle: entry.title || entry.sourceFileName || 'Kullanıcı kaynağı',
    ...(sourceType ? { sourceType } : {}),
    text: entry.text,
    score,
    matchedTerms: [...matchedTerms].sort((a, b) => a.localeCompare(b)),
    tags: entryTags,
    rationale: `Kullanıcı kaynağı eslesmesi (${entry.sourceFileName}). Skor: ${score}.`,
    origin: 'user',
    sourceLabel: USER_KNOWLEDGE_RESULT_LABEL
  };
}

export function searchUserKnowledgeEntries(entries: readonly UserKnowledgeEntry[], input: KnowledgeSearchQuery | string): KnowledgeSearchResult[] {
  const query = sanitizeKnowledgeSearchQuery(input);
  const normalizedQuery = normalizeKnowledgeText(query.query);
  const queryTerms = tokenizeKnowledgeText(query.query);
  // Bos arama: seed davranisiyla ayni — hicbir kullanici kaydi dondurulmez (tum depoyu dokmeyiz).
  if (!normalizedQuery && query.tags.length === 0 && query.sourceTypes.length === 0) return [];
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const scored: KnowledgeSearchResult[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.entryId !== 'string' || typeof entry.text !== 'string') continue;
    const entryTags = normalizeEntryTags(entry.tags);
    if (query.sourceTypes.length > 0) {
      const entryType = KNOWLEDGE_SOURCE_TYPES.has(entry.sourceType as KnowledgeSourceType) ? (entry.sourceType as KnowledgeSourceType) : undefined;
      if (!entryType || !query.sourceTypes.includes(entryType)) continue;
    }
    if (query.tags.length > 0 && !query.tags.every((tag) => entryTags.includes(tag))) continue;

    const titleText = normalizeKnowledgeText(`${entry.title ?? ''} ${entry.sourceFileName ?? ''}`);
    const contentText = normalizeKnowledgeText(entry.text);
    const tagText = normalizeKnowledgeText(entryTags.join(' '));
    const fileText = normalizeKnowledgeText(entry.sourceFileName ?? '');
    const matchedTerms = new Set<string>();
    let score = 0;
    if (normalizedQuery.length >= 3 && contentText.includes(normalizedQuery)) score += 8;
    for (const term of queryTerms) {
      if (contentText.includes(term)) { score += 3; matchedTerms.add(term); }
      if (titleText.includes(term)) { score += 2; matchedTerms.add(term); }
      if (tagText.includes(term)) { score += 4; matchedTerms.add(term); }
      if (fileText.includes(term)) { score += 2; matchedTerms.add(term); }
    }
    for (const tag of query.tags) {
      if (entryTags.includes(tag)) { score += 5; matchedTerms.add(tag); }
    }
    if (query.sourceTypes.length > 0) score += 2;
    if (score < query.minScore) continue;
    scored.push(mapEntryToResult(entry, entryTags, score, matchedTerms));
  }
  scored.sort(compareResults);
  return scored.slice(0, query.limit);
}

/**
 * Seed (yerlesik) arama yanitini bozmadan, kullanici kaynagi sonuclarini birlestirir. Seed sonuclarinin
 * tamami korunur (hicbiri dusurulmez); kullanici sonuclari skora gore ayni karsilastiriciyla yerlesir.
 * Depo okuma hatasinda seed sonuclari calismaya devam eder, yalniz bir uyari eklenir.
 */
export function mergeUserKnowledgeIntoResponse(seed: KnowledgeSearchResponse, userResults: KnowledgeSearchResult[], userStoreStatus: UserKnowledgeStoreSearchStatus): KnowledgeSearchResponse {
  const combined = [...seed.results, ...userResults].sort(compareResults);
  return {
    query: seed.query,
    normalizedQuery: seed.normalizedQuery,
    total: seed.total + userResults.length,
    results: combined,
    warnings: userStoreStatus.readError ? [...seed.warnings, USER_KNOWLEDGE_STORE_READ_WARNING] : seed.warnings,
    userStoreStatus
  };
}
