import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { normalizeSearch } from '../../shared/turkish';
import { matchPriceListEntry, suggestLaborForPart } from '../../shared/price-list';
import { normalizePartName, type UserPartTerm } from '../../shared/parca-sozlugu';

export interface ExcelLaborRowPreview {
  rowNumber: number;
  description: string;
  oldAmount: number | null;
  newAmount: number;
  /** Fiyat listesi modunda: bu satır gömülü listeyle eşleşti mi? */
  matched?: boolean;
  /** Fiyat listesi modunda eşleşen kalem etiketi (ör. "Ön Tampon / Macunlu Boya"). */
  matchedLabel?: string;
}

export interface ExcelLaborColumnCandidate {
  column: string;
  header: string;
  detection: ExcelLaborDetection;
  confidence: ExcelLaborConfidence;
  score: number;
  numericCount: number;
  formulaCellsFound: number;
  existingTotal: number;
  requiresUserConfirmation: boolean;
  reason: string;
}

export type ExcelLaborDetection = 'strong-header' | 'fallback-numeric-column';
export type ExcelLaborConfidence = 'high' | 'low';
export type ExcelLaborDistributionMode = 'proportional' | 'equal' | 'price-list';

export interface ExcelLaborPreview {
  filePath: string;
  fileName: string;
  sheetName: string;
  targetColumn: string;
  targetHeader: string;
  headerRow: number;
  rowCount: number;
  existingTotal: number;
  warnings: string[];
  detection: ExcelLaborDetection;
  confidence: ExcelLaborConfidence;
  requiresUserConfirmation: boolean;
  formulaCellsFound: number;
  formulasWillBeReplaced: boolean;
  distributionMode: ExcelLaborDistributionMode;
  selectedColumn: string;
  availableColumns: ExcelLaborColumnCandidate[];
  rows: ExcelLaborRowPreview[];
  /** Fiyat listesi modunda: eşleşen satırların toplam tutarı + eşleşmeyenlerin mevcut tutarı. */
  priceListTotal?: number;
  /** Fiyat listesi modunda eşleşen satır sayısı. */
  matchedRowCount?: number;
  /** Fiyat listesi modunda eşleşmeyen satır sayısı. */
  unmatchedRowCount?: number;
}

export interface ExcelLaborDistributeResult extends ExcelLaborPreview {
  outputPath: string;
  targetTotal: number;
  distributedTotal: number;
  verifiedExistingTotal: number;
}

interface ZipEntry {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  data: Buffer;
}

interface SheetCell {
  ref: string;
  column: string;
  row: number;
  value: string;
  numeric: number | null;
  hasFormula: boolean;
}

interface ParsedSheet {
  xml: string;
  name: string;
  path: string;
  cells: SheetCell[];
}

interface CandidatePlan {
  sheet: ParsedSheet;
  availableColumns: ExcelLaborColumnCandidate[];
  targetColumn: string;
  targetHeader: string;
  headerRow: number;
  detection: 'strong-header' | 'fallback-numeric-column';
  confidence: 'high' | 'low';
  requiresUserConfirmation: boolean;
  formulaCellsFound: number;
  formulasWillBeReplaced: boolean;
  distributionMode: ExcelLaborDistributionMode;
  amountRows: Array<{ rowNumber: number; description: string; oldAmount: number | null; newAmount: number; matched?: boolean; matchedLabel?: string }>;
  warnings: string[];
}

const MONEY_HEADER_KEYWORDS = ['ISCILIK', 'IS CILIK', 'UCRET', 'BEDEL', 'TUTAR', 'FIYAT'];
const DESCRIPTION_HEADER_KEYWORDS = ['PARCA', 'ACIKLAMA', 'ISLEM', 'KAPORTA', 'BOYA', 'MALZEME'];
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAX_XLSX_BYTES = 50 * 1024 * 1024;
const MAX_XLSX_ENTRY_BYTES = 80 * 1024 * 1024;
const MAX_XLSX_INFLATED_BYTES = 200 * 1024 * 1024;

export interface LaborExcelOptions {
  targetColumn?: string;
  allowRiskyColumn?: boolean;
  allowFormulaReplacement?: boolean;
  allowEqualDistribution?: boolean;
  /** Gömülü "Boya ve İşçilikler" fiyat listesine göre satır bazında tutar ata. */
  usePriceList?: boolean;
  /** Kullanıcının uygulama içi tabloda elle değiştirdiği satır tutarları (satır no → tutar). */
  overrides?: Array<{ rowNumber: number; amount: number }>;
  /**
   * v0.4.6: Öğrenen usta sözlüğü. Fiyat listesiyle doğrudan eşleşmeyen satırlarda açıklama,
   * usta dilinden resmi parça adına çevrilip (örn. "tabla"→Salıncak, "motor kulağı"→Motor Takozu)
   * fiyat listesindeki işçiliğe bağlanır. Kullanıcı parça öğrettikçe dağıtıcı da iyileşir.
   */
  userTerms?: readonly UserPartTerm[];
}

/**
 * v0.4.6: Bir Excel satırı açıklaması için işçilik tutarı bulur.
 * 1) Önce "Boya ve İşçilikler" listesiyle doğrudan eşleşme (parça + işlem).
 * 2) Eşleşmezse, öğrenen usta sözlüğüyle açıklama resmi parça adına çevrilip
 *    fiyat listesindeki işçilik (laborPart) üzerinden tutar atanır.
 */
