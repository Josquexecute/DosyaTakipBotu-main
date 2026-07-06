/**
 * v0.6.x — Değer Kaybı Ek Bilgi Formu ↔ ValueLossContext eşlemesi (renderer glue, SALT-OKUNUR).
 *
 * Form UI bellekte tutulur; yalnız kullanıcı "Kaydet" onayı verince main tarafına gönderilir.
 * Prefill önceliği: kayıtlı valueLoss > dosya/araç bağlamı > boş (uydurma yok). Ağ/IPC yok.
 */
import type { CaseIndexItem } from '../../../shared/types';
import type { AiCaseContext } from '../selectors/ai-case-context';
import type { ValueLossContext, ValueLossContextInput, ValueLossVehicleType } from '../../../shared/value-loss/value-loss-context-types';
import type { ValueLossPartItem, ValueLossPartOperation } from '../../../shared/value-loss/value-loss-part-input-types';
import { parseNonNegativeNumber } from '../../../shared/value-loss/value-loss-context-normalizer';

/** v4: Parça satırı form durumu (UI bellek; string alanlar). */
export interface ValueLossPartFormRow {
  id: string;
  operation: ValueLossPartOperation;
  partName: string;
  laborAmount: string;
  newPartPrice: string;
  paintType: 'TAM' | 'LOKAL' | 'belirsiz';
}

/** Yeni boş parça satırı (benzersiz id ile). */
export function emptyValueLossPartRow(seq: number): ValueLossPartFormRow {
  return { id: `p${Date.now().toString(36)}-${seq}`, operation: 'changed', partName: '', laborAmount: '', newPartPrice: '', paintType: 'belirsiz' };
}

/** Kayıtlı yapılandırılmış parçaları form satırlarına açar. */
export function savedToValueLossPartRows(saved: ValueLossContext | null | undefined): ValueLossPartFormRow[] {
  return (saved?.damage?.structuredParts ?? []).map((p, i) => ({
    id: p.id || `p-saved-${i}`,
    operation: p.operation,
    partName: p.partName,
    laborAmount: typeof p.repair?.laborAmount === 'number' ? String(p.repair.laborAmount) : '',
    newPartPrice: typeof p.repair?.newPartPrice === 'number' ? String(p.repair.newPartPrice) : '',
    paintType: p.paint?.type === 'TAM' || p.paint?.type === 'LOKAL' ? p.paint.type : 'belirsiz'
  }));
}

/** Form satırlarını kayıt girdisine çevirir (adı boş satırlar gönderilmez; ayrıştırma yok). */
export function partRowsToInput(rows: readonly ValueLossPartFormRow[]): ValueLossPartItem[] {
  return rows
    .filter((r) => r.partName.trim().length > 0)
    .map((r) => ({
      id: r.id,
      operation: r.operation,
      partName: r.partName.trim(),
      warnings: [],
      ...(r.operation === 'repaired' ? {
        repair: cleanObj<ValueLossPartItem['repair'] & object>({
          laborAmount: parseNonNegativeNumber(r.laborAmount),
          newPartPrice: parseNonNegativeNumber(r.newPartPrice)
        })
      } : {}),
      ...(r.operation === 'painted' ? { paint: { type: r.paintType === 'belirsiz' ? 'unknown' as const : r.paintType } } : {})
    }));
}

export type VlTri = 'evet' | 'hayir' | 'belirsiz';
export type VlFileType = 'trafik' | 'kasko' | 'belirsiz';
export type VlGroup = 'A' | 'B' | 'C' | 'Ç' | 'D' | 'E' | 'F' | 'belirsiz';

