import { loadWorkbook, parseMoney, type SheetCell } from '../import/excel-importer';
import { normalizeSearch } from '../../shared/turkish';
import { LABOR_CATEGORIES, type LaborCategory } from '../../shared/labor-rules';
import type { LaborLearningEntry } from '../../shared/labor-learning-dictionary';
import { classifyLaborRow } from './labor-classifier-service';
import type { AutoLaborColumnInfo, AutoLaborPreview, AutoLaborRowPreview, AutoLaborSummary } from '../../shared/types';

/**
 * AI İşçilik Dağıtıcı önizleme servisi. Excel'in tüm satırlarını tarar; parça adı/kodu/tutar ve
 * H..N işçilik kategori sütunlarını BAŞLIKTAN tespit eder; her satır için (öğrenen sözlük + kural +
 * fiyat listesi) işçilik kararı verir ve eski/yeni değerlerle önizleme + rapor üretir. Dosyaya YAZMAZ.
 */

const CATEGORY_HEADER_KEYWORDS: Record<LaborCategory, string[]> = {
  Kaporta: ['KAPORTA'],
  Boya: ['BOYA'],
  Mekanik: ['MEKANIK'],
  Elektrik: ['ELEKTRIK'],
  Cam: ['CAM'],
  'Döşeme/Kilit': ['DOSEME', 'KILIT'],
  Onarım: ['ONARIM']
};

function groupByRow(cells: SheetCell[]): Map<number, SheetCell[]> {
  const map = new Map<number, SheetCell[]>();
  for (const cell of cells) {
    const list = map.get(cell.row) ?? [];
    list.push(cell);
    map.set(cell.row, list);
  }
  return map;
}

function headerScore(cells: SheetCell[]): number {
  let score = 0;
  for (const cell of cells) {
    const v = normalizeSearch(cell.value);
    if (!v) continue;
    for (const kws of Object.values(CATEGORY_HEADER_KEYWORDS)) {
      if (kws.some((k) => v === k || v.includes(k))) { score += 2; break; }
    }
    if (/(PARCA|ACIKLAMA|MALZEME|ISLEM|KOD|TUTAR|BEDEL|FIYAT|ISCILIK)/.test(v)) score += 1;
  }
  return score;
}

function findColumnByKeywords(headerCells: SheetCell[], include: RegExp, exclude?: RegExp): string {
  for (const cell of headerCells) {
    const v = normalizeSearch(cell.value);
    if (v && include.test(v) && (!exclude || !exclude.test(v))) return cell.column;
  }
  return '';
}

function detectCategoryColumns(headerCells: SheetCell[]): AutoLaborColumnInfo[] {
  const out: AutoLaborColumnInfo[] = [];
  const used = new Set<string>();
  for (const category of LABOR_CATEGORIES) {
    const kws = CATEGORY_HEADER_KEYWORDS[category];
    const cell = headerCells.find((c) => {
      const v = normalizeSearch(c.value);
      return v && kws.some((k) => v === k || v.includes(k)) && !used.has(c.column);
    });
    if (cell) {
      used.add(cell.column);
      out.push({ column: cell.column, category, header: cell.value.trim() || category });
    }
  }
  return out;
}