function priceListLaborForDescription(
  description: string,
  userTerms?: readonly UserPartTerm[]
): { amount: number; label: string } | null {
  const direct = matchPriceListEntry(description);
  if (direct) return { amount: direct.entry.ustTutar, label: direct.label };
  const part = normalizePartName(description, userTerms && userTerms.length ? { userTerms } : {});
  if (part.matched) {
    const laborKey = part.laborPart ?? part.core;
    const suggestion = suggestLaborForPart(laborKey);
    if (suggestion) return { amount: suggestion.tutar, label: `${part.core} / ${suggestion.islem} (sözlük)` };
  }
  return null;
}

const MAX_LABOR_AMOUNT = 100_000_000;

function buildLaborOverrideMap(overrides: LaborExcelOptions['overrides'], planRows: Array<{ rowNumber: number }>): Map<number, number> {
  const validRowNumbers = new Set(planRows.map((row) => row.rowNumber));
  const map = new Map<number, number>();
  for (const entry of overrides ?? []) {
    const rowNumber = Number(entry?.rowNumber);
    const amount = Number(entry?.amount);
    if (!Number.isInteger(rowNumber) || !validRowNumbers.has(rowNumber)) continue;
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_LABOR_AMOUNT) continue;
    map.set(rowNumber, roundMoney(amount));
  }
  return map;
}

function planOptionsFrom(options: LaborExcelOptions): { targetColumn?: string; usePriceList?: boolean; userTerms?: readonly UserPartTerm[] } {
  const planOptions: { targetColumn?: string; usePriceList?: boolean; userTerms?: readonly UserPartTerm[] } = {};
  if (options.targetColumn) planOptions.targetColumn = options.targetColumn;
  if (options.usePriceList) planOptions.usePriceList = true;
  if (options.userTerms && options.userTerms.length) planOptions.userTerms = options.userTerms;
  return planOptions;
}

export async function inspectLaborExcel(filePath: string, targetTotal?: number, options: LaborExcelOptions = {}): Promise<ExcelLaborPreview> {
  const absolutePath = path.resolve(filePath);
  assertXlsxPath(absolutePath);
  const workbook = await loadWorkbook(absolutePath);
  const effectiveTarget = options.usePriceList ? undefined : (Number.isFinite(targetTotal) && Number(targetTotal) > 0 ? Number(targetTotal) : undefined);
  const plan = buildLaborPlan(workbook.sheet, effectiveTarget, planOptionsFrom(options));
  return laborPreviewFromPlan(absolutePath, plan);
}

export async function distributeLaborExcel(filePath: string, targetTotal: number, outputPath: string, options: LaborExcelOptions = {}): Promise<ExcelLaborDistributeResult> {
  const absolutePath = path.resolve(filePath);
  const absoluteOutput = path.resolve(outputPath);
  assertXlsxPath(absolutePath);
  if (path.extname(absoluteOutput).toLowerCase() !== '.xlsx') throw new Error('Çıktı dosyası .xlsx olmalıdır.');
  if (samePath(absolutePath, absoluteOutput)) throw new Error('Çıktı dosyası girdi Excel dosyasıyla aynı olamaz. Orijinal dosya korunmalıdır.');
  if (!options.usePriceList && (!Number.isFinite(targetTotal) || targetTotal <= 0)) throw new Error('Hedef işçilik tutarı 0’dan büyük olmalıdır.');

  const workbook = await loadWorkbook(absolutePath);
  const plan = buildLaborPlan(workbook.sheet, options.usePriceList ? undefined : targetTotal, planOptionsFrom(options));
  if (plan.amountRows.length === 0) throw new Error('Dağıtılacak satır bulunamadı. Excel içinde işçilik/tutar sütunu ve satırlar kontrol edilmelidir.');
  if (plan.requiresUserConfirmation && !options.allowRiskyColumn) {
    throw new Error(`İşçilik kolonu net başlıkla bulunamadı veya manuel/riskli kolon seçildi. Seçilen kolon: ${plan.targetColumn}. Kullanıcı açık onayı olmadan dağıtım yapılmadı.`);
  }
  if (plan.formulasWillBeReplaced && !options.allowFormulaReplacement) {
    throw new Error(`${plan.formulaCellsFound} hedef hücrede formül var. Formüller sabit tutara çevrilecekse kullanıcı açık onay kutusunu işaretlemelidir.`);
  }
  if (plan.distributionMode === 'equal' && !options.allowEqualDistribution) {
    throw new Error('Dağıtım eşit bölüşüm modunda yapılacak. Kullanıcı eşit dağıtımı açıkça onaylamadan işlem yapılmadı.');
  }
  // Kullanıcının uygulama içi tabloda elle düzenlediği tutarlar (override) hesaplanan tutarın yerine geçer.
  // Elle tutar girilen satır, fiyat listesi modunda eşleşmese bile yazılır.
  const overrideMap = buildLaborOverrideMap(options.overrides, plan.amountRows);
  const isPriceList = plan.distributionMode === 'price-list';
  const finalRows = plan.amountRows.map((row) => {
    const override = overrideMap.get(row.rowNumber);
    const willWrite = override !== undefined || (isPriceList ? row.matched === true : true);
    return { rowNumber: row.rowNumber, newAmount: override !== undefined ? override : roundMoney(row.newAmount), oldAmount: row.oldAmount, write: willWrite };
  });
  // Fiyat listesi modunda yalnızca eşleşen veya elle tutar girilen satırlar yazılır; diğerlerinin mevcut tutarı korunur.
  const writeRows = finalRows.filter((row) => row.write);
  if (isPriceList && writeRows.length === 0) {
    throw new Error('Fiyat listesiyle eşleşen veya elle tutar girilen satır yok; yazılacak tutar bulunamadı.');
  }
  // Hedef toplam = yazılacak satırların nihai tutarı + yazılmayan satırların korunan mevcut tutarı.
  // Böylece elle düzenleme yapılsa bile çıktı doğrulaması gerçek dosya toplamıyla karşılaştırılır.
  const effectiveTarget = roundMoney(finalRows.reduce((sum, row) => sum + (row.write ? row.newAmount : (row.oldAmount ?? 0)), 0));
  const nextSheetXml = applyAmountsToSheetXml(plan.sheet.xml, plan.targetColumn, writeRows);
  const entries = workbook.entries.map((entry) => {
    if (entry.name === plan.sheet.path) return { ...entry, data: Buffer.from(nextSheetXml, 'utf-8'), method: 8 };
    if (entry.name === 'xl/workbook.xml') return { ...entry, data: Buffer.from(ensureFullCalcOnLoad(entry.data.toString('utf-8')), 'utf-8'), method: 8 };
    return entry;
  });
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, writeZip(entries));
  const distributedTotal = roundMoney(writeRows.reduce((sum, row) => sum + row.newAmount, 0));

  const verification = await inspectLaborExcel(absoluteOutput, undefined, { targetColumn: plan.targetColumn });
  if (Math.abs(roundMoney(verification.existingTotal) - effectiveTarget) > 0.01) {
    await fs.unlink(absoluteOutput).catch(() => undefined);
    throw new Error(`Excel çıktı doğrulaması başarısız. Beklenen toplam ${effectiveTarget}, dosyada okunan toplam ${roundMoney(verification.existingTotal)}. Çıktı dosyası güvenlik için silindi.`);
  }

  return {
    ...laborPreviewFromPlan(absolutePath, plan),
    outputPath: absoluteOutput,
    targetTotal: effectiveTarget,
    distributedTotal,
    verifiedExistingTotal: roundMoney(verification.existingTotal)
  };
}

