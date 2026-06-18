import fs from 'node:fs/promises';
import path from 'node:path';
import { writeCategoryLaborExcel, type CategoryLaborWrite } from '../import/excel-importer';
import type { LaborCategory } from '../../shared/labor-rules';
import type { AutoLaborColumnInfo } from '../../shared/types';

/**
 * AI İşçilik Dağıtıcı — güvenli kaydetme katmanı.
 * - KAYDETMEDEN ÖNCE orijinal Excel'in yedeğini oluşturur.
 * - Onaylı (kullanıcı düzeltmeleri uygulanmış) satırların kategori tutarlarını H..N sütunlarına yazar.
 * - Çıktı ayrı dosyaya yazılır (orijinal korunur); formül ezme yalnızca açık onayla yapılır (writer içinde).
 */
export interface AutoLaborSaveRowInput {
  rowNumber: number;
  amounts: Partial<Record<LaborCategory, number>>;
}

export interface AutoLaborSaveInput {
  filePath: string;
  outputPath: string;
  rows: AutoLaborSaveRowInput[];
  columns: AutoLaborColumnInfo[];
  allowFormulaReplacement?: boolean;
}

export interface AutoLaborWriterResult {
  outputPath: string;
  backupPath: string;
  changedRows: number;
  writtenCells: number;
}

/** Orijinal dosyanın yanında zaman damgalı yedek yolu üretir. */
function buildBackupPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  const ext = path.extname(resolved);
  const base = path.basename(resolved, ext);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(dir, `${base}-orijinal-yedek-${stamp}${ext}`);
}

export async function saveAutoLaborExcel(input: AutoLaborSaveInput): Promise<AutoLaborWriterResult> {
  const filePath = path.resolve(input.filePath);
  // 1) Orijinalin yedeği (işlemden önce).
  const backupPath = buildBackupPath(filePath);
  await fs.copyFile(filePath, backupPath);

  // 2) Onaylı satırların kategori tutarlarını sütunlara eşle.
  const columnByCategory = new Map<LaborCategory, string>(input.columns.map((c) => [c.category, c.column]));
  const writes: CategoryLaborWrite[] = [];
  let changedRows = 0;
  for (const row of input.rows) {
    let rowHasWrite = false;
    for (const [category, amount] of Object.entries(row.amounts) as Array<[LaborCategory, number]>) {
      const column = columnByCategory.get(category);
      if (column && Number.isFinite(amount) && amount > 0) {
        writes.push({ rowNumber: row.rowNumber, column, value: amount });
        rowHasWrite = true;
      }
    }
    if (rowHasWrite) changedRows += 1;
  }

  // 3) Güvenli yazıcı (orijinal korunur, stil korunur, formül ezme onaya bağlı).
  const result = await writeCategoryLaborExcel(filePath, input.outputPath, writes, {
    ...(input.allowFormulaReplacement ? { allowFormulaReplacement: true } : {})
  });

  return { outputPath: result.outputPath, backupPath, changedRows, writtenCells: result.writtenCells };
}
