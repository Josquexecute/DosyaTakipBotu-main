/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v5: kompakt ön hesap özeti üretici (SAF).
 *
 * Ham hesap sonucundan KOMPAKT, denetlenebilir bir özet üretir; ham faktör nesneleri saklanmaz.
 * Özet YALNIZ kullanıcı onaylı v2 kayıt akışıyla `aiHelperContext.valueLoss.calculationSnapshot`
 * altına yazılabilir; bu modül hiçbir yere yazmaz. Tanı özetlerinde ödenebilir tutar bulunmaz.
 */
import type { ValueLossCalculationResult } from './value-loss-calculation-types';
import type { ValueLossCalculationSnapshot } from './value-loss-context-types';
import { formatCoefficient } from './value-loss-calculation-explain';

const EFFECT_TR: Record<string, string> = {
  increase: 'artırıcı', decrease: 'düşürücü', neutral: 'nötr', blocking: 'bloklayıcı', info: 'bilgi'
};

/** v8: özet kaydına eklenecek veri-sürümü bilgisi (opsiyonel; parmak izi + kompakt girdi özeti). */
export interface ValueLossSnapshotFingerprintInput {
  inputFingerprint?: string;
  inputSummary?: string[];
}

/** Sonuçtan kompakt özet üretir (yalnız önizleme/onaylı kayıt için; otomatik yazım YOK). */
export function buildValueLossCalculationSnapshot(result: ValueLossCalculationResult, createdAt: string, fingerprint?: ValueLossSnapshotFingerprintInput): ValueLossCalculationSnapshot {
  const warnings = [...result.warnings];
  if (result.status !== 'calculated') {
    warnings.unshift('Bu özet tanı amaçlıdır; ödenebilir tutar hesaplanmadı.');
  }
  const out: ValueLossCalculationSnapshot = {
    version: 1,
    createdAt,
    status: result.status,
    formulaSummary: result.formulaSummary,
    factorsSummary: result.factors.slice(0, 20).map((f) =>
      `${f.label}${f.coefficient !== undefined ? ` [${formatCoefficient(f.coefficient)}]` : ''} (${EFFECT_TR[f.effect] ?? f.effect})`),
    missingInputs: result.missingInputs.slice(0, 20),
    warnings: warnings.slice(0, 20),
    evidence: result.evidence.slice(0, 20),
    coefficientSource: result.coefficientSource,
    disclaimer: result.disclaimer
  };
  if (result.status === 'calculated') {
    if (typeof result.amount === 'number') out.amount = result.amount;
    if (typeof result.roundedAmount === 'number') out.roundedAmount = result.roundedAmount;
  }
  if (result.capInfo) {
    out.capApplied = result.capInfo.capApplied;
    if (result.capInfo.reason) out.capReason = result.capInfo.reason;
  }
  if (fingerprint?.inputFingerprint) {
    out.inputFingerprint = fingerprint.inputFingerprint;
    out.inputFingerprintVersion = 1;
  }
  if (fingerprint?.inputSummary && fingerprint.inputSummary.length > 0) out.inputSummary = fingerprint.inputSummary.slice(0, 10);
  return out;
}

/** Özetin diff/etiket gösterimi (örn. "calculated / 36.500 TL"). */
export function formatSnapshotLabel(snapshot: ValueLossCalculationSnapshot | null | undefined): string {
  if (!snapshot) return 'boş';
  const amount = typeof snapshot.roundedAmount === 'number'
    ? ` / ${snapshot.roundedAmount.toLocaleString('tr-TR')} TL`
    : '';
  return `${snapshot.status}${amount}`;
}