function laborPreviewFromPlan(absolutePath: string, plan: CandidatePlan): ExcelLaborPreview {
  const preview: ExcelLaborPreview = {
    filePath: absolutePath,
    fileName: path.basename(absolutePath),
    sheetName: plan.sheet.name,
    targetColumn: plan.targetColumn,
    targetHeader: plan.targetHeader,
    headerRow: plan.headerRow,
    rowCount: plan.amountRows.length,
    existingTotal: roundMoney(plan.amountRows.reduce((sum, row) => sum + (row.oldAmount ?? 0), 0)),
    warnings: plan.warnings,
    detection: plan.detection,
    confidence: plan.confidence,
    requiresUserConfirmation: plan.requiresUserConfirmation,
    formulaCellsFound: plan.formulaCellsFound,
    formulasWillBeReplaced: plan.formulasWillBeReplaced,
    distributionMode: plan.distributionMode,
    selectedColumn: plan.targetColumn,
    availableColumns: plan.availableColumns,
    // v0.4.3: Uygulama içi düzenlenebilir tablo için satırların tamamına yakını gösterilir (makul üst sınır).
    rows: plan.amountRows.slice(0, 300)
  };
  if (plan.distributionMode === 'price-list') {
    return {
      ...preview,
      priceListTotal: roundMoney(plan.amountRows.reduce((sum, row) => sum + row.newAmount, 0)),
      matchedRowCount: plan.amountRows.filter((row) => row.matched === true).length,
      unmatchedRowCount: plan.amountRows.filter((row) => row.matched === false).length
    };
  }
  return preview;
}

async function loadWorkbook(filePath: string): Promise<{ entries: ZipEntry[]; sheet: ParsedSheet }> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_XLSX_BYTES) throw new Error(`Excel dosyasi guvenli okuma sinirini asti: ${Math.round(stat.size / 1024 / 1024)} MB.`);
  const entries = readZipEntries(await fs.readFile(filePath));
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));
  const sharedStrings = parseSharedStrings(entryMap.get('xl/sharedStrings.xml')?.data.toString('utf-8') ?? '');
  const workbookXml = entryMap.get('xl/workbook.xml')?.data.toString('utf-8') ?? '';
  const relsXml = entryMap.get('xl/_rels/workbook.xml.rels')?.data.toString('utf-8') ?? '';
  const sheetInfo = resolveFirstSheet(workbookXml, relsXml, entryMap);
  const sheetEntry = entryMap.get(sheetInfo.path);
  if (!sheetEntry) throw new Error('Excel çalışma sayfası okunamadı.');
  const xml = sheetEntry.data.toString('utf-8');
  return {
    entries,
    sheet: {
      xml,
      name: sheetInfo.name,
      path: sheetInfo.path,
      cells: parseSheetCells(xml, sharedStrings)
    }
  };
}

