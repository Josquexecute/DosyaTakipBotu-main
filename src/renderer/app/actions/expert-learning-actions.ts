/**
 * v0.6.x — AI İşçilik v3.2: "Eksper Onaylı İşçilikten Öğren" UI aksiyonları (SAF state yardımcıları).
 * Yalnız `state.expertLearning` (UI bellek) güncellenir; IPC çağrısını ve render()'ı caller (main.ts) yapar.
 * Hiçbir Excel/dosya yazma YOK; onay store'a yazma main.ts IPC akışı + kullanıcı seçimiyle olur.
 */
import { state } from '../state';
import { selectSafeExpertPreviewItems } from '../../../shared/labor/expert-approved-learning-preview';
import type {
  ExpertApprovedLaborLearningEntry,
  ExpertLearningPreviewItem,
  ExpertLearningPreviewResponse,
  ExpertLearningStoreState
} from '../../../shared/labor/expert-approved-learning-types';

/** Excel analiz sonucunu state'e uygular ve GÜVENLİ satırları otomatik seçer (diğerleri tek tek). */
export function applyExpertPreview(preview: ExpertLearningPreviewResponse): void {
  state.expertLearning.preview = preview;
  state.expertLearning.selectedIds = selectSafeExpertPreviewItems(preview.items);
  state.expertLearning.error = null;
  state.expertLearning.message = preview.corrupt
    ? 'Öğrenme deposu okunamadı (yok sayıldı); yeni onaylar yine de güvenle kaydedilir.'
    : `${preview.items.length} öğrenilebilir satır bulundu (${state.expertLearning.selectedIds.length} güvenli satır seçildi).`;
}

/** Bir önizleme satırının seçimini aç/kapatır. */
export function toggleExpertRow(id: string | undefined): void {
  if (!id) return;
  const selected = state.expertLearning.selectedIds;
  state.expertLearning.selectedIds = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** "Tüm Güvenli Satırları Onayla" seçimini uygular (yalnız güvenli satırlar). */
export function selectSafeExpertRows(): void {
  const preview = state.expertLearning.preview;
  state.expertLearning.selectedIds = preview ? selectSafeExpertPreviewItems(preview.items) : [];
}

/** Seçili satırların öğrenme kaydı adaylarını (derivedEntry) toplar — onay IPC'sine verilir. */
export function collectSelectedExpertEntries(): ExpertApprovedLaborLearningEntry[] {
  const preview = state.expertLearning.preview;
  if (!preview) return [];
  const selected = new Set(state.expertLearning.selectedIds);
  return preview.items.filter((it) => selected.has(it.derivedEntry.id)).map((it) => it.derivedEntry);
}

/** Önizleme satırını derivedEntry.id ile bulur (duplicate yenileme aksiyonu için). */
export function findExpertPreviewItem(id: string): ExpertLearningPreviewItem | undefined {
  return state.expertLearning.preview?.items.find((it) => it.derivedEntry.id === id);
}

/** Onay/listeleme sonrası güncel store durumunu uygular. */
export function applyExpertStore(store: ExpertLearningStoreState): void {
  state.expertLearning.store = store;
}

/** Paneli temizler (önizleme + seçim sıfırlanır; store görünümü korunur). */
export function clearExpertLearning(): void {
  state.expertLearning.preview = null;
  state.expertLearning.selectedIds = [];
  state.expertLearning.message = null;
  state.expertLearning.error = null;
}
