/**
 * v0.6.x — Değer Kaybı Ek Bilgi Formu (v2) UI aksiyonları (SALT-OKUNUR).
 *
 * Yalnız `state.aiHelpers.valueLoss` meta ve `state.aiHelpers.vlForm` (UI bellek) güncellenir.
 * Kalıcı kaydetme (onay + güvenli mutate) main.ts'teki onaylı akışa aittir; burada IPC/ağ/yazma YOKTUR.
 */
import { state, selectedCase } from '../state';
import { buildAiCaseContext } from '../selectors/ai-case-context';
import { buildValueLossFormForCase, savedToValueLossForm, savedToValueLossPartRows, emptyValueLossPartRow } from '../utils/value-loss-form-mapping';
import type { ValueLossContext } from '../../../shared/value-loss/value-loss-context-types';

/** Form panelini açar/kapatır; açılırken form dosyadan kurulur (kayıtlı > bağlam > boş). */
export function toggleValueLossForm(): void {
  const next = !state.aiHelpers.valueLoss.formOpen;
  state.aiHelpers.valueLoss.formOpen = next;
  if (next) resetValueLossFormFromCase();
}

/** Kaydetme öncesi diff önizlemesini açar/kapatır. */
export function toggleValueLossPreview(): void {
  state.aiHelpers.valueLoss.previewOpen = !state.aiHelpers.valueLoss.previewOpen;
}

/** Formu seçili dosyanın kayıtlı/bağlam verisinden yeniden kurar (geçici düzenlemeler atılır). */
export function resetValueLossFormFromCase(): void {
  const item = selectedCase();
  state.aiHelpers.vlForm = buildValueLossFormForCase(item, buildAiCaseContext(item));
  state.aiHelpers.vlParts = savedToValueLossPartRows(item?.tracking?.aiHelperContext?.valueLoss ?? null);
}

/** Kaydetme sonrası formu diskten dönen kayıtlı veriye eşitler (main.ts onaylı akışı çağırır). */
export function refreshValueLossFormFromSaved(saved: ValueLossContext | null | undefined): void {
  state.aiHelpers.vlForm = savedToValueLossForm(saved ?? null);
  state.aiHelpers.vlParts = savedToValueLossPartRows(saved ?? null);
  state.aiHelpers.valueLoss.previewOpen = false;
}

/** v4: Yeni parça satırı ekler (yalnız UI bellek; kayıt v2 onaylı akışla). */
export function addValueLossPartRow(): void {
  state.aiHelpers.vlParts.push(emptyValueLossPartRow(state.aiHelpers.vlParts.length + 1));
}

/** v4: Parça satırını siler (yalnız UI bellek). */
export function removeValueLossPartRow(index: number): void {
  if (Number.isInteger(index) && index >= 0 && index < state.aiHelpers.vlParts.length) {
    state.aiHelpers.vlParts.splice(index, 1);
  }
}

const PART_FIELDS: ReadonlySet<string> = new Set(['operation', 'partName', 'laborAmount', 'newPartPrice', 'paintType']);

/** v4: `vlPart:{index}:{alan}` anahtarlı form girişini güvenli şekilde satıra yazar. */
export function handleValueLossPartInput(key: string, value: string): void {
  const parts = key.split(':');
  if (parts.length !== 2) return;
  const index = Number(parts[0]);
  const field = parts[1] ?? '';
  if (!Number.isInteger(index) || index < 0 || index >= state.aiHelpers.vlParts.length) return;
  if (!PART_FIELDS.has(field)) return;
  const row = state.aiHelpers.vlParts[index] as unknown as Record<string, string>;
  row[field] = value;
}