function buildLaborPlan(sheet: ParsedSheet, targetTotal?: number, options: { targetColumn?: string; usePriceList?: boolean; userTerms?: readonly UserPartTerm[] } = {}): CandidatePlan {
  const rows = groupCellsByRow(sheet.cells);
  const availableColumns = detectLaborColumnCandidates(rows);
  const header = selectHeaderCandidate(rows, availableColumns, options.targetColumn);
  const warnings: string[] = [];
  if (!header) throw new Error('Excel içinde işçilik/tutar sütunu bulunamadı. Başlıkta İşçilik, Tutar, Bedel, Fiyat veya Ücret ifadelerinden biri olmalıdır veya manuel kolon seçilmelidir.');
  if (header.detection === 'fallback-numeric-column') {
    warnings.push(`İşçilik kolonu net başlıkla bulunamadı. ${header.amountColumn} kolonu sayısal değer yoğunluğuna göre tahmin edildi; kullanıcı açık onayı olmadan dağıtım yapılmaz.`);
  }
  if (options.targetColumn && header.requiresUserConfirmation) {
    warnings.push(`${header.amountColumn} kolonu manuel/riskli seçim olarak işaretlendi; dağıtım için kullanıcı açık onayı gerekir.`);
  }
  const amountRowsRaw: Array<{ rowNumber: number; description: string; oldAmount: number | null; hasFormula: boolean }> = [];
  for (const [rowNumber, cells] of rows) {
    if (rowNumber <= header.rowNumber) continue;
    const description = describeRow(cells, header.amountColumn);
    const targetCell = cells.find((cell) => cell.column === header.amountColumn);
    const oldAmount = targetCell?.numeric ?? parseMoney(targetCell?.value ?? '');
    const rowHasContent = description.length > 0 || oldAmount !== null;
    if (!rowHasContent) continue;
    const looksLikeTotal = /TOPLAM|GENEL TOPLAM|ARA TOPLAM/.test(normalizeSearch(description));
    if (looksLikeTotal) continue;
    amountRowsRaw.push({ rowNumber, description: description || `Satır ${rowNumber}`, oldAmount, hasFormula: targetCell?.hasFormula === true });
  }
  if (amountRowsRaw.length === 0) warnings.push('Dağıtılacak işçilik satırı bulunamadı.');
  const formulaCellsFound = amountRowsRaw.filter((row) => row.hasFormula).length;
  if (formulaCellsFound > 0) warnings.push(`${formulaCellsFound} hedef hücrede formül var; dağıtım yapılırsa bu formüller sabit tutara çevrilir. Onay kutusu zorunludur.`);

  const planBase = {
    sheet,
    availableColumns,
    targetColumn: header.amountColumn,
    targetHeader: header.headerText,
    headerRow: header.rowNumber,
    detection: header.detection,
    confidence: header.confidence,
    requiresUserConfirmation: header.requiresUserConfirmation,
    formulaCellsFound,
    formulasWillBeReplaced: formulaCellsFound > 0
  };

  if (options.usePriceList) {
    const unmatched: string[] = [];
    const amountRows = amountRowsRaw.map((row) => {
      const match = priceListLaborForDescription(row.description, options.userTerms);
      if (match) {
        return { rowNumber: row.rowNumber, description: row.description, oldAmount: row.oldAmount, newAmount: roundMoney(match.amount), matched: true, matchedLabel: match.label };
      }
      unmatched.push(row.description);
      // Eşleşmeyen satırın mevcut tutarı korunur (yazılmaz), kullanıcıya raporlanır.
      return { rowNumber: row.rowNumber, description: row.description, oldAmount: row.oldAmount, newAmount: roundMoney(row.oldAmount ?? 0), matched: false };
    });
    const matchedCount = amountRows.filter((row) => row.matched).length;
    if (matchedCount === 0) warnings.push('Fiyat listesiyle eşleşen satır bulunamadı. Açıklamalar parça/işlem adlarıyla eşleşmiyor olabilir; kolon eşleştirmesini ve açıklama metnini kontrol edin.');
    if (unmatched.length > 0) warnings.push(`${unmatched.length} satır fiyat listesinde eşleşmedi (mevcut tutarları korundu): ${unmatched.slice(0, 5).join(' | ')}${unmatched.length > 5 ? ' …' : ''}`);
    return { ...planBase, distributionMode: 'price-list', amountRows, warnings };
  }

  const distributionMode = resolveDistributionMode(amountRowsRaw.map((row) => row.oldAmount), targetTotal);
  if (targetTotal && distributionMode === 'equal') warnings.push('Bazı satırlarda mevcut tutar boş/0 olduğu için dağıtım eşit bölüşüm modunda yapılacak. Bu mod kullanıcıya açık gösterilir.');
  const amounts = distributeAmounts(amountRowsRaw.map((row) => row.oldAmount), targetTotal);
  return {
    ...planBase,
    distributionMode,
    amountRows: amountRowsRaw.map((row, index) => ({ rowNumber: row.rowNumber, description: row.description, oldAmount: row.oldAmount, newAmount: amounts[index] ?? 0 })),
    warnings
  };
}

interface SelectedColumnPlan {
  rowNumber: number;
  amountColumn: string;
  headerText: string;
  detection: ExcelLaborDetection;
  confidence: ExcelLaborConfidence;
  requiresUserConfirmation: boolean;
}

