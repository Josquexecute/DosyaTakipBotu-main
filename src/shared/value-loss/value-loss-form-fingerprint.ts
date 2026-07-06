/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v8: değer kaybı form verisi PARMAK İZİ (fingerprint) — SAF.
 *
 * Hesabı etkileyen girdilerden DETERMİNİSTİK, kararlı bir parmak izi üretir; kayıtlı özetin form
 * verisiyle aynı "veri sürümüne" ait olup olmadığını karşılaştırmak için kullanılır. Rastgele/
 * zaman damgası YOK; `calculationSnapshot`/`calculationSnapshotHistory`/UI kimlikleri HARİÇ.
 * Harici bağımlılık YOK (küçük saf hash); hiçbir yere yazmaz.
 */
import type { ValueLossContext } from './value-loss-context-types';
import { normalizeValueLossPartName } from './value-loss-part-coefficients';

export const VALUE_LOSS_FINGERPRINT_VERSION = 1 as const;

export interface ValueLossFingerprintInfo {
  fingerprint: string;
  sourceVersion: 1;
  includedFields: string[];
}

/** Deterministik küçük hash (cyrb53); harici bağımlılık gerektirmez. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** undefined/null → sabit sentinel; sayı/bool/string olduğu gibi (kararlı serileştirme için). */
function canon(value: unknown): unknown {
  return value === undefined || value === null ? '∅' : value;
}

/** Hesabı etkileyen alanların FIXED sıralı kanonik dizisi (nesne anahtar sırasından bağımsız). */
function canonicalFields(vl: ValueLossContext): Array<[string, unknown]> {
  const v = vl.vehicle ?? {};
  const h = vl.history ?? {};
  const d = vl.damage ?? {};
  const m = vl.marketAnalysis ?? {};
  const e = vl.evidence ?? {};
  return [
    ['fileType', canon(vl.fileType)],
    ['assignmentDate', canon(vl.assignmentDate)],
    ['reportWillIncludeValueLoss', canon(vl.reportWillIncludeValueLoss)],
    ['v.modelYear', canon(v.modelYear)],
    ['v.mileageKm', canon(v.mileageKm)],
    ['v.workingHours', canon(v.workingHours)],
    ['v.marketValue', canon(v.marketValue)],
    ['v.vehicleGroup', canon(v.vehicleGroup)],
    ['v.vehicleType', canon(v.vehicleType)],
    ['v.commercialOrRental', canon(v.commercialOrRental)],
    ['v.foreignPlate', canon(v.foreignPlate)],
    ['v.antiqueOrCollectible', canon(v.antiqueOrCollectible)],
    ['v.isCabrioOrConvertible', canon(v.isCabrioOrConvertible)],
    ['h.sbmPastDamageCount', canon(h.sbmPastDamageCount)],
    ['h.hasPriorHeavyDamage', canon(h.hasPriorHeavyDamage)],
    ['h.hasPriorSamePartDamage', canon(h.hasPriorSamePartDamage)],
    ['d.damageDate', canon(d.damageDate)],
    ['d.isTotalLossOrHeavyDamage', canon(d.isTotalLossOrHeavyDamage)],
    ['d.damageAmount', canon(d.damageAmount)],
    ['d.hasStructuralParts', canon(d.hasStructuralParts)],
    ['d.hasSemiStructuralParts', canon(d.hasSemiStructuralParts)],
    ['d.hasCosmeticParts', canon(d.hasCosmeticParts)],
    ['d.hasAccessoryParts', canon(d.hasAccessoryParts)],
    ['m.comparableListingCount', canon(m.comparableListingCount)],
    ['m.listingsWithinLast30Days', canon(m.listingsWithinLast30Days)],
    ['m.listingNumbersVisible', canon(m.listingNumbersVisible)],
    ['m.screenshotsTaken', canon(m.screenshotsTaken)],
    ['m.kmModelEquipmentComparable', canon(m.kmModelEquipmentComparable)],
    ['m.outliersExcluded', canon(m.outliersExcluded)],
    ['m.bargainingRealityExplained', canon(m.bargainingRealityExplained)],
    ['e.calculationModuleOutputExists', canon(e.calculationModuleOutputExists)],
    ['e.methodExplainedInReport', canon(e.methodExplainedInReport)],
    ['parts', canonicalParts(vl)]
  ];
}

/** Parçaları hesap-anlamlı alanlarla kanonik tuple'lara çevirir ve DETERMİNİSTİK sıralar (UI id HARİÇ). */
function canonicalParts(vl: ValueLossContext): string[] {
  const parts = vl.damage?.structuredParts ?? [];
  return parts
    .map((p) => [
      p.operation,
      normalizeValueLossPartName(p.partName),
      canon(p.repair?.severity),
      canon(p.repair?.laborAmount),
      canon(p.repair?.newPartPrice),
      canon(p.repair?.laborToNewPartRatio),
      canon(p.paint?.type)
    ].join('|'))
    .sort();
}

/** Değer kaybı form verisinin deterministik parmak izini üretir (v1-<hash>). */
export function createValueLossFormFingerprint(vl: ValueLossContext): string {
  const canonical = JSON.stringify(canonicalFields(vl));
  return `v${VALUE_LOSS_FINGERPRINT_VERSION}-${cyrb53(canonical).toString(36)}`;
}

/** Parmak izi + kapsam bilgisini döner (UI/denetim için). */
export function describeValueLossFormFingerprint(vl: ValueLossContext): ValueLossFingerprintInfo {
  return {
    fingerprint: createValueLossFormFingerprint(vl),
    sourceVersion: VALUE_LOSS_FINGERPRINT_VERSION,
    includedFields: canonicalFields(vl).map(([k]) => k)
  };
}

/** Kompakt, insan-okur girdi özeti (özet içinde saklanır; ham veri/dosya yolu YOK). */
export function buildValueLossInputSummary(vl: ValueLossContext): string[] {
  const out: string[] = [];
  const v = vl.vehicle ?? {};
  if (vl.fileType) out.push(`Dosya türü: ${vl.fileType}`);
  if (typeof v.marketValue === 'number') out.push(`Rayiç: ${v.marketValue.toLocaleString('tr-TR')} TL`);
  if (v.vehicleGroup && v.vehicleGroup !== 'unknown') out.push(`Grup: ${v.vehicleGroup}`);
  if (v.vehicleType && v.vehicleType !== 'unknown') out.push(`Tür: ${v.vehicleType}`);
  if (typeof v.modelYear === 'number') out.push(`Model yılı: ${v.modelYear}`);
  if (typeof v.mileageKm === 'number') out.push(`KM: ${v.mileageKm.toLocaleString('tr-TR')}`);
  else if (typeof v.workingHours === 'number') out.push(`Çalışma saati: ${v.workingHours.toLocaleString('tr-TR')}`);
  if (typeof vl.damage?.damageAmount === 'number') out.push(`Hasar tutarı: ${vl.damage.damageAmount.toLocaleString('tr-TR')} TL`);
  const partCount = vl.damage?.structuredParts?.length ?? 0;
  if (partCount > 0) out.push(`Parça satırı: ${partCount}`);
  return out.slice(0, 10);
}
