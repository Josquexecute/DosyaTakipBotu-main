/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v2: ValueLossContext'i v1 değerlendirme girdilerine SAF uygular.
 *
 * Öncelik sırası: 1) kullanıcı onaylı/duzenlenen form verisi (ValueLossContext) 2) dosya bağlamından
 * gelen taban girdi 3) bilinmiyor. Taban girdideki mevcut bilgiler bozulmaz; yalnız form verisi
 * tanımlıysa üzerine yazar. Ağ/dosya/electron yok; tutar hesabı yapılmaz.
 */
import type { ValueLossContext } from './value-loss-context-types';
import type { ValueLossRequirementInput } from './value-loss-requirement-rules';
import type { ValueLossChecklistInput } from './value-loss-checklist';
import type { ValueLossExclusionInput } from './value-loss-exclusion-rules';
import type { ValueLossDraftFacts } from './value-loss-draft-builder';
import { isDateOnOrAfterEffective } from './value-loss-requirement-rules';
import { resolveStructuredParts } from './value-loss-part-resolver';
import { normalizeValueLossPartName } from './value-loss-part-coefficients';
import { evaluateSnapshotFreshness, evaluateHistoryFreshnessSummary } from './value-loss-snapshot-freshness';

/** Parça metnini listeye çevirir (virgül/noktalı virgül/yeni satır ayraçlı). */
export function splitPartsText(text: string | undefined): string[] {
  if (!text) return [];
  return text.split(/[,;\n]/).map((p) => p.trim()).filter((p) => p.length > 0);
}

function pick<T>(formValue: T | undefined, baseValue: T): T {
  return formValue === undefined ? baseValue : formValue;
}

function hasAnyPartsText(vl: ValueLossContext): boolean {
  return splitPartsText(vl.damage?.changedPartsText).length > 0
    || splitPartsText(vl.damage?.repairedPartsText).length > 0
    || splitPartsText(vl.damage?.paintedPartsText).length > 0
    || (vl.damage?.structuredParts?.length ?? 0) > 0;
}

function hasMarketReference(vl: ValueLossContext): boolean {
  const mv = vl.vehicle?.marketValue;
  const count = vl.marketAnalysis?.comparableListingCount;
  return (typeof mv === 'number' && mv > 0) || (typeof count === 'number' && count >= 3);
}

/** Zorunluluk girdisini form verisiyle güçlendirir (form > taban > bilinmiyor). */
export function applyValueLossContextToRequirementInput(
  vl: ValueLossContext | null | undefined,
  base: ValueLossRequirementInput
): ValueLossRequirementInput {
  if (!vl) return base;
  const out: ValueLossRequirementInput = { ...base };
  if (vl.fileType === 'trafik') out.sigortaTuru = 'trafik';
  else if (vl.fileType === 'kasko') out.sigortaTuru = 'kasko';
  if (vl.assignmentDate) out.assignmentDate = vl.assignmentDate;
  out.isHeavyDamage = pick(vl.damage?.isTotalLossOrHeavyDamage, base.isHeavyDamage ?? null);
  out.hasPastHeavyDamage = pick(vl.history?.hasPriorHeavyDamage, base.hasPastHeavyDamage ?? null);
  if (hasAnyPartsText(vl)) out.hasPartDamageInfo = true;
  if (hasMarketReference(vl)) out.hasMarketReference = true;
  return out;
}

