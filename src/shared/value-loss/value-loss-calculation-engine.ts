/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v3: Reel Piyasa Analiz ÖN HESAP motoru (SAF, preview-only).
 *
 * Kaynak metodoloji: SEİK "Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1" formül yapısı:
 *   ön hesap = rayiç × yaş katsayısı × kullanılmışlık katsayısı × (1 + genel etkiler) × hasar katsayısı × grup çarpanı
 *   hasar katsayısı = (Σ parça katsayıları + hasar/rayiç oranı(%) × 0.1) / 100 ; üst sınır rayiç × 0.3.
 * Veri/katsayı eksikse TUTAR ÜRETİLMEZ (uydurma yok). Sonuç bağlayıcı bir hüküm değildir; yalnız
 * ön değerlendirmedir ve hiçbir yere otomatik yazılmaz. Serbest metin parça listesinden katsayı TÜRETİLMEZ.
 */
import type { ValueLossContext } from './value-loss-context-types';
import type {
  ValueLossCalculationFactor, ValueLossCalculationResult, ValueLossCoefficientProvider, ValueLossPartDamageData
} from './value-loss-calculation-types';
import { findRangeCoefficient, getMileageTableForGroup, isNearLowerBound } from './value-loss-coefficients';
import { roundValueLossAmount } from './value-loss-rounding';
import { VALUE_LOSS_CALC_DISCLAIMER, buildFormulaSummary, calcFactor, formatCalcAmount } from './value-loss-calculation-explain';
import { isDateOnOrAfterEffective, VALUE_LOSS_EFFECTIVE_DATE } from './value-loss-requirement-rules';
import { splitPartsText } from './value-loss-context-apply';
import type { ValueLossPartsResolution } from './value-loss-part-input-types';
import { resolveStructuredParts } from './value-loss-part-resolver';

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const iso = /^(\d{4})-/.exec(value.trim());
  if (iso) return Number(iso[1]);
  const tr = /^\d{1,2}[./]\d{1,2}[./](\d{4})/.exec(value.trim());
  return tr ? Number(tr[1]) : null;
}

interface EngineState {
  factors: ValueLossCalculationFactor[];
  missingInputs: string[];
  warnings: string[];
  evidence: string[];
}

function baseResult(status: ValueLossCalculationResult['status'], s: EngineState, source: string, formulaSummary = ''): ValueLossCalculationResult {
  return {
    status, formulaSummary, factors: s.factors, missingInputs: s.missingInputs,
    warnings: s.warnings, evidence: s.evidence, coefficientSource: source, disclaimer: VALUE_LOSS_CALC_DISCLAIMER
  };
}

