/**
 * v0.6.x — AI Taslak Üretici (Orchestrator v1) aksiyonları.
 *
 * SALT UI: yalnız `state.aiHelpers.task` günceller. Sonuç önizlemedir; kalıcı dosya/Excel/IPC yazma YOK.
 * Orchestrator yerel kural motorudur; harici AI/ağ çağrısı yapmaz. render() caller'a (main.ts) aittir.
 */
import { state, selectedCase } from '../state';
import { buildEffectiveAiContext } from '../utils/ai-extra-context-mapping';
import { blankAiCaseContext } from '../../../shared/ai-context/ai-case-context';
import { getAllMevzuatItems } from '../../../shared/mevzuat/mevzuat-index';
import { runAiDraftTask } from '../../../shared/ai/ai-orchestrator';
import { DEFAULT_AI_PRIVACY_MODE } from '../../../shared/ai/ai-runtime-config-types';

const HISTORY_LIMIT = 5;

export function generateDraftTask(): void {
  const ctx = buildEffectiveAiContext(selectedCase(), state.aiHelpers.extra) ?? blankAiCaseContext();
  const result = runAiDraftTask({
    taskType: state.aiHelpers.task.taskType,
    caseContext: ctx,
    mevzuatItems: getAllMevzuatItems(),
    userInstruction: state.aiHelpers.task.userInstruction,
    privacyMode: DEFAULT_AI_PRIVACY_MODE,
    mode: 'local_rules'
  });
  state.aiHelpers.task.result = result;
  state.aiHelpers.task.copyError = '';
  state.aiHelpers.task.history = [result, ...state.aiHelpers.task.history].slice(0, HISTORY_LIMIT);
  state.toast = 'Taslak üretildi (yerel kural motoru; yalnız önizleme, dosyaya yazılmadı).';
  state.toastKind = 'info';
}

export function clearDraftResult(): void {
  state.aiHelpers.task.result = null;
  state.aiHelpers.task.copyError = '';
}

export function selectDraftHistory(taskId: string | undefined): void {
  if (!taskId) return;
  const found = state.aiHelpers.task.history.find((r) => r.taskId === taskId);
  if (found) { state.aiHelpers.task.result = found; state.aiHelpers.task.copyError = ''; }
}