/** Kontrol listesi girdisini form verisiyle güçlendirir; form alanı yoksa taban korunur. */
export function applyValueLossContextToChecklistInput(
  vl: ValueLossContext | null | undefined,
  base: ValueLossChecklistInput
): ValueLossChecklistInput {
  if (!vl) return base;
  const v = vl.vehicle;
  const h = vl.history;
  const d = vl.damage;
  const m = vl.marketAnalysis;
  const e = vl.evidence;
  const partClassKnown = d && (d.hasStructuralParts !== undefined || d.hasSemiStructuralParts !== undefined || d.hasCosmeticParts !== undefined)
    ? true
    : undefined;
  const out: ValueLossChecklistInput = { ...base };
  const assign = <K extends keyof ValueLossChecklistInput>(key: K, value: ValueLossChecklistInput[K] | undefined): void => {
    if (value !== undefined) out[key] = value;
  };
  // Dosya bilgisi
  if (vl.fileType === 'trafik') assign('isTrafikOrZmss', true);
  else if (vl.fileType === 'kasko') assign('isTrafikOrZmss', false);
  if (vl.assignmentDate) assign('assignmentAfterEffective', isDateOnOrAfterEffective(vl.assignmentDate));
  assign('sameReportForValueLoss', vl.reportWillIncludeValueLoss);
  // Araç bilgisi
  assign('brandModel', v?.brandModel);
  assign('modelYear', v?.modelYear);
  if (v?.mileageKm !== undefined) assign('km', v.mileageKm);
  else if (v?.workingHours !== undefined) assign('km', v.workingHours);
  assign('marketValue', v?.marketValue);
  if (v?.vehicleGroup && v.vehicleGroup !== 'unknown') assign('vehicleGroup', v.vehicleGroup);
  assign('commercialOrRental', v?.commercialOrRental);
  assign('sbmPastDamageCount', h?.sbmPastDamageCount);
  assign('hasPastHeavyDamage', h?.hasPriorHeavyDamage);
  // Hasar bilgisi
  const changed = splitPartsText(d?.changedPartsText);
  const repaired = splitPartsText(d?.repairedPartsText);
  const painted = splitPartsText(d?.paintedPartsText);
  if (changed.length > 0) assign('changedParts', changed);
  if (repaired.length > 0) assign('repairedParts', repaired);
  if (painted.length > 0) assign('paintedParts', painted);
  assign('paintScopeKnown', d?.paintTypeKnown);
  assign('laborCostKnown', d?.repairLaborKnown);
  assign('newPartPriceKnown', d?.newPartPriceKnown);
  assign('partStructuralClassKnown', partClassKnown);
  assign('samePartPreviousDamage', h?.hasPriorSamePartDamage);
  // Piyasa analizi
  assign('comparableListingCount', m?.comparableListingCount);
  assign('listingsWithin30Days', m?.listingsWithinLast30Days);
  assign('listingIdsVisible', m?.listingNumbersVisible);
  assign('marketScreenshotsTaken', m?.screenshotsTaken);
  assign('listingSimilarityJustified', m?.kmModelEquipmentComparable);
  assign('outliersExcluded', m?.outliersExcluded);
  assign('marketRealityJustified', m?.bargainingRealityExplained);
  // v4: yapılandırılmış parça hazırlığı (SEİK katsayı çözümü — render anında saf çözümleyiciyle)
  const parts = d?.structuredParts;
  if (parts && parts.length > 0) {
    const resolution = resolveStructuredParts(parts, v?.vehicleGroup);
    assign('structuredPartsCount', parts.length);
    assign('structuredPartsAllResolved', resolution.allResolved);
    assign('structuredSeverityAllKnown', parts.filter((p) => p.operation === 'repaired').every((p) => p.repair?.severity !== undefined && p.repair.severity !== 'unknown'));
    assign('structuredPaintAllKnown', parts.filter((p) => p.operation === 'painted').every((p) => p.paint?.type === 'TAM' || p.paint?.type === 'LOKAL'));
  }
  assign('damageAmountEntered', typeof d?.damageAmount === 'number' && d.damageAmount > 0 ? true : undefined);
  // v5: hasar tarihi / araç türü / B-otobüs netliği / opsiyonel özet kaydı
  assign('damageDateEntered', d?.damageDate ? true : undefined);
  if (v?.vehicleType !== undefined) assign('vehicleTypeKnown', v.vehicleType !== 'unknown');
  if (v?.vehicleGroup === 'B') assign('busMultiplierClear', v.vehicleType !== undefined && v.vehicleType !== 'unknown');
  assign('snapshotSaved', vl.calculationSnapshot ? true : undefined);
  // v6: cabrio bayrağı VEYA cabrio-özel satır varsa kontrol maddesi tetiklenir.
  // v6.1 sıkılaştırma: ad eşleşmesi guidance ile AYNI normalize üzerinden (boşluk sadeleştirmeli).
  const cabrioRows = (d?.structuredParts ?? []).some((p) => normalizeValueLossPartName(p.partName).includes('TİCARİ VE CABRİO'));
  if (v?.isCabrioOrConvertible === true || cabrioRows) assign('cabrioCheckNeeded', true);
  // v8: kayıtlı özet tazeliği (yalnız özet varken anlamlı; hesap/yazma yapmaz)
  if (vl.calculationSnapshot) assign('snapshotFreshness', evaluateSnapshotFreshness(vl).status);
  // v9: geçmiş kayıt tazelik özeti (yalnız geçmiş varken anlamlı; salt-okunur)
  if ((vl.calculationSnapshotHistory?.length ?? 0) > 0) {
    const hs = evaluateHistoryFreshnessSummary(vl);
    assign('historyFreshness', hs.stale + hs.unknown > 0 ? 'attention' : 'clean');
  }
  // Rapor / evidence
  assign('calcModuleOutput', e?.calculationModuleOutputExists);
  assign('reportMarketScreenshots', e?.marketScreenshotsExist);
  assign('photos', e?.damagePhotosExist);
  assign('partRepairReasons', e?.repairPartEvidenceExists);
  assign('methodExplainedInReport', e?.methodExplainedInReport);
  assign('dataStoredDigitally', e?.digitalArchiveReady);
  return out;
}

