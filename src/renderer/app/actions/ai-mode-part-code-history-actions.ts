/**
 * v0.6.x — AI İşçilik v3.11: İşlem geçmişi UI aksiyonu (SAF state). IPC/render caller'a (main.ts) aittir.
 * Geçmiş yalnız RAPOR amaçlıdır; takip.json değildir, Excel'e yazma içermez.
 */
import { state } from '../state';
import type { AiModePartCodeHistoryListResult } from '../../../shared/labor/ai-mode-part-code-history-types';

export function applyHistoryList(result: AiModePartCodeHistoryListResult): void {
  state.aiModePartSearch.history = result;
}
