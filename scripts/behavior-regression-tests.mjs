import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { TrackingFileService } from '../dist-electron/main/tracking/tracking-file-service.js';
import { createDefaultTracking } from '../dist-electron/main/tracking/tracking-defaults.js';
import { parseMoney, distributeAmounts, inspectLaborExcel } from '../dist-electron/main/import/excel-importer.js';
import { analyzeDocuments } from '../dist-electron/main/import/document-analyzer.js';
import { analyzePhotos } from '../dist-electron/main/import/photo-analyzer.js';
import { LocalCacheStore } from '../dist-electron/main/local-cache/local-cache-store.js';
import { PcloudYearScanner } from '../dist-electron/main/scanner/pcloud-year-scanner.js';
import { FolderAnalyzer } from '../dist-electron/main/scanner/folder-analyzer.js';
import { getFolderFingerprint } from '../dist-electron/main/scanner/folder-fingerprint.js';
import { inferYearFromRootPath } from '../dist-electron/shared/constants.js';
import { isPathInsideNormalized } from '../dist-electron/shared/path-normalization.js';
import { parsePlateFromFolderName, parseDosyaNoFromFolderName } from '../dist-electron/main/scanner/case-folder-utils.js';
import { parsePartsResponse } from '../dist-electron/main/import/parts-list-analyzer.js';
import { normalizePartName } from '../dist-electron/shared/parca-sozlugu.js';
import { evaluatePlateMatch, looksLikePlate } from '../dist-electron/shared/plate-match.js';
import { resolvePlateFromPath, resolveCaseFolderFromPath, assertSelectedPhotoMatchesCase } from '../dist-electron/main/services/case-asset-guard.js';
import { classifyByRules, applyDistributionConstraints, roundTo250 } from '../dist-electron/shared/labor-rules.js';
import { deleteLearned, exportLaborLearningJson, importLaborLearningJson, isLearnableLaborAlias, lookupLearned, recordLearned, laborNameSimilarity, setLearnedActive, updateLearned } from '../dist-electron/shared/labor-learning-dictionary.js';
import { AUTO_LABOR_DEFAULT_PAGE_SIZE, AUTO_LABOR_PAGE_SIZE_OPTIONS, AUTO_LABOR_ROWS_PER_PAGE, buildAutoLaborPageModel, buildAutoLaborStats, buildAutoLaborSavePlan, autoLaborFilterMatches, autoLaborSearchMatches, normalizeAutoLaborPageSize } from '../dist-electron/shared/auto-labor-view-model.js';
import { classifyLaborRow } from '../dist-electron/main/services/labor-classifier-service.js';
import { buildAutoLaborPreview } from '../dist-electron/main/services/labor-preview-service.js';
import { saveAutoLaborExcel } from '../dist-electron/main/services/labor-excel-writer.js';
import { buildGenericLaborWorkbook, loadWorkbook } from '../dist-electron/main/import/excel-importer.js';
import { applyHeavyDamageEdits, buildHeavyDamagePreview, classifyHeavyDamagePart, generateHeavyDamageAssessmentMailDraft, generateHeavyDamageAssessmentNote, heavyDamageFilterMatches, HEAVY_DAMAGE_ECONOMIC_THRESHOLD, HEAVY_DAMAGE_THRESHOLD } from '../dist-electron/shared/heavy-damage-rules.js';
import { AiOrchestratorService } from '../dist-electron/main/services/ai/ai-orchestrator-service.js';
import { AiProviderRegistry } from '../dist-electron/main/services/ai/ai-provider-registry.js';
import { AiTaskQueueService } from '../dist-electron/main/services/ai/ai-task-queue-service.js';
import { normalizeKnowledgeText, tokenizeKnowledgeText } from '../dist-electron/main/services/knowledge/knowledge-normalizer.js';
import { KnowledgeSearchService } from '../dist-electron/main/services/knowledge/knowledge-search-service.js';
import { KnowledgeSourceRegistry } from '../dist-electron/main/services/knowledge/knowledge-source-registry.js';
import { buildDryRunPlan } from '../dist-electron/main/services/knowledge/knowledge-import-planner.js';
import { buildKnowledgeImportPlanViewModel } from '../dist-electron/shared/knowledge/knowledge-import-plan-view-model.js';
import { buildSampleKnowledgeImportApprovalState, buildSampleKnowledgeImportPlan } from '../dist-electron/shared/knowledge/knowledge-import-plan-sample.js';
import { applyKnowledgeImportApprovalDecision, createKnowledgeImportApprovalState, getKnowledgeImportApprovalState, summarizeKnowledgeImportApprovals } from '../dist-electron/shared/knowledge/knowledge-import-approval.js';
import { KNOWLEDGE_IMPORT_FORBIDDEN_WRITE_TARGETS, KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED, assertKnowledgeImportPersistentWriteAllowed } from '../dist-electron/shared/knowledge/knowledge-import-write-lock.js';
import { UserKnowledgeStoreFile, defaultUserKnowledgeStore } from '../dist-electron/main/local-cache/user-knowledge-store.js';
import { buildKnowledgeImportCommitPlan } from '../dist-electron/shared/knowledge/knowledge-import-commit-plan.js';
import { commitApprovedKnowledgeImportTextPreview } from '../dist-electron/main/services/knowledge/knowledge-import-commit-service.js';
import { searchUserKnowledgeEntries, mergeUserKnowledgeIntoResponse, USER_KNOWLEDGE_RESULT_LABEL } from '../dist-electron/main/services/knowledge/user-knowledge-search-service.js';
import { filterKnowledgeResultsByOrigin, isKnowledgeSourceFilter, KNOWLEDGE_SOURCE_FILTERS } from '../dist-electron/shared/knowledge/knowledge-source-filter.js';
import { AI_FINAL_APPROVAL_WARNING_CODE, normalizeAiTaskRequest } from '../dist-electron/shared/ai/ai-safety.js';
import { IPC_INVOKE_CHANNELS } from '../dist-electron/shared/ipc-contract.js';
import { isForbiddenKnowledgeChannel, isKnowledgeReadOnlyChannel } from '../dist-electron/shared/knowledge/knowledge-safety.js';
import { normalizeSettings } from '../dist-electron/main/services/settings-normalizer.js';

const checks = [];
function ok(name) { checks.push({ name, ok: true }); console.log(`TAMAM - ${name}`); }
function fail(name, message) { checks.push({ name, ok: false, message }); console.error(`HATA - ${name}: ${message}`); }
function assert(condition, name, message) { condition ? ok(name) : fail(name, message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function round2(n) { return Math.round(n * 100) / 100; }
function makeTextPdf(lines) {
  const escapePdf = (value) => String(value).replace(/([\\()])/g, '\\$1');
  const textOps = lines.flatMap((line, index) => [index === 0 ? '' : '0 -18 Td', `(${escapePdf(line)}) Tj`]).filter(Boolean);
  const content = ['BT', '/F1 12 Tf', '72 720 Td', ...textOps, 'ET'].join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream\nendobj\n`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += object;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function makeDocx(text) {
  const body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${String(text).split(/\r?\n/).map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`;
  return makeStoredZip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', body]
  ]);
}

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function makeStoredZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text, declaredUncompressedSize] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const uncompressedSize = declaredUncompressedSize ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, label, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await wait(1);
  }
  throw new Error(`Zaman asimi: ${label}`);
}

function makeAiRequest(taskId, taskType = 'generic_rule_assist', input = { text: 'AI queue test' }, overrides = {}) {
  return normalizeAiTaskRequest({ taskId, taskType, input, ...overrides });
}

function makeAiResult(request, status = 'ok', providerId = 'test-ai-runner') {
  return {
    taskId: request.taskId,
    taskType: request.taskType,
    status,
    providerId,
    mode: 'rule',
    summary: status === 'ok' ? 'Test AI gorevi tamamlandi.' : 'Test AI gorevi kullanici girdisi bekliyor.',
    confidence: status === 'ok' ? 'medium' : 'low',
    recommendations: [],
    warnings: [],
    userQuestions: status === 'needs_user_input' ? [{ id: 'test-question', question: 'Test girdisi gerekli mi?', required: true }] : [],
    rationale: [{ code: 'TEST_RUNNER', message: 'Deterministik test runner sonucu.' }],
    sources: [{ id: providerId, label: providerId, kind: 'system' }],
    previewWrites: [],
    requiresUserApproval: true,
    canWriteAutomatically: false,
    ...(status === 'error' ? { error: { code: 'TEST_AI_ERROR', message: 'Test hatasi' } } : {}),
    createdAt: new Date().toISOString()
  };
}

function createDelayedAiRunner(delayMs, status = 'ok') {
  let active = 0;
  let maxObserved = 0;
  return {
    getMaxObserved() { return maxObserved; },
    async run(request, options = {}) {
      active += 1;
      maxObserved = Math.max(maxObserved, active);
      options.onProgress?.({ phase: 'running', percent: 55, message: 'Test AI gorevi calisiyor', updatedAt: new Date().toISOString() });
      try {
        await wait(delayMs);
        if (options.signal?.aborted) return makeAiResult(request, 'error', 'delayed-test-runner');
        if (status === 'throw') throw new Error('Deterministik test hatasi');
        return makeAiResult(request, status, 'delayed-test-runner');
      } finally {
        active -= 1;
      }
    }
  };
}

function createNeverResolvingAiRunner() {
  return {
    run(_request, options = {}) {
      options.onProgress?.({ phase: 'running', percent: 50, message: 'Test AI gorevi beklemede', updatedAt: new Date().toISOString() });
      return new Promise(() => undefined);
    }
  };
}

// v0.6.0 P0: Ucretsiz/local AI Orchestrator cekirdegi kalici yazma yapmadan sadece guvenli preview sonuc uretir.
const aiOrchestrator = new AiOrchestratorService();
const aiProviders = aiOrchestrator.listProviders();
assert(aiProviders.length === 2 && aiProviders.every((provider) => provider.cost === 'free' && provider.locality === 'local' && provider.usesInternet === false && provider.requiresApiKey === false), 'v0.6.0 AI orchestrator yalnizca ucretsiz/local providerlari listeler', JSON.stringify(aiProviders));
const ruleAiResult = await aiOrchestrator.run({
  taskId: 'ai-rule-1',
  taskType: 'generic_rule_assist',
  input: { text: 'Dosya notunu kontrol et ve taslak oner.' },
  privacyLevel: 'local_only',
  providerPolicy: { allowPaidProviders: false, allowExternalProviders: false, allowLocalModel: false, preferDeterministicRules: true },
  requiresUserApproval: false
});
assert(ruleAiResult.providerId === 'rule-ai-provider' && ruleAiResult.mode === 'rule' && ruleAiResult.status === 'ok', 'v0.6.0 AI orchestrator varsayilan olarak yerel kural provider kullanir', JSON.stringify(ruleAiResult));
assert(ruleAiResult.requiresUserApproval === true && ruleAiResult.canWriteAutomatically === false, 'v0.6.0 AI sonucu kullanici onayi olmadan otomatik yazamaz', JSON.stringify({ requiresUserApproval: ruleAiResult.requiresUserApproval, canWriteAutomatically: ruleAiResult.canWriteAutomatically }));
assert(ruleAiResult.warnings.some((warning) => warning.code === AI_FINAL_APPROVAL_WARNING_CODE), 'v0.6.0 AI sonucu nihai karar olmadigi uyarisini zorunlu tasir', JSON.stringify(ruleAiResult.warnings));
const paidAiResult = await aiOrchestrator.run({
  taskId: 'ai-paid-blocked',
  taskType: 'generic_rule_assist',
  input: { text: 'Ucretli provider denemesi' },
  providerPolicy: { allowPaidProviders: true, allowExternalProviders: false, allowLocalModel: false, preferDeterministicRules: true }
});
assert(paidAiResult.status === 'blocked' && paidAiResult.providerId === 'ai-safety' && paidAiResult.error?.code === 'AI_PAID_PROVIDER_NOT_ALLOWED', 'v0.6.0 AI ucretli provider istegini guvenlikte bloke eder', JSON.stringify(paidAiResult));
const externalAiResult = await aiOrchestrator.run({
  taskId: 'ai-external-blocked',
  taskType: 'generic_rule_assist',
  input: { text: 'Harici provider denemesi' },
  providerPolicy: { allowPaidProviders: false, allowExternalProviders: true, allowLocalModel: false, preferDeterministicRules: true }
});
assert(externalAiResult.status === 'blocked' && externalAiResult.error?.code === 'AI_EXTERNAL_PROVIDER_NOT_ALLOWED', 'v0.6.0 AI harici provider istegini bu asamada kapali tutar', JSON.stringify(externalAiResult));
const aiNoopTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ai-noop-'));
const noopAiResult = await aiOrchestrator.run({
  taskId: 'ai-noop-1',
  taskType: 'document_check',
  input: { folderPath: aiNoopTemp, trackingPath: path.join(aiNoopTemp, 'takip.json') }
});
assert(noopAiResult.providerId === 'noop-ai-provider' && noopAiResult.status === 'needs_user_input' && (await fs.readdir(aiNoopTemp)).length === 0, 'v0.6.0 Noop provider takip.json veya dosya yazmaz', JSON.stringify(noopAiResult));
const aiRuleTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ai-rule-'));
const ruleNoWriteResult = await aiOrchestrator.run({
  taskId: 'ai-rule-nowrite',
  taskType: 'generic_rule_assist',
  input: { text: 'Kural provider yazma testi', trackingPath: path.join(aiRuleTemp, 'takip.json') }
});
assert(ruleNoWriteResult.providerId === 'rule-ai-provider' && (await fs.readdir(aiRuleTemp)).length === 0, 'v0.6.0 Rule provider takip.json veya dosya yazmaz', JSON.stringify(ruleNoWriteResult));
const unsafeProvider = {
  getProviderInfo() {
    return {
      providerId: 'unsafe-test-provider',
      displayName: 'Unsafe Test Provider',
      cost: 'free',
      locality: 'local',
      usesInternet: false,
      requiresApiKey: false,
      supportsTaskTypes: ['generic_rule_assist'],
      modes: ['rule']
    };
  },
  canHandle() { return true; },
  async run(request) {
    return {
      taskId: request.taskId,
      taskType: request.taskType,
      status: 'ok',
      providerId: 'unsafe-test-provider',
      mode: 'rule',
      summary: 'Unsafe provider sonucu',
      confidence: 'high',
      recommendations: [],
      warnings: [],
      userQuestions: [],
      rationale: [],
      sources: [],
      previewWrites: [{ target: 'takip.json', operation: 'update', fieldPath: 'labor.not', after: 'AI yazisi', reason: 'test', requiresUserApproval: false }],
      requiresUserApproval: false,
      canWriteAutomatically: true,
      createdAt: new Date().toISOString()
    };
  }
};
const guardedAi = new AiOrchestratorService(new AiProviderRegistry([unsafeProvider]));
const guardedAiResult = await guardedAi.run({ taskId: 'ai-guarded-1', taskType: 'generic_rule_assist', input: { text: 'guard test' } });
assert(guardedAiResult.canWriteAutomatically === false && guardedAiResult.requiresUserApproval === true && guardedAiResult.previewWrites.every((write) => write.requiresUserApproval === true), 'v0.6.0 AI safety provider sonucundaki otomatik yazma ve onaysiz previewWrite alanlarini bastirir', JSON.stringify(guardedAiResult));

// v0.6.0 P1: AI Task Queue memory-only progress/cancel/retry/timeout altyapisi.
const aiQueueDefault = new AiTaskQueueService();
assert(aiQueueDefault.getOptions().maxConcurrency === 1 && aiQueueDefault.getOptions().defaultTimeoutMs === 120000, 'v0.6.0 AI queue varsayilan maxConcurrency=1 ve guvenli timeout ile baslar', JSON.stringify(aiQueueDefault.getOptions()));
const queuedOnlyTask = aiQueueDefault.enqueue(makeAiRequest('queue-default-queued'));
assert(queuedOnlyTask.status === 'queued' && aiQueueDefault.getTask(queuedOnlyTask.queueTaskId)?.status === 'queued', 'v0.6.0 AI queue enqueue edilen gorevi queued durumuna alir', JSON.stringify(queuedOnlyTask));
assert(aiQueueDefault.cancelTask(queuedOnlyTask.queueTaskId, 'Test temizligi') && aiQueueDefault.getTask(queuedOnlyTask.queueTaskId)?.status === 'canceled', 'v0.6.0 AI queue queued gorevi calismadan iptal eder', JSON.stringify(aiQueueDefault.getTask(queuedOnlyTask.queueTaskId)));

const queueWriteGuardRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ai-queue-write-'));
const queueExcelPath = path.join(queueWriteGuardRoot, 'queue-test.xlsx');
await fs.writeFile(queueExcelPath, 'ORIGINAL-XLSX-CONTENT', 'utf-8');
const aiQueueEvents = [];
const aiQueue = new AiTaskQueueService();
aiQueue.onEvent((event) => aiQueueEvents.push(event));
const queuedRuleTask = aiQueue.enqueue(makeAiRequest('queue-rule-1', 'generic_rule_assist', { text: 'Kuyruk uzerinden yerel kural testi', trackingPath: path.join(queueWriteGuardRoot, 'takip.json'), excelPath: queueExcelPath }));
aiQueue.start();
await aiQueue.drainForTests();
const queuedRuleDone = aiQueue.getTask(queuedRuleTask.queueTaskId);
assert(queuedRuleDone?.status === 'succeeded' && queuedRuleDone.result?.providerId === 'rule-ai-provider', 'v0.6.0 AI queue rule provider generic_rule_assist gorevini calistirir', JSON.stringify(queuedRuleDone));
assert(queuedRuleDone?.result?.requiresUserApproval === true && queuedRuleDone.result.canWriteAutomatically === false, 'v0.6.0 AI queue sonucu kullanici onayi olmadan otomatik yazamaz', JSON.stringify(queuedRuleDone?.result));
assert((await fs.readdir(queueWriteGuardRoot)).join(',') === 'queue-test.xlsx' && (await fs.readFile(queueExcelPath, 'utf-8')) === 'ORIGINAL-XLSX-CONTENT', 'v0.6.0 AI queue takip.json veya Excel dosyasi yazmaz', JSON.stringify(await fs.readdir(queueWriteGuardRoot)));
const aiQueueCoreEvents = aiQueueEvents.map((event) => event.type).filter((type) => ['task_queued', 'task_started', 'task_succeeded'].includes(type));
assert(aiQueueCoreEvents.join('>') === 'task_queued>task_started>task_succeeded', 'v0.6.0 AI queue event sirasi queued-started-succeeded olarak izlenir', aiQueueCoreEvents.join('>'));
assert(aiQueueEvents.every((event) => event.task.progress.percent >= 0 && event.task.progress.percent <= 100), 'v0.6.0 AI queue progress yuzdesi 0-100 arasinda kalir', JSON.stringify(aiQueueEvents.map((event) => event.task.progress.percent)));
const aiQueueHistory = aiQueue.getEvents(100);
const aiQueueHistoryTypes = aiQueueHistory.map((event) => event.type);
assert(aiQueueHistory.every((event) => event.eventId && event.queueTaskId && event.aiTaskId && event.taskType && event.message && event.createdAt), 'v0.6.0 P1-E AI queue event history okunabilir event alanlarini tasir', JSON.stringify(aiQueueHistory[0]));
assert(aiQueueHistoryTypes.includes('task_queued') && aiQueueHistoryTypes.includes('task_started') && aiQueueHistoryTypes.includes('task_succeeded'), 'v0.6.0 P1-E AI queue event history queued/started/succeeded olaylarini memory icinde tutar', aiQueueHistoryTypes.join('>'));
assert(aiQueueHistory.find((event) => event.type === 'task_queued')?.severity === 'info' && aiQueueHistory.find((event) => event.type === 'task_started')?.severity === 'info' && aiQueueHistory.find((event) => event.type === 'task_succeeded')?.severity === 'success', 'v0.6.0 P1-E AI queue queued/started/succeeded severity mapping dogru', JSON.stringify(aiQueueHistory));
assert(aiQueueHistory.find((event) => event.type === 'task_progress')?.severity === 'info' && aiQueueHistory.find((event) => event.type === 'queue_drained')?.severity === 'info', 'v0.6.0 P1-E AI queue progress ve drained olaylari info severity alir', JSON.stringify(aiQueueHistory));
assert(aiQueue.getEvents(3).length <= 3 && aiQueue.getEvents(3).every((event, index, list) => index === 0 || Date.parse(list[index - 1].createdAt) >= Date.parse(event.createdAt)), 'v0.6.0 P1-E AI queue event history en yeni ustte ve limitli doner', JSON.stringify(aiQueue.getEvents(3)));
assert((await fs.readdir(queueWriteGuardRoot)).join(',') === 'queue-test.xlsx' && (await fs.readFile(queueExcelPath, 'utf-8')) === 'ORIGINAL-XLSX-CONTENT', 'v0.6.0 P1-E AI queue event history memory-only kalir ve disk yazmaz', JSON.stringify(await fs.readdir(queueWriteGuardRoot)));

const noopQueue = new AiTaskQueueService();
const noopQueued = noopQueue.enqueue(makeAiRequest('queue-noop-1', 'document_check', { text: 'Desteklenmeyen gorev' }));
noopQueue.start();
await noopQueue.drainForTests();
const noopQueuedDone = noopQueue.getTask(noopQueued.queueTaskId);
assert(noopQueuedDone?.status === 'needs_user_input' && noopQueuedDone.result?.providerId === 'noop-ai-provider', 'v0.6.0 AI queue desteklenmeyen task icin noop provider ile kullanici girdisi ister', JSON.stringify(noopQueuedDone));
assert(noopQueue.getEvents(100).find((event) => event.type === 'task_needs_user_input')?.severity === 'warning', 'v0.6.0 P1-E AI queue needs_user_input olayi warning severity alir', JSON.stringify(noopQueue.getEvents(100)));

const runningCancelQueue = new AiTaskQueueService(createNeverResolvingAiRunner(), { defaultTimeoutMs: 5000 });
const runningCancelTask = runningCancelQueue.enqueue(makeAiRequest('queue-running-cancel'));
runningCancelQueue.start();
await waitUntil(() => runningCancelQueue.getTask(runningCancelTask.queueTaskId)?.status === 'running', 'running cancel gorevi baslamali');
assert(runningCancelQueue.cancelTask(runningCancelTask.queueTaskId, 'Running cancel test'), 'v0.6.0 AI queue running gorev icin cancel istegini kabul eder', JSON.stringify(runningCancelQueue.getTask(runningCancelTask.queueTaskId)));
await runningCancelQueue.drainForTests();
assert(runningCancelQueue.getTask(runningCancelTask.queueTaskId)?.status === 'canceled', 'v0.6.0 AI queue running gorev sonucunu iptal eder ve discard eder', JSON.stringify(runningCancelQueue.getTask(runningCancelTask.queueTaskId)));
assert(runningCancelQueue.getEvents(100).find((event) => event.type === 'task_canceled')?.severity === 'warning', 'v0.6.0 P1-E AI queue canceled olayi warning severity alir', JSON.stringify(runningCancelQueue.getEvents(100)));

const timeoutQueue = new AiTaskQueueService(createNeverResolvingAiRunner(), { defaultTimeoutMs: 25 });
const timeoutTask = timeoutQueue.enqueue(makeAiRequest('queue-timeout-1'), { timeoutMs: 25 });
timeoutQueue.start();
await timeoutQueue.drainForTests();
const timeoutDone = timeoutQueue.getTask(timeoutTask.queueTaskId);
assert(timeoutDone?.status === 'timed_out' && timeoutDone.error?.code === 'AI_QUEUE_TASK_TIMED_OUT', 'v0.6.0 AI queue zaman asimina dusen gorevi timed_out yapar', JSON.stringify(timeoutDone));
assert(timeoutQueue.getEvents(100).find((event) => event.type === 'task_timed_out')?.severity === 'error', 'v0.6.0 P1-E AI queue timed_out olayi error severity alir', JSON.stringify(timeoutQueue.getEvents(100)));

let flakyAttempts = 0;
const flakyRunner = {
  async run(request) {
    flakyAttempts += 1;
    if (flakyAttempts === 1) throw new Error('Ilk deneme hatasi');
    return makeAiResult(request, 'ok', 'flaky-test-runner');
  }
};
const retryQueue = new AiTaskQueueService(flakyRunner, { defaultMaxAttempts: 2 });
const retryFirst = retryQueue.enqueue(makeAiRequest('queue-retry-1'), { maxAttempts: 2 });
retryQueue.start();
await retryQueue.drainForTests();
assert(retryQueue.getTask(retryFirst.queueTaskId)?.status === 'failed', 'v0.6.0 AI queue failed gorevi retry oncesi failed olarak tutar', JSON.stringify(retryQueue.getTask(retryFirst.queueTaskId)));
assert(retryQueue.getEvents(100).find((event) => event.type === 'task_failed')?.severity === 'error', 'v0.6.0 P1-E AI queue failed olayi error severity alir', JSON.stringify(retryQueue.getEvents(100)));
const retrySecond = retryQueue.retryTask(retryFirst.queueTaskId);
await retryQueue.drainForTests();
const retryDone = retryQueue.getTask(retrySecond.queueTaskId);
assert(retryDone?.status === 'succeeded' && retryDone.attempts === 2 && flakyAttempts === 2, 'v0.6.0 AI queue retry attempts sayisini guvenli yonetir', JSON.stringify(retryDone));

const singleRunner = createDelayedAiRunner(10);
const singleQueue = new AiTaskQueueService(singleRunner, { maxConcurrency: 1, defaultTimeoutMs: 1000 });
for (let index = 0; index < 3; index += 1) singleQueue.enqueue(makeAiRequest(`queue-single-${index}`));
singleQueue.start();
await singleQueue.drainForTests();
assert(singleRunner.getMaxObserved() === 1 && singleQueue.getSnapshot().succeeded === 3, 'v0.6.0 AI queue maxConcurrency=1 iken ayni anda tek gorev calistirir', JSON.stringify({ maxObserved: singleRunner.getMaxObserved(), snapshot: singleQueue.getSnapshot() }));

const doubleRunner = createDelayedAiRunner(10);
const doubleQueue = new AiTaskQueueService(doubleRunner, { maxConcurrency: 2, defaultTimeoutMs: 1000 });
for (let index = 0; index < 4; index += 1) doubleQueue.enqueue(makeAiRequest(`queue-double-${index}`));
doubleQueue.start();
await doubleQueue.drainForTests();
assert(doubleRunner.getMaxObserved() === 2 && doubleQueue.getSnapshot().succeeded === 4, 'v0.6.0 AI queue maxConcurrency=2 testinde en fazla iki gorev calistirir', JSON.stringify({ maxObserved: doubleRunner.getMaxObserved(), snapshot: doubleQueue.getSnapshot() }));

const clearQueue = new AiTaskQueueService(createNeverResolvingAiRunner(), { maxConcurrency: 1, defaultTimeoutMs: 5000 });
const clearRunning = clearQueue.enqueue(makeAiRequest('queue-clear-running'));
clearQueue.start();
await waitUntil(() => clearQueue.getTask(clearRunning.queueTaskId)?.status === 'running', 'clearFinished running gorevi baslamali');
const clearQueued = clearQueue.enqueue(makeAiRequest('queue-clear-canceled'));
clearQueue.cancelTask(clearQueued.queueTaskId, 'Clear finished test');
const removedFinished = clearQueue.clearFinished();
assert(removedFinished === 1 && clearQueue.getSnapshot().running === 1 && clearQueue.getTask(clearRunning.queueTaskId)?.status === 'running', 'v0.6.0 AI queue clearFinished bitmis gorevleri siler running gorevi silmez', JSON.stringify(clearQueue.getSnapshot()));
clearQueue.cancelTask(clearRunning.queueTaskId, 'Clear test temizligi');
await clearQueue.drainForTests();

const stoppedRunner = createDelayedAiRunner(1);
const stoppedQueue = new AiTaskQueueService(stoppedRunner);
stoppedQueue.start();
stoppedQueue.stop();
const stoppedTask = stoppedQueue.enqueue(makeAiRequest('queue-stop-1'));
await wait(5);
assert(stoppedQueue.getTask(stoppedTask.queueTaskId)?.status === 'queued' && stoppedQueue.getSnapshot().running === 0, 'v0.6.0 AI queue stop sonrasi yeni gorev baslatmaz', JSON.stringify(stoppedQueue.getSnapshot()));
stoppedQueue.cancelTask(stoppedTask.queueTaskId, 'Stop test temizligi');

const paidQueueRequest = {
  ...makeAiRequest('queue-paid-blocked'),
  providerPolicy: { allowPaidProviders: true, allowExternalProviders: false, allowLocalModel: false, preferDeterministicRules: true }
};
const paidQueue = new AiTaskQueueService();
const paidQueueTask = paidQueue.enqueue(paidQueueRequest);
paidQueue.start();
await paidQueue.drainForTests();
assert(paidQueue.getTask(paidQueueTask.queueTaskId)?.status === 'needs_user_input' && paidQueue.getTask(paidQueueTask.queueTaskId)?.result?.error?.code === 'AI_PAID_PROVIDER_NOT_ALLOWED', 'v0.6.0 AI queue ucretli provider engelini orchestrator safety uzerinden korur', JSON.stringify(paidQueue.getTask(paidQueueTask.queueTaskId)));

const externalQueueRequest = {
  ...makeAiRequest('queue-external-blocked'),
  providerPolicy: { allowPaidProviders: false, allowExternalProviders: true, allowLocalModel: false, preferDeterministicRules: true }
};
const externalQueue = new AiTaskQueueService();
const externalQueueTask = externalQueue.enqueue(externalQueueRequest);
externalQueue.start();
await externalQueue.drainForTests();
assert(externalQueue.getTask(externalQueueTask.queueTaskId)?.status === 'needs_user_input' && externalQueue.getTask(externalQueueTask.queueTaskId)?.result?.error?.code === 'AI_EXTERNAL_PROVIDER_NOT_ALLOWED', 'v0.6.0 AI queue harici provider engelini orchestrator safety uzerinden korur', JSON.stringify(externalQueue.getTask(externalQueueTask.queueTaskId)));

