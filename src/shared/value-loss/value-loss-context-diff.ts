/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v2: ValueLossContext SAF diff (kaydetme önizlemesi).
 *
 * Eski ve yeni bağlam arasındaki değişen alanları Türkçe etiketli "eski → yeni" satırları olarak
 * verir. version/updatedAt karşılaştırılmaz. Ağ/dosya/electron yok; hiçbir yere yazmaz.
 */
import type { ValueLossContext, ValueLossCalculationSnapshot } from './value-loss-context-types';
import type { ValueLossPartItem } from './value-loss-part-input-types';
import { formatSnapshotLabel } from './value-loss-calculation-snapshot';

export interface ValueLossDiffRow {
  path: string;
  label: string;
  oldLabel: string;
  newLabel: string;
}

/** Kaydetme onayında gösterilen kapsam notu: yalnız tek alan hedeflenir. */
export const VALUE_LOSS_SAVE_SCOPE_NOTE = 'Bu işlem yalnızca aiHelperContext.valueLoss alanına yazacaktır.';

type Kind = 'text' | 'number' | 'money' | 'bool' | 'fileType' | 'group' | 'vehicleType';

const VEHICLE_TYPE_TR: Record<string, string> = {
  automobile: 'Otomobil', taxi: 'Taksi', minibus: 'Minibüs', bus: 'Otobüs', pickup: 'Kamyonet',
  truck: 'Kamyon', special_purpose: 'Özel amaçlı', tractor: 'Traktör', work_machine: 'İş makinesi',
  trailer: 'Römork', motorcycle: 'Motosiklet', unknown: 'Bilinmiyor'
};

/** Karşılaştırılan alanlar: nokta yolu → Türkçe etiket + biçim türü. */
const FIELDS: ReadonlyArray<[string, string, Kind]> = [
  ['fileType', 'Dosya türü', 'fileType'],
  ['assignmentDate', 'Atama tarihi', 'text'],
  ['reportWillIncludeValueLoss', 'Değer kaybı aynı raporda', 'bool'],
  ['vehicle.brandModel', 'Marka/model', 'text'],
  ['vehicle.modelYear', 'Model yılı', 'number'],
  ['vehicle.mileageKm', 'KM', 'number'],
  ['vehicle.workingHours', 'Çalışma saati', 'number'],
  ['vehicle.marketValue', 'Araç rayiç bedeli', 'money'],
  ['vehicle.vehicleGroup', 'Araç grubu', 'group'],
  ['vehicle.vehicleType', 'Araç türü', 'vehicleType'],
  ['vehicle.commercialOrRental', 'Ticari/kiralık', 'bool'],
  ['vehicle.foreignPlate', 'Yabancı plaka', 'bool'],
  ['vehicle.antiqueOrCollectible', 'Antika/koleksiyon', 'bool'],
  ['vehicle.isCabrioOrConvertible', 'Cabrio / üstü açılır araç', 'bool'],
  ['history.sbmPastDamageCount', 'SBM geçmiş hasar adedi', 'number'],
  ['history.hasPriorHeavyDamage', 'Kaza öncesi ağır hasar', 'bool'],
  ['history.hasPriorSamePartDamage', 'Aynı parçada önceki hasar', 'bool'],
  ['history.notes', 'Geçmiş notu', 'text'],
  ['damage.isTotalLossOrHeavyDamage', 'Mevcut dosya ağır/tam hasar', 'bool'],
  ['damage.damageAmount', 'Hasar tutarı', 'money'],
  ['damage.damageDate', 'Hasar tarihi', 'text'],
  ['damage.changedPartsText', 'Değişen parçalar', 'text'],
  ['damage.repairedPartsText', 'Onarılan parçalar', 'text'],
  ['damage.paintedPartsText', 'Boyanan parçalar', 'text'],
  ['damage.hasStructuralParts', 'Yapısal parça', 'bool'],
  ['damage.hasSemiStructuralParts', 'Yarı yapısal parça', 'bool'],
  ['damage.hasCosmeticParts', 'Kozmetik parça', 'bool'],
  ['damage.hasAccessoryParts', 'Aksesuar parça', 'bool'],
  ['damage.paintTypeKnown', 'Boya türü belli', 'bool'],
  ['damage.repairLaborKnown', 'Onarım işçilik bedeli belli', 'bool'],
  ['damage.newPartPriceKnown', 'Yeni parça fiyatı belli', 'bool'],
  ['marketAnalysis.comparableListingCount', 'Emsal ilan sayısı', 'number'],
  ['marketAnalysis.listingsWithinLast30Days', 'İlanlar son 30 güne ait', 'bool'],
  ['marketAnalysis.listingNumbersVisible', 'İlan numaraları görünür', 'bool'],
  ['marketAnalysis.screenshotsTaken', 'Ekran görüntüsü alındı', 'bool'],
  ['marketAnalysis.kmModelEquipmentComparable', 'KM/model/donanım benzerliği', 'bool'],
  ['marketAnalysis.outliersExcluded', 'Aşırı ilanlar dışlandı', 'bool'],
  ['marketAnalysis.bargainingRealityExplained', 'Pazarlık/piyasa gerçekliği açıklandı', 'bool'],
  ['evidence.calculationModuleOutputExists', 'Hesap modülü çıktısı', 'bool'],
  ['evidence.marketScreenshotsExist', 'Piyasa ekran görüntüleri', 'bool'],
  ['evidence.damagePhotosExist', 'Hasar fotoğrafları', 'bool'],
  ['evidence.repairPartEvidenceExists', 'Parça/onarım gerekçesi', 'bool'],
  ['evidence.methodExplainedInReport', 'Yöntem raporda açıklandı', 'bool'],
  ['evidence.digitalArchiveReady', 'Dijital arşiv hazır', 'bool'],
  ['notes', 'Serbest not', 'text']
];

