/**
 * v0.6.x — AI Orchestrator v1 (YEREL KURAL). Tek giriş noktası: runAiDraftTask.
 *
 * SAF/shared: ağ/dosya/IPC/dış AI YOK. provider her zaman 'local_rules', writePolicy 'preview_only'.
 * Çıktı yalnız önizleme; hiçbir yere kaydedilmez.
 */
import { blankAiCaseContext } from '../ai-context/ai-case-context';
import type { AiDraftTaskInput } from './ai-orchestrator-types';
import type { AiDraftTaskResult } from './ai-task-result-types';
import { runLocalRuleProvider } from './local-rules/local-rule-provider';

function makeTaskId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Yerel kural motoruyla taslak/öneri üretir. Dış AI çağrısı YOKTUR. Sonuç yalnız önizleme içindir.
 */
export function runAiDraftTask(input: AiDraftTaskInput): AiDraftTaskResult {
  const safeInput: AiDraftTaskInput = {
    ...input,
    mode: 'local_rules',
    caseContext: input.caseContext ?? blankAiCaseContext(),
    mevzuatItems: input.mevzuatItems ?? []
  };
  const output = runLocalRuleProvider(safeInput);
  return {
    ...output,
    taskId: makeTaskId(),
    createdAt: new Date().toISOString(),
    provider: 'local_rules',
    writePolicy: 'preview_only'
  };
}