/** Form durumu: tüm alanlar UI dostu (string/tri); kalıcı yazma yalnız onaylı kayıtla. */
export interface ValueLossForm {
  fileType: VlFileType;
  assignmentDate: string;
  reportWillIncludeValueLoss: VlTri;
  brandModel: string;
  modelYear: string;
  mileageKm: string;
  workingHours: string;
  marketValue: string;
  vehicleGroup: VlGroup;
  /** v5: araç türü (OTOBÜS 0.5 çarpanı vb. için; kullanıcı seçer). */
  vehicleType: ValueLossVehicleType;
  commercialOrRental: VlTri;
  foreignPlate: VlTri;
  antiqueOrCollectible: VlTri;
  /** v6: cabrio / üstü açılır araç (esaslar 3.7 yönlendirmesi). */
  isCabrioOrConvertible: VlTri;
  sbmPastDamageCount: string;
  hasPriorHeavyDamage: VlTri;
  hasPriorSamePartDamage: VlTri;
  historyNotes: string;
  isTotalLossOrHeavyDamage: VlTri;
  /** v4: değer kaybına esas hasar (onarım) tutarı (TL, metin girişi). */
  damageAmount: string;
  /** v5: hasar tarihi (yaş katsayısı kaynağı). */
  damageDate: string;
  changedPartsText: string;
  repairedPartsText: string;
  paintedPartsText: string;
  hasStructuralParts: VlTri;
  hasSemiStructuralParts: VlTri;
  hasCosmeticParts: VlTri;
  hasAccessoryParts: VlTri;
  paintTypeKnown: VlTri;
  repairLaborKnown: VlTri;
  newPartPriceKnown: VlTri;
  comparableListingCount: string;
  listingsWithinLast30Days: VlTri;
  listingNumbersVisible: VlTri;
  screenshotsTaken: VlTri;
  kmModelEquipmentComparable: VlTri;
  outliersExcluded: VlTri;
  bargainingRealityExplained: VlTri;
  calculationModuleOutputExists: VlTri;
  marketScreenshotsExist: VlTri;
  damagePhotosExist: VlTri;
  repairPartEvidenceExists: VlTri;
  methodExplainedInReport: VlTri;
  digitalArchiveReady: VlTri;
  notes: string;
}

