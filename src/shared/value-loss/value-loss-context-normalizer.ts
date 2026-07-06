/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v2: ValueLossContext SAF normalize/sanitize.
 *
 * Yazma öncesi ve migrasyon sırasında alanları whitelist'ler: sayılar güvenli parse edilir
 * (negatif reddedilir), boolean'lar yalnız true/false kabul eder, enum'lar doğrulanır, metinler
 * kontrol karakterlerinden arındırılır. Ağ/dosya/electron yok; uydurma değer üretilmez.
 */
import type {
  ValueLossContext, ValueLossVehicleInfo, ValueLossHistoryInfo, ValueLossDamageInfo,
  ValueLossMarketAnalysisInfo, ValueLossEvidenceInfo, ValueLossFileType, ValueLossVehicleGroup,
  ValueLossVehicleType, ValueLossCalculationSnapshot, ValueLossCalculationSnapshotHistoryItem
} from './value-loss-context-types';
import { VALUE_LOSS_SNAPSHOT_HISTORY_LIMIT } from './value-loss-calculation-history';
import { VALUE_LOSS_CONTEXT_VERSION } from './value-loss-context-types';
import type { ValueLossPartItem, ValueLossPartOperation, ValueLossPaintType } from './value-loss-part-input-types';
import { classifyRepairSeverity } from './value-loss-part-severity';

const FILE_TYPES: ReadonlySet<ValueLossFileType> = new Set(['trafik', 'kasko', 'unknown']);
const VEHICLE_GROUPS: ReadonlySet<ValueLossVehicleGroup> = new Set(['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'unknown']);
const VEHICLE_TYPES: ReadonlySet<ValueLossVehicleType> = new Set([
  'automobile', 'taxi', 'minibus', 'bus', 'pickup', 'truck',
  'special_purpose', 'tractor', 'work_machine', 'trailer', 'motorcycle', 'unknown'
]);
const SNAPSHOT_STATUSES = new Set(['calculated', 'cannot_calculate', 'control_needed']);

/** Kontrol karakterlerini boşluğa çevirip kırpar; boşsa undefined. */
function safeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  let cleaned = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    cleaned += code < 32 || code === 127 ? ' ' : ch;
  }
  const trimmed = cleaned.trim().slice(0, max);
  return trimmed || undefined;
}

/** Yalnız true/false kabul eder; diğer her şey undefined (belirsiz) kalır. */
function safeBool(value: unknown): boolean | undefined {
  return value === true || value === false ? value : undefined;
}

/**
 * Sayıyı güvenli parse eder (Türkçe biçim destekli: "850.000" / "1.234,56").
 * Negatif/sonsuz/okunamayan değerler reddedilir (undefined).
 */
export function parseNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().replace(/\s|TL|₺/gi, '');
  if (!raw) return undefined;
  // Binlik nokta + ondalık virgül varsayımı (tr-TR): noktaları at, virgülü noktaya çevir.
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return undefined;
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? num : undefined;
}

/** Negatif olmayan tam sayı (adet alanları için). */
function safeCount(value: unknown): number | undefined {
  const n = parseNonNegativeNumber(value);
  return n === undefined ? undefined : Math.floor(n);
}

/** Model yılı: 1900-2100 arası tam sayı; aksi halde undefined. */
function safeModelYear(value: unknown): number | undefined {
  const n = parseNonNegativeNumber(value);
  if (n === undefined) return undefined;
  const year = Math.floor(n);
  return year >= 1900 && year <= 2100 ? year : undefined;
}

function setIf<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

/** En az bir tanımlı alanı olan nesneyi döner; tümü boşsa undefined (takip verisi şişmez). */
function compact<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

function normVehicle(value: unknown): ValueLossVehicleInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const out: ValueLossVehicleInfo = {};
  setIf(out, 'brandModel', safeText(o.brandModel, 120));
  setIf(out, 'modelYear', safeModelYear(o.modelYear));
  setIf(out, 'mileageKm', safeCount(o.mileageKm));
  setIf(out, 'workingHours', safeCount(o.workingHours));
  setIf(out, 'marketValue', parseNonNegativeNumber(o.marketValue));
  if (VEHICLE_GROUPS.has(o.vehicleGroup as ValueLossVehicleGroup)) out.vehicleGroup = o.vehicleGroup as ValueLossVehicleGroup;
  if (VEHICLE_TYPES.has(o.vehicleType as ValueLossVehicleType)) out.vehicleType = o.vehicleType as ValueLossVehicleType;
  setIf(out, 'commercialOrRental', safeBool(o.commercialOrRental));
  setIf(out, 'foreignPlate', safeBool(o.foreignPlate));
  setIf(out, 'antiqueOrCollectible', safeBool(o.antiqueOrCollectible));
  setIf(out, 'isCabrioOrConvertible', safeBool(o.isCabrioOrConvertible));
  return compact(out);
}

