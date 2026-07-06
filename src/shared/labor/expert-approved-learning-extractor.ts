/**
 * v0.6.x — AI İşçilik v3.1: Eksper onaylı Excel satırlarından YEREL öğrenme kaydı çıkarımı (SAF).
 * Çıkarım kullanıcı onayına ADAYDIR: approvedByUser=false, isActive=false başlar; Excel'e hiçbir şey yazılmaz.
 */
import { normalizeSearch } from '../turkish';
import { extractChassisPrefix, extractEngineCode, normalizeVehicleModel } from './labor-vehicle-context-normalizer';
import type { LaborVehicleContext } from './labor-vehicle-context';
import type {
  ExpertApprovedLaborLearningEntry,
  ExpertLearningConfidence,
  ExpertLearningSourceRow,
  LaborDistribution
} from './expert-approved-learning-types';

/** Sahiplenme/Orijinal bedeli kaba banda indirger (eşleşme için; kesin tutar saklanmaz). */
export function priceBand(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return 'bilinmiyor';
  if (n < 1000) return '0-1K';
  if (n < 5000) return '1K-5K';
  if (n < 15000) return '5K-15K';
  if (n < 30000) return '15K-30K';
  return '30K+';
}

function stableHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) { h = (h * 31 + input.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

export function distributionTotal(d: LaborDistribution): number {
  return d.kaporta + d.mekanik + d.elektrik + d.dosemeKilit + d.cam + d.boya + d.onarim;
}

function deriveConfidence(row: ExpertLearningSourceRow): ExpertLearningConfidence {
  const hasDist = distributionTotal(row.laborDistribution) > 0;
  if (!hasDist || row.operationType === 'belirsiz') return 'low';
  if (row.partCode && row.partCode.trim()) return 'high';
  return 'medium';
}

export interface ExtractResult {
  entries: ExpertApprovedLaborLearningEntry[];
  /** Boş dağıtım vb. nedeniyle öğrenilemeyen satırlar (parça adı listesi). */
  skipped: string[];
}

/**
 * Eksper satırlarından öğrenme kaydı adayları çıkarır. Boş dağıtımlı satırlar atlanır (skipped).
 * Tüm kayıtlar onaysız/pasif başlar; çağıran taraf önizleme + kullanıcı onayıyla store'a ekler.
 */
export function extractExpertLearningEntries(
  rows: readonly ExpertLearningSourceRow[],
  vehicle: LaborVehicleContext = {},
  now = new Date().toISOString()
): ExtractResult {
  const entries: ExpertApprovedLaborLearningEntry[] = [];
  const skipped: string[] = [];

  rows.forEach((row, index) => {
    const name = (row.partName || '').trim();
    if (!name || distributionTotal(row.laborDistribution) <= 0) {
      if (name) skipped.push(name);
      return;
    }
    const sig = normalizeSearch([row.partCode, name, row.operationType, String(index)].filter(Boolean).join('|'));
    const entry: ExpertApprovedLaborLearningEntry = {
      id: `exp-${stableHash(sig)}`,
      source: 'expert_approved_excel',
      partName: name,
      operationType: row.operationType,
      laborDistribution: { ...row.laborDistribution },
      reasoning: (row.reasoning || 'Eksper onaylı dosyadan çıkarılan dağıtım.').trim(),
      confidence: deriveConfidence(row),
      approvedByUser: false,
      isActive: false,
      createdAt: now
    };
    if (row.partGroup && row.partGroup.trim()) entry.partGroup = row.partGroup.trim();
    if (row.partCode && row.partCode.trim()) entry.partCode = row.partCode.trim();
    entry.salvagePriceBand = priceBand(row.salvagePrice);
    entry.originalPriceBand = priceBand(row.originalPrice);
    if (vehicle.vehicleModel) entry.vehicleModel = normalizeVehicleModel(vehicle.vehicleModel);
    if (typeof vehicle.modelYear === 'number') entry.modelYear = vehicle.modelYear;
    const chassisPrefix = vehicle.chassisPrefix || extractChassisPrefix(vehicle.chassisNo);
    if (chassisPrefix) entry.chassisPrefix = chassisPrefix;
    const engineCode = vehicle.engineCode || extractEngineCode(vehicle.engineNo);
    if (engineCode) entry.engineCode = engineCode;
    entries.push(entry);
  });

  return { entries, skipped };
}
