/**
 * v0.6.x — AI İşçilik v3.5: Google AI Mode parça araştırma köprüsü UI aksiyonları (SAF state + yerel parse).
 * Ağ/scraping/otomatik gönderim YOK. Yalnız prompt üretir, yapıştırılan cevabı parse eder, aday EVIDENCE bağlar.
 * render()/clipboard caller'a (main.ts) aittir; Excel'e veya D sütununa hiçbir şey yazılmaz.
 */
import { state } from '../state';
import { buildAiModeSearchPrompt } from '../../../shared/labor/ai-mode-part-search-prompt-builder';
import { parseAiModeResponse } from '../../../shared/labor/ai-mode-part-search-parser';
import { buildApprovedCandidateEntry } from '../../../shared/labor/ai-mode-part-candidate-store';
import type { AiModeDataMode, AiModePartSearchInput, AiModePartSearchRowInput } from '../../../shared/labor/ai-mode-part-search-types';
import type { ApprovedAiModePartCandidateEntry, AiModePartCandidateStoreState } from '../../../shared/labor/ai-mode-part-candidate-store-types';
import type { AiModeCandidateFilter } from '../../../shared/labor/ai-mode-part-candidate-store';
import type { AutoLaborRowPreview } from '../../../shared/types';

/** Önizleme satırını AI Mode prompt satır girdisine çevirir (opsiyonelleri exactOptional uyumlu kurar). */
function toRowInput(row: AutoLaborRowPreview): AiModePartSearchRowInput {
  const out: AiModePartSearchRowInput = { rowNumber: row.rowNumber, partName: row.partName, salvagePrice: row.salvagePrice ?? null, originalPrice: row.originalPrice ?? null };
  if (row.group) out.partGroup = row.group;
  if (row.partCode) out.partCode = row.partCode;
  if (row.operationType) out.operationType = row.operationType;
  return out;
}

export function selectAiModeRow(rowNumber: number | null): void {
  state.aiModePartSearch.selectedRowNumber = rowNumber;
  state.aiModePartSearch.generatedPrompt = '';
}

export function setAiModeDataMode(mode: AiModeDataMode): void {
  if (mode === 'masked' || mode === 'full') state.aiModePartSearch.mode = mode;
}

export function setAiModeResponseText(text: string): void {
  state.aiModePartSearch.pastedResponse = text;
}

/** Seçili önizleme satırı + aktif araç bağlamından prompt üretir (state'e yazar). */
export function generateAiModePrompt(): boolean {
  const preview = state.autoLaborPreview;
  const rowNumber = state.aiModePartSearch.selectedRowNumber;
  const row = preview?.rows.find((r) => r.rowNumber === rowNumber);
  if (!preview || !row) { state.aiModePartSearch.message = 'Önce bir önizleme satırı seçin.'; return false; }
  const input: AiModePartSearchInput = {
    vehicle: preview.vehicleContext ?? {},
    vehicleSource: preview.rows.find((r) => r.expertDiff)?.expertDiff?.vehicleSource ?? 'unknown',
    row: toRowInput(row)
  };
  state.aiModePartSearch.generatedPrompt = buildAiModeSearchPrompt(input, state.aiModePartSearch.mode);
  state.aiModePartSearch.message = 'Prompt hazır. Kopyalayıp Google AI Mode\'a yapıştırın; cevabı geri yapıştırın.';
  return true;
}

/** Parça kodu BOŞ satırlar için satır numaralı ayrı promptlar üretir (toplu manuel araştırma; ağ YOK). */
export function generateAiModeBulkEmptyPrompt(): boolean {
  const preview = state.autoLaborPreview;
  if (!preview) { state.aiModePartSearch.message = 'Önce bir Excel önizlemesi oluşturun.'; return false; }
  const emptyRows = preview.rows.filter((r) => !r.partCode || !r.partCode.trim());
  if (!emptyRows.length) { state.aiModePartSearch.message = 'Parça kodu boş satır bulunamadı.'; return false; }
  const vehicle = preview.vehicleContext ?? {};
  const blocks = emptyRows.map((row) => `=== Satır ${row.rowNumber} ===\n` + buildAiModeSearchPrompt({ vehicle, row: toRowInput(row) }, state.aiModePartSearch.mode));
  state.aiModePartSearch.generatedPrompt = blocks.join('\n\n');
  state.aiModePartSearch.message = `${emptyRows.length} parça kodu boş satır için ayrı prompt hazırlandı. Her birini AI Mode'a tek tek sorabilirsiniz.`;
  return true;
}