assert(
  IPC_INVOKE_CHANNELS.aiQueueGetSnapshot === 'aiQueue:getSnapshot'
    && IPC_INVOKE_CHANNELS.aiQueueGetEvents === 'aiQueue:getEvents'
    && IPC_INVOKE_CHANNELS.aiQueueGetTask === 'aiQueue:getTask'
    && IPC_INVOKE_CHANNELS.aiQueueEnqueuePreview === 'aiQueue:enqueuePreview'
    && IPC_INVOKE_CHANNELS.aiQueueCancelTask === 'aiQueue:cancelTask'
    && IPC_INVOKE_CHANNELS.aiQueueClearFinished === 'aiQueue:clearFinished'
    && !Object.values(IPC_INVOKE_CHANNELS).some((channel) => /^aiQueue:.*(save|write|apply|persist)/i.test(channel)),
  'v0.6.0 P1-B/P1-E AI queue IPC sadece read/status/events/preview/cancel/clear kanallarini acar',
  JSON.stringify(Object.entries(IPC_INVOKE_CHANNELS).filter(([key]) => key.startsWith('aiQueue')))
);

// v0.3.18: Para parser unit testleri Türkçe ve İngilizce formatları birlikte doğrular.
// v0.6.0 P2-A: Ucretsiz/local bilgi bankasi cekirdegi.
const knowledge = new KnowledgeSearchService();
assert(normalizeKnowledgeText('ÖN GÖĞÜS SACI') === 'on gogus saci' && normalizeKnowledgeText('Ön Göğüs') === 'on gogus', 'v0.6.0 P2-A knowledge normalizer Turkce karakterleri normalize eder', normalizeKnowledgeText('ÖN GÖĞÜS SACI'));
assert(tokenizeKnowledgeText('hava yastığı').includes('airbag') && tokenizeKnowledgeText('tenzil').includes('muafiyet') && tokenizeKnowledgeText('pert').includes('agir'), 'v0.6.0 P2-A knowledge normalizer basit synonym tokenlari uretir', JSON.stringify(tokenizeKnowledgeText('hava yastığı tenzil pert')));
const frontSearch = knowledge.search('On Gogus');
assert(frontSearch.results[0]?.sourceId === 'seed-front-firewall-rule' && frontSearch.results[0]?.tags.includes('on_gogus_saci'), 'v0.6.0 P2-A "On Gogus" aramasi on gogus saci chunkini bulur', JSON.stringify(frontSearch));
const firewallSearch = knowledge.search('firewall');
assert(firewallSearch.results[0]?.sourceId === 'seed-front-firewall-rule', 'v0.6.0 P2-A "firewall" aramasi on gogus saci kuralini bulur', JSON.stringify(firewallSearch));
const pertSearch = knowledge.search('pert');
assert(pertSearch.results.some((result) => result.sourceId === 'seed-heavy-damage-threshold'), 'v0.6.0 P2-A "pert" aramasi agir hasar kritik parca ozetini bulur', JSON.stringify(pertSearch));
const deductibleSearch = knowledge.search('muafiyet');
assert(deductibleSearch.results[0]?.sourceId === 'seed-policy-deductible-check', 'v0.6.0 P2-A "muafiyet" aramasi police muafiyet kontrol kuralini bulur', JSON.stringify(deductibleSearch));
const heavyTagSearch = knowledge.search({ query: '', tags: ['agir_hasar'], limit: 10, minScore: 1 });
assert(heavyTagSearch.results.length >= 3 && heavyTagSearch.results.every((result) => result.tags.includes('agir_hasar')), 'v0.6.0 P2-A tag filtresi agir_hasar sonuclarini dondurur', JSON.stringify(heavyTagSearch));
const policyTypeSearch = knowledge.search({ query: 'muafiyet', sourceTypes: ['policy_rule'], limit: 10 });
assert(policyTypeSearch.results.length > 0 && policyTypeSearch.results.every((result) => result.sourceId === 'seed-policy-deductible-check' || result.sourceId === 'seed-ai-safety-principle'), 'v0.6.0 P2-A source type filtresi policy_rule kaynaklariyla sinirlar', JSON.stringify(policyTypeSearch));
const frontTagFilteredSearch = knowledge.search({ query: 'on gogus', tags: ['agir_hasar'], limit: 10 });
assert(frontTagFilteredSearch.results[0]?.sourceId === 'seed-front-firewall-rule' && frontTagFilteredSearch.results[0]?.tags.includes('agir_hasar'), 'v0.6.0 P2-C query + tag filtresi on gogus sonucunu dondurur', JSON.stringify(frontTagFilteredSearch));
const policySourceTypeFilteredSearch = knowledge.search({ query: 'muafiyet', sourceTypes: ['policy_rule'], tags: ['police'], limit: 10 });
assert(policySourceTypeFilteredSearch.results[0]?.sourceId === 'seed-policy-deductible-check' && policySourceTypeFilteredSearch.results[0]?.sourceType === 'policy_rule', 'v0.6.0 P2-C query + sourceType + tag filtresi police muafiyet sonucunu dondurur', JSON.stringify(policySourceTypeFilteredSearch));
assert(frontSearch.results[0]?.sourceType === 'heavy_damage_rule' && frontSearch.results[0]?.priority === 'critical', 'v0.6.0 P2-C search sonuclari read-only sourceType ve priority metadata tasir', JSON.stringify(frontSearch.results[0]));
const disabledRegistry = new KnowledgeSourceRegistry({
  sources: [{ sourceId: 'disabled-policy', title: 'Disabled Police Rule', sourceType: 'policy_rule', createdAt: '2026-06-20T00:00:00.000Z', tags: ['police', 'yanlis_tag'], isEnabled: false }],
  chunks: [{ chunkId: 'disabled-policy:chunk-1', sourceId: 'disabled-policy', title: 'Disabled muafiyet', text: 'muafiyet bilgisi disabled kaynakta kalmali', normalizedText: '', tags: ['police'], priority: 'critical', createdAt: '2026-06-20T00:00:00.000Z' }]
});
const disabledSearch = new KnowledgeSearchService(disabledRegistry).search('muafiyet');
assert(disabledSearch.total === 0, 'v0.6.0 P2-A disabled source arama sonuclarinda donmez', JSON.stringify(disabledSearch));
const limitedKnowledge = knowledge.search({ query: 'agir hasar police ai', limit: 2, minScore: 1 });
assert(limitedKnowledge.results.length <= 2, 'v0.6.0 P2-A search limit uygulanir', JSON.stringify(limitedKnowledge));
const deterministicA = knowledge.search('on gogus');
const deterministicB = knowledge.search('on gogus');
assert(JSON.stringify(deterministicA.results.map((result) => [result.sourceId, result.chunkId, result.score])) === JSON.stringify(deterministicB.results.map((result) => [result.sourceId, result.chunkId, result.score])), 'v0.6.0 P2-A score siralamasi deterministiktir', JSON.stringify(deterministicA.results));
assert(frontSearch.results[0]?.matchedTerms.includes('gogus') && frontSearch.results[0]?.matchedTerms.includes('on'), 'v0.6.0 P2-A matched terms doner', JSON.stringify(frontSearch.results[0]));
assert(frontSearch.results.every((result) => result.sourceId && result.chunkId && result.sourceTitle), 'v0.6.0 P2-A sonuclar sourceId/chunkId/sourceTitle tasir', JSON.stringify(frontSearch.results));
const knowledgeNoWriteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-knowledge-nowrite-'));
knowledge.search('police muafiyet');
assert((await fs.readdir(knowledgeNoWriteRoot)).length === 0, 'v0.6.0 P2-A bilgi bankasi disk takip.json veya Excel yazmaz', JSON.stringify(await fs.readdir(knowledgeNoWriteRoot)));
const knowledgeSource = knowledge.getSource('seed-policy-deductible-check');
const knowledgeChunk = knowledge.getChunk('seed-policy-deductible-check:chunk-1');
assert(knowledge.listSources().length >= 5 && knowledgeSource?.sourceType === 'policy_rule' && knowledgeChunk?.sourceId === 'seed-policy-deductible-check', 'v0.6.0 P2-A listSources/getSource/getChunk read-only calisir', JSON.stringify({ source: knowledgeSource, chunk: knowledgeChunk }));
assert(knowledge.listSources().every((source) => Number.isInteger(source.chunkCount) && source.chunkCount >= 0) && (knowledgeSource?.chunkCount ?? 0) > 0, 'v0.6.0 P2-B kaynak listesi chunk sayisini read-only metadata olarak verir', JSON.stringify(knowledge.listSources()));
assert(
  IPC_INVOKE_CHANNELS.knowledgeSearch === 'knowledge:search'
    && IPC_INVOKE_CHANNELS.knowledgeListSources === 'knowledge:listSources'
    && IPC_INVOKE_CHANNELS.knowledgeGetSource === 'knowledge:getSource'
    && IPC_INVOKE_CHANNELS.knowledgeGetChunk === 'knowledge:getChunk'
    && ['knowledge:search', 'knowledge:listSources', 'knowledge:getSource', 'knowledge:getChunk'].every(isKnowledgeReadOnlyChannel)
    && !Object.values(IPC_INVOKE_CHANNELS).some((channel) => isForbiddenKnowledgeChannel(channel)),
  'v0.6.0 P2-A knowledge IPC sadece read-only search/list/get kanallarini acar',
  JSON.stringify(Object.entries(IPC_INVOKE_CHANNELS).filter(([key]) => key.startsWith('knowledge')))
);
const expectedKnowledgeChannels = ['knowledge:getChunk', 'knowledge:getSource', 'knowledge:listSources', 'knowledge:search'];
const actualKnowledgeChannels = Object.values(IPC_INVOKE_CHANNELS).filter((channel) => channel.startsWith('knowledge:')).sort();
const forbiddenKnowledgeChannels = ['knowledge:write', 'knowledge:save', 'knowledge:apply', 'knowledge:import', 'knowledge:export', 'knowledge:delete', 'knowledge:edit', 'knowledge:sync', 'knowledge:upload', 'knowledge:download', 'knowledge:copy', 'knowledge:provider'];
assert(JSON.stringify(actualKnowledgeChannels) === JSON.stringify(expectedKnowledgeChannels) && forbiddenKnowledgeChannels.every(isForbiddenKnowledgeChannel), 'v0.6.0 P2-E knowledge IPC exact allowlist ve yasak kanal patterni korunur', JSON.stringify({ actualKnowledgeChannels, forbiddenKnowledgeChannels: forbiddenKnowledgeChannels.filter(isForbiddenKnowledgeChannel) }));

// v0.6.0 P3-A: Local kaynak import izin modeli gercek import yapmadan dry-run plan uretir.
const knowledgeImportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-knowledge-import-dryrun-'));
const knowledgeImportTracking = path.join(knowledgeImportRoot, 'takip.json');
const knowledgeImportExcel = path.join(knowledgeImportRoot, 'portal.xlsx');
const knowledgeImportAppData = path.join(knowledgeImportRoot, 'appdata');
await fs.mkdir(knowledgeImportAppData);
await fs.writeFile(knowledgeImportTracking, 'TRACKING-ORIGINAL', 'utf-8');
await fs.writeFile(knowledgeImportExcel, 'EXCEL-ORIGINAL', 'utf-8');
const importDryRun = buildDryRunPlan({
  mode: 'dry_run',
  preferredTags: ['onay'],
  files: [
    { fileName: 'Agir Hasar Kritik Parca Rehberi.pdf', filePath: path.join(knowledgeImportRoot, 'Agir Hasar Kritik Parca Rehberi.pdf'), sizeBytes: 1200 },
    { fileName: 'is notlari kaporta boya mekanik.docx' },
    { fileName: 'KTT kaza durum senaryo.pdf' },
    { fileName: 'kusur oranlari tablo.jpg' },
    { fileName: 'mutabakatname taslak.docx' },
    { fileName: 'police muafiyet indirim notu.pdf' },
    { fileName: 'belirsiz kaynak.pdf' },
    { fileName: 'ihbar takip listesi.xlsx', filePath: knowledgeImportExcel },
    { fileName: 'tehlikeli.exe' },
    { fileName: 'komut.bat' },
    { fileName: 'arsiv.zip' },
    { fileName: 'arsiv.rar' }
  ]
});
const importCandidates = importDryRun.plan.candidates;
const importCandidate = (fileName) => importCandidates.find((candidate) => candidate.fileName === fileName);
assert(importCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.detectedSourceKind === 'heavy_damage_guide' && importCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.detectedSourceType === 'heavy_damage_rule' && importCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.detectedTags.includes('agir_hasar'), 'v0.6.0 P3-A PDF agir hasar rehberi sourceKind/sourceType/tag olarak taninir', JSON.stringify(importCandidate('Agir Hasar Kritik Parca Rehberi.pdf')));
assert(importCandidate('is notlari kaporta boya mekanik.docx')?.detectedSourceKind === 'expert_note' && importCandidate('is notlari kaporta boya mekanik.docx')?.detectedSourceType === 'office_note' && importCandidate('is notlari kaporta boya mekanik.docx')?.detectedTags.includes('iscilik'), 'v0.6.0 P3-A DOCX is notlari ekspert notu olarak taninir', JSON.stringify(importCandidate('is notlari kaporta boya mekanik.docx')));
assert(importCandidate('KTT kaza durum senaryo.pdf')?.detectedSourceKind === 'fault_scenario_guide' && importCandidate('KTT kaza durum senaryo.pdf')?.detectedTags.includes('ktt'), 'v0.6.0 P3-A PDF KTT kaza senaryolari kusur rehberi olarak taninir', JSON.stringify(importCandidate('KTT kaza durum senaryo.pdf')));
assert(importCandidate('kusur oranlari tablo.jpg')?.detectedSourceKind === 'fault_ratio_image' && importCandidate('kusur oranlari tablo.jpg')?.detectedSourceType === 'fault_rule' && importCandidate('kusur oranlari tablo.jpg')?.detectedTags.includes('asli_kusur'), 'v0.6.0 P3-A JPG kusur oranlari gorsel adayi olarak taninir', JSON.stringify(importCandidate('kusur oranlari tablo.jpg')));
assert(importCandidate('mutabakatname taslak.docx')?.detectedSourceKind === 'settlement_template' && importCandidate('mutabakatname taslak.docx')?.detectedSourceType === 'template' && importCandidate('mutabakatname taslak.docx')?.detectedTags.includes('mutabakat'), 'v0.6.0 P3-A DOCX mutabakatname template olarak taninir', JSON.stringify(importCandidate('mutabakatname taslak.docx')));
assert(importCandidate('police muafiyet indirim notu.pdf')?.detectedSourceKind === 'policy_note' && importCandidate('police muafiyet indirim notu.pdf')?.detectedSourceType === 'policy_rule' && importCandidate('police muafiyet indirim notu.pdf')?.detectedTags.includes('muafiyet'), 'v0.6.0 P3-A police/muafiyet dosya adi policy_note olarak taninir', JSON.stringify(importCandidate('police muafiyet indirim notu.pdf')));
assert(importCandidate('belirsiz kaynak.pdf')?.detectedSourceKind === 'unknown' && importCandidate('belirsiz kaynak.pdf')?.permission === 'dry_run_only' && importCandidate('belirsiz kaynak.pdf')?.warnings.some((warning) => warning.includes('manuel eslestirme')), 'v0.6.0 P3-A unknown dosya guvenli manuel eslestirme uyarisi doner', JSON.stringify(importCandidate('belirsiz kaynak.pdf')));
assert(importCandidate('ihbar takip listesi.xlsx')?.detectedSourceKind === 'claim_tracking_sheet' && importCandidate('ihbar takip listesi.xlsx')?.permission === 'dry_run_only' && importCandidate('ihbar takip listesi.xlsx')?.warnings.some((warning) => warning.includes('Excel import/parsing')), 'v0.6.0 P3-A ihbar takip Excel sadece dry-run adayi olur ve parse edilmez', JSON.stringify(importCandidate('ihbar takip listesi.xlsx')));
assert(importCandidate('tehlikeli.exe')?.permission === 'not_allowed' && importCandidate('komut.bat')?.permission === 'not_allowed' && importCandidate('arsiv.zip')?.permission === 'not_allowed' && importCandidate('arsiv.rar')?.permission === 'not_allowed', 'v0.6.0 P3-A exe/bat/zip/rar tehlikeli uzantilari not_allowed olur', JSON.stringify(importCandidates.filter((candidate) => candidate.permission === 'not_allowed')));
assert(importDryRun.plan.mode === 'dry_run' && importDryRun.plan.canWrite === false && importCandidates.every((candidate) => candidate.canWrite === false) && importDryRun.plan.totals.totalCandidates === 12 && importDryRun.plan.totals.notAllowed === 4 && importDryRun.plan.totals.requiresApproval === 6 && importDryRun.plan.totals.allowedForDryRun === 8, 'v0.6.0 P3-A dry-run plan canWrite=false ve toplamlari guvenli hesaplar', JSON.stringify(importDryRun.plan.totals));
assert((await fs.readFile(knowledgeImportTracking, 'utf-8')) === 'TRACKING-ORIGINAL' && (await fs.readFile(knowledgeImportExcel, 'utf-8')) === 'EXCEL-ORIGINAL' && (await fs.readdir(knowledgeImportAppData)).length === 0, 'v0.6.0 P3-A dry-run takip.json Excel AppData yazmaz', JSON.stringify(await fs.readdir(knowledgeImportRoot)));
let nonDryRunBlocked = false;
try {
  buildDryRunPlan({ mode: 'write', files: [{ fileName: 'agir hasar.pdf' }] });
} catch {
  nonDryRunBlocked = true;
}
assert(nonDryRunBlocked, 'v0.6.0 P3-A planlayici sadece dry_run modunu kabul eder', 'dry_run disi mod kabul edildi');
const knowledgeImportChannels = Object.values(IPC_INVOKE_CHANNELS).filter((channel) => channel.startsWith('knowledge-import:')).sort();
assert(JSON.stringify(knowledgeImportChannels) === JSON.stringify(['knowledge-import:choose-files-dry-run', 'knowledge-import:commit-approved-text-preview', 'knowledge-import:dry-run-plan', 'knowledge-import:preview-text-file']), 'v0.6.0 P4-E2-B knowledge-import IPC kanallari: dry-run/dosya-secici/metin-onizleme + dar commit; baska yazma kanali yok', JSON.stringify(knowledgeImportChannels));

// v0.6.0 P3-B: Dry-run import plan goruntuleme modeli pasif/read-only kalir.
const importDisplayPlan = clone(importDryRun.plan);
importDisplayPlan.candidates = [
  importCandidate('Agir Hasar Kritik Parca Rehberi.pdf'),
  importCandidate('is notlari kaporta boya mekanik.docx'),
  importCandidate('KTT kaza durum senaryo.pdf'),
  importCandidate('belirsiz kaynak.pdf'),
  importCandidate('tehlikeli.exe'),
  {
    ...importCandidate('Agir Hasar Kritik Parca Rehberi.pdf'),
    candidateId: 'knowledge-import-candidate-future-approved',
    fileName: 'gelecek import uygun kaynak.md',
    fileExtension: '.md',
    permission: 'approved_for_future_import',
    warnings: ['Bu karar kalici olarak kaydedilmez.'],
    reasons: ['Gelecek içe aktarma için uygun model ornegi.'],
    canWrite: false
  }
].filter(Boolean);
importDisplayPlan.totals = { totalCandidates: importDisplayPlan.candidates.length, allowedForDryRun: 5, requiresApproval: 3, notAllowed: 1 };
const importPlanView = buildKnowledgeImportPlanViewModel(importDisplayPlan);
const viewCandidate = (fileName) => importPlanView.candidates.find((candidate) => candidate.fileName === fileName);
assert(importPlanView.planId === importDisplayPlan.planId && importPlanView.modeLabel === 'dry_run' && importPlanView.canWrite === false && importPlanView.canWriteLabel.includes('Yazma kapali'), 'v0.6.0 P3-B import plan view modeli dry-run/canWrite=false bilgisini gosterir', JSON.stringify({ planId: importPlanView.planId, mode: importPlanView.modeLabel, canWrite: importPlanView.canWriteLabel }));
assert(importPlanView.metrics.some((metric) => metric.label === 'Toplam aday' && metric.value === 6) && importPlanView.metrics.some((metric) => metric.label === 'Deneme planı adayı' && metric.value === 5) && importPlanView.metrics.some((metric) => metric.label === 'Onay gerektirir' && metric.value === 3) && importPlanView.metrics.some((metric) => metric.label === 'Reddedildi' && metric.value === 1), 'v0.6.0 P3-B import plan view modeli toplam/izin/onay/red sayilarini gosterir', JSON.stringify(importPlanView.metrics));
assert(viewCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.fileExtension === '.pdf' && viewCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.detectedSourceType === 'heavy_damage_rule' && viewCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.detectedTags.includes('agir_hasar'), 'v0.6.0 P3-B candidate fileName/extension/sourceType/tags view modelde gorunur', JSON.stringify(viewCandidate('Agir Hasar Kritik Parca Rehberi.pdf')));
assert(viewCandidate('tehlikeli.exe')?.permissionLabel === 'Reddedildi' && viewCandidate('tehlikeli.exe')?.approvalState === 'rejected', 'v0.6.0 P3-B not_allowed candidate Reddedildi olarak gorunur', JSON.stringify(viewCandidate('tehlikeli.exe')));
assert(viewCandidate('belirsiz kaynak.pdf')?.permissionLabel === 'Sadece plan' && viewCandidate('belirsiz kaynak.pdf')?.approvalState === 'preview_only', 'v0.6.0 P3-B dry_run_only candidate Sadece plan olarak gorunur', JSON.stringify(viewCandidate('belirsiz kaynak.pdf')));
assert(viewCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.permissionLabel === 'Kullanici onayi gerekir' && viewCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.approvalState === 'user_review_required', 'v0.6.0 P3-B requires_user_approval candidate Kullanici onayi gerekir olarak gorunur', JSON.stringify(viewCandidate('Agir Hasar Kritik Parca Rehberi.pdf')));
assert(viewCandidate('gelecek import uygun kaynak.md')?.permissionLabel === 'Gelecek içe aktarma için uygun' && viewCandidate('gelecek import uygun kaynak.md')?.approvalState === 'approved_but_not_executed', 'v0.6.0 P3-B approved_for_future_import candidate calismadan sadece uygun gorunur', JSON.stringify(viewCandidate('gelecek import uygun kaynak.md')));
assert(viewCandidate('belirsiz kaynak.pdf')?.warnings.some((warning) => warning.includes('manuel eslestirme')) && viewCandidate('belirsiz kaynak.pdf')?.reasons.some((reason) => reason.includes('Kaynak tipi')), 'v0.6.0 P3-B candidate warnings ve reasons view modelde gorunur', JSON.stringify(viewCandidate('belirsiz kaynak.pdf')));
assert(importPlanView.safetyNotes.some((note) => note.includes('dosya icerigi okunmaz')) && importPlanView.safetyNotes.some((note) => note.includes('kalici kaynak eklenmez')) && importPlanView.safetyNotes.some((note) => note.includes('takip.json, Excel veya AppData yazilmaz')) && importPlanView.safetyNotes.some((note) => note.includes('içe aktarma çalıştırılmaz')), 'v0.6.0 P3-B guvenlik metinleri read-only/no-write/no-import anlamini tasir', JSON.stringify(importPlanView.safetyNotes));
assert(importPlanView.safetyNotes.some((note) => note.includes('canWrite=false')), 'v0.6.0 P3-B guvenlik metni planin canWrite=false uretildigini bildirir', JSON.stringify(importPlanView.safetyNotes));

const moneyCases = [
  ['1.234,56 TL', 1234.56],
  ['₺ 1,234.56', 1234.56],
  ['1234,56', 1234.56],
  ['1234.56', 1234.56],
  ['1.234', 1234],
  ['1,234', 1234],
  ['-2.500,10 TRY', -2500.10]
];
for (const [input, expected] of moneyCases) {
  assert(parseMoney(input) === expected, `parseMoney ${input} -> ${expected}`, `Gelen=${parseMoney(input)}`);
}
assert(parseMoney('TOPLAM') === null, 'parseMoney parasal olmayan metni null döndürür', `Gelen=${parseMoney('TOPLAM')}`);

// v0.4.6: Gemini parça yanıtında tutar STRING gelirse (TR format) doğru parse edilmeli.
// Risk: düz Number("2.500") = 2.5 → Excel'e yanlış tutar. parseMoney ile çözüldü.
const partsAmountResponse = JSON.stringify({
  arac: { marka: 'Fiat', model: 'Egea', plaka: '34 ABC 123' },
  parcalar: [
    { ham: 'ön tampon', adet: null, tutar: '2.500', not: '' },
    { ham: 'kaput', adet: null, tutar: '₺ 1.250,50', not: '' },
    { ham: 'sağ ön kapı', adet: '2', tutar: 2500, not: '' },
    { ham: 'arka tampon', adet: null, tutar: 'yok', not: '' }
  ]
});
const partsAmount = parsePartsResponse(partsAmountResponse, '');
const amtByRaw = (raw) => partsAmount.rows.find((r) => r.raw === raw);
assert(amtByRaw('ön tampon')?.amount === 2500, 'parsePartsResponse "2.500" TR tutarını 2500 okur', `Gelen=${amtByRaw('ön tampon')?.amount}`);
assert(amtByRaw('kaput')?.amount === 1250.5, 'parsePartsResponse "₺ 1.250,50" tutarını 1250.50 okur', `Gelen=${amtByRaw('kaput')?.amount}`);
assert(amtByRaw('sağ ön kapı')?.amount === 2500 && amtByRaw('sağ ön kapı')?.quantity === 2, 'parsePartsResponse sayısal tutar + adet okur', JSON.stringify(amtByRaw('sağ ön kapı')));
assert(amtByRaw('arka tampon')?.amount === undefined, 'parsePartsResponse parasal olmayan tutarı atlar', JSON.stringify(amtByRaw('arka tampon')));

// v0.4.6: Yönsüz genel ifade ("tampon") otomatik "Ön Tampon" olur ama ambiguousSide işaretlenir.
const ambigTampon = normalizePartName('tampon');
assert(ambigTampon.canonical === 'Ön Tampon' && ambigTampon.ambiguousSide === true, 'normalizePartName yönsüz "tampon" için ambiguousSide işaretler', JSON.stringify(ambigTampon));
const onTampon = normalizePartName('ön tampon');
assert(onTampon.canonical === 'Ön Tampon' && !onTampon.ambiguousSide, 'normalizePartName "ön tampon" için ambiguousSide işaretlemez', JSON.stringify(onTampon));
const sagArkaTampon = normalizePartName('sağ arka tampon');
assert(sagArkaTampon.canonical === 'Sağ Arka Tampon' && !sagArkaTampon.ambiguousSide, 'normalizePartName "sağ arka tampon" net yönü belirsiz saymaz', JSON.stringify(sagArkaTampon));
const amortisor = normalizePartName('amartisör');
assert(amortisor.canonical === 'Amortisör' && !amortisor.ambiguousSide, 'normalizePartName yönsüz olmayan parça (amortisör) belirsiz değil', JSON.stringify(amortisor));

// v0.4.7: Merkezi plaka eşleşme + yanlış plakalı fotoğraf HARD-BLOCK testleri.
assert(looksLikePlate('34 BOP 660') === true && looksLikePlate('HASAR') === false, 'looksLikePlate plaka biçimini ayırt eder', `${looksLikePlate('34 BOP 660')}/${looksLikePlate('HASAR')}`);
const pmSame = evaluatePlateMatch('34 BOP 660', '34BOP660');
assert(pmSame.comparable && pmSame.matches, 'evaluatePlateMatch aynı plakayı (boşluklu/boşluksuz) eşler', JSON.stringify(pmSame));
const pmDiff = evaluatePlateMatch('34BOP660', '01FJG08');
assert(pmDiff.comparable && !pmDiff.matches, 'evaluatePlateMatch farklı plakayı uyuşmaz işaretler', JSON.stringify(pmDiff));
const pmUnknown = evaluatePlateMatch('34BOP660', 'HASAR');
assert(!pmUnknown.comparable && pmUnknown.matches, 'evaluatePlateMatch okunamayan adayda uyuşmazlık iddia etmez', JSON.stringify(pmUnknown));
const plateTestBase = path.join(os.tmpdir(), 'hb-plate-test');
assert(resolvePlateFromPath(path.join(plateTestBase, '01FJG08', 'HASAR', 'foto.jpg')) === '01FJG08', 'resolvePlateFromPath klasör yolundan plaka çıkarır', resolvePlateFromPath(path.join(plateTestBase, '01FJG08', 'HASAR', 'foto.jpg')));

const activeFolder = path.join(plateTestBase, '34BOP660');
// 1) Aktif klasör içindeki foto → engellenmez.
let blockedInside = false;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(activeFolder, 'HASAR', 'a.jpg') }); } catch { blockedInside = true; }
assert(!blockedInside, 'assertSelectedPhotoMatchesCase aktif klasör içindeki fotoğrafı engellemez', `blocked=${blockedInside}`);
// 2) Farklı plakalı klasörden foto → HARD-BLOCK (PHOTO_PLATE_MISMATCH).
let mismatchError = null;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(plateTestBase, '01FJG08', 'HASAR', 'b.jpg') }); } catch (e) { mismatchError = e; }
assert(mismatchError && mismatchError.code === 'PHOTO_PLATE_MISMATCH' && /güvenlik nedeniyle engellendi/.test(mismatchError.message), 'assertSelectedPhotoMatchesCase yanlış plakalı fotoğrafı sert engeller', mismatchError ? mismatchError.message : 'hata yok');
// 3) Plaka okunamayan, klasör dışı foto → uyuşmazlık kanıtlanamaz, engellenmez (yanlış-pozitif yok).
let blockedUnknown = false;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(plateTestBase, 'genel', 'indirilenler', 'c.jpg') }); } catch { blockedUnknown = true; }
assert(!blockedUnknown, 'assertSelectedPhotoMatchesCase plakasız klasör-dışı fotoğrafta yanlış-pozitif üretmez', `blocked=${blockedUnknown}`);
// 4) v0.4.10: AYNI PLAKA ama FARKLI dosya klasörü → klasör kimliği farklı olduğundan HARD-BLOCK.
const owningTest = resolveCaseFolderFromPath(path.join(plateTestBase, '01FJG08', 'HASAR', 'foto.jpg'));
assert(owningTest && owningTest.plate === '01FJG08', 'resolveCaseFolderFromPath dosya klasörünü ve plakayı çözer', JSON.stringify(owningTest));
let samePlateDiffFolderError = null;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(plateTestBase, 'Mayıs 2026', '34BOP660', 'HASAR', 'd.jpg') }); } catch (e) { samePlateDiffFolderError = e; }
assert(samePlateDiffFolderError && samePlateDiffFolderError.code === 'PHOTO_PLATE_MISMATCH' && /FARKLI dosya klasörü/.test(samePlateDiffFolderError.message), 'assertSelectedPhotoMatchesCase aynı plaka ama farklı dosya klasörünü engeller', samePlateDiffFolderError ? samePlateDiffFolderError.message : 'hata yok');
// 5) Aynı dosya klasörünün alt klasöründen (EVRAK/HASAR) foto → engellenmez.
let blockedSubfolder = false;
try { assertSelectedPhotoMatchesCase({ activePlate: '34 BOP 660', activeFolderPath: activeFolder, selectedFilePath: path.join(activeFolder, 'EVRAK', 'e.jpg') }); } catch { blockedSubfolder = true; }
assert(!blockedSubfolder, 'assertSelectedPhotoMatchesCase aktif dosyanın alt klasöründeki fotoğrafı engellemez', `blocked=${blockedSubfolder}`);

