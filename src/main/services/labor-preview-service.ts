import { loadWorkbook, parseMoney, type SheetCell } from '../import/excel-importer';
import { normalizeSearch } from '../../shared/turkish';
import { LABOR_CATEGORIES, type LaborCategory } from '../../shared/labor-rules';
import type { LaborLearningEntry } from '../../shared/labor-learning-dictionary';
import { classifyLaborRow } from './labor-classifier-service';
import { buildLaborV3Context } from '../../shared/labor/part-economic-context';
import { readPriceCell } from '../../shared/labor/part-price-parser';
import { adjustLaborDecisionV3 } from '../../shared/labor/labor-decision-adjuster';
import { isCriticalSafetyPart } from '../../shared/labor/critical-safety-parts';
import { matchExpertLearning } from '../../shared/labor/expert-approved-learning-matcher';
import { aiAmountsToDistribution, buildExpertLaborDiffView } from '../../shared/labor/expert-approved-learning-diff';
import { buildLaborVehicleContext } from '../../shared/labor/labor-vehicle-context-extractor';
import { matchAiModePartCandidate } from '../../shared/labor/ai-mode-part-candidate-matcher';
import type { ExpertApprovedLaborLearningEntry } from '../../shared/labor/expert-approved-learning-types';
import type { ApprovedAiModePartCandidateEntry } from '../../shared/labor/ai-mode-part-candidate-store-types';
import type { LaborVehicleContext } from '../../shared/labor/labor-vehicle-context';
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
  // Önizleme ve Excel düzeniyle uyum için sütun harfine göre sırala (H, I, J, …).
  return out.sort((a, b) => (a.column.length - b.column.length) || a.column.localeCompare(b.column));
}