function readPath(obj: ValueLossContext | null | undefined, dotted: string): unknown {
  let cursor: unknown = obj ?? {};
  for (const part of dotted.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function formatValue(value: unknown, kind: Kind): string {
  if (value === undefined || value === null || value === '') return 'boş';
  if (kind === 'bool') return value === true ? 'evet' : 'hayır';
  if (kind === 'fileType') {
    const map: Record<string, string> = { trafik: 'Trafik/ZMSS', kasko: 'Kasko', unknown: 'Bilinmiyor' };
    return map[String(value)] ?? String(value);
  }
  if (kind === 'group') return value === 'unknown' ? 'Bilinmiyor' : String(value);
  if (kind === 'vehicleType') return VEHICLE_TYPE_TR[String(value)] ?? String(value);
  if (kind === 'money' && typeof value === 'number') return `${value.toLocaleString('tr-TR')} TL`;
  if (kind === 'number' && typeof value === 'number') return value.toLocaleString('tr-TR');
  return String(value);
}

const OP_TR: Record<string, string> = { changed: 'Değişen', repaired: 'Onarılan', painted: 'Boyanan' };
const SEV_TR: Record<string, string> = { light: 'hafif', medium: 'orta', heavy: 'ağır', unknown: 'bilinmiyor' };

/** v4: yapılandırılmış parça listesi değişikliklerini özetler (ekleme/silme + satır değişimleri). */
function diffStructuredParts(prev: readonly ValueLossPartItem[], next: readonly ValueLossPartItem[]): ValueLossDiffRow[] {
  const rows: ValueLossDiffRow[] = [];
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const nextById = new Map(next.map((p) => [p.id, p]));
  const added = next.filter((p) => !prevById.has(p.id)).length;
  const removed = prev.filter((p) => !nextById.has(p.id)).length;
  if (added > 0 || removed > 0) {
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} parça eklendi`);
    if (removed > 0) parts.push(`${removed} parça silindi`);
    rows.push({
      path: 'damage.structuredParts', label: 'Yapılandırılmış parça listesi',
      oldLabel: `${prev.length} parça`, newLabel: `${next.length} parça (${parts.join(', ')})`
    });
  }
  for (const p of prev) {
    const n = nextById.get(p.id);
    if (!n) continue;
    const base = `${n.partName} / ${OP_TR[n.operation] ?? n.operation}`;
    if (p.operation !== n.operation || p.partName !== n.partName) {
      rows.push({ path: `damage.structuredParts.${p.id}`, label: 'Parça satırı', oldLabel: `${p.partName} / ${OP_TR[p.operation] ?? p.operation}`, newLabel: base });
    }
    const ps = p.repair?.severity ?? 'unknown';
    const ns = n.repair?.severity ?? 'unknown';
    if (n.operation === 'repaired' && ps !== ns) {
      rows.push({ path: `damage.structuredParts.${p.id}.severity`, label: base, oldLabel: `ağırlık ${SEV_TR[ps] ?? ps}`, newLabel: `ağırlık ${SEV_TR[ns] ?? ns}` });
    }
    const pp = p.paint?.type ?? 'unknown';
    const np = n.paint?.type ?? 'unknown';
    if (n.operation === 'painted' && pp !== np) {
      rows.push({ path: `damage.structuredParts.${p.id}.paint`, label: base, oldLabel: pp === 'unknown' ? 'boya türü bilinmiyor' : `boya ${pp}`, newLabel: np === 'unknown' ? 'boya türü bilinmiyor' : `boya ${np}` });
    }
  }
  return rows;
}

/** v6: özet geçmişi diff'i — yalnız kayıt sayısı özeti (JSON dökümü YOK). */
function diffSnapshotHistory(prev: readonly { id: string }[] | undefined, next: readonly { id: string }[] | undefined): ValueLossDiffRow[] {
  const p = prev ?? [];
  const n = next ?? [];
  if (p.length === n.length && p.every((item, i) => item.id === n[i]?.id)) return [];
  const capNote = p.length === n.length && n.length > 0 ? ` (son ${n.length} kayıt korundu)` : '';
  return [{
    path: 'calculationSnapshotHistory', label: 'Ön hesap özeti geçmişi',
    oldLabel: `${p.length} kayıt`, newLabel: `${n.length} kayıt${capNote}`
  }];
}

/** v5: ön hesap özeti diff'i — JSON dökümü değil, kısa etiket + tarih satırları. */
function diffSnapshot(prev: ValueLossCalculationSnapshot | undefined, next: ValueLossCalculationSnapshot | undefined): ValueLossDiffRow[] {
  const rows: ValueLossDiffRow[] = [];
  const oldLabel = formatSnapshotLabel(prev);
  const newLabel = formatSnapshotLabel(next);
  if (oldLabel !== newLabel) rows.push({ path: 'calculationSnapshot', label: 'Ön hesap özeti', oldLabel, newLabel });
  const oldDate = prev?.createdAt || 'boş';
  const newDate = next?.createdAt || 'boş';
  if (oldDate !== newDate) rows.push({ path: 'calculationSnapshot.createdAt', label: 'Ön hesap özeti tarihi', oldLabel: oldDate, newLabel: newDate });
  // v8: veri sürümü (parmak izi) değişimi — yeni kayıt mı, güncelleme mi?
  if (next?.inputFingerprint && next.inputFingerprint !== prev?.inputFingerprint) {
    rows.push({
      path: 'calculationSnapshot.inputFingerprint', label: 'Ön hesap veri sürümü',
      oldLabel: prev?.inputFingerprint ? 'kayıtlı' : 'boş',
      newLabel: prev?.inputFingerprint ? 'güncellenecek' : 'yeni kayıt oluşturulacak'
    });
  }
  return rows;
}

/** İki değer kaybı bağlamı arasındaki değişen alanları verir; aynı veri diff üretmez. */
export function diffValueLossContext(previous: ValueLossContext | null | undefined, next: ValueLossContext): ValueLossDiffRow[] {
  const rows: ValueLossDiffRow[] = [];
  for (const [path, label, kind] of FIELDS) {
    const oldLabel = formatValue(readPath(previous, path), kind);
    const newLabel = formatValue(readPath(next, path), kind);
    if (oldLabel !== newLabel) rows.push({ path, label, oldLabel, newLabel });
  }
  rows.push(...diffStructuredParts(previous?.damage?.structuredParts ?? [], next.damage?.structuredParts ?? []));
  rows.push(...diffSnapshot(previous?.calculationSnapshot, next.calculationSnapshot));
  rows.push(...diffSnapshotHistory(previous?.calculationSnapshotHistory, next.calculationSnapshotHistory));
  return rows;
}

/** Kaydetme onay metni: değişen alan listesi + tek-alan kapsam notu + açık onay sorusu. */
export function buildValueLossSaveConfirmMessage(rows: readonly ValueLossDiffRow[]): string {
  const lines = rows.map((r) => `- ${r.label}: ${r.oldLabel} → ${r.newLabel}`).join('\n');
  return [
    'Değer Kaybı Ek Bilgi Formu kaydedilecek.',
    '',
    'Değişen alanlar:',
    lines,
    '',
    VALUE_LOSS_SAVE_SCOPE_NOTE,
    'Devam edilsin mi?'
  ].join('\n');
}
