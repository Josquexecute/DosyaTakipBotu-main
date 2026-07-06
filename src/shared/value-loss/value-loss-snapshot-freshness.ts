/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v8: kayıtlı ön hesap özeti TAZELİK değerlendirmesi (SAF).
 *
 * Kayıtlı özetin parmak izini, mevcut KAYITLI form verisinin parmak iziyle karşılaştırır.
 * Veri değiştirmez, yeniden hesaplamaz, kaydetmez. Parmak izi yoksa tarihî kayıt 'unknown'
 * kalır (bayat sayılmaz); özet yoksa 'none'.
 */
import type { ValueLossContext, ValueLossCalculationSnapshot } from './value-loss-context-types';
import { createValueLossFormFingerprint } from './value-loss-form-fingerprint';

export type ValueLossSnapshotFreshnessStatus = 'fresh' | 'stale' | 'unknown' | 'none';

export interface ValueLossSnapshotFreshnessResult {
  status: ValueLossSnapshotFreshnessStatus;
  currentFingerprint?: string;
  snapshotFingerprint?: string;
  message: string;
  changedInputHint?: string[];
}

const STALE_HINT: string[] = [
  'Form verileri kayıtlı özetten sonra değişmiş olabilir.',
  'Ön hesabı yenileyip yeniden kaydetmeniz önerilir.'
];

/**
 * Kayıtlı özetin, mevcut kayıtlı form verisiyle aynı veri sürümüne ait olup olmadığını değerlendirir.
 * `vl` = normalize edilmiş KAYITLI değer kaybı bağlamı (form + özet birlikte).
 */
export function evaluateSnapshotFreshness(vl: ValueLossContext | null | undefined): ValueLossSnapshotFreshnessResult {
  const snapshot = vl?.calculationSnapshot;
  if (!vl || !snapshot) {
    return { status: 'none', message: 'Kayıtlı ön hesap özeti yok.' };
  }
  const snapshotFingerprint = snapshot.inputFingerprint;
  if (!snapshotFingerprint) {
    return {
      status: 'unknown',
      message: 'Kayıtlı ön hesap özetinin veri sürümü bilinmiyor; güncel değerlendirme için kontrol edilmelidir.'
    };
  }
  const currentFingerprint = createValueLossFormFingerprint(vl);
  if (currentFingerprint === snapshotFingerprint) {
    return {
      status: 'fresh',
      currentFingerprint,
      snapshotFingerprint,
      message: 'Kayıtlı ön hesap özeti mevcut form verileriyle aynı veri sürümüne aittir.'
    };
  }
  return {
    status: 'stale',
    currentFingerprint,
    snapshotFingerprint,
    message: 'Kayıtlı ön hesap özeti, mevcut form verileriyle aynı veri sürümüne ait görünmüyor. Ön hesabı yenileyip yeniden kaydetmeniz önerilir.',
    changedInputHint: STALE_HINT
  };
}

// === v9: geçmiş kayıt (history item) tazeliği ===

export interface ValueLossHistoryFreshnessItem {
  id: string;
  savedAt: string;
  status: ValueLossSnapshotFreshnessStatus;
  message: string;
  label: string;
}

export interface ValueLossHistoryFreshnessSummary {
  total: number;
  fresh: number;
  stale: number;
  unknown: number;
  none: number;
  items: ValueLossHistoryFreshnessItem[];
}

const HISTORY_LABEL: Record<ValueLossSnapshotFreshnessStatus, string> = {
  fresh: 'Güncel',
  stale: 'Eski veriyle oluşturulmuş olabilir',
  unknown: 'Veri sürümü bilinmiyor',
  none: 'Kayıt yok'
};
const HISTORY_MESSAGE: Record<ValueLossSnapshotFreshnessStatus, string> = {
  fresh: '',
  stale: 'Bu geçmiş özet, mevcut form verileriyle aynı veri sürümüne ait görünmüyor.',
  unknown: 'Bu geçmiş özet eski sürümde kaydedildiği için veri sürümü bilinmiyor.',
  none: ''
};

/** Parmak izi karşılaştırmasından durum üretir (ham hash döndürmez). */
function statusFromFingerprints(currentFp: string, snapshotFp: string | undefined): ValueLossSnapshotFreshnessStatus {
  if (!snapshotFp) return 'unknown';
  return currentFp === snapshotFp ? 'fresh' : 'stale';
}

/**
 * Tek bir kayıtlı özetin (güncel veya geçmiş) mevcut KAYITLI form verisine göre tazeliğini döner.
 * Veri değiştirmez, hesaplamaz, kaydetmez.
 */
export function evaluateSnapshotItemFreshness(
  currentValueLoss: ValueLossContext | null | undefined,
  snapshotLike: Pick<ValueLossCalculationSnapshot, 'inputFingerprint' | 'inputFingerprintVersion'> | undefined | null
): ValueLossSnapshotFreshnessResult {
  if (!currentValueLoss || !snapshotLike) return { status: 'none', message: HISTORY_MESSAGE.none };
  const snapshotFingerprint = snapshotLike.inputFingerprint;
  if (!snapshotFingerprint) return { status: 'unknown', message: HISTORY_MESSAGE.unknown };
  const currentFingerprint = createValueLossFormFingerprint(currentValueLoss);
  const status = statusFromFingerprints(currentFingerprint, snapshotFingerprint);
  return { status, currentFingerprint, snapshotFingerprint, message: HISTORY_MESSAGE[status] };
}

/**
 * Geçmiş kayıtlarının her biri için tazelik + kompakt sayaç özeti (görüntüleme sırası KORUNUR;
 * geçmiş dizisi DEĞİŞTİRİLMEZ). Parmak izi mevcut kayıtlı form verisinden bir kez hesaplanır.
 */
export function evaluateHistoryFreshnessSummary(currentValueLoss: ValueLossContext | null | undefined): ValueLossHistoryFreshnessSummary {
  const history = currentValueLoss?.calculationSnapshotHistory ?? [];
  const empty: ValueLossHistoryFreshnessSummary = { total: 0, fresh: 0, stale: 0, unknown: 0, none: 0, items: [] };
  if (!currentValueLoss || history.length === 0) return empty;
  const currentFingerprint = createValueLossFormFingerprint(currentValueLoss);
  const items: ValueLossHistoryFreshnessItem[] = history.map((h) => {
    const status = statusFromFingerprints(currentFingerprint, h.inputFingerprint);
    return { id: h.id, savedAt: h.savedAt, status, message: HISTORY_MESSAGE[status], label: HISTORY_LABEL[status] };
  });
  return {
    total: items.length,
    fresh: items.filter((i) => i.status === 'fresh').length,
    stale: items.filter((i) => i.status === 'stale').length,
    unknown: items.filter((i) => i.status === 'unknown').length,
    none: 0,
    items
  };
}