/** Yapıştırılan AI Mode cevabını adaylara çevirir (yalnız evidence; Excel'e yazmaz). */
export function parseAiModeResponseAction(): void {
  const candidates = parseAiModeResponse(state.aiModePartSearch.pastedResponse);
  state.aiModePartSearch.candidates = candidates;
  state.aiModePartSearch.message = candidates.length
    ? `${candidates.length} parça kodu adayı bulundu (yalnız öneri/evidence).`
    : 'Yapıştırılan metinden parça kodu adayı çıkarılamadı.';
}

/** Bir adayı seçili satıra EVIDENCE olarak bağlar (session-only; Excel'e/D sütununa yazmaz). */
export function linkAiModeCandidate(index: number): void {
  const rowNumber = state.aiModePartSearch.selectedRowNumber;
  const candidate = state.aiModePartSearch.candidates[index];
  if (rowNumber == null || !candidate) return;
  state.aiModePartSearch.linkedByRow = { ...state.aiModePartSearch.linkedByRow, [rowNumber]: candidate };
  state.aiModePartSearch.message = 'Aday, satıra yalnız evidence olarak bağlandı (Excel\'e yazılmaz).';
}

/** Seçili aday + satır + araç bağlamından ONAYLI store kaydı kurar (D kodu karşılaştırması dahil). */
export function buildAiModeApprovalEntry(index: number): ApprovedAiModePartCandidateEntry | null {
  const preview = state.autoLaborPreview;
  const rowNumber = state.aiModePartSearch.selectedRowNumber;
  const row = preview?.rows.find((r) => r.rowNumber === rowNumber);
  const candidate = state.aiModePartSearch.candidates[index];
  if (!preview || !row || !candidate) return null;
  const input: Parameters<typeof buildApprovedCandidateEntry>[0] = { candidate, rowNumber: row.rowNumber, partName: row.partName, vehicle: preview.vehicleContext ?? {} };
  if (row.group) input.partGroup = row.group;
  if (row.partCode) input.existingPartCode = row.partCode;
  return buildApprovedCandidateEntry(input);
}

/** Onay/listeleme sonrası güncel aday havuzu durumunu uygular. */
export function applyAiModeStore(store: AiModePartCandidateStoreState): void {
  state.aiModePartSearch.store = store;
}

/** Duplicate onay bekleyen adayı (yeni + mevcut) UI'ya sunar. */
export function setPendingDuplicate(newEntry: ApprovedAiModePartCandidateEntry, existing: ApprovedAiModePartCandidateEntry): void {
  state.aiModePartSearch.pendingDuplicate = { newEntry, existing };
}

export function clearPendingDuplicate(): void {
  state.aiModePartSearch.pendingDuplicate = null;
}

export function setAiModeStoreFilter(filter: AiModeCandidateFilter): void {
  state.aiModePartSearch.storeFilter = filter;
}

export function setAiModeStoreSearch(search: string): void {
  state.aiModePartSearch.storeSearch = search;
}

export function toggleAiModeSources(id: string): void {
  const next = { ...state.aiModePartSearch.sourcesExpanded };
  next[id] = !next[id];
  state.aiModePartSearch.sourcesExpanded = next;
}

export function clearAiModePartSearch(): void {
  state.aiModePartSearch.generatedPrompt = '';
  state.aiModePartSearch.pastedResponse = '';
  state.aiModePartSearch.candidates = [];
  state.aiModePartSearch.message = null;
}
