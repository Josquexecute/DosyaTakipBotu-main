/**
 * v0.6.x — AI İşçilik v3.6: Onaylı AI Mode parça kodu aday store SAF işlemleri (dosya/IPC YOK).
 * Yalnız kullanıcı onaylı (approvedByUser:true) kayıt kalıcı kabul edilir; pasifleştirilebilir/silinebilir.
 */
import { normalizeSearch } from '../turkish';
import { comparePartCodes, normalizePartCode, type PartCodeComparison } from './ai-mode-part-code-comparator';
import type { AiModeConfidence, AiModePartCandidate, AiModePartKind } from './ai-mode-part-search-types';
import type { ApprovedAiModePartCandidateEntry } from './ai-mode-part-candidate-store-types';
import type { LaborVehicleContext } from './labor-vehicle-context';

const KINDS: AiModePartKind[] = ['orijinal', 'oem', 'esdeger', 'yan_sanayi', 'yeniden_kullanilabilir', 'belirsiz'];
const CONFS: AiModeConfidence[] = ['low', 'medium', 'high'];

function stableHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export interface BuildCandidateEntryInput {
  candidate: AiModePartCandidate;
  rowNumber?: number;
  partGroup?: string;
  partName: string;
  existingPartCode?: string;
  vehicle?: LaborVehicleContext;
}

/** Parse edilmiş aday + satır/araç bağlamından ONAYLI store kaydı kurar (D kodu karşılaştırması dahil). */
export function buildApprovedCandidateEntry(input: BuildCandidateEntryInput, now = new Date().toISOString()): ApprovedAiModePartCandidateEntry | null {
  const partName = (input.partName || '').trim();
  const candidatePartCode = (input.candidate.partCode || '').trim();
  if (!partName || !candidatePartCode) return null;
  const v = input.vehicle ?? {};
  const sig = normalizeSearch([v.vehicleModel, v.chassisPrefix, v.engineCode, partName, candidatePartCode, input.candidate.partKind].filter(Boolean).join('|'));
  const entry: ApprovedAiModePartCandidateEntry = {
    id: `aimode-${stableHash(sig)}`,
    source: 'google_ai_mode_manual',
    approvedByUser: true,
    isActive: true,
    createdAt: now,
    partName,
    candidatePartCode,
    partKind: input.candidate.partKind ?? 'belirsiz',
    confidence: input.candidate.confidence,
    sources: [...input.candidate.sources],
    warnings: [...input.candidate.warnings],
    rawEvidence: input.candidate.rawEvidence,
    comparisonWithExistingCode: comparePartCodes(input.existingPartCode, candidatePartCode)
  };
  if (typeof input.rowNumber === 'number') entry.rowNumber = input.rowNumber;
  if (input.partGroup) entry.partGroup = input.partGroup.trim();
  if (input.existingPartCode && input.existingPartCode.trim()) entry.existingPartCode = input.existingPartCode.trim();
  if (input.candidate.compatibility) entry.compatibility = input.candidate.compatibility;
  if (v.vehicleModel) entry.vehicleModel = v.vehicleModel;
  if (typeof v.modelYear === 'number') entry.modelYear = v.modelYear;
  if (v.chassisPrefix) entry.chassisPrefix = v.chassisPrefix;
  if (v.engineCode) entry.engineCode = v.engineCode;
  if (v.plate) entry.plate = v.plate;
  return entry;
}