/** Bloklayıcı durumları değerlendirir; dönen değer varsa hesap yapılmaz. */
function checkBlockers(vl: ValueLossContext, s: EngineState): 'cannot_calculate' | 'control_needed' | null {
  let out: 'cannot_calculate' | 'control_needed' | null = null;
  if (vl.fileType === 'kasko') {
    s.factors.push(calcFactor('blk-kasko', 'Dosya türü', 'blocking', 'Kasko dosyası: değer kaybı ön hesabı trafik/ZMSS kapsamındadır; bu dosyada uygulanmaz.', 'Kasko'));
    return 'cannot_calculate';
  }
  const after = isDateOnOrAfterEffective(vl.assignmentDate);
  if (after === false) {
    s.factors.push(calcFactor('blk-tarih', 'Atama tarihi', 'blocking', `Tarih ${VALUE_LOSS_EFFECTIVE_DATE} öncesi: yeni dönem modül kapsamında ön hesap yapılmaz.`, vl.assignmentDate ?? ''));
    return 'cannot_calculate';
  }
  if (vl.damage?.isTotalLossOrHeavyDamage === true) {
    s.factors.push(calcFactor('blk-agir', 'Ağır/tam hasar', 'blocking', 'Uygulama esasları 3.16: incelenen kazada tam/ağır hasar tespit edilen araç için değer kaybı hesaplaması yapılmaz; eksper kontrolü gerekir.', true));
    out = 'control_needed';
  }
  if (vl.history?.hasPriorHeavyDamage === true) {
    s.factors.push(calcFactor('blk-gecmis-agir', 'Kaza öncesi ağır hasar', 'blocking', 'Uygulama esasları 3.16: kaza öncesi ağır hasarlı araçta değer kaybı hesaplanmaz; kontrol gerekir.', true));
    out = 'control_needed';
  }
  if (vl.vehicle?.antiqueOrCollectible === true) {
    s.factors.push(calcFactor('blk-antika', 'Antika/koleksiyon araç', 'blocking', 'Uygulama esasları 3.11: antika/koleksiyon araçların hesabı referans modülle yapılmaz.', true));
    out = 'control_needed';
  }
  const d = vl.damage;
  const hasClassInfo = d?.hasStructuralParts === true || d?.hasSemiStructuralParts === true || d?.hasCosmeticParts === true;
  if (d?.hasAccessoryParts === true && !hasClassInfo) {
    s.factors.push(calcFactor('blk-aksesuar', 'Aksesuar ağırlıklı hasar', 'blocking', 'Uygulama esasları 3.12: aksesuar parçalar hesaba dahil edilmez; hasar aksesuar ağırlıklı görünüyor, kontrol gerekir.', true));
    out = 'control_needed';
  }
  // v5: araç türü OTOBÜS ise grup B olmalı; uyumsuz veri ile çarpan KÖRÜ KÖRÜNE uygulanmaz.
  const vg = vl.vehicle?.vehicleGroup;
  if (vl.vehicle?.vehicleType === 'bus' && vg && vg !== 'unknown' && vg !== 'B') {
    s.factors.push(calcFactor('blk-otobus-grup', 'Araç türü/grup uyumu', 'blocking', `Araç türü OTOBÜS seçildi ancak araç grubu ${vg}; kaynak modülde OTOBÜS B grubundadır. Tutarsız veri, eksper kontrolü gerekir.`, vg));
    out = 'control_needed';
  }
  return out;
}

const MISSING_PARTS_MSG = 'Yapılandırılmış parça listesi ve hasar tutarı (parça katsayısına esas veri)';
const MISSING_DAMAGE_AMOUNT_MSG = 'Hasar (onarım) tutarı';

/** Zorunlu girdileri toplar; eksik listesi döner (hepsi listelenir). */
function collectMissing(vl: ValueLossContext, groups: readonly string[], partInfo: { hasEffective: boolean; partsPresent: boolean; damageAmountPresent: boolean }, s: EngineState): void {
  if (vl.fileType !== 'trafik') s.missingInputs.push('Dosya türü (trafik/ZMSS teyidi)');
  if (isDateOnOrAfterEffective(vl.assignmentDate) === null) s.missingInputs.push('Atama tarihi (01.07.2026 eşiği için)');
  const v = vl.vehicle;
  if (!(typeof v?.marketValue === 'number' && v.marketValue > 0)) s.missingInputs.push('Araç rayiç bedeli');
  if (!v?.vehicleGroup || v.vehicleGroup === 'unknown' || !groups.includes(v.vehicleGroup)) s.missingInputs.push('Araç grubu (A–F)');
  if (typeof v?.modelYear !== 'number') s.missingInputs.push('Model yılı');
  if (typeof v?.mileageKm !== 'number' && typeof v?.workingHours !== 'number') s.missingInputs.push('Kilometre / çalışma saati');
  if (typeof vl.history?.sbmPastDamageCount !== 'number') s.missingInputs.push('SBM geçmiş hasar adedi');
  if (vl.damage?.isTotalLossOrHeavyDamage === undefined) s.missingInputs.push('Ağır/tam hasar durumu (evet/hayır)');
  const hasParts = splitPartsText(vl.damage?.changedPartsText).length > 0
    || splitPartsText(vl.damage?.repairedPartsText).length > 0
    || splitPartsText(vl.damage?.paintedPartsText).length > 0
    || partInfo.partsPresent;
  if (!hasParts) s.missingInputs.push('Değişen/onarılan/boyanan parça bilgisi');
  const emsal = vl.marketAnalysis?.comparableListingCount;
  if (!(typeof emsal === 'number' && emsal >= 3)) s.missingInputs.push('En az 3 emsal ilan / piyasa analizi bilgisi');
  if (!partInfo.hasEffective && !partInfo.partsPresent) s.missingInputs.push(MISSING_PARTS_MSG);
  if (partInfo.partsPresent && !partInfo.damageAmountPresent) s.missingInputs.push(MISSING_DAMAGE_AMOUNT_MSG);
}