function normHistory(value: unknown): ValueLossHistoryInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const out: ValueLossHistoryInfo = {};
  setIf(out, 'sbmPastDamageCount', safeCount(o.sbmPastDamageCount));
  setIf(out, 'hasPriorHeavyDamage', safeBool(o.hasPriorHeavyDamage));
  setIf(out, 'hasPriorSamePartDamage', safeBool(o.hasPriorSamePartDamage));
  setIf(out, 'notes', safeText(o.notes, 500));
  return compact(out);
}

const DAMAGE_BOOL_KEYS = [
  'isTotalLossOrHeavyDamage', 'hasStructuralParts', 'hasSemiStructuralParts', 'hasCosmeticParts',
  'hasAccessoryParts', 'paintTypeKnown', 'repairLaborKnown', 'newPartPriceKnown'
] as const;

const PART_OPERATIONS: ReadonlySet<ValueLossPartOperation> = new Set(['changed', 'repaired', 'painted']);
const PAINT_TYPES: ReadonlySet<ValueLossPaintType> = new Set(['TAM', 'LOKAL', 'unknown']);
const MAX_STRUCTURED_PARTS = 100;

/** v4: tek parça satırını güvenli normalize eder; geçersiz işlem/boş ad → satır atılır (null). */
function normPartItem(value: unknown, index: number): ValueLossPartItem | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (!PART_OPERATIONS.has(o.operation as ValueLossPartOperation)) return null;
  const partName = safeText(o.partName, 80);
  if (!partName) return null;
  const operation = o.operation as ValueLossPartOperation;
  const id = safeText(o.id, 40) ?? `part-${index + 1}`;
  const out: ValueLossPartItem = { id, operation, partName, warnings: [] };
  if (operation === 'repaired') {
    const rSrc = (o.repair && typeof o.repair === 'object' ? o.repair : {}) as Record<string, unknown>;
    const laborAmount = parseNonNegativeNumber(rSrc.laborAmount);
    const newPartPrice = parseNonNegativeNumber(rSrc.newPartPrice);
    const sev = classifyRepairSeverity(laborAmount, newPartPrice);
    out.repair = {
      ...(laborAmount !== undefined ? { laborAmount } : {}),
      ...(newPartPrice !== undefined ? { newPartPrice } : {}),
      severity: sev.severity,
      ...(sev.laborToNewPartRatio !== undefined ? { laborToNewPartRatio: sev.laborToNewPartRatio } : {})
    };
    out.warnings.push(...sev.warnings);
  }
  if (operation === 'painted') {
    const pSrc = (o.paint && typeof o.paint === 'object' ? o.paint : {}) as Record<string, unknown>;
    const type = PAINT_TYPES.has(pSrc.type as ValueLossPaintType) ? (pSrc.type as ValueLossPaintType) : 'unknown';
    out.paint = { type };
  }
  return out;
}

function normStructuredParts(value: unknown): ValueLossPartItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ValueLossPartItem[] = [];
  for (let i = 0; i < value.length && out.length < MAX_STRUCTURED_PARTS; i++) {
    const item = normPartItem(value[i], i);
    if (item) out.push(item);
  }
  return out.length > 0 ? out : undefined;
}

function normDamage(value: unknown): ValueLossDamageInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const out: ValueLossDamageInfo = {};
  for (const key of DAMAGE_BOOL_KEYS) setIf(out, key, safeBool(o[key]));
  setIf(out, 'changedPartsText', safeText(o.changedPartsText, 500));
  setIf(out, 'repairedPartsText', safeText(o.repairedPartsText, 500));
  setIf(out, 'paintedPartsText', safeText(o.paintedPartsText, 500));
  setIf(out, 'structuredParts', normStructuredParts(o.structuredParts));
  setIf(out, 'damageAmount', parseNonNegativeNumber(o.damageAmount));
  setIf(out, 'damageDate', safeText(o.damageDate, 40));
  return compact(out);
}

/** v5: metin dizisini sınırlı sayı/uzunlukla normalize eder (özet kompakt kalır). */
function safeTextList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((v) => safeText(v, maxLen)).filter((v): v is string => v !== undefined);
}

/** v5: kompakt ön hesap özetini whitelist ile normalize eder; beklenmeyen/dev alanlar atılır. */
function normCalculationSnapshot(value: unknown): ValueLossCalculationSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  if (!SNAPSHOT_STATUSES.has(o.status as string)) return undefined;
  const status = o.status as ValueLossCalculationSnapshot['status'];
  const out: ValueLossCalculationSnapshot = {
    version: 1,
    createdAt: safeText(o.createdAt, 40) ?? '',
    status,
    formulaSummary: safeText(o.formulaSummary, 300) ?? '',
    factorsSummary: safeTextList(o.factorsSummary, 20, 200),
    missingInputs: safeTextList(o.missingInputs, 20, 300),
    warnings: safeTextList(o.warnings, 20, 300),
    evidence: safeTextList(o.evidence, 20, 300),
    disclaimer: safeText(o.disclaimer, 400) ?? ''
  };
  // Tutar yalnız 'calculated' özetinde saklanır (tanı özetinde ödenebilir tutar YOKTUR).
  if (status === 'calculated') {
    setIf(out, 'amount', parseNonNegativeNumber(o.amount));
    setIf(out, 'roundedAmount', parseNonNegativeNumber(o.roundedAmount));
  }
  setIf(out, 'coefficientSource', safeText(o.coefficientSource, 200));
  setIf(out, 'capApplied', safeBool(o.capApplied));
  setIf(out, 'capReason', safeText(o.capReason, 200));
  // v8: parmak izi/veri sürümü alanları (whitelist + sınır; ham veri saklanmaz).
  setIf(out, 'inputFingerprint', safeText(o.inputFingerprint, 60));
  if (o.inputFingerprintVersion === 1) out.inputFingerprintVersion = 1;
  const summary = Array.isArray(o.inputSummary) ? safeTextList(o.inputSummary, 10, 120) : [];
  if (summary.length > 0) out.inputSummary = summary;
  return out;
}

