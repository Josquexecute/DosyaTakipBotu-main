/**
 * v0.6.0 AI Bilgi Bankası — SEDDK mevzuat kaynaklarının SALT-OKUNUR birleşik dizini.
 *
 * SAF modül: ağ/dosya/electron/DOM yok; yalnızca import edilen sabit veriyi birleştirir ve
 * okuma (lookup) yardımcıları sunar. Hiçbir yere yazma yapmaz.
 */
import type { MevzuatKnowledgeItem, MevzuatSource, MevzuatTopic } from './mevzuat-types';
import { ATAMA_YONETMELIGI_2026 } from './seddk-2026-atama-yonetmeligi';
import { ATAMA_GENELGESI_2026_7 } from './seddk-2026-7-atama-genelgesi';
import { RAPOR_SABLONLARI_2026_11 } from './seddk-2026-11-rapor-sablonlari';
import { UCRET_TARIFELERI_2026 } from './seddk-2026-ucret-tarifeleri';

export { MEVZUAT_DISCLAIMER } from './mevzuat-types';
export type { MevzuatKnowledgeItem, MevzuatSource, MevzuatTopic } from './mevzuat-types';

/** Tüm SEDDK mevzuat kaynakları (salt-okunur). */
export const MEVZUAT_SOURCES: readonly MevzuatSource[] = [
  ATAMA_YONETMELIGI_2026,
  ATAMA_GENELGESI_2026_7,
  RAPOR_SABLONLARI_2026_11,
  UCRET_TARIFELERI_2026
];

/** Kaynak id → kaynak. */
export function getMevzuatSource(sourceId: string): MevzuatSource | null {
  return MEVZUAT_SOURCES.find((source) => source.id === sourceId) ?? null;
}

/** Tüm bilgi maddelerini düz liste olarak verir. */
export function getAllMevzuatItems(): readonly MevzuatKnowledgeItem[] {
  return MEVZUAT_SOURCES.flatMap((source) => source.items);
}

/** Belirli bir etikete sahip maddeler (büyük/küçük harf duyarsız, kısmi eşleşme). */
export function findMevzuatByTag(tag: string): readonly MevzuatKnowledgeItem[] {
  const needle = tag.trim().toLocaleLowerCase('tr-TR');
  if (!needle) return [];
  return getAllMevzuatItems().filter((item) =>
    item.tags.some((candidate) => candidate.toLocaleLowerCase('tr-TR').includes(needle))
  );
}

/** Belirli bir konuya (topic) ait maddeler. */
export function findMevzuatByTopic(topic: MevzuatTopic): readonly MevzuatKnowledgeItem[] {
  return getAllMevzuatItems().filter((item) => item.topic === topic);
}

/** Madde id → madde. */
export function getMevzuatItem(itemId: string): MevzuatKnowledgeItem | null {
  return getAllMevzuatItems().find((item) => item.id === itemId) ?? null;
}
