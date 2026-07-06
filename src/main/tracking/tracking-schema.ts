import type { ClaimType, TrackingFile } from '../../shared/types';
import { CLAIM_TYPES, PRIORITIES, WORKFLOW_STATUSES } from '../../shared/workflow';
import { normalizeHeavyDamageAssessmentRecord } from '../../shared/heavy-damage-rules';
import { normalizeVehicleContext } from '../../shared/vehicle/vehicle-context';
import { normalizeOptionalAiHelperContext } from '../../shared/ai-context/ai-helper-context-merge';

const PRIORITY_SET = new Set(PRIORITIES);
const WORKFLOW_STATUS_SET = new Set(WORKFLOW_STATUSES);
const CLAIM_TYPE_SET = new Set(CLAIM_TYPES);

export function isTrackingFile(value: unknown): value is TrackingFile {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj.schemaVersion === 1
    && isObject(obj.caseIdentity)
    && isObject(obj.metadata)
    && isObject(obj.assignment)
    && isObject(obj.status)
    && Array.isArray(obj.portalChecklist)
    && Array.isArray(obj.todos)
    && Array.isArray(obj.notes)
    && isObject(obj.rucu)
    && isObject(obj.labor)
    && isObject(obj.kttKusur)
    && isObject(obj.heavyDamage)
    && Array.isArray(obj.audit);
}