/** Bilinmeyen veriyi güvenle kayda çevirir; zorunlu alan yoksa null (eski kayıtları bozmaz). */
export function normalizeAiModeCandidateEntry(value: unknown, now = new Date().toISOString()): ApprovedAiModePartCandidateEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const partName = typeof v.partName === 'string' ? v.partName.trim() : '';
  const candidatePartCode = typeof v.candidatePartCode === 'string' ? v.candidatePartCode.trim() : '';
  if (!partName || !candidatePartCode) return null;
  const entry: ApprovedAiModePartCandidateEntry = {
    id: typeof v.id === 'string' && v.id ? v.id : `aimode-${partName.length}-${now}`,
    source: 'google_ai_mode_manual',
    approvedByUser: true,
    isActive: v.isActive !== false,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    partName,
    candidatePartCode,
    partKind: KINDS.includes(v.partKind as AiModePartKind) ? (v.partKind as AiModePartKind) : 'belirsiz',
    confidence: CONFS.includes(v.confidence as AiModeConfidence) ? (v.confidence as AiModeConfidence) : 'low',
    sources: Array.isArray(v.sources) ? v.sources.filter((s): s is string => typeof s === 'string') : [],
    warnings: Array.isArray(v.warnings) ? v.warnings.filter((w): w is string => typeof w === 'string') : [],
    rawEvidence: typeof v.rawEvidence === 'string' ? v.rawEvidence : ''
  };
  for (const k of ['vehicleModel', 'chassisPrefix', 'engineCode', 'plate', 'partGroup', 'existingPartCode', 'compatibility', 'updatedAt'] as const) {
    if (typeof v[k] === 'string' && v[k]) (entry as unknown as Record<string, unknown>)[k] = v[k];
  }
  if (typeof v.modelYear === 'number') entry.modelYear = v.modelYear;
  if (typeof v.rowNumber === 'number') entry.rowNumber = v.rowNumber;
  if (v.comparisonWithExistingCode && typeof v.comparisonWithExistingCode === 'object') {
    entry.comparisonWithExistingCode = v.comparisonWithExistingCode as PartCodeComparison;
  }
  return entry;
}

/** Duplicate anahtarı: araç (model/şasi/motor) + parça adı + aday kod + tür. */
export function candidateDuplicateKey(entry: ApprovedAiModePartCandidateEntry): string {
  const vehicle = (entry.vehicleModel || entry.chassisPrefix || entry.engineCode || '').trim().toUpperCase();
  return `${vehicle}|${normalizeSearch(entry.partName)}|${normalizePartCode(entry.candidatePartCode)}|${entry.partKind}`;
}

export function isDuplicateAiModeCandidate(entry: ApprovedAiModePartCandidateEntry, entries: readonly ApprovedAiModePartCandidateEntry[]): boolean {
  const key = candidateDuplicateKey(entry);
  return entries.some((e) => candidateDuplicateKey(e) === key);
}

export function addApprovedCandidate(entries: readonly ApprovedAiModePartCandidateEntry[], entry: ApprovedAiModePartCandidateEntry): ApprovedAiModePartCandidateEntry[] {
  if (!entry.approvedByUser) return [...entries];
  const next = entries.filter((e) => e.id !== entry.id);
  next.push({ ...entry, isActive: entry.isActive !== false });
  return next;
}

export interface AiModeCandidateMergeResult {
  entries: ApprovedAiModePartCandidateEntry[];
  added: number;
  skippedDuplicates: number;
}

/** Onaylı adayları depoya ekler; mevcut duplicate'leri SESSİZCE eklemez (otomatik overwrite yok). */
export function mergeApprovedCandidates(existing: readonly ApprovedAiModePartCandidateEntry[], candidates: readonly ApprovedAiModePartCandidateEntry[]): AiModeCandidateMergeResult {
  let entries = [...existing];
  let added = 0;
  let skippedDuplicates = 0;
  for (const candidate of candidates) {
    if (!candidate.approvedByUser) continue;
    if (isDuplicateAiModeCandidate(candidate, entries)) { skippedDuplicates += 1; continue; }
    entries = addApprovedCandidate(entries, candidate);
    added += 1;
  }
  return { entries, added, skippedDuplicates };
}

export function setCandidateActive(entries: readonly ApprovedAiModePartCandidateEntry[], id: string, isActive: boolean): ApprovedAiModePartCandidateEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, isActive, updatedAt: new Date().toISOString() } : e));
}

export function removeCandidate(entries: readonly ApprovedAiModePartCandidateEntry[], id: string): ApprovedAiModePartCandidateEntry[] {
  return entries.filter((e) => e.id !== id);
}

export function listUsableCandidates(entries: readonly ApprovedAiModePartCandidateEntry[]): ApprovedAiModePartCandidateEntry[] {
  return entries.filter((e) => e.approvedByUser && e.isActive);
}

/** Bir adayla aynı anahtarı taşıyan mevcut kaydı bulur (aktif olanı önceler). */
export function findDuplicateAiModeCandidate(entry: ApprovedAiModePartCandidateEntry, entries: readonly ApprovedAiModePartCandidateEntry[]): ApprovedAiModePartCandidateEntry | null {
  const key = candidateDuplicateKey(entry);
  const matches = entries.filter((e) => candidateDuplicateKey(e) === key);
  return matches.find((e) => e.isActive) ?? matches[0] ?? null;
}

