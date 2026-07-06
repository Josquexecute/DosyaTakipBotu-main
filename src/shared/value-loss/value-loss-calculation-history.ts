/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v6: ön hesap özeti GEÇMİŞİ yardımcıları (SAF).
 *
 * Geçmiş yalnız kullanıcı onaylı özet kaydıyla güncellenir; bu modül hiçbir yere yazmaz.
 * Kayıtlar kompakt özetlerdir (ham faktör/parça/tracking nesnesi ve dosya yolu içermez);
 * en yeni kayıt BAŞTA tutulur ve en fazla LIMIT kayıt saklanır.
 */
import type { ValueLossCalculationSnapshot, ValueLossCalculationSnapshotHistoryItem } from './value-loss-context-types';

/** Geçmişte saklanan en fazla kayıt sayısı. */
export const VALUE_LOSS_SNAPSHOT_HISTORY_LIMIT = 5;

/** Yerel, kararlı geçmiş kimliği üretir (mevcut kimliklerle çakışmaz; sistem kimliği değildir). */
function makeHistoryId(savedAt: string, existingIds: ReadonlySet<string>): string {
  const base = `vlh-${savedAt.replace(/[^0-9]/g, '').slice(0, 14) || 'kayit'}`;
  let candidate = base;
  let seq = 1;
  while (existingIds.has(candidate)) candidate = `${base}-${++seq}`;
  return candidate;
}

/** Kompakt özetten geçmiş kaydı üretir (özet alanları aynen; ek olarak id/savedAt). */
export function createSnapshotHistoryItem(
  snapshot: ValueLossCalculationSnapshot,
  savedAt: string,
  existing: readonly ValueLossCalculationSnapshotHistoryItem[]
): ValueLossCalculationSnapshotHistoryItem {
  const ids = new Set(existing.map((h) => h.id));
  return { ...snapshot, id: makeHistoryId(savedAt, ids), savedAt };
}

/** Yeni kaydı başa ekler ve limiti uygular (yalnız geçmiş dizisi kırpılır; başka alan etkilenmez). */
export function appendSnapshotHistory(
  existing: readonly ValueLossCalculationSnapshotHistoryItem[] | undefined,
  item: ValueLossCalculationSnapshotHistoryItem
): ValueLossCalculationSnapshotHistoryItem[] {
  return [item, ...(existing ?? [])].slice(0, VALUE_LOSS_SNAPSHOT_HISTORY_LIMIT);
}
