/**
 * v0.6.x — AI İşçilik v3.1/v3.3: Eksper onaylı öğrenme eşleştirici (SAF; öneri yalnız önizleme/evidence).
 * v3.3: araç bağlamı (model / şasi öneki / motor kodu) skora katılır. Araç bağlamı ÇELİŞİRSE control-needed.
 * İşlem türü farklı / fiyat bandı çok uzak / kritik parça → control-needed. Inactive/onaysız kayıt kullanılmaz.
 */
import { normalizeSearch } from '../turkish';
import { laborNameSimilarity } from '../labor-learning-dictionary';
import { priceBand } from './expert-approved-learning-extractor';
import { normalizeVehicleModel } from './labor-vehicle-context-normalizer';
import type {
  ExpertApprovedLaborLearningEntry,
  ExpertLearningMatch,
  ExpertLearningMatchLevel,
  ExpertLearningQuery,
  PriceBandMatch,
  VehicleFieldMatch
} from './expert-approved-learning-types';

const BAND_ORDER = ['0-1K', '1K-5K', '5K-15K', '15K-30K', '30K+'];
const LEVEL_TR: Record<string, string> = { strong: 'güçlü', medium: 'orta', low: 'düşük' };
const LEVEL_RANK: Record<ExpertLearningMatchLevel, number> = { strong: 4, medium: 3, low: 2, 'control-needed': 1, none: 0 };

const sameCode = (a?: string, b?: string): boolean => Boolean(a && b && normalizeSearch(a) === normalizeSearch(b));

function comparePriceBand(salvagePrice: number | null | undefined, entryBand?: string): PriceBandMatch {
  if (salvagePrice == null || !entryBand || entryBand === 'bilinmiyor') return 'missing';
  const ia = BAND_ORDER.indexOf(priceBand(salvagePrice));
  const ib = BAND_ORDER.indexOf(entryBand);
  if (ia < 0 || ib < 0) return 'missing';
  const diff = Math.abs(ia - ib);
  return diff === 0 ? 'same' : diff === 1 ? 'near' : 'far';
}

function compareModel(a?: string, b?: string): VehicleFieldMatch {
  const na = normalizeVehicleModel(a);
  const nb = normalizeVehicleModel(b);
  if (!na || !nb) return 'missing';
  if (na === nb) return 'same';
  if (na.includes(nb) || nb.includes(na)) return 'similar';
  const ta = new Set(na.split(' ').filter(Boolean));
  return nb.split(' ').filter(Boolean).some((t) => ta.has(t)) ? 'similar' : 'conflict';
}

function compareField(a?: string, b?: string): VehicleFieldMatch {
  if (!a || !b) return 'missing';
  return a.trim().toUpperCase() === b.trim().toUpperCase() ? 'same' : 'conflict';
}

interface Scored {
  level: ExpertLearningMatchLevel;
  entry: ExpertApprovedLaborLearningEntry;
  identity: number;
  reasons: string[];
  warnings: string[];
  vehicleMatch: { model: VehicleFieldMatch; chassisPrefix: VehicleFieldMatch; engineCode: VehicleFieldMatch };
  priceBandMatch: PriceBandMatch;
}

function scorePair(query: ExpertLearningQuery, e: ExpertApprovedLaborLearningEntry): Scored | null {
  const codeMatch = sameCode(query.partCode, e.partCode);
  const opMatch = query.operationType !== 'belirsiz' && query.operationType === e.operationType;
  const nameSim = laborNameSimilarity(query.partName, e.partName);
  const groupMatch = Boolean(query.partGroup && e.partGroup && normalizeSearch(query.partGroup) === normalizeSearch(e.partGroup));
  const identity = (codeMatch ? 3 : 0) + (nameSim >= 0.7 ? 2 : nameSim >= 0.4 ? 1 : 0) + (groupMatch ? 1 : 0);
  if (identity === 0) return null;

  const model = compareModel(query.vehicleModel, e.vehicleModel);
  const chassisPrefix = compareField(query.chassisPrefix, e.chassisPrefix);
  const engineCode = compareField(query.engineCode, e.engineCode);
  const priceBandMatch = comparePriceBand(query.salvagePrice, e.salvagePriceBand);
  const priceFar = priceBandMatch === 'far';
  const vehicleConflict = model === 'conflict' || chassisPrefix === 'conflict' || engineCode === 'conflict';

  const reasons: string[] = [];
  if (codeMatch) reasons.push('Aynı parça kodu');
  if (opMatch) reasons.push('Aynı işlem türü');
  if (model === 'same') reasons.push('Araç modeli uyumlu'); else if (model === 'similar') reasons.push('Araç modeli benzer');
  if (chassisPrefix === 'same') reasons.push('Şasi öneki uyumlu');
  if (engineCode === 'same') reasons.push('Motor kodu uyumlu');
  if (priceBandMatch === 'same' || priceBandMatch === 'near') reasons.push('Fiyat bandı yakın');

  const warnings: string[] = [];
  if (codeMatch && !opMatch) warnings.push('İşlem türü farklı');
  if (priceFar) warnings.push('Fiyat bandı uzak');
  if (query.critical) warnings.push('Güvenlik/kritik parça');
  if (vehicleConflict) warnings.push('Araç bağlamı çelişiyor');
  if (model === 'missing' && chassisPrefix === 'missing' && engineCode === 'missing') warnings.push('Araç bağlamı bulunamadı');

  const blocked = (codeMatch && !opMatch) || (priceFar && identity >= 2) || query.critical === true || vehicleConflict;
  let level: ExpertLearningMatchLevel;
  if (blocked) level = 'control-needed';
  else if (codeMatch && opMatch) level = 'strong';
  else if ((nameSim >= 0.7 || groupMatch) && opMatch) level = 'medium';
  else level = 'low';

  return { level, entry: e, identity, reasons, warnings, vehicleMatch: { model, chassisPrefix, engineCode }, priceBandMatch };
}

function buildReason(s: Scored): string {
  const head = 'Eksper onaylı geçmiş dağıtım örneği bulundu';
  if (s.level === 'control-needed') {
    return `${head}; ${s.warnings.join(', ') || 'uyum sınırda'}. Kullanıcı onayı olmadan uygulanmaz, kontrol gerekli.`;
  }
  const tail = s.reasons.length ? ` — ${s.reasons.join(', ')}.` : '.';
  const warn = s.warnings.length ? ` Uyarı: ${s.warnings.join(', ')}.` : '';
  return `${head} (eşleşme: ${LEVEL_TR[s.level] ?? s.level})${tail}${warn}`;
}

/** Sorguya en güçlü uygulanabilir eksper örneğini bulur (yoksa level='none'); açıklama alanlarını doldurur. */
export function matchExpertLearning(
  query: ExpertLearningQuery,
  entries: readonly ExpertApprovedLaborLearningEntry[]
): ExpertLearningMatch {
  let best: Scored | null = null;
  for (const e of entries) {
    if (!e.isActive || !e.approvedByUser) continue;
    const scored = scorePair(query, e);
    if (!scored) continue;
    if (!best || (scored.identity * 10 + LEVEL_RANK[scored.level]) > (best.identity * 10 + LEVEL_RANK[best.level])) best = scored;
  }
  if (!best) return { level: 'none', entry: null, reason: '' };
  return {
    level: best.level,
    entry: best.entry,
    reason: buildReason(best),
    reasons: best.reasons,
    warnings: best.warnings,
    vehicleMatch: best.vehicleMatch,
    priceBandMatch: best.priceBandMatch
  };
}
