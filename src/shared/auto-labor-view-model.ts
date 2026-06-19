import type { AutoLaborCategory, AutoLaborPreview, AutoLaborRowPreview } from './types';
import { normalizeSearch } from './turkish';

export type AutoLaborPreviewFilter = 'all' | 'changed' | 'review' | 'high' | 'medium' | 'low' | 'oldCleared' | 'learning';

export interface AutoLaborViewState {
  autoLaborEdits: Record<number, Record<string, number>>;
  autoLaborApprovedRows: Record<number, boolean>;
  autoLaborReviewRows: Record<number, boolean>;
  autoLaborSearch: string;
  autoLaborFilter: AutoLaborPreviewFilter;
}

export const AUTO_LABOR_CATEGORIES: AutoLaborCategory[] = ['Kaporta', 'Mekanik', 'Elektrik', 'Döşeme/Kilit', 'Cam', 'Boya', 'Onarım'];

export const AUTO_LABOR_FILTER_LABELS: Record<AutoLaborPreviewFilter, string> = {
  all: 'Tüm satırlar',
  changed: 'Değişen',
  review: 'Kontrol gerekli',
  high: 'Yüksek güven',
  medium: 'Orta güven',
  low: 'Düşük güven',
  oldCleared: 'Eski değer sıfırlanacak',
  learning: 'Öğrenmeye aday'
};

export const AUTO_LABOR_FILTERS: AutoLaborPreviewFilter[] = ['all', 'changed', 'review', 'high', 'medium', 'low', 'oldCleared', 'learning'];
export const AUTO_LABOR_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type AutoLaborPageSize = (typeof AUTO_LABOR_PAGE_SIZE_OPTIONS)[number];
export const AUTO_LABOR_DEFAULT_PAGE_SIZE: AutoLaborPageSize = 50;
export const AUTO_LABOR_ROWS_PER_PAGE = AUTO_LABOR_DEFAULT_PAGE_SIZE;

export function normalizeAutoLaborPageSize(value: number): AutoLaborPageSize {
  return AUTO_LABOR_PAGE_SIZE_OPTIONS.includes(value as AutoLaborPageSize) ? (value as AutoLaborPageSize) : AUTO_LABOR_DEFAULT_PAGE_SIZE;
}

export interface AutoLaborUiStats {
  totalRows: number;
  rowsToWrite: number;
  changedRows: number;
  reviewRows: number;
  highConfidenceRows: number;
  mediumConfidenceRows: number;
  lowConfidenceRows: number;
  oldClearedCells: number;
  oldClearedRows: number;
  userEditedRows: number;
  learningCandidateRows: number;
  formulaRows: number;
  categoryTotals: Partial<Record<AutoLaborCategory, number>>;
  warnings: string[];
}

export interface AutoLaborSavePlan {
  rows: Array<{ rowNumber: number; amounts: Partial<Record<AutoLaborCategory, number>> }>;
  corrections: Array<{ alias: string; partCode?: string; categories: AutoLaborCategory[]; amounts?: Partial<Record<AutoLaborCategory, number>>; amountLogic?: string; reason?: string }>;
  stats: AutoLaborUiStats;
}

export interface AutoLaborPageModel {
  filterCounts: Record<AutoLaborPreviewFilter, number>;
  totalFilteredRows: number;
  totalPages: number;
  currentPage: number;
  pageStart: number;
  pageEnd: number;
  visibleRows: AutoLaborRowPreview[];
}

export function autoLaborHasUserEdit(state: AutoLaborViewState, rowNumber: number): boolean {
  return Object.keys(state.autoLaborEdits[rowNumber] ?? {}).length > 0;
}

export function autoLaborNeedsReview(state: AutoLaborViewState, row: AutoLaborRowPreview): boolean {
  const override = state.autoLaborReviewRows[row.rowNumber];
  return override ?? row.needsReview;
}

