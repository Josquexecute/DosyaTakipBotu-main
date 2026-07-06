/**
 * v0.6.x — "Mevzuat & AI Yardımcıları" UI aksiyonları.
 *
 * SALT-OKUNUR: yalnızca `state.aiHelpers` (UI bellek) güncellenir. Hiçbir dosyaya yazma,
 * IPC çağrısı, ağ isteği veya kalıcı veri mutasyonu YOKTUR. render() çağrısı caller'a (main.ts) aittir.
 */
import { state, selectedCase } from '../state';
import type { AiHelperTool } from '../state';
import { buildAiCaseContext } from '../selectors/ai-case-context';
import { applyContextToAiHelpers } from '../utils/ai-context-mapping';
import { savedToExtraForm } from '../utils/ai-extra-context-mapping';
import { toggleExtraPanel, applyExtraTemporary, clearExtraForm, revertExtraToSaved, extraReapplyToHelpers } from './ai-case-extra-context-actions';
import { generateDraftTask, clearDraftResult, selectDraftHistory } from './ai-task-actions';
import { selectValueLossDraft, clearValueLossDraft } from './value-loss-actions';
import { toggleValueLossForm, toggleValueLossPreview, resetValueLossFormFromCase, addValueLossPartRow, removeValueLossPartRow, handleValueLossPartInput } from './value-loss-context-actions';
import { buildValueLossFormForCase, savedToValueLossPartRows } from '../utils/value-loss-form-mapping';

const VALID_TOOLS: ReadonlySet<string> = new Set<AiHelperTool>(['mevzuat', 'sablon', 'ucret', 'sure', 'deger-kaybi']);

/** Tıklama aksiyonlarını işler (sekme değişimi, filtre, madde aç/kapa). */
export function handleAiHelperAction(action: string, element?: HTMLElement): void {
  switch (action) {
    case 'aih-tool': {
      const tool = element?.dataset.aihTool;
      if (tool && VALID_TOOLS.has(tool)) state.aiHelpers.activeTool = tool as AiHelperTool;
      break;
    }
    case 'aih-mevzuat-filter': {
      const term = element?.dataset.mevzuatTerm ?? '';
      // Aynı filtreye tekrar tıklanırsa temizlenir (toggle).
      state.aiHelpers.mevzuatFilter = state.aiHelpers.mevzuatFilter === term ? '' : term;
      break;
    }
    case 'aih-mevzuat-toggle': {
      const id = element?.dataset.mevzuatItem;
      if (id) state.aiHelpers.mevzuatExpanded[id] = !state.aiHelpers.mevzuatExpanded[id];
      break;
    }
    case 'aih-extra-toggle': toggleExtraPanel(); break;
    case 'aih-extra-apply': applyExtraTemporary(); break;
    case 'aih-extra-clear': clearExtraForm(); break;
    case 'aih-extra-revert': revertExtraToSaved(); break;
    case 'aih-task-run': generateDraftTask(); break;
    case 'aih-task-clear': clearDraftResult(); break;
    case 'aih-task-history': selectDraftHistory(element?.dataset.taskId); break;
    case 'aih-vl-draft': selectValueLossDraft(element?.dataset.vlDraft); break;
    case 'aih-vl-draft-clear': clearValueLossDraft(); break;
    case 'aih-vl-form-toggle': toggleValueLossForm(); break;
    case 'aih-vl-preview': toggleValueLossPreview(); break;
    case 'aih-vl-form-reset': resetValueLossFormFromCase(); break;
    // v3: ön hesap render anında saf motorla üretilir; "Yenile" yalnız yeniden render tetikler.
    case 'aih-vl-calc-refresh': break;
    // v4: parça satırı ekle/sil (yalnız UI bellek; kayıt v2 onaylı akışla)
    case 'aih-vl-part-add': addValueLossPartRow(); break;
    case 'aih-vl-part-del': removeValueLossPartRow(Number(element?.dataset.partIndex)); break;
    default:
      break;
  }
}

/** data-aih taşıyan form alanlarının değerini güvenli şekilde state.aiHelpers'a yazar. */
export function handleAiHelperInput(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  const key = target.dataset.aih;
  if (!key) return;
  const value: string | boolean = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
  // v4: parça satırı alanları ('vlPart:{index}:{alan}') dizin bazlı güvenli yolla yazılır.
  if (key.startsWith('vlPart:') && typeof value === 'string') {
    handleValueLossPartInput(key.slice(7), value);
    state.aiHelpers.userEdited[key] = true;
    return;
  }
  setAiHelperField(key, value);
  // Kullanıcının elle değiştirdiği alanı işaretle ("geçici değişiklik" rozeti + bağlam ezme koruması).
  state.aiHelpers.userEdited[key] = true;
  // Ek Bilgiler formu değişince efektif bağlamı diğer yardımcı formlarına yansıt (geçici; yazma yok).
  if (key.startsWith('extra.')) extraReapplyToHelpers();
}

/**
 * Seçili dosya değiştiyse AI Yardımcıları formunu bağlamdan yeniden ön-doldurur (salt-okunur).
 * Aynı dosyada kullanıcının geçici düzeltmeleri korunur. render() içinden çağrılır.
 */
export function syncAiHelpersContext(): void {
  const item = selectedCase();
  const ctx = buildAiCaseContext(item);
  const ctxPath = ctx?.folderPath ?? null;
  if (state.aiHelpers.contextFolderPath === ctxPath) return;
  state.aiHelpers.contextFolderPath = ctxPath;
  state.aiHelpers.userEdited = {};
  // Dosya Ek Bilgileri formunu dosyadaki kayıtlı ek bağlamdan (varsa) yükle; yoksa boş.
  state.aiHelpers.extra = savedToExtraForm(item?.tracking?.aiHelperContext ?? null);
  // v2: Değer Kaybı Ek Bilgi Formu da dosya değişince yeniden kurulur (kayıtlı > bağlam > boş).
  state.aiHelpers.vlForm = buildValueLossFormForCase(item, ctx);
  state.aiHelpers.vlParts = savedToValueLossPartRows(item?.tracking?.aiHelperContext?.valueLoss ?? null);
  state.aiHelpers.valueLoss.previewOpen = false;
  if (ctx) applyContextToAiHelpers(state.aiHelpers, ctx);
}

/** Yalnız `state.aiHelpers` içinde, var olan 1-2 seviyeli alanlara yazar (keyfi yazma engellenir). */
function setAiHelperField(path: string, value: string | boolean): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return;
  let cursor: Record<string, unknown> = state.aiHelpers as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === undefined) return;
    const next = cursor[part];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (leaf === undefined) return;
  if (!Object.prototype.hasOwnProperty.call(cursor, leaf)) return;
  cursor[leaf] = value;
}
