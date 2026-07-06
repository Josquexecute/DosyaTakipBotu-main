/**
 * v0.6.x — AI İşçilik v3.1: Eksper onaylı öğrenme deposu (SAF dizi işlemleri; dosya/IPC YOK).
 * Yalnız kullanıcı onaylı kayıt kalıcı kabul edilir; kayıt pasifleştirilebilir/silinebilir (geri alınabilir).
 * Mevcut learning dictionary bozulmaz; bu ayrı, zengin ve migration-safe bir depodur.
 */
import type {
  ExpertApprovedLaborLearningEntry,
  LaborDistribution
} from './expert-approved-learning-types';
import type { OperationType } from './operation-type-detector';

const OPERATIONS: OperationType[] = ['onarim', 'degisim', 'belirsiz'];

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeDistribution(value: unknown): LaborDistribution {
  const d = (value ?? {}) as Record<string, unknown>;
  return {
    kaporta: num(d.kaporta), mekanik: num(d.mekanik), elektrik: num(d.elektrik),
    dosemeKilit: num(d.dosemeKilit), cam: num(d.cam), boya: num(d.boya), onarim: num(d.onarim)
  };
}

/** Bilinmeyen veriyi güvenle kayda çevirir; zorunlu alanlar yoksa null (eski kayıtları bozmaz). */
export function normalizeExpertEntry(value: unknown, now = new Date().toISOString()): ExpertApprovedLaborLearningEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const partName = typeof v.partName === 'string' ? v.partName.trim() : '';
  if (!partName) return null;
  const operationType = OPERATIONS.includes(v.operationType as OperationType) ? (v.operationType as OperationType) : 'belirsiz';
  const confidence = v.confidence === 'high' || v.confidence === 'medium' ? v.confidence : 'low';
  const entry: ExpertApprovedLaborLearningEntry = {
    id: typeof v.id === 'string' && v.id ? v.id : `exp-${partName.length}-${now}`,
    source: 'expert_approved_excel',
    partName,
    operationType,
    laborDistribution: normalizeDistribution(v.laborDistribution),
    reasoning: typeof v.reasoning === 'string' ? v.reasoning : '',
    confidence,
    approvedByUser: v.approvedByUser === true,
    isActive: v.isActive === true,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now
  };
  for (const k of ['vehicleModel', 'chassisPrefix', 'engineCode', 'partGroup', 'partCode', 'salvagePriceBand', 'originalPriceBand'] as const) {
    if (typeof v[k] === 'string' && v[k]) (entry as unknown as Record<string, unknown>)[k] = v[k];
  }
  if (typeof v.modelYear === 'number') entry.modelYear = v.modelYear;
  return entry;
}

/** Kaydı depoya ekler — YALNIZ kullanıcı onaylıysa (approvedByUser=true). Aynı id güncellenir. */
export function addExpertApprovedEntry(
  entries: readonly ExpertApprovedLaborLearningEntry[],
  entry: ExpertApprovedLaborLearningEntry
): ExpertApprovedLaborLearningEntry[] {
  if (!entry.approvedByUser) return [...entries];
  const next = entries.filter((e) => e.id !== entry.id);
  next.push({ ...entry, isActive: entry.isActive !== false });
  return next;
}

/** Önizleme adayını kullanıcı onayıyla aktif kayda çevirir. */
export function approveExpertEntry(
  entries: readonly ExpertApprovedLaborLearningEntry[],
  candidate: ExpertApprovedLaborLearningEntry
): ExpertApprovedLaborLearningEntry[] {
  return addExpertApprovedEntry(entries, { ...candidate, approvedByUser: true, isActive: true });
}

export function setExpertEntryActive(
  entries: readonly ExpertApprovedLaborLearningEntry[],
  id: string,
  isActive: boolean
): ExpertApprovedLaborLearningEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, isActive } : e));
}

export function removeExpertEntry(
  entries: readonly ExpertApprovedLaborLearningEntry[],
  id: string
): ExpertApprovedLaborLearningEntry[] {
  return entries.filter((e) => e.id !== id);
}

