import { normalizeSearch } from './turkish';
import { LABOR_CATEGORIES, type LaborCategory } from './labor-rules';

/**
 * Ogrenen iscilik eslestirme sozlugu (saf veri modeli + eslestirme + yonetim).
 * Kullanici onayladigi/duzelttigi kararlar burada saklanir ve sonraki Excel'lerde kuraldan once kullanilir.
 * Kalicilik LocalCacheStore (labor-learning.json) uzerinden yapilir.
 */
export type LaborLearningSource = 'user-correction' | 'user-approval' | 'manual';

export interface LaborLearningEntry {
  /** Kullanicinin gordugu ham parca adi/aciklamasi. */
  alias: string;
  /** normalizeSearch ile sadelestirilmis ad (anahtar). */
  normalizedName: string;
  /** Varsa parca kodu (normalize). */
  partCode?: string;
  /** Secilen iscilik turleri. */
  categories: LaborCategory[];
  /** Ogrenilen tutarlar (kategori -> TL). Bossa kategori varsayilani kullanilir. */
  amounts?: Partial<Record<LaborCategory, number>>;
  /** Tutar mantigi aciklamasi (or. "kullanici duzeltmesi", "kullanici onayi"). */
  amountLogic?: string;
  /** Kullanici notu/kisa karar gerekcesi. */
  reason?: string;
  /** Duzeltilen/olusturulan kayit sonraki onerilerde kontrol gerekli baslasin mi? */
  needsReview?: boolean;
  /** Devre disi kayitlar lookupLearned tarafindan kullanilmaz. */
  active?: boolean;
  /** Kaydin kaynagi. */
  source?: LaborLearningSource;
  /** ISO tarih. */
  createdAt?: string;
  /** ISO tarih. */
  updatedAt: string;
  /** Son AI onerisi kullanimi. */
  lastUsedAt?: string;
  /** AI onerilerinde kac kez kullanildi. */
  useCount?: number;
}

export interface LaborLearningMatch {
  entry: LaborLearningEntry;
  matchType: 'exact' | 'fuzzy';
  /** 0..1 benzerlik. exact = 1. */
  score: number;
}

export interface LaborCorrection {
  alias: string;
  partCode?: string;
  categories: LaborCategory[];
  amounts?: Partial<Record<LaborCategory, number>>;
  amountLogic?: string;
  reason?: string;
  needsReview?: boolean;
  source?: LaborLearningSource;
}

export interface LaborLearningDeleteCriteria {
  alias?: string;
  normalizedName?: string;
  partCode?: string;
}

export interface LaborLearningAdminKey {
  normalizedName: string;
  partCode?: string;
}

export interface LaborLearningUpdateInput extends LaborLearningAdminKey {
  categories?: LaborCategory[];
  amounts?: Partial<Record<LaborCategory, number>>;
  amountLogic?: string;
  reason?: string;
  needsReview?: boolean;
  active?: boolean;
  source?: LaborLearningSource;
}

export interface LaborLearningImportResult {
  entries: LaborLearningEntry[];
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface LaborLearningExportResult {
  filePath: string;
  count: number;
}

const VALID_CATEGORIES = new Set<LaborCategory>(LABOR_CATEGORIES);
const VALID_SOURCES = new Set<LaborLearningSource>(['user-correction', 'user-approval', 'manual']);

export function normalizeLaborKey(value: string): string {
  return normalizeSearch(value);
}

function tokenize(value: string): string[] {
  return normalizeSearch(value).split(' ').filter((t) => t.length > 1);
}

function cleanText(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '';
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? value : null;
}

function inferSource(amountLogic?: string): LaborLearningSource {
  const text = normalizeSearch(amountLogic ?? '');
  if (text.includes('ONAY')) return 'user-approval';
  if (text.includes('DUZELT') || text.includes('DUZELTME')) return 'user-correction';
  return 'manual';
}

function sanitizeCategories(value: unknown): LaborCategory[] {
  if (!Array.isArray(value)) return [];
  const out: LaborCategory[] = [];
  for (const category of value) {
    if (typeof category !== 'string' || !VALID_CATEGORIES.has(category as LaborCategory)) continue;
    if (!out.includes(category as LaborCategory)) out.push(category as LaborCategory);
    if (out.length >= LABOR_CATEGORIES.length) break;
  }
  return out;
}

function sanitizeAmounts(value: unknown): Partial<Record<LaborCategory, number>> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const amounts: Partial<Record<LaborCategory, number>> = {};
  for (const [category, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_CATEGORIES.has(category as LaborCategory)) continue;
    const amount = Number(raw);
    if (Number.isFinite(amount) && amount >= 0) amounts[category as LaborCategory] = Math.round(amount);
  }
  return Object.keys(amounts).length ? amounts : undefined;
}