export function migrateTracking(value: unknown): TrackingFile | null {
  if (!isTrackingFile(value)) return null;
  const tracking = value as TrackingFile;
  tracking.caseIdentity = {
    caseKey: stringOr(tracking.caseIdentity.caseKey, ''),
    plate: stringOr(tracking.caseIdentity.plate, ''),
    dosyaNo: stringOr(tracking.caseIdentity.dosyaNo, ''),
    officeFileNo: stringOr((tracking.caseIdentity as unknown as Record<string, unknown>).officeFileNo, ''),
    claimNoticeNo: stringOr((tracking.caseIdentity as unknown as Record<string, unknown>).claimNoticeNo, ''),
    folderPath: stringOr(tracking.caseIdentity.folderPath, ''),
    monthFolder: stringOr(tracking.caseIdentity.monthFolder, ''),
    isClosedFolder: tracking.caseIdentity.isClosedFolder === true
  };
  tracking.metadata = {
    createdAt: stringOr(tracking.metadata.createdAt, new Date().toISOString()),
    updatedAt: stringOr(tracking.metadata.updatedAt, new Date().toISOString()),
    createdByComputer: stringOr(tracking.metadata.createdByComputer, ''),
    updatedByComputer: stringOr(tracking.metadata.updatedByComputer, ''),
    revision: Number.isFinite(Number(tracking.metadata.revision)) ? Number(tracking.metadata.revision) : 1,
    writeId: stringOr((tracking.metadata as unknown as Record<string, unknown>).writeId, legacyWriteId(tracking))
  };
  tracking.assignment = {
    sorumlu: stringOr(tracking.assignment.sorumlu, 'Atanmadı'),
    eksper: stringOr(tracking.assignment.eksper, 'Baran Gürbüz'),
    raportor: stringOr(tracking.assignment.raportor, 'Ömer Faruk İşleyen'),
    takipTarihi: stringOr(tracking.assignment.takipTarihi, ''),
    sonIslemTarihi: stringOr((tracking.assignment as unknown as Record<string, unknown>).sonIslemTarihi, ''),
    oncelik: PRIORITY_SET.has(tracking.assignment.oncelik) ? tracking.assignment.oncelik : 'Normal'
  };
  tracking.status = {
    dosyaDurumu: stringOr(tracking.status.dosyaDurumu, 'İncelemede'),
    workflowStatus: WORKFLOW_STATUS_SET.has(tracking.status.workflowStatus) ? tracking.status.workflowStatus : 'Yeni Dosya',
    kapaliMi: tracking.status.kapaliMi === true
  };
  tracking.claimType = CLAIM_TYPE_SET.has((tracking as Partial<TrackingFile>).claimType as ClaimType) ? tracking.claimType : 'unknown';
  tracking.service = normalizeService((tracking as Partial<TrackingFile>).service);
  tracking.portalChecklist = Array.isArray(tracking.portalChecklist) ? tracking.portalChecklist : [];
  tracking.todos = Array.isArray(tracking.todos) ? tracking.todos : [];
  tracking.notes = Array.isArray(tracking.notes) ? tracking.notes : [];
  tracking.rucu = {
    varMi: tracking.rucu?.varMi === true,
    potansiyel: tracking.rucu?.potansiyel === true,
    durum: stringOr(tracking.rucu?.durum, 'Yok'),
    not: stringOr(tracking.rucu?.not, '')
  };
  tracking.labor = {
    parcaListesiIstendi: tracking.labor?.parcaListesiIstendi === true,
    parcaKodlariIstendi: tracking.labor?.parcaKodlariIstendi === true,
    parcaIscilikGirildi: tracking.labor?.parcaIscilikGirildi === true,
    not: stringOr(tracking.labor?.not, '')
  };
  tracking.kttKusur = {
    helperOnly: true,
    finalDecisionWarning: stringOr(tracking.kttKusur?.finalDecisionWarning, 'Bu modül yalnızca yardımcıdır. Nihai kusur kararı kullanıcı tarafından verilmelidir.'),
    not: stringOr(tracking.kttKusur?.not, '')
  };
  tracking.heavyDamage = {
    enabled: tracking.heavyDamage?.enabled === true,
    helperOnly: true,
    finalDecisionWarning: stringOr(tracking.heavyDamage?.finalDecisionWarning, 'Bu modül yalnızca yardımcıdır. Ağır hasar/pert kararı otomatik verilmez.'),
    not: stringOr(tracking.heavyDamage?.not, ''),
    ...(Number.isFinite(Number(tracking.heavyDamage?.skor)) ? { skor: Number(tracking.heavyDamage?.skor) } : {})
  };
  const assessment = normalizeOptionalHeavyDamageAssessment((tracking as unknown as Record<string, unknown>).heavyDamageAssessment);
  if (assessment) tracking.heavyDamageAssessment = assessment;
  else delete tracking.heavyDamageAssessment;
  // v0.6.2: Araç bağlamı her zaman normalize bir nesne olur (eski dosyalar boş bağlamla açılır; alan-güncelleme yolu çalışır).
  tracking.vehicleContext = normalizeVehicleContext((tracking as unknown as Record<string, unknown>).vehicleContext);
  // v0.6.x: AI Yardımcıları ek bağlamı yalnızca VARSA normalize edilir; YOKSA oluşturulmaz (geriye uyum).
  const aiHelperContext = normalizeOptionalAiHelperContext((tracking as unknown as Record<string, unknown>).aiHelperContext);
  if (aiHelperContext) tracking.aiHelperContext = aiHelperContext;
  else delete tracking.aiHelperContext;
  tracking.audit = Array.isArray(tracking.audit) ? tracking.audit : [];
  return tracking;
}

function legacyWriteId(tracking: TrackingFile): string {
  const revision = Number.isFinite(Number(tracking.metadata?.revision)) ? Number(tracking.metadata.revision) : 1;
  const updatedAt = stringOr(tracking.metadata?.updatedAt, '');
  const computer = stringOr(tracking.metadata?.updatedByComputer, '');
  return `legacy-${revision}-${updatedAt}-${computer}`;
}

function normalizeService(input: unknown): TrackingFile['service'] {
  const service = isObject(input) ? input as Record<string, unknown> : {};
  const source = service.source === 'detected' ? 'detected' : 'manual';
  return {
    name: stringOr(service.name, ''),
    source,
    updatedAt: stringOr(service.updatedAt, ''),
    updatedBy: stringOr(service.updatedBy, '')
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalHeavyDamageAssessment(value: unknown): TrackingFile['heavyDamageAssessment'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  try {
    return normalizeHeavyDamageAssessmentRecord(value as NonNullable<TrackingFile['heavyDamageAssessment']>);
  } catch {
    return undefined;
  }
}

export function getUnsupportedSchemaVersion(value: unknown): number | null {
  if (!isObject(value)) return null;
  const version = Number((value as Record<string, unknown>).schemaVersion);
  return Number.isFinite(version) && version > 1 ? version : null;
}