/** Piyasa analizi kalite kontrolleri: bloklamaz, uyarı üretir; sağlananlar evidence olur. */
function marketQuality(vl: ValueLossContext, s: EngineState): void {
  const m = vl.marketAnalysis;
  if (typeof m?.comparableListingCount === 'number') s.evidence.push(`Emsal ilan sayısı: ${m.comparableListingCount}`);
  if (m?.screenshotsTaken === true) s.evidence.push('Emsal ilan ekran görüntüleri alındı');
  if (m?.listingNumbersVisible === true) s.evidence.push('İlan numaraları görünür durumda');
  if (typeof vl.history?.sbmPastDamageCount === 'number') s.evidence.push(`SBM geçmiş hasar adedi: ${vl.history.sbmPastDamageCount}`);
  if (m?.listingsWithinLast30Days !== true) s.warnings.push('Emsal ilanların son 30 güne ait olduğu teyit edilmedi (esaslar 3.23).');
  if (m?.outliersExcluded !== true) s.warnings.push('Aşırı düşük/yüksek ilanların dışlandığı işaretlenmedi.');
  if (m?.kmModelEquipmentComparable !== true) s.warnings.push('Emsal ilanların km/model/donanım benzerliği işaretlenmedi.');
  if (m?.bargainingRealityExplained !== true) s.warnings.push('Pazarlık payı / piyasa gerçekliği gerekçesi işaretlenmedi.');
  if (vl.evidence?.methodExplainedInReport !== true) s.warnings.push('Yöntemin raporda açıklanacağı işaretlenmedi.');
  if (vl.evidence?.calculationModuleOutputExists !== true) s.warnings.push('Resmî hesap modülü çıktısının dosyada bulunması gerekir; ön hesap modül çıktısının yerine geçmez.');
}

/**
 * Reel piyasa analiz ÖN HESABI. Katsayı seti yoksa veya zorunlu veri eksikse tutar üretmez.
 * partData: yapılandırılmış parça/hasar verisi (v3 formunda yoktur; verilmezse control_needed).
 */
