/**
 * v0.6.x — AI İşçilik v3.6: Onaylı AI Mode aday havuzunu önizleme satırına eşler (SAF; yalnız evidence).
 * Mevcut D kodu ile karşılaştırır; aynı→güven artar, farklı→kontrol uyarısı, araç çelişirse kontrol gerekli.
 */
import { normalizeSearch } from '../turkish';
import { laborNameSimilarity } from '../labor-learning-dictionary';
import { comparePartCodes } from './ai-mode-part-code-comparator';
import { isGenericPartName } from './ai-mode-part-candidate-store';
import type { AiModeConfidence } from './ai-mode-part-search-types';
import type { ApprovedAiModePartCandidateEntry, AiModeCandidateRowEvidence } from './ai-mode-part-candidate-store-types';

export interface AiModeCandidateQuery {
  partName: string;
  partCode?: string;
  partGroup?: string;
  vehicleModel?: string;
  chassisPrefix?: string;
  engineCode?: string;
}

export interface AiModeCandidateMatch {
  entry: ApprovedAiModePartCandidateEntry;
  evidence: AiModeCandidateRowEvidence;
  reason: string;
}

const ORDER: AiModeConfidence[] = ['low', 'medium', 'high'];
const raise = (c: AiModeConfidence): AiModeConfidence => ORDER[Math.min(ORDER.indexOf(c) + 1, 2)]!;
const fieldConflict = (a?: string, b?: string): boolean => Boolean(a && b && a.trim().toUpperCase() !== b.trim().toUpperCase());

function nameScore(a: string, b: string): number {
  const na = normalizeSearch(a);
  const nb = normalizeSearch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 2;
  return laborNameSimilarity(a, b) >= 0.7 ? 1 : 0;
}

/** Sorgu satırına en uygun aktif aday havuzu kaydını bulur (yoksa null). Evidence yalnız öneri/karşılaştırmadır. */
export function matchAiModePartCandidate(query: AiModeCandidateQuery, entries: readonly ApprovedAiModePartCandidateEntry[]): AiModeCandidateMatch | null {
  let best: { entry: ApprovedAiModePartCandidateEntry; score: number } | null = null;
  for (const e of entries) {
    if (!e.approvedByUser || !e.isActive) continue;
    const score = nameScore(query.partName, e.partName);
    if (score === 0) continue;
    if (!best || score > best.score) best = { entry: e, score };
  }
  if (!best) return null;

  const entry = best.entry;
  const comparison = comparePartCodes(query.partCode, entry.candidatePartCode);
  const vehicleConflict = fieldConflict(query.chassisPrefix, entry.chassisPrefix) || fieldConflict(query.engineCode, entry.engineCode);
  const vehicleMatch = Boolean((query.chassisPrefix && query.chassisPrefix === entry.chassisPrefix) || (query.engineCode && query.engineCode === entry.engineCode));
  // Genel/kısa parça adı + D kodu bağlamı yoksa güçlü öneri verilmez (yanlış eşleşme riskini azalt).
  const weakGeneric = isGenericPartName(query.partName) && !((query.partCode ?? '').trim()) && !vehicleMatch;
  const staleComparison = Boolean(entry.comparisonWithExistingCode && entry.comparisonWithExistingCode.status !== comparison.status);

  let confidence: AiModeConfidence = entry.confidence;
  if (comparison.status === 'same' && !vehicleConflict) confidence = raise(confidence);
  if (comparison.status === 'missing_existing' && entry.sources.length > 0 && !weakGeneric && !vehicleConflict && confidence === 'low') confidence = raise(confidence);
  if (weakGeneric) confidence = 'low';

  const evidence: AiModeCandidateRowEvidence = {
    candidatePartCode: entry.candidatePartCode,
    partKind: entry.partKind,
    confidence,
    status: comparison.status,
    message: comparison.message,
    sourceCount: entry.sources.length
  };

  let reason: string;
  if (vehicleConflict) {
    reason = `AI Mode onaylı parça kodu adayı (${entry.candidatePartCode}) bulundu ancak araç bağlamı çelişiyor; kullanıcı/eksper kontrolü gereklidir. Excel'e otomatik yazılmaz.`;
  } else if (comparison.status === 'same') {
    reason = `AI Mode onaylı parça kodu adayı bulundu: ${entry.candidatePartCode}. Mevcut D kodu ile uyumlu. Kaynak: Google AI Mode manuel araştırması. Excel'e kullanıcı onayı olmadan yazılmaz.`;
  } else if (comparison.status === 'different') {
    reason = `AI Mode onaylı parça kodu adayı mevcut D kodundan farklıdır. Mevcut: ${query.partCode}, Aday: ${entry.candidatePartCode}. Kullanıcı/eksper kontrolü gereklidir. Excel'e otomatik yazılmaz.`;
  } else {
    reason = `AI Mode onaylı parça kodu adayı bulundu: ${entry.candidatePartCode} (mevcut D kodu yok). Yalnız öneri/evidence; Excel'e kullanıcı onayı olmadan yazılmaz.`;
  }
  if (weakGeneric) reason += ' Genel parça adı nedeniyle kontrol gerekli (parça kodu/araç bağlamı yetersiz).';
  if (staleComparison) reason += ' Kayıtlı karşılaştırma ile mevcut D kodu karşılaştırması farklı; güncel Excel satırı kontrol edilmelidir.';
  return { entry, evidence, reason };
}