export function autoLaborLearningCandidate(state: AutoLaborViewState, row: AutoLaborRowPreview): boolean {
  return state.autoLaborApprovedRows[row.rowNumber] === true || autoLaborHasUserEdit(state, row.rowNumber);
}

export function autoLaborFinalAmounts(state: AutoLaborViewState, row: AutoLaborRowPreview, validCategories?: Set<AutoLaborCategory>): Partial<Record<AutoLaborCategory, number>> {
  const amounts: Partial<Record<AutoLaborCategory, number>> = {};
  for (const [cat, value] of Object.entries(row.amounts)) {
    if (typeof value !== 'number' || value <= 0) continue;
    if (validCategories && !validCategories.has(cat as AutoLaborCategory)) continue;
    amounts[cat as AutoLaborCategory] = value;
  }
  const edits = state.autoLaborEdits[row.rowNumber];
  if (edits) {
    for (const [cat, value] of Object.entries(edits)) {
      if (validCategories && !validCategories.has(cat as AutoLaborCategory)) continue;
      if (value > 0) amounts[cat as AutoLaborCategory] = Math.round(value);
      else delete amounts[cat as AutoLaborCategory];
    }
  }
  return amounts;
}

export function autoLaborFinalAmount(state: AutoLaborViewState, row: AutoLaborRowPreview, category: AutoLaborCategory): number | '' {
  const amount = autoLaborFinalAmounts(state, row)[category];
  return typeof amount === 'number' && amount > 0 ? amount : '';
}

export function autoLaborOldClearedCellCount(state: AutoLaborViewState, preview: AutoLaborPreview, row: AutoLaborRowPreview): number {
  const amounts = autoLaborFinalAmounts(state, row);
  let count = 0;
  for (const col of preview.columns) {
    const oldVal = row.oldByColumn[col.column] ?? 0;
    const nextVal = amounts[col.category] ?? 0;
    if (oldVal > 0 && nextVal <= 0) count += 1;
  }
  return count;
}

export function autoLaborRowChanged(state: AutoLaborViewState, preview: AutoLaborPreview, row: AutoLaborRowPreview): boolean {
  if (row.changed || autoLaborHasUserEdit(state, row.rowNumber)) return true;
  return autoLaborOldClearedCellCount(state, preview, row) > 0;
}

export function autoLaborRowReason(state: AutoLaborViewState, row: AutoLaborRowPreview): string {
  const notes: string[] = [row.reason];
  if (autoLaborHasUserEdit(state, row.rowNumber)) notes.push('Kullanıcı tarafından düzeltildi.');
  if (state.autoLaborApprovedRows[row.rowNumber] === true) notes.push('Öğrenmeye kaydedilecek.');
  return notes.join(' ');
}

export function autoLaborSearchMatches(state: AutoLaborViewState, row: AutoLaborRowPreview): boolean {
  const query = normalizeSearch(state.autoLaborSearch || '');
  if (!query) return true;
  const haystack = normalizeSearch([
    row.partName,
    row.group,
    row.partCode,
    row.categories.join(' '),
    row.confidence,
    autoLaborNeedsReview(state, row) ? 'Kontrol gerekli' : '',
    autoLaborRowReason(state, row)
  ].join(' '));
  return haystack.includes(query);
}

export function autoLaborFilterMatches(state: AutoLaborViewState, preview: AutoLaborPreview, row: AutoLaborRowPreview, filter: AutoLaborPreviewFilter = state.autoLaborFilter): boolean {
  if (!autoLaborSearchMatches(state, row)) return false;
  if (filter === 'changed') return autoLaborRowChanged(state, preview, row);
  if (filter === 'review') return autoLaborNeedsReview(state, row);
  if (filter === 'high') return row.confidence === 'Yüksek';
  if (filter === 'medium') return row.confidence === 'Orta';
  if (filter === 'low') return row.confidence === 'Düşük';
  if (filter === 'oldCleared') return autoLaborOldClearedCellCount(state, preview, row) > 0;
  if (filter === 'learning') return autoLaborLearningCandidate(state, row);
  return true;
}