/** Eşleştirmede kullanılabilecek kayıtlar: onaylı + aktif. */
export function listUsableExpertEntries(
  entries: readonly ExpertApprovedLaborLearningEntry[]
): ExpertApprovedLaborLearningEntry[] {
  return entries.filter((e) => e.approvedByUser && e.isActive);
}

/** Duplicate anahtarı: aynı parça kodu + işlem türü + araç (model/şasi öneki) aynı kaydı işaret eder. */
export function expertEntryDuplicateKey(entry: ExpertApprovedLaborLearningEntry): string {
  const code = (entry.partCode || entry.partName || '').trim().toUpperCase();
  const vehicle = (entry.vehicleModel || entry.chassisPrefix || '').trim().toUpperCase();
  return `${code}|${entry.operationType}|${vehicle}`;
}

export function isDuplicateExpertEntry(
  entry: ExpertApprovedLaborLearningEntry,
  entries: readonly ExpertApprovedLaborLearningEntry[]
): boolean {
  // entries, sorgulanan adayın (candidate) BULUNMADIĞI mevcut depodur; anahtar eşleşmesi duplicate sayılır.
  const key = expertEntryDuplicateKey(entry);
  return entries.some((e) => expertEntryDuplicateKey(e) === key);
}

export interface ExpertMergeResult {
  entries: ExpertApprovedLaborLearningEntry[];
  added: number;
  skippedDuplicates: number;
}

/** Onaylı adayları depoya ekler; mevcut aktif kayıtla duplicate olanları SESSİZCE eklemez (atlar). */
export function mergeApprovedExpertEntries(
  existing: readonly ExpertApprovedLaborLearningEntry[],
  candidates: readonly ExpertApprovedLaborLearningEntry[]
): ExpertMergeResult {
  let entries = [...existing];
  let added = 0;
  let skippedDuplicates = 0;
  for (const candidate of candidates) {
    if (!candidate.approvedByUser) continue;
    if (isDuplicateExpertEntry(candidate, entries)) { skippedDuplicates += 1; continue; }
    entries = addExpertApprovedEntry(entries, candidate);
    added += 1;
  }
  return { entries, added, skippedDuplicates };
}

/** Bir adayla aynı anahtarı taşıyan mevcut kaydı bulur (varsa aktif olanı önceler). */
export function findDuplicateExpertEntry(
  entry: ExpertApprovedLaborLearningEntry,
  entries: readonly ExpertApprovedLaborLearningEntry[]
): ExpertApprovedLaborLearningEntry | null {
  const key = expertEntryDuplicateKey(entry);
  const matches = entries.filter((e) => expertEntryDuplicateKey(e) === key);
  return matches.find((e) => e.isActive) ?? matches[0] ?? null;
}

export interface ExpertReplaceResult {
  entries: ExpertApprovedLaborLearningEntry[];
  replaced: boolean;
}

/**
 * KULLANICI ONAYLI duplicate yenileme: eski kaydı PASİFLEŞTİRİR (silmez), yeni kaydı aktif+onaylı ekler.
 * Eski/yeni kayıt farklı id ile birlikte yaşar (geri alınabilirlik). Onaysız/duplicateId yoksa işlem yapılmaz.
 */
export function replaceDuplicateExpertEntryWithApproval(
  existing: readonly ExpertApprovedLaborLearningEntry[],
  newEntry: ExpertApprovedLaborLearningEntry,
  duplicateId: string,
  now = new Date().toISOString()
): ExpertReplaceResult {
  if (!newEntry.approvedByUser) return { entries: [...existing], replaced: false };
  const target = existing.find((e) => e.id === duplicateId);
  if (!target) return { entries: [...existing], replaced: false };
  const passivated = setExpertEntryActive(existing, duplicateId, false);
  const suffix = now.replace(/\D/g, '').slice(-10) || String(passivated.length);
  const approved: ExpertApprovedLaborLearningEntry = {
    ...newEntry,
    id: `${newEntry.id}-r${suffix}`,
    approvedByUser: true,
    isActive: true,
    reasoning: `${newEntry.reasoning} (Eski eksper öğrenme kaydı pasifleştirildi, yeni onaylı kayıt aktif edildi.)`.trim(),
    createdAt: now
  };
  return { entries: addExpertApprovedEntry(passivated, approved), replaced: true };
}