export interface AiModeCandidateReplaceResult {
  entries: ApprovedAiModePartCandidateEntry[];
  replaced: boolean;
  replacedId?: string;
  newId?: string;
  skippedReason?: string;
}

/**
 * KULLANICI ONAYLI duplicate yenileme: eski kaydı PASİFLEŞTİRİR (silmez), yeni adayı aktif+onaylı ekler.
 * Eski/yeni farklı id ile birlikte yaşar (geri alınabilirlik). Onaysız/duplicateId yoksa işlem yapılmaz.
 */
export function replaceDuplicateAiModeCandidateWithApproval(
  existing: readonly ApprovedAiModePartCandidateEntry[],
  newEntry: ApprovedAiModePartCandidateEntry,
  duplicateId: string,
  now = new Date().toISOString()
): AiModeCandidateReplaceResult {
  if (newEntry.approvedByUser !== true) return { entries: [...existing], replaced: false, skippedReason: 'Aday onaylı değil.' };
  const target = existing.find((e) => e.id === duplicateId);
  if (!target) return { entries: [...existing], replaced: false, skippedReason: 'Yenilenecek mevcut kayıt bulunamadı.' };
  const passivated = setCandidateActive(existing, duplicateId, false);
  const suffix = now.replace(/\D/g, '').slice(-10) || String(passivated.length);
  const newId = `${newEntry.id}-r${suffix}`;
  const approved: ApprovedAiModePartCandidateEntry = {
    ...newEntry,
    id: newId,
    approvedByUser: true,
    isActive: true,
    updatedAt: now,
    rawEvidence: `${newEntry.rawEvidence} (Duplicate yenileme: eski AI Mode parça kodu adayı pasifleştirildi, yeni aday aktif edildi.)`.trim()
  };
  return { entries: addApprovedCandidate(passivated, approved), replaced: true, replacedId: duplicateId, newId };
}

// Tek başına zayıf/genel parça adları (araç/kod bağlamı olmadan güçlü eşleşme verilmez).
const GENERIC_PART_NAMES = new Set(['KLIPS', 'VIDA', 'KAPAK', 'BRAKET', 'BAGLANTI', 'PLASTIK', 'FITIL', 'DESTEK', 'MUHAFAZA', 'SAC', 'PANEL', 'PARCA', 'SET', 'SOMUN', 'PUL', 'CIVATA']);
const POSITION_WORDS = new Set(['ON', 'ARKA', 'SAG', 'SOL', 'ALT', 'UST', 'ORTA', 'IC', 'DIS', 'KOMPLE']);

/** Parça adı tek başına genel/zayıf mı (yön/konum kelimeleri çıkarıldıktan sonra tüm token'lar genel). */
export function isGenericPartName(name?: string): boolean {
  const tokens = normalizeSearch(name ?? '').split(' ').filter(Boolean).filter((t) => !POSITION_WORDS.has(t));
  return tokens.length > 0 && tokens.every((t) => GENERIC_PART_NAMES.has(t));
}

export type AiModeCandidateFilter = 'all' | 'active' | 'passive' | 'different' | 'missing' | 'sources';

/** Yönetim paneli için filtre + arama (parça adı / aday kod / araç modeli / kaynak URL). SAF. */
export function filterAiModeCandidates(
  entries: readonly ApprovedAiModePartCandidateEntry[],
  filter: AiModeCandidateFilter = 'all',
  search = ''
): ApprovedAiModePartCandidateEntry[] {
  const s = normalizeSearch(search);
  const sCode = normalizePartCode(search);
  return entries.filter((e) => {
    if (filter === 'active' && !e.isActive) return false;
    if (filter === 'passive' && e.isActive) return false;
    if (filter === 'different' && e.comparisonWithExistingCode?.status !== 'different') return false;
    if (filter === 'missing' && e.comparisonWithExistingCode?.status !== 'missing_existing') return false;
    if (filter === 'sources' && e.sources.length === 0) return false;
    if (s || sCode) {
      const textHay = normalizeSearch([e.partName, e.vehicleModel, e.sources.join(' ')].filter(Boolean).join(' '));
      const codeHay = normalizePartCode(e.candidatePartCode);
      if (!(s && textHay.includes(s)) && !(sCode && codeHay.includes(sCode))) return false;
    }
    return true;
  });
}