export function buildAutoLaborFilterCounts(state: AutoLaborViewState, preview: AutoLaborPreview): Record<AutoLaborPreviewFilter, number> {
  const counts: Record<AutoLaborPreviewFilter, number> = {
    all: 0,
    changed: 0,
    review: 0,
    high: 0,
    medium: 0,
    low: 0,
    oldCleared: 0,
    learning: 0
  };
  for (const row of preview.rows) {
    if (!autoLaborSearchMatches(state, row)) continue;
    counts.all += 1;
    if (autoLaborRowChanged(state, preview, row)) counts.changed += 1;
    if (autoLaborNeedsReview(state, row)) counts.review += 1;
    if (row.confidence === 'Yüksek') counts.high += 1;
    if (row.confidence === 'Orta') counts.medium += 1;
    if (row.confidence === 'Düşük') counts.low += 1;
    if (autoLaborOldClearedCellCount(state, preview, row) > 0) counts.oldCleared += 1;
    if (autoLaborLearningCandidate(state, row)) counts.learning += 1;
  }
  return counts;
}

export function buildAutoLaborPageModel(
  state: AutoLaborViewState,
  preview: AutoLaborPreview,
  requestedPage: number,
  pageSize: number = AUTO_LABOR_ROWS_PER_PAGE
): AutoLaborPageModel {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safeRequestedPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageStart = (safeRequestedPage - 1) * safePageSize;
  const pageEnd = pageStart + safePageSize;
  const counts: Record<AutoLaborPreviewFilter, number> = {
    all: 0,
    changed: 0,
    review: 0,
    high: 0,
    medium: 0,
    low: 0,
    oldCleared: 0,
    learning: 0
  };
  const visibleRows: AutoLaborRowPreview[] = [];
  const activeFilter = state.autoLaborFilter ?? 'all';
  let activeIndex = 0;

  for (const row of preview.rows) {
    if (!autoLaborSearchMatches(state, row)) continue;
    const changed = autoLaborRowChanged(state, preview, row);
    const review = autoLaborNeedsReview(state, row);
    const oldCleared = autoLaborOldClearedCellCount(state, preview, row) > 0;
    const learning = autoLaborLearningCandidate(state, row);

    counts.all += 1;
    if (changed) counts.changed += 1;
    if (review) counts.review += 1;
    if (row.confidence === 'Yüksek') counts.high += 1;
    if (row.confidence === 'Orta') counts.medium += 1;
    if (row.confidence === 'Düşük') counts.low += 1;
    if (oldCleared) counts.oldCleared += 1;
    if (learning) counts.learning += 1;

    const activeMatch =
      activeFilter === 'all'
      || (activeFilter === 'changed' && changed)
      || (activeFilter === 'review' && review)
      || (activeFilter === 'high' && row.confidence === 'Yüksek')
      || (activeFilter === 'medium' && row.confidence === 'Orta')
      || (activeFilter === 'low' && row.confidence === 'Düşük')
      || (activeFilter === 'oldCleared' && oldCleared)
      || (activeFilter === 'learning' && learning);

    if (!activeMatch) continue;
    if (activeIndex >= pageStart && activeIndex < pageEnd) visibleRows.push(row);
    activeIndex += 1;
  }

  const totalFilteredRows = counts[activeFilter];
  const totalPages = Math.max(1, Math.ceil(totalFilteredRows / safePageSize));
  if (safeRequestedPage > totalPages && totalFilteredRows > 0) {
    return buildAutoLaborPageModel(state, preview, totalPages, safePageSize);
  }
  return {
    filterCounts: counts,
    totalFilteredRows,
    totalPages,
    currentPage: Math.min(safeRequestedPage, totalPages),
    pageStart,
    pageEnd,
    visibleRows
  };
}

