/**
 * v0.6.x — AI İşçilik v3.1: Eksper onaylı öğrenme ÖNİZLEMESİ (SAF; dosya/IPC/Excel yazma YOK).
 * Her satır için öğrenilecek kuralı, güveni ve kontrol uyarısını gösterir; yalnız kullanıcı onayıyla store'a eklenir.
 */
import { isCriticalSafetyPart } from './critical-safety-parts';
import { distributionTotal, extractExpertLearningEntries } from './expert-approved-learning-extractor';
import { findDuplicateExpertEntry } from './expert-approved-learning-store';
import type { LaborVehicleContext } from './labor-vehicle-context';
import type {
  ExpertApprovedLaborLearningEntry,
  ExpertLearningPreviewItem,
  ExpertLearningSourceRow,
  LaborDistribution
} from './expert-approved-learning-types';
import type { AutoLaborCategory, AutoLaborColumnInfo, AutoLaborPreview } from '../types';

const CATEGORY_DIST_KEY: Record<AutoLaborCategory, keyof LaborDistribution> = {
  Kaporta: 'kaporta', Mekanik: 'mekanik', Elektrik: 'elektrik',
  'Döşeme/Kilit': 'dosemeKilit', Cam: 'cam', Boya: 'boya', Onarım: 'onarim'
};

function emptyDistribution(): LaborDistribution {
  return { kaporta: 0, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 0, onarim: 0 };
}

/** Eksper dosyasının MEVCUT H..N değerlerini (gerçek dağıtım) LaborDistribution'a çevirir. */
function distributionFromExisting(columns: readonly AutoLaborColumnInfo[], oldByColumn: Record<string, number | null>): LaborDistribution {
  const dist = emptyDistribution();
  for (const col of columns) {
    const value = oldByColumn[col.column] ?? 0;
    if (value > 0) dist[CATEGORY_DIST_KEY[col.category]] += value;
  }
  return dist;
}

/**
 * Tamamlanmış/onaylanmış AI İşçilik önizlemesini öğrenme kaynağı satırlarına çevirir.
 * Dağıtım, AI önerisi DEĞİL eksperin Excel'deki MEVCUT (eski) H..N değerlerinden alınır.
 */
export function expertSourceRowsFromAutoLabor(preview: AutoLaborPreview): ExpertLearningSourceRow[] {
  return preview.rows.map((r) => {
    const row: ExpertLearningSourceRow = {
      partName: r.partName,
      operationType: r.operationType ?? 'belirsiz',
      salvagePrice: r.salvagePrice ?? null,
      originalPrice: r.originalPrice ?? null,
      laborDistribution: distributionFromExisting(preview.columns, r.oldByColumn),
      reasoning: r.reason
    };
    if (r.group) row.partGroup = r.group;
    if (r.partCode) row.partCode = r.partCode;
    return row;
  });
}

export interface ExpertLearningPreviewResult {
  items: ExpertLearningPreviewItem[];
  skipped: string[];
}

function warningFor(critical: boolean, row: ExpertLearningSourceRow, confidence: string): string {
  if (critical) return 'Güvenlik/kritik parça: dağıtım örnek alınabilir ama otomatik güçlü öneri verilmez; eksper kontrolü gerekir.';
  if (row.operationType === 'belirsiz') return 'İşlem türü belirsiz; öğrenme düşük güvenle alınır, kontrol gerekli.';
  if (confidence === 'low') return 'Düşük güven (parça kodu/işlem türü eksik veya zayıf); onaylamadan önce kontrol edin.';
  return '';
}

/** Eksper satırlarını onay önizlemesine çevirir (kayıt adayları onaysız/pasif). */
export function buildExpertLearningPreview(
  rows: readonly ExpertLearningSourceRow[],
  vehicle: LaborVehicleContext = {},
  existing: readonly ExpertApprovedLaborLearningEntry[] = [],
  now = new Date().toISOString()
): ExpertLearningPreviewResult {
  const { entries, skipped } = extractExpertLearningEntries(rows, vehicle, now);
  const items: ExpertLearningPreviewItem[] = [];
  let ei = 0;
  for (const row of rows) {
    const name = (row.partName || '').trim();
    if (!name || distributionTotal(row.laborDistribution) <= 0) continue;
    const entry = entries[ei++];
    if (!entry) continue;
    const critical = isCriticalSafetyPart(name, row.partGroup);
    const duplicateEntry = findDuplicateExpertEntry(entry, existing);
    const duplicate = duplicateEntry !== null;
    const needsReview = entry.confidence === 'low' || row.operationType === 'belirsiz' || critical || duplicate;
    const item: ExpertLearningPreviewItem = {
      partName: name,
      operationType: row.operationType,
      salvagePrice: row.salvagePrice,
      originalPrice: row.originalPrice,
      laborDistribution: { ...row.laborDistribution },
      derivedEntry: entry,
      confidence: entry.confidence,
      needsReview,
      warning: duplicate ? 'Aktif store’da aynı kayıt zaten var; otomatik eklenmez (gerekirse tek tek onaylayın).' : warningFor(critical, row, entry.confidence),
      duplicate
    };
    if (row.partCode && row.partCode.trim()) item.partCode = row.partCode.trim();
    if (row.partGroup && row.partGroup.trim()) item.partGroup = row.partGroup.trim();
    if (duplicateEntry) item.duplicateOfId = duplicateEntry.id;
    items.push(item);
  }
  return { items, skipped };
}

/**
 * "Tüm Güvenli Satırları Onayla" seçimi: yalnız yüksek güven + işlem türü net + dağıtım dolu +
 * kritik değil + duplicate değil + fiyat bandı bilinen satırların id'lerini döner. Diğerleri tek tek seçilir.
 */
export function selectSafeExpertPreviewItems(items: readonly ExpertLearningPreviewItem[]): string[] {
  return items
    .filter((it) =>
      it.confidence === 'high' &&
      it.operationType !== 'belirsiz' &&
      !it.needsReview &&
      it.duplicate !== true &&
      it.salvagePrice != null &&
      distributionTotal(it.laborDistribution) > 0)
    .map((it) => it.derivedEntry.id);
}