/** v6: geçmiş kaydını normalize eder (özet kuralları + id/savedAt/label); geçersizse null. */
function normSnapshotHistoryItem(value: unknown): ValueLossCalculationSnapshotHistoryItem | null {
  const snap = normCalculationSnapshot(value);
  if (!snap) return null;
  const o = value as Record<string, unknown>;
  const id = safeText(o.id, 40);
  const savedAt = safeText(o.savedAt, 40);
  if (!id || !savedAt) return null;
  const out: ValueLossCalculationSnapshotHistoryItem = { ...snap, id, savedAt };
  setIf(out, 'label', safeText(o.label, 80));
  return out;
}

/** v6: geçmişi normalize eder; en yeni başta varsayımıyla ilk LIMIT kayıt saklanır. */
function normSnapshotHistory(value: unknown): ValueLossCalculationSnapshotHistoryItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ValueLossCalculationSnapshotHistoryItem[] = [];
  for (const raw of value) {
    if (out.length >= VALUE_LOSS_SNAPSHOT_HISTORY_LIMIT) break;
    const item = normSnapshotHistoryItem(raw);
    if (item) out.push(item);
  }
  return out.length > 0 ? out : undefined;
}

const MARKET_BOOL_KEYS = [
  'listingsWithinLast30Days', 'listingNumbersVisible', 'screenshotsTaken',
  'kmModelEquipmentComparable', 'outliersExcluded', 'bargainingRealityExplained'
] as const;

function normMarket(value: unknown): ValueLossMarketAnalysisInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const out: ValueLossMarketAnalysisInfo = {};
  setIf(out, 'comparableListingCount', safeCount(o.comparableListingCount));
  for (const key of MARKET_BOOL_KEYS) setIf(out, key, safeBool(o[key]));
  return compact(out);
}

const EVIDENCE_BOOL_KEYS = [
  'calculationModuleOutputExists', 'marketScreenshotsExist', 'damagePhotosExist',
  'repairPartEvidenceExists', 'methodExplainedInReport', 'digitalArchiveReady'
] as const;

function normEvidence(value: unknown): ValueLossEvidenceInfo | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const out: ValueLossEvidenceInfo = {};
  for (const key of EVIDENCE_BOOL_KEYS) setIf(out, key, safeBool(o[key]));
  return compact(out);
}

/**
 * Ham girdiyi güvenli ValueLossContext'e çevirir (version:1). Girdi nesne değilse veya tüm alt
 * alanlar boşsa yine geçerli, boş bir bağlam döner (kayıt/migrasyon güvenli).
 */
export function normalizeValueLossContext(input: unknown, stamp?: { updatedAt?: string }): ValueLossContext {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: ValueLossContext = { version: VALUE_LOSS_CONTEXT_VERSION };
  if (FILE_TYPES.has(o.fileType as ValueLossFileType)) out.fileType = o.fileType as ValueLossFileType;
  setIf(out, 'assignmentDate', safeText(o.assignmentDate, 40));
  setIf(out, 'reportWillIncludeValueLoss', safeBool(o.reportWillIncludeValueLoss));
  setIf(out, 'vehicle', normVehicle(o.vehicle));
  setIf(out, 'history', normHistory(o.history));
  setIf(out, 'damage', normDamage(o.damage));
  setIf(out, 'marketAnalysis', normMarket(o.marketAnalysis));
  setIf(out, 'evidence', normEvidence(o.evidence));
  setIf(out, 'calculationSnapshot', normCalculationSnapshot(o.calculationSnapshot));
  setIf(out, 'calculationSnapshotHistory', normSnapshotHistory(o.calculationSnapshotHistory));
  setIf(out, 'notes', safeText(o.notes, 500));
  const updatedAt = safeText(stamp?.updatedAt ?? o.updatedAt, 40);
  if (updatedAt) out.updatedAt = updatedAt;
  return out;
}

/** Migrasyon için: alan varsa normalize et, yoksa undefined (zorla oluşturma yok). */
export function normalizeOptionalValueLossContext(value: unknown): ValueLossContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return normalizeValueLossContext(value);
}

/** version/updatedAt dışında en az bir anlamlı bilgi var mı? */
export function hasMeaningfulValueLossContext(context: ValueLossContext | null | undefined): boolean {
  if (!context) return false;
  const { version: _v, updatedAt: _u, ...rest } = context;
  return Object.keys(rest).length > 0;
}
