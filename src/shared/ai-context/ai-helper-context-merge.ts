/**
 * v0.6.x — aiHelperContext SAF sanitize / normalize / diff yardımcıları.
 *
 * Ağ/dosya/electron yok. Yazma öncesi alanları whitelist'ler ve enum'ları doğrular; eski/bozuk
 * veriyi güvenli okur. Diff, kaydetme onay modalında "eski -> yeni" göstermek için kullanılır.
 */
import type {
  AiHelperContext, AiHelperContextInput, AiHelperClaimTypeOverride, AiHelperVehicleGroup,
  AiHelperCityScope, AiHelperReportTemplateOverride, AiHelperDocumentType, AiHelperTriState
} from './ai-helper-context-types';
import { AI_HELPER_CONTEXT_VERSION } from './ai-helper-context-types';
import { AI_HELPER_CONTEXT_FIELD_LABELS } from './ai-helper-context-defaults';
import { normalizeOptionalValueLossContext } from '../value-loss/value-loss-context-normalizer';

const CLAIM_TYPES: ReadonlySet<AiHelperClaimTypeOverride> = new Set(['trafik', 'kasko', 'ihtiyari', 'belirsiz']);
const VEHICLE_GROUPS: ReadonlySet<AiHelperVehicleGroup> = new Set(['binek_hafif_ticari_motosiklet', 'agir_vasita', 'is_makinesi', 'belirsiz']);
const CITY_SCOPES: ReadonlySet<AiHelperCityScope> = new Set(['ayni_il', 'farkli_il', 'belirsiz']);
const TEMPLATE_OVERRIDES: ReadonlySet<AiHelperReportTemplateOverride> = new Set(['ek_1_1', 'ek_1_2', 'ek_2', 'belirsiz']);
const DOC_TYPES: ReadonlySet<AiHelperDocumentType> = new Set(['ktt', 'zabit', 'beyan', 'karakol_tutanagi', 'belirsiz']);
const TRI: ReadonlySet<AiHelperTriState> = new Set(['var', 'yok', 'belirsiz']);

const TEXT_FIELDS: readonly (keyof AiHelperContextInput)[] = ['insurerName', 'policyTypeNote', 'notes'];
const DATE_FIELDS: readonly (keyof AiHelperContextInput)[] = [
  'appointmentDateTime', 'expertiseRequestDate', 'firstInspectionDate', 'preliminaryReportDate',
  'reportReadyDate', 'vehicleDeliveredToServiceDate', 'repairStartedDate', 'repairCompletedDate'
];
/** Diff/karşılaştırma için bakılan alanlar (version/updatedAt/updatedBy hariç). */
export const AI_HELPER_CONTEXT_COMPARED_FIELDS: readonly (keyof AiHelperContextInput)[] = [
  'claimTypeOverride', 'vehicleGroup', 'hasValueLoss', 'cityScope', 'insurerName', 'policyTypeNote',
  'reportTemplateOverride', 'appointmentDateTime', 'firstInspectionDate', 'preliminaryReportDate',
  'reportReadyDate', 'vehicleDeliveredToService', 'vehicleDeliveredToServiceDate', 'repairStartedDate',
  'repairCompletedDate', 'accidentDocumentType', 'alcoholDocumentStatus', 'driverLicenseStatus', 'notes'
];

/** Yalnız kontrol karakterlerini boşluğa çevirir (tarihlerdeki '-' ve enum '_' korunur). */
function safeStr(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  let cleaned = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    cleaned += code < 32 || code === 127 ? ' ' : ch;
  }
  const trimmed = cleaned.trim().slice(0, max);
  return trimmed || undefined;
}

function triBool(value: unknown): boolean | null | undefined {
  if (value === true || value === false) return value;
  if (value === null) return null;
  return undefined;
}