export function isLearnableLaborAlias(alias: string): boolean {
  const key = normalizeLaborKey(alias);
  if (!key) return false;
  const compact = key.replace(/\s+/g, '');
  if (!/[A-Z]/.test(key)) return false;
  if (/^\d+$/.test(compact)) return false;
  if (/^[A-Z]{1,2}\d{1,5}$/.test(compact) || /^\d{1,5}[A-Z]{1,2}$/.test(compact)) return false;
  if (compact.length < 3) return false;
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length === 1 && /^[A-Z]?\d{1,4}$/.test(tokens[0] ?? '')) return false;
  return true;
}

export function laborLearningKey(entry: LaborLearningAdminKey): string {
  return `${entry.normalizedName}::${entry.partCode ?? ''}`;
}

export function normalizeLaborLearningEntry(value: unknown, now = new Date().toISOString(), defaultSource: LaborLearningSource = 'manual'): LaborLearningEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const alias = cleanText(record.alias ?? record.partName ?? record.description, 160);
  const normalizedName = normalizeLaborKey(cleanText(record.normalizedName, 180) || alias);
  if (!isLearnableLaborAlias(alias || normalizedName)) return null;
  const categories = sanitizeCategories(record.categories);
  if (categories.length === 0) return null;
  const partCode = normalizeLaborKey(cleanText(record.partCode, 80));
  const amountLogic = cleanText(record.amountLogic, 120);
  const source = typeof record.source === 'string' && VALID_SOURCES.has(record.source as LaborLearningSource)
    ? record.source as LaborLearningSource
    : (amountLogic ? inferSource(amountLogic) : defaultSource);
  const updatedAt = validIso(record.updatedAt) ?? now;
  const amounts = sanitizeAmounts(record.amounts);
  const reason = cleanText(record.reason, 240);
  const createdAt = validIso(record.createdAt) ?? updatedAt;
  const lastUsedAt = validIso(record.lastUsedAt);
  return {
    alias: (alias || normalizedName).slice(0, 160),
    normalizedName,
    ...(partCode ? { partCode } : {}),
    categories,
    ...(amounts ? { amounts } : {}),
    ...(amountLogic ? { amountLogic } : {}),
    ...(reason ? { reason } : {}),
    ...(typeof record.needsReview === 'boolean' ? { needsReview: record.needsReview } : {}),
    active: record.active !== false,
    source,
    createdAt,
    updatedAt,
    ...(lastUsedAt ? { lastUsedAt } : {}),
    useCount: Number.isFinite(Number(record.useCount)) ? Math.max(0, Math.round(Number(record.useCount))) : 0
  };
}

/** Iki ad arasinda Jaccard token benzerligi (0..1). */
export function laborNameSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Yuksek-guven fuzzy esik (alti "Kontrol gerekli" isaretlenir). */
export const FUZZY_CONFIDENT_THRESHOLD = 0.6;

/**
 * Ogrenen sozlukte eslesme arar. Aktif olmayan kayitlar AI kararlarinda kullanilmaz.
 * Once parca kodu (varsa) + ad ile tam eslesme; yoksa fuzzy (en yuksek benzerlik).
 */
export function lookupLearned(entries: readonly LaborLearningEntry[], partName: string, partCode = ''): LaborLearningMatch | null {
  const key = normalizeLaborKey(partName);
  const code = normalizeLaborKey(partCode);
  const activeEntries = entries.filter((entry) => entry.active !== false);
  if (!key && !code) return null;

  if (code) {
    const byCode = activeEntries.find((entry) => entry.partCode && normalizeLaborKey(entry.partCode) === code);
    if (byCode) return { entry: byCode, matchType: 'exact', score: 1 };
  }

  const exact = activeEntries.find((entry) => entry.normalizedName === key);
  if (exact) return { entry: exact, matchType: 'exact', score: 1 };

  let best: LaborLearningMatch | null = null;
  for (const entry of activeEntries) {
    const score = laborNameSimilarity(key, entry.normalizedName);
    if (score > 0 && (!best || score > best.score)) best = { entry, matchType: 'fuzzy', score };
  }
  if (best && best.score >= 0.34) return best;
  return null;
}

/** Bir duzeltmeyi sozluge ekler/gunceller (normalize ad + parca kodu ile tekillestirir). */
export function recordLearned(entries: readonly LaborLearningEntry[], correction: LaborCorrection, now = new Date().toISOString()): LaborLearningEntry[] {
  const normalizedName = normalizeLaborKey(correction.alias);
  if (!isLearnableLaborAlias(correction.alias) || !normalizedName) return [...entries];
  const categories = sanitizeCategories(correction.categories);
  if (categories.length === 0) return [...entries];
  const partCode = correction.partCode ? normalizeLaborKey(correction.partCode) : '';
  const existing = entries.find((entry) => entry.normalizedName === normalizedName && (entry.partCode ?? '') === partCode);
  const amounts = sanitizeAmounts(correction.amounts);
  const entry: LaborLearningEntry = {
    alias: correction.alias.trim().slice(0, 160),
    normalizedName,
    ...(partCode ? { partCode } : {}),
    categories,
    ...(amounts ? { amounts } : {}),
    ...(correction.amountLogic ? { amountLogic: correction.amountLogic.slice(0, 120) } : {}),
    ...(correction.reason ? { reason: correction.reason.slice(0, 240) } : {}),
    ...(typeof correction.needsReview === 'boolean' ? { needsReview: correction.needsReview } : {}),
    active: true,
    source: correction.source ?? inferSource(correction.amountLogic),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing?.lastUsedAt ? { lastUsedAt: existing.lastUsedAt } : {}),
    useCount: existing?.useCount ?? 0
  };
  const rest = entries.filter((item) => !(item.normalizedName === normalizedName && (item.partCode ?? '') === partCode));
  return [entry, ...rest].slice(0, 2000);
}