// === v0.4.11: AI destekli İşçilik Dağıtıcı ===
assert(roundTo250(2400) === 2500 && roundTo250(2625) === 2750 && roundTo250(0) === 0, 'roundTo250 tutarı 250 katına yuvarlar (kuruşsuz)', `${roundTo250(2400)}/${roundTo250(2625)}/${roundTo250(0)}`);

const clTampon = classifyByRules('Ön Tampon');
assert(clTampon.categories.includes('Kaporta') && clTampon.categories.includes('Boya'), 'classifyByRules tamponu Kaporta+Boya sınıflar', JSON.stringify(clTampon.categories));
assert(classifyByRules('Alternatör').categories[0] === 'Mekanik', 'classifyByRules alternatörü Mekanik sınıflar', JSON.stringify(classifyByRules('Alternatör')));
const clFar = classifyByRules('Sağ Ön Far');
assert(clFar.categories[0] === 'Elektrik' && clFar.needsReview === true, 'classifyByRules farı Elektrik + kontrol gerekli yapar', JSON.stringify(clFar));
assert(classifyByRules('Ön Cam').categories[0] === 'Cam', 'classifyByRules camı Cam sınıflar', JSON.stringify(classifyByRules('Ön Cam')));
assert(!classifyByRules('Sol Ön Çamurluk Davlumbazı').categories.includes('Cam'), 'classifyByRules çamurluk/davlumbazı cam sanmaz', JSON.stringify(classifyByRules('Sol Ön Çamurluk Davlumbazı')));
assert(classifyByRules('Radyator Panjuru').categories[0] === 'Kaporta', 'classifyByRules radyatör panjurunu mekanik değil kaporta sınıflar', JSON.stringify(classifyByRules('Radyator Panjuru')));
const clMotorTesisat = classifyByRules('MOTOR ELEKTRİK TESİSATI');
assert(clMotorTesisat.categories[0] === 'Elektrik', 'classifyByRules motor elektrik tesisatını Elektrik sınıflar', JSON.stringify(clMotorTesisat));
const clMotorKaputu = classifyByRules('MOTOR KAPUTU');
assert(clMotorKaputu.categories.includes('Kaporta') && clMotorKaputu.categories.includes('Boya') && !clMotorKaputu.categories.includes('Mekanik'), 'classifyByRules motor kaputunu Kaporta+Boya sınıflar', JSON.stringify(clMotorKaputu));
assert(classifyByRules('SOL GÜNDÜZ SÜRÜŞ FARI').categories[0] === 'Elektrik', 'classifyByRules gündüz sürüş farını Elektrik sınıflar', JSON.stringify(classifyByRules('SOL GÜNDÜZ SÜRÜŞ FARI')));
assert(classifyByRules('YAĞ POMPASI').categories[0] === 'Mekanik', 'classifyByRules yağ pompasını Mekanik sınıflar', JSON.stringify(classifyByRules('YAĞ POMPASI')));
assert(classifyByRules('EGR VALFİ').categories[0] === 'Mekanik', 'classifyByRules EGR valfini Mekanik sınıflar', JSON.stringify(classifyByRules('EGR VALFİ')));
assert(classifyByRules('KOMPLE HAVA FİLTRESİ').categories[0] === 'Mekanik', 'classifyByRules hava filtresini Mekanik sınıflar', JSON.stringify(classifyByRules('KOMPLE HAVA FİLTRESİ')));
const clDavlumbaz = classifyByRules('ÇAMURLUK DAVLUMBAZI');
assert(clDavlumbaz.categories[0] === 'Kaporta' && !clDavlumbaz.categories.includes('Boya') && clDavlumbaz.needsReview === true, 'classifyByRules çamurluk davlumbazını Kaporta + kontrol gerekli yapar', JSON.stringify(clDavlumbaz));
assert(classifyByRules('Sürücü Koltuğu').categories[0] === 'Döşeme/Kilit', 'classifyByRules koltuğu Döşeme/Kilit sınıflar', JSON.stringify(classifyByRules('Sürücü Koltuğu')));
const clUnknown = classifyByRules('Zxqw Bilinmeyen Parça');
assert(clUnknown.confidence === 'Düşük' && clUnknown.needsReview === true && clUnknown.categories.length > 0, 'classifyByRules bilinmeyen parçayı doldurur ama kontrol gerekli işaretler', JSON.stringify(clUnknown));
const constrained = applyDistributionConstraints(['Mekanik', 'Cam'], 'MOTOR');
assert(!constrained.categories.includes('Cam'), 'applyDistributionConstraints motor satırından cam işçiliğini çıkarır', JSON.stringify(constrained));
const constrainedElectric = applyDistributionConstraints(['Elektrik', 'Kaporta', 'Boya', 'Mekanik'], 'MOTOR ELEKTRIK TESISATI');
assert(constrainedElectric.categories.length === 1 && constrainedElectric.categories[0] === 'Elektrik', 'applyDistributionConstraints elektrik satırından kaporta/boya/mekanik çakışmasını çıkarır', JSON.stringify(constrainedElectric));
const constrainedFalseCam = applyDistributionConstraints(['Kaporta', 'Cam'], 'CAMURLUK DAVLUMBAZI');
assert(constrainedFalseCam.categories.includes('Kaporta') && !constrainedFalseCam.categories.includes('Cam'), 'applyDistributionConstraints çamurluk/davlumbaz kelimesini cam saymaz', JSON.stringify(constrainedFalseCam));