/** Girdiyi güvenli AiHelperContext'e çevirir (version:1 + opsiyonel zaman damgası). */
export function sanitizeAiHelperContext(input: unknown, stamp?: { updatedAt?: string; updatedBy?: string }): AiHelperContext {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: AiHelperContext = { version: AI_HELPER_CONTEXT_VERSION };

  if (CLAIM_TYPES.has(obj.claimTypeOverride as AiHelperClaimTypeOverride)) out.claimTypeOverride = obj.claimTypeOverride as AiHelperClaimTypeOverride;
  if (VEHICLE_GROUPS.has(obj.vehicleGroup as AiHelperVehicleGroup)) out.vehicleGroup = obj.vehicleGroup as AiHelperVehicleGroup;
  if (CITY_SCOPES.has(obj.cityScope as AiHelperCityScope)) out.cityScope = obj.cityScope as AiHelperCityScope;
  if (TEMPLATE_OVERRIDES.has(obj.reportTemplateOverride as AiHelperReportTemplateOverride)) out.reportTemplateOverride = obj.reportTemplateOverride as AiHelperReportTemplateOverride;
  if (DOC_TYPES.has(obj.accidentDocumentType as AiHelperDocumentType)) out.accidentDocumentType = obj.accidentDocumentType as AiHelperDocumentType;
  if (TRI.has(obj.alcoholDocumentStatus as AiHelperTriState)) out.alcoholDocumentStatus = obj.alcoholDocumentStatus as AiHelperTriState;
  if (TRI.has(obj.driverLicenseStatus as AiHelperTriState)) out.driverLicenseStatus = obj.driverLicenseStatus as AiHelperTriState;

  const hvl = triBool(obj.hasValueLoss);
  if (hvl !== undefined) out.hasValueLoss = hvl;
  const oot = triBool(obj.isOutOfTown);
  if (oot !== undefined) out.isOutOfTown = oot;
  const vd = triBool(obj.vehicleDeliveredToService);
  if (vd !== undefined) out.vehicleDeliveredToService = vd;

  for (const key of TEXT_FIELDS) {
    const v = safeStr(obj[key as string], 500);
    if (v !== undefined) (out as unknown as Record<string, unknown>)[key as string] = v;
  }
  for (const key of DATE_FIELDS) {
    const v = safeStr(obj[key as string], 40);
    if (v !== undefined) (out as unknown as Record<string, unknown>)[key as string] = v;
  }

  if (stamp?.updatedAt) out.updatedAt = stamp.updatedAt;
  const updatedBy = safeStr(stamp?.updatedBy, 120);
  if (updatedBy) out.updatedBy = updatedBy;

  // v2: Değer Kaybı Ek Bilgi Formu verisi VARSA normalize edilerek taşınır (migrasyonda kaybolmaz).
  const valueLoss = normalizeOptionalValueLossContext(obj.valueLoss);
  if (valueLoss) out.valueLoss = valueLoss;
  return out;
}

/** migrateTracking için: alan varsa normalize et, yoksa undefined (zorla oluşturma yok). */
export function normalizeOptionalAiHelperContext(value: unknown): AiHelperContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return sanitizeAiHelperContext(value);
}

function valueLabel(value: unknown): string {
  if (value === undefined || value === '' || value === 'belirsiz' || value === null) return 'Belirsiz';
  if (value === true) return 'Var/Evet';
  if (value === false) return 'Yok/Hayır';
  const map: Record<string, string> = {
    trafik: 'Trafik / ZMSS', kasko: 'Kasko', ihtiyari: 'İhtiyari Mali Sorumluluk',
    binek_hafif_ticari_motosiklet: 'Binek / Hafif Ticari / Motosiklet', agir_vasita: 'Ağır Vasıta', is_makinesi: 'İş Makinesi',
    ayni_il: 'Aynı il', farkli_il: 'Farklı il',
    ek_1_1: 'Ek-1.1', ek_1_2: 'Ek-1.2', ek_2: 'Ek-2',
    ktt: 'KTT', zabit: 'Zabıt', beyan: 'Beyan', karakol_tutanagi: 'Karakol Tutanağı',
    var: 'Var', yok: 'Yok'
  };
  return map[String(value)] ?? String(value);
}

export interface AiHelperContextDiffRow {
  key: string;
  label: string;
  oldLabel: string;
  newLabel: string;
}

/** İki ek-bağlam arasındaki değişen alanları (Türkçe etiketli) verir. */
export function diffAiHelperContext(previous: AiHelperContext | null | undefined, next: AiHelperContext): AiHelperContextDiffRow[] {
  const prev = (previous ?? {}) as unknown as Record<string, unknown>;
  const nextObj = next as unknown as Record<string, unknown>;
  const rows: AiHelperContextDiffRow[] = [];
  for (const key of AI_HELPER_CONTEXT_COMPARED_FIELDS) {
    const oldLabel = valueLabel(prev[key as string]);
    const newLabel = valueLabel(nextObj[key as string]);
    if (oldLabel !== newLabel) {
      rows.push({ key: key as string, label: AI_HELPER_CONTEXT_FIELD_LABELS[key as string] ?? (key as string), oldLabel, newLabel });
    }
  }
  return rows;
}
