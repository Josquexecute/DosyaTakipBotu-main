/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v1 UI aksiyonları (SALT-OKUNUR).
 *
 * Yalnızca `state.aiHelpers.valueLoss` (UI bellek) güncellenir: hangi taslağın önizleneceği.
 * Hiçbir kalıcı dosyaya yazma, IPC çağrısı, ağ isteği veya gönderim YOKTUR. render() caller'a aittir.
 */
import { state } from '../state';
import type { ValueLossDraftKind } from '../state';

const VALID_DRAFTS: ReadonlySet<string> = new Set<ValueLossDraftKind>(['internal_note', 'report_explanation', 'missing_info_mail']);

/** Seçili taslağı önizlemeye alır (tekrar tıklanırsa kapatır). */
export function selectValueLossDraft(kind: string | undefined): void {
  if (!kind || !VALID_DRAFTS.has(kind)) return;
  const next = kind as ValueLossDraftKind;
  state.aiHelpers.valueLoss.activeDraft = state.aiHelpers.valueLoss.activeDraft === next ? null : next;
}

/** Taslak önizlemesini kapatır. */
export function clearValueLossDraft(): void {
  state.aiHelpers.valueLoss.activeDraft = null;
}