/** İstisna/uyarı girdisini form verisiyle güçlendirir. */
export function applyValueLossContextToExclusionInput(
  vl: ValueLossContext | null | undefined,
  base: ValueLossExclusionInput
): ValueLossExclusionInput {
  if (!vl) return base;
  return {
    ...base,
    isHeavyDamage: pick(vl.damage?.isTotalLossOrHeavyDamage, base.isHeavyDamage ?? null),
    hasPreAccidentHeavyDamage: pick(vl.history?.hasPriorHeavyDamage, base.hasPreAccidentHeavyDamage ?? null),
    samePartPreviouslyDamaged: pick(vl.history?.hasPriorSamePartDamage, base.samePartPreviouslyDamaged ?? null),
    weldedPartPreviouslyRepairedNowChanged: base.weldedPartPreviouslyRepairedNowChanged ?? null,
    isAntiqueOrCollector: pick(vl.vehicle?.antiqueOrCollectible, base.isAntiqueOrCollector ?? null),
    hasAccessoryParts: pick(vl.damage?.hasAccessoryParts, base.hasAccessoryParts ?? null),
    hasPlasticCosmeticParts: pick(vl.damage?.hasCosmeticParts, base.hasPlasticCosmeticParts ?? null)
  };
}

/** Taslak üretimi için form verisinden türetilen gerçekler (tutar üretilmez). */
export function draftFactsFromValueLossContext(vl: ValueLossContext | null | undefined): ValueLossDraftFacts {
  if (!vl) return {};
  const facts: ValueLossDraftFacts = {};
  if (typeof vl.vehicle?.marketValue === 'number' && vl.vehicle.marketValue > 0) facts.hasMarketValue = true;
  if (typeof vl.marketAnalysis?.comparableListingCount === 'number') facts.comparableListingCount = vl.marketAnalysis.comparableListingCount;
  if (typeof vl.history?.sbmPastDamageCount === 'number') facts.sbmChecked = true;
  if (vl.damage?.isTotalLossOrHeavyDamage === true || vl.history?.hasPriorHeavyDamage === true) facts.heavyDamage = true;
  if ((vl.damage?.structuredParts?.length ?? 0) > 0) facts.structuredPartsClassified = true;
  if (vl.vehicle?.vehicleType && vl.vehicle.vehicleType !== 'unknown' && vl.damage?.damageDate) facts.vehicleContextChecked = true;
  if (vl.calculationSnapshot) {
    facts.snapshotSaved = true;
    facts.snapshotStatus = vl.calculationSnapshot.status;
    facts.snapshotFreshness = evaluateSnapshotFreshness(vl).status;
    // v9: geçmişte eski/bilinmeyen kayıt varsa nitelik cümlesi (yalnız özet varken)
    const hs = evaluateHistoryFreshnessSummary(vl);
    if (hs.stale + hs.unknown > 0) facts.historyHasStaleOrUnknown = true;
  }
  return facts;
}