function selectHeaderCandidate(rows: Map<number, SheetCell[]>, candidates: ExcelLaborColumnCandidate[], targetColumn?: string): SelectedColumnPlan | null {
  const normalizedTarget = targetColumn?.trim().toUpperCase();
  if (normalizedTarget) {
    const candidate = candidates.find((item) => item.column === normalizedTarget);
    if (candidate) return {
      rowNumber: findHeaderRowForColumn(rows, normalizedTarget),
      amountColumn: candidate.column,
      headerText: candidate.header || `${candidate.column} kolonu`,
      detection: candidate.detection,
      confidence: candidate.confidence,
      requiresUserConfirmation: candidate.requiresUserConfirmation || candidate.detection !== 'strong-header'
    };
    return { rowNumber: 1, amountColumn: normalizedTarget, headerText: `${normalizedTarget} kolonu (manuel)`, detection: 'fallback-numeric-column', confidence: 'low', requiresUserConfirmation: true };
  }
  const best = candidates[0];
  if (!best) return null;
  return {
    rowNumber: findHeaderRowForColumn(rows, best.column),
    amountColumn: best.column,
    headerText: best.header || `${best.column} kolonu`,
    detection: best.detection,
    confidence: best.confidence,
    requiresUserConfirmation: best.requiresUserConfirmation
  };
}

function detectLaborColumnCandidates(rows: Map<number, SheetCell[]>): ExcelLaborColumnCandidate[] {
  const byColumn = new Map<string, ExcelLaborColumnCandidate>();
  const headerRows = [...rows.entries()].sort((a, b) => a[0] - b[0]).slice(0, 30);
  for (const [_rowNumber, cells] of headerRows) {
    for (const cell of cells) {
      const normalized = normalizeSearch(cell.value);
      const score = scoreMoneyHeader(normalized);
      if (score <= 0) continue;
      const numericCount = countNumericCellsBelow(rows, cell.column, _rowNumber);
      const formulaCellsFound = countFormulaCellsBelow(rows, cell.column, _rowNumber);
      const existingTotal = sumNumericCellsBelow(rows, cell.column, _rowNumber);
      const candidate: ExcelLaborColumnCandidate = {
        column: cell.column,
        header: cell.value.trim() || cell.column,
        detection: 'strong-header',
        confidence: score >= 80 ? 'high' : 'low',
        score: score * 100 + numericCount,
        numericCount,
        formulaCellsFound,
        existingTotal,
        requiresUserConfirmation: score < 80,
        reason: reasonForHeaderScore(normalized, numericCount)
      };
      const previous = byColumn.get(cell.column);
      if (!previous || candidate.score > previous.score) byColumn.set(cell.column, candidate);
    }
  }

  const numericByColumn = new Map<string, { count: number; total: number; formulas: number }>();
  for (const [rowNumber, cells] of rows) {
    if (rowNumber > 80) continue;
    for (const cell of cells) {
      const n = cell.numeric ?? parseMoney(cell.value);
      if (n === null) continue;
      const current = numericByColumn.get(cell.column) ?? { count: 0, total: 0, formulas: 0 };
      current.count += 1;
      current.total = roundMoney(current.total + n);
      if (cell.hasFormula) current.formulas += 1;
      numericByColumn.set(cell.column, current);
    }
  }
  for (const [column, stats] of numericByColumn) {
    if (byColumn.has(column) || stats.count < 2) continue;
    byColumn.set(column, {
      column,
      header: `${column} kolonu (tahmin)`,
      detection: 'fallback-numeric-column',
      confidence: 'low',
      score: stats.count,
      numericCount: stats.count,
      formulaCellsFound: stats.formulas,
      existingTotal: roundMoney(stats.total),
      requiresUserConfirmation: true,
      reason: 'Başlık bulunamadı; sayısal değer yoğunluğuna göre tahmin edildi.'
    });
  }
  return [...byColumn.values()].sort((a, b) => b.score - a.score || columnNumber(a.column) - columnNumber(b.column));
}

function findHeaderRowForColumn(rows: Map<number, SheetCell[]>, column: string): number {
  for (const [rowNumber, cells] of [...rows.entries()].sort((a, b) => a[0] - b[0]).slice(0, 30)) {
    if (cells.some((cell) => cell.column === column && scoreMoneyHeader(normalizeSearch(cell.value)) > 0)) return rowNumber;
  }
  return 1;
}

function countNumericCellsBelow(rows: Map<number, SheetCell[]>, column: string, headerRow: number): number {
  let count = 0;
  for (const [rowNumber, cells] of rows) {
    if (rowNumber <= headerRow) continue;
    const cell = cells.find((item) => item.column === column);
    if ((cell?.numeric ?? parseMoney(cell?.value ?? '')) !== null) count += 1;
  }
  return count;
}

function countFormulaCellsBelow(rows: Map<number, SheetCell[]>, column: string, headerRow: number): number {
  let count = 0;
  for (const [rowNumber, cells] of rows) {
    if (rowNumber <= headerRow) continue;
    if (cells.some((item) => item.column === column && item.hasFormula)) count += 1;
  }
  return count;
}