/** Yanlis ogrenmeyi kaldirmak icin saf altyapi; normalize ad + opsiyonel parca kodu ile kaldirir. */
export function deleteLearned(entries: readonly LaborLearningEntry[], criteria: LaborLearningDeleteCriteria): LaborLearningEntry[] {
  const normalizedName = criteria.normalizedName ? normalizeLaborKey(criteria.normalizedName) : normalizeLaborKey(criteria.alias ?? '');
  if (!normalizedName) return [...entries];
  const partCode = criteria.partCode ? normalizeLaborKey(criteria.partCode) : '';
  return entries.filter((entry) => !(entry.normalizedName === normalizedName && (!partCode || (entry.partCode ?? '') === partCode)));
}

export function setLearnedActive(entries: readonly LaborLearningEntry[], key: LaborLearningAdminKey, active: boolean, now = new Date().toISOString()): LaborLearningEntry[] {
  return entries.map((entry) => laborLearningKey(entry) === laborLearningKey(key) ? { ...entry, active, updatedAt: now } : entry);
}

export function updateLearned(entries: readonly LaborLearningEntry[], update: LaborLearningUpdateInput, now = new Date().toISOString()): LaborLearningEntry[] {
  const normalizedName = normalizeLaborKey(update.normalizedName);
  if (!normalizedName) return [...entries];
  return entries.map((entry) => {
    if (laborLearningKey(entry) !== laborLearningKey({ normalizedName, partCode: update.partCode ? normalizeLaborKey(update.partCode) : '' })) return entry;
    const categories = update.categories ? sanitizeCategories(update.categories) : entry.categories;
    if (categories.length === 0) return entry;
    const amounts = update.amounts ? sanitizeAmounts(update.amounts) : undefined;
    return {
      ...entry,
      categories,
      ...(amounts ? { amounts } : {}),
      ...(typeof update.amountLogic === 'string' ? { amountLogic: update.amountLogic.slice(0, 120) } : {}),
      ...(typeof update.reason === 'string' ? { reason: update.reason.slice(0, 240) } : {}),
      ...(typeof update.needsReview === 'boolean' ? { needsReview: update.needsReview } : {}),
      ...(typeof update.active === 'boolean' ? { active: update.active } : {}),
      source: update.source ?? 'user-correction',
      updatedAt: now
    };
  });
}

export function touchLearnedUsage(entries: readonly LaborLearningEntry[], usages: readonly LaborLearningAdminKey[], now = new Date().toISOString()): LaborLearningEntry[] {
  if (usages.length === 0) return [...entries];
  const counts = new Map<string, number>();
  for (const usage of usages) counts.set(laborLearningKey(usage), (counts.get(laborLearningKey(usage)) ?? 0) + 1);
  return entries.map((entry) => {
    const count = counts.get(laborLearningKey(entry));
    return count ? { ...entry, lastUsedAt: now, useCount: (entry.useCount ?? 0) + count } : entry;
  });
}

export function exportLaborLearningJson(entries: readonly LaborLearningEntry[]): string {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), entries }, null, 2);
}

export function importLaborLearningJson(existing: readonly LaborLearningEntry[], rawJson: string, now = new Date().toISOString()): LaborLearningImportResult {
  let payload: unknown;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    throw new Error('Bozuk veya uyumsuz öğrenme sözlüğü dosyası.');
  }
  const rawEntries = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { entries?: unknown }).entries)
      ? (payload as { entries: unknown[] }).entries
      : null;
  if (!rawEntries) throw new Error('Bozuk veya uyumsuz öğrenme sözlüğü dosyası.');

  let entries = [...existing];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const item of rawEntries) {
    const normalized = normalizeLaborLearningEntry(item, now, 'manual');
    if (!normalized) {
      skipped += 1;
      errors.push('Uyumsuz veya anlamsız kayıt atlandı.');
      continue;
    }
    const key = laborLearningKey(normalized);
    const exists = entries.some((entry) => laborLearningKey(entry) === key);
    entries = [normalized, ...entries.filter((entry) => laborLearningKey(entry) !== key)].slice(0, 2000);
    if (exists) updated += 1;
    else added += 1;
  }
  return { entries, added, updated, skipped, errors };
}