function tri(value: boolean | undefined): VlTri {
  return value === true ? 'evet' : value === false ? 'hayir' : 'belirsiz';
}
function triBack(value: VlTri): boolean | undefined {
  return value === 'evet' ? true : value === 'hayir' ? false : undefined;
}
function numStr(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

/** Boş form (dosya seçili değil / kayıtlı veri yok). */
export function emptyValueLossForm(): ValueLossForm {
  return {
    fileType: 'belirsiz', assignmentDate: '', reportWillIncludeValueLoss: 'belirsiz',
    brandModel: '', modelYear: '', mileageKm: '', workingHours: '', marketValue: '', vehicleGroup: 'belirsiz', vehicleType: 'unknown',
    commercialOrRental: 'belirsiz', foreignPlate: 'belirsiz', antiqueOrCollectible: 'belirsiz', isCabrioOrConvertible: 'belirsiz',
    sbmPastDamageCount: '', hasPriorHeavyDamage: 'belirsiz', hasPriorSamePartDamage: 'belirsiz', historyNotes: '',
    isTotalLossOrHeavyDamage: 'belirsiz', damageAmount: '', damageDate: '', changedPartsText: '', repairedPartsText: '', paintedPartsText: '',
    hasStructuralParts: 'belirsiz', hasSemiStructuralParts: 'belirsiz', hasCosmeticParts: 'belirsiz', hasAccessoryParts: 'belirsiz',
    paintTypeKnown: 'belirsiz', repairLaborKnown: 'belirsiz', newPartPriceKnown: 'belirsiz',
    comparableListingCount: '', listingsWithinLast30Days: 'belirsiz', listingNumbersVisible: 'belirsiz',
    screenshotsTaken: 'belirsiz', kmModelEquipmentComparable: 'belirsiz', outliersExcluded: 'belirsiz',
    bargainingRealityExplained: 'belirsiz',
    calculationModuleOutputExists: 'belirsiz', marketScreenshotsExist: 'belirsiz', damagePhotosExist: 'belirsiz',
    repairPartEvidenceExists: 'belirsiz', methodExplainedInReport: 'belirsiz', digitalArchiveReady: 'belirsiz',
    notes: ''
  };
}

/** Kayıtlı ValueLossContext'i form alanlarına açar. */
export function savedToValueLossForm(saved: ValueLossContext | null | undefined): ValueLossForm {
  const f = emptyValueLossForm();
  if (!saved) return f;
  if (saved.fileType === 'trafik' || saved.fileType === 'kasko') f.fileType = saved.fileType;
  f.assignmentDate = saved.assignmentDate ?? '';
  f.reportWillIncludeValueLoss = tri(saved.reportWillIncludeValueLoss);
  const v = saved.vehicle;
  f.brandModel = v?.brandModel ?? '';
  f.modelYear = numStr(v?.modelYear);
  f.mileageKm = numStr(v?.mileageKm);
  f.workingHours = numStr(v?.workingHours);
  f.marketValue = numStr(v?.marketValue);
  if (v?.vehicleGroup && v.vehicleGroup !== 'unknown') f.vehicleGroup = v.vehicleGroup;
  f.vehicleType = v?.vehicleType ?? 'unknown';
  f.commercialOrRental = tri(v?.commercialOrRental);
  f.foreignPlate = tri(v?.foreignPlate);
  f.antiqueOrCollectible = tri(v?.antiqueOrCollectible);
  f.isCabrioOrConvertible = tri(v?.isCabrioOrConvertible);
  const h = saved.history;
  f.sbmPastDamageCount = numStr(h?.sbmPastDamageCount);
  f.hasPriorHeavyDamage = tri(h?.hasPriorHeavyDamage);
  f.hasPriorSamePartDamage = tri(h?.hasPriorSamePartDamage);
  f.historyNotes = h?.notes ?? '';
  const d = saved.damage;
  f.isTotalLossOrHeavyDamage = tri(d?.isTotalLossOrHeavyDamage);
  f.damageAmount = numStr(d?.damageAmount);
  f.damageDate = d?.damageDate ?? '';
  f.changedPartsText = d?.changedPartsText ?? '';
  f.repairedPartsText = d?.repairedPartsText ?? '';
  f.paintedPartsText = d?.paintedPartsText ?? '';
  f.hasStructuralParts = tri(d?.hasStructuralParts);
  f.hasSemiStructuralParts = tri(d?.hasSemiStructuralParts);
  f.hasCosmeticParts = tri(d?.hasCosmeticParts);
  f.hasAccessoryParts = tri(d?.hasAccessoryParts);
  f.paintTypeKnown = tri(d?.paintTypeKnown);
  f.repairLaborKnown = tri(d?.repairLaborKnown);
  f.newPartPriceKnown = tri(d?.newPartPriceKnown);
  const m = saved.marketAnalysis;
  f.comparableListingCount = numStr(m?.comparableListingCount);
  f.listingsWithinLast30Days = tri(m?.listingsWithinLast30Days);
  f.listingNumbersVisible = tri(m?.listingNumbersVisible);
  f.screenshotsTaken = tri(m?.screenshotsTaken);
  f.kmModelEquipmentComparable = tri(m?.kmModelEquipmentComparable);
  f.outliersExcluded = tri(m?.outliersExcluded);
  f.bargainingRealityExplained = tri(m?.bargainingRealityExplained);
  const e = saved.evidence;
  f.calculationModuleOutputExists = tri(e?.calculationModuleOutputExists);
  f.marketScreenshotsExist = tri(e?.marketScreenshotsExist);
  f.damagePhotosExist = tri(e?.damagePhotosExist);
  f.repairPartEvidenceExists = tri(e?.repairPartEvidenceExists);
  f.methodExplainedInReport = tri(e?.methodExplainedInReport);
  f.digitalArchiveReady = tri(e?.digitalArchiveReady);
  f.notes = saved.notes ?? '';
  return f;
}

/** Kayıt yoksa BOŞ alanları dosya/araç bağlamından ön-doldurur (uydurma yok, sadece mevcut veri). */
function prefillFromCase(f: ValueLossForm, item: CaseIndexItem | null, ctx: AiCaseContext | null): void {
  if (!ctx) return;
  if (f.fileType === 'belirsiz') {
    if (ctx.sigortaTuru === 'trafik' || ctx.sigortaTuru === 'ihtiyari-mali-sorumluluk') f.fileType = 'trafik';
    else if (ctx.sigortaTuru === 'kasko') f.fileType = 'kasko';
  }
  if (!f.assignmentDate && ctx.appointmentDate) f.assignmentDate = ctx.appointmentDate;
  if (!f.marketValue && typeof ctx.marketValue === 'number' && ctx.marketValue > 0) f.marketValue = String(ctx.marketValue);
  if (f.isTotalLossOrHeavyDamage === 'belirsiz') {
    if (ctx.isHeavyDamage === true || ctx.isTotalLoss === true) f.isTotalLossOrHeavyDamage = 'evet';
    else if (ctx.isHeavyDamage === false && ctx.isTotalLoss === false) f.isTotalLossOrHeavyDamage = 'hayir';
  }
  const vc = item?.tracking?.vehicleContext;
  if (!f.brandModel && vc && (vc.make || vc.model)) f.brandModel = [vc.make, vc.model].filter(Boolean).join(' ').trim();
  if (!f.modelYear && vc?.modelYear) f.modelYear = vc.modelYear;
}

/** Dosya için form kurar: kayıtlı valueLoss > dosya/araç bağlamı > boş. */
export function buildValueLossFormForCase(item: CaseIndexItem | null, ctx: AiCaseContext | null): ValueLossForm {
  const f = savedToValueLossForm(item?.tracking?.aiHelperContext?.valueLoss ?? null);
  prefillFromCase(f, item, ctx);
  return f;
}

/** undefined değerli anahtarları ayıklar (IPC girdisi temiz kalır; tip strict uyumlu). */
function cleanObj<T extends object>(raw: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/**
 * v6: Normal form kaydı/önizlemesi için KORUNACAK özet alanları — özet ve geçmişi yalnız kendi
 * onaylı aksiyonlarıyla değişir; form kaydı bunları girdiye aynen taşır (silme/ezme yok).
 */
export function preservedSnapshotFields(saved: ValueLossContext | null | undefined): Partial<ValueLossContextInput> {
  return {
    ...(saved?.calculationSnapshot ? { calculationSnapshot: saved.calculationSnapshot } : {}),
    ...(saved?.calculationSnapshotHistory ? { calculationSnapshotHistory: saved.calculationSnapshotHistory } : {})
  };
}

/** Form değerlerini kaydetme/önizleme girdisine çevirir ('belirsiz'/boş alanlar gönderilmez). */
export function valueLossFormToInput(f: ValueLossForm, partRows?: readonly ValueLossPartFormRow[]): ValueLossContextInput {
  const structuredParts = partRows ? partRowsToInput(partRows) : [];
  return cleanObj<ValueLossContextInput>({
    ...(f.fileType !== 'belirsiz' ? { fileType: f.fileType } : {}),
    ...(f.assignmentDate.trim() ? { assignmentDate: f.assignmentDate.trim() } : {}),
    reportWillIncludeValueLoss: triBack(f.reportWillIncludeValueLoss),
    vehicle: cleanObj({
      brandModel: f.brandModel.trim() || undefined,
      modelYear: parseNonNegativeNumber(f.modelYear),
      mileageKm: parseNonNegativeNumber(f.mileageKm),
      workingHours: parseNonNegativeNumber(f.workingHours),
      marketValue: parseNonNegativeNumber(f.marketValue),
      ...(f.vehicleGroup !== 'belirsiz' ? { vehicleGroup: f.vehicleGroup } : {}),
      ...(f.vehicleType !== 'unknown' ? { vehicleType: f.vehicleType } : {}),
      commercialOrRental: triBack(f.commercialOrRental),
      foreignPlate: triBack(f.foreignPlate),
      antiqueOrCollectible: triBack(f.antiqueOrCollectible),
      isCabrioOrConvertible: triBack(f.isCabrioOrConvertible)
    }),
    history: cleanObj({
      sbmPastDamageCount: parseNonNegativeNumber(f.sbmPastDamageCount),
      hasPriorHeavyDamage: triBack(f.hasPriorHeavyDamage),
      hasPriorSamePartDamage: triBack(f.hasPriorSamePartDamage),
      notes: f.historyNotes.trim() || undefined
    }),
    damage: cleanObj({
      isTotalLossOrHeavyDamage: triBack(f.isTotalLossOrHeavyDamage),
      damageAmount: parseNonNegativeNumber(f.damageAmount),
      damageDate: f.damageDate.trim() || undefined,
      structuredParts: structuredParts.length > 0 ? structuredParts : undefined,
      changedPartsText: f.changedPartsText.trim() || undefined,
      repairedPartsText: f.repairedPartsText.trim() || undefined,
      paintedPartsText: f.paintedPartsText.trim() || undefined,
      hasStructuralParts: triBack(f.hasStructuralParts),
      hasSemiStructuralParts: triBack(f.hasSemiStructuralParts),
      hasCosmeticParts: triBack(f.hasCosmeticParts),
      hasAccessoryParts: triBack(f.hasAccessoryParts),
      paintTypeKnown: triBack(f.paintTypeKnown),
      repairLaborKnown: triBack(f.repairLaborKnown),
      newPartPriceKnown: triBack(f.newPartPriceKnown)
    }),
    marketAnalysis: cleanObj({
      comparableListingCount: parseNonNegativeNumber(f.comparableListingCount),
      listingsWithinLast30Days: triBack(f.listingsWithinLast30Days),
      listingNumbersVisible: triBack(f.listingNumbersVisible),
      screenshotsTaken: triBack(f.screenshotsTaken),
      kmModelEquipmentComparable: triBack(f.kmModelEquipmentComparable),
      outliersExcluded: triBack(f.outliersExcluded),
      bargainingRealityExplained: triBack(f.bargainingRealityExplained)
    }),
    evidence: cleanObj({
      calculationModuleOutputExists: triBack(f.calculationModuleOutputExists),
      marketScreenshotsExist: triBack(f.marketScreenshotsExist),
      damagePhotosExist: triBack(f.damagePhotosExist),
      repairPartEvidenceExists: triBack(f.repairPartEvidenceExists),
      methodExplainedInReport: triBack(f.methodExplainedInReport),
      digitalArchiveReady: triBack(f.digitalArchiveReady)
    }),
    notes: f.notes.trim() || undefined
  });
}