function sumNumericCellsBelow(rows: Map<number, SheetCell[]>, column: string, headerRow: number): number {
  let total = 0;
  for (const [rowNumber, cells] of rows) {
    if (rowNumber <= headerRow) continue;
    const cell = cells.find((item) => item.column === column);
    const n = cell?.numeric ?? parseMoney(cell?.value ?? '');
    if (n !== null) total += n;
  }
  return roundMoney(total);
}

function scoreMoneyHeader(normalizedText: string): number {
  if (normalizedText.includes('ISCILIK') || normalizedText.includes('IS CILIK')) return 100;
  if (normalizedText.includes('UCRET')) return 80;
  if (normalizedText.includes('BEDEL')) return 60;
  if (normalizedText.includes('TUTAR')) return 40;
  if (normalizedText.includes('FIYAT')) return 30;
  return 0;
}

function reasonForHeaderScore(normalizedText: string, numericCount: number): string {
  if (normalizedText.includes('ISCILIK') || normalizedText.includes('IS CILIK')) return `İşçilik başlığı açık bulundu; ${numericCount} sayısal satır.`;
  if (normalizedText.includes('UCRET')) return `Ücret başlığı bulundu; ${numericCount} sayısal satır.`;
  if (normalizedText.includes('BEDEL')) return `Bedel başlığı bulundu; ${numericCount} sayısal satır; kullanıcı kontrolü önerilir.`;
  if (normalizedText.includes('TUTAR')) return `Genel tutar başlığı bulundu; işçilik olmayabilir, kullanıcı onayı gerekir.`;
  if (normalizedText.includes('FIYAT')) return `Genel fiyat başlığı bulundu; işçilik olmayabilir, kullanıcı onayı gerekir.`;
  return `Kolon adayı; ${numericCount} sayısal satır.`;
}

function describeRow(cells: SheetCell[], amountColumn: string): string {
  const textParts = cells
    .filter((cell) => cell.column !== amountColumn)
    .map((cell) => cell.value.trim())
    .filter((value) => value && !/^\d+([.,]\d+)?$/.test(value));
  const preferred = textParts.find((value) => DESCRIPTION_HEADER_KEYWORDS.some((keyword) => normalizeSearch(value).includes(keyword)));
  return (preferred ?? textParts.join(' / ')).slice(0, 140);
}

export function distributeAmounts(existingAmounts: Array<number | null>, targetTotal?: number): number[] {
  const count = existingAmounts.length;
  if (count === 0) return [];
  if (!targetTotal || targetTotal <= 0) return existingAmounts.map((amount) => roundMoney(amount ?? 0));
  const positive = existingAmounts.map((amount) => amount && amount > 0 ? amount : 0);
  const positiveCount = positive.filter((amount) => amount > 0).length;
  const existingTotal = positive.reduce((sum, amount) => sum + amount, 0);
  // Bütün satırlarda mevcut tutar varsa oranlı dağıtır; boş/0 satır varsa hiçbir satırı dışarıda bırakmamak için eşit dağıtır.
  const raw = existingTotal > 0 && positiveCount === count
    ? positive.map((amount) => targetTotal * (amount / existingTotal))
    : Array.from({ length: count }, () => targetTotal / count);
  const rounded = raw.map(roundMoney);
  const diff = roundMoney(targetTotal - rounded.reduce((sum, amount) => sum + amount, 0));
  rounded[rounded.length - 1] = roundMoney((rounded[rounded.length - 1] ?? 0) + diff);
  return rounded;
}
function resolveDistributionMode(existingAmounts: Array<number | null>, targetTotal?: number): 'proportional' | 'equal' {
  if (!targetTotal || targetTotal <= 0) return 'proportional';
  const count = existingAmounts.length;
  const positive = existingAmounts.map((amount) => amount && amount > 0 ? amount : 0);
  const positiveCount = positive.filter((amount) => amount > 0).length;
  const existingTotal = positive.reduce((sum, amount) => sum + amount, 0);
  return existingTotal > 0 && positiveCount === count ? 'proportional' : 'equal';
}


function applyAmountsToSheetXml(xml: string, amountColumn: string, rows: Array<{ rowNumber: number; newAmount: number }>): string {
  let nextXml = xml;
  for (const row of rows) {
    const cellRef = `${amountColumn}${row.rowNumber}`;
    const value = String(row.newAmount.toFixed(2));
    const existingCellRegex = new RegExp(`<c\\b(?=[^>]*\\br="${escapeRegExp(cellRef)}")([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`);
    if (existingCellRegex.test(nextXml)) {
      nextXml = nextXml.replace(existingCellRegex, (_match: string, attrs: string) => buildAmountCellXml(cellRef, attrs, value));
      continue;
    }
    const rowRegex = new RegExp(`(<row\\b(?=[^>]*\\br="${row.rowNumber}")[^>]*>)([\\s\\S]*?)(<\\/row>)`);
    if (rowRegex.test(nextXml)) {
      nextXml = nextXml.replace(rowRegex, (_match, open: string, body: string, close: string) => `${open}${insertCellXmlInColumnOrder(body, amountColumn, row.rowNumber, buildAmountCellXml(cellRef, '', value))}${close}`);
    }
  }
  return nextXml;
}