export function calculateValueLoss(
  vl: ValueLossContext | null | undefined,
  provider: ValueLossCoefficientProvider,
  partData?: ValueLossPartDamageData
): ValueLossCalculationResult {
  const s: EngineState = { factors: [], missingInputs: [], warnings: [], evidence: [] };

  if (provider.status !== 'ready') {
    s.missingInputs.push('Hesap katsayı tabloları (resmî modül seti)');
    s.warnings.push('Katsayı tabloları yüklenmediği için tutarlı ön hesap yapılamadı.');
    return baseResult('cannot_calculate', s, `Katsayı seti yüklenmedi: ${provider.reason}`);
  }
  const set = provider.set;
  const source = set.source;

  if (!vl) {
    collectMissing({ version: 1 }, set.vehicleGroups, { hasEffective: !!partData, partsPresent: false, damageAmountPresent: false }, s);
    return baseResult('cannot_calculate', s, source);
  }

  const blocked = checkBlockers(vl, s);
  if (blocked === 'cannot_calculate') return baseResult('cannot_calculate', s, source);

  // v4: açık partData verilmemişse yapılandırılmış parça satırlarından türet (serbest metin ASLA).
  const structuredParts = vl.damage?.structuredParts;
  const partsPresent = (structuredParts?.length ?? 0) > 0;
  const damageAmount = vl.damage?.damageAmount;
  const damageAmountPresent = typeof damageAmount === 'number' && damageAmount > 0;
  let effectivePartData = partData;
  let partsResolution: ValueLossPartsResolution | null = null;
  if (!effectivePartData && partsPresent) {
    partsResolution = resolveStructuredParts(structuredParts, vl.vehicle?.vehicleGroup);
    if (partsResolution.allResolved && damageAmountPresent) {
      effectivePartData = { totalPartCoefficient: partsResolution.totalCoefficient!, damageAmount: damageAmount! };
    }
  }

  collectMissing(vl, set.vehicleGroups, { hasEffective: !!effectivePartData, partsPresent, damageAmountPresent }, s);
  marketQuality(vl, s);
  if (blocked === 'control_needed') return baseResult('control_needed', s, source);
  if (s.missingInputs.length > 0) {
    // Yalnız parça verisine ilişkin eksiklerde kontrol; diğer eksiklerde hesap yapılamaz.
    const onlyPartRelated = s.missingInputs.every((m) => m === MISSING_PARTS_MSG || m === MISSING_DAMAGE_AMOUNT_MSG);
    if (partsResolution) s.warnings.push(...partsResolution.warnings);
    return baseResult(onlyPartRelated ? 'control_needed' : 'cannot_calculate', s, source);
  }
  // v4: parça satırları var ama bazı katsayılar çözülemedi → tutar üretilmez, kontrol gerekir.
  if (!effectivePartData && partsResolution) {
    s.warnings.push(...partsResolution.warnings);
    for (const item of partsResolution.items) s.warnings.push(...item.warnings);
    return baseResult('control_needed', s, source);
  }
  // v4: hasar tutarı rayici aşıyorsa sonuç güvenilmez → kontrol gerekir.
  if (effectivePartData && typeof vl.vehicle?.marketValue === 'number' && effectivePartData.damageAmount > vl.vehicle.marketValue) {
    s.warnings.push('Hasar (onarım) tutarı araç rayiç bedelini aşıyor; veri tutarsız görünüyor, eksper kontrolü gerekir.');
    return baseResult('control_needed', s, source);
  }

  // --- Hesap (tüm girdiler mevcut) ---
  const v = vl.vehicle!;
  const marketValue = v.marketValue!;
  const group = v.vehicleGroup!;
  const usage = typeof v.mileageKm === 'number' ? v.mileageKm : v.workingHours!;
  const table = getMileageTableForGroup(set, group);
  if (!table) {
    s.missingInputs.push(`Araç grubu (${group}) kullanılmışlık tablosu`);
    return baseResult('cannot_calculate', s, source);
  }

  // v5: yaş kaynağı önceliği HASAR tarihi (kaynak modül B27: YEAR(hasar tarihi) − model yılı);
  // yoksa atama tarihi yılı (mevcut davranış). Zorunluluk eşiği atama tarihine bağlı KALIR.
  const damageDateRaw = vl.damage?.damageDate;
  const damageYear = parseYear(damageDateRaw);
  if (damageDateRaw && damageYear === null) {
    s.warnings.push('Hasar tarihi okunamadı; yaş katsayısı atama tarihi yılına göre hesaplandı, tarih biçimini kontrol edin.');
  }
  const year = damageYear ?? parseYear(vl.assignmentDate);
  const ageSource = damageYear !== null ? 'hasar tarihi' : 'atama tarihi';
  const age = Math.max(0, (year ?? new Date().getFullYear()) - v.modelYear!);
  const ageCoef = findRangeCoefficient(set.ageCoefficients, age) ?? 1;
  const usageCoef = findRangeCoefficient(table.ranges, usage) ?? 1;

  const fx = set.generalEffects;
  const commercial = v.commercialOrRental === true ? fx.commercialOrRental : 0;
  const sbmCount = vl.history!.sbmPastDamageCount!;
  const sbm = sbmCount === 0 ? 0 : sbmCount <= 5 ? sbmCount * fx.sbmPerClaim : fx.sbmFloor;
  const proximity = isNearLowerBound(table, usage, fx.proximityThreshold) ? fx.mileageLowerBoundProximity : 0;
  const effects = commercial + sbm + proximity;

  const pd = effectivePartData!;
  const damageRatioPercent = (pd.damageAmount / marketValue) * 100;
  const damageCoef = (pd.totalPartCoefficient + damageRatioPercent * set.damageRatioWeight) / 100;
  // v5: grup çarpanı (F→2.5) + araç TÜRÜ çarpanı: B grubunda kullanıcı 'OTOBÜS' seçtiyse 0.5.
  let multiplier = set.groupMultipliers[group] ?? 1;
  let multiplierNote = multiplier !== 1 ? `Kaynak modül ${group} grubunda ${multiplier} çarpanı uygular.` : 'Grup çarpanı uygulanmadı (1).';
  const vehicleType = v.vehicleType ?? 'unknown';
  if (group === 'B') {
    const busMultiplier = set.vehicleTypeMultipliers?.['bus'];
    if (vehicleType === 'bus' && typeof busMultiplier === 'number') {
      multiplier = busMultiplier;
      multiplierNote = `Araç türü OTOBÜS: kaynak modül ${busMultiplier} çarpanı uygular (Tablolar V6 bloğu).`;
    } else if (vehicleType === 'unknown') {
      s.warnings.push('B grubunda OTOBÜS araç türü için kaynak modül 0,5 çarpanı uygular; araç türü seçilmediğinden çarpan 1 alındı, eksper kontrolü gerekir.');
    }
    // Minibüs/diğer bilinen türlerde çarpan 1 (kaynak yalnız OTOBÜS için 0.5 tanımlar).
  }

  let amount = marketValue * ageCoef * usageCoef * (1 + effects) * damageCoef * multiplier;
  if (amount < 0) amount = 0;

  // v4: yapılandırılmış parça katkıları kalem kalem faktör olarak listelenir (kaynak satırıyla).
  if (partsResolution) {
    const opTr: Record<string, string> = { changed: 'Değişen', repaired: 'Onarılan', painted: 'Boyanan' };
    const sevTr: Record<string, string> = { light: 'hafif', medium: 'orta', heavy: 'ağır', unknown: 'bilinmiyor' };
    for (const item of partsResolution.items) {
      const detail = item.operation === 'repaired'
        ? ` — onarım ağırlığı: ${sevTr[item.repair?.severity ?? 'unknown']}${item.repair?.laborToNewPartRatio !== undefined ? ` (oran ${item.repair.laborToNewPartRatio})` : ''}`
        : item.operation === 'painted' ? ` — boya: ${item.paint?.type ?? 'bilinmiyor'}` : '';
      s.factors.push(calcFactor(`part-${item.id}`, `${item.partName} (${opTr[item.operation]})`, 'increase', `SEİK parça katsayısı${detail}. Kaynak: ${item.coefficientSource ?? ''}`, item.partName, item.coefficient));
    }
    s.evidence.push(`Parça katsayıları: SEİK Tablolar!B34:L295 aralığından (${partsResolution.resolvedCount} satır çözüldü; satır referansları faktör tablosunda).`);
  }

  s.factors.push(
    calcFactor('rayic', 'Araç rayiç bedeli', 'info', 'Hesabın baz değeri (kaza öncesi hasarsız piyasa rayici).', formatCalcAmount(marketValue)),
    calcFactor('yas', 'Yaş katsayısı', ageCoef < 1 ? 'decrease' : 'neutral', `Araç yaşı ${age} (${ageSource} yılına göre) için tablo katsayısı.`, age, ageCoef),
    calcFactor('kullanim', table.unit === 'saat' ? 'Çalışma saati katsayısı' : 'Kilometre katsayısı', usageCoef < 1 ? 'decrease' : 'neutral', `Kullanılmışlık (${usage.toLocaleString('tr-TR')} ${table.unit}) için tablo katsayısı.`, usage, usageCoef),
    calcFactor('ticari', 'Ticari/kiralık kullanım', commercial < 0 ? 'decrease' : 'neutral', commercial < 0 ? 'Ticari/kiralık araçlarda düşürücü etki uygulanır.' : 'Ticari/kiralık kullanım işaretlenmedi; etki uygulanmadı.', v.commercialOrRental === true, commercial),
    calcFactor('sbm', 'SBM geçmiş hasar etkisi', sbm < 0 ? 'decrease' : 'neutral', sbm < 0 ? `Geçmiş ${sbmCount} hasar kaydı için düşürücü etki (taban ${fx.sbmFloor}).` : 'SBM geçmiş hasar kaydı yok; etki uygulanmadı.', sbmCount, sbm),
    calcFactor('km-yakinlik', 'Alt sınıra yakınlık', proximity > 0 ? 'increase' : 'neutral', proximity > 0 ? 'Kullanılmışlık değeri tablo alt sınırına ≤1.000 birim yakın; artırıcı etki uygulandı (esaslar 3.5).' : 'Alt sınır yakınlığı yok.', usage, proximity),
    calcFactor('hasar', 'Hasar/parça katsayısı', 'increase', `(Σ parça katsayıları ${pd.totalPartCoefficient} + hasar/rayiç %${damageRatioPercent.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} × ${set.damageRatioWeight}) / 100.`, formatCalcAmount(pd.damageAmount), damageCoef),
    calcFactor('grup', 'Araç grubu/türü çarpanı', multiplier > 1 ? 'increase' : multiplier < 1 ? 'decrease' : 'neutral', multiplierNote, group, multiplier)
  );

  const capRatio = set.capMarketValueRatio;
  let capApplied = false;
  let maxAllowed: number | undefined;
  if (typeof capRatio === 'number') {
    maxAllowed = marketValue * capRatio;
    if (amount > maxAllowed) {
      s.factors.push(calcFactor('cap', 'Üst sınır (cap)', 'decrease', `Ön hesap ${formatCalcAmount(amount)} rayiç bedelin %${capRatio * 100} üst sınırını aştığından ${formatCalcAmount(maxAllowed)} ile sınırlandı.`, formatCalcAmount(amount), capRatio));
      amount = maxAllowed;
      capApplied = true;
    }
  } else {
    s.warnings.push('Üst sınır katsayısı yüklenmediği için cap uygulanmadı.');
  }

  const rounded = roundValueLossAmount(amount, set.roundingStep) ?? amount;
  s.evidence.push(`Yuvarlama: ${set.roundingStep} TL katına yukarı yönlü (esaslar 3.21) — ${formatCalcAmount(amount)} → ${formatCalcAmount(rounded)}.`);
  s.evidence.push(`Katsayı kaynağı: ${source}`);

  const formulaSummary = buildFormulaSummary([
    { label: 'rayiç bedel' }, { label: 'yaş katsayısı', coefficient: ageCoef },
    { label: table.unit === 'saat' ? 'çalışma saati katsayısı' : 'km katsayısı', coefficient: usageCoef },
    { label: '(1 + genel etkiler)', coefficient: 1 + effects },
    { label: 'hasar katsayısı', coefficient: damageCoef },
    ...(multiplier !== 1 ? [{ label: 'grup çarpanı', coefficient: multiplier }] : [])
  ]);

  const result = baseResult('calculated', s, source, formulaSummary);
  result.amount = amount;
  result.roundedAmount = rounded;
  result.capInfo = {
    capApplied,
    ...(maxAllowed !== undefined ? { maxAllowedAmount: maxAllowed } : {}),
    ...(capApplied ? { reason: `Rayiç bedelin %${(capRatio ?? 0) * 100} üst sınırı uygulandı.` } : {})
  };
  return result;
}
