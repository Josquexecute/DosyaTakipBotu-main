import type { KnowledgeSearchResult } from './knowledge-search-types';

/**
 * P4-E4: Bilgi Bankasi sonuc gorunumu icin SALT-OKUNUR kaynak filtresi.
 *
 * Yalniz mevcut sonuc listesini gosterim icin suzer; arama motorunu, commit akisini veya depo yazmayi
 * ETKILEMEZ. 'all' tum sonuclar, 'seed' yalniz yerlesik (origin!=='user'), 'user' yalniz kullanici
 * kaynagi (origin==='user') sonuclari dondurur.
 */
export type KnowledgeSourceFilter = 'all' | 'seed' | 'user';

export const KNOWLEDGE_SOURCE_FILTERS: KnowledgeSourceFilter[] = ['all', 'seed', 'user'];

export function isKnowledgeSourceFilter(value: unknown): value is KnowledgeSourceFilter {
  return value === 'all' || value === 'seed' || value === 'user';
}

export function filterKnowledgeResultsByOrigin(results: readonly KnowledgeSearchResult[], filter: KnowledgeSourceFilter): KnowledgeSearchResult[] {
  if (filter === 'user') return results.filter((result) => result.origin === 'user');
  if (filter === 'seed') return results.filter((result) => result.origin !== 'user');
  return [...results];
}
