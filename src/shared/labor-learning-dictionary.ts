import { normalizeSearch } from './turkish';
import type { LaborCategory } from './labor-rules';

/**
 * Öğrenen "işçilik eşleştirme sözlüğü" (saf veri modeli + eşleştirme).
 * Kullanıcı önizlemede bir satırı düzeltince burada saklanır ve sonraki Excel'lerde aynı/benzer parça
 * geldiğinde KURALDAN ÖNCE kullanılır. Kalıcılık LocalCacheStore (labor-learning.json) üzerinden yapılır.
 */
export interface LaborLearningEntry {
  /** Kullanıcının gördüğü ham parça adı (gösterim). */
  alias: string;
  /** normalizeSearch ile sadeleştirilmiş ad (anahtar). */
  normalizedName: string;
  /** Varsa parça kodu (normalize). */
  partCode?: string;
  /** Seçilen işçilik türleri. */
  categories: LaborCategory[];
  /** Öğrenilen tutarlar (kategori → TL). Boşsa kategori varsayılanı kullanılır. */
  amounts?: Partial<Record<LaborCategory, number>>;
  /** Tutar mantığı açıklaması (ör. "kullanıcı düzeltmesi", "fiyat listesi"). */
  amountLogic?: string;
  /** Kullanıcının onayladığı/düzelttiği kararın kısa gerekçesi. */
  reason?: string;
  /** ISO tarih. */
  updatedAt: string;
}

export interface LaborLearningMatch {
  entry: LaborLearningEntry;
  matchType: 'exact' | 'fuzzy';
  /** 0..1 benzerlik. exact = 1. */
  score: number;
}

export function normalizeLaborKey(value: string): string {
  return normalizeSearch(value);
}

function tokenize(value: string): string[] {
  return normalizeSearch(value).split(' ').filter((t) => t.length > 1);
}

/** İki ad arasında Jaccard token benzerliği (0..1). */
export function laborNameSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Yüksek-güven fuzzy eşik (altı "Kontrol gerekli" işaretlenir). */
export const FUZZY_CONFIDENT_THRESHOLD = 0.6;

/**
 * Öğrenen sözlükte eşleşme arar. Önce parça kodu (varsa) + ad ile TAM eşleşme; yoksa fuzzy (en yüksek
 * benzerlik). Hiç anlamlı benzerlik yoksa null. Çağıran taraf düşük skoru "Kontrol gerekli" yapar.
 */
export function lookupLearned(entries: readonly LaborLearningEntry[], partName: string, partCode = ''): LaborLearningMatch | null {
  const key = normalizeLaborKey(partName);
  const code = normalizeLaborKey(partCode);
  if (!key && !code) return null;

  // 1) Parça kodu ile tam eşleşme (en güçlü sinyal).
  if (code) {
    const byCode = entries.find((e) => e.partCode && normalizeLaborKey(e.partCode) === code);
    if (byCode) return { entry: byCode, matchType: 'exact', score: 1 };
  }
  // 2) Normalize ad ile tam eşleşme.
  const exact = entries.find((e) => e.normalizedName === key);
  if (exact) return { entry: exact, matchType: 'exact', score: 1 };

  // 3) Fuzzy: en yüksek benzerlikli kayıt.
  let best: LaborLearningMatch | null = null;
  for (const entry of entries) {
    const score = laborNameSimilarity(key, entry.normalizedName);
    if (score > 0 && (!best || score > best.score)) best = { entry, matchType: 'fuzzy', score };
  }
  if (best && best.score >= 0.34) return best;
  return null;
}

export interface LaborCorrection {
  alias: string;
  partCode?: string;
  categories: LaborCategory[];
  amounts?: Partial<Record<LaborCategory, number>>;
  amountLogic?: string;
  reason?: string;
}

/** Bir düzeltmeyi sözlüğe ekler/günceller (normalize ad + parça kodu ile tekilleştirir). */
export function recordLearned(entries: readonly LaborLearningEntry[], correction: LaborCorrection, now = new Date().toISOString()): LaborLearningEntry[] {
  const normalizedName = normalizeLaborKey(correction.alias);
  if (!normalizedName) return [...entries];
  const partCode = correction.partCode ? normalizeLaborKey(correction.partCode) : '';
  const entry: LaborLearningEntry = {
    alias: correction.alias.trim().slice(0, 160),
    normalizedName,
    ...(partCode ? { partCode } : {}),
    categories: correction.categories.slice(0, 7),
    ...(correction.amounts ? { amounts: correction.amounts } : {}),
    ...(correction.amountLogic ? { amountLogic: correction.amountLogic.slice(0, 120) } : {}),
    ...(correction.reason ? { reason: correction.reason.slice(0, 240) } : {}),
    updatedAt: now
  };
  const rest = entries.filter((e) => !(e.normalizedName === normalizedName && (e.partCode ?? '') === partCode));
  return [entry, ...rest].slice(0, 2000);
}

export interface LaborLearningDeleteCriteria {
  alias: string;
  partCode?: string;
}

/** Yanlış öğrenmeyi kaldırmak için saf altyapı; UI/IPC gerektiğinde bunun üstüne bağlanır. */
export function deleteLearned(entries: readonly LaborLearningEntry[], criteria: LaborLearningDeleteCriteria): LaborLearningEntry[] {
  const normalizedName = normalizeLaborKey(criteria.alias);
  if (!normalizedName) return [...entries];
  const partCode = criteria.partCode ? normalizeLaborKey(criteria.partCode) : '';
  return entries.filter((entry) => !(entry.normalizedName === normalizedName && (!partCode || (entry.partCode ?? '') === partCode)));
}