export function buildAutoLaborStats(preview: AutoLaborPreview, state: AutoLaborViewState): AutoLaborUiStats {
  const validCategories = new Set<AutoLaborCategory>(preview.columns.map((c) => c.category));
  const categoryTotals: Partial<Record<AutoLaborCategory, number>> = {};
  let rowsToWrite = 0;
  let changedRows = 0;
  let reviewRows = 0;
  let highConfidenceRows = 0;
  let mediumConfidenceRows = 0;
  let lowConfidenceRows = 0;
  let oldClearedCells = 0;
  let oldClearedRows = 0;
  let userEditedRows = 0;
  let learningCandidateRows = 0;
  let formulaRows = 0;

  for (const row of preview.rows) {
    const amounts = autoLaborFinalAmounts(state, row, validCategories);
    if (Object.keys(amounts).length > 0) rowsToWrite += 1;
    for (const [cat, value] of Object.entries(amounts)) {
      if (typeof value === 'number' && value > 0) categoryTotals[cat as AutoLaborCategory] = (categoryTotals[cat as AutoLaborCategory] ?? 0) + value;
    }
    if (autoLaborRowChanged(state, preview, row)) changedRows += 1;
    if (autoLaborNeedsReview(state, row)) reviewRows += 1;
    if (row.confidence === 'Yüksek') highConfidenceRows += 1;
    if (row.confidence === 'Orta') mediumConfidenceRows += 1;
    if (row.confidence === 'Düşük') lowConfidenceRows += 1;
    const cleared = autoLaborOldClearedCellCount(state, preview, row);
    if (cleared > 0) {
      oldClearedRows += 1;
      oldClearedCells += cleared;
    }
    if (autoLaborHasUserEdit(state, row.rowNumber)) userEditedRows += 1;
    if (autoLaborLearningCandidate(state, row) && Object.keys(amounts).length > 0) learningCandidateRows += 1;
    if (row.hasFormula) formulaRows += 1;
  }

  const warnings: string[] = [];
  if (reviewRows > 0) warnings.push(`${reviewRows} satır kontrol gerekli olarak işaretli.`);
  if (lowConfidenceRows > 0) warnings.push(`${lowConfidenceRows} satır düşük güvenli; satırlar dolduruldu ancak kontrol önerilir.`);
  if (oldClearedCells > 0) warnings.push(`${oldClearedCells} eski H-N hücresi yeni kararda seçilmediği için 0 yapılacak.`);
  if (formulaRows > 0) warnings.push(`${formulaRows} satırda formüllü hedef hücre var.`);

  return {
    totalRows: preview.rows.length,
    rowsToWrite,
    changedRows,
    reviewRows,
    highConfidenceRows,
    mediumConfidenceRows,
    lowConfidenceRows,
    oldClearedCells,
    oldClearedRows,
    userEditedRows,
    learningCandidateRows,
    formulaRows,
    categoryTotals,
    warnings
  };
}

export function buildAutoLaborSavePlan(preview: AutoLaborPreview, state: AutoLaborViewState): AutoLaborSavePlan {
  const validCategories = new Set<AutoLaborCategory>(preview.columns.map((c) => c.category));
  const rows: AutoLaborSavePlan['rows'] = [];
  const corrections: AutoLaborSavePlan['corrections'] = [];

  for (const row of preview.rows) {
    const amounts = autoLaborFinalAmounts(state, row, validCategories);
    const categories = Object.keys(amounts) as AutoLaborCategory[];
    if (categories.length > 0) rows.push({ rowNumber: row.rowNumber, amounts });
    if (autoLaborLearningCandidate(state, row) && categories.length > 0) {
      const hasUserEdit = autoLaborHasUserEdit(state, row.rowNumber);
      corrections.push({
        alias: row.partName,
        ...(row.partCode ? { partCode: row.partCode } : {}),
        categories,
        amounts,
        amountLogic: hasUserEdit ? 'kullanıcı düzeltmesi (AI dağıtıcı)' : 'kullanıcı onayı (AI dağıtıcı)',
        reason: autoLaborRowReason(state, row)
      });
    }
  }

  return { rows, corrections, stats: buildAutoLaborStats(preview, state) };
}