function insertCellXmlInColumnOrder(rowBody: string, amountColumn: string, rowNumber: number, newCellXml: string): string {
  const targetColumnNumber = columnNumber(amountColumn);
  const cellRegex = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(rowBody))) {
    const cellXml = match[0];
    const ref = getXmlAttribute(cellXml, 'r');
    const parsed = ref ? parseCellRef(ref) : null;
    if (parsed && parsed.row === rowNumber && columnNumber(parsed.column) > targetColumnNumber) {
      return `${rowBody.slice(0, match.index)}${newCellXml}${rowBody.slice(match.index)}`;
    }
  }
  return `${rowBody}${newCellXml}`;
}

function buildAmountCellXml(cellRef: string, attrs: string, value: string): string {
  const style = getXmlAttribute(attrs, 's');
  return `<c r="${cellRef}"${style ? ` s="${escapeXml(style)}"` : ''}><v>${value}</v></c>`;
}

function parseSheetCells(xml: string, sharedStrings: string[]): SheetCell[] {
  const cells: SheetCell[] = [];
  const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(xml))) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const ref = getXmlAttribute(attrs, 'r');
    if (!ref) continue;
    const parsedRef = parseCellRef(ref);
    if (!parsedRef) continue;
    const type = getXmlAttribute(attrs, 't');
    const valueRaw = firstMatch(body, /<v[^>]*>([\s\S]*?)<\/v>/) ?? firstMatch(body, /<t[^>]*>([\s\S]*?)<\/t>/) ?? '';
    let value = decodeXml(valueRaw.trim());
    if (type === 's') value = value !== '' ? (sharedStrings[Number(value)] ?? '') : '';
    if (type === 'inlineStr') {
      const parts = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1] ?? ''));
      value = parts.length ? parts.join('') : value;
    }
    const numeric = parseMoney(value);
    const hasFormula = /<f\b/i.test(body);
    cells.push({ ref, column: parsedRef.column, row: parsedRef.row, value, numeric, hasFormula });
  }
  return cells;
}

function groupCellsByRow(cells: SheetCell[]): Map<number, SheetCell[]> {
  const rows = new Map<number, SheetCell[]>();
  for (const cell of cells) {
    const list = rows.get(cell.row) ?? [];
    list.push(cell);
    rows.set(cell.row, list);
  }
  for (const list of rows.values()) list.sort((a, b) => columnNumber(a.column) - columnNumber(b.column));
  return rows;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const siRegex = /<si\b[\s\S]*?<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml))) {
    const si = match[0];
    const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1] ?? ''));
    strings.push(parts.join(''));
  }
  return strings;
}

function resolveFirstSheet(workbookXml: string, relsXml: string, entryMap: Map<string, ZipEntry>): { name: string; path: string } {
  const sheetMatch = workbookXml.match(/<sheet\b([^>]*)\/>/) ?? workbookXml.match(/<sheet\b([^>]*)>/);
  const sheetAttrs = sheetMatch?.[1] ?? '';
  const sheetName = decodeXml(getXmlAttribute(sheetAttrs, 'name') || 'Sayfa1');
  const relId = getXmlAttribute(sheetAttrs, 'r:id') || getXmlAttribute(sheetAttrs, 'id');
  if (relId && relsXml) {
    const relRegex = new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapeRegExp(relId)}")[^>]*>`);
    const relMatch = relsXml.match(relRegex);
    const target = relMatch ? getXmlAttribute(relMatch[0], 'Target') : '';
    if (target) {
      const normalized = normalizeZipPath(target.startsWith('/') ? target.slice(1) : path.posix.join('xl', target));
      if (entryMap.has(normalized)) return { name: sheetName, path: normalized };
    }
  }
  const fallback = [...entryMap.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!fallback) throw new Error('Excel içinde çalışma sayfası bulunamadı.');
  return { name: sheetName, path: fallback };
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  let inflatedBytes = 0;
  for (let i = 0; i < entryCount; i += 1) {
    if (offset < 0 || offset + 46 > buffer.length) throw new Error('Excel zip merkezi dizini eksik veya bozuk.');
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Excel zip merkezi dizini okunamadı.');
    const method = buffer.readUInt16LE(offset + 10);
    const crc32Value = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = normalizeZipPath(buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf-8'));
    if (method !== 0 && method !== 8) throw new Error(`Excel zip sıkıştırma yöntemi desteklenmiyor: ${method}`);
    if (uncompressedSize > MAX_XLSX_ENTRY_BYTES) throw new Error(`Excel zip girdisi guvenli acilim sinirini asti: ${name}.`);
    if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error('Excel zip yerel dosya basligi okunamadi.');
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataStart < 0 || dataStart + compressedSize > buffer.length) throw new Error(`Excel zip girdisi eksik veya bozuk: ${name}.`);
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0
      ? Buffer.from(compressedData)
      : inflateRawSync(compressedData, { maxOutputLength: MAX_XLSX_ENTRY_BYTES + 1 });
    if (data.length !== uncompressedSize) throw new Error(`Excel zip boyut bilgisi tutarsiz: ${name}.`);
    if (data.length > MAX_XLSX_ENTRY_BYTES) throw new Error(`Excel zip girdisi guvenli acilim sinirini asti: ${name}.`);
    inflatedBytes += data.length;
    if (inflatedBytes > MAX_XLSX_INFLATED_BYTES) throw new Error('Excel zip toplam acilim sinirini asti.');
    entries.push({ name, method, crc32: crc32Value, compressedSize, uncompressedSize, localHeaderOffset, data });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function writeZip(entries: ZipEntry[]): Buffer {
  const fileParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf-8');
    const data = entry.data;
    const compressed = entry.method === 0 ? data : deflateRawSync(data);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(entry.method === 0 ? 0 : 8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    fileParts.push(localHeader, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.method === 0 ? 0 : 8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += localHeader.length + nameBuffer.length + compressed.length;
  }
  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...fileParts, centralDirectory, eocd]);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Excel zip son kayıt bilgisi bulunamadı.');
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function ensureFullCalcOnLoad(workbookXml: string): string {
  if (!workbookXml) return workbookXml;
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml
      .replace(/<calcPr\b([^>]*)\/>/, (_match, attrs: string) => /fullCalcOnLoad\s*=/.test(attrs) ? `<calcPr${attrs}/>` : `<calcPr${attrs} fullCalcOnLoad="1"/>`)
      .replace(/<calcPr\b([^>]*)>/, (_match, attrs: string) => /fullCalcOnLoad\s*=/.test(attrs) ? `<calcPr${attrs}>` : `<calcPr${attrs} fullCalcOnLoad="1">`);
  }
  return workbookXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
}