const criticalLaborCases = [
  ['MOTOR ELEKTRİK TESİSATI', ['Elektrik'], ['Mekanik', 'Kaporta', 'Cam']],
  ['MOTOR KAPUTU', ['Kaporta', 'Boya'], ['Mekanik', 'Cam']],
  ['SOL GÜNDÜZ SÜRÜŞ FARI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['YAĞ POMPASI', ['Mekanik'], ['Cam', 'Kaporta']],
  ['EGR VALFİ', ['Mekanik'], ['Cam', 'Kaporta']],
  ['KOMPLE HAVA FİLTRESİ', ['Mekanik'], ['Cam', 'Kaporta']],
  ['RADYATÖR PANJURU', ['Kaporta'], ['Mekanik', 'Cam']],
  ['ÇAMURLUK DAVLUMBAZI', ['Kaporta'], ['Cam', 'Mekanik']],
  ['ŞARJ DİNAMOSU', ['Mekanik'], ['Cam', 'Kaporta']],
  ['ALTERNATÖR', ['Mekanik'], ['Cam', 'Kaporta']],
  ['SİGORTA KUTUSU', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['TESİSAT', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['BEYİN', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['SENSÖR', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['STOP LAMBASI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['RADAR SENSÖRÜ', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']],
  ['GERİ GÖRÜŞ KAMERASI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']]
];
for (const [name, expected, forbidden] of criticalLaborCases) {
  const decision = classifyByRules(name);
  assert(expected.every((cat) => decision.categories.includes(cat)), `v0.5 karar motoru beklenen sınıf: ${name}`, JSON.stringify(decision));
  assert(forbidden.every((cat) => !decision.categories.includes(cat)), `v0.5 karar motoru yasak sınıfı engeller: ${name}`, JSON.stringify(decision));
  assert(decision.reason.includes('Kanıt:'), `v0.5 karar motoru kanıt gerekçesi üretir: ${name}`, decision.reason);
}
assert(classifyByRules('MOTOR ELEKTRİK TESİSATI').reason.includes('Negatif'), 'v0.5 motor elektrik tesisatında mekanik negatif kural gerekçesi yazar', classifyByRules('MOTOR ELEKTRİK TESİSATI').reason);
assert(classifyByRules('RADYATÖR PANJURU').reason.includes('Negatif'), 'v0.5 radyatör panjurunda mekanik negatif kural gerekçesi yazar', classifyByRules('RADYATÖR PANJURU').reason);

// Öğrenen sözlük kuraldan önceliklidir.
const learnedEntries = recordLearned([], { alias: 'Ön Tampon', categories: ['Mekanik'] });
const learnedDecision = classifyLaborRow('Ön Tampon', '', '', learnedEntries);
assert(learnedDecision.source === 'learned' && learnedDecision.categories[0] === 'Mekanik', 'classifyLaborRow öğrenilen kararı kuralın önüne alır', JSON.stringify(learnedDecision));
const lk = lookupLearned(learnedEntries, 'Ön Tampon');
assert(lk && lk.matchType === 'exact', 'lookupLearned tam eşleşmeyi bulur', JSON.stringify(lk));
assert(laborNameSimilarity('ön tampon', 'on tampon orjinal') > 0.3, 'laborNameSimilarity benzer adları yakalar', String(laborNameSimilarity('ön tampon', 'on tampon orjinal')));
const learnedWithReason = recordLearned([], { alias: 'Sigorta Kutusu', partCode: 'ELK-1', categories: ['Elektrik'], reason: 'Kullanıcı önizlemede elektrik kararı onayladı.' });
assert(learnedWithReason[0]?.reason?.includes('elektrik kararı'), 'recordLearned kullanıcı karar gerekçesini saklar', JSON.stringify(learnedWithReason[0]));
assert(deleteLearned(learnedWithReason, { alias: 'Sigorta Kutusu', partCode: 'ELK-1' }).length === 0, 'deleteLearned yanlış öğrenmeyi silme altyapısı sağlar', JSON.stringify(learnedWithReason));

// Uçtan uca: kategori-kolonlu Excel önizleme + güvenli çoklu-kolon yazma + orijinal korunur + yedek.
const disabledLearned = setLearnedActive(learnedEntries, { normalizedName: learnedEntries[0].normalizedName }, false);
assert(!lookupLearned(disabledLearned, 'Ã–n Tampon'), 'v0.5.0 ogrenme sozlugu devre disi kaydi AI kararinda kullanmaz', JSON.stringify(disabledLearned[0]));
const enabledLearned = setLearnedActive(disabledLearned, { normalizedName: learnedEntries[0].normalizedName }, true);
assert(lookupLearned(enabledLearned, 'Ã–n Tampon')?.entry.active !== false, 'v0.5.0 ogrenme sozlugu tekrar aktif edilen kaydi AI kararinda kullanir', JSON.stringify(enabledLearned[0]));
const editedLearned = updateLearned(enabledLearned, { normalizedName: learnedEntries[0].normalizedName, categories: ['Elektrik'], reason: 'Manuel yonetim duzeltmesi', needsReview: true, active: true });
const editedDecision = classifyLaborRow('Ã–n Tampon', '', '', editedLearned);
assert(editedDecision.source === 'learned' && editedDecision.categories[0] === 'Elektrik' && editedDecision.needsReview, 'v0.5.0 ogrenme sozlugu duzenleme sonraki AI kararini etkiler', JSON.stringify(editedDecision));
const deletedLearned = deleteLearned(editedLearned, { normalizedName: learnedEntries[0].normalizedName });
assert(!lookupLearned(deletedLearned, 'Ã–n Tampon'), 'v0.5.0 ogrenme sozlugu silinen kaydi AI kararinda kullanmaz', JSON.stringify(deletedLearned));
assert(!isLearnableLaborAlias('') && !isLearnableLaborAlias('1') && !isLearnableLaborAlias('49') && !isLearnableLaborAlias('A 12') && isLearnableLaborAlias('EGR Valfi'), 'v0.5.0 ogrenme sozlugu bos/sira numarasi/anlamsiz kaydi ogrenmez', 'alias guard');
assert(recordLearned([], { alias: '49', categories: ['Kaporta'] }).length === 0, 'v0.5.0 ogrenme sozlugu sira numarasi kaynakli kaydi dosyaya eklemez', JSON.stringify(recordLearned([], { alias: '49', categories: ['Kaporta'] })));
const exportedLearningJson = exportLaborLearningJson(editedLearned);
assert(exportedLearningJson.includes('entries') && exportedLearningJson.includes('Elektrik'), 'v0.5.0 ogrenme sozlugu disa aktarma JSON uretir', exportedLearningJson);
let brokenImportRejected = false;
try { importLaborLearningJson([], '{bozuk json'); } catch { brokenImportRejected = true; }
assert(brokenImportRejected, 'v0.5.0 ogrenme sozlugu bozuk JSON ice aktarmayi reddeder', 'broken json rejected');
const importedLearning = importLaborLearningJson([], exportedLearningJson);
assert(importedLearning.added === 1 && importedLearning.updated === 0 && importedLearning.skipped === 0 && importedLearning.entries.length === 1, 'v0.5.0 ogrenme sozlugu gecerli JSON ice aktarma kayit ekler', JSON.stringify(importedLearning));
const conflictLearning = importLaborLearningJson(importedLearning.entries, exportLaborLearningJson(updateLearned(importedLearning.entries, { normalizedName: importedLearning.entries[0].normalizedName, categories: ['Mekanik'], reason: 'Import guncellemesi' })));
assert(conflictLearning.added === 0 && conflictLearning.updated === 1 && conflictLearning.skipped === 0 && conflictLearning.entries[0].categories[0] === 'Mekanik', 'v0.5.0 ogrenme sozlugu cakismali import raporunu dogru doner', JSON.stringify(conflictLearning));

const aiTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-ai-labor-'));
const aiHeaders = ['Parça', 'Kod', 'Parça Tutarı', 'Kaporta', 'Boya', 'Mekanik', 'Elektrik', 'Cam', 'Döşeme/Kilit', 'Onarım'];
const aiRows = [
  ['Ön Tampon', 'TMP-1', 3000, '', '', '', '', '', '', ''],
  ['Alternatör', 'ALT-9', 1500, 999, '', '', '', 888, '', ''],
  ['Ön Cam', 'CAM-2', 2000, '', '', '', '', '', '', '']
];
const aiInput = path.join(aiTmp, 'ai-input.xlsx');
await fs.writeFile(aiInput, buildGenericLaborWorkbook(aiHeaders, aiRows));
const aiPreview = await buildAutoLaborPreview(aiInput, []);
assert(aiPreview.columns.length === 7, 'buildAutoLaborPreview 7 işçilik kategori sütununu başlıktan tespit eder', JSON.stringify(aiPreview.columns.map((c) => c.category)));
const pvTampon = aiPreview.rows.find((r) => r.partName === 'Ön Tampon');
assert(pvTampon && pvTampon.amounts.Kaporta > 0 && pvTampon.amounts.Boya > 0, 'önizleme tamponu Kaporta+Boya doldurur', JSON.stringify(pvTampon?.amounts));
const pvAlt = aiPreview.rows.find((r) => r.partName === 'Alternatör');
assert(pvAlt && pvAlt.amounts.Mekanik > 0 && !pvAlt.amounts.Cam, 'önizleme alternatöre Mekanik yazar, Cam yazmaz', JSON.stringify(pvAlt?.amounts));
assert(pvAlt && pvAlt.changed === true, 'önizleme seçilmeyen eski H-N değerlerini temizlenecek değişiklik sayar', JSON.stringify({ oldByColumn: pvAlt?.oldByColumn, amounts: pvAlt?.amounts }));

const aiOutput = path.join(aiTmp, 'ai-output.xlsx');
const aiSave = await saveAutoLaborExcel({ filePath: aiInput, outputPath: aiOutput, rows: aiPreview.rows.map((r) => ({ rowNumber: r.rowNumber, amounts: r.amounts })), columns: aiPreview.columns });
assert(aiSave.writtenCells > 0 && aiSave.changedRows >= 2, 'saveAutoLaborExcel onaylı tutarları yazar', JSON.stringify(aiSave));
const kaportaCol = aiPreview.columns.find((c) => c.category === 'Kaporta').column;
const mekanikCol = aiPreview.columns.find((c) => c.category === 'Mekanik').column;
const camCol = aiPreview.columns.find((c) => c.category === 'Cam').column;
const outWb = await loadWorkbook(aiOutput);
const writtenCell = outWb.sheet.cells.find((c) => c.ref === `${kaportaCol}${pvTampon.rowNumber}`);
assert(writtenCell && Number(writtenCell.numeric) === pvTampon.amounts.Kaporta, 'çıktı Excel Kaporta sütununa doğru tutarı yazdı', JSON.stringify({ written: writtenCell?.numeric, beklenen: pvTampon.amounts.Kaporta }));
const altMekanikCell = outWb.sheet.cells.find((c) => c.ref === `${mekanikCol}${pvAlt.rowNumber}`);
const altKaportaCell = outWb.sheet.cells.find((c) => c.ref === `${kaportaCol}${pvAlt.rowNumber}`);
const altCamCell = outWb.sheet.cells.find((c) => c.ref === `${camCol}${pvAlt.rowNumber}`);
assert(altMekanikCell && Number(altMekanikCell.numeric) === pvAlt.amounts.Mekanik, 'çıktı Excel mekanik satıra Mekanik tutarı yazar', JSON.stringify({ written: altMekanikCell?.numeric, beklenen: pvAlt.amounts.Mekanik }));
assert(altKaportaCell && Number(altKaportaCell.numeric) === 0 && altCamCell && Number(altCamCell.numeric) === 0, 'çıktı Excel mekanik satırdaki eski yanlış Kaporta/Cam değerlerini temizler', JSON.stringify({ kaporta: altKaportaCell?.numeric, cam: altCamCell?.numeric }));
const origWb = await loadWorkbook(aiInput);
const origCell = origWb.sheet.cells.find((c) => c.ref === `${kaportaCol}${pvTampon.rowNumber}`);
assert(!origCell || origCell.numeric === null, 'orijinal Excel değiştirilmedi (Kaporta hücresi hâlâ boş)', JSON.stringify(origCell ?? null));
assert(await fs.stat(aiSave.backupPath).then(() => true).catch(() => false), 'orijinalin yedeği oluşturuldu', aiSave.backupPath);
const excelWorkflowSource = await fs.readFile(path.join(process.cwd(), 'src', 'main', 'services', 'excel-workflow-service.ts'), 'utf-8');
assert(excelWorkflowSource.includes('approvedExcelFiles.has(excelPath)') && excelWorkflowSource.includes('AI önizleme ile'), 'AI autoLaborSave önizleme/uygulama içi seçim olmadan Excel yazmaz', 'approvedExcelFiles güvenlik kapısı bulunamadı');

// v0.4.11 fixture: GERÇEK portal Excel (Liste.xlsx) ile kolon eşleme doğrulaması.
const portalFixture = path.join(process.cwd(), 'scripts', 'fixtures', 'liste-portal.xlsx');
const fixtureStatBefore = await fs.stat(portalFixture);
const portal = await buildAutoLaborPreview(portalFixture, []);
assert(portal.partNameColumn === 'C', 'portal: parça adı A değil C sütunundan okunur', `partNameColumn=${portal.partNameColumn}`);
assert(portal.partNameColumn !== 'A', 'portal: A sütunu (sıra no) parça adı olarak kullanılmaz', `partNameColumn=${portal.partNameColumn}`);
assert(portal.groupColumn === 'B', 'portal: B sütunu destekleyici grup olarak kullanılır', `groupColumn=${portal.groupColumn}`);
assert(portal.partCodeColumn === 'D', 'portal: D sütunu parça kodu olarak kullanılır', `partCodeColumn=${portal.partCodeColumn}`);
assert(portal.rows.every((r) => r.source !== 'learned'), 'portal: mevcut H-N değerleri otomatik öğrenme kaynağı olmaz', JSON.stringify(portal.rows.slice(0, 5).map((r) => ({ rowNumber: r.rowNumber, source: r.source }))));
const colOf = (cat) => portal.columns.find((c) => c.category === cat)?.column;
assert(colOf('Kaporta') === 'H' && colOf('Mekanik') === 'I' && colOf('Elektrik') === 'J' && colOf('Döşeme/Kilit') === 'K' && colOf('Cam') === 'L' && colOf('Boya') === 'M' && colOf('Onarım') === 'N', 'portal: H..N işçilik kategori sütunları doğru eşlenir', JSON.stringify(portal.columns.map((c) => `${c.column}:${c.category}`)));
const firstRow = portal.rows[0];
assert(firstRow && !/^\d+$/.test(firstRow.partName) && firstRow.partName.length > 2, 'portal: ilk satır parça adı sıra numarası değil gerçek açıklama', JSON.stringify(firstRow?.partName));
const findRow = (needle) => portal.rows.find((r) => r.partName.toUpperCase().includes(needle));
const dinamo = findRow('DINAMO') ?? findRow('SARJ');
assert(dinamo && dinamo.categories.includes('Mekanik') && !dinamo.categories.includes('Cam'), 'portal: şarj dinamosu Mekanik (cam değil)', JSON.stringify(dinamo));
const far = findRow('FAR');
assert(far && far.categories[0] === 'Elektrik' && !far.categories.includes('Kaporta'), 'portal: far Elektrik olarak sınıflanır (gelişigüzel kaporta yazılmaz)', JSON.stringify(far));
assert(far && far.needsReview === true, 'portal: far (dış elektrik) kontrol gerekli işaretlenir', JSON.stringify(far));
const koltuk = findRow('KOLTUK');
assert(koltuk && koltuk.categories.includes('Döşeme/Kilit'), 'portal: koltuk Döşeme/Kilit sınıflanır', JSON.stringify(koltuk));
const travers = findRow('TRAVERS');
assert(travers && travers.categories.includes('Kaporta'), 'portal: travers Kaporta sınıflanır', JSON.stringify(travers));
// Düşük güvenli satır yine doldurulur ama Kontrol gerekli işaretlenir; hiçbir satır boş kalmaz.
assert(portal.rows.every((r) => r.categories.length > 0), 'portal: her satıra işçilik kararı verilir (boş kalmaz)', `bos=${portal.rows.filter((r) => r.categories.length === 0).length}`);
// Önizleme dosyaya YAZMAZ; orijinal fixture değişmez (H-N mevcut değerleri otomatik öğrenilmez/yazılmaz).
const fixtureStatAfter = await fs.stat(portalFixture);
assert(fixtureStatAfter.size === fixtureStatBefore.size && fixtureStatAfter.mtimeMs === fixtureStatBefore.mtimeMs, 'portal: önizleme orijinal Excel dosyasını değiştirmez', 'fixture değişti');

// v0.5.0: gerçek portal kolon DÜZENİNDE geniş problemli parça fixture'ı.
const portalV2Headers = ['Sıra', 'DVN Grubu', 'İşçilik Açıklaması', 'Parça Kodu', 'Boş', 'Parça Sahiplenme Bedeli', 'Parça Orijinal Bedeli', 'Kaporta', 'Mekanik', 'Elektrik', 'Döşeme-Kilit', 'Cam', 'Boya', 'Onarım'];
const portalV2Rows = [
  [1, 'MEKANIK', 'MOTOR ELEKTRİK TESİSATI', 'ELK-001', '', 1000, 2000, 999, 999, '', '', 999, '', ''],
  [2, 'MEKANIK', 'MOTOR KAPUTU', 'KPT-001', '', 2000, 3000, '', 888, '', '', '', '', ''],
  [3, 'AYDINLATMA', 'SOL GÜNDÜZ SÜRÜŞ FARI', 'FAR-001', '', 500, 1000, 777, '', '', '', '', '', ''],
  [4, 'CAM', 'YAĞ POMPASI', 'MEK-001', '', 500, 1000, '', '', '', '', 666, '', ''],
  [5, 'KAPORTA', 'EGR VALFİ', 'MEK-002', '', 500, 1000, 555, '', '', '', '', '', ''],
  [6, 'KAPORTA', 'KOMPLE HAVA FİLTRESİ', 'MEK-003', '', 500, 1000, '', '', '', '', 444, '', ''],
  [7, 'MEKANIK', 'RADYATÖR PANJURU', 'KAP-001', '', 500, 1000, '', 333, '', '', '', '', ''],
  [8, 'CAM', 'ÇAMURLUK DAVLUMBAZI', 'KAP-002', '', 500, 1000, '', '', '', '', 222, '', ''],
  [9, 'ELEKTRIK', 'ŞARJ DİNAMOSU', 'MEK-004', '', 500, 1000, '', '', 111, '', '', '', ''],
  [10, 'ELEKTRIK', 'ALTERNATÖR', 'MEK-005', '', 500, 1000, '', '', 111, '', '', '', ''],
  [11, 'KAPORTA', 'SİGORTA KUTUSU', 'ELK-002', '', 500, 1000, 111, '', '', '', '', '', ''],
  [12, 'KAPORTA', 'RADAR SENSÖRÜ', 'ELK-003', '', 500, 1000, 111, '', '', '', '', '', ''],
  [13, 'KAPORTA', 'ÖN CAM', 'CAM-001', '', 500, 1000, 111, '', '', '', '', '', ''],
  [14, 'GENEL', 'ZXQW BİLİNMEYEN PARÇA', 'UNK-001', '', 500, 1000, '', '', '', '', '', '', '']
];
const portalV2Input = path.join(aiTmp, 'portal-v2-shape.xlsx');
await fs.writeFile(portalV2Input, buildGenericLaborWorkbook(portalV2Headers, portalV2Rows));
const portalV2StatBefore = await fs.stat(portalV2Input);
const portalV2 = await buildAutoLaborPreview(portalV2Input, []);
assert(portalV2.partNameColumn === 'C' && portalV2.groupColumn === 'B' && portalV2.partCodeColumn === 'D', 'portal v2 fixture: A sıra, B grup, C açıklama, D kod olarak okunur', JSON.stringify({ part: portalV2.partNameColumn, group: portalV2.groupColumn, code: portalV2.partCodeColumn }));
assert(portalV2.rows.every((r) => r.source !== 'learned'), 'portal v2 fixture: mevcut H-N değerleri otomatik öğrenilmez', JSON.stringify(portalV2.rows.map((r) => r.source)));
assert(portalV2.rows.every((r) => r.categories.length > 0), 'portal v2 fixture: her satıra öneri üretilir', `bos=${portalV2.rows.filter((r) => r.categories.length === 0).length}`);
const portalV2Find = (needle) => portalV2.rows.find((r) => r.partName.toLocaleUpperCase('tr-TR').includes(needle));
const assertPortalV2Decision = (needle, expected, forbidden, reviewExpected = null) => {
  const row = portalV2Find(needle);
  assert(row && expected.every((cat) => row.categories.includes(cat)), `portal v2 fixture: ${needle} beklenen sınıfa gider`, JSON.stringify(row));
  assert(row && forbidden.every((cat) => !row.categories.includes(cat)), `portal v2 fixture: ${needle} yasak işçilikleri almaz`, JSON.stringify(row));
  if (reviewExpected !== null) assert(row && row.needsReview === reviewExpected, `portal v2 fixture: ${needle} kontrol gerekli=${reviewExpected}`, JSON.stringify(row));
};
assertPortalV2Decision('MOTOR ELEKTRİK TESİSATI', ['Elektrik'], ['Mekanik', 'Kaporta', 'Cam']);
assertPortalV2Decision('MOTOR KAPUTU', ['Kaporta', 'Boya'], ['Mekanik', 'Cam']);
assertPortalV2Decision('GÜNDÜZ SÜRÜŞ FARI', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam'], true);
assertPortalV2Decision('YAĞ POMPASI', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('EGR VALFİ', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('HAVA FİLTRESİ', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('RADYATÖR PANJURU', ['Kaporta'], ['Mekanik', 'Cam']);
assertPortalV2Decision('ÇAMURLUK DAVLUMBAZI', ['Kaporta'], ['Cam', 'Mekanik'], true);
assertPortalV2Decision('ŞARJ DİNAMOSU', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('ALTERNATÖR', ['Mekanik'], ['Cam', 'Kaporta']);
assertPortalV2Decision('SİGORTA KUTUSU', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']);
assertPortalV2Decision('RADAR SENSÖRÜ', ['Elektrik'], ['Kaporta', 'Mekanik', 'Cam']);
assertPortalV2Decision('ÖN CAM', ['Cam'], ['Mekanik', 'Kaporta']);
const lowConfidencePortalRow = portalV2Find('BİLİNMEYEN');
assert(lowConfidencePortalRow && lowConfidencePortalRow.categories.length > 0 && lowConfidencePortalRow.confidence === 'Düşük' && lowConfidencePortalRow.needsReview, 'portal v2 fixture: düşük güvenli satır boş bırakılmaz ve kontrol gerekli işaretlenir', JSON.stringify(lowConfidencePortalRow));
const portalV2StatAfter = await fs.stat(portalV2Input);
assert(portalV2StatAfter.size === portalV2StatBefore.size && portalV2StatAfter.mtimeMs === portalV2StatBefore.mtimeMs, 'portal v2 fixture: önizleme Excel dosyasını yazmadan okur', 'portal v2 fixture değişti');

// v0.5.0: Ağır Hasar AI Ön Değerlendirme karar motoru ve güvenlik kapıları.
const hdFrontRight = classifyHeavyDamagePart({ name: 'Sağ ön şasi kolu değişim', source: 'manual' });
assert(hdFrontRight.guideCategory === 'front-chassis-right' && hdFrontRight.score === 20 && hdFrontRight.confidence === 'Yüksek', 'ağır hasar: sağ ön şasi kolu değişim 20 puan yüksek güven', JSON.stringify(hdFrontRight));
const hdFirewall = classifyHeavyDamagePart({ name: 'Ön göğüs sacı değişim', source: 'manual' });
assert(hdFirewall.guideCategory === 'firewall' && hdFirewall.score === 40 && hdFirewall.directThreshold === true, 'ağır hasar: ön göğüs sacı değişim doğrudan eşik riski üretir', JSON.stringify(hdFirewall));
const hdUnknownChassis = classifyHeavyDamagePart({ name: 'Ön şasi kolu onarım', source: 'tracking-note' });
assert(hdUnknownChassis.needsReview && hdUnknownChassis.confidence === 'Orta' && hdUnknownChassis.questions.length > 0, 'ağır hasar: yön/derece belirsiz şasi satırı kontrol gerekli olur', JSON.stringify(hdUnknownChassis));
const hdOut = classifyHeavyDamagePart({ name: 'Ön tampon değişim', source: 'manual' });
assert(!hdOut.inScope && hdOut.score === 0 && hdOut.needsReview && hdOut.confidence === 'Düşük', 'ağır hasar: kapsam dışı kaporta parçası puanlanmaz ama inceleme satırı üretir', JSON.stringify(hdOut));

const hdPreview = buildHeavyDamagePreview({
  folderPath: 'C:/case/34ABC123',
  plate: '34ABC123',
  officeFileNo: '2026/99',
  assessedBy: 'Davranış Testi',
  repairCost: 600000,
  marketValue: 1000000,
  now: '2026-06-19T09:00:00.000Z',
  inputs: [
    { name: 'Sağ ön şasi kolu değişim', source: 'manual' },
    { name: 'Tavan sacı değişim', source: 'manual' },
    { name: 'Tavan travers onarım ağır', source: 'manual' }
  ]
});
assert(HEAVY_DAMAGE_THRESHOLD === 35 && hdPreview.summary.totalScore === 35 && hdPreview.summary.thresholdExceeded, 'ağır hasar: 35 puan eşiği toplam skorla aşılır', JSON.stringify(hdPreview.summary));
assert(HEAVY_DAMAGE_ECONOMIC_THRESHOLD === 60 && hdPreview.summary.repairToMarketRatio === 60 && hdPreview.summary.economicThresholdExceeded, 'ağır hasar: %60 ekonomik eşik ayrı hesaplanır', JSON.stringify(hdPreview.summary));
assert(hdPreview.userApproved === false, 'ağır hasar: önizleme kullanıcı onayı olmadan kayıt sayılmaz', JSON.stringify({ userApproved: hdPreview.userApproved }));
assert(hdPreview.summary.aiSummary.includes('35') && hdPreview.summary.warnings.some((warning) => warning.includes('Nihai')), 'ağır hasar: AI özeti nihai karar olmadığını uyarır', JSON.stringify(hdPreview.summary));

const hdEdited = applyHeavyDamageEdits(hdPreview, {
  [hdPreview.rows[2].id]: {
    guideCategory: 'roof-crossmember-unknown',
    damageType: 'repair',
    repairSeverity: 'medium',
    score: 3,
    needsReview: true,
    userNote: 'Eksper orta onarım olarak düzeltti.'
  }
}, 'Eksper fotoğraf kontrolü sonrası onayladı.', '2026-06-19T10:00:00.000Z');
assert(hdEdited.userApproved === true && hdEdited.rows[2].userEdited && hdEdited.rows[2].score === 3 && hdEdited.summary.totalScore === 33, 'ağır hasar: kullanıcı satır düzeltmesi skora ve özete uygulanır', JSON.stringify(hdEdited.rows[2]));
assert(generateHeavyDamageAssessmentNote(hdEdited).includes('Nihai değerlendirme') && generateHeavyDamageAssessmentNote(hdEdited).includes('33'), 'ağır hasar: rapor notu puan ve nihai karar uyarısını içerir', generateHeavyDamageAssessmentNote(hdEdited));
assert(heavyDamageFilterMatches(hdEdited.rows[2], 'review') && heavyDamageFilterMatches(hdEdited.rows[2], 'repair-medium') && !heavyDamageFilterMatches(hdEdited.rows[2], 'repair-heavy'), 'ağır hasar: kontrol ve onarım derece filtreleri çalışır', JSON.stringify(hdEdited.rows[2]));

const pmeFixture = JSON.parse(await fs.readFile(path.join(process.cwd(), 'scripts', 'fixtures', 'heavy-damage-34-pme-968.json'), 'utf-8'));
const pmeInputs = pmeFixture.parts.map((part) => ({
  name: part.name,
  source: 'manual',
  ...(part.note ? { note: part.note } : {}),
  ...(part.operation ? { operation: part.operation } : {}),
  ...(part.structuralConfirmed !== undefined ? { structuralConfirmed: part.structuralConfirmed } : {})
}));
const pmePreview = buildHeavyDamagePreview({
  folderPath: 'C:/case/34PME968',
  plate: pmeFixture.plate,
  officeFileNo: pmeFixture.dosyaNo,
  assessedBy: 'Davranış Testi',
  repairCost: pmeFixture.totalDamageWithVat,
  marketValue: pmeFixture.marketValue,
  now: '2026-06-19T11:00:00.000Z',
  inputs: pmeInputs
});
const pmeFirewall = pmePreview.rows.find((row) => row.sourcePartName === 'Ön Göğüs');
assert(pmePreview.summary.repairToMarketRatio === pmeFixture.expectedRepairToMarketRatio && !pmePreview.summary.economicThresholdExceeded, '34 PME 968 fixture: ekonomik oran yaklaşık %52 ve %60 eşik aşılmadı', JSON.stringify(pmePreview.summary));
assert(pmeFirewall && pmeFirewall.guideCategory === 'firewall' && pmeFirewall.structuralConfirmed === true && pmeFirewall.score === 40 && !pmeFirewall.needsReview, '34 PME 968 fixture: yapısal teyitli Ön Göğüs firewall olarak 40 puan verir', JSON.stringify(pmeFirewall));
assert(pmePreview.summary.thresholdExceeded && pmePreview.summary.totalScore >= 40 && pmePreview.summary.riskLabel.includes('aşıldı'), '34 PME 968 fixture: ekonomik eşik aşılmasa da yapısal eşik ağır hasar riskini açar', JSON.stringify(pmePreview.summary));
assert(pmePreview.summary.warnings.some((warning) => warning.includes('Ekonomik %60 eşik aşılmadı ancak yapısal kritik parça eşiği aşıldı')), '34 PME 968 fixture: ekonomik/yapısal eşik ayrımı gerekçede açık yazılır', JSON.stringify(pmePreview.summary.warnings));
const pmeAirbagRows = pmePreview.rows.filter((row) => row.guideCategory === 'airbag-seatbelt');
const pmeElectricRows = pmePreview.rows.filter((row) => row.guideCategory === 'main-electrical');
const pmeRawScore = pmePreview.rows.reduce((sum, row) => sum + (row.inScope ? row.score : 0), 0);
assert(pmeAirbagRows.length > 3 && pmeElectricRows.length >= 3 && pmePreview.summary.groupedScoreAdjustments >= 2 && pmeRawScore > pmePreview.summary.totalScore, '34 PME 968 fixture: airbag/emniyet ve elektrik kalemleri mükerrer puanı şişirmez', JSON.stringify({ raw: pmeRawScore, summary: pmePreview.summary.totalScore, grouped: pmePreview.summary.groupedScoreAdjustments }));
const pmeTravers = pmePreview.rows.find((row) => row.sourcePartName === 'Ön Travers');
const pmeSteering = pmePreview.rows.find((row) => row.sourcePartName === 'Direksiyon Mili');
assert(pmeTravers && pmeTravers.score === 0 && pmeTravers.needsReview && !pmeTravers.inScope, '34 PME 968 fixture: Ön Travers otomatik puan uydurmaz, kontrol gerekli kalır', JSON.stringify(pmeTravers));
assert(pmeSteering && pmeSteering.score === 0 && pmeSteering.needsReview && !pmeSteering.inScope, '34 PME 968 fixture: Direksiyon Mili tek başına puan uydurmaz, destekleyici kontrol kalır', JSON.stringify(pmeSteering));
const pmeUnconfirmed = buildHeavyDamagePreview({
  folderPath: 'C:/case/front-panel-review',
  plate: '34PME968',
  officeFileNo: '49/18303851',
  assessedBy: 'Davranış Testi',
  inputs: [{ name: 'Ön Göğüs', source: 'manual', operation: 'replacement', structuralConfirmed: false }]
});
assert(pmeUnconfirmed.rows[0].score === 0 && pmeUnconfirmed.rows[0].needsReview && pmeUnconfirmed.rows[0].questions.some((q) => q.includes('torpido/plastik')), 'Ön Göğüs teyitsizse 40 puan verilmez ve torpido/firewall sorusu sorulur', JSON.stringify(pmeUnconfirmed.rows[0]));
const pmeConfirmedByUser = applyHeavyDamageEdits(pmeUnconfirmed, { [pmeUnconfirmed.rows[0].id]: { structuralConfirmed: true } });
assert(pmeConfirmedByUser.rows[0].score === 40 && !pmeConfirmedByUser.rows[0].needsReview && pmeConfirmedByUser.summary.thresholdExceeded, 'Ön Göğüs UI/eksper teyidiyle firewall 40 puana geçer', JSON.stringify(pmeConfirmedByUser.rows[0]));
const pmeNote = generateHeavyDamageAssessmentNote(pmePreview);
assert(pmeNote.includes('34 PME 968') && pmeNote.includes('Ön Göğüs') && pmeNote.includes('40 puan') && pmeNote.includes('Nihai değerlendirme'), '34 PME 968 fixture: resmi rapor notu plaka, Ön Göğüs 40 puan ve nihai karar uyarısını içerir', pmeNote);
const pmeMail = generateHeavyDamageAssessmentMailDraft(pmePreview);
assert(pmeMail.includes('49/18303851') && pmeMail.includes('34 PME 968') && pmeMail.includes('%52') && pmeMail.includes('40 puan') && pmeMail.includes('görüş/onay'), '34 PME 968 fixture: kurumsal mail taslağı dosya no, plaka, oran, 40 puan ve onay talebini içerir', pmeMail);

const heavyDamageRulesSource = await fs.readFile('src/shared/heavy-damage-rules.ts', 'utf-8');
const heavyDamageTypesSource = await fs.readFile('src/shared/heavy-damage-types.ts', 'utf-8');
const heavyDamageServiceSource = await fs.readFile('src/main/services/heavy-damage-assessment-service.ts', 'utf-8');
const heavyDamageComponentSource = await fs.readFile('src/renderer/app/components/heavy-damage-assessment.ts', 'utf-8');
const heavyDamageTrackingSchemaSource = await fs.readFile('src/main/tracking/tracking-schema.ts', 'utf-8');
const heavyDamageRendererMainSource = await fs.readFile('src/renderer/main.ts', 'utf-8');
const heavyDamageIpcContractSource = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const heavyDamageMainIpcSource = await fs.readFile('src/main/ipc.ts', 'utf-8');
const heavyDamagePreloadSource = await fs.readFile('src/preload/preload.ts', 'utf-8');
assert(heavyDamageRulesSource.includes('HEAVY_DAMAGE_THRESHOLD = 35') && heavyDamageRulesSource.includes('HEAVY_DAMAGE_ECONOMIC_THRESHOLD = 60'), 'ağır hasar: 35 puan ve %60 ekonomik eşik sabitleri kaynakta korunur', 'eşik sabitleri eksik');
assert(heavyDamageRulesSource.includes('Ön Göğüs Sacı') && heavyDamageRulesSource.includes('Motosiklet Ana') && heavyDamageRulesSource.includes('Traktör Blok'), 'ağır hasar: rehberde doğrudan riskli yapısal/araç tipleri var', 'rehber kuralı eksik');
assert(heavyDamageRulesSource.includes('isUnconfirmedFrontPanel') && heavyDamageRulesSource.includes('structuralConfirmed') && heavyDamageRulesSource.includes('groupedScoreAdjustments'), 'ağır hasar: Ön Göğüs yapısal teyidi ve grup mükerrer puan koruması kaynakta var', 'structural/group guard eksik');
assert(heavyDamageRulesSource.includes('generateHeavyDamageAssessmentMailDraft') && heavyDamageRulesSource.includes('Ekonomik eşik aşılmamakla birlikte yapısal kritik parça eşiği'), 'ağır hasar: rapor/mail metni ekonomik ve yapısal eşik ayrımını anlatır', 'rapor/mail eşik ayrımı eksik');
assert(heavyDamageTypesSource.includes("HeavyDamageSource = 'manual'") && heavyDamageTypesSource.includes('userApproved') && heavyDamageTypesSource.includes('HeavyDamageRowEdit'), 'ağır hasar: manuel kaynak, kullanıcı onayı ve satır düzeltme tipleri tanımlı', 'tip sözleşmesi eksik');
assert(heavyDamageServiceSource.includes('userConfirmed !== true') && heavyDamageServiceSource.includes('Kullanıcı son onayı olmadan') && heavyDamageServiceSource.includes('tracking.heavyDamageAssessment = record'), 'ağır hasar: main servis son onay olmadan takip.json içine yazmaz', 'son onay guard eksik');
assert(heavyDamageComponentSource.includes('data-action="heavy-damage-preview"') && heavyDamageComponentSource.includes('data-action="heavy-damage-save-confirm"') && heavyDamageComponentSource.includes('Kaydetmeden Önce Son Kontrol'), 'ağır hasar: UI önizleme ve son onay modalı sunar', 'heavy damage UI eksik');
assert(heavyDamageComponentSource.includes('data-heavy-row-score') && heavyDamageComponentSource.includes('data-heavy-row-review') && heavyDamageComponentSource.includes('data-heavy-row-structural') && heavyDamageComponentSource.includes('Mail taslağı'), 'ağır hasar: UI satır düzeltme, yapısal teyit ve mail taslağı alanlarını sunar', 'satır düzeltme/structural/mail alanı eksik');
assert(heavyDamageRendererMainSource.includes("case 'heavy-damage-save': openHeavyDamageConfirm()") && heavyDamageRendererMainSource.includes("case 'heavy-damage-save-confirm'") && heavyDamageRendererMainSource.includes('!state.heavyDamageConfirmOpen') && heavyDamageRendererMainSource.includes('userConfirmed: true') && heavyDamageRendererMainSource.includes('heavyRowStructural'), 'ağır hasar: renderer son onay olmadan kayıt IPC çağırmaz ve yapısal teyidi işler', 'renderer kayıt/structural kapısı eksik');
assert(heavyDamageIpcContractSource.includes('heavyDamagePreview') && heavyDamageIpcContractSource.includes('heavy-damage:save') && heavyDamageMainIpcSource.includes('IPC.heavyDamageSave') && heavyDamagePreloadSource.includes('heavyDamageSave'), 'ağır hasar: IPC contract/main/preload bağlantıları var', 'IPC bağlantısı eksik');
assert(heavyDamageTrackingSchemaSource.includes('normalizeOptionalHeavyDamageAssessment') && heavyDamageTrackingSchemaSource.includes('heavyDamageAssessment'), 'ağır hasar: eski takip.json uyumluluğu için opsiyonel assessment normalize edilir', 'tracking schema uyumluluğu eksik');

const proportional = distributeAmounts([100, 200, 300], 1200);
assert(JSON.stringify(proportional) === JSON.stringify([200, 400, 600]), 'distributeAmounts oranlı dağıtım yapar', JSON.stringify(proportional));
const equal = distributeAmounts([0, null, 0], 300);
assert(JSON.stringify(equal) === JSON.stringify([100, 100, 100]), 'distributeAmounts boş/0 satırlarda eşit dağıtım yapar', JSON.stringify(equal));
const rounding = distributeAmounts([1, 1, 1], 100);
assert(round2(rounding.reduce((sum, value) => sum + value, 0)) === 100, 'distributeAmounts yuvarlama farkını son satıra dengeler', JSON.stringify(rounding));

// v0.3.18: Gerçek klasör adı corpus testleri.
const plateCases = [
  ['06 BGG 761', '06BGG761'],
  ['06BGG761 EVRAK', '06BGG761'],
  ['34BOP660 - DOSYA NO 2026-847291', '34BOP660'],
  ['01 FJG 08', '01FJG08'],
  ['72ADB474 KAPALI', '72ADB474']
];
for (const [folder, expected] of plateCases) {
  assert(parsePlateFromFolderName(folder) === expected, `Plaka corpus: ${folder}`, `Gelen=${parsePlateFromFolderName(folder)}`);
}
const dosyaCases = [
  ['34BOP660 - DOSYA NO 2026-847291', '2026-847291'],
  ['06BGG761 HASAR NO 2026/12345', '2026-12345'],
  ['72ADB474 ARSIV NO 123456789', '123456789'],
  ['01FJG08 2026 98765', '2026-98765']
];
for (const [folder, expected] of dosyaCases) {
  assert(parseDosyaNoFromFolderName(folder) === expected, `Dosya no corpus: ${folder}`, `Gelen=${parseDosyaNoFromFolderName(folder)}`);
}

// v0.3.18: Merge matrix — local edit vs disk delete sessiz kayıp olmamalı.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-behavior-'));
const casePath = path.join(root, 'Mayıs 2026', '06BGG761');
await fs.mkdir(path.join(casePath, 'EVRAK'), { recursive: true });
const service = new TrackingFileService(path.join(root, 'locks'));

const oversizedXlsxPath = path.join(root, 'oversized.xlsx');
await fs.writeFile(oversizedXlsxPath, makeStoredZip([
  ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sayfa1" sheetId="1" id="rId1"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml', '<worksheet><sheetData /></worksheet>', 90 * 1024 * 1024]
]));
let oversizedXlsxRejected = false;
try {
  await inspectLaborExcel(oversizedXlsxPath);
} catch (error) {
  oversizedXlsxRejected = /sinir|sınır|limit|guvenli/i.test(error instanceof Error ? error.message : String(error));
}
assert(oversizedXlsxRejected, 'Excel ZIP açılım sınırı büyük girdiyi reddeder', 'oversized.xlsx kabul edildi');

// v0.4.1 office corpus: Zorunlu evrak matrisi kullanıcının trafik/kasko listesine göre çalışır.
const trafficRequirementsPath = path.join(root, 'Haziran 2026', '34TRF001');
await fs.mkdir(path.join(trafficRequirementsPath, 'EVRAK'), { recursive: true });
for (const name of ['M EHLIYET.pdf', 'M RUHSAT.pdf', 'M POLICE.pdf', 'S POLICE.pdf', 'S EHLIYET.pdf', 'S RUHSAT.pdf', 'KTT.pdf', 'SBMM AGIR HASAR.png']) {
  await fs.writeFile(path.join(trafficRequirementsPath, 'EVRAK', name), 'fixture');
}
const trafficRequirements = await analyzeDocuments(trafficRequirementsPath, 'trafik', '34TRF001');
assert(!trafficRequirements.missingCritical.some((label) => /ALKOL/i.test(label)), 'Trafik dosyasında M Alkol artık zorunlu evrak değildir', JSON.stringify(trafficRequirements.missingCritical));
assert(trafficRequirements.missingCritical.includes('Tramer Sonucu'), 'Trafik dosyasında zabıt yoksa Tramer Sonucu zorunlu olur', JSON.stringify(trafficRequirements.missingCritical));

const kaskoRequirementsPath = path.join(root, 'Haziran 2026', '34KSK001');
await fs.mkdir(path.join(kaskoRequirementsPath, 'EVRAK'), { recursive: true });
for (const name of ['K EHLIYET.pdf', 'K RUHSAT.pdf', 'KASKO POLICE.pdf', 'BEYAN.pdf', 'SBMM AGIR HASAR.png']) {
  await fs.writeFile(path.join(kaskoRequirementsPath, 'EVRAK', name), 'fixture');
}
const kaskoRequirements = await analyzeDocuments(kaskoRequirementsPath, 'kasko', '34KSK001');
assert(kaskoRequirements.missingCritical.length === 0, 'Kasko zorunlu evrak listesi tam dosyada eksik üretmez', JSON.stringify(kaskoRequirements.missingCritical));

// v0.4.1 office corpus: Eski manuel NOTLAR.docx okunur ama takip.json içine otomatik yazılmaz.
const legacyNotePath = path.join(root, 'Haziran 2026', '34NOT123');
await fs.mkdir(path.join(legacyNotePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(legacyNotePath, 'NOTLAR.docx'), makeDocx('Servis arandı\nParça bekleniyor'));
const legacyNoteAnalysis = await analyzeDocuments(legacyNotePath, 'trafik', '34NOT123');
assert(legacyNoteAnalysis.legacyNotes?.[0]?.text.includes('Servis arandı'), 'Eski NOTLAR.docx metni okunur', JSON.stringify(legacyNoteAnalysis.legacyNotes));
let legacyTrackingCreated = true;
try { await fs.stat(service.getTrackingPath(legacyNotePath)); } catch { legacyTrackingCreated = false; }
assert(!legacyTrackingCreated, 'Eski NOTLAR.docx okuma takip.json dosyasını otomatik oluşturmaz', service.getTrackingPath(legacyNotePath));

// v0.4.1 office corpus: OLAY YERİ fotoğrafı zorunlu fotoğraf kontrolüne girer.
const photoCasePath = path.join(root, 'Haziran 2026', '34FOT001');
await fs.mkdir(path.join(photoCasePath, 'HASAR'), { recursive: true });
for (const name of ['HASAR 1.jpg', 'HASAR 2.jpg', 'HASAR 3.jpg', 'HASAR 4.jpg', 'KM.jpg', 'VITES.jpg', 'SASE.jpg']) {
  await fs.writeFile(path.join(photoCasePath, 'HASAR', name), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
}
const missingOlayPhotos = await analyzePhotos(photoCasePath);
assert(missingOlayPhotos.hasOlayYeri === false && missingOlayPhotos.warnings.some((warning) => warning.includes('OLAY YERİ')), 'OLAY YERİ fotoğrafı eksikse uyarı üretilir', JSON.stringify(missingOlayPhotos.warnings));
await fs.mkdir(path.join(photoCasePath, 'OLAY YERI'), { recursive: true });
await fs.writeFile(path.join(photoCasePath, 'OLAY YERI', 'KAZA YERI.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const completeOlayPhotos = await analyzePhotos(photoCasePath);
assert(completeOlayPhotos.hasOlayYeri === true && completeOlayPhotos.olayYeriPhotoCount === 1, 'OLAY YERİ fotoğrafı bulunduğunda sayılır', JSON.stringify(completeOlayPhotos));

// v0.4.1: EVRAK altindaki tek haneli ihbar PDF adi plaka satirina indekslenmeli.
const noticeCasePath = path.join(root, 'Haziran 2026', '34ABC123');
await fs.mkdir(path.join(noticeCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(noticeCasePath, 'EVRAK', '8-858393738.pdf'), makeTextPdf(['Ihbar Foyu', 'Zarar Goren Arac', 'Plaka 34ABC123']), 'utf-8');
const noticeAnalysis = await analyzeDocuments(noticeCasePath, 'trafik', '34ABC123');
assert(noticeAnalysis.claimNoticeNo === '8-858393738', 'Tek haneli prefix ihbar föyü PDF adı okunur', `claimNoticeNo=${noticeAnalysis.claimNoticeNo}`);
assert(noticeAnalysis.claimNoticeFiles.includes('8-858393738.pdf'), 'Tek haneli prefix ihbar föyü kaynak dosyası raporlanır', JSON.stringify(noticeAnalysis.claimNoticeFiles));
assert(noticeAnalysis.zararGorenPlateCheck?.status === 'matched', 'İhbar PDF Zarar Gören Araç plakası klasör plakasıyla eşleşir', JSON.stringify(noticeAnalysis.zararGorenPlateCheck));
const noticeIdentity = {
  caseKey: '34ABC123',
  plate: '34ABC123',
  dosyaNo: '',
  officeFileNo: '',
  claimNoticeNo: '',
  folderPath: noticeCasePath,
  monthFolder: 'Haziran 2026',
  isClosedFolder: false
};
const noticeFingerprint = await getFolderFingerprint(noticeCasePath);
const noticeIndexed = await new FolderAnalyzer(service).analyze(noticeIdentity, noticeFingerprint, 'Davranış Testi');
assert(noticeIndexed.item.plate === '34ABC123', 'İhbar PDF plaka klasörüne bağlı indekslenir', `plate=${noticeIndexed.item.plate}`);
assert(noticeIndexed.item.claimNoticeNo === '8-858393738', 'İhbar PDF numarası dosya listesi indeksine girer', `claimNoticeNo=${noticeIndexed.item.claimNoticeNo}`);
assert(noticeIndexed.item.searchText.includes('8 858393738'), 'İhbar PDF numarası arama metnine girer', `searchText=${noticeIndexed.item.searchText}`);
assert(noticeIndexed.item.documentAnalysis.zararGorenPlateCheck?.status === 'matched', 'İndekslenen dosyada PDF plaka kontrolü eşleşti olarak kalır', JSON.stringify(noticeIndexed.item.documentAnalysis.zararGorenPlateCheck));
let noticeTrackingCreated = true;
try { await fs.stat(service.getTrackingPath(noticeCasePath)); } catch { noticeTrackingCreated = false; }
assert(!noticeTrackingCreated, 'İhbar PDF indeks testi takip.json oluşturmaz', service.getTrackingPath(noticeCasePath));

const mismatchNoticeCasePath = path.join(root, 'Haziran 2026', '34ABC999');
await fs.mkdir(path.join(mismatchNoticeCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(mismatchNoticeCasePath, 'EVRAK', '8-858393738.pdf'), makeTextPdf(['Ihbar Foyu', 'Zarar Goren Arac', 'Plaka 06ABC123']), 'utf-8');
const mismatchNoticeAnalysis = await analyzeDocuments(mismatchNoticeCasePath, 'trafik', '34ABC999');
assert(mismatchNoticeAnalysis.zararGorenPlateCheck?.status === 'mismatch', 'İhbar PDF Zarar Gören Araç plaka uyuşmazlığını yakalar', JSON.stringify(mismatchNoticeAnalysis.zararGorenPlateCheck));
assert(mismatchNoticeAnalysis.warnings.some((warning) => warning.includes('plaka uyuşmazlığı')), 'PDF plaka uyuşmazlığı Risk Kontrol uyarılarına girer', JSON.stringify(mismatchNoticeAnalysis.warnings));

const twoColumnNoticeCasePath = path.join(root, 'Haziran 2026', '34ABC777');
await fs.mkdir(path.join(twoColumnNoticeCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(twoColumnNoticeCasePath, 'EVRAK', '8-858393739.pdf'), makeTextPdf(['Ihbar Foyu', 'Zarar Goren Arac', 'Plaka 06ABC123', 'Sigortali Arac', 'Plaka 34ABC777']), 'utf-8');
const twoColumnNoticeAnalysis = await analyzeDocuments(twoColumnNoticeCasePath, 'trafik', '34ABC777');
assert(twoColumnNoticeAnalysis.zararGorenPlateCheck?.status === 'matched', 'İhbar PDF iki plakalı bölgede klasör plakasını görürse yanlış uyuşmazlık üretmez', JSON.stringify(twoColumnNoticeAnalysis.zararGorenPlateCheck));

const inferredKaskoCasePath = path.join(root, 'Haziran 2026', '34KSK777');
await fs.mkdir(path.join(inferredKaskoCasePath, 'EVRAK'), { recursive: true });
for (const name of ['SIGORTALI RUHSAT.pdf', 'KASKO POLICE.pdf']) {
  await fs.writeFile(path.join(inferredKaskoCasePath, 'EVRAK', name), 'fixture');
}
const inferredKaskoAnalysis = await analyzeDocuments(inferredKaskoCasePath, undefined, '34KSK777');
assert(inferredKaskoAnalysis.claimType === 'kasko', 'Kasko evrakı SIGORTALI kelimesi yüzünden trafik diye sınıflandırılmaz', `claimType=${inferredKaskoAnalysis.claimType}`);

const sigortaPoliceCasePath = path.join(root, 'Haziran 2026', '34TRF777');
await fs.mkdir(path.join(sigortaPoliceCasePath, 'EVRAK'), { recursive: true });
for (const name of ['M EHLIYET.pdf', 'M RUHSAT.pdf', 'M POLICE.pdf', 'SIGORTA POLICE.pdf', 'S EHLIYET.pdf', 'S RUHSAT.pdf', 'ZABIT.pdf', 'SBMM AGIR HASAR.png']) {
  await fs.writeFile(path.join(sigortaPoliceCasePath, 'EVRAK', name), 'fixture');
}
const sigortaPoliceAnalysis = await analyzeDocuments(sigortaPoliceCasePath, 'trafik', '34TRF777');
assert(!sigortaPoliceAnalysis.missingCritical.includes('S Poliçe'), 'SIGORTA POLICE adı trafik dosyasında S Poliçe adayını karşılar', JSON.stringify(sigortaPoliceAnalysis.missingCritical));

const identity = {
  caseKey: '06BGG761',
  plate: '06BGG761',
  dosyaNo: '',
  officeFileNo: '2026/18',
  claimNoticeNo: '13-17947703',
  folderPath: casePath,
  monthFolder: 'Mayıs 2026',
  isClosedFolder: false
};
const base = createDefaultTracking(identity, 'Davranış Testi');
base.notes = [{ id: 'note-1', createdAt: '2026-06-12T10:00:00.000Z', createdBy: 'PC-1', text: 'Base not' }];
base.todos = [{ id: 'todo-1', title: 'Base görev', completed: false, priority: 'Normal', assignedTo: 'Omer', dueDate: '2026-06-20', createdAt: '2026-06-12T10:00:00.000Z' }];
base.status.workflowStatus = 'Yeni Dosya';
await fs.mkdir(path.dirname(service.getTrackingPath(casePath)), { recursive: true });

const current = clone(base);
current.notes = [];
current.todos = [];
current.metadata.writeId = randomUUID();
await fs.writeFile(service.getTrackingPath(casePath), JSON.stringify(current, null, 2), 'utf-8');

const local = clone(base);
local.notes[0].text = 'Yerel düzenlenmiş not';
local.todos[0].title = 'Yerel düzenlenmiş görev';
local.status.workflowStatus = 'Onarımda';
const result = await service.resolveConflict(casePath, current.metadata.revision, current.metadata.writeId, 'Davranış Testi', 'merge-safe', base, local);
assert(!('conflict' in result), 'Merge matrix conflict çözümü tamamlanır', JSON.stringify(result));
const merged = await service.readExisting(casePath);
assert(merged?.notes.some((note) => note.id === 'note-1' && note.text === 'Yerel düzenlenmiş not'), 'Merge matrix local edit vs disk delete notu korur', JSON.stringify(merged?.notes));
assert(merged?.todos.some((todo) => todo.id === 'todo-1' && todo.title === 'Yerel düzenlenmiş görev'), 'Merge matrix local edit vs disk delete görevi korur', JSON.stringify(merged?.todos));
assert(merged?.status.workflowStatus === 'Onarımda', 'Merge matrix scalar local değişikliği disk base ise korur', `workflowStatus=${merged?.status.workflowStatus}`);

const keyOrderCasePath = path.join(root, 'Mayıs 2026', '06BGG762');
await fs.mkdir(path.dirname(service.getTrackingPath(keyOrderCasePath)), { recursive: true });
const keyOrderIdentity = { ...identity, caseKey: '06BGG762', plate: '06BGG762', folderPath: keyOrderCasePath };
const keyOrderBase = createDefaultTracking(keyOrderIdentity, 'Davranış Testi');
const keyOrderTodo = { id: 'todo-key-order', title: 'Aynı görev', completed: false, priority: 'Normal', assignedTo: 'Omer', dueDate: '2026-06-20', createdAt: '2026-06-12T10:00:00.000Z' };
keyOrderBase.todos = [keyOrderTodo];
const keyOrderCurrent = clone(keyOrderBase);
keyOrderCurrent.todos = [];
keyOrderCurrent.metadata.writeId = randomUUID();
await fs.writeFile(service.getTrackingPath(keyOrderCasePath), JSON.stringify(keyOrderCurrent, null, 2), 'utf-8');
const keyOrderLocal = clone(keyOrderBase);
keyOrderLocal.todos = [{ title: keyOrderTodo.title, id: keyOrderTodo.id, priority: keyOrderTodo.priority, completed: keyOrderTodo.completed, dueDate: keyOrderTodo.dueDate, assignedTo: keyOrderTodo.assignedTo, createdAt: keyOrderTodo.createdAt }];
const keyOrderResult = await service.resolveConflict(keyOrderCasePath, keyOrderCurrent.metadata.revision, keyOrderCurrent.metadata.writeId, 'Davranış Testi', 'merge-safe', keyOrderBase, keyOrderLocal);
assert(!('conflict' in keyOrderResult), 'Merge matrix key-order conflict çözümü tamamlanır', JSON.stringify(keyOrderResult));
const keyOrderMerged = await service.readExisting(keyOrderCasePath);
assert(!keyOrderMerged?.todos.some((todo) => todo.id === 'todo-key-order'), 'Merge matrix key-order farkını gerçek local edit sanıp disk silmesini geri almaz', JSON.stringify(keyOrderMerged?.todos));

// v0.4.8 P1: resolveConflict, okunabilir özet (HASARBOTU_TAKIP_OZETI.txt) yazımı PATLASA bile
// başarılı olmalı; takip.json yazıldıysa işlem başarılı sayılır (mutate ile tutarlı davranış).
const sfCasePath = path.join(root, 'Haziran 2026', '06BGG763');
await fs.mkdir(path.dirname(service.getTrackingPath(sfCasePath)), { recursive: true });
const sfIdentity = { ...identity, caseKey: '06BGG763', plate: '06BGG763', folderPath: sfCasePath };
const sfBase = createDefaultTracking(sfIdentity, 'Davranış Testi');
sfBase.status.workflowStatus = 'Yeni Dosya';
const sfCurrent = clone(sfBase);
sfCurrent.metadata.writeId = randomUUID();
await fs.writeFile(service.getTrackingPath(sfCasePath), JSON.stringify(sfCurrent, null, 2), 'utf-8');
const sfLocal = clone(sfBase);
sfLocal.status.workflowStatus = 'Onarımda';
const originalWriteSummary = service.writeHumanSummary.bind(service);
service.writeHumanSummary = async () => { throw new Error('ÖZET YAZILAMADI (P1 test)'); };
let sfResult = null; let sfThrew = false;
try {
  sfResult = await service.resolveConflict(sfCasePath, sfCurrent.metadata.revision, sfCurrent.metadata.writeId, 'Davranış Testi', 'use-local', sfBase, sfLocal);
} catch { sfThrew = true; }
service.writeHumanSummary = originalWriteSummary;
assert(!sfThrew && sfResult && !('conflict' in sfResult), 'P1 resolveConflict özet yazımı patlasa da başarısız olmaz', JSON.stringify({ sfThrew, sfResult }));
const sfDisk = await service.readExisting(sfCasePath);
assert(sfDisk?.status.workflowStatus === 'Onarımda', 'P1 özet hatasına rağmen takip.json (ana veri) yazıldı', `workflowStatus=${sfDisk?.status.workflowStatus}`);

// v0.3.18: Dead-code ve yanıltıcı UI isimleri kontrolü.
for (const deadFile of [
  'src/main/scanner/background-refresh-service.ts',
  'src/main/scanner/pcloud-change-detector.ts',
  'src/main/local-cache/local-case-index.ts',
  'src/main/import/pdf-analyzer.ts'
]) {
  let exists = true;
  try { await fs.stat(deadFile); } catch { exists = false; }
  assert(!exists, `Dead code temizlendi: ${deadFile}`, `${deadFile} hâlâ mevcut`);
}
const detailSource = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
const layoutSource = await fs.readFile('src/renderer/app/components/layout.ts', 'utf-8');
const ipcDomainSource = await fs.readFile('src/main/services/ipc-domain-services.ts', 'utf-8');
const rendererMainSource = await fs.readFile('src/renderer/main.ts', 'utf-8');
const rendererStateSource = await fs.readFile('src/renderer/app/state.ts', 'utf-8');
const rendererStylesSource = await fs.readFile('src/renderer/styles.css', 'utf-8');
const autoLaborVmSource = await fs.readFile('src/shared/auto-labor-view-model.ts', 'utf-8');
const settingsSource = await fs.readFile('src/renderer/app/components/settings.ts', 'utf-8');
const aiQueuePanelSource = await fs.readFile('src/renderer/app/components/ai-queue-panel.ts', 'utf-8');
const knowledgePanelSource = await fs.readFile('src/renderer/app/components/knowledge-panel.ts', 'utf-8');
const ipcContractSource = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const mainIpcSource = await fs.readFile('src/main/ipc.ts', 'utf-8');
const preloadSource = await fs.readFile('src/preload/preload.ts', 'utf-8');
const learningAdminSource = await fs.readFile('src/main/services/labor-learning-admin-service.ts', 'utf-8');
const casesQuerySource = await fs.readFile('src/main/services/cases-query-service.ts', 'utf-8');
const settingsNormalizerSource = await fs.readFile('src/main/services/settings-normalizer.ts', 'utf-8');
const sharedTypesSource = await fs.readFile('src/shared/types.ts', 'utf-8');
const knowledgeTypesSource = await fs.readFile('src/shared/knowledge/knowledge-types.ts', 'utf-8');
const knowledgeSearchTypesSource = await fs.readFile('src/shared/knowledge/knowledge-search-types.ts', 'utf-8');
const knowledgeSafetySource = await fs.readFile('src/shared/knowledge/knowledge-safety.ts', 'utf-8');
const knowledgeImportTypesSource = await fs.readFile('src/shared/knowledge/knowledge-import-types.ts', 'utf-8');
const knowledgeImportPermissionsSource = await fs.readFile('src/shared/knowledge/knowledge-import-permissions.ts', 'utf-8');
const knowledgeImportSafetySource = await fs.readFile('src/shared/knowledge/knowledge-import-safety.ts', 'utf-8');
const knowledgeImportViewModelSource = await fs.readFile('src/shared/knowledge/knowledge-import-plan-view-model.ts', 'utf-8');
const knowledgeImportPlannerSource = await fs.readFile('src/main/services/knowledge/knowledge-import-planner.ts', 'utf-8');
const knowledgeImportPermissionServiceSource = await fs.readFile('src/main/services/knowledge/knowledge-import-permission-service.ts', 'utf-8');
const knowledgeImportSafetyServiceSource = await fs.readFile('src/main/services/knowledge/knowledge-import-safety-service.ts', 'utf-8');
const knowledgeImportPlanViewSource = await fs.readFile('src/renderer/app/components/knowledge-import-plan-view.ts', 'utf-8');
const knowledgeNormalizerSource = await fs.readFile('src/main/services/knowledge/knowledge-normalizer.ts', 'utf-8');
const knowledgeSeedSource = await fs.readFile('src/main/services/knowledge/knowledge-seed-service.ts', 'utf-8');
const knowledgeSearchSource = await fs.readFile('src/main/services/knowledge/knowledge-search-service.ts', 'utf-8');
const knowledgeRegistrySource = await fs.readFile('src/main/services/knowledge/knowledge-source-registry.ts', 'utf-8');
// v0.4.1: Bağımsız "Risk Kontrolü" sekmesi "Sorunlar / Risk" sayfasına taşındı; risk etiketi
// artık detail.ts içindeki Risk Kontrol Özeti'nde yaşar. Yapay Zekâ yasağı aşağıda korunur.
assert(detailSource.includes('Risk Kontrol'), 'Yapay Zekâ etiketi Risk Kontrol olarak değiştirildi', 'Risk Kontrol etiketi yok');
assert(!detailSource.includes('Yapay Zekâ') && !layoutSource.includes('Yapay Zekâ'), 'Uygulama ana UI içinde yanıltıcı Yapay Zekâ etiketi kalmadı', 'Yapay Zekâ etiketi hâlâ var');
assert(ipcDomainSource.includes('sanitizeNoteText') && !ipcDomainSource.includes('const text = safeFileDisplayName(args.text.trim())'), 'Not metni dosya adı temizleyiciyle 180 karaktere kırpılmaz', 'Not akışı safeFileDisplayName ile kırpılıyor');
assert(detailSource.includes('data-action="auto-labor-filter"') && detailSource.includes('Gösterilen:') && autoLaborVmSource.includes("medium: 'Orta güven'") && autoLaborVmSource.includes("low: 'Düşük güven'") && autoLaborVmSource.includes("oldCleared: 'Eski değer sıfırlanacak'") && autoLaborVmSource.includes("learning: 'Öğrenmeye aday'"), 'v0.5.0 AI işçilik önizlemesi tüm kritik filtreleri sunar', 'AI işçilik filtre UI eksik');
assert(detailSource.includes('id="auto-labor-search"') && autoLaborVmSource.includes('autoLaborSearchMatches') && rendererMainSource.includes("target.id === 'auto-labor-search'"), 'v0.5.0 AI işçilik önizleme araması parça/grup/kod/işçilik/gerekçeyi süzer', 'AI işçilik arama akışı eksik');
assert(rendererStateSource.includes('autoLaborFilter') && rendererStateSource.includes('autoLaborSearch') && rendererMainSource.includes("case 'auto-labor-filter'") && rendererMainSource.includes("state.autoLaborFilter = 'all'"), 'v0.5.0 AI işçilik filtre/arama state bağlantısı ve sıfırlama akışı var', 'AI işçilik filtre state/renderer bağlantısı eksik');
assert(rendererStateSource.includes('autoLaborPage') && detailSource.includes('buildAutoLaborPageModel') && detailSource.includes('auto-labor-pagination') && rendererMainSource.includes("case 'auto-labor-page'") && rendererMainSource.includes('setAutoLaborPage') && rendererMainSource.includes('queueAutoLaborSearchUpdate') && rendererStylesSource.includes('.auto-labor-pagination'), 'v0.5.0 AI işçilik büyük Excel önizlemesi sayfalama, tek-pass sayfa modeli ve arama debounce ile korunur', 'AI işçilik büyük Excel sayfalama/page-model guard eksik');
assert(detailSource.includes('auto-labor-summary-card') && detailSource.includes('Toplam satır') && detailSource.includes('Sıfırlanacak H-N') && rendererStylesSource.includes('.auto-labor-summary-cards'), 'v0.5.0 AI işçilik üst özet kartları tıklanabilir filtre olarak render edilir', 'AI işçilik özet kartları eksik');
assert(rendererMainSource.includes("case 'auto-labor-save': openAutoLaborConfirm()") && rendererMainSource.includes("case 'auto-labor-save-confirm'") && rendererMainSource.includes('if (!state.autoLaborConfirmOpen)') && detailSource.includes('Kaydetmeden önce son kontrol'), 'v0.5.0 AI işçilik son onay modalı olmadan Excel yazmaz', 'AI işçilik son onay kapısı eksik');
assert(detailSource.includes('auto-labor-confirm-card') && detailSource.includes('Geri dön ve düzenle') && detailSource.includes('Formüllü hücreler tespit edildi') && rendererMainSource.includes('preview.formulaCellsFound > 0 && !state.autoLaborAllowFormula'), 'v0.5.0 AI işçilik formül uyarısı son onay modalında ve yazma kapısında korunur', 'AI işçilik formül modal/guard eksik');
assert(autoLaborVmSource.includes('autoLaborHasUserEdit') && autoLaborVmSource.includes('Kullanıcı tarafından düzeltildi') && autoLaborVmSource.includes('Öğrenmeye kaydedilecek') && rendererMainSource.includes('autoLaborReviewRows'), 'v0.5.0 AI işçilik kullanıcı düzeltmesi, kontrol gerekli ve öğrenme adayı state akışı var', 'AI işçilik düzeltme/öğrenme state akışı eksik');
assert(detailSource.includes('renderAutoLaborResult') && detailSource.includes('Kullanıcı düzeltmesi') && detailSource.includes('Sıfırlanan eski H-N') && detailSource.includes('Kısmi yazma') && detailSource.includes('renderCategoryTotals') && rendererStylesSource.includes('.auto-labor-result-grid'), 'v0.5.0 AI işçilik kaydetme sonucu kategori toplamları, kullanıcı düzeltmesi ve kısmi yazma durumuyla raporlanır', 'AI işçilik sonuç raporu grid/kısmi yazma kontrolü eksik');
assert(rendererMainSource.includes('state.autoLaborSaveError') && detailSource.includes('Excel kaydedilemedi.') && rendererMainSource.includes('Başarı onayı alınmadı; çıktı dosyası oluştuysa kullanmadan önce kontrol edin.') && rendererMainSource.includes("setToast('Excel kaydedilemedi. Orijinal dosya korunuyor.', 'warning')") && rendererMainSource.includes('setToast(`Excel başarıyla kaydedildi:'), 'v0.5.0 AI işçilik hata durumunda başarılı kayıt mesajı göstermez ve kısmi yazma şüphesini raporlar', 'AI işçilik hata/kısmi yazma raporu eksik');
assert(rendererStylesSource.includes('.auto-labor-filter-bar') && rendererStylesSource.includes('.auto-labor-filter-button.active') && rendererStylesSource.includes('.auto-labor-confirm-grid'), 'v0.5.0 AI işçilik filtreleri ve son onay modalı kompakt UI stiliyle korunur', 'AI işçilik filtre/modal CSS eksik');

assert(detailSource.includes('data-default-closed="true"') && detailSource.includes('<summary>Gerek') && !detailSource.includes('auto-labor-reason" open') && rendererStylesSource.includes('.auto-labor-reason:not([open]) small') && rendererStylesSource.includes('.auto-labor-reason[open] small'), 'v0.5.0 AI iscilik uzun gerekce alanlari varsayilan kapali ve kompakt render edilir', 'AI iscilik gerekce alani kapali/kompakt guard eksik');
assert(autoLaborVmSource.includes('AUTO_LABOR_PAGE_SIZE_OPTIONS') && autoLaborVmSource.includes('[25, 50, 100]') && detailSource.includes('data-auto-labor-page-size') && rendererMainSource.includes('setAutoLaborPageSize') && rendererStylesSource.includes('.auto-labor-page-size'), 'v0.5.0 AI iscilik sayfa basina 25/50/100 satir secimi korunur', 'AI iscilik sayfa boyutu secimi eksik');
assert(settingsSource.includes('AI İşçilik Öğrenme Sözlüğü') && settingsSource.includes('labor-learning-search') && settingsSource.includes('labor-learning-update') && settingsSource.includes('labor-learning-import') && rendererStylesSource.includes('.labor-learning-card'), 'v0.5.0 AI iscilik ogrenme sozlugu Ayarlar icinde yonetilebilir UI sunar', 'AI iscilik ogrenme sozlugu UI eksik');
assert(ipcContractSource.includes('laborLearningList') && ipcContractSource.includes('labor-learning:list') && mainIpcSource.includes('IPC.laborLearningUpdate') && preloadSource.includes('laborLearningImport') && learningAdminSource.includes('importLaborLearningJson'), 'v0.5.0 AI iscilik ogrenme sozlugu IPC/import-export servisi bagli', 'AI iscilik ogrenme sozlugu IPC/servis baglantisi eksik');

// --- v0.6.0 UI temizlik: Bilgi Bankasi Turkcelestirme + AI Iscilik Ogrenme Sozlugu kompakt akordeon ---
const stripCodeComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const knowledgeUiDisplaySource = `${stripCodeComments(knowledgePanelSource)}\n${stripCodeComments(knowledgeImportPlanViewSource)}`;
assert(!/dry-run|read-only|local-only|Import Commit|Import Plan|metadata/i.test(knowledgeUiDisplaySource), 'v0.6.0 UI Bilgi Bankasi panel/plan goruntusunde Ingilizce kullanici metni (Dry-run/Read-only/Import Commit/Metadata) kalmadi', 'Bilgi Bankasi goruntusunde Ingilizce UI metni var');
assert(knowledgePanelSource.includes('Canlı Deneme Planı') && knowledgePanelSource.includes('Kalıcı Kayıt Ön İzleme') && knowledgePanelSource.includes('salt okunur') && knowledgePanelSource.includes('Yalnız yerel') && knowledgePanelSource.includes('Kalıcı olarak ekle'), 'v0.6.0 UI Bilgi Bankasi Turkce karsiliklar (Deneme Plani/Kalici Kayit/salt okunur) mevcut', 'Bilgi Bankasi Turkce karsiliklari eksik');
assert(rendererStateSource.includes('laborLearningExpanded: Record<string, boolean>') && rendererStateSource.includes('laborLearningExpanded: {}'), 'v0.6.0 UI sozluk ac/kapat durumu bellek-ici state olarak tanimli (varsayilan bos)', 'laborLearningExpanded state eksik');
assert(settingsSource.includes('labor-learning-row compact') && settingsSource.includes('data-action="labor-learning-toggle"') && settingsSource.includes('labor-learning-detail') && settingsSource.includes("'Kapat' : 'Aç'") && settingsSource.includes('data-action="labor-learning-update"') && settingsSource.includes('data-action="labor-learning-delete"') && settingsSource.includes('data-action="labor-learning-disable"'), 'v0.6.0 UI AI iscilik ogrenme sozlugu kompakt akordeon (varsayilan kapali) + kaydet/sil/devre-disi korunur', 'sozluk kompakt akordeon yapisi eksik');
assert(rendererMainSource.includes('toggleLaborLearningExpanded') && rendererMainSource.includes("case 'labor-learning-toggle'"), 'v0.6.0 UI sozluk ac/kapat aksiyonu yalniz UI bellegini gunceller (yeni IPC/yazma yok)', 'sozluk toggle aksiyonu eksik');
const aiQueueIpcSlice = mainIpcSource.slice(mainIpcSource.indexOf('IPC.aiQueueGetSnapshot'), mainIpcSource.indexOf('IPC.heavyDamagePreview'));
const knowledgeIpcSlice = mainIpcSource.slice(mainIpcSource.indexOf('IPC.knowledgeSearch'), mainIpcSource.indexOf('IPC.heavyDamagePreview'));
assert(ipcContractSource.includes('AiQueueEnqueuePreviewArgs') && preloadSource.includes('enqueueAiPreview') && mainIpcSource.includes('buildSafeAiQueuePreviewRequest') && mainIpcSource.includes('allowPaidProviders: false') && mainIpcSource.includes('allowExternalProviders: false'), 'v0.6.0 P1-B AI queue IPC/preload/main guvenli preview katmani bagli', 'AI queue IPC/preload/main guard eksik');
assert(ipcContractSource.includes('aiQueueGetEvents') && ipcContractSource.includes('aiQueue:getEvents') && preloadSource.includes('getAiQueueEvents') && mainIpcSource.includes('aiQueue.getEvents'), 'v0.6.0 P1-E AI queue event gecmisi read-only IPC/preload hattindan okunur', 'AI queue event IPC/preload baglantisi eksik');
assert(aiQueueIpcSlice.includes('aiQueue.getSnapshot') && aiQueueIpcSlice.includes('aiQueue.getEvents') && aiQueueIpcSlice.includes('aiQueue.getTask') && aiQueueIpcSlice.includes('aiQueue.enqueue') && aiQueueIpcSlice.includes('aiQueue.cancelTask') && aiQueueIpcSlice.includes('aiQueue.clearFinished') && !aiQueueIpcSlice.includes('laborAutoSave') && !aiQueueIpcSlice.includes('tracking.mutate') && !aiQueueIpcSlice.includes('writeCaseCache'), 'v0.6.0 P1-B/P1-E AI queue IPC katmani kalici yazma endpointi tasimaz', aiQueueIpcSlice);
assert(knowledgeTypesSource.includes('KnowledgeSource') && knowledgeTypesSource.includes('KnowledgeChunk') && knowledgeSearchTypesSource.includes('KnowledgeSearchResponse') && knowledgeSearchTypesSource.includes('matchedTerms'), 'v0.6.0 P2-A knowledge shared source/chunk/search tipleri tanimli', 'knowledge shared tipleri eksik');
assert(knowledgeNormalizerSource.includes('normalizeKnowledgeText') && knowledgeNormalizerSource.includes('tokenizeKnowledgeText') && knowledgeNormalizerSource.includes('hava yastigi') && knowledgeNormalizerSource.includes('firewall'), 'v0.6.0 P2-A knowledge normalizer Turkce/synonym destegi tasir', 'knowledge normalizer eksik');
assert(knowledgeSeedSource.includes('Agir Hasar Kritik Parca Ozet Kurali') && knowledgeSeedSource.includes('On Gogus Saci Degisim Kurali') && knowledgeSeedSource.includes('Airbag ve Emniyet Sistemi Kurali') && knowledgeSeedSource.includes('Police Muafiyet Genel Kontrol') && knowledgeSeedSource.includes('AI Guvenlik Ilkesi'), 'v0.6.0 P2-A built-in seed kaynaklari ekli', 'knowledge seed kaynaklari eksik');
assert(knowledgeSearchSource.includes('KnowledgeSearchService') && knowledgeSearchSource.includes('scoreChunk') && knowledgeSearchSource.includes('sourceTypeFiltered') && knowledgeSearchSource.includes('matchedTerms') && knowledgeSearchSource.includes('PRIORITY_SCORE'), 'v0.6.0 P2-A deterministic knowledge search scoring servisi var', 'knowledge search scoring eksik');
assert(knowledgeSafetySource.includes('KNOWLEDGE_LOCAL_ONLY') && knowledgeSafetySource.includes('KNOWLEDGE_READ_ONLY_CHANNELS') && knowledgeSafetySource.includes('KNOWLEDGE_FORBIDDEN_ACTION_PATTERN'), 'v0.6.0 P2-A knowledge local-only/read-only guvenlik sabitleri var', 'knowledge safety sabitleri eksik');
assert(ipcContractSource.includes('knowledgeSearch') && ipcContractSource.includes('knowledge:search') && ipcContractSource.includes('knowledgeListSources') && ipcContractSource.includes('knowledgeGetSource') && ipcContractSource.includes('knowledgeGetChunk') && preloadSource.includes('searchKnowledge') && preloadSource.includes('listKnowledgeSources') && preloadSource.includes('getKnowledgeSource') && preloadSource.includes('getKnowledgeChunk'), 'v0.6.0 P2-A knowledge IPC/preload read-only metodlari bagli', 'knowledge IPC/preload baglantisi eksik');
assert(knowledgeIpcSlice.includes('searchKnowledgeWithUserStore') && knowledgeIpcSlice.includes('knowledge.listSources') && knowledgeIpcSlice.includes('knowledge.getSource') && knowledgeIpcSlice.includes('knowledge.getChunk') && !/knowledge:(write|save|apply|import|export|delete|edit|sync|upload|download|copy|persist|provider)/i.test(ipcContractSource) && !knowledgeIpcSlice.includes('tracking.mutate') && !knowledgeIpcSlice.includes('writeCaseCache') && !knowledgeIpcSlice.includes('laborAutoSave'), 'v0.6.0 P2-A knowledge IPC katmani kalici yazma endpointi tasimaz (search read-only user store dahil eder)', knowledgeIpcSlice);
assert(!/OpenAI|Claude|Gemini|paid|external|fetch\(|axios|embedding|vector database|sqlite/i.test([knowledgeNormalizerSource, knowledgeSeedSource, knowledgeSearchSource, knowledgeSafetySource].join('\n')), 'v0.6.0 P2-A knowledge servisleri ucretli/harici provider veya internet bagimliligi tasimaz', 'knowledge servislerinde yasak provider/internet izi var');
const knowledgeRendererSlice = rendererMainSource.slice(rendererMainSource.indexOf('async function loadKnowledgeSources'), rendererMainSource.indexOf('function syncAiQueueAutoRefresh'));
const knowledgePreloadMethods = [...preloadSource.matchAll(/^\s*(\w*Knowledge\w*)\s*:/gm)].map((match) => match[1]).sort();
const expectedKnowledgePreloadMethods = ['chooseFilesForKnowledgeImportDryRun', 'commitApprovedKnowledgeImportTextPreview', 'dryRunKnowledgeImportPlan', 'getKnowledgeChunk', 'getKnowledgeSource', 'listKnowledgeSources', 'previewTextFileForKnowledgeImport', 'searchKnowledge'];
const knowledgeRuntimeScopeSource = [knowledgeNormalizerSource, knowledgeSeedSource, knowledgeSearchSource, knowledgeRegistrySource, knowledgePanelSource, knowledgeRendererSlice].join('\n');
assert(JSON.stringify(knowledgePreloadMethods) === JSON.stringify(expectedKnowledgePreloadMethods), 'v0.6.0 P2-E knowledge preload sadece read-only metodlari sunar', JSON.stringify(knowledgePreloadMethods));
assert(!/fs\.|writeFile|appendFile|createWriteStream|mkdir|localStorage|sessionStorage|indexedDB|queuePersistUiPreferences|saveSettings|writeCaseCache|tracking\.mutate|laborAutoSave/i.test(knowledgeRuntimeScopeSource), 'v0.6.0 P2-E knowledge servis/panel/renderer scope kalici storage yazimi tasimaz', 'knowledge runtime scope yazma izi tasiyor');
assert(!/OpenAI|Claude|Gemini|API key|Cloud|OCR|paid|external|hosted|fetch\(|axios|embedding|vector database|sqlite|provider se[cç]|sa[gğ]lay[iı]c[iı] se[cç]/i.test(knowledgeRuntimeScopeSource), 'v0.6.0 P2-E knowledge runtime scope ucretli/harici provider izi tasimaz', 'knowledge runtime scope provider izi tasiyor');
const knowledgeImportSource = [knowledgeImportTypesSource, knowledgeImportPermissionsSource, knowledgeImportSafetySource, knowledgeImportPlannerSource, knowledgeImportPermissionServiceSource, knowledgeImportSafetyServiceSource].join('\n');
assert(knowledgeImportTypesSource.includes('KnowledgeImportPermissionLevel') && knowledgeImportTypesSource.includes('KnowledgeImportSourceKind') && knowledgeImportTypesSource.includes('KnowledgeImportPlan') && knowledgeImportTypesSource.includes('canWrite: false'), 'v0.6.0 P3-A knowledge import izin modeli ve canWrite=false plan tipi tanimli', 'P3-A import tipleri eksik');
assert(knowledgeImportPermissionsSource.includes("'.pdf'") && knowledgeImportPermissionsSource.includes("'.docx'") && knowledgeImportPermissionsSource.includes("'.xlsx'") && knowledgeImportPermissionsSource.includes("'.exe'") && knowledgeImportPermissionsSource.includes("'.bat'") && knowledgeImportPermissionsSource.includes("'.zip'"), 'v0.6.0 P3-A allowed/dangerous uzanti politikasi tanimli', 'P3-A uzanti politikasi eksik');
assert(knowledgeImportPlannerSource.includes('buildDryRunPlan') && knowledgeImportPlannerSource.includes('heavy_damage_guide') && knowledgeImportPlannerSource.includes('fault_scenario_guide') && knowledgeImportPlannerSource.includes('fault_ratio_image') && knowledgeImportPlannerSource.includes('policy_note') && knowledgeImportPlannerSource.includes('claim_tracking_sheet'), 'v0.6.0 P3-A dry-run planlayici sourceKind mappinglerini tasir', 'P3-A mapping eksik');
assert(knowledgeImportPermissionServiceSource.includes('requires_user_approval') && knowledgeImportPermissionServiceSource.includes('dry_run_only') && knowledgeImportPermissionServiceSource.includes('not_allowed') && knowledgeImportPermissionServiceSource.includes('Excel import/parsing bu gorevde yapilmaz'), 'v0.6.0 P3-A permission servisi onay/dry-run/red kararlarini ayirir', 'P3-A permission karar mantigi eksik');
assert(!/from ['"]node:fs|from ['"]fs|fs\.|writeFile|appendFile|createWriteStream|mkdir|LocalCacheStore|TrackingFileService|tracking\.mutate|writeCaseCache|laborAutoSave|distributeLaborExcel|saveAutoLaborExcel/i.test(knowledgeImportSource), 'v0.6.0 P3-A import planlayici kalici storage veya Excel/takip yazma API tasimaz', 'P3-A import planner yazma izi tasiyor');
assert(!/from ['"][^'"]*(pdf2json|xlsx|mammoth|tesseract)|createWorker|loadWorkbook|readFile\(|parsePdf|extractText|analyzeDocuments/i.test(knowledgeImportSource), 'v0.6.0 P3-A PDF/DOCX/XLSX parser veya OCR calistirma yolu eklemez', 'P3-A parser/OCR izi tasiyor');
assert(!/OpenAI|Claude|Gemini|API key|fetch\(|axios|embedding|vector database|sqlite|requiresApiKey|allowPaidProviders|allowExternalProviders/i.test(knowledgeImportSource), 'v0.6.0 P3-A import katmani ucretli/harici provider veya internet bagimliligi tasimaz', 'P3-A provider/internet izi tasiyor');
assert(ipcContractSource.includes('knowledgeImportDryRunPlan') && preloadSource.includes('dryRunKnowledgeImportPlan') && mainIpcSource.includes('IPC.knowledgeImportDryRunPlan') && mainIpcSource.includes('buildDryRunPlan') && !/knowledgeImport(Save|Apply|Execute|Write|Delete|Persist|Upload)/i.test(ipcContractSource + preloadSource + mainIpcSource) && !/data-action="[^"]*(knowledge-import|knowledge-export|knowledge-save|knowledge-apply|knowledge-delete|knowledge-write)/i.test(knowledgePanelSource), 'v0.6.0 P3-G/P4-E2-B dry-run + dar commit disinda save/apply/execute/delete/write import endpoint yok', 'P3-G/P4-E2-B import endpoint guard ihlali');
const p3gDryRunResponse = buildDryRunPlan({ mode: 'dry_run', files: [{ fileName: 'Agir Hasar Kritik Parca Rehberi.pdf' }, { fileName: 'tehlikeli.exe' }] });
assert(p3gDryRunResponse.plan.canWrite === false && p3gDryRunResponse.plan.mode === 'dry_run' && p3gDryRunResponse.plan.candidates.length === 2 && p3gDryRunResponse.plan.candidates.every((candidate) => candidate.canWrite === false), 'v0.6.0 P3-G dry-run IPC planlayicisi yalniz dosya-adi metadata ile canWrite=false plan uretir', JSON.stringify(p3gDryRunResponse.plan.totals));
assert(rendererStateSource.includes('knowledgeImportDryRunPlan') && rendererStateSource.includes('knowledgeImportDryRunLoading') && rendererStateSource.includes('knowledgeImportDryRunError'), 'v0.6.0 P3-H canli dry-run plan renderer state alanlari mevcut', 'P3-H state alanlari eksik');
assert(rendererMainSource.includes('loadKnowledgeImportDryRunPlan') && rendererMainSource.includes('window.hasarbotu.dryRunKnowledgeImportPlan') && knowledgePanelSource.includes('knowledgeImportDryRunPlan') && knowledgePanelSource.includes('Canlı Deneme Planı'), 'v0.6.0 P3-H panel read-only dry-run IPC sonucunu canli gosterir; dosya secici/yazma yok', 'P3-H canli IPC paneli baglanmadi');
const knowledgeImportDryRunServiceSource = await fs.readFile('src/main/services/knowledge/knowledge-import-dry-run-service.ts', 'utf-8');
assert(knowledgeImportDryRunServiceSource.includes('showOpenDialog') && knowledgeImportDryRunServiceSource.includes('fs.stat') && knowledgeImportDryRunServiceSource.includes('buildDryRunPlan') && !/readFile|createReadStream|writeFile|appendFile|createWriteStream|mkdir|\bunlink\b|rename\(|pdf2json|loadWorkbook|extractText|parsePdf|tesseract|mammoth|fs\.open|fs\.read\b|OpenAI|Claude|Gemini|fetch\(|axios|\bOCR\b|sqlite|embedding/i.test(knowledgeImportDryRunServiceSource), 'v0.6.0 P4-A dosya secici servisi yalniz ad+boyut(stat) metadata kullanir; icerik okuma/parser/yazma/provider yok', 'P4-A dosya secici servisi icerik/yazma/provider izi tasiyor');
assert(ipcContractSource.includes('knowledgeImportChooseFilesDryRun') && ipcContractSource.includes("'knowledge-import:choose-files-dry-run'") && preloadSource.includes('chooseFilesForKnowledgeImportDryRun') && mainIpcSource.includes('IPC.knowledgeImportChooseFilesDryRun') && rendererMainSource.includes('chooseKnowledgeImportDryRunFiles') && knowledgePanelSource.includes('data-action="knowledge-dryrun-choose-files"'), 'v0.6.0 P4-A dosya secici + metadata dry-run kontrat/preload/handler/renderer/panel ile bagli', 'P4-A dosya secici baglantisi eksik');
assert(rendererStateSource.includes('knowledgeImportApprovalState'), 'v0.6.0 P4-B bellek-ici onay karari renderer state alani mevcut', 'P4-B onay state alani eksik');
assert(rendererMainSource.includes('applyKnowledgeImportApprovalDecision') && rendererMainSource.includes("case 'knowledge-approve-candidate'") && rendererMainSource.includes("case 'knowledge-approval-reset'") && knowledgePanelSource.includes('data-action="knowledge-approve-candidate"') && knowledgePanelSource.includes('Onay Kararlari') && knowledgePanelSource.includes('canExecuteImport'), 'v0.6.0 P4-B bellek-ici onay karari UI reducer ile baglanir ve canExecuteImport gosterilir', 'P4-B onay UI baglantisi eksik');
const knowledgeApprovalRendererSlice = rendererMainSource.slice(rendererMainSource.indexOf('function setKnowledgeImportApprovalDecision'), rendererMainSource.indexOf('function resetKnowledgeImportApprovalDecisions'));
assert(knowledgeApprovalRendererSlice.includes('applyKnowledgeImportApprovalDecision') && !/window\.hasarbotu\.|saveSettings|writeFile|localStorage|sessionStorage|tracking\.mutate|knowledgeImport(Save|Apply|Execute|Commit|Persist|Write)/i.test(knowledgeApprovalRendererSlice), 'v0.6.0 P4-B onay karari fonksiyonu yalniz bellek-ici reducer kullanir; IPC/yazma/execute yok', 'P4-B onay fonksiyonu yazma/execute izi tasiyor');
const knowledgeImportTextPreviewServiceSource = await fs.readFile('src/main/services/knowledge/knowledge-import-text-preview-service.ts', 'utf-8');
assert(knowledgeImportTextPreviewServiceSource.includes("'.txt'") && knowledgeImportTextPreviewServiceSource.includes("'.md'") && knowledgeImportTextPreviewServiceSource.includes('ALLOWED_EXTENSIONS') && knowledgeImportTextPreviewServiceSource.includes('canWrite: false') && !/writeFile|appendFile|createWriteStream|mkdir|\bunlink\b|rename\(|pdf2json|loadWorkbook|extractText|parsePdf|tesseract|mammoth|OpenAI|Claude|Gemini|fetch\(|axios|\bOCR\b|sqlite|embedding|tracking\.mutate|saveSettings/i.test(knowledgeImportTextPreviewServiceSource), 'v0.6.0 P4-C metin onizleme servisi yalniz .txt/.md okur; parser/OCR/provider/yazma yok', 'P4-C metin onizleme servisi parser/yazma/provider izi tasiyor');
assert(ipcContractSource.includes('knowledgeImportPreviewTextFile') && ipcContractSource.includes("'knowledge-import:preview-text-file'") && ipcContractSource.includes('KnowledgeImportTextPreview') && preloadSource.includes('previewTextFileForKnowledgeImport') && mainIpcSource.includes('IPC.knowledgeImportPreviewTextFile') && rendererMainSource.includes('previewKnowledgeImportTextFile') && knowledgePanelSource.includes('data-action="knowledge-preview-text"'), 'v0.6.0 P4-C txt/md icerik onizleme kontrat/preload/handler/renderer/panel ile bagli (yazmasiz)', 'P4-C metin onizleme baglantisi eksik');
const knowledgeImportWriteLockSource = await fs.readFile('src/shared/knowledge/knowledge-import-write-lock.ts', 'utf-8');
assert(KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED === true, 'v0.6.0 P4-E2-B kalici import yazma kilidi ETKIN ama dar (true)', JSON.stringify(KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED));
let p4dAllowedThrew = false;
try { assertKnowledgeImportPersistentWriteAllowed('user-knowledge-store', 'commit-approved-text-preview'); } catch { p4dAllowedThrew = true; }
let p4dWrongTargetThrew = false;
try { assertKnowledgeImportPersistentWriteAllowed('takip-dosyasi', 'commit-approved-text-preview'); } catch { p4dWrongTargetThrew = true; }
let p4dWrongOpThrew = false;
try { assertKnowledgeImportPersistentWriteAllowed('user-knowledge-store', 'overwrite-seed'); } catch { p4dWrongOpThrew = true; }
assert(p4dAllowedThrew === false && p4dWrongTargetThrew === true && p4dWrongOpThrew === true, 'v0.6.0 P4-E2-B kilit yalniz (user-knowledge-store, commit-approved-text-preview) gecer; yanlis hedef/operasyon throw eder', JSON.stringify({ allowed: p4dAllowedThrew, wrongTarget: p4dWrongTargetThrew, wrongOp: p4dWrongOpThrew }));
assert(KNOWLEDGE_IMPORT_FORBIDDEN_WRITE_TARGETS.includes('takip.json') && KNOWLEDGE_IMPORT_FORBIDDEN_WRITE_TARGETS.includes('Excel'), 'v0.6.0 P4-D yasak yazma hedefleri (takip.json/Excel) hala listelenir', JSON.stringify(KNOWLEDGE_IMPORT_FORBIDDEN_WRITE_TARGETS));
const knowledgeImportSurfaceSource = [knowledgeImportTypesSource, knowledgeImportPermissionsSource, knowledgeImportSafetySource, knowledgeImportPlannerSource, knowledgeImportPermissionServiceSource, knowledgeImportSafetyServiceSource, knowledgeImportViewModelSource, knowledgeImportPlanViewSource, knowledgeImportDryRunServiceSource, knowledgeImportTextPreviewServiceSource, knowledgeImportWriteLockSource, knowledgePanelSource, knowledgeRendererSlice].join('\n');
assert(!/atomicWrite|writeJson\b|writeFile|appendFile|createWriteStream|\bmkdir\b|tracking\.mutate|writeCaseCache|saveSettings|LocalCacheStore|addUserPartTerm|addLaborLearning|writeHumanSummary|\.unlink\(|fs\.rm\b|writeFileSync/i.test(knowledgeImportSurfaceSource), 'v0.6.0 P4-D kalici import mimari kilidi: tum import yuzeyinde kalici yazma API yok', 'P4-D import yuzeyinde kalici yazma izi var');
const userKnowledgeStoreSource = await fs.readFile('src/main/local-cache/user-knowledge-store.ts', 'utf-8');
assert(userKnowledgeStoreSource.includes('atomicWriteJson') && userKnowledgeStoreSource.includes('user-knowledge-store.json') && userKnowledgeStoreSource.includes('defaultUserKnowledgeStore') && !/takip\.json|TRACKING_FILE_NAME|loadBuiltInKnowledgeSeeds|KnowledgeSourceRegistry|writeCategoryLaborExcel|tracking\.mutate|\.xlsx|writeHumanSummary/i.test(userKnowledgeStoreSource), 'v0.6.0 P4-E1 kullanici bilgi deposu yalniz kendi AppData dosyasina atomic yazar; takip.json/seed/Excel/tracking dokunmaz', 'P4-E1 store izolasyon ihlali');
assert(!knowledgeImportSurfaceSource.includes('UserKnowledgeStoreFile') && !/\.write\(\s*next|atomicWriteJson/i.test(knowledgeImportSurfaceSource), 'v0.6.0 P4-E2-B import yuzeyi store yazma sinifini (UserKnowledgeStoreFile) DOGRUDAN cagirmaz; kalici yazma yalniz ayri commit servisinden gecer', 'P4-E2-B import yuzeyi store yazimina dogrudan baglanmis');
const userKnowledgeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-user-knowledge-'));
try {
  const userKnowledgeStoreFile = new UserKnowledgeStoreFile(userKnowledgeRoot);
  const emptyStore = await userKnowledgeStoreFile.read();
  assert(emptyStore.schemaVersion === 1 && emptyStore.entries.length === 0 && emptyStore.metadata.revision === 0, 'v0.6.0 P4-E1 kullanici bilgi deposu yokken bos varsayilan doner', JSON.stringify(emptyStore));
  const writtenStore = await userKnowledgeStoreFile.write({ ...defaultUserKnowledgeStore(), entries: [{ entryId: 'e1', title: 'Ornek', text: 'Ornek metin', sourceFileName: 'ornek.txt', fileExtension: '.txt', tags: [], createdAt: '2026-06-21T00:00:00.000Z', createdBy: 'Test' }] });
  assert(writtenStore.metadata.revision === 1 && writtenStore.metadata.writeId.length > 0, 'v0.6.0 P4-E1 atomic write revision ve writeId damgalar', JSON.stringify(writtenStore.metadata));
  const reread = await userKnowledgeStoreFile.read();
  assert(reread.entries.length === 1 && reread.entries[0].entryId === 'e1' && reread.entries[0].text === 'Ornek metin' && reread.metadata.revision === 1, 'v0.6.0 P4-E1 atomic write sonrasi depo geri okunur (roundtrip)', JSON.stringify(reread));
} finally {
  await fs.rm(userKnowledgeRoot, { recursive: true, force: true }).catch(() => undefined);
}
const knowledgeImportCommitPlanSource = await fs.readFile('src/shared/knowledge/knowledge-import-commit-plan.ts', 'utf-8');
assert(knowledgeImportCommitPlanSource.includes('willWrite') && knowledgeImportCommitPlanSource.includes('KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED') && knowledgeImportCommitPlanSource.includes('lockOpen') && !/atomicWrite|writeJson\b|writeFile|appendFile|createWriteStream|\bmkdir\b|UserKnowledgeStoreFile|ipcRenderer|window\.hasarbotu|tracking\.mutate|saveSettings|from ['"]node:fs|from ['"]fs|\bfs\./i.test(knowledgeImportCommitPlanSource), 'v0.6.0 P4-E2-A commit plani saf: kilit referansli ve dosya/IPC/depo yazma yok', 'P4-E2-A commit plani yazma/yan-etki izi tasiyor');
assert(knowledgePanelSource.includes('buildKnowledgeImportCommitPlan') && knowledgePanelSource.includes('Kalıcı Kayıt Ön İzleme'), 'v0.6.0 P4-E2-A panel commit on izleme bolumu mevcut (buildKnowledgeImportCommitPlan ile)', 'P4-E2-A commit on izleme paneli eksik');
const p4e2aPlan = buildSampleKnowledgeImportPlan();
let p4e2aApproval = createKnowledgeImportApprovalState();
p4e2aApproval = applyKnowledgeImportApprovalDecision(p4e2aApproval, { planId: p4e2aPlan.planId, candidateId: 'ornek-aday-2-gelecek-uygun', decision: 'approve_for_future_import', decidedAt: '2026-06-21T00:00:00.000Z' });
p4e2aApproval = applyKnowledgeImportApprovalDecision(p4e2aApproval, { planId: p4e2aPlan.planId, candidateId: 'ornek-aday-4-yasakli', decision: 'approve_for_future_import', decidedAt: '2026-06-21T00:00:00.000Z' });
const p4e2aCommit = buildKnowledgeImportCommitPlan(p4e2aPlan, p4e2aApproval);
assert(p4e2aCommit.lockOpen === true && p4e2aCommit.willWrite === true && p4e2aCommit.totals.willCommit === 1, 'v0.6.0 P4-E2-B commit plani kilit dar-acik: lockOpen/willWrite true, willCommit=1', JSON.stringify(p4e2aCommit.totals));
assert(p4e2aCommit.totals.approved === 2 && p4e2aCommit.totals.wouldCommit === 1 && p4e2aCommit.targetStore === 'user-knowledge-store.json', 'v0.6.0 P4-E2-A onaylanan .md uygun (wouldCommit=1), onaylanan .exe degil; hedef ayri depo', JSON.stringify(p4e2aCommit.totals));
const p4e2aCommitCandidate = (id) => p4e2aCommit.candidates.find((candidate) => candidate.candidateId === id);
assert(p4e2aCommitCandidate('ornek-aday-2-gelecek-uygun')?.eligible === true && p4e2aCommitCandidate('ornek-aday-2-gelecek-uygun')?.willCommit === true && p4e2aCommitCandidate('ornek-aday-4-yasakli')?.eligible === false && p4e2aCommitCandidate('ornek-aday-4-yasakli')?.willCommit === false, 'v0.6.0 P4-E2-B onaylanan .md commit edilebilir (willCommit=true); onaylanan .exe (not_allowed) degil', JSON.stringify(p4e2aCommit.candidates.map((candidate) => [candidate.fileName, candidate.eligible, candidate.willCommit])));
const knowledgeImportCommitServiceSource = await fs.readFile('src/main/services/knowledge/knowledge-import-commit-service.ts', 'utf-8');
assert(knowledgeImportCommitServiceSource.includes('assertKnowledgeImportPersistentWriteAllowed') && knowledgeImportCommitServiceSource.includes('KNOWLEDGE_IMPORT_ALLOWED_WRITE_TARGET') && knowledgeImportCommitServiceSource.includes('UserKnowledgeStoreFile') && knowledgeImportCommitServiceSource.includes('contentHash') && !/\bfilePath\b|readFile|createReadStream|pdf2json|loadWorkbook|extractText|parsePdf|tesseract|mammoth|OpenAI|Claude|Gemini|fetch\(|axios|\bOCR\b|sqlite|embedding|writeCategoryLaborExcel|tracking\.mutate|takip\.json/i.test(knowledgeImportCommitServiceSource), 'v0.6.0 P4-E2-B commit service narrow kilit+store kullanir; filePath/readFile/parser/provider/forbidden-write yok', 'P4-E2-B commit service yasak iz tasiyor');
assert(ipcContractSource.includes('knowledgeImportCommitApprovedTextPreview') && ipcContractSource.includes("'knowledge-import:commit-approved-text-preview'") && preloadSource.includes('commitApprovedKnowledgeImportTextPreview') && mainIpcSource.includes('IPC.knowledgeImportCommitApprovedTextPreview') && mainIpcSource.includes('commitApprovedKnowledgeImportTextPreview(this.cache.cacheRoot') && knowledgePanelSource.includes('data-action="knowledge-commit-text-preview"') && rendererMainSource.includes('window.confirm') && rendererMainSource.includes('commitApprovedKnowledgeImportTextPreview'), 'v0.6.0 P4-E2-B commit kontrat/preload/handler/panel butonu/renderer confirm ile bagli', 'P4-E2-B commit baglantisi eksik');
const p4e2bRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-commit-'));
try {
  const p4e2bInput = { candidateId: 'c1', fileName: 'ornek.txt', fileExtension: '.txt', content: 'Ornek bilgi icerigi', title: 'Ornek', tags: [], sourceType: 'office_note', approvalState: 'approved_but_not_executed' };
  const p4e2bResult = await commitApprovedKnowledgeImportTextPreview(p4e2bRoot, p4e2bInput);
  assert(p4e2bResult.ok === true && p4e2bResult.committed === 1 && p4e2bResult.skippedDuplicate === 0 && p4e2bResult.storeRevision === 1 && typeof p4e2bResult.writeId === 'string' && p4e2bResult.writeId.length > 0 && p4e2bResult.entryIds.length === 1, 'v0.6.0 P4-E2-B tek .txt commit atomic write ile yapilir; revision/writeId artar', JSON.stringify(p4e2bResult));
  const p4e2bStore = await new UserKnowledgeStoreFile(p4e2bRoot).read();
  assert(p4e2bStore.entries.length === 1 && p4e2bStore.entries[0].sourceFileName === 'ornek.txt' && p4e2bStore.entries[0].text === 'Ornek bilgi icerigi' && typeof p4e2bStore.entries[0].contentHash === 'string' && p4e2bStore.entries[0].contentHash.length > 0 && !('filePath' in p4e2bStore.entries[0]) && p4e2bStore.entries[0].importedBy === 'import-flow', 'v0.6.0 P4-E2-B commit entry icerik+contentHash tasir, dosya yolu SAKLAMAZ', JSON.stringify(p4e2bStore.entries[0]));
  const p4e2bDup = await commitApprovedKnowledgeImportTextPreview(p4e2bRoot, p4e2bInput);
  assert(p4e2bDup.committed === 0 && p4e2bDup.skippedDuplicate === 1, 'v0.6.0 P4-E2-B ayni icerik+kaynak duplicate olarak atlanir', JSON.stringify(p4e2bDup));
  const p4e2bPdf = await commitApprovedKnowledgeImportTextPreview(p4e2bRoot, { ...p4e2bInput, fileName: 'x.pdf', fileExtension: '.pdf' });
  assert(p4e2bPdf.ok === false && p4e2bPdf.rejected === 1 && p4e2bPdf.committed === 0, 'v0.6.0 P4-E2-B .pdf commit reddedilir', JSON.stringify(p4e2bPdf));
  const p4e2bEmpty = await commitApprovedKnowledgeImportTextPreview(p4e2bRoot, { ...p4e2bInput, fileName: 'bos.txt', content: '   ' });
  assert(p4e2bEmpty.ok === false && p4e2bEmpty.rejected === 1, 'v0.6.0 P4-E2-B bos icerik commit reddedilir', JSON.stringify(p4e2bEmpty));
  const p4e2bUnapproved = await commitApprovedKnowledgeImportTextPreview(p4e2bRoot, { ...p4e2bInput, fileName: 'onaysiz.txt', approvalState: 'preview_only' });
  assert(p4e2bUnapproved.ok === false && p4e2bUnapproved.rejected === 1, 'v0.6.0 P4-E2-B onaysiz aday commit reddedilir', JSON.stringify(p4e2bUnapproved));
} finally {
  await fs.rm(p4e2bRoot, { recursive: true, force: true }).catch(() => undefined);
}

// --- v0.6.0 P4-E3: User Knowledge Store'u Bilgi Bankasi aramasina read-only dahil etme ---
const p4e3Entries = [
  { entryId: 'uk-1', title: 'Mutabakat Sablonu', text: 'On gogus saci ve firewall hasarinda mutabakat notu ornegi.', contentHash: 'h1', sourceFileName: 'mutabakat.txt', fileExtension: '.txt', sourceType: 'office_note', tags: ['agir_hasar'], importedBy: 'import-flow', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', createdBy: 'import-flow' },
  { entryId: 'uk-2', title: 'Police Muafiyet', text: 'Police muafiyet kontrol notu; deductible hesaplari.', contentHash: 'h2', sourceFileName: 'muafiyet.md', fileExtension: '.md', sourceType: 'office_note', tags: [], importedBy: 'import-flow', createdAt: '2026-06-02T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z', createdBy: 'import-flow' }
];
assert(searchUserKnowledgeEntries([], 'on gogus').length === 0, 'v0.6.0 P4-E3 bos/yok user store aramada cokmeden 0 sonuc doner', 'bos user store sonucu hatali');
assert(searchUserKnowledgeEntries(p4e3Entries, '').length === 0, 'v0.6.0 P4-E3 bos arama metni user store sonucu uretmez (seed davranisiyla tutarli)', 'bos sorgu user sonuc uretti');
const p4e3ByContent = searchUserKnowledgeEntries(p4e3Entries, 'firewall');
const p4e3Hit = p4e3ByContent.find((r) => r.sourceId === 'user:uk-1');
assert(!!p4e3Hit && p4e3Hit.origin === 'user' && p4e3Hit.sourceLabel === USER_KNOWLEDGE_RESULT_LABEL, 'v0.6.0 P4-E3 user store content/text uzerinden aranabilir ve Kullanici Kaynagi etiketi tasir', JSON.stringify(p4e3ByContent.map((r) => [r.sourceId, r.origin, r.sourceLabel])));
assert(searchUserKnowledgeEntries(p4e3Entries, 'Mutabakat').some((r) => r.sourceId === 'user:uk-1'), 'v0.6.0 P4-E3 user store title uzerinden aranabilir', 'title aramasi user sonuc dondurmedi');
assert(searchUserKnowledgeEntries(p4e3Entries, 'muafiyet.md').some((r) => r.sourceId === 'user:uk-2'), 'v0.6.0 P4-E3 user store sourceFileName uzerinden aranabilir', 'sourceFileName aramasi user sonuc dondurmedi');
assert(searchUserKnowledgeEntries(p4e3Entries, { query: '', tags: ['agir_hasar'] }).some((r) => r.sourceId === 'user:uk-1'), 'v0.6.0 P4-E3 user store tags uzerinden filtrelenir/aranabilir', 'tag filtresi user sonuc dondurmedi');
assert(!('filePath' in p4e3Hit) && !/C:\\\\|\/Users\/|\/home\/|pCloud/i.test(JSON.stringify(p4e3Hit)), 'v0.6.0 P4-E3 user result filePath/mutlak yol/pCloud yolu tasimaz', JSON.stringify(p4e3Hit));
const p4e3Seed = { query: 'firewall', normalizedQuery: 'firewall', total: 2, results: [
  { chunkId: 'seed-c1', sourceId: 'seed-s1', sourceTitle: 'On Gogus Rehberi', text: 'firewall metni', score: 11, matchedTerms: ['firewall'], tags: ['agir_hasar'], rationale: 'seed' },
  { chunkId: 'seed-c2', sourceId: 'seed-s2', sourceTitle: 'Ikinci Seed', text: 'firewall ikinci', score: 5, matchedTerms: ['firewall'], tags: [], rationale: 'seed' }
], warnings: [] };
const p4e3Merged = mergeUserKnowledgeIntoResponse(p4e3Seed, [p4e3Hit], { available: true, entryCount: 2, matchedCount: 1 });
assert(p4e3Merged.results.length === 3 && p4e3Merged.total === 3 && p4e3Merged.results.filter((r) => r.origin === 'user').length === 1 && p4e3Merged.results.filter((r) => r.origin !== 'user').length === 2, 'v0.6.0 P4-E3 merge seed sonuclarini korur ve user sonucunu ekler; seed/user karismaz', JSON.stringify(p4e3Merged.results.map((r) => [r.sourceId, r.origin ?? 'seed'])));
const p4e3SeedOrder = p4e3Merged.results.filter((r) => r.origin !== 'user').map((r) => r.sourceId);
assert(p4e3SeedOrder[0] === 'seed-s1' && p4e3SeedOrder[1] === 'seed-s2', 'v0.6.0 P4-E3 seed sonuclarinin kendi arasindaki puanlama/siralamasi bozulmaz', JSON.stringify(p4e3SeedOrder));
const p4e3MergedErr = mergeUserKnowledgeIntoResponse(p4e3Seed, [], { available: false, entryCount: 0, matchedCount: 0, readError: 'Kullanıcı bilgi deposu okunamadı.' });
assert(p4e3MergedErr.results.length === 2 && p4e3MergedErr.warnings.length === 1 && /okunamad/i.test(p4e3MergedErr.warnings[0]), 'v0.6.0 P4-E3 user store okuma hatasi seed aramayi dusurmez; yalniz uyari eklenir', JSON.stringify(p4e3MergedErr.warnings));

// --- v0.6.0 P4-E4: Bilgi Bankasi kaynak filtresi + bos depo durum mesaji ---
assert(KNOWLEDGE_SOURCE_FILTERS.join(',') === 'all,seed,user' && isKnowledgeSourceFilter('user') && isKnowledgeSourceFilter('seed') && isKnowledgeSourceFilter('all') && !isKnowledgeSourceFilter('x'), 'v0.6.0 P4-E4 kaynak filtre degerleri all/seed/user ve dogrulayici tanimli', JSON.stringify(KNOWLEDGE_SOURCE_FILTERS));
const p4e4Combined = p4e3Merged.results;
assert(filterKnowledgeResultsByOrigin(p4e4Combined, 'all').length === p4e4Combined.length, 'v0.6.0 P4-E4 all filtresi seed + user sonuclarini birlikte gosterir', JSON.stringify(p4e4Combined.map((r) => r.sourceId)));
assert(filterKnowledgeResultsByOrigin(p4e4Combined, 'seed').every((r) => r.origin !== 'user') && filterKnowledgeResultsByOrigin(p4e4Combined, 'seed').length === 2, 'v0.6.0 P4-E4 seed filtresi user sonuclarini gizler', JSON.stringify(filterKnowledgeResultsByOrigin(p4e4Combined, 'seed').map((r) => r.sourceId)));
const p4e4UserOnly = filterKnowledgeResultsByOrigin(p4e4Combined, 'user');
assert(p4e4UserOnly.length === 1 && p4e4UserOnly.every((r) => r.origin === 'user') && p4e4UserOnly[0].sourceLabel === USER_KNOWLEDGE_RESULT_LABEL, 'v0.6.0 P4-E4 user filtresi yalniz user origin sonuclari gosterir ve Kullanici Kaynagi etiketini korur', JSON.stringify(p4e4UserOnly.map((r) => [r.sourceId, r.origin, r.sourceLabel])));
assert(p4e3Merged.userStoreStatus && p4e3Merged.userStoreStatus.available === true && p4e3Merged.userStoreStatus.entryCount === 2 && p4e3Merged.userStoreStatus.matchedCount === 1 && !p4e3Merged.userStoreStatus.readError, 'v0.6.0 P4-E4 response read-only userStoreStatus (available/entryCount/matchedCount) tasir', JSON.stringify(p4e3Merged.userStoreStatus));
assert(p4e3MergedErr.userStoreStatus && p4e3MergedErr.userStoreStatus.available === false && typeof p4e3MergedErr.userStoreStatus.readError === 'string', 'v0.6.0 P4-E4 okuma hatasinda userStoreStatus available=false ve readError tasir', JSON.stringify(p4e3MergedErr.userStoreStatus));
assert(!/C:\\\\|\/Users\/|\/home\/|pCloud|filePath/i.test(JSON.stringify(p4e3Merged.userStoreStatus)), 'v0.6.0 P4-E4 userStoreStatus filePath/mutlak yol/AppData yolu icermez', JSON.stringify(p4e3Merged.userStoreStatus));
assert(rendererStateSource.includes("knowledgeSourceFilter: 'all'"), 'v0.6.0 P4-E4 renderer state knowledgeSourceFilter baslangic all', 'knowledgeSourceFilter baslangic state eksik');
const p4e4FilterFnSlice = rendererMainSource.slice(rendererMainSource.indexOf('function setKnowledgeSourceFilter'), rendererMainSource.indexOf('function setKnowledgeSourceFilter') + 350);
assert(rendererMainSource.includes('setKnowledgeSourceFilter') && rendererMainSource.includes("case 'knowledge-source-filter'") && p4e4FilterFnSlice.includes('render()') && !/searchKnowledge|window\.hasarbotu/.test(p4e4FilterFnSlice), 'v0.6.0 P4-E4 kaynak filtresi yalniz render eder; yeni arama/IPC tetiklemez', 'P4-E4 filtre handler yeni arama tetikliyor');
assert(knowledgePanelSource.includes('renderKnowledgeSourceFilter') && knowledgePanelSource.includes('data-action="knowledge-source-filter"') && knowledgePanelSource.includes('Yerleşik') && knowledgePanelSource.includes('Kullanıcı Kaynağı') && knowledgePanelSource.includes('Kullanıcı bilgi deposunda henüz kayıt yok.') && knowledgePanelSource.includes('Kullanıcı kaynaklarında eşleşen kayıt bulunamadı.') && knowledgePanelSource.includes('Kullanıcı bilgi deposu okunamadı; yerleşik kaynaklar gösteriliyor.'), 'v0.6.0 P4-E4 panel kaynak filtresi + bos/eslesme-yok/okuma-hatasi mesajlarini icerir', 'P4-E4 panel filtre/bos mesajlari eksik');
const userKnowledgeSourceFilterSource = await fs.readFile('src/shared/knowledge/knowledge-source-filter.ts', 'utf-8');
assert(!/\.write\(|UserKnowledgeStoreFile|from ['"]node:fs|from ['"]fs|\bfs\.|atomicWrite|writeFile|filePath|fetch\(|axios|OpenAI|Claude|Gemini/i.test(userKnowledgeSourceFilterSource), 'v0.6.0 P4-E4 kaynak filtre modulu saf/read-only: yazma/fs/filePath/provider izi yok', 'P4-E4 filtre modulu yasak iz tasiyor');
const userKnowledgeSearchSource = await fs.readFile('src/main/services/knowledge/user-knowledge-search-service.ts', 'utf-8');
assert(!/\.write\(|UserKnowledgeStoreFile|from ['"]node:fs|from ['"]fs|\bfs\.|atomicWrite|writeFile|filePath|pdf2json|tesseract|OpenAI|Claude|Gemini|fetch\(|axios|sqlite|embedding/i.test(userKnowledgeSearchSource), 'v0.6.0 P4-E3 user store arama servisi saf/read-only: yazma/fs/store-write/filePath/parser/provider yok', 'P4-E3 arama servisi yasak iz tasiyor');

const knowledgeImportDisplaySource = [knowledgeImportViewModelSource, knowledgeImportPlanViewSource].join('\n');
assert(knowledgeImportTypesSource.includes('KnowledgeImportApprovalState') && knowledgeImportTypesSource.includes('KnowledgeImportApprovalDecision') && knowledgeImportViewModelSource.includes('approved_but_not_executed'), 'v0.6.0 P3-B onay akisi sadece tip/view-model seviyesinde hazirlanir', 'P3-B approval model eksik');
assert(knowledgeImportViewModelSource.includes('buildKnowledgeImportPlanViewModel') && knowledgeImportViewModelSource.includes('permissionLabel') && knowledgeImportViewModelSource.includes('Reddedildi') && knowledgeImportViewModelSource.includes('Sadece plan') && knowledgeImportViewModelSource.includes('Kullanici onayi gerekir') && knowledgeImportViewModelSource.includes('Gelecek içe aktarma için uygun'), 'v0.6.0 P3-B import plan view model permission durumlarini ayirir', 'P3-B permission view label eksik');
assert(knowledgeImportPlanViewSource.includes('renderKnowledgeImportPlanView') && knowledgeImportPlanViewSource.includes('İçe Aktarma Plan Hazırlığı') && knowledgeImportPlanViewSource.includes('canWrite') && knowledgeImportPlanViewSource.includes('dosya icerigi okunmaz') && knowledgeImportPlanViewSource.includes('kalici kaynak eklenmez') && knowledgeImportPlanViewSource.includes('takip.json, Excel veya AppData yazilmaz'), 'v0.6.0 P3-B pasif import plan component dry-run/canWrite/guvenlik metinlerini render eder', 'P3-B passive component eksik');
assert(!/data-action=|<button|type="button"|Dosya Sec|Dosya Se[cç]|Import Et|Iceri Aktar|İçeri Aktar|\bOnayla\b|\bReddet\b|\bKaydet\b|\bUygula\b|\bSil\b|\bDuzenle\b|\bDüzenle\b|Excel'e yaz|takip\.json'a yaz|AppData'ya kaydet|\bSync\b|\bUpload\b|\bDownload\b|Provider sec|Provider se[cç]|\bKopyala\b|\bCopy\b/i.test(knowledgeImportPlanViewSource), 'v0.6.0 P3-B pasif import plan component aktif aksiyon veya buton sunmaz', 'P3-B component aktif aksiyon izi tasiyor');
assert(!/localStorage|sessionStorage|indexedDB|queuePersistUiPreferences|saveSettings|writeCaseCache|tracking\.mutate|laborAutoSave|fs\.writeFile|appendFile|createWriteStream|mkdir/i.test(knowledgeImportDisplaySource), 'v0.6.0 P3-B import plan view/model AppData localStorage sessionStorage takip Excel yazma izi tasimaz', 'P3-B view/model storage yazma izi tasiyor');
assert(!/OpenAI|Claude|Gemini|API key|Cloud|OCR|fetch\(|axios|embedding|vector database|sqlite|provider se[cç]|sa[gğ]lay[iı]c[iı] se[cç]/i.test(knowledgeImportDisplaySource), 'v0.6.0 P3-B import plan view/model ucretli harici provider veya OCR izi tasimaz', 'P3-B view/model provider/OCR izi tasiyor');
assert(knowledgePanelSource.includes("from './knowledge-import-plan-view'") && knowledgePanelSource.includes('renderKnowledgeImportPlanView(buildSampleKnowledgeImportPlan()') && knowledgePanelSource.includes('buildSampleKnowledgeImportPlan') && !/data-action="[^"]*(knowledge-import|knowledge-save|knowledge-apply|knowledge-delete|knowledge-write)/i.test(knowledgePanelSource), 'v0.6.0 P3-D Bilgi Bankasi paneli statik ornek dry-run plani read-only baglar', 'P3-D panel statik ornek plan baglama eksik');
const p3dSamplePlan = buildSampleKnowledgeImportPlan();
const p3dSampleView = buildKnowledgeImportPlanViewModel(p3dSamplePlan);
const p3dSampleCandidate = (fileName) => p3dSampleView.candidates.find((candidate) => candidate.fileName === fileName);
assert(p3dSamplePlan.mode === 'dry_run' && p3dSamplePlan.canWrite === false && p3dSampleView.canWrite === false && p3dSampleView.candidates.length === 4, 'v0.6.0 P3-D statik ornek plan dry_run/canWrite=false ve 4 aday uretir', JSON.stringify({ mode: p3dSamplePlan.mode, canWrite: p3dSamplePlan.canWrite, count: p3dSampleView.candidates.length }));
assert(p3dSampleCandidate('tehlikeli.exe')?.permissionLabel === 'Reddedildi' && p3dSampleCandidate('belirsiz kaynak.pdf')?.permissionLabel === 'Sadece plan' && p3dSampleCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.permissionLabel === 'Kullanici onayi gerekir' && p3dSampleCandidate('gelecek import uygun kaynak.md')?.permissionLabel === 'Gelecek içe aktarma için uygun', 'v0.6.0 P3-D ornek plan dort izin durumunu okunabilir etiketle ayirir', JSON.stringify(p3dSampleView.candidates.map((candidate) => [candidate.fileName, candidate.permissionLabel])));
assert(p3dSampleView.candidates.every((candidate) => candidate.canWrite === false) && p3dSampleView.warnings.some((warning) => warning.includes('statik bir ornek')) && p3dSamplePlan.totals.totalCandidates === 4 && p3dSamplePlan.totals.notAllowed === 1 && p3dSamplePlan.totals.requiresApproval === 1, 'v0.6.0 P3-D ornek plan her adayda canWrite=false, statik uyari ve dogru toplamlari tasir', JSON.stringify({ warnings: p3dSampleView.warnings, totals: p3dSamplePlan.totals }));
const p3eEmptyApproval = createKnowledgeImportApprovalState();
assert(p3eEmptyApproval.entries.length === 0 && p3eEmptyApproval.canExecuteImport === false && getKnowledgeImportApprovalState(p3eEmptyApproval, 'plan-1', 'aday-1') === 'not_requested', 'v0.6.0 P3-E onay reducer bos baslar ve bilinmeyen aday not_requested doner', JSON.stringify(p3eEmptyApproval));
const p3eApproved = applyKnowledgeImportApprovalDecision(p3eEmptyApproval, { planId: 'plan-1', candidateId: 'aday-1', decision: 'approve_for_future_import', decidedAt: '2026-06-21T00:00:00.000Z' });
assert(p3eApproved.canExecuteImport === false && getKnowledgeImportApprovalState(p3eApproved, 'plan-1', 'aday-1') === 'approved_but_not_executed' && p3eEmptyApproval.entries.length === 0, 'v0.6.0 P3-E approve karari approved_but_not_executed olur, import calismaz ve girdi state degismez', JSON.stringify(p3eApproved));
const p3eRejected = applyKnowledgeImportApprovalDecision(p3eApproved, { planId: 'plan-1', candidateId: 'aday-2', decision: 'reject', decidedAt: '2026-06-21T00:00:00.000Z' });
const p3eReview = applyKnowledgeImportApprovalDecision(p3eRejected, { planId: 'plan-1', candidateId: 'aday-3', decision: 'needs_manual_review', decidedAt: '2026-06-21T00:00:00.000Z' });
assert(getKnowledgeImportApprovalState(p3eReview, 'plan-1', 'aday-2') === 'rejected' && getKnowledgeImportApprovalState(p3eReview, 'plan-1', 'aday-3') === 'user_review_required', 'v0.6.0 P3-E reject ve needs_manual_review kararlari dogru duruma esler', JSON.stringify(p3eReview.entries));
const p3eReapproved = applyKnowledgeImportApprovalDecision(p3eReview, { planId: 'plan-1', candidateId: 'aday-1', decision: 'reject', decidedAt: '2026-06-21T00:00:01.000Z' });
const p3eSummary = summarizeKnowledgeImportApprovals(p3eReapproved);
assert(p3eReapproved.entries.length === 3 && getKnowledgeImportApprovalState(p3eReapproved, 'plan-1', 'aday-1') === 'rejected' && p3eSummary.executed === 0 && p3eSummary.canExecuteImport === false && p3eSummary.rejected === 2 && p3eSummary.userReviewRequired === 1 && p3eSummary.approvedButNotExecuted === 0, 'v0.6.0 P3-E ayni aday kararini gunceller, mukerrer eklemez ve ozet executed=0/canExecuteImport=false tutar', JSON.stringify(p3eSummary));
const p3fSamplePlan = buildSampleKnowledgeImportPlan();
const p3fApprovalState = buildSampleKnowledgeImportApprovalState();
const p3fView = buildKnowledgeImportPlanViewModel(p3fSamplePlan, p3fApprovalState);
const p3fCandidate = (fileName) => p3fView.candidates.find((candidate) => candidate.fileName === fileName);
assert(knowledgePanelSource.includes('buildSampleKnowledgeImportApprovalState') && knowledgePanelSource.includes('renderKnowledgeImportPlanView(buildSampleKnowledgeImportPlan(), buildSampleKnowledgeImportApprovalState())'), 'v0.6.0 P3-F panel ornek onay durumunu plan gorunumune read-only gecirir', 'P3-F panel onay durumu baglamasi eksik');
assert(p3fCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.approvalState === 'approved_but_not_executed' && p3fCandidate('Agir Hasar Kritik Parca Rehberi.pdf')?.approvalDecided === true && p3fCandidate('belirsiz kaynak.pdf')?.approvalState === 'user_review_required' && p3fCandidate('belirsiz kaynak.pdf')?.approvalDecided === true && p3fCandidate('tehlikeli.exe')?.approvalState === 'rejected' && p3fCandidate('tehlikeli.exe')?.approvalDecided === true, 'v0.6.0 P3-F onay durumu bellek-ici kararlardan read-only turetilir', JSON.stringify(p3fView.candidates.map((candidate) => [candidate.fileName, candidate.approvalState, candidate.approvalDecided])));
assert(p3fCandidate('gelecek import uygun kaynak.md')?.approvalDecided === false && p3fCandidate('gelecek import uygun kaynak.md')?.approvalState === 'approved_but_not_executed' && p3fView.canWrite === false && buildKnowledgeImportPlanViewModel(p3fSamplePlan).candidates.every((candidate) => candidate.approvalDecided === false), 'v0.6.0 P3-F karar verilmeyen aday izin-varsayilani gosterir; onay state verilmezse tum adaylar varsayilan kalir', JSON.stringify(p3fCandidate('gelecek import uygun kaynak.md')));
assert(knowledgeTypesSource.includes('chunkCount?: number') && knowledgeRegistrySource.includes('chunkCountForSource') && knowledgeRegistrySource.includes('cloneSource(source, this.chunkCountForSource'), 'v0.6.0 P2-B bilgi bankasi kaynak listesi chunk sayisini hesaplanan read-only metadata olarak tasir', 'knowledge chunkCount metadata eksik');
assert(settingsSource.includes("from './knowledge-panel'") && settingsSource.includes('renderKnowledgePanel(state)') && knowledgePanelSource.includes('Bilgi Bankası'), 'v0.6.0 P2-B Bilgi Bankasi paneli Ayarlar ekranina baglanir', 'Bilgi Bankasi panel settings baglantisi eksik');
assert(rendererStateSource.includes('knowledgeSources') && rendererStateSource.includes('knowledgeSearchQuery') && rendererStateSource.includes('knowledgeSearchResponse') && rendererStateSource.includes('selectedKnowledgeSourceId') && rendererStateSource.includes('selectedKnowledgeResultId'), 'v0.6.0 P2-B Bilgi Bankasi renderer state alanlari oturum icinde tutulur', 'Bilgi Bankasi renderer state eksik');
assert(knowledgePanelSource.includes('Yalnız yerel / ücretsiz / salt okunur') && knowledgePanelSource.includes('Kaynak sayısı') && knowledgePanelSource.includes('Chunk sayısı') && knowledgePanelSource.includes('Ücretli servis') && knowledgePanelSource.includes('Harici bağlantı') && knowledgePanelSource.includes('Yazma modu'), 'v0.6.0 P2-B panel yalniz-yerel/ucretsiz/salt okunur durum ozeti gosterir', 'Bilgi Bankasi durum ozeti eksik');
assert(knowledgePanelSource.includes('Bilgi bankasında kaynak bulunamadı.') && knowledgePanelSource.includes('Eşleşen bilgi bulunamadı.') && knowledgePanelSource.includes('Arama yapmak için') && knowledgePanelSource.includes('Default limit 10'), 'v0.6.0 P2-B panel kaynak yok, sonuc yok ve bos arama durumlarini gosterir', 'Bilgi Bankasi bos durumlari eksik');
assert(knowledgePanelSource.includes('sourceTitle') && knowledgePanelSource.includes('result.score') && knowledgePanelSource.includes('matchedTerms') && knowledgePanelSource.includes('result.tags') && knowledgePanelSource.includes('result.text') && knowledgePanelSource.includes('result.rationale'), 'v0.6.0 P2-B arama sonucu sourceTitle/score/matchedTerms/tags/text/rationale alanlarini render eder', 'Bilgi Bankasi sonuc alanlari eksik');
assert(knowledgePanelSource.includes('data-action="knowledge-refresh"') && knowledgePanelSource.includes('data-action="knowledge-search"') && knowledgePanelSource.includes('data-action="knowledge-clear-search"') && knowledgePanelSource.includes('data-action="knowledge-source-select"') && knowledgePanelSource.includes('data-action="knowledge-result-select"'), 'v0.6.0 P2-B panel yalnizca okuma/arama/secim aksiyonlari sunar', 'Bilgi Bankasi panel aksiyonlari eksik');
assert(rendererMainSource.includes("target.id === 'knowledge-search'") && rendererMainSource.includes("case 'knowledge-refresh'") && rendererMainSource.includes("case 'knowledge-search'") && rendererMainSource.includes("case 'knowledge-clear-search'") && rendererMainSource.includes("case 'knowledge-source-select'") && rendererMainSource.includes("case 'knowledge-result-select'") && rendererMainSource.includes('void loadKnowledgeSources(false)'), 'v0.6.0 P2-B renderer Bilgi Bankasi input/action/lazy-load akislarini baglar', 'Bilgi Bankasi renderer baglantisi eksik');
assert(knowledgeRendererSlice.includes('window.hasarbotu.listKnowledgeSources') && knowledgeRendererSlice.includes('window.hasarbotu.searchKnowledge') && knowledgeRendererSlice.includes("state.knowledgeSearchError = 'Arama metni girin.'") && knowledgeRendererSlice.includes('limit: 10'), 'v0.6.0 P2-B renderer mevcut read-only preload ile kaynak okur ve bos queryde arama yapmaz', 'Bilgi Bankasi read-only renderer akisi eksik');
assert(knowledgePanelSource.includes('takip.json, Excel veya dosya klasörlerine yazma yapmaz') && knowledgePanelSource.includes('nihai karar kullanıcı/eksper onayına tabidir'), 'v0.6.0 P2-B panel guvenlik notunu net gosterir', 'Bilgi Bankasi guvenlik notu eksik');
assert(!/data-action="[^"]*(import|export|delete|edit|save|write|apply|sync|upload|download|provider)|İçe Aktar|Dışa Aktar|Yükle|Sil|Düzenle|Kaydet|Uygula|Provider seç|OpenAI|Claude|Gemini/i.test(knowledgePanelSource), 'v0.6.0 P2-B panel import/export/delete/edit/save/apply/sync/upload/provider secimi sunmaz', 'Bilgi Bankasi panelinde yasak aksiyon/provider metni var');
assert(!/saveSettings|updateField|updateChecklist|updateTodo|updateNote|tracking\.mutate|writeCaseCache|laborAutoSave|autoLaborSaveAction|fs\.writeFile/i.test(knowledgeRendererSlice) && !sharedTypesSource.includes('knowledgeSearchQuery'), 'v0.6.0 P2-B Bilgi Bankasi takip.json/Excel/AppData is verisine yazma veya kalici arama state tasimaz', knowledgeRendererSlice);
assert(knowledgeSearchTypesSource.includes('sourceType?: KnowledgeSourceType') && knowledgeSearchTypesSource.includes('priority?: KnowledgeChunkPriority') && knowledgeSearchSource.includes('sourceType: args.source.sourceType') && knowledgeSearchSource.includes('priority: args.chunk.priority'), 'v0.6.0 P2-C search sonucu sourceType ve priority metadata ile genisletilir', 'P2-C search metadata eksik');
assert(rendererStateSource.includes('selectedKnowledgeTags') && rendererStateSource.includes('selectedKnowledgeSourceTypes') && !settingsNormalizerSource.includes('selectedKnowledgeTags') && !settingsNormalizerSource.includes('selectedKnowledgeSourceTypes'), 'v0.6.0 P2-C tag/sourceType filtreleri sadece renderer memory state icinde tutulur', 'P2-C filtre state kaliciliga siziyor');
assert(knowledgePanelSource.includes('knowledge-tag-toggle') && knowledgePanelSource.includes('knowledge-source-type-toggle') && knowledgePanelSource.includes('data-action="knowledge-filter-clear"') && knowledgePanelSource.includes('renderKnowledgeFilters') && knowledgePanelSource.includes('Filtreleri temizle'), 'v0.6.0 P2-C Bilgi Bankasi tag ve sourceType filtre UI sunar', 'P2-C filtre UI eksik');
assert(rendererMainSource.includes("case 'knowledge-tag-toggle'") && rendererMainSource.includes("case 'knowledge-source-type-toggle'") && rendererMainSource.includes("case 'knowledge-filter-clear'") && rendererMainSource.includes('toggleKnowledgeTag') && rendererMainSource.includes('toggleKnowledgeSourceType') && rendererMainSource.includes('clearKnowledgeFilters'), 'v0.6.0 P2-C renderer filtre toggle/temizleme aksiyonlarini baglar', 'P2-C filtre action baglantisi eksik');
assert(knowledgeRendererSlice.includes('tags: state.selectedKnowledgeTags') && knowledgeRendererSlice.includes('sourceTypes: state.selectedKnowledgeSourceTypes') && knowledgeRendererSlice.includes('limit: 10') && knowledgeRendererSlice.includes("state.knowledgeSearchError = 'Arama metni girin.'"), 'v0.6.0 P2-C searchKnowledge params imzasi query/tags/sourceTypes/limit ile kullanilir ve bos query guard korunur', 'P2-C search params/bos query guard eksik');
assert(knowledgePanelSource.includes('knowledge-result-detail') && knowledgePanelSource.includes('sourceId') && knowledgePanelSource.includes('chunkId') && knowledgePanelSource.includes('sourceType') && knowledgePanelSource.includes('result.priority') && knowledgePanelSource.includes('result.rationale') && knowledgePanelSource.includes('result.text'), 'v0.6.0 P2-C secilen sonuc detayi source/chunk/skor/terim/tag/metin/gerekce alanlarini read-only gosterir', 'P2-C sonuc detayi eksik');
assert(knowledgePanelSource.includes('knowledge-source-detail') && knowledgePanelSource.includes('source.chunkCount') && knowledgePanelSource.includes('source.owner') && knowledgePanelSource.includes('source.version') && knowledgePanelSource.includes('source.isEnabled'), 'v0.6.0 P2-C secilen kaynak detayi metadata alanlarini read-only gosterir', 'P2-C kaynak detayi eksik');
assert(knowledgePanelSource.includes('knowledge-badge') && knowledgePanelSource.includes('knowledge-chip') && rendererStylesSource.includes('.knowledge-chip') && rendererStylesSource.includes('.knowledge-badge') && rendererStylesSource.includes('.knowledge-detail-meta'), 'v0.6.0 P2-C matchedTerms ve tags badge/chip olarak render edilir', 'P2-C chip/badge CSS eksik');
assert(!/data-action="[^"]*(import|export|delete|edit|save|write|apply|sync|upload|download|provider|copy)|Ä°Ã§e Aktar|DÄ±ÅŸa Aktar|YÃ¼kle|Sil|DÃ¼zenle|Kaydet|Uygula|Provider seÃ§|OpenAI|Claude|Gemini|API key|Cloud|OCR|Kopyala|Copy/i.test(knowledgePanelSource), 'v0.6.0 P2-C Bilgi Bankasi paneli import/export/delete/write/copy veya ucretli/harici secim sunmaz', 'P2-C panelinde yasak aksiyon/provider/copy izi var');
assert(!/queuePersistUiPreferences|saveSettings|updateField|updateChecklist|updateTodo|updateNote|tracking\.mutate|writeCaseCache|laborAutoSave|autoLaborSaveAction|fs\.writeFile/i.test(knowledgeRendererSlice), 'v0.6.0 P2-C Bilgi Bankasi filtre/arama akisi takip.json Excel AppData yazmaz', knowledgeRendererSlice);
assert(rendererMainSource.includes("target.id === 'knowledge-search' && event.key === 'Enter'") && rendererMainSource.includes('void searchKnowledgeAction()'), 'v0.6.0 P2-D Bilgi Bankasi arama inputunda Enter aramayi tetikler', 'P2-D Enter arama baglantisi eksik');
assert(rendererMainSource.includes("event.key === 'Escape'") && rendererMainSource.includes("target.closest('.knowledge-panel')") && rendererMainSource.includes('clearKnowledgePanelSelection'), 'v0.6.0 P2-D Esc sadece Bilgi Bankasi panelindeki secili detaylari temizler', 'P2-D Esc secim temizleme eksik');
assert(knowledgePanelSource.includes('role="search"') && knowledgePanelSource.includes('aria-label="Bilgi bankası arama metni"') && knowledgePanelSource.includes('aria-live="polite"') && knowledgePanelSource.includes('role="status"'), 'v0.6.0 P2-D Bilgi Bankasi paneli temel ARIA/search/status etiketlerini tasir', 'P2-D ARIA etiketleri eksik');
assert(knowledgePanelSource.includes('aria-pressed="${active ?') && knowledgePanelSource.includes('aria-pressed="${selected ?') && knowledgePanelSource.includes('data-action="${escapeHtml(action)}"'), 'v0.6.0 P2-D tag/sourceType chipleri ve sonuc/kaynak satirlari erisilebilir button durumunu tasir', 'P2-D aria-pressed button durumu eksik');
assert(knowledgePanelSource.includes('knowledge-search-controls') && knowledgePanelSource.indexOf('renderSearchBar(state)') < knowledgePanelSource.indexOf('renderSourceList(sources') && knowledgePanelSource.indexOf('renderSourceList(sources') < knowledgePanelSource.indexOf('renderSearchResults(state)'), 'v0.6.0 P2-D Tab sirasi arama/filtre, kaynak listesi, sonuc listesi akisini izler', 'P2-D panel DOM sirasi eksik');
assert(knowledgePanelSource.includes('knowledge-filter-title') && knowledgePanelSource.includes('selectedKnowledgeTags.length') && knowledgePanelSource.includes('selectedKnowledgeSourceTypes.length') && knowledgePanelSource.includes('Seçili etiket') && knowledgePanelSource.includes('Seçili kaynak tipi'), 'v0.6.0 P2-D filtre UX secili tag/sourceType sayisini gorunur tutar', 'P2-D filtre sayilari eksik');
assert(knowledgePanelSource.includes('knowledge-result-preview') && knowledgePanelSource.includes('shortText(result.text, 160)') && knowledgePanelSource.includes('shortText(result.rationale, 140)') && knowledgePanelSource.includes('formatScore(result.score)') && rendererStylesSource.includes('.knowledge-result-preview'), 'v0.6.0 P2-D sonuc karti kisa preview/skor ve detay ayrimini korur', 'P2-D sonuc okunabilirlik guard eksik');
assert(rendererMainSource.includes('normalizeKnowledgeSelectionsForRender') && rendererMainSource.includes('!state.knowledgeSearchResponse?.results.some') && rendererMainSource.includes('!state.knowledgeSources.some'), 'v0.6.0 P2-D stale secili sonuc/kaynak render oncesi temizlenir', 'P2-D stale secim temizleme eksik');
assert(knowledgeRendererSlice.includes('state.selectedKnowledgeResultId = \'\';') && knowledgeRendererSlice.includes("state.knowledgeSearchError = 'Bilgi bankası araması şu anda tamamlanamadı.'") && knowledgePanelSource.includes('Bilgi bankası kaynakları okunuyor...') && knowledgePanelSource.includes('Eşleşen bilgi bulunamadı.'), 'v0.6.0 P2-D loading/error/bos sonuc durumlari guvenli mesajlarla render edilir', 'P2-D loading/error/bos durum guard eksik');
assert(rendererStylesSource.includes('.knowledge-search-controls') && rendererStylesSource.includes('.knowledge-results-panel') && rendererStylesSource.includes(':focus-visible') && rendererStylesSource.includes('.knowledge-filter-title'), 'v0.6.0 P2-D Bilgi Bankasi CSS klavye odagi ve yeni panel duzenini tasir', 'P2-D CSS guard eksik');
assert(!/queuePersistUiPreferences|saveSettings|updateField|updateChecklist|updateTodo|updateNote|tracking\.mutate|writeCaseCache|laborAutoSave|autoLaborSaveAction|fs\.writeFile/i.test(knowledgeRendererSlice) && !settingsNormalizerSource.includes('knowledgeSearchQuery') && !settingsNormalizerSource.includes('selectedKnowledgeTags') && !settingsNormalizerSource.includes('selectedKnowledgeSourceTypes'), 'v0.6.0 P2-D Bilgi Bankasi arama/filtre/secim state AppData takip.json Excel yazimina sizmaz', knowledgeRendererSlice);
assert(settingsSource.includes("from './ai-queue-panel'") && settingsSource.includes('renderAiQueuePanel(state)'), 'v0.6.0 P1-C AI queue paneli Ayarlar ekranina baglanir', 'AI queue panel settings baglantisi eksik');
assert(rendererStateSource.includes('aiQueueSnapshot') && rendererStateSource.includes('aiQueueEvents') && rendererStateSource.includes('aiQueueEventsError') && rendererStateSource.includes('aiQueueLoading') && rendererStateSource.includes('aiQueueSelectedTaskId') && rendererStateSource.includes('aiQueueError') && rendererStateSource.includes('aiQueueAutoRefreshEnabled') && rendererStateSource.includes('aiQueueCancelingTaskId'), 'v0.6.0 P1-C/P1-D/P1-E AI queue panel state alanlari sadece renderer oturumunda tutulur', 'AI queue renderer state eksik');
assert(rendererMainSource.includes("case 'ai-queue-refresh'") && rendererMainSource.includes('window.hasarbotu.getAiQueueSnapshot') && rendererMainSource.includes('window.hasarbotu.getAiQueueEvents') && rendererMainSource.includes('AI_QUEUE_EVENT_PANEL_LIMIT = 20') && rendererMainSource.includes("case 'ai-queue-cancel'") && rendererMainSource.includes('window.hasarbotu.cancelAiQueueTask') && rendererMainSource.includes("case 'ai-queue-clear-finished'") && rendererMainSource.includes('window.hasarbotu.clearAiQueueFinished'), 'v0.6.0 P1-C/P1-E AI queue panel snapshot/events/cancel/clear IPC metotlarini kullanir', 'AI queue renderer action baglantisi eksik');
assert(rendererMainSource.includes('AI_QUEUE_ACTIVE_REFRESH_MS = 5000') && rendererMainSource.includes('AI_QUEUE_IDLE_REFRESH_MS = 15000') && rendererMainSource.includes('syncAiQueueAutoRefresh') && rendererMainSource.includes('clearAiQueueAutoRefreshTimer') && rendererMainSource.includes('aiQueueAutoRefreshTimer = window.setTimeout') && rendererMainSource.includes('if (aiQueueAutoRefreshTimer !== null && aiQueueAutoRefreshDelayMs === nextDelay) return'), 'v0.6.0 P1-D AI queue auto-refresh 5sn aktif/15sn idle tek timer ve cleanup ile calisir', 'AI queue auto-refresh timer guard eksik');
assert(rendererMainSource.includes("case 'ai-queue-toggle-auto-refresh'") && rendererMainSource.includes('toggleAiQueueAutoRefresh') && rendererMainSource.includes('!state.aiQueueAutoRefreshEnabled') && rendererMainSource.includes('clearAiQueueAutoRefreshTimer()'), 'v0.6.0 P1-D AI queue auto-refresh kullanici tarafindan kapatilabilir ve timer temizlenir', 'AI queue auto-refresh toggle/cleanup eksik');
assert(aiQueuePanelSource.includes('AI Görev Durumu') && aiQueuePanelSource.includes('Şu anda AI görevi yok.') && aiQueuePanelSource.includes('AI görevleri çalıştığında durumları burada görünecek.') && aiQueuePanelSource.includes('Sırada') && aiQueuePanelSource.includes('Çalışıyor') && aiQueuePanelSource.includes('Zaman aşımı'), 'v0.6.0 P1-D AI queue panel bos durum ve yeni status etiketlerini gosterir', 'AI queue panel status/bos durum eksik');
assert(aiQueuePanelSource.includes('sortAiQueueTasks') && aiQueuePanelSource.includes('taskGroupRank') && aiQueuePanelSource.includes('taskTimestamp(b) - taskTimestamp(a)') && aiQueuePanelSource.includes('MAX_VISIBLE_TASKS = 50'), 'v0.6.0 P1-D AI queue panel gorevleri en yeni ustte ve son 50 gorevle sinirli siralar', 'AI queue siralama/gecmis siniri eksik');
assert(aiQueuePanelSource.includes('Aktif görevler') && aiQueuePanelSource.includes('Dikkat isteyenler') && aiQueuePanelSource.includes('Tamamlanan son görevler') && aiQueuePanelSource.includes('ACTIVE_STATUSES') && aiQueuePanelSource.includes('ATTENTION_STATUSES') && aiQueuePanelSource.includes('COMPLETED_STATUSES'), 'v0.6.0 P1-D AI queue panel aktif/dikkat/tamamlanan gorevleri ayirir', 'AI queue gorev gruplari eksik');
assert(aiQueuePanelSource.includes('data-action="ai-queue-cancel"') && aiQueuePanelSource.includes('aiQueueCancelingTaskId') && aiQueuePanelSource.includes('İptal ediliyor') && aiQueuePanelSource.includes('data-action="ai-queue-clear-finished"') && aiQueuePanelSource.includes('Bitmiş görevleri temizle') && aiQueuePanelSource.includes('FINISHED_STATUSES'), 'v0.6.0 P1-D AI queue panel cancel pending ve clear finished UX guardlarini sunar', 'AI queue cancel/clear UX eksik');
assert(aiQueuePanelSource.includes('progressPercent') && aiQueuePanelSource.includes('Math.max(0, Math.min(100, Math.round(value)))') && rendererStylesSource.includes('.ai-queue-progress') && rendererStylesSource.includes('.ai-queue-group'), 'v0.6.0 P1-D AI queue progress normalize edilir ve grup UI stili korunur', 'AI queue progress/grup CSS eksik');
assert(aiQueuePanelSource.includes('renderQueueEvents') && aiQueuePanelSource.includes('Son olay') && aiQueuePanelSource.includes('Son olaylar') && aiQueuePanelSource.includes('Henuz AI olayi yok.') && aiQueuePanelSource.includes('renderQueueEventHistory') && aiQueuePanelSource.includes('eventSeverityClass') && rendererStylesSource.includes('.ai-queue-last-event') && rendererStylesSource.includes('.ai-queue-event-row'), 'v0.6.0 P1-E AI queue panel son olay satiri ve read-only event gecmisini render eder', 'AI queue event panel UI eksik');
assert(aiQueuePanelSource.includes('AI olay gecmisi okunamadi') && aiQueuePanelSource.includes('event.taskType') && aiQueuePanelSource.includes('event.message'), 'v0.6.0 P1-E AI queue event fetch hatasi paneli kirmadan gosterilir ve event listesi taskType/message icerir', 'AI queue event hata/taskType/message guard eksik');
assert(aiQueuePanelSource.includes('PreviewWrites salt okunur') && aiQueuePanelSource.includes('<pre>') && aiQueuePanelSource.includes('canWriteAutomatically') && aiQueuePanelSource.includes('requiresUserApproval'), 'v0.6.0 P1-C AI queue previewWrites sadece salt okunur ve onay guvenligiyle render edilir', 'AI queue previewWrites read-only guard eksik');
assert(aiQueuePanelSource.includes('AI sonuçları ön değerlendirmedir') && aiQueuePanelSource.includes("takip.json veya Excel'e yazmaz"), 'v0.6.0 P1-D AI queue panel sabit guvenlik uyarisini render eder', 'AI queue guvenlik uyarisi eksik');
assert(!/data-action="[^"]*(save|write|apply|persist)|Kaydet|Uygula|Excel'e aktar|takip\.json'a yaz/i.test(aiQueuePanelSource) && !rendererMainSource.includes('enqueueAiPreview('), 'v0.6.0 P1-C AI queue paneli kalici yazma veya yeni gorev baslatma aksiyonu tasimaz', 'AI queue panelinde kalici yazma veya enqueue aksiyonu var');
assert(!/OpenAI|Claude|Gemini|provider seç|sağlayıcı seç/i.test(aiQueuePanelSource), 'v0.6.0 P1-C AI queue paneli ucretli/harici provider secimi sunmaz', 'AI queue panelinde provider secimi izi var');
assert(casesQuerySource.includes("readExistingWithIssue(caseIdentityFromIndexItem(analyzed), 'tracking')") && casesQuerySource.includes('issues.filter((issue) => !TRACKING_READ_ISSUE_TYPES.includes(issue.type))') && casesQuerySource.includes('missingPreviouslySeenTrackingIssue(analyzed, writeIndex)'), 'v0.6.0 P1-B Tek Dosyayi Yenile gercek takip.json varsa sahte kayip uyarisi temizler, gercek kaybi korur', 'single refresh takip okuma guard eksik');
assert(sharedTypesSource.includes('UiFilterPreferences') && settingsNormalizerSource.includes('normalizeUiPreferences') && rendererMainSource.includes('queuePersistUiPreferences') && rendererMainSource.includes('state.settings.uiPreferences = captureUiPreferences()') && rendererMainSource.includes('resetPersistentUiFilters') && !rendererMainSource.includes('statusBoardSearch: state.statusBoardSearch') && !rendererMainSource.includes('search: state.search'), 'v0.6.0 P1-B filtreler AppData settings uiPreferences ile kalici, arama metni kalici degil', 'filtre kaliciligi/aramanin kalici olmamasi guard eksik');
assert(detailSource.includes('labor-excel-card" hidden aria-hidden="true"') && detailSource.includes('data-action="choose-labor-excel"') && detailSource.includes('AI Otomatik İşçilik Dağıtıcı'), 'v0.6.0 P1-B eski Portal Excel UI gizli, manuel kod korunur ve AI otomatik iscilik gorunur', 'Portal Excel gizleme veya AI kart korumasi eksik');

const normalizedUiSettings = normalizeSettings({
  rootPath: path.join(os.tmpdir(), 'hasarbotu-ui-prefs'),
  rootPathConfirmed: true,
  theme: 'light',
  zoom: 1,
  activeUser: 'UI Test',
  activeComputer: 'TEST-PC',
  users: ['UI Test'],
  scanIntervals: { fullYearLightMs: 300000 },
  uiPreferences: {
    caseList: { quickFilter: 'risk', responsibleFilter: 'Baran', serviceFilter: 'Servis A', statusFilter: 'Onarımda', sortMode: 'followup-asc', advancedOpen: true },
    statusBoard: { sort: 'durum', statusFilter: 'Portal Kontrol', showClosed: true, advancedOpen: true, responsibleFilter: 'Baran', missingOnly: true, openTodoOnly: true }
  }
});
assert(normalizedUiSettings.uiPreferences?.caseList.quickFilter === 'risk' && normalizedUiSettings.uiPreferences.statusBoard.sort === 'durum' && !JSON.stringify(normalizedUiSettings.uiPreferences).includes('search'), 'v0.6.0 P1-B uiPreferences normalize edilir ve arama metni saklanmaz', JSON.stringify(normalizedUiSettings.uiPreferences));

const autoLaborPreviewFixture = {
  filePath: 'fixture.xlsx',
  fileName: 'fixture.xlsx',
  sheetName: 'Portal',
  columns: [
    { column: 'H', category: 'Kaporta', header: 'Kaporta' },
    { column: 'I', category: 'Mekanik', header: 'Mekanik' },
    { column: 'J', category: 'Elektrik', header: 'Elektrik' },
    { column: 'K', category: 'Döşeme/Kilit', header: 'Döşeme-Kilit' },
    { column: 'L', category: 'Cam', header: 'Cam' },
    { column: 'M', category: 'Boya', header: 'Boya' },
    { column: 'N', category: 'Onarım', header: 'Onarım' }
  ],
  partNameColumn: 'C',
  groupColumn: 'B',
  partCodeColumn: 'D',
  partAmountColumn: 'F',
  rows: [
    { rowNumber: 2, partName: 'SOL FAR', group: 'AYDINLATMA', partCode: 'ELK-1', partAmount: 1000, categories: ['Elektrik'], amounts: { Elektrik: 1000 }, oldByColumn: { H: 400, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }, confidence: 'Orta', needsReview: true, reason: 'Kanıt: far.', source: 'rules', hasFormula: true, changed: true },
    { rowNumber: 3, partName: 'ALTERNATÖR', group: 'MEKANIK', partCode: 'MEK-1', partAmount: 1500, categories: ['Mekanik'], amounts: { Mekanik: 1500 }, oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 888, M: 0, N: 0 }, confidence: 'Yüksek', needsReview: false, reason: 'Kanıt: alternatör.', source: 'rules', hasFormula: false, changed: true },
    { rowNumber: 4, partName: 'BİLİNMEYEN PARÇA', group: 'GENEL', partCode: 'UNK-1', partAmount: 500, categories: ['Onarım'], amounts: { Onarım: 500 }, oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }, confidence: 'Düşük', needsReview: true, reason: 'Varsayılan Onarım.', source: 'fallback', hasFormula: false, changed: false }
  ],
  summary: { processed: 3, highConfidence: 1, needsReview: 2, changedRows: 2, totalsByCategory: { Elektrik: 1000, Mekanik: 1500, Onarım: 500 } },
  warnings: [],
  formulaCellsFound: 1
};
const autoLaborUiState = {
  autoLaborEdits: { 3: { Mekanik: 0, Kaporta: 1250 } },
  autoLaborApprovedRows: { 4: true },
  autoLaborReviewRows: { 2: false, 3: true },
  autoLaborSearch: '',
  autoLaborFilter: 'all'
};
const autoStats = buildAutoLaborStats(autoLaborPreviewFixture, autoLaborUiState);
assert(autoStats.totalRows === 3 && autoStats.rowsToWrite === 3, 'v0.5.0 AI işçilik view-model tüm yazılacak satırları sayar', JSON.stringify(autoStats));
assert(autoStats.changedRows === 2 && autoStats.reviewRows === 2 && autoStats.highConfidenceRows === 1 && autoStats.mediumConfidenceRows === 1 && autoStats.lowConfidenceRows === 1, 'v0.5.0 AI işçilik view-model değişen/kontrol/güven sayılarını hesaplar', JSON.stringify(autoStats));
assert(autoStats.oldClearedCells === 2 && autoStats.userEditedRows === 1 && autoStats.learningCandidateRows === 2 && autoStats.formulaRows === 1, 'v0.5.0 AI işçilik view-model eski H-N, düzeltme, öğrenme ve formül sayılarını hesaplar', JSON.stringify(autoStats));
assert(autoStats.categoryTotals.Kaporta === 1250 && autoStats.categoryTotals.Elektrik === 1000 && !autoStats.categoryTotals.Mekanik, 'v0.5.0 AI işçilik kullanıcı düzeltmesi kategori toplamlarına uygulanır', JSON.stringify(autoStats.categoryTotals));
const autoPageModel = buildAutoLaborPageModel(autoLaborUiState, autoLaborPreviewFixture, 1);
assert(AUTO_LABOR_ROWS_PER_PAGE > 0 && AUTO_LABOR_ROWS_PER_PAGE <= 60 && autoPageModel.filterCounts.all === 3 && autoPageModel.filterCounts.high === 1 && autoPageModel.filterCounts.review === 2 && autoPageModel.filterCounts.learning === 2, 'v0.5.0 AI işçilik büyük Excel guard filtre sayılarını tam veri üstünden hesaplar', JSON.stringify(autoPageModel.filterCounts));
assert(autoPageModel.visibleRows.length === 3 && autoPageModel.totalFilteredRows === 3 && autoPageModel.totalPages === 1, 'v0.5.0 AI işçilik page model sadece görünür sayfa satırlarını döndürür', JSON.stringify({ visible: autoPageModel.visibleRows.length, total: autoPageModel.totalFilteredRows, pages: autoPageModel.totalPages }));
assert(AUTO_LABOR_DEFAULT_PAGE_SIZE === 50 && AUTO_LABOR_PAGE_SIZE_OPTIONS.join(',') === '25,50,100' && normalizeAutoLaborPageSize(25) === 25 && normalizeAutoLaborPageSize(100) === 100 && normalizeAutoLaborPageSize(999) === AUTO_LABOR_DEFAULT_PAGE_SIZE, 'v0.5.0 AI iscilik sayfa boyutu 25/50/100 ve guvenli varsayilan kullanir', JSON.stringify({ options: AUTO_LABOR_PAGE_SIZE_OPTIONS, defaultSize: AUTO_LABOR_DEFAULT_PAGE_SIZE }));

const largeAutoPreviewFixture = {
  ...autoLaborPreviewFixture,
  rows: Array.from({ length: AUTO_LABOR_ROWS_PER_PAGE + 7 }, (_unused, index) => ({
    ...autoLaborPreviewFixture.rows[0],
    rowNumber: index + 2,
    partName: `SOL FAR ${index + 1}`,
    oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }
  })),
  summary: { ...autoLaborPreviewFixture.summary, processed: AUTO_LABOR_ROWS_PER_PAGE + 7 }
};
const largeAutoState = { ...autoLaborUiState, autoLaborEdits: {}, autoLaborApprovedRows: {}, autoLaborReviewRows: {}, autoLaborSearch: '', autoLaborFilter: 'all' };
const largeFirstPage = buildAutoLaborPageModel(largeAutoState, largeAutoPreviewFixture, 1);
const largeSecondPage = buildAutoLaborPageModel(largeAutoState, largeAutoPreviewFixture, 2);
assert(largeFirstPage.totalFilteredRows === AUTO_LABOR_ROWS_PER_PAGE + 7 && largeFirstPage.visibleRows.length === AUTO_LABOR_ROWS_PER_PAGE && largeSecondPage.visibleRows.length === 7, 'v0.5.0 AI işçilik büyük tabloda DOM satırlarını aktif sayfayla sınırlar', JSON.stringify({ first: largeFirstPage.visibleRows.length, second: largeSecondPage.visibleRows.length, total: largeFirstPage.totalFilteredRows }));
const autoSavePlan = buildAutoLaborSavePlan(autoLaborPreviewFixture, autoLaborUiState);
assert(autoSavePlan.rows.length === 3 && autoSavePlan.corrections.length === 2, 'v0.5.0 AI işçilik save planı kullanıcı düzeltmesi/onayını öğrenmeye aday yapar', JSON.stringify(autoSavePlan));
assert(autoSavePlan.rows.find((row) => row.rowNumber === 3)?.amounts.Kaporta === 1250 && !autoSavePlan.rows.find((row) => row.rowNumber === 3)?.amounts.Mekanik, 'v0.5.0 AI işçilik kullanıcı düzeltmesi kaydetme planına uygulanır', JSON.stringify(autoSavePlan.rows));
assert(autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[1], 'high'), 'v0.5.0 AI işçilik yüksek güven filtresi kontrol işaretinden bağımsız çalışır', JSON.stringify(autoLaborPreviewFixture.rows[1]));
assert(autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[1], 'oldCleared') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[2], 'learning'), 'v0.5.0 AI işçilik eski değer ve öğrenme filtreleri gerçek satırı yakalar', JSON.stringify({ oldCleared: autoLaborPreviewFixture.rows[1], learning: autoLaborPreviewFixture.rows[2] }));
assert(autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[0], 'medium') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[2], 'low') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[2], 'review') && autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[0], 'changed'), 'v0.5.0 AI iscilik kontrol/degisen/orta/dusuk filtreleri calisir', JSON.stringify(autoPageModel.filterCounts));
assert(!autoLaborFilterMatches(autoLaborUiState, autoLaborPreviewFixture, autoLaborPreviewFixture.rows[0], 'learning'), 'v0.5.0 AI iscilik mevcut H-N degerlerini otomatik ogrenmeye aday yapmaz', JSON.stringify(autoLaborPreviewFixture.rows[0]));
const searchState = { ...autoLaborUiState, autoLaborSearch: 'far' };
assert(autoLaborSearchMatches(searchState, autoLaborPreviewFixture.rows[0]) && !autoLaborSearchMatches(searchState, autoLaborPreviewFixture.rows[1]), 'v0.5.0 AI işçilik araması parça açıklamasında çalışır', JSON.stringify({ far: autoLaborPreviewFixture.rows[0].partName, other: autoLaborPreviewFixture.rows[1].partName }));


// RC5: Per-case cache orphan dosyaları silinmiş/taşınmış dosyaları ghost case olarak geri getirmemeli.
const hugeAutoPreviewFixture = {
  ...autoLaborPreviewFixture,
  rows: Array.from({ length: 257 }, (_unused, index) => ({
    ...autoLaborPreviewFixture.rows[index % autoLaborPreviewFixture.rows.length],
    rowNumber: index + 10,
    partName: index % 3 === 0 ? `SOL FAR BUYUK ${index + 1}` : index % 3 === 1 ? `ALTERNATOR BUYUK ${index + 1}` : `BILINMEYEN BUYUK ${index + 1}`,
    partCode: `BIG-${index + 1}`,
    oldByColumn: { H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0 }
  })),
  summary: { ...autoLaborPreviewFixture.summary, processed: 257 }
};
const hugeState = { ...autoLaborUiState, autoLaborEdits: { 230: { Elektrik: 0, Mekanik: 777 } }, autoLaborApprovedRows: { 230: true }, autoLaborReviewRows: {}, autoLaborSearch: '', autoLaborFilter: 'all' };
const hugeFirst25 = buildAutoLaborPageModel(hugeState, hugeAutoPreviewFixture, 1, 25);
const hugeLast25 = buildAutoLaborPageModel(hugeState, hugeAutoPreviewFixture, 11, 25);
const hugeFirst100 = buildAutoLaborPageModel(hugeState, hugeAutoPreviewFixture, 1, 100);
assert(hugeFirst25.totalFilteredRows === 257 && hugeFirst25.visibleRows.length === 25 && hugeLast25.visibleRows.length === 7 && hugeFirst100.visibleRows.length === 100 && hugeFirst100.totalPages === 3, 'v0.5.0 AI iscilik 250+ satirda sadece aktif sayfa satirlarini render modeline alir', JSON.stringify({ first25: hugeFirst25.visibleRows.length, last25: hugeLast25.visibleRows.length, first100: hugeFirst100.visibleRows.length, pages100: hugeFirst100.totalPages }));
const hugeSearchState = { ...hugeState, autoLaborSearch: 'BIG-257', autoLaborFilter: 'all' };
const hugeSearchPage = buildAutoLaborPageModel(hugeSearchState, hugeAutoPreviewFixture, 1, 25);
assert(hugeSearchPage.totalFilteredRows === 1 && hugeSearchPage.visibleRows[0]?.partCode === 'BIG-257', 'v0.5.0 AI iscilik buyuk veride arama sonucu dogru satira daralir', JSON.stringify(hugeSearchPage.visibleRows));
const hugeLearningState = { ...hugeState, autoLaborFilter: 'learning' };
const hugeLearningPage = buildAutoLaborPageModel(hugeLearningState, hugeAutoPreviewFixture, 1, 25);
const hugeSavePlan = buildAutoLaborSavePlan(hugeAutoPreviewFixture, hugeLearningState);
assert(hugeLearningPage.totalFilteredRows === 1 && hugeLearningPage.visibleRows[0]?.rowNumber === 230 && hugeSavePlan.rows.length === 257 && hugeSavePlan.stats.totalRows === 257 && hugeSavePlan.rows.find((row) => row.rowNumber === 230)?.amounts.Mekanik === 777, 'v0.5.0 AI iscilik sayfa/filtre degisince kullanici duzeltmesini kaybetmez ve kaydetme tum satirlari kapsar', JSON.stringify({ learningRows: hugeLearningPage.totalFilteredRows, planRows: hugeSavePlan.rows.length, editedRow: hugeSavePlan.rows.find((row) => row.rowNumber === 230) }));

const cache = new LocalCacheStore(path.join(root, 'cache-ghost'));
await cache.ensure();
function minimalCase(folderPath, plate, revision = 1) {
  const identity = {
    caseKey: plate,
    plate,
    dosyaNo: '',
    officeFileNo: '',
    claimNoticeNo: '',
    folderPath,
    monthFolder: 'Nisan 2026',
    isClosedFolder: false
  };
  const tracking = createDefaultTracking(identity, 'Cache Testi');
  tracking.metadata.revision = revision;
  tracking.metadata.writeId = `write-${revision}-${plate}`;
  return {
    folderPath,
    folderName: path.basename(folderPath),
    plate,
    dosyaNo: '',
    officeFileNo: '',
    claimNoticeNo: '',
    monthFolder: 'Nisan 2026',
    isClosedFolder: false,
    claimType: 'unknown',
    serviceName: revision > 1 ? 'Cache Servis' : '',
    workflowStatus: tracking.status.workflowStatus,
    dosyaDurumu: tracking.status.dosyaDurumu,
    sorumlu: tracking.assignment.sorumlu,
    takipTarihi: tracking.assignment.takipTarihi,
    oncelik: tracking.assignment.oncelik,
    updatedAt: tracking.metadata.updatedAt,
    revision,
    tracking,
    documentAnalysis: { claimType: 'unknown', evrakFolderExists: true, filesScanned: 0, requirements: [], missingCritical: [], claimNoticeNo: '', claimNoticeFiles: [], hasKttOrZabitOrBeyan: false, counterpartyPolicyCandidate: false, conflictFiles: [], warnings: [] },
    photoAnalysis: { hasarFolderExists: true, totalImageFiles: 0, damagePhotoCount: 0, hasKm: false, hasVites: false, hasSaseOrSasi: false, unsupportedFiles: [], unsupportedPhotos: [], corruptCandidates: [], previews: [], warnings: [] },
    folderContents: { totalFiles: 0, sampleFiles: [], groups: [] },
    fingerprint: { folderPath, mtimeMs: 0, size: 0, childCount: 0, evrakMtimeMs: 0, hasarMtimeMs: 0, trackingMtimeMs: 0, hash: '' },
    searchText: plate,
    statusIsClosed: false
  };
}
const liveCase = minimalCase(path.join(root, 'live', 'case1'), '06ABC123', 1);
const enrichedCase = minimalCase(liveCase.folderPath, '06ABC123', 5);
const orphanCase = minimalCase(path.join(root, 'live', 'deleted'), '06DEF456', 9);
await cache.writeIndex({ schemaVersion: 1, rootPath: path.join(root, 'live'), generatedAt: new Date().toISOString(), cases: [liveCase] }, 2026);
await cache.writeCaseCache(enrichedCase);
await cache.writeCaseCache(orphanCase);
const mergedIndex = await cache.readIndex(2026);
assert(mergedIndex.cases.length === 1 && mergedIndex.cases[0].folderPath === liveCase.folderPath, 'Per-case cache orphan ghost case olarak geri eklenmez', JSON.stringify(mergedIndex.cases.map((c) => c.folderPath)));
assert(mergedIndex.cases[0].tracking.metadata.revision === 5 && mergedIndex.cases[0].serviceName === 'Cache Servis', 'Per-case cache mevcut index dosyasını zenginleştirir', JSON.stringify({ revision: mergedIndex.cases[0].tracking.metadata.revision, serviceName: mergedIndex.cases[0].serviceName }));
await cache.writeIndex(mergedIndex, 2026);
let orphanCacheExists = true;
try { await fs.stat(cache.caseCachePath(orphanCase.folderPath)); } catch { orphanCacheExists = false; }
assert(!orphanCacheExists, 'Per-case cache prune orphan AppData cache dosyasını temizler', cache.caseCachePath(orphanCase.folderPath));

// RC5: Liste Excel export butonu tek kaynakta render edilir; küçük ve virtual list için ortaktır.
const casesSource = await fs.readFile('src/renderer/app/components/cases.ts', 'utf-8');
const exportActionCount = (casesSource.match(/data-action="export-cases-excel"/g) ?? []).length;
assert(exportActionCount === 1 && casesSource.includes('renderCaseListHeader(filtered.length, modeText)'), 'Liste Excel export butonu tek kaynakta ve her liste modunda kullanılıyor', `count=${exportActionCount}`);

// RC5: Renderer dropdownları shared workflow constants kaynağını kullanır.
assert(detailSource.includes('CLAIM_TYPES') && detailSource.includes('DOSYA_DURUMLARI') && detailSource.includes('WORKFLOW_STATUSES') && detailSource.includes('PRIORITIES'), 'Renderer dropdownları shared constants üzerinden besleniyor', 'Shared dropdown importları eksik');
assert(!detailSource.includes("['Yeni Dosya'") && !detailSource.includes("['unknown','trafik','kasko'") && !detailSource.includes("['Düşük','Normal','Yüksek','Kritik']"), 'Renderer içinde kritik dropdown hardcoded değerleri kaldırıldı', 'Hardcoded dropdown dizisi kaldı');

// RC5: Türkçe path karşılaştırması ve yıl çıkarımı.
assert(isPathInsideNormalized('P:\\BARAN GLOBAL EKSPERTIZ\\2026\\06ABC123', 'P:\\BARAN GLOBAL EKSPERTİZ\\2026'), 'Türkçe İ/I path farkı güvenli kök kontrolünü bozmaz', 'EKSPERTIZ/EKSPERTİZ eşleşmedi');
assert(inferYearFromRootPath('P:\\BARAN GLOBAL EKSPERTİZ\\2027') === 2027, 'RootPath 2027 ise aktif cache yılı 2027 çıkarılır', `year=${inferYearFromRootPath('P:\\BARAN GLOBAL EKSPERTİZ\\2027')}`);

// RC5: Rollback dokümanı Disk Baseline Kabul adımını anlatır.
const rollbackDoc = await fs.readFile('docs/GERI_DONUS_PLANI.md', 'utf-8');
assert(rollbackDoc.includes('Disk Baseline Kabul') && rollbackDoc.includes('local write-index baseline'), 'Rollback dokümanı Disk Baseline Kabul adımını anlatıyor', 'Disk Baseline Kabul dokümanı eksik');

// v0.4.1 safety: Daha önce görülen takip.json kaybolursa default takip cache'i eski güvenli verinin üstüne yazılmamalı.
const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-missing-tracking-'));
const missingYearRoot = path.join(missingRoot, 'pCloud Drive (P)', 'BARAN GLOBAL EKSPERTIZ', '2026');
const missingCasePath = path.join(missingYearRoot, 'Mayis 2026', '06ABC123');
await fs.mkdir(path.join(missingCasePath, 'EVRAK'), { recursive: true });
await fs.writeFile(path.join(missingCasePath, 'EVRAK', 'M RUHSAT.pdf'), '%PDF', 'utf-8');
const missingCache = new LocalCacheStore(path.join(missingRoot, 'appdata'));
await missingCache.ensure();
const missingScanner = new PcloudYearScanner(missingCache);
const missingService = new TrackingFileService(missingCache.locksDir);
const missingIdentity = {
  caseKey: '06ABC123',
  plate: '06ABC123',
  dosyaNo: '',
  officeFileNo: '2026/99',
  claimNoticeNo: '99-12345678',
  folderPath: missingCasePath,
  monthFolder: 'Mayis 2026',
  isClosedFolder: false
};
const missingSettings = {
  rootPath: missingYearRoot,
  rootPathConfirmed: true,
  theme: 'light',
  zoom: 1,
  activeUser: 'Eksik Takip Testi',
  activeComputer: 'TEST-PC',
  users: ['Eksik Takip Testi'],
  scanIntervals: { fullYearLightMs: 300000 }
};
const createdMissingTracking = await missingService.ensureTracking(missingIdentity, 'Eksik Takip Testi');
await missingCache.recordSeenTracking(missingCasePath, createdMissingTracking.tracking, missingYearRoot);
const missingBaseline = await missingScanner.scan(missingSettings);
const missingBaselineCase = missingBaseline.index.cases.find((item) => item.folderPath === missingCasePath);
await fs.rm(path.dirname(missingService.getTrackingPath(missingCasePath)), { recursive: true, force: true });
const missingAfterDelete = await missingScanner.scan(missingSettings);
const missingAfterDeleteCase = missingAfterDelete.index.cases.find((item) => item.folderPath === missingCasePath);
let missingTrackingRecreated = true;
try { await fs.stat(missingService.getTrackingPath(missingCasePath)); } catch { missingTrackingRecreated = false; }
assert(missingAfterDelete.report.issues.some((issue) => issue.type === 'partial-sync-missing-tracking'), 'Daha önce görülen takip.json kaybolursa scan issue üretir', JSON.stringify(missingAfterDelete.report.issues));
assert(missingAfterDeleteCase?.caseIssues?.some((issue) => issue.type === 'partial-sync-missing-tracking'), 'Kayıp takip.json dosya sorunlarına eklenir', JSON.stringify(missingAfterDeleteCase?.caseIssues ?? []));
assert(missingAfterDeleteCase?.tracking.metadata.writeId === missingBaselineCase?.tracking.metadata.writeId, 'Kayıp takip.json default veriyle güvenli cache üstüne yazılmaz', JSON.stringify({ before: missingBaselineCase?.tracking.metadata.writeId, after: missingAfterDeleteCase?.tracking.metadata.writeId }));
assert(!missingTrackingRecreated, 'Kayıp takip.json kullanıcı onayı olmadan yeniden oluşturulmaz', missingService.getTrackingPath(missingCasePath));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Davranış regresyon testleri başarısız: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Davranış regresyon testleri geçti: ${checks.length} kontrol.`);