export async function buildAutoLaborPreview(filePath: string, learned: readonly LaborLearningEntry[] = []): Promise<AutoLaborPreview> {
  const workbook = await loadWorkbook(filePath);
  const fileName = filePath.replace(/^.*[\\/]/, '');
  const rows = groupByRow(workbook.sheet.cells);
  const warnings: string[] = [];

  // Başlık satırı: ilk 15 satır içinde en yüksek başlık skoru.
  let headerRow = 1;
  let bestScore = -1;
  for (const [rowNumber, cells] of rows) {
    if (rowNumber > 15) continue;
    const score = headerScore(cells);
    if (score > bestScore) { bestScore = score; headerRow = rowNumber; }
  }
  const headerCells = (rows.get(headerRow) ?? []).slice().sort((a, b) => a.column.localeCompare(b.column));

  const columns = detectCategoryColumns(headerCells);
  if (columns.length === 0) {
    warnings.push('İşçilik kategori sütunları (Kaporta/Boya/Mekanik/Elektrik/Cam/Döşeme-Kilit/Onarım) başlıktan tespit edilemedi. Excel başlık satırı kontrol edilmeli.');
  }
  const partNameColumn = findColumnByKeywords(headerCells, /(PARCA|ACIKLAMA|MALZEME)/, /(KOD|TUTAR|BEDEL|FIYAT)/) || 'A';
  const partCodeColumn = findColumnByKeywords(headerCells, /KOD/);
  const partAmountColumn = findColumnByKeywords(headerCells, /(PARCA TUTAR|BEDEL|FIYAT|TUTAR)/, /(ISCILIK|KAPORTA|BOYA|MEKANIK|ELEKTRIK|CAM|DOSEME|ONARIM)/);

  const categoryByColumn = new Map(columns.map((c) => [c.column, c.category] as const));
  const cellAt = (row: SheetCell[], column: string): SheetCell | undefined => row.find((c) => c.column === column);

  const previewRows: AutoLaborRowPreview[] = [];
  const totalsByCategory: Partial<Record<LaborCategory, number>> = {};
  let highConfidence = 0;
  let needsReviewCount = 0;
  let changedRows = 0;

  const dataRowNumbers = [...rows.keys()].filter((r) => r > headerRow).sort((a, b) => a - b);
  for (const rowNumber of dataRowNumbers) {
    const cells = rows.get(rowNumber) ?? [];
    const partName = (cellAt(cells, partNameColumn)?.value ?? '').trim();
    const partCode = partCodeColumn ? (cellAt(cells, partCodeColumn)?.value ?? '').trim() : '';
    const amountCell = partAmountColumn ? cellAt(cells, partAmountColumn) : undefined;
    const partAmount = amountCell ? (amountCell.numeric ?? parseMoney(amountCell.value)) : null;
    const rowText = normalizeSearch(cells.map((c) => c.value).join(' '));
    if (!partName) continue;
    if (/^(GENEL )?(ARA )?TOPLAM/.test(normalizeSearch(partName)) || /TOPLAM/.test(normalizeSearch(partName))) continue;

    const decision = classifyLaborRow(partName, partCode, '', learned);
    const oldByColumn: Record<string, number | null> = {};
    let changed = false;
    let hasFormula = false;
    const amounts: Partial<Record<LaborCategory, number>> = {};

    for (const col of columns) {
      const cell = cellAt(cells, col.column);
      const oldVal = cell ? (cell.numeric ?? parseMoney(cell.value)) : null;
      oldByColumn[col.column] = oldVal;
      const newVal = decision.categories.includes(col.category) ? (decision.amounts[col.category] ?? 0) : null;
      if (newVal && newVal > 0) {
        amounts[col.category] = newVal;
        totalsByCategory[col.category] = (totalsByCategory[col.category] ?? 0) + newVal;
        if ((oldVal ?? 0) !== newVal) changed = true;
        if (cell?.hasFormula) hasFormula = true;
      }
    }

    // Kategori seçildi ama o kategori için sütun yoksa uyarı (yine de karar veriliyor).
    const missingCols = decision.categories.filter((c) => !columns.some((col) => col.category === c));
    const reason = missingCols.length
      ? `${decision.reason} (Not: ${missingCols.join(', ')} sütunu Excel'de yok, yazılamaz.)`
      : decision.reason;

    if (changed) changedRows += 1;
    if (decision.confidence === 'Yüksek') highConfidence += 1;
    if (decision.needsReview) needsReviewCount += 1;

    previewRows.push({
      rowNumber,
      partName,
      partCode,
      partAmount,
      categories: decision.categories,
      amounts,
      oldByColumn,
      confidence: decision.confidence,
      needsReview: decision.needsReview,
      reason,
      source: decision.source,
      hasFormula,
      changed
    });
    void rowText;
  }

  if (previewRows.length === 0) warnings.push('İşlenecek parça satırı bulunamadı. Başlık satırı ve parça adı sütunu kontrol edilmeli.');

  const summary: AutoLaborSummary = {
    processed: previewRows.length,
    highConfidence,
    needsReview: needsReviewCount,
    changedRows,
    totalsByCategory
  };
  const formulaCellsFound = previewRows.filter((r) => r.hasFormula).length;

  return {
    filePath,
    fileName,
    sheetName: workbook.sheet.name,
    columns,
    partNameColumn,
    partCodeColumn,
    partAmountColumn,
    rows: previewRows,
    summary,
    warnings,
    formulaCellsFound
  };
}