export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/₺|TL|TRY/gi, '').replace(/\s/g, '').trim();
  if (!cleaned) return null;
  const normalized = normalizeMoneyText(cleaned);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeMoneyText(cleaned: string): string {
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  // Türkçe: 1.234,56 -> 1234.56; İngilizce: 1,234.56 -> 1234.56
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) return cleaned.replace(/\./g, '').replace(',', '.');
    return cleaned.replace(/,/g, '');
  }

  if (lastComma >= 0) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(cleaned)) return cleaned.replace(/,/g, '');
    return cleaned.replace(',', '.');
  }

  if (lastDot >= 0) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) return cleaned.replace(/\./g, '');
    return cleaned;
  }

  return cleaned;
}

function parseCellRef(ref: string): { column: string; row: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return { column: match[1]!.toUpperCase(), row: Number(match[2]) };
}

function columnNumber(column: string): number {
  let total = 0;
  for (const char of column) total = total * 26 + (char.charCodeAt(0) - 64);
  return total;
}

function getXmlAttribute(attrs: string, name: string): string {
  const escaped = escapeRegExp(name);
  const match = attrs.match(new RegExp(`${escaped}="([^"]*)"`)) ?? attrs.match(new RegExp(`${escaped}='([^']*)'`));
  return match?.[1] ?? '';
}

function firstMatch(input: string, regex: RegExp): string | null {
  return input.match(regex)?.[1] ?? null;
}

function decodeXml(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeZipPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

function roundMoney(input: number): number {
  return Math.round((input + Number.EPSILON) * 100) / 100;
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function assertXlsxPath(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.xlsx') throw new Error('Bu sürüm yalnızca .xlsx Excel dosyasını destekler. Eski .xls dosyasını Excel ile .xlsx olarak kaydedin.');
}

export function buildMultiMoneyLaborWorkbook(rows: Array<{ description: string; partAmount: number; laborAmount: number }>): Buffer {
  const sheetRows = [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Açıklama</t></is></c><c r="B1" t="inlineStr"><is><t>Parça Tutarı</t></is></c><c r="C1" t="inlineStr"><is><t>İşçilik Tutarı</t></is></c></row>',
    ...rows.map((row, index) => `<row r="${index + 2}"><c r="A${index + 2}" t="inlineStr"><is><t>${escapeXml(row.description)}</t></is></c><c r="B${index + 2}"><v>${row.partAmount}</v></c><c r="C${index + 2}"><v>${row.laborAmount}</v></c></row>`)
  ].join('');
  const entries: ZipEntry[] = [
    zipEntry('[Content_Types].xml', `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    zipEntry('_rels/.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    zipEntry('xl/workbook.xml', `${XML_DECLARATION}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Portal" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    zipEntry('xl/_rels/workbook.xml.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    zipEntry('xl/worksheets/sheet1.xml', `${XML_DECLARATION}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`)
  ];
  return writeZip(entries);
}

export function buildMinimalLaborWorkbook(rows: Array<{ description: string; amount: number }>): Buffer {
  const sheetRows = [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Açıklama</t></is></c><c r="B1" t="inlineStr"><is><t>İşçilik Tutarı</t></is></c></row>',
    ...rows.map((row, index) => `<row r="${index + 2}"><c r="A${index + 2}" t="inlineStr"><is><t>${escapeXml(row.description)}</t></is></c><c r="B${index + 2}"><v>${row.amount}</v></c></row>`)
  ].join('');
  const entries: ZipEntry[] = [
    zipEntry('[Content_Types].xml', `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    zipEntry('_rels/.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    zipEntry('xl/workbook.xml', `${XML_DECLARATION}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="İşçilik" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    zipEntry('xl/_rels/workbook.xml.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    zipEntry('xl/worksheets/sheet1.xml', `${XML_DECLARATION}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`)
  ];
  return writeZip(entries);
}

function zipEntry(name: string, content: string): ZipEntry {
  const data = Buffer.from(content, 'utf-8');
  return { name, method: 8, crc32: crc32(data), compressedSize: 0, uncompressedSize: data.length, localHeaderOffset: 0, data };
}

function escapeXml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