export async function buildAutoLaborPreview(
  filePath: string,
  learned: readonly LaborLearningEntry[] = [],
  expertLearned: readonly ExpertApprovedLaborLearningEntry[] = [],
  vehicle: LaborVehicleContext = {},
  aiModeCandidates: readonly ApprovedAiModePartCandidateEntry[] = []
): Promise<AutoLaborPreview> {
  const workbook = await loadWorkbook(filePath);
  // v3.3/v3.4: araç bağlamı — aktif dosya (vehicle, öncelikli) + Excel hücrelerinden çıkarım birleştirilir.
  const caseHasVehicle = Boolean(vehicle.vehicleModel || vehicle.chassisPrefix || vehicle.chassisNo || vehicle.engineCode || vehicle.engineNo || vehicle.plate);
  const vehicleContext = buildLaborVehicleContext(workbook.sheet.cells.map((c) => c.value), vehicle);
  const mergedHasVehicle = Boolean(vehicleContext.vehicleModel || vehicleContext.chassisPrefix || vehicleContext.engineCode || vehicleContext.plate);
  const vehicleSource: 'active-file' | 'excel' | 'unknown' = caseHasVehicle ? 'active-file' : mergedHasVehicle ? 'excel' : 'unknown';
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
  // Portal Excel düzeni: A=#/sıra (parça adı DEĞİL), B=DVN Grubu (destekleyici), C=İşçilik/açıklama (asıl parça),
  // D=Parça Kodu, F/G=bedel, H..N=kategori. Parça adı ÖNCE C/açıklama sütunundan okunur; A asla parça adı sayılmaz.
  const CATEGORY_WORDS = /(KAPORTA|BOYA|MEKANIK|ELEKTRIK|\bCAM\b|DOSEME|KILIT|ONARIM)/;
  const groupColumn = findColumnByKeywords(headerCells, /(DVN|GRUP|GRUBU)/, /KOD/);
  const partCodeColumn = findColumnByKeywords(headerCells, /KOD/);
  const partAmountColumn = findColumnByKeywords(headerCells, /(SAHIPLENME|PARCA TUTAR|PARCA ORIJINAL|BEDEL|FIYAT|TUTAR)/, new RegExp(`(ISCILIK|${CATEGORY_WORDS.source.slice(1, -1)})`));
  // v3 (additive): F = Parça Sahiplenme Bedeli, G = Parça Orijinal Bedeli — ayrı tespit (mevcut tespit değişmez).
  const salvageColumn = findColumnByKeywords(headerCells, /SAHIPLENME/, CATEGORY_WORDS);
  const originalColumn = findColumnByKeywords(headerCells, /ORIJINAL/, CATEGORY_WORDS);
  // v3.1 (additive): İşlem Türü (E) ve Kalibrasyon (T) sütunları — varsa işlem/kalibrasyon bağlamı buradan okunur.
  const operationColumn = findColumnByKeywords(headerCells, /ISLEM/, /(ACIKLAMA|ISCILIK)/);
  const calibrationColumn = findColumnByKeywords(headerCells, /KALIBRASYON/, CATEGORY_WORDS);
  const reserved = new Set([groupColumn, partCodeColumn, partAmountColumn, ...columns.map((c) => c.column)].filter(Boolean));
  // 1) Açıklama/İşçilik/Parça Adı başlığı (asıl parça açıklaması), kod/bedel/grup/kategori dışlanır.
  const partExclude = new RegExp(`(KOD|TUTAR|BEDEL|FIYAT|TOPLAM|SAHIPLENME|ORIJINAL|DVN|GRUP|GRUBU|\\bKDV\\b|ISK|${CATEGORY_WORDS.source.slice(1, -1)})`);
  let partNameColumn = '';
  for (const cell of headerCells) {
    const v = normalizeSearch(cell.value);
    if (!v || reserved.has(cell.column)) continue;
    if (/(ACIKLAMA|ISCILIK|PARCA ADI|MALZEME|ISLEM ACIKLAMASI|PARCA)/.test(v) && !partExclude.test(v)) { partNameColumn = cell.column; break; }
  }
  // 2) Bulunamazsa: sıra/numara (#) ve rezerve sütunlar HARİÇ ilk metin başlıklı sütun (A'ya asla düşme).
  if (!partNameColumn) {
    const numericHeader = /^(#|NO|SIRA|S\.?N\.?|SR|SATIR)$/;
    for (const cell of headerCells) {
      const v = normalizeSearch(cell.value);
      if (!v || reserved.has(cell.column) || numericHeader.test(v) || partExclude.test(v)) continue;
      partNameColumn = cell.column; break;
    }
  }
  if (!partNameColumn) {
    partNameColumn = groupColumn || 'C';
    warnings.push('Parça açıklama sütunu kesin belirlenemedi; en olası açıklama sütunu kullanıldı. Sınıflandırmayı önizlemede kontrol edin.');
  }

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
    const group = groupColumn ? (cellAt(cells, groupColumn)?.value ?? '').trim() : '';
    const partCode = partCodeColumn ? (cellAt(cells, partCodeColumn)?.value ?? '').trim() : '';
    const amountCell = partAmountColumn ? cellAt(cells, partAmountColumn) : undefined;
    const partAmount = amountCell ? (amountCell.numeric ?? parseMoney(amountCell.value)) : null;
    const rowText = normalizeSearch(cells.map((c) => c.value).join(' '));
    if (!partName) continue;
    if (/TOPLAM/.test(normalizeSearch(partName))) continue;

    // Asıl parça açıklaması (C) BİRİNCİL; grup (B) destekleyici bağlam olarak sınıflandırmaya katılır.
    const decision = classifyLaborRow(partName, partCode, group, learned);
    const oldByColumn: Record<string, number | null> = {};
    let changed = false;
    let hasFormula = false;
    const amounts: Partial<Record<LaborCategory, number>> = {};

    for (const col of columns) {
      const cell = cellAt(cells, col.column);
      const oldVal = cell ? (cell.numeric ?? parseMoney(cell.value)) : null;
      oldByColumn[col.column] = oldVal;
      if (cell?.hasFormula) hasFormula = true;
      const newVal = decision.categories.includes(col.category) ? (decision.amounts[col.category] ?? 0) : 0;
      if (newVal > 0) {
        amounts[col.category] = newVal;
        totalsByCategory[col.category] = (totalsByCategory[col.category] ?? 0) + newVal;
      }
      if ((oldVal ?? 0) !== newVal) changed = true;
    }

    // Kategori seçildi ama o kategori için sütun yoksa uyarı (yine de karar veriliyor).
    const missingCols = decision.categories.filter((c) => !columns.some((col) => col.category === c));
    const reason = missingCols.length
      ? `${decision.reason} (Not: ${missingCols.join(', ')} sütunu Excel'de yok, yazılamaz.)`
      : decision.reason;

    // v3 (additive): işlem türü (E) + Sahiplenme(F)/Orijinal(G) bedel + kalibrasyon (T) + onarım/değişim ekonomisi.
    const salvageCell = salvageColumn ? cellAt(cells, salvageColumn) : undefined;
    const originalCell = originalColumn ? cellAt(cells, originalColumn) : undefined;
    const salvagePrice = readPriceCell(salvageCell?.numeric ?? null, salvageCell?.value).value;
    const originalPrice = readPriceCell(originalCell?.numeric ?? null, originalCell?.value).value;
    const operationHint = operationColumn ? (cellAt(cells, operationColumn)?.value ?? '').trim() : '';
    const calRaw = calibrationColumn ? (cellAt(cells, calibrationColumn)?.value ?? '').trim() : '';
    const calibrationHint = calRaw && !/^0+([.,]0+)?$/.test(calRaw) ? calRaw : '';
    const laborTotal = Object.values(amounts).reduce((sum, v) => sum + (v ?? 0), 0);
    const v3 = buildLaborV3Context({
      partName,
      group,
      partCode,
      operationHint,
      calibrationHint,
      salvagePrice,
      originalPrice,
      repairLaborTotal: laborTotal > 0 ? laborTotal : null
    });

    // v3.1: ekonomik/işlem/kalibrasyon bağlamı kararı KONTROLLÜ etkiler (kategori/tutar değişmez).
    // Etki yalnız F/G ekonomik bağlam sütunu olan portal sayfalarında uygulanır.
    const critical = isCriticalSafetyPart(partName, group);
    const adj = adjustLaborDecisionV3(
      { confidence: decision.confidence, needsReview: decision.needsReview, reason, source: decision.source },
      v3,
      { critical, hasPriceContext: Boolean(salvageColumn || originalColumn) }
    );

    // v3.1 (opsiyonel, preview-only): eksper onaylı geçmiş dağıtım örneği eşleşmesi yalnız EVIDENCE + güven/uyarı.
    // Excel'e otomatik UYGULAMAZ; kategori/tutar değişmez. Liste boşsa hiçbir etki olmaz (geriye uyumlu).
    let finalConfidence = adj.confidence;
    let finalNeedsReview = adj.needsReview;
    let finalReason = adj.reason;
    let expertMatchLevel: AutoLaborRowPreview['expertMatchLevel'];
    let expertDiff: AutoLaborRowPreview['expertDiff'];
    if (expertLearned.length) {
      const expertMatch = matchExpertLearning(
        {
          partName, partGroup: group, partCode, operationType: v3.operation.type, salvagePrice, critical,
          ...(vehicleContext.vehicleModel ? { vehicleModel: vehicleContext.vehicleModel } : {}),
          ...(vehicleContext.chassisPrefix ? { chassisPrefix: vehicleContext.chassisPrefix } : {}),
          ...(vehicleContext.engineCode ? { engineCode: vehicleContext.engineCode } : {})
        },
        expertLearned
      );
      if (expertMatch.level !== 'none' && expertMatch.entry) {
        finalReason = `${finalReason} | Eksper öğrenme: ${expertMatch.reason}`;
        expertMatchLevel = expertMatch.level;
        // Diff görünümü (preview-only); Excel'e otomatik UYGULANMAZ.
        expertDiff = buildExpertLaborDiffView(
          rowNumber, expertMatch.level, expertMatch.reasons ?? [], expertMatch.warnings ?? [],
          aiAmountsToDistribution(amounts), expertMatch.entry.laborDistribution, vehicleSource
        );
        if (expertMatch.level === 'control-needed') finalNeedsReview = true;
        else if (expertMatch.level === 'strong' && !critical && finalConfidence !== 'Yüksek') {
          finalConfidence = finalConfidence === 'Düşük' ? 'Orta' : 'Yüksek';
        }
      }
    }

    // v3.6 (opsiyonel, preview-only): onaylı AI Mode parça kodu adayı evidence + mevcut D kodu karşılaştırması.
    // Excel'e/D sütununa UYGULAMAZ. Liste boşsa hiçbir etki olmaz (geriye uyumlu).
    let aiModeCandidate: AutoLaborRowPreview['aiModeCandidate'];
    if (aiModeCandidates.length) {
      const candMatch = matchAiModePartCandidate(
        {
          partName, partCode, partGroup: group,
          ...(vehicleContext.vehicleModel ? { vehicleModel: vehicleContext.vehicleModel } : {}),
          ...(vehicleContext.chassisPrefix ? { chassisPrefix: vehicleContext.chassisPrefix } : {}),
          ...(vehicleContext.engineCode ? { engineCode: vehicleContext.engineCode } : {})
        },
        aiModeCandidates
      );
      if (candMatch) {
        finalReason = `${finalReason} | AI Mode aday: ${candMatch.reason}`;
        aiModeCandidate = candMatch.evidence;
        if (candMatch.evidence.status === 'different') finalNeedsReview = true;
      }
    }

    if (changed) changedRows += 1;
    if (finalConfidence === 'Yüksek') highConfidence += 1;
    if (finalNeedsReview) needsReviewCount += 1;

    previewRows.push({
      rowNumber,
      partName,
      group,
      partCode,
      partAmount,
      categories: decision.categories,
      amounts,
      oldByColumn,
      confidence: finalConfidence,
      needsReview: finalNeedsReview,
      reason: finalReason,
      source: decision.source,
      hasFormula,
      changed,
      operationType: v3.operation.type,
      salvagePrice,
      originalPrice,
      economicVerdict: v3.economic.verdict,
      ...(expertMatchLevel ? { expertMatchLevel } : {}),
      ...(expertDiff ? { expertDiff } : {}),
      ...(aiModeCandidate ? { aiModeCandidate } : {})
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
    groupColumn,
    partCodeColumn,
    partAmountColumn,
    salvageColumn,
    originalColumn,
    operationColumn,
    calibrationColumn,
    ...(mergedHasVehicle ? { vehicleContext } : {}),
    rows: previewRows,
    summary,
    warnings,
    formulaCellsFound
  };
}
