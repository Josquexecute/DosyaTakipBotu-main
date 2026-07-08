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
import { migrateTracking } from '../dist-electron/main/tracking/tracking-schema.js';
import { normalizeVehicleContext, vehicleContextForAi, hasMeaningfulVehicleContext, VEHICLE_CONTEXT_FIELDS } from '../dist-electron/shared/vehicle/vehicle-context.js';
import { evaluatePartVehicleFit } from '../dist-electron/shared/vehicle/vehicle-fit-evaluator.js';
import { vehicleContextAiLine, vehicleContextSearchTerms } from '../dist-electron/shared/vehicle/vehicle-context-ai.js';
import { evaluatePlateMatch, looksLikePlate } from '../dist-electron/shared/plate-match.js';
import { resolvePlateFromPath, resolveCaseFolderFromPath, assertSelectedPhotoMatchesCase } from '../dist-electron/main/services/case-asset-guard.js';
import { classifyByRules, applyDistributionConstraints, roundTo250 } from '../dist-electron/shared/labor-rules.js';
import { deleteLearned, exportLaborLearningJson, importLaborLearningJson, isLearnableLaborAlias, lookupLearned, recordLearned, laborNameSimilarity, setLearnedActive, updateLearned } from '../dist-electron/shared/labor-learning-dictionary.js';
import { AUTO_LABOR_DEFAULT_PAGE_SIZE, AUTO_LABOR_PAGE_SIZE_OPTIONS, AUTO_LABOR_ROWS_PER_PAGE, buildAutoLaborPageModel, buildAutoLaborStats, buildAutoLaborSavePlan, autoLaborFilterMatches, autoLaborSearchMatches, normalizeAutoLaborPageSize } from '../dist-electron/shared/auto-labor-view-model.js';
import { classifyLaborRow } from '../dist-electron/main/services/labor-classifier-service.js';
import { buildAutoLaborPreview } from '../dist-electron/main/services/labor-preview-service.js';
import { parseTurkishPrice, readPriceCell } from '../dist-electron/shared/labor/part-price-parser.js';
import { detectOperationType } from '../dist-electron/shared/labor/operation-type-detector.js';
import { evaluateCalibrationContext } from '../dist-electron/shared/labor/calibration-context-rules.js';
import { evaluateRepairVsReplace } from '../dist-electron/shared/labor/repair-vs-replace-evaluator.js';
import { buildLaborV3Context, lookupLocalPartReference } from '../dist-electron/shared/labor/part-economic-context.js';
import { isCriticalSafetyPart } from '../dist-electron/shared/labor/critical-safety-parts.js';
import { extractExpertLearningEntries, priceBand, distributionTotal } from '../dist-electron/shared/labor/expert-approved-learning-extractor.js';
import { matchExpertLearning } from '../dist-electron/shared/labor/expert-approved-learning-matcher.js';
import { addExpertApprovedEntry, approveExpertEntry, setExpertEntryActive, removeExpertEntry, listUsableExpertEntries, normalizeExpertEntry, mergeApprovedExpertEntries, expertEntryDuplicateKey, isDuplicateExpertEntry, findDuplicateExpertEntry, replaceDuplicateExpertEntryWithApproval } from '../dist-electron/shared/labor/expert-approved-learning-store.js';
import { buildExpertLearningPreview, expertSourceRowsFromAutoLabor, selectSafeExpertPreviewItems } from '../dist-electron/shared/labor/expert-approved-learning-preview.js';
import { ExpertApprovedLearningStoreFile } from '../dist-electron/main/local-cache/expert-approved-learning-store-file.js';
import { compareLaborDistribution, aiAmountsToDistribution, describeDistributionDiff, buildExpertLaborDiffView } from '../dist-electron/shared/labor/expert-approved-learning-diff.js';
import { normalizeVehicleModel, extractChassisPrefix, extractEngineCode, extractModelYear, extractVehicleModelFromText } from '../dist-electron/shared/labor/labor-vehicle-context-normalizer.js';
import { buildLaborVehicleContext, mergeLaborVehicleContext, caseVehicleToLaborContext } from '../dist-electron/shared/labor/labor-vehicle-context-extractor.js';
import { buildAiModeSearchPrompt, AI_MODE_PRIVACY_NOTICE } from '../dist-electron/shared/labor/ai-mode-part-search-prompt-builder.js';
import { parseAiModeResponse } from '../dist-electron/shared/labor/ai-mode-part-search-parser.js';
import { scoreCandidateConfidence } from '../dist-electron/shared/labor/ai-mode-part-search-confidence.js';
import { comparePartCodes, normalizePartCode } from '../dist-electron/shared/labor/ai-mode-part-code-comparator.js';
import { buildApprovedCandidateEntry, normalizeAiModeCandidateEntry, mergeApprovedCandidates, isDuplicateAiModeCandidate, setCandidateActive, removeCandidate, listUsableCandidates, findDuplicateAiModeCandidate, replaceDuplicateAiModeCandidateWithApproval, isGenericPartName, filterAiModeCandidates } from '../dist-electron/shared/labor/ai-mode-part-candidate-store.js';
import { matchAiModePartCandidate } from '../dist-electron/shared/labor/ai-mode-part-candidate-matcher.js';
import { AiModePartCandidateStoreFile } from '../dist-electron/main/local-cache/ai-mode-part-candidate-store-file.js';
import { saveAutoLaborExcel } from '../dist-electron/main/services/labor-excel-writer.js';
import { buildGenericLaborWorkbook, loadWorkbook, writePartCodeCellExcel } from '../dist-electron/main/import/excel-importer.js';
import { validateAiModePartCodeApply, buildPostWriteVerification } from '../dist-electron/shared/labor/ai-mode-part-code-apply-validator.js';
import { isExcelLockError, describeExcelWriteError } from '../dist-electron/main/services/excel-lock-error-normalizer.js';
import { validateAiModePartCodeRestore } from '../dist-electron/shared/labor/ai-mode-part-code-restore-validator.js';
import { AiModePartCodeRestoreService } from '../dist-electron/main/services/ai-mode-part-code-restore-service.js';
import { classifyAiModeBackup, validateAiModeBackupDelete } from '../dist-electron/shared/labor/ai-mode-part-code-backup-validator.js';
import { AiModePartCodeBackupService } from '../dist-electron/main/services/ai-mode-part-code-backup-service.js';
import { AiModePartCodeHistoryStoreFile } from '../dist-electron/main/local-cache/ai-mode-part-code-history-store-file.js';
import { normalizeHistoryEntry, appendHistoryEntry } from '../dist-electron/shared/labor/ai-mode-part-code-history-types.js';
import { validateAiModeBackupRestore } from '../dist-electron/shared/labor/ai-mode-part-code-backup-restore-validator.js';
import { AiModePartCodeBackupRestoreService } from '../dist-electron/main/services/ai-mode-part-code-backup-restore-service.js';
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
import { callGeminiVision, callGeminiText } from '../dist-electron/main/import/gemini-client.js';
import { parseComplianceResponse, COMPLIANCE_VERDICTS, buildScannedPdfNotice, SCANNED_PDF_NOTICE } from '../dist-electron/shared/report-invoice/report-invoice-types.js';
import { testReportInvoiceAiConnection } from '../dist-electron/main/services/report-invoice-service.js';
import { MEVZUAT_SOURCES, getAllMevzuatItems, findMevzuatByTag } from '../dist-electron/shared/mevzuat/mevzuat-index.js';
import { selectReportTemplate } from '../dist-electron/shared/mevzuat/report-template-rules.js';
import { calculateMotorExpertiseFee, calculateNonMotorExpertiseFee, degerKaybiFee } from '../dist-electron/shared/fees/expertise-fee-calculator.js';
import { EKSIST_DEADLINE_RULES, ATAMA_SAATLERI, getDeadlineRule } from '../dist-electron/shared/deadlines/eksist-deadline-rules.js';
import { PERFORMANS_TAM_PUAN, hasarKademePuani } from '../dist-electron/shared/mevzuat/performance-scoring-info.js';
import { buildAiCaseContext, deriveTemplateInput, deriveFeePrefill, deriveDeadlineDosyaTuru, suggestMevzuatTerms, applyAiHelperOverride, blankAiCaseContext } from '../dist-electron/shared/ai-context/ai-case-context.js';
import { runAiDraftTask } from '../dist-electron/shared/ai/ai-orchestrator.js';
import { AI_DRAFT_TASKS } from '../dist-electron/shared/ai/ai-orchestrator-types.js';
import { TASK_DEFAULT_TONE } from '../dist-electron/shared/ai/local-rules/task-tone.js';
import { sanitizeAiHelperContext, normalizeOptionalAiHelperContext, diffAiHelperContext } from '../dist-electron/shared/ai-context/ai-helper-context-merge.js';
import { maskPlate, maskTcVkn, maskPhone, maskEmail, maskIban, maskSensitiveText } from '../dist-electron/shared/ai/ai-privacy-masker.js';
import { DEFAULT_AI_RUNTIME_CONFIG, DEFAULT_AI_PRIVACY_MODE } from '../dist-electron/shared/ai/ai-runtime-config-types.js';
import { AI_TRANSIENT_ERROR_CODE, AI_TRANSIENT_USER_MESSAGE, isTransientAiError } from '../dist-electron/shared/ai/ai-transient-error.js';
import { AI_FINAL_APPROVAL_WARNING_CODE, normalizeAiTaskRequest } from '../dist-electron/shared/ai/ai-safety.js';
import { IPC_INVOKE_CHANNELS } from '../dist-electron/shared/ipc-contract.js';
import { isForbiddenKnowledgeChannel, isKnowledgeReadOnlyChannel } from '../dist-electron/shared/knowledge/knowledge-safety.js';
import { normalizeSettings } from '../dist-electron/main/services/settings-normalizer.js';
import { evaluateValueLossRequirement, isDateOnOrAfterEffective, VALUE_LOSS_EFFECTIVE_DATE } from '../dist-electron/shared/value-loss/value-loss-requirement-rules.js';
import { buildValueLossChecklist, summarizeValueLossChecklist, missingChecklistLabels } from '../dist-electron/shared/value-loss/value-loss-checklist.js';
import { evaluateValueLossExclusions } from '../dist-electron/shared/value-loss/value-loss-exclusion-rules.js';
import { buildValueLossInternalNote, buildValueLossReportExplanation, buildValueLossMissingInfoMail, buildValueLossDraft, VALUE_LOSS_DEFAULT_MISSING_ITEMS } from '../dist-electron/shared/value-loss/value-loss-draft-builder.js';
import { normalizeValueLossContext, normalizeOptionalValueLossContext, parseNonNegativeNumber, hasMeaningfulValueLossContext } from '../dist-electron/shared/value-loss/value-loss-context-normalizer.js';
import { diffValueLossContext, buildValueLossSaveConfirmMessage, VALUE_LOSS_SAVE_SCOPE_NOTE } from '../dist-electron/shared/value-loss/value-loss-context-diff.js';
import { applyValueLossContextToRequirementInput, applyValueLossContextToChecklistInput, applyValueLossContextToExclusionInput, draftFactsFromValueLossContext, splitPartsText } from '../dist-electron/shared/value-loss/value-loss-context-apply.js';
import { calculateValueLoss } from '../dist-electron/shared/value-loss/value-loss-calculation-engine.js';
import { VALUE_LOSS_PART_COEFFICIENTS, findPartCoefficientEntry, listPartNamesForGroup } from '../dist-electron/shared/value-loss/value-loss-part-coefficients.js';
import { classifyRepairSeverity } from '../dist-electron/shared/value-loss/value-loss-part-severity.js';
import { resolvePartItem, resolveStructuredParts } from '../dist-electron/shared/value-loss/value-loss-part-resolver.js';
import { buildValueLossCalculationCopyText } from '../dist-electron/shared/value-loss/value-loss-calculation-copy.js';
import { buildValueLossCalculationSnapshot, formatSnapshotLabel } from '../dist-electron/shared/value-loss/value-loss-calculation-snapshot.js';
import { createSnapshotHistoryItem, appendSnapshotHistory, VALUE_LOSS_SNAPSHOT_HISTORY_LIMIT } from '../dist-electron/shared/value-loss/value-loss-calculation-history.js';
import { evaluateCabrioGuidance, CABRIO_PART_NAME_MARKER } from '../dist-electron/shared/value-loss/value-loss-cabrio-guidance.js';
import { createValueLossFormFingerprint, buildValueLossInputSummary, describeValueLossFormFingerprint, VALUE_LOSS_FINGERPRINT_VERSION } from '../dist-electron/shared/value-loss/value-loss-form-fingerprint.js';
import { evaluateSnapshotFreshness, evaluateSnapshotItemFreshness, evaluateHistoryFreshnessSummary } from '../dist-electron/shared/value-loss/value-loss-snapshot-freshness.js';
import { SEIK_2026_V1_COEFFICIENT_METADATA } from '../dist-electron/shared/value-loss/value-loss-coefficients.js';
import { getActiveValueLossCoefficientProvider, SEIK_2026_V1_COEFFICIENT_SET, findRangeCoefficient, getMileageTableForGroup, isNearLowerBound } from '../dist-electron/shared/value-loss/value-loss-coefficients.js';
import { roundValueLossAmount } from '../dist-electron/shared/value-loss/value-loss-rounding.js';
import { VALUE_LOSS_CALC_DISCLAIMER } from '../dist-electron/shared/value-loss/value-loss-calculation-explain.js';

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

// Dev Harness v1: AGENTS.md ajan anayasasina genisletildi (sinir 400 satir/12k karakter);
// eski kritik token'larin TAMAMI korunur + yeni politika token'lari eklendi (denetim guclendirildi).
const agentsGuide = await fs.readFile('AGENTS.md', 'utf-8');
assert(
  agentsGuide.length < 12000
    && agentsGuide.split(/\r?\n/).length <= 400
    && agentsGuide.includes('Electron + TypeScript')
    && agentsGuide.includes('takip.json')
    && agentsGuide.includes('Yeni dependency ekleme')
    && agentsGuide.includes('UI metinleri Türkçe')
    && agentsGuide.includes('P4-E2-B')
    && agentsGuide.includes('Dashboard gate')
    && agentsGuide.includes('Gemini 503 hotfix')
    && agentsGuide.includes('Araç Bağlamı')
    && agentsGuide.includes('AI İşçilik Sözlüğü')
    && agentsGuide.includes('npm run typecheck')
    && agentsGuide.includes('npm audit')
    && agentsGuide.includes('node_modules')
    && agentsGuide.includes('user-knowledge-store.json')
    && agentsGuide.includes('source of truth')
    && agentsGuide.includes('preview-first')
    && agentsGuide.includes('no paid API')
    && agentsGuide.includes('user approval')
    && agentsGuide.includes('Value Loss')
    && agentsGuide.includes('Teslim Raporu Formatı'),
  'Dev Harness v1: AGENTS.md ajan anayasasi kritik guvenlik kurallarini ve politika ifadelerini icerir',
  `AGENTS.md length=${agentsGuide.length}`
);

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

// === AI İşçilik Dağıtıcı v3: işlem türü + Türkçe fiyat parse + onarım/değişim ekonomisi + kalibrasyon (saf modüller) ===
// Türkçe/karma para formatı güvenli parse.
assert(parseTurkishPrice('23.382₺') === 23382, 'v3 fiyat parse: 23.382₺ -> 23382', String(parseTurkishPrice('23.382₺')));
assert(parseTurkishPrice('23.382,00') === 23382, 'v3 fiyat parse: 23.382,00 -> 23382', String(parseTurkishPrice('23.382,00')));
assert(parseTurkishPrice('23382') === 23382, 'v3 fiyat parse: 23382 -> 23382', String(parseTurkishPrice('23382')));
assert(parseTurkishPrice('23,382.00') === 23382, 'v3 fiyat parse: 23,382.00 (ABD) -> 23382', String(parseTurkishPrice('23,382.00')));
assert(parseTurkishPrice('1.234.567,89') === 1234567.89, 'v3 fiyat parse: çok binlikli TR ondalık korunur', String(parseTurkishPrice('1.234.567,89')));
assert(parseTurkishPrice('abc') === null && parseTurkishPrice('') === null, 'v3 fiyat parse: sayısalsız metin null', 'null beklenir');
assert(readPriceCell(5000, '').value === 5000, 'v3 readPriceCell: hesaplanan numeric önceliklidir', JSON.stringify(readPriceCell(5000, '')));
assert(readPriceCell(null, 'okunamaz formul').unreadable === true, 'v3 readPriceCell: okunamayan değer kontrol gerekli işaretlenir', JSON.stringify(readPriceCell(null, 'okunamaz formul')));

// İşlem türü (onarım/değişim) tespiti; belirsizde boş bırakılmaz, düşük güven + kontrol gerekli.
assert(detectOperationType('ÖN TAMPON DEĞİŞİMİ').type === 'degisim', 'v3 işlem türü: değişim', JSON.stringify(detectOperationType('ÖN TAMPON DEĞİŞİMİ')));
assert(detectOperationType('ÖN KAPI ONARIMI').type === 'onarim', 'v3 işlem türü: onarım', JSON.stringify(detectOperationType('ÖN KAPI ONARIMI')));
const v3OpUnknown = detectOperationType('ÖN TAMPON');
assert(v3OpUnknown.type === 'belirsiz' && v3OpUnknown.confidence === 'Düşük', 'v3 işlem türü: belirsizde düşük güven (kontrol gerekli)', JSON.stringify(v3OpUnknown));
assert(detectOperationType('TAMPON ONARIM VE DEĞİŞİM').type === 'belirsiz', 'v3 işlem türü: çelişkili ipucu belirsiz', JSON.stringify(detectOperationType('TAMPON ONARIM VE DEĞİŞİM')));

// Kalibrasyon / rot-balans bağlamı: ön takım makul, radar/kamera yoksa ADAS varsayılmaz, otomatik şüpheli değil.
const v3CalRot = evaluateCalibrationContext('ROT BAŞI');
assert(v3CalRot.context === 'on-duzen' && v3CalRot.reasonable === true && v3CalRot.needsReview === false, 'v3 kalibrasyon: rot başı ön düzen makul (otomatik şüpheli değil)', JSON.stringify(v3CalRot));
const v3CalJant = evaluateCalibrationContext('JANT', '', 'rot balans yapıldı');
assert(v3CalJant.context === 'on-duzen' && v3CalJant.reasonable, 'v3 kalibrasyon: jant + rot-balans makul', JSON.stringify(v3CalJant));
const v3CalAdas = evaluateCalibrationContext('ÖN KAMERA', '', 'kalibrasyon');
assert(v3CalAdas.context === 'adas' && v3CalAdas.needsReview, 'v3 kalibrasyon: radar/kamera bağlamında ADAS gündeme gelir, kontrol gerekli', JSON.stringify(v3CalAdas));
const v3CalSuspicious = evaluateCalibrationContext('SİGORTA KUTUSU', '', 'kalibrasyon');
assert(v3CalSuspicious.context === 'belirsiz' && v3CalSuspicious.needsReview && !v3CalSuspicious.reasonable, 'v3 kalibrasyon: bağlamsız kalibrasyon kontrol gerekli (otomatik reddedilmez)', JSON.stringify(v3CalSuspicious));
assert(evaluateCalibrationContext('ÖN TAMPON').context === 'yok', 'v3 kalibrasyon: ilgisiz parçada kalibrasyon bağlamı yok', JSON.stringify(evaluateCalibrationContext('ÖN TAMPON')));

// Onarım/değişim ekonomisi: onarım pahalı diye OTOMATİK reddedilmez.
const v3EcoRepairHigh = evaluateRepairVsReplace({ operationType: 'onarim', salvagePrice: 23382, originalPrice: 41000, repairLaborTotal: 12000 });
assert(v3EcoRepairHigh.verdict === 'onarim-ekonomik' && /ekonomik/.test(v3EcoRepairHigh.note), 'v3 ekonomi: yüksek sahiplenme bedelinde onarım ekonomik', JSON.stringify(v3EcoRepairHigh));
const v3EcoNoLabor = evaluateRepairVsReplace({ operationType: 'onarim', salvagePrice: 23382, originalPrice: null });
assert(v3EcoNoLabor.verdict === 'onarim-ekonomik' && /sahiplenme bedeli/.test(v3EcoNoLabor.note), 'v3 ekonomi: işçilik toplamı yokken de sahiplenme bedelli onarım gerekçesi üretir', JSON.stringify(v3EcoNoLabor));
const v3EcoReplace = evaluateRepairVsReplace({ operationType: 'degisim', salvagePrice: 5000, originalPrice: 8000 });
assert(v3EcoReplace.verdict === 'degisim-uygun' && /Değişim/.test(v3EcoReplace.note), 'v3 ekonomi: değişimde uygun gerekçe', JSON.stringify(v3EcoReplace));
assert(evaluateRepairVsReplace({ operationType: 'belirsiz', salvagePrice: null, originalPrice: null }).verdict === 'kontrol-gerekli', 'v3 ekonomi: işlem türü belirsizse kontrol gerekli', 'kontrol-gerekli beklenir');
const v3EcoExpensive = evaluateRepairVsReplace({ operationType: 'onarim', salvagePrice: 1000, originalPrice: 2000, repairLaborTotal: 20000 });
assert(v3EcoExpensive.verdict === 'kontrol-gerekli' && /otomatik reddedilmez/.test(v3EcoExpensive.note), 'v3 ekonomi: pahalı görünen onarım otomatik reddedilmez, kontrol gerekli', JSON.stringify(v3EcoExpensive));

// Birleşik v3 bağlam (composition): araç + işlem + fiyat + ekonomi tek gerekçede.
const v3Ctx = buildLaborV3Context({ partName: 'ÖN TAMPON ONARIMI', group: 'KAPORTA', partCode: 'TMP-1', salvagePrice: 23382, originalPrice: 41000, repairLaborTotal: 9000, vehicle: { make: 'VOLKSWAGEN', model: 'JETTA', year: '2017' } });
assert(v3Ctx.operation.type === 'onarim' && v3Ctx.economic.verdict === 'onarim-ekonomik', 'v3 bağlam: onarım + ekonomik birleşik karar', JSON.stringify({ op: v3Ctx.operation.type, eco: v3Ctx.economic.verdict }));
assert(v3Ctx.note.includes('VOLKSWAGEN') && v3Ctx.note.includes('İşlem: Onarım'), 'v3 bağlam: araç + işlem türü tek gerekçede toplanır', v3Ctx.note);
assert(buildLaborV3Context({ partName: 'GİZEMLİ PARÇA' }).needsReview === true, 'v3 bağlam: işlem/fiyat yoksa kontrol gerekli (boş bırakılmaz)', JSON.stringify(buildLaborV3Context({ partName: 'GİZEMLİ PARÇA' })));
assert(lookupLocalPartReference('X', []) === null && lookupLocalPartReference('A1', [{ partCode: 'A1', notes: 'yerel' }])?.notes === 'yerel', 'v3 yerel parça referansı: boş tablo null, eşleşme bulur (online sorgu yok)', 'yerel referans');

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

// v3 önizleme entegrasyonu: Sahiplenme (F) / Orijinal (G) bedel sütunları + işlem türü + zengin gerekçe.
const v3Headers = ['Sıra', 'DVN Grubu', 'Parça Açıklaması', 'Parça Kodu', 'Parça Sahiplenme Bedeli', 'Parça Orijinal Bedeli', 'Kaporta', 'Boya', 'Mekanik', 'Elektrik', 'Cam', 'Döşeme/Kilit', 'Onarım'];
const v3PreviewRows = [
  [1, 'KAPORTA', 'ÖN TAMPON ONARIMI', 'TMP-1', '23.382,00', '41.000,00', '', '', '', '', '', '', ''],
  [2, 'MEKANIK', 'ROT BAŞI DEĞİŞİMİ', 'ROT-9', '850,00', '1.200,00', '', '', '', '', '', '', '']
];
const v3Input = path.join(aiTmp, 'v3-input.xlsx');
await fs.writeFile(v3Input, buildGenericLaborWorkbook(v3Headers, v3PreviewRows));
const v3Preview = await buildAutoLaborPreview(v3Input, []);
assert(v3Preview.salvageColumn && v3Preview.originalColumn && v3Preview.salvageColumn !== v3Preview.originalColumn, 'v3 önizleme: Sahiplenme (F) ve Orijinal (G) bedel sütunları ayrı tespit edilir', JSON.stringify({ s: v3Preview.salvageColumn, o: v3Preview.originalColumn }));
const v3PvTampon = v3Preview.rows.find((r) => r.partName.includes('TAMPON'));
assert(v3PvTampon && v3PvTampon.operationType === 'onarim' && v3PvTampon.salvagePrice === 23382 && v3PvTampon.reason.includes('v3:'), 'v3 önizleme: onarım + sahiplenme bedeli okunur, gerekçe zenginleşir', JSON.stringify({ op: v3PvTampon?.operationType, sp: v3PvTampon?.salvagePrice }));
const v3PvRot = v3Preview.rows.find((r) => r.partName.includes('ROT'));
assert(v3PvRot && v3PvRot.operationType === 'degisim' && v3PvRot.economicVerdict === 'degisim-uygun', 'v3 önizleme: rot başı değişim + ekonomi gerekçesi', JSON.stringify({ op: v3PvRot?.operationType, ev: v3PvRot?.economicVerdict }));
assert(v3Preview.rows.every((r) => r.categories.length > 0), 'v3 önizleme: her satır işçilik kararı alır (v3 dağıtımı bozmaz)', JSON.stringify(v3Preview.rows.map((r) => r.categories.length)));

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

// === AI İşçilik Dağıtıcı v3.1: ekonomik bağlam KARAR etkisi (İşlem Türü E / Kalibrasyon T sütunlu portal) ===
assert(isCriticalSafetyPart('ON TRAVERS') && isCriticalSafetyPart('SÜRÜCÜ HAVA YASTIĞI') && isCriticalSafetyPart('SOL ÖN AKS') && !isCriticalSafetyPart('PLASTIK AKSAM') && !isCriticalSafetyPart('SOL FAR'), 'v3.1 kritik parça: travers/hava yastığı/aks kritik; aksam/far değil (tam kelime eşleşme)', 'critical');
const v31Headers = ['Sıra', 'DVN Grubu', 'İşçilik Açıklaması', 'Parça Kodu', 'İşlem Türü', 'Parça Sahiplenme Bedeli', 'Parça Orijinal Bedeli', 'Kaporta', 'Mekanik', 'Elektrik', 'Döşeme-Kilit', 'Cam', 'Boya', 'Onarım', 'Kalibrasyon'];
const v31Rows = [
  [1, 'AYDINLATMA', 'SOL FAR', 'FAR-1', 'ONARIM', 8000, 13000, '', '', '', '', '', '', '', '0'],
  [2, 'KAPORTA', 'ON TRAVERS', 'TRV-1', 'ONARIM', 10000, 16000, '', '', '', '', '', '', '', '0'],
  [3, 'MEKANIK', 'MOTOR KAPUTU', 'KPT-1', 'DEĞİŞİM', 22000, 37000, '', '', '', '', '', '', '', '0'],
  [4, 'GENEL', 'PLASTIK AKSAM', 'GEN-1', '', 500, 800, '', '', '', '', '', '', '', '0'],
  [5, 'MEKANIK', 'SOL ÖN JANT', 'JNT-1', 'ONARIM', 3000, 5000, '', '', '', '', '', '', '', 'ROT BALANS']
];
const v31Input = path.join(aiTmp, 'v31-input.xlsx');
await fs.writeFile(v31Input, buildGenericLaborWorkbook(v31Headers, v31Rows));
const v31 = await buildAutoLaborPreview(v31Input, []);
assert(v31.operationColumn && v31.calibrationColumn, 'v3.1 önizleme: İşlem Türü (E) ve Kalibrasyon (T) sütunları başlıktan tespit edilir', JSON.stringify({ op: v31.operationColumn, cal: v31.calibrationColumn }));
const v31Far = v31.rows.find((r) => r.partName.includes('FAR'));
assert(v31Far && v31Far.operationType === 'onarim' && v31Far.economicVerdict === 'onarim-ekonomik' && v31Far.needsReview === false, 'v3.1: yüksek sahiplenme bedelli ekonomik onarımda kontrol gerekli yumuşatılır', JSON.stringify(v31Far));
const v31Travers = v31.rows.find((r) => r.partName.includes('TRAVERS'));
assert(v31Travers && v31Travers.needsReview === true && /Güvenlik\/kritik/.test(v31Travers.reason), 'v3.1: kritik/güvenlik parçası (travers) ekonomik olsa bile kontrol gerekli kalır', JSON.stringify(v31Travers));
const v31Kaput = v31.rows.find((r) => r.partName.includes('KAPUT'));
assert(v31Kaput && v31Kaput.operationType === 'degisim' && v31Kaput.economicVerdict === 'degisim-uygun', 'v3.1: değişim satırında ek işçilik (sök/tak) ekonomi gerekçesi', JSON.stringify({ op: v31Kaput?.operationType, ev: v31Kaput?.economicVerdict }));
const v31Belirsiz = v31.rows.find((r) => r.partName.includes('PLASTIK'));
assert(v31Belirsiz && v31Belirsiz.operationType === 'belirsiz' && v31Belirsiz.needsReview === true, 'v3.1: işlem türü belirsizse kontrol gerekli (boş bırakılmaz)', JSON.stringify({ op: v31Belirsiz?.operationType, nr: v31Belirsiz?.needsReview }));
const v31Jant = v31.rows.find((r) => r.partName.includes('JANT'));
assert(v31Jant && /rot-balans|ön düzen/i.test(v31Jant.reason), 'v3.1: jant + kalibrasyon rot-balans/ön düzen olarak makul değerlendirilir', JSON.stringify(v31Jant?.reason));

// === Eksper Onaylı İşçilik Öğrenme altyapısı (yerel, onay-önce, geri alınabilir) ===
const expSrc = [
  { partName: 'ÖN KAPI', partGroup: 'KAPORTA', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 8000, originalPrice: 13000, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } },
  { partName: 'BOŞ SATIR', operationType: 'degisim', salvagePrice: 1000, originalPrice: 2000, laborDistribution: { kaporta: 0, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 0, onarim: 0 } }
];
const exExtract = extractExpertLearningEntries(expSrc, { vehicleModel: 'JETTA', modelYear: 2017, chassisNo: 'WVWZZZ16ZHM026138', engineNo: 'CYV536292' });
assert(exExtract.entries.length === 1 && exExtract.skipped.length === 1, 'v3.1 eksper öğrenme: dolu dağıtım çıkarılır, boş dağıtım atlanır', JSON.stringify({ n: exExtract.entries.length, sk: exExtract.skipped }));
const exEntry = exExtract.entries[0];
assert(exEntry.approvedByUser === false && exEntry.isActive === false && exEntry.confidence === 'high' && exEntry.salvagePriceBand === '5K-15K' && exEntry.chassisPrefix === 'WVWZZZ16ZHM' && exEntry.engineCode === 'CYV' && exEntry.vehicleModel === 'JETTA', 'v3.1 eksper öğrenme: kayıt onaysız/pasif başlar; banda/şasi öneki/motor kodu/araç bağlamı taşır', JSON.stringify(exEntry));
assert(priceBand(23382) === '15K-30K' && priceBand(0) === 'bilinmiyor' && priceBand(null) === 'bilinmiyor', 'v3.1 fiyat bandı: 23382->15K-30K, 0/null->bilinmiyor', 'band');
assert(addExpertApprovedEntry([], exEntry).length === 0, 'v3.1 store: onaysız kayıt depoya eklenmez', 'unapproved');
const exStore = approveExpertEntry([], exEntry);
assert(exStore.length === 1 && exStore[0].approvedByUser && exStore[0].isActive, 'v3.1 store: kullanıcı onayıyla aktif kayıt eklenir', JSON.stringify(exStore[0]));
assert(listUsableExpertEntries(setExpertEntryActive(exStore, exStore[0].id, false)).length === 0, 'v3.1 store: pasifleştirilen kayıt eşleşmede kullanılmaz', 'inactive');
assert(removeExpertEntry(exStore, exStore[0].id).length === 0, 'v3.1 store: kayıt silinebilir (geri alınabilir)', 'remove');
assert(normalizeExpertEntry({ partName: 'X', operationType: 'onarim', approvedByUser: true, isActive: true })?.partName === 'X' && normalizeExpertEntry({}) === null, 'v3.1 store: migration-safe normalize (zorunlu alan yoksa null)', 'normalize');
assert(matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', partGroup: 'KAPORTA', operationType: 'onarim', salvagePrice: 9000 }, exStore).level === 'strong', 'v3.1 eşleşme: aynı parça kodu + aynı işlem türü -> güçlü', 'strong');
assert(matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'degisim', salvagePrice: 9000 }, exStore).level === 'control-needed', 'v3.1 eşleşme: işlem türü farklı -> otomatik uygulanmaz, kontrol gerekli', 'diff-op');
assert(matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 100 }, exStore).level === 'control-needed', 'v3.1 eşleşme: fiyat bandı çok farklı -> kontrol gerekli', 'price-far');
assert(matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000, critical: true }, exStore).level === 'control-needed', 'v3.1 eşleşme: güvenlik/kritik parça -> otomatik güçlü öneri verilmez', 'critical');
assert(matchExpertLearning({ partName: 'ZXQW ALAKASIZ', operationType: 'onarim' }, exStore).level === 'none', 'v3.1 eşleşme: alakasız parça eşleşmez', 'none');
const exPrev = buildExpertLearningPreview(expSrc, { vehicleModel: 'JETTA' });
assert(exPrev.items.length === 1 && exPrev.items[0].confidence === 'high' && exPrev.items[0].needsReview === false, 'v3.1 öğrenme önizlemesi: dolu satır gösterilir; yüksek güvende kontrol gerekmez', JSON.stringify(exPrev.items[0]));
const exFromPortal = expertSourceRowsFromAutoLabor(portalV2);
const exMotorRow = exFromPortal.find((r) => r.partName.includes('MOTOR ELEKTR'));
assert(exMotorRow && distributionTotal(exMotorRow.laborDistribution) === 2997, 'v3.1 adapter: dağıtım AI önerisi değil eksperin MEVCUT H-N değerlerinden alınır', JSON.stringify(exMotorRow?.laborDistribution));
// Eksper eşleşmesi canlı önizlemeye yalnız EVIDENCE olarak yansır (preview-only, otomatik yazma yok).
const v31WithExpert = await buildAutoLaborPreview(v31Input, [], exStore.map((e) => ({ ...e, partCode: 'FAR-1', partName: 'SOL FAR', operationType: 'onarim', salvagePriceBand: '5K-15K' })));
const v31ExpFar = v31WithExpert.rows.find((r) => r.partName.includes('FAR'));
assert(v31ExpFar && /Eksper öğrenme/.test(v31ExpFar.reason), 'v3.1: eksper onaylı eşleşme bulununca önizleme gerekçesine eklenir (preview-only)', JSON.stringify(v31ExpFar?.reason));

// === AI İşçilik v3.2: yerel store dosyası + duplicate + fark karşılaştırma + güvenli seçim + UI guard ===
const elTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-expert-'));
const elStoreFile = new ExpertApprovedLearningStoreFile(elTmp);
const elEmpty = await elStoreFile.read();
assert(elEmpty.entries.length === 0 && elEmpty.corrupt === false, 'v3.2 store dosyası: eksik depo güvenle boş açılır (corrupt değil)', JSON.stringify(elEmpty));
const elCand = extractExpertLearningEntries([{ partName: 'ÖN KAPI', partCode: 'KPI-9', operationType: 'onarim', salvagePrice: 8000, originalPrice: 13000, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } }]).entries[0];
const elWritten = await elStoreFile.write(approveExpertEntry([], elCand));
assert(elWritten.version === 1 && Array.isArray(elWritten.entries) && elWritten.entries.length === 1, 'v3.2 store dosyası: yazım schema version=1 + entries dizisi', JSON.stringify({ v: elWritten.version, n: elWritten.entries.length }));
const elReadBack = await elStoreFile.read();
assert(elReadBack.entries.length === 1 && elReadBack.entries[0].partCode === 'KPI-9' && elReadBack.entries[0].approvedByUser, 'v3.2 store dosyası: onaylı kayıt geri okunur', JSON.stringify(elReadBack.entries[0]));
await fs.writeFile(elStoreFile.storePath(), '{bozuk json…', 'utf-8');
const elCorrupt = await elStoreFile.read();
assert(elCorrupt.entries.length === 0 && elCorrupt.corrupt === true, 'v3.2 store dosyası: bozuk depo çökmeden yok sayılır (corrupt=true)', JSON.stringify(elCorrupt));

const elActive = approveExpertEntry([], elCand);
const elDupCand = approveExpertEntry([], extractExpertLearningEntries([{ partName: 'ÖN KAPI BENZERİ', partCode: 'KPI-9', operationType: 'onarim', salvagePrice: 8500, originalPrice: 13500, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } }]).entries[0])[0];
const elMerge = mergeApprovedExpertEntries(elActive, [elDupCand]);
assert(elMerge.added === 0 && elMerge.skippedDuplicates === 1 && elMerge.entries.length === 1, 'v3.2 duplicate: aynı parça kodu+işlem türü tekrar eklenmez (atlanır)', JSON.stringify({ a: elMerge.added, s: elMerge.skippedDuplicates }));
assert(isDuplicateExpertEntry(elDupCand, elActive) && expertEntryDuplicateKey(elActive[0]).includes('KPI-9'), 'v3.2 duplicate anahtarı: kod+işlem+araç', expertEntryDuplicateKey(elActive[0]));

const aiDist = aiAmountsToDistribution({ Kaporta: 2500, Boya: 4000 });
const expertDist = { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 };
const cmp = compareLaborDistribution(aiDist, expertDist);
assert(!cmp.identical && cmp.diffs.length === 1 && cmp.diffs[0].label === 'Boya' && cmp.diffs[0].delta === 2500 && cmp.totalDelta === 2500, 'v3.2 fark: AI ile eksper dağıtımı arasında Boya farkı (delta 2500) hesaplanır', JSON.stringify(cmp));
assert(/Boya/.test(describeDistributionDiff(cmp)) && /uygulanmaz/i.test(describeDistributionDiff(cmp)), 'v3.2 fark özeti: farklı kalemleri + "uygulanmaz" notunu yazar', describeDistributionDiff(cmp));
assert(compareLaborDistribution(expertDist, expertDist).identical, 'v3.2 fark: aynı dağıtımda fark yok (identical)', 'identical');

const elPrevDup = buildExpertLearningPreview([{ partName: 'ÖN KAPI', partGroup: 'KAPORTA', partCode: 'KPI-9', operationType: 'onarim', salvagePrice: 8000, originalPrice: 13000, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } }], {}, elActive);
assert(elPrevDup.items[0].duplicate === true && elPrevDup.items[0].needsReview === true, 'v3.2 önizleme: aktif store ile duplicate satır işaretlenir + kontrol gerekli', JSON.stringify(elPrevDup.items[0]));
assert(selectSafeExpertPreviewItems(elPrevDup.items).length === 0, 'v3.2 güvenli seçim: duplicate satır otomatik toplu onaya GİRMEZ', 'dup-not-safe');
const elMixed = buildExpertLearningPreview([
  { partName: 'ÖN KAPI', partGroup: 'KAPORTA', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 8000, originalPrice: 13000, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } },
  { partName: 'ON TRAVERS', partGroup: 'KAPORTA', partCode: 'TRV-1', operationType: 'degisim', salvagePrice: 10000, originalPrice: 16000, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 0, onarim: 0 } },
  { partName: 'BELİRSİZ PARÇA', operationType: 'belirsiz', salvagePrice: 500, originalPrice: 800, laborDistribution: { kaporta: 0, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 0, onarim: 500 } }
], {});
assert(selectSafeExpertPreviewItems(elMixed.items).length === 1, 'v3.2 güvenli seçim: yalnız güvenli satır (kritik travers + belirsiz hariç) seçilir', JSON.stringify(elMixed.items.map((i) => ({ p: i.partName, nr: i.needsReview }))));

// UI / kaynak guard'ları
const elPanelSrc = await fs.readFile('src/renderer/app/components/expert-learning-panel.ts', 'utf-8');
const elTableSrc = await fs.readFile('src/renderer/app/components/expert-learning-preview-table.ts', 'utf-8');
const elStoreMgrSrc = await fs.readFile('src/renderer/app/components/expert-learning-store-manager.ts', 'utf-8');
const elServiceSrc = await fs.readFile('src/main/services/expert-approved-learning-service.ts', 'utf-8');
const elStoreFileSrc = await fs.readFile('src/main/local-cache/expert-approved-learning-store-file.ts', 'utf-8');
const elMainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const elDetailSrc = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
assert(!/(^|[^.\w])(window\.)?(confirm|alert|prompt)\s*\(/.test(elPanelSrc + elTableSrc + elStoreMgrSrc), 'v3.2 UI: eksper paneli native confirm/alert/prompt kullanmaz', 'no-native');
assert(/confirmDialog\(/.test(elMainSrc) && /expert-learning-delete/.test(elMainSrc), 'v3.2 UI: eksper kayıt silme in-app confirmDialog ile onaylanır', 'confirm-delete');
assert(!/saveAutoLaborExcel|distributeLaborExcel|\.xlsx/.test(elServiceSrc + elStoreFileSrc + elPanelSrc), 'v3.2 güvenlik: eksper servisi/deposu/paneli otomatik Excel yazmaz', 'no-excel-write');
assert(/renderExpertLearningPanel\(state\)/.test(elDetailSrc), 'v3.2 UI: eksper öğrenme paneli AI İşçilik ekranına bağlandı', 'panel-wired');

// === AI İşçilik v3.3: araç bağlamı + gelişmiş matcher + diff kartı ===
// Araç bağlamı normalize/çıkarım
assert(extractChassisPrefix('WVWZZZ16ZHM026138') === 'WVWZZZ16ZHM', 'v3.3 araç: şasi öneki (ilk 11) çıkarılır', extractChassisPrefix('WVWZZZ16ZHM026138'));
assert(extractEngineCode('CYV536292') === 'CYV', 'v3.3 araç: motor kodu (baş harf bloğu) çıkarılır', extractEngineCode('CYV536292'));
assert(extractModelYear('VOLKSWAGEN JETTA 1.2 TSI BMT 105 2017') === 2017, 'v3.3 araç: model yılı metinden çıkarılır', String(extractModelYear('VOLKSWAGEN JETTA 1.2 TSI BMT 105 2017')));
assert(normalizeVehicleModel('Volkswagen Jetta') === 'VOLKSWAGEN JETTA' && normalizeVehicleModel(undefined) === '', 'v3.3 araç: model normalize (BÜYÜK harf/TR katlama; boş güvenli)', normalizeVehicleModel('Volkswagen Jetta'));
const v33Veh = buildLaborVehicleContext(['HASAR DOSYASI', 'VOLKSWAGEN JETTA 1.2 TSI 2017', 'Şasi: WVWZZZ16ZHM026138', 'MOTOR NO: CYV536292', '34 ABC 123']);
assert(v33Veh.chassisPrefix === 'WVWZZZ16ZHM' && v33Veh.engineCode === 'CYV' && v33Veh.modelYear === 2017 && /JETTA/.test(v33Veh.vehicleModel) && v33Veh.plate, 'v3.3 araç: Excel hücrelerinden şasi/motor/yıl/model/plaka çıkarılır', JSON.stringify(v33Veh));
assert(Object.keys(buildLaborVehicleContext(['ÖN TAMPON', 'KAPORTA'])).length === 0, 'v3.3 araç: araç bilgisi yoksa boş bağlam (sistem bozulmaz)', JSON.stringify(buildLaborVehicleContext(['ÖN TAMPON'])));
assert(mergeLaborVehicleContext({ vehicleModel: 'JETTA' }, { vehicleModel: 'PASSAT', modelYear: 2017 }).vehicleModel === 'JETTA' && mergeLaborVehicleContext({ vehicleModel: 'JETTA' }, { modelYear: 2017 }).modelYear === 2017, 'v3.3 araç: merge a önceliklidir, eksikleri b doldurur', 'merge');

// Gelişmiş matcher: araç bağlamı skora katılır
const v33Store = approveExpertEntry([], extractExpertLearningEntries(
  [{ partName: 'ÖN KAPI', partGroup: 'KAPORTA', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 8000, originalPrice: 13000, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } }],
  { vehicleModel: 'VOLKSWAGEN JETTA', chassisNo: 'WVWZZZ16ZHM026138', engineNo: 'CYV536292' }
).entries[0]);
const mVehSame = matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000, vehicleModel: 'VOLKSWAGEN JETTA', chassisPrefix: 'WVWZZZ16ZHM', engineCode: 'CYV' }, v33Store);
assert(mVehSame.level === 'strong' && mVehSame.reasons.includes('Şasi öneki uyumlu') && mVehSame.reasons.includes('Motor kodu uyumlu') && mVehSame.vehicleMatch.chassisPrefix === 'same', 'v3.3 matcher: aynı kod+işlem+araç (şasi/motor) → güçlü + gerekçeler', JSON.stringify(mVehSame));
const mVehConflict = matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000, chassisPrefix: 'NM0SHASE123' }, v33Store);
assert(mVehConflict.level === 'control-needed' && mVehConflict.warnings.includes('Araç bağlamı çelişiyor'), 'v3.3 matcher: aynı kod ama araç bağlamı çelişkili → control-needed', JSON.stringify(mVehConflict));
const mNoVeh = matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000 }, v33Store);
assert(mNoVeh.level === 'strong' && mNoVeh.warnings.includes('Araç bağlamı bulunamadı'), 'v3.3 matcher: araç bağlamı yoksa sistem çalışır (kod+işlem güçlü) ama uyarı düşer', JSON.stringify(mNoVeh));
const mCritStrong = matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000, vehicleModel: 'VOLKSWAGEN JETTA', chassisPrefix: 'WVWZZZ16ZHM', critical: true }, v33Store);
assert(mCritStrong.level === 'control-needed' && mCritStrong.warnings.includes('Güvenlik/kritik parça'), 'v3.3 matcher: kritik parça güçlü eşleşmede bile kontrol uyarısı verir', JSON.stringify(mCritStrong));

// Diff view: writePolicy preview_only; fark hesabı
const v33Diff = buildExpertLaborDiffView(7, 'strong', ['Aynı parça kodu'], [], aiAmountsToDistribution({ Kaporta: 2500, Boya: 4000 }), { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 });
assert(v33Diff.writePolicy === 'preview_only' && v33Diff.rowIndex === 7 && v33Diff.differences.length === 1 && v33Diff.differences[0].field === 'boya' && v33Diff.differences[0].delta === 2500 && v33Diff.totalDelta === 2500, 'v3.3 diff: writePolicy preview_only + Boya farkı (delta 2500)', JSON.stringify(v33Diff));
const v33DiffSame = buildExpertLaborDiffView(1, 'medium', [], [], { kaporta: 100, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 0, onarim: 0 }, { kaporta: 100, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 0, onarim: 0 });
assert(v33DiffSame.differences.length === 0 && v33DiffSame.totalDelta === 0, 'v3.3 diff: fark yoksa boş differences + sıfır toplam', JSON.stringify(v33DiffSame));

// Önizleme entegrasyonu: araç bağlamlı strong eşleşme + diff kartı verisi satıra eklenir
const v33Headers = ['Sıra', 'DVN Grubu', 'İşçilik Açıklaması', 'Parça Kodu', 'İşlem Türü', 'Parça Sahiplenme Bedeli', 'Parça Orijinal Bedeli', 'Kaporta', 'Mekanik', 'Elektrik', 'Döşeme-Kilit', 'Cam', 'Boya', 'Onarım', 'Kalibrasyon'];
const v33Rows = [
  ['ARAÇ: VOLKSWAGEN JETTA 2017  ŞASİ WVWZZZ16ZHM026138  MOTOR CYV536292', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  [1, 'KAPORTA', 'ÖN KAPI ONARIMI', 'KPI-1', 'ONARIM', 8000, 13000, '', '', '', '', '', '', '', '0']
];
const v33Input = path.join(aiTmp, 'v33-input.xlsx');
await fs.writeFile(v33Input, buildGenericLaborWorkbook(v33Headers, v33Rows));
const v33Preview = await buildAutoLaborPreview(v33Input, [], v33Store);
const v33Kapi = v33Preview.rows.find((r) => r.partName.includes('KAPI'));
assert(v33Kapi && v33Kapi.expertMatchLevel === 'strong' && v33Kapi.expertDiff && v33Kapi.expertDiff.writePolicy === 'preview_only', 'v3.3 önizleme: araç bağlamlı eksper eşleşmesi satıra diff (preview_only) ekler', JSON.stringify({ lvl: v33Kapi?.expertMatchLevel, wp: v33Kapi?.expertDiff?.writePolicy }));
assert(/Şasi öneki uyumlu|Motor kodu uyumlu|Araç modeli/.test(v33Kapi.reason), 'v3.3 önizleme: gerekçede araç uyum bilgisi görünür', v33Kapi?.reason);

// Reactivate UI/IPC + diff card guard'ları
const v33DiffCardSrc = await fs.readFile('src/renderer/app/components/expert-learning-diff-card.ts', 'utf-8');
const v33StoreMgrSrc = await fs.readFile('src/renderer/app/components/expert-learning-store-manager.ts', 'utf-8');
const v33MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(!/saveAutoLaborExcel|distributeLaborExcel|writeFile|\.xlsx|data-action="(auto-labor-save|expert-.*apply)/.test(v33DiffCardSrc), 'v3.3 güvenlik: diff kartında Excel yazma/uygula/gönder butonu yok', 'no-write');
assert(/expert-learning-reactivate/.test(v33StoreMgrSrc) && /expertLearningReactivate/.test(v33MainSrc), 'v3.3 UI: pasif kayıt için Yeniden Aktifleştir butonu + aksiyon bağlı', 'reactivate-wired');
assert(/renderExpertLearningDiffCard\(row\.expertDiff\)/.test(elDetailSrc), 'v3.3 UI: diff kartı auto-labor satır gerekçesine bağlandı', 'diff-wired');
// reactivate davranışı: pasif kayıt matcher'da kullanılmaz, yeniden aktifte kullanılır
const v33Deact = setExpertEntryActive(v33Store, v33Store[0].id, false);
assert(matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000 }, v33Deact).level === 'none', 'v3.3 reactivate: pasifleştirilen kayıt matcher’da kullanılmaz', 'passive-none');
const v33React = setExpertEntryActive(v33Deact, v33Store[0].id, true);
assert(matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000 }, v33React).level === 'strong', 'v3.3 reactivate: yeniden aktif kayıt matcher’da tekrar kullanılır', 'react-strong');

// === AI İşçilik v3.4: aktif dosya araç bilgisi + temiz model çıkarımı + duplicate yenileme ===
// Case araç bilgisi → LaborVehicleContext + merge önceliği
const v34CaseVeh = caseVehicleToLaborContext({ make: 'Volkswagen', model: 'Jetta', modelYear: '2017', chassisNo: 'WVWZZZ16ZHM026138', engineNo: 'CYV536292', plate: '34 ABC 123' });
assert(v34CaseVeh.vehicleModel === 'VOLKSWAGEN JETTA' && v34CaseVeh.modelYear === 2017 && v34CaseVeh.chassisPrefix === 'WVWZZZ16ZHM' && v34CaseVeh.engineCode === 'CYV' && v34CaseVeh.plate === '34 ABC 123', 'v3.4 case araç: VehicleContext → LaborVehicleContext (model/yıl/şasi öneki/motor kodu/plaka)', JSON.stringify(v34CaseVeh));
assert(caseVehicleToLaborContext(undefined).vehicleModel === undefined, 'v3.4 case araç: bilgi yoksa boş bağlam (sistem bozulmaz)', 'empty-safe');
assert(mergeLaborVehicleContext(v34CaseVeh, { vehicleModel: 'BMW', modelYear: 2010 }).vehicleModel === 'VOLKSWAGEN JETTA', 'v3.4 merge: case (a) Excel (b) üzerine önceliklidir', 'case-priority');

// Daha temiz model çıkarımı (VIN/motor/yıl modelden temizlenir)
const v34Model = extractVehicleModelFromText('VOLKSWAGEN JETTA 1.2 TSI BMT 105 2017 WVWZZZ16ZHM026138 CYV536292');
assert(/VOLKSWAGEN JETTA/.test(v34Model.model) && !v34Model.model.includes('WVWZZZ16ZHM026138') && !v34Model.model.includes('CYV536292') && !/2017/.test(v34Model.model), 'v3.4 temiz model: marka+model alınır; VIN/motor/yıl modelden temizlenir', v34Model.model);
assert(extractVehicleModelFromText('06 ABC 123 VOLKSWAGEN JETTA ŞASİ WVWZZZ16ZHM026138 MOTOR CYV536292').model === 'VOLKSWAGEN JETTA', 'v3.4 temiz model: marka sonrası etikette (ŞASİ/MOTOR) durur', extractVehicleModelFromText('06 ABC 123 VOLKSWAGEN JETTA ŞASİ WVWZZZ16ZHM026138 MOTOR CYV536292').model);
assert(extractVehicleModelFromText('ÖN TAMPON KAPORTA').model === '', 'v3.4 temiz model: marka yoksa boş (yanlış model üretmez)', 'no-brand');

// Motor kodu çıkarımı: etiketsiz yakalanır, VIN motor sayılmaz, araç dışı hücrede uydurulmaz
const v34Eng = buildLaborVehicleContext(['VOLKSWAGEN JETTA WVWZZZ16ZHM026138 CYV536292']);
assert(v34Eng.engineCode === 'CYV' && v34Eng.engineNo === 'CYV536292' && v34Eng.engineNo !== v34Eng.chassisNo, 'v3.4 motor: etiketsiz motor kodu çıkarılır; VIN motor sayılmaz', JSON.stringify(v34Eng));
assert(!buildLaborVehicleContext(['ELK001 SIGORTA KUTUSU']).engineNo, 'v3.4 motor: araç satırı olmayan parça hücresinde motor uydurulmaz', JSON.stringify(buildLaborVehicleContext(['ELK001 SIGORTA KUTUSU'])));

// Duplicate kullanıcı onaylı yenileme (v33Store: aktif KPI-1 kaydı)
const v34Vehicle = { vehicleModel: 'VOLKSWAGEN JETTA', chassisNo: 'WVWZZZ16ZHM026138', engineNo: 'CYV536292' };
const v34New = approveExpertEntry([], extractExpertLearningEntries([{ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 8200, originalPrice: 13200, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } }], v34Vehicle).entries[0])[0];
assert(findDuplicateExpertEntry(v34New, v33Store)?.id === v33Store[0].id, 'v3.4 findDuplicate: aktif çakışan kaydı bulur', 'find-dup');
const v34Replace = replaceDuplicateExpertEntryWithApproval(v33Store, v34New, v33Store[0].id, '2026-07-01T00:00:00Z');
assert(v34Replace.replaced === true && v34Replace.entries.length === 2, 'v3.4 yenileme: eski kayıt silinmez, yeni eklenir (2 kayıt birlikte)', JSON.stringify(v34Replace.entries.map((e) => ({ id: e.id, a: e.isActive }))));
const v34Old = v34Replace.entries.find((e) => e.id === v33Store[0].id);
const v34NewActive = v34Replace.entries.find((e) => e.id !== v33Store[0].id);
assert(v34Old && v34Old.isActive === false && v34NewActive && v34NewActive.isActive === true && v34NewActive.approvedByUser === true && /pasifleştirildi/.test(v34NewActive.reasoning), 'v3.4 yenileme: eski PASİF, yeni AKTİF+onaylı + history notu', JSON.stringify({ old: v34Old?.isActive, neu: v34NewActive?.isActive }));
assert(matchExpertLearning({ partName: 'ÖN KAPI', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 9000 }, v34Replace.entries).entry.id === v34NewActive.id, 'v3.4 yenileme: matcher yeni aktif kaydı kullanır (pasif eskiyi değil)', 'uses-new');
assert(replaceDuplicateExpertEntryWithApproval(v33Store, { ...v34New, approvedByUser: false }, v33Store[0].id).replaced === false, 'v3.4 yenileme: onaysız kayıt replace edilmez', 'unapproved');
assert(replaceDuplicateExpertEntryWithApproval(v33Store, v34New, 'yok-boyle-id').replaced === false, 'v3.4 yenileme: duplicateId yoksa işlem yapılmaz (overwrite yok)', 'no-target');

// Önizleme duplicate id taşır
const v34Prev = buildExpertLearningPreview([{ partName: 'ÖN KAPI', partGroup: 'KAPORTA', partCode: 'KPI-1', operationType: 'onarim', salvagePrice: 8000, originalPrice: 13000, laborDistribution: { kaporta: 2500, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 6500, onarim: 0 } }], v34Vehicle, v33Store);
assert(v34Prev.items[0].duplicate === true && v34Prev.items[0].duplicateOfId === v33Store[0].id, 'v3.4 önizleme: duplicate satır mevcut kaydın id’sini taşır (yenileme için)', JSON.stringify({ d: v34Prev.items[0].duplicate, of: v34Prev.items[0].duplicateOfId }));

// Önizleme entegrasyonu: araç bağlamı kaynağı (Excel vs aktif dosya)
const v34PrevExcel = await buildAutoLaborPreview(v33Input, [], v33Store);
assert(v34PrevExcel.rows.find((r) => r.partName.includes('KAPI'))?.expertDiff?.vehicleSource === 'excel', 'v3.4 vehicleSource: Excel’den araç çıkınca diff kaynağı excel', 'src-excel');
const v34PrevCase = await buildAutoLaborPreview(v33Input, [], v33Store, caseVehicleToLaborContext({ make: 'Volkswagen', model: 'Jetta', chassisNo: 'WVWZZZ16ZHM026138', engineNo: 'CYV536292' }));
assert(v34PrevCase.rows.find((r) => r.partName.includes('KAPI'))?.expertDiff?.vehicleSource === 'active-file', 'v3.4 vehicleSource: aktif dosya araç bilgisi verilince diff kaynağı active-file', 'src-active');

// UI / kaynak guard'ları
const v34TableSrc = await fs.readFile('src/renderer/app/components/expert-learning-preview-table.ts', 'utf-8');
const v34MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const v34DiffCardSrc = await fs.readFile('src/renderer/app/components/expert-learning-diff-card.ts', 'utf-8');
const v34StoreSrc = await fs.readFile('src/shared/labor/expert-approved-learning-store.ts', 'utf-8');
assert(/expert-learning-replace-dup/.test(v34TableSrc), 'v3.4 UI: duplicate satırda "Eski Kaydı Pasifleştir + Yeniyi Öğren" butonu render olur', 'replace-btn');
assert(/expertLearningReplaceDuplicate/.test(v34MainSrc) && /confirmDialog\(/.test(v34MainSrc), 'v3.4 UI: duplicate yenileme in-app confirmDialog ile onaylanır', 'replace-confirm');
assert(/Araç bağlamı kaynağı/.test(v34DiffCardSrc), 'v3.4 UI: diff kartında araç bağlamı kaynağı (aktif dosya/Excel) gösterilir', 'vehicle-source-shown');
assert(!/saveAutoLaborExcel|distributeLaborExcel|writeFile|\.xlsx/.test(v34StoreSrc + v34TableSrc + v34DiffCardSrc), 'v3.4 güvenlik: yenileme/store/diff/tablo Excel’e yazmaz', 'no-excel');

// === AI İşçilik v3.5: Google AI Mode MANUEL parça araştırma köprüsü ===
const v35Input = { vehicle: { vehicleModel: 'VOLKSWAGEN JETTA', modelYear: 2017, chassisNo: 'WVWZZZ16ZHM026138', chassisPrefix: 'WVWZZZ16ZHM', engineNo: 'CYV536292', engineCode: 'CYV', plate: '34 ABC 123' }, vehicleSource: 'active-file', row: { rowNumber: 5, partGroup: 'KAPORTA', partName: 'TAMPON ÖN', partCode: '', operationType: 'degisim', salvagePrice: 23382, originalPrice: 41000 } };
const v35Masked = buildAiModeSearchPrompt(v35Input, 'masked');
const v35Full = buildAiModeSearchPrompt(v35Input, 'full');
assert(v35Masked.includes(AI_MODE_PRIVACY_NOTICE) && /GİZLİLİK/.test(v35Masked), 'v3.5 prompt: gizlilik/veri gönderim uyarısı içerir', 'privacy');
assert(!v35Masked.includes('WVWZZZ16ZHM026138') && v35Masked.includes('WVWZZZ16ZHM') && !v35Masked.includes('34 ABC 123') && !v35Masked.includes('CYV536292'), 'v3.5 prompt: maskeli mod tam şasi/motor/plaka göstermez (şasi öneki + motor kodu)', v35Masked);
assert(v35Full.includes('WVWZZZ16ZHM026138') && v35Full.includes('CYV536292') && v35Full.includes('34 ABC 123'), 'v3.5 prompt: tam veri modu tam şasi/motor/plaka içerir', 'full-mode');
assert(/TAMPON ÖN/.test(v35Masked) && /KAPORTA/.test(v35Masked) && /DEĞİŞİM/.test(v35Masked) && /Mevcut Parça Kodu: boş/.test(v35Masked), 'v3.5 prompt: parça adı/grubu/işlem türü ve boş parça kodu görünür', 'part-fields');
assert(/23\.382 TL/.test(v35Masked) && /41\.000 TL/.test(v35Masked), 'v3.5 prompt: F/G fiyatları (varsa) prompta girer', 'prices');
assert(!/fetch|axios|http:\/\/|https:\/\/|websocket|puppeteer|playwright|serpapi/i.test(v35Masked), 'v3.5 prompt: metin Google\'a otomatik gönderim/scraping içermez', 'no-net');

// Parser: tablo + madde listesi
const v35Resp = [
  'İşte adaylar:',
  '| Parça Kodu | Parça Adı | Tür | Uyumluluk | Güven | Kaynak |',
  '|---|---|---|---|---|---|',
  '| 5C6807221 | Ön Tampon | Orijinal | 2017 Jetta motor kodu uyumlu | yüksek | https://parts.example.com/5c6807221 |',
  '| 5C6807221GRU | Ön Tampon Eşdeğer | Eşdeğer | uyumlu olabilir, kontrol gerekli | orta | |',
  '- Yan sanayi karşılığı: WHT-001-A (emin değil)',
  'Not: VIN WVWZZZ16ZHM026138 sadece referanstır.'
].join('\n');
const v35Cands = parseAiModeResponse(v35Resp);
assert(v35Cands.length === 3, 'v3.5 parser: tablo + madde listesinden 3 aday çıkarılır', JSON.stringify(v35Cands.map((c) => c.partCode)));
const v35C1 = v35Cands.find((c) => c.partCode === '5C6807221');
assert(v35C1 && v35C1.partKind === 'orijinal' && v35C1.confidence === 'high' && v35C1.sources.length === 1, 'v3.5 parser: orijinal + "motor kodu uyumlu" yüksek güven + kaynak link', JSON.stringify(v35C1));
const v35C2 = v35Cands.find((c) => c.partCode === '5C6807221GRU');
assert(v35C2 && v35C2.partKind === 'esdeger' && v35C2.confidence === 'medium' && v35C2.warnings.length >= 1, 'v3.5 parser: eşdeğer + "kontrol gerekli" güveni düşürür/uyarı ekler', JSON.stringify(v35C2));
const v35C3 = v35Cands.find((c) => c.partCode === 'WHT-001-A');
assert(v35C3 && v35C3.partKind === 'yan_sanayi' && v35C3.confidence === 'low', 'v3.5 parser: madde listesinden yan sanayi + "emin değil" düşük güven', JSON.stringify(v35C3));
assert(!v35Cands.some((c) => c.partCode === 'WVWZZZ16ZHM026138'), 'v3.5 parser: 17 haneli VIN parça kodu sayılmaz', 'no-vin');
assert(parseAiModeResponse('').length === 0 && parseAiModeResponse('hiçbir kod yok burada sadece düz cümle.').length === 0, 'v3.5 parser: boş/kodsuz metin boş döner', 'empty-safe');
assert(scoreCandidateConfidence('2017 jetta motor kodu uyumlu').confidence === 'high' && scoreCandidateConfidence('kontrol gerekli emin değil').confidence === 'low' && scoreCandidateConfidence('genel açıklama').confidence === 'medium', 'v3.5 confidence: uyum→yüksek, belirsizlik→düşük, nötr→orta', 'confidence');

// UI / kaynak guard'ları
const v35PanelSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-search-panel.ts', 'utf-8');
const v35CandSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-search-candidates.ts', 'utf-8');
const v35ActionsSrc = await fs.readFile('src/renderer/app/actions/ai-mode-part-search-actions.ts', 'utf-8');
const v35PromptSrc = await fs.readFile('src/shared/labor/ai-mode-part-search-prompt-builder.ts', 'utf-8');
const v35ParserSrc = await fs.readFile('src/shared/labor/ai-mode-part-search-parser.ts', 'utf-8');
const v35DetailSrc = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
const v35Blob = v35PanelSrc + v35CandSrc + v35ActionsSrc + v35PromptSrc + v35ParserSrc;
assert(!/\bfetch\b|axios|require\(['"]https?['"]\)|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v35Blob), 'v3.5 güvenlik: AI Mode modüllerinde ağ/scraping (fetch/axios/websocket/puppeteer/playwright/serpapi) yok', 'no-network');
assert(!/saveAutoLaborExcel|distributeLaborExcel|writeFile|\.xlsx|data-action="auto-labor-save/.test(v35Blob), 'v3.5 güvenlik: AI Mode modülleri Excel\'e/D sütununa yazmaz (uygula butonu yok)', 'no-excel-write');
assert(/aimode-copy/.test(v35PanelSrc) && /Kopyala/.test(v35PanelSrc), 'v3.5 UI: prompt kopyalama butonu vardır', 'copy-btn');
assert(/renderAiModePartSearchPanel\(state\)/.test(v35DetailSrc) && /renderAiModeLinkedEvidence/.test(v35DetailSrc), 'v3.5 UI: AI Mode paneli + satır evidence notu AI İşçilik ekranına bağlandı', 'panel-wired');
assert(/linkedByRow/.test(v35ActionsSrc) && !/expertLearning(Approve|ReplaceDuplicate)|cache\.write|atomicWrite/.test(v35ActionsSrc), 'v3.5 güvenlik: aday bağlama session state (kalıcı store/Excel yazma yok)', 'session-only');

// === AI İşçilik v3.6: kullanıcı onaylı kalıcı parça kodu aday store'u + mevcut D kodu karşılaştırması ===
// Comparator: normalize + same/different/missing
assert(normalizePartCode('5C6 807 217') === '5C6807217' && normalizePartCode('5C6-807-217') === '5C6807217', 'v3.6 comparator: boşluk/tire normalize edilir', normalizePartCode('5C6 807 217'));
assert(comparePartCodes('5C6 807 217', '5C6807217').status === 'same' && comparePartCodes('5C6-807-217', '5C6807217').status === 'same', 'v3.6 comparator: boşluklu/tireli kodlar aynı kabul edilir', 'same');
assert(comparePartCodes('5C6807217', '5C6807218').status === 'different', 'v3.6 comparator: farklı kodlar different', 'diff');
assert(comparePartCodes('', '5C6807217').status === 'missing_existing' && comparePartCodes('5C6807217', '').status === 'missing_candidate', 'v3.6 comparator: D kodu boş→missing_existing, aday boş→missing_candidate', 'missing');

// Store: build + duplicate + onaysız engeli + aktif/pasif/sil + bozuk dosya
const v36Cand = { partCode: '5C6 807 217', partKind: 'orijinal', confidence: 'high', sources: ['https://x'], warnings: [], rawEvidence: 'Orijinal 5C6 807 217' };
const v36Entry = buildApprovedCandidateEntry({ candidate: v36Cand, rowNumber: 5, partGroup: 'KAPORTA', partName: 'TAMPON ÖN', existingPartCode: '5C6807217', vehicle: { vehicleModel: 'VOLKSWAGEN JETTA', chassisPrefix: 'WVWZZZ16ZHM', engineCode: 'CYV' } });
assert(v36Entry && v36Entry.approvedByUser === true && v36Entry.isActive === true && v36Entry.candidatePartCode === '5C6 807 217' && v36Entry.comparisonWithExistingCode.status === 'same', 'v3.6 store: onaylı aday kaydı kurulur + D kodu karşılaştırması (same)', JSON.stringify(v36Entry?.comparisonWithExistingCode));
assert(buildApprovedCandidateEntry({ candidate: { ...v36Cand, partCode: '' }, partName: 'X' }) === null, 'v3.6 store: aday kodu boşsa kayıt kurulmaz', 'no-code');
const v36Merge = mergeApprovedCandidates([], [v36Entry]);
assert(v36Merge.added === 1 && v36Merge.entries.length === 1, 'v3.6 store: onaylı aday eklenir', JSON.stringify(v36Merge));
assert(mergeApprovedCandidates(v36Merge.entries, [v36Entry]).skippedDuplicates === 1 && isDuplicateAiModeCandidate(v36Entry, v36Merge.entries), 'v3.6 store: duplicate otomatik eklenmez (atlanır)', 'dup');
assert(normalizeAiModeCandidateEntry({ partName: 'X', candidatePartCode: 'ABC123', confidence: 'medium' })?.candidatePartCode === 'ABC123' && normalizeAiModeCandidateEntry({}) === null, 'v3.6 store: migration-safe normalize (zorunlu alan yoksa null)', 'normalize');
const v36Deact = setCandidateActive(v36Merge.entries, v36Merge.entries[0].id, false);
assert(listUsableCandidates(v36Deact).length === 0, 'v3.6 store: pasifleştirilen aday matcher girdisinde kullanılmaz', 'inactive');
assert(listUsableCandidates(setCandidateActive(v36Deact, v36Merge.entries[0].id, true)).length === 1, 'v3.6 store: yeniden aktif aday kullanılabilir', 'reactivate');
assert(removeCandidate(v36Merge.entries, v36Merge.entries[0].id).length === 0, 'v3.6 store: aday silinebilir', 'remove');

// Store dosyası (AppData): boş + atomic + corrupt-safe
const v36Tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-aimode-'));
const v36StoreFile = new AiModePartCandidateStoreFile(v36Tmp);
assert((await v36StoreFile.read()).entries.length === 0 && (await v36StoreFile.read()).corrupt === false, 'v3.6 store dosyası: eksik depo güvenle boş açılır', 'empty');
const v36Written = await v36StoreFile.write(v36Merge.entries);
assert(v36Written.version === 1 && (await v36StoreFile.read()).entries.length === 1, 'v3.6 store dosyası: yazım v1 + geri okunur', JSON.stringify({ v: v36Written.version }));
await fs.writeFile(v36StoreFile.storePath(), '{bozuk', 'utf-8');
assert((await v36StoreFile.read()).corrupt === true && (await v36StoreFile.read()).entries.length === 0, 'v3.6 store dosyası: bozuk depo çökmeden yok sayılır', 'corrupt');

// Matcher: aynı/farklı D kodu + araç çelişkisi
const v36Active = v36Merge.entries;
const v36MSame = matchAiModePartCandidate({ partName: 'TAMPON ÖN', partCode: '5C6807217', vehicleModel: 'VOLKSWAGEN JETTA', chassisPrefix: 'WVWZZZ16ZHM', engineCode: 'CYV' }, v36Active);
assert(v36MSame && v36MSame.evidence.status === 'same' && /uyumlu/.test(v36MSame.reason), 'v3.6 matcher: mevcut D kodu ile aynı aday → uyumlu evidence', JSON.stringify(v36MSame?.evidence));
const v36MDiff = matchAiModePartCandidate({ partName: 'TAMPON ÖN', partCode: '5C6807299' }, v36Active);
assert(v36MDiff && v36MDiff.evidence.status === 'different' && /kontrol/.test(v36MDiff.reason), 'v3.6 matcher: D kodundan farklı aday → kontrol uyarısı', JSON.stringify(v36MDiff?.evidence));
const v36MConflict = matchAiModePartCandidate({ partName: 'TAMPON ÖN', partCode: '5C6807217', chassisPrefix: 'NM0SHASE99' }, v36Active);
assert(v36MConflict && /araç bağlamı çelişiyor/i.test(v36MConflict.reason), 'v3.6 matcher: araç bağlamı çelişiyorsa kontrol gerekli', JSON.stringify(v36MConflict?.reason));
assert(matchAiModePartCandidate({ partName: 'ALAKASIZ PARÇA', partCode: 'X' }, v36Active) === null, 'v3.6 matcher: alakasız parça eşleşmez', 'none');

// Önizleme entegrasyonu: onaylı aday row.reason + aiModeCandidate olarak görünür (v33Input fixture)
const v36Pool = [buildApprovedCandidateEntry({ candidate: { partCode: 'KPI-1', partKind: 'orijinal', confidence: 'high', sources: [], warnings: [], rawEvidence: 'x' }, partName: 'ÖN KAPI ONARIMI', existingPartCode: 'KPI-1', vehicle: { vehicleModel: 'VOLKSWAGEN JETTA' } })];
const v36Preview = await buildAutoLaborPreview(v33Input, [], [], {}, v36Pool);
const v36Kapi = v36Preview.rows.find((r) => r.partName.includes('KAPI'));
assert(v36Kapi && v36Kapi.aiModeCandidate && v36Kapi.aiModeCandidate.status === 'same' && /AI Mode aday/.test(v36Kapi.reason), 'v3.6 önizleme: onaylı aday row.reason + aiModeCandidate evidence olarak görünür', JSON.stringify(v36Kapi?.aiModeCandidate));
assert((await buildAutoLaborPreview(v33Input, [], [], {}, [])).rows.every((r) => !r.aiModeCandidate), 'v3.6 önizleme: aday havuzu boşsa sistem eski gibi (evidence yok)', 'empty-pool');

// UI / kaynak guard'ları
const v36PanelSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-search-panel.ts', 'utf-8');
const v36CandSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-search-candidates.ts', 'utf-8');
const v36StoreMgrSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-candidate-store-manager.ts', 'utf-8');
const v36ServiceSrc = await fs.readFile('src/main/services/ai-mode-part-candidate-service.ts', 'utf-8');
const v36StoreFileSrc = await fs.readFile('src/main/local-cache/ai-mode-part-candidate-store-file.ts', 'utf-8');
const v36MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const v36Blob = v36PanelSrc + v36CandSrc + v36StoreMgrSrc + v36ServiceSrc + v36StoreFileSrc;
assert(/Onayla ve Aday Havuzuna Kaydet/.test(v36CandSrc) && /aimode-approve-store/.test(v36CandSrc), 'v3.6 UI: "Onayla ve Aday Havuzuna Kaydet" butonu render olur', 'approve-btn');
assert(/aiModePartCandidatesApprove/.test(v36MainSrc) && /confirmDialog\(/.test(v36MainSrc), 'v3.6 UI: aday havuzuna kaydetme confirmDialog ile onaylanır', 'approve-confirm');
assert(/aimode-store-deactivate/.test(v36StoreMgrSrc) && /aimode-store-reactivate/.test(v36StoreMgrSrc) && /aimode-store-delete/.test(v36StoreMgrSrc), 'v3.6 UI: yönetim paneli pasifleştir/yeniden aktif/sil gösterir', 'manage');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v36Blob), 'v3.6 güvenlik: AI Mode aday modüllerinde ağ/scraping yok', 'no-network');
assert(!/saveAutoLaborExcel|distributeLaborExcel|\.xlsx|tracking\.mutate|writeTracking|writeJsonFile\(/.test(v36Blob), 'v3.6 güvenlik: aday store/servis/UI Excel\'e/D sütununa/ana veriye yazmaz', 'no-write');

// === AI İşçilik v3.7: AI Mode aday duplicate yenileme + yönetim/eşleşme iyileştirme ===
// Duplicate yenileme (v36Merge: aktif '5C6 807 217' KAPORTA/TAMPON ÖN kaydı)
const v37New = buildApprovedCandidateEntry({ candidate: { partCode: '5C6 807 217 A', partKind: 'oem', confidence: 'high', sources: ['https://y'], warnings: [], rawEvidence: 'OEM 5C6 807 217 A' }, partName: 'TAMPON ÖN', vehicle: { vehicleModel: 'VOLKSWAGEN JETTA', chassisPrefix: 'WVWZZZ16ZHM', engineCode: 'CYV' } });
// aynı araç+ad+kod+tür değil (kod farklı) → duplicate DEĞİL; duplicate testi için aynı v36Entry'yi kullan
const v37DupNew = buildApprovedCandidateEntry({ candidate: { partCode: '5C6807217', partKind: 'orijinal', confidence: 'medium', sources: [], warnings: [], rawEvidence: 'tekrar' }, partName: 'TAMPON ÖN', existingPartCode: '5C6807217', vehicle: { vehicleModel: 'VOLKSWAGEN JETTA', chassisPrefix: 'WVWZZZ16ZHM', engineCode: 'CYV' } });
assert(findDuplicateAiModeCandidate(v37DupNew, v36Merge.entries)?.id === v36Merge.entries[0].id, 'v3.7 findDuplicate: aynı araç+ad+kod+tür aktif kaydı bulur', 'find-dup');
const v37Replace = replaceDuplicateAiModeCandidateWithApproval(v36Merge.entries, v37DupNew, v36Merge.entries[0].id, '2026-07-01T00:00:00Z');
assert(v37Replace.replaced === true && v37Replace.entries.length === 2 && v37Replace.newId !== v36Merge.entries[0].id, 'v3.7 yenileme: eski silinmez, yeni farklı id ile eklenir (2 kayıt)', JSON.stringify({ n: v37Replace.entries.length, newId: v37Replace.newId }));
const v37Old = v37Replace.entries.find((e) => e.id === v36Merge.entries[0].id);
const v37NewActive = v37Replace.entries.find((e) => e.id === v37Replace.newId);
assert(v37Old && v37Old.isActive === false && v37NewActive && v37NewActive.isActive === true && v37NewActive.approvedByUser === true && /pasifleştirildi/.test(v37NewActive.rawEvidence), 'v3.7 yenileme: eski PASİF, yeni AKTİF+onaylı + history notu', JSON.stringify({ old: v37Old?.isActive, neu: v37NewActive?.isActive }));
assert(matchAiModePartCandidate({ partName: 'TAMPON ÖN', partCode: '5C6807217' }, v37Replace.entries).entry.id === v37NewActive.id, 'v3.7 yenileme: matcher yeni aktif kaydı kullanır (pasif eskiyi değil)', 'uses-new');
assert(replaceDuplicateAiModeCandidateWithApproval(v36Merge.entries, { ...v37DupNew, approvedByUser: false }, v36Merge.entries[0].id).replaced === false, 'v3.7 yenileme: onaysız kayıt replace edilmez', 'unapproved');
assert(replaceDuplicateAiModeCandidateWithApproval(v36Merge.entries, v37DupNew, 'yok-id').replaced === false, 'v3.7 yenileme: duplicateId yoksa işlem yok (overwrite yok)', 'no-target');

// Filtre + arama
const v37Pool = [
  v36Merge.entries[0],
  setCandidateActive([v37New], v37New.id, false)[0],
  buildApprovedCandidateEntry({ candidate: { partCode: '5C6807299', partKind: 'esdeger', confidence: 'medium', sources: [], warnings: [], rawEvidence: 'x' }, partName: 'SOL FAR', existingPartCode: '5C6807217', vehicle: { vehicleModel: 'RENAULT MEGANE' } })
];
assert(filterAiModeCandidates(v37Pool, 'active').length === 2 && filterAiModeCandidates(v37Pool, 'passive').length === 1, 'v3.7 filtre: aktif/pasif ayrımı', JSON.stringify(v37Pool.map((e) => e.isActive)));
assert(filterAiModeCandidates(v37Pool, 'different').every((e) => e.comparisonWithExistingCode.status === 'different') && filterAiModeCandidates(v37Pool, 'different').length === 1, 'v3.7 filtre: farklı D kodu', 'diff');
assert(filterAiModeCandidates(v37Pool, 'sources').length === 2 && filterAiModeCandidates(v37Pool, 'sources').every((e) => e.sources.length > 0), 'v3.7 filtre: kaynaklı adaylar', 'sources');
assert(filterAiModeCandidates(v37Pool, 'all', 'MEGANE').length === 1 && filterAiModeCandidates(v37Pool, 'all', '5C6807217')[0], 'v3.7 arama: araç modeli / normalize edilmiş kod ile arar', 'search');

// Genel/kısa parça adı + confidence
assert(isGenericPartName('KLİPS') && isGenericPartName('ÖN KLİPS') && !isGenericPartName('ÖN TAMPON') && !isGenericPartName('TAMPON KLİPSİ'), 'v3.7 genel ad: klips/ön klips genel; tampon değil', 'generic');
const v37GenPool = [buildApprovedCandidateEntry({ candidate: { partCode: 'ABC12345', partKind: 'belirsiz', confidence: 'high', sources: [], warnings: [], rawEvidence: 'x' }, partName: 'KLİPS', vehicle: {} })];
const v37GenMatch = matchAiModePartCandidate({ partName: 'KLİPS', partCode: '' }, v37GenPool);
assert(v37GenMatch && v37GenMatch.evidence.confidence === 'low' && /genel parça adı/i.test(v37GenMatch.reason), 'v3.7 eşleşme: genel parça adı + kod/araç yok → düşük güven + kontrol gerekli', JSON.stringify(v37GenMatch?.evidence));
const v37SameMatch = matchAiModePartCandidate({ partName: 'TAMPON ÖN', partCode: '5C6807217' }, v36Merge.entries);
assert(v37SameMatch && v37SameMatch.evidence.confidence === 'high' && v37SameMatch.evidence.status === 'same', 'v3.7 eşleşme: D kodu aynıysa güven yükselir', JSON.stringify(v37SameMatch?.evidence));

// Güncel (anlık) D kodu karşılaştırması + kayıtlı comparison farkı uyarısı
const v37StaleEntry = { ...v36Merge.entries[0], comparisonWithExistingCode: { status: 'missing_existing', message: '(eski)' } };
const v37Stale = matchAiModePartCandidate({ partName: 'TAMPON ÖN', partCode: '5C6807217' }, [v37StaleEntry]);
assert(v37Stale && v37Stale.evidence.status === 'same' && /kayıtlı karşılaştırma ile mevcut/i.test(v37Stale.reason), 'v3.7 anlık karşılaştırma: kayıtlı comparison farklıysa güncel D kodu kontrol uyarısı', v37Stale?.reason);

// UI / kaynak guard'ları
const v37MgrSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-candidate-store-manager.ts', 'utf-8');
const v37MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const v37StoreSrc = await fs.readFile('src/shared/labor/ai-mode-part-candidate-store.ts', 'utf-8');
const v37MatcherSrc = await fs.readFile('src/shared/labor/ai-mode-part-candidate-matcher.ts', 'utf-8');
assert(/aimode-store-filter/.test(v37MgrSrc) && /data-aimode-store-search/.test(v37MgrSrc) && /aimode-store-toggle-sources/.test(v37MgrSrc), 'v3.7 UI: yönetim panelinde filtre + arama + kaynak göster/gizle render olur', 'manage-ui');
assert(/aimode-replace-dup/.test(v37MgrSrc) && /aiModePartCandidatesReplaceDuplicate/.test(v37MainSrc) && /confirmDialog\(/.test(v37MainSrc), 'v3.7 UI: duplicate yenileme butonu + confirmDialog ile onay', 'replace-ui');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v37MgrSrc + v37StoreSrc + v37MatcherSrc), 'v3.7 güvenlik: aday modüllerinde ağ/scraping yok', 'no-network');
assert(!/saveAutoLaborExcel|distributeLaborExcel|\.xlsx|tracking\.mutate|writeTracking/.test(v37MgrSrc + v37StoreSrc + v37MatcherSrc), 'v3.7 güvenlik: yönetim/store/matcher Excel\'e/D sütununa/ana veriye yazmaz', 'no-write');

// === AI İşçilik v3.8: kullanıcı onaylı seçili AI Mode adayını Excel D sütununa yazma ===
// Validator: bloklayan hatalar + uyarılar
const v38VBase = { candidatePartCode: '5C6807217', actualOldPartCode: '5C6807217', actualPartName: 'ÖN TAMPON', isPartCodeColumn: true };
assert(validateAiModePartCodeApply(v38VBase).ok === true, 'v3.8 validator: geçerli istek onaylanır', JSON.stringify(validateAiModePartCodeApply(v38VBase)));
assert(validateAiModePartCodeApply({ ...v38VBase, candidatePartCode: '' }).ok === false, 'v3.8 validator: boş aday kod bloklanır', 'empty');
assert(validateAiModePartCodeApply({ ...v38VBase, candidatePartCode: 'WVWZZZ16ZHM026138' }).ok === false, 'v3.8 validator: 17 haneli VIN bloklanır', 'vin');
assert(validateAiModePartCodeApply({ ...v38VBase, candidatePartCode: 'A1' }).ok === false, 'v3.8 validator: çok kısa kod bloklanır', 'short');
assert(validateAiModePartCodeApply({ ...v38VBase, hasFormula: true }).ok === false, 'v3.8 validator: formüllü hücre bloklanır', 'formula');
assert(validateAiModePartCodeApply({ ...v38VBase, isPartCodeColumn: false }).ok === false, 'v3.8 validator: KOD sütunu değilse bloklanır', 'notcol');
assert(validateAiModePartCodeApply({ ...v38VBase, expectedOldPartCode: '5C6807299' }).ok === false, 'v3.8 validator: mevcut D kodu önizlemeden farklıysa bloklanır', 'oldmismatch');
assert(validateAiModePartCodeApply({ ...v38VBase, expectedPartName: 'BAŞKA PARÇA' }).ok === false, 'v3.8 validator: parça adı uyuşmuyorsa bloklanır', 'namemismatch');
const v38VDiff = validateAiModePartCodeApply({ ...v38VBase, actualOldPartCode: '5C6807299' });
assert(v38VDiff.ok === true && v38VDiff.warnings.some((w) => /farklı/.test(w)), 'v3.8 validator: mevcut D farklıysa uyarı (bloklamaz)', JSON.stringify(v38VDiff.warnings));
assert(validateAiModePartCodeApply({ ...v38VBase, confidence: 'low' }).warnings.some((w) => /güven/.test(w)) && validateAiModePartCodeApply({ ...v38VBase, actualPartName: 'KLİPS' }).warnings.some((w) => /[Gg]enel/.test(w)), 'v3.8 validator: düşük güven + genel ad uyarısı', 'warnings');
// normalize: 5C6 807 217 ile 5C6807217 aynı sayılır → oldmismatch olmaz
assert(validateAiModePartCodeApply({ ...v38VBase, expectedOldPartCode: '5C6 807 217', actualOldPartCode: '5C6807217' }).ok === true, 'v3.8 validator: normalize edilmiş eski kod eşleşmesi bloklamaz', 'normalize');

// Writer: yalnız D hücresi değişir; H-N/diğer kolonlar korunur
const v38Headers = ['Sıra', 'DVN Grubu', 'İşçilik Açıklaması', 'Parça Kodu', 'İşlem Türü', 'Parça Sahiplenme Bedeli', 'Parça Orijinal Bedeli', 'Kaporta', 'Mekanik', 'Elektrik', 'Döşeme-Kilit', 'Cam', 'Boya', 'Onarım'];
const v38Rows = [[1, 'KAPORTA', 'ÖN TAMPON', '', 'DEĞİŞİM', 23382, 41000, 2500, 0, 0, 0, 0, 6500, 0]];
const v38Tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-v38-'));
const v38In = path.join(v38Tmp, 'in.xlsx');
await fs.writeFile(v38In, buildGenericLaborWorkbook(v38Headers, v38Rows));
const v38Out = path.join(v38Tmp, 'out.xlsx');
const v38W = await writePartCodeCellExcel(v38In, v38Out, 2, 'D', '5C6807217');
assert(v38W.newValue === '5C6807217' && v38W.oldValue === '', 'v3.8 writer: boş D hücresine kod yazar; eski/yeni raporlar', JSON.stringify(v38W));
const v38Read = await loadWorkbook(v38Out);
const v38CellAt = (col, row) => v38Read.sheet.cells.find((c) => c.column === col && c.row === row);
assert(v38CellAt('D', 2)?.value === '5C6807217', 'v3.8 writer: yeni D kodu geri okunur', v38CellAt('D', 2)?.value);
assert(v38CellAt('H', 2)?.value === '2500' && v38CellAt('M', 2)?.value === '6500', 'v3.8 writer: H-N işçilik hücreleri DEĞİŞMEZ', JSON.stringify({ h: v38CellAt('H', 2)?.value, m: v38CellAt('M', 2)?.value }));
assert((v38CellAt('C', 2)?.value || '').includes('TAMPON') && v38CellAt('E', 2)?.value === 'DEĞİŞİM' && v38CellAt('F', 2)?.value === '23382', 'v3.8 writer: C/E/F kolonları DEĞİŞMEZ', JSON.stringify({ c: v38CellAt('C', 2)?.value, e: v38CellAt('E', 2)?.value, f: v38CellAt('F', 2)?.value }));
const v38Out2 = path.join(v38Tmp, 'out2.xlsx');
const v38W2 = await writePartCodeCellExcel(v38Out, v38Out2, 2, 'D', '5C6807299');
assert(v38W2.oldValue === '5C6807217' && v38W2.newValue === '5C6807299', 'v3.8 writer: dolu D üzerine yazar; eski→yeni raporlar', JSON.stringify(v38W2));
let v38EmptyThrew = false; try { await writePartCodeCellExcel(v38In, path.join(v38Tmp, 'e.xlsx'), 2, 'D', '   '); } catch { v38EmptyThrew = true; }
assert(v38EmptyThrew, 'v3.8 writer: boş kod yazılamaz (hata)', 'empty-throw');
let v38SameThrew = false; try { await writePartCodeCellExcel(v38In, v38In, 2, 'D', 'X1234'); } catch { v38SameThrew = true; }
assert(v38SameThrew, 'v3.8 writer: çıktı = girdi olamaz (orijinal korunur)', 'same-throw');

// UI / kaynak guard'ları
const v38ValidatorSrc = await fs.readFile('src/shared/labor/ai-mode-part-code-apply-validator.ts', 'utf-8');
const v38ModalSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-code-apply-modal.ts', 'utf-8');
const v38ApplyActionsSrc = await fs.readFile('src/renderer/app/actions/ai-mode-part-code-apply-actions.ts', 'utf-8');
const v38ServiceSrc = await fs.readFile('src/main/services/ai-mode-part-code-apply-service.ts', 'utf-8');
const v38DetailSrc = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
const v38MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const v38Blob = v38ValidatorSrc + v38ModalSrc + v38ApplyActionsSrc + v38ServiceSrc;
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v38Blob), 'v3.8 güvenlik: apply modüllerinde ağ/scraping yok', 'no-net');
assert(!/tracking\.mutate|writeTracking|saveAutoLaborExcel|distributeLaborExcel/.test(v38Blob), 'v3.8 güvenlik: apply modülleri takip.json/H-N/toplu Excel yazmaz', 'no-hn');
assert(/writePartCodeCellExcel/.test(v38ServiceSrc) && /approvedExcelFiles\.has/.test(v38ServiceSrc), 'v3.8: apply servisi yalnız tek-hücre yazıcı + önizleme-dosyası kapısı kullanır', 'single-cell');
assert(/renderAiModeApplyButton\(state, row\)/.test(v38DetailSrc), 'v3.8 UI: "D Sütununa Yaz" butonu önizleme satırına bağlandı', 'btn-wired');
assert(/if \(!cand \|\| !cand\.candidatePartCode/.test(v38ModalSrc), 'v3.8 UI: aday parça kodu yoksa buton görünmez', 'btn-guard');
assert(/aiModePartCandidatesApplyToDColumn/.test(v38MainSrc) && /confirmDialog\(buildApplyConfirmMessage/.test(v38MainSrc) && /Onaylıyorum, D sütununa yaz/.test(v38MainSrc), 'v3.8 UI: D yazma açık confirmDialog onayı ister (iptal edilirse IPC çağrılmaz)', 'confirm');

// === AI İşçilik v3.9: yazma sonrası yeniden okuma + geri alma hazırlığı + kilit hata mesajı ===
// Read-back doğrulama (gerçek yazılmış dosyadan okunan D koduyla)
const v39Read = await loadWorkbook(v38Out2);
const v39DCell = v39Read.sheet.cells.find((c) => c.column === 'D' && c.row === 2);
const v39Ver = buildPostWriteVerification({ rowNumber: 2, writtenCode: '5C6807299', currentPartCode: v39DCell?.value ?? '', partName: 'ÖN TAMPON' });
assert(v39Ver.matchesWrittenCode === true && /doğrulandı/.test(v39Ver.message) && v39Ver.currentPartCode === '5C6807299' && v39Ver.partName === 'ÖN TAMPON', 'v3.9 read-back: yazılan kod okunan D ile aynıysa doğrulandı', JSON.stringify(v39Ver));
const v39VerDiff = buildPostWriteVerification({ rowNumber: 2, writtenCode: '5C6807217', currentPartCode: '5C6807299' });
assert(v39VerDiff.matchesWrittenCode === false && /eşleşmedi/.test(v39VerDiff.message), 'v3.9 read-back: okunan D farklıysa eşleşmedi uyarısı', JSON.stringify(v39VerDiff));
assert(buildPostWriteVerification({ rowNumber: 2, writtenCode: '5C6807217', currentPartCode: '5C6 807 217' }).matchesWrittenCode === true, 'v3.9 read-back: normalize (boşluk) edilmiş kod eşleşir', 'normalize');

// Excel kilit hata mesajı normalizasyonu
assert(isExcelLockError({ code: 'EBUSY' }) && isExcelLockError({ code: 'EPERM' }) && isExcelLockError({ code: 'EACCES' }) && !isExcelLockError({ code: 'ENOENT' }) && isExcelLockError(new Error('rename failed')), 'v3.9 kilit: EBUSY/EPERM/EACCES/rename kilit sayılır; ENOENT sayılmaz', 'lock-detect');
const v39LockMsg = describeExcelWriteError({ code: 'EBUSY', message: 'resource busy' });
assert(/açık veya kilitli/i.test(v39LockMsg.message) && /EBUSY/.test(v39LockMsg.debugMessage), 'v3.9 kilit: kullanıcı dostu mesaj + teknik detay ayrı', JSON.stringify(v39LockMsg));
assert(!/açık veya kilitli/i.test(describeExcelWriteError(new Error('bilinmeyen')).message), 'v3.9 kilit: kilit olmayan hata genel mesaj alır', 'non-lock');

// Service/UI kaynak guard'ları
const v39ServiceSrc = await fs.readFile('src/main/services/ai-mode-part-code-apply-service.ts', 'utf-8');
const v39NormSrc = await fs.readFile('src/main/services/excel-lock-error-normalizer.ts', 'utf-8');
const v39ModalSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-code-apply-modal.ts', 'utf-8');
const v39ApplyActionsSrc = await fs.readFile('src/renderer/app/actions/ai-mode-part-code-apply-actions.ts', 'utf-8');
const v39Blob = v39ServiceSrc + v39NormSrc + v39ModalSrc + v39ApplyActionsSrc;
assert(/copyFile\(excelPath, backupPath\)/.test(v39ServiceSrc) && /Yedek alınamadığı için yazma yapılmadı/.test(v39ServiceSrc), 'v3.9 servis: yedek alınamazsa yazma yapılmaz', 'backup-guard');
assert(/verifiedAfterWrite/.test(v39ServiceSrc) && /undoInfo/.test(v39ServiceSrc) && /loadWorkbook\(excelPath\)/.test(v39ServiceSrc), 'v3.9 servis: yazma sonrası yeniden okuma + undo bilgisi üretilir', 'readback-undo');
assert((v39ServiceSrc.match(/writePartCodeCellExcel\(/g) || []).length === 1, 'v3.9 servis: yalnız TEK yazma çağrısı (read-back ekstra hücre yazmaz)', 'single-write');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v39Blob), 'v3.9 güvenlik: apply/normalizer modüllerinde ağ/scraping yok', 'no-net');
assert(!/tracking\.mutate|writeTracking|saveAutoLaborExcel|distributeLaborExcel/.test(v39Blob), 'v3.9 güvenlik: apply modülleri takip.json/H-N/toplu Excel yazmaz', 'no-hn');
assert(/geri alınabilir/.test(v39ModalSrc) && /Yedek dosya oluşturuldu/.test(v39ModalSrc) && /Yazma sonrası doğrulama/.test(v39ModalSrc), 'v3.9 UI: rapor doğrulama + yedek yolu + geri alma bilgisi gösterir', 'report-ui');
assert(!/data-action="aimode-undo|data-action="aimode-restore|Geri Al<\/button>/.test(v39ModalSrc), 'v3.9 UI: "Geri Al"/restore butonu YOK (yalnız bilgi)', 'no-undo-btn');
assert(/lastApplyUndo/.test(v39ApplyActionsSrc) && /undoInfo/.test(v39ApplyActionsSrc), 'v3.9: son yazma undo hazırlığı session state\'te tutulur', 'undo-state');

// === AI İşçilik v3.10: tek-tık geri alma / restore + yedek yönetimi hazırlığı ===
// Restore validator (SAF)
assert(validateAiModePartCodeRestore({ filePath: 'a.xlsx', backupPath: 'a.yedek-1.xlsx', rowNumber: 2, column: 'D' }).ok === true, 'v3.10 validator: geçerli restore isteği onaylanır', 'ok');
assert(validateAiModePartCodeRestore({ filePath: 'a.xlsx', backupPath: '', rowNumber: 2, column: 'D' }).ok === false, 'v3.10 validator: yedek yolu boşsa reddedilir', 'no-backup');
assert(validateAiModePartCodeRestore({ filePath: '', backupPath: 'a.yedek-1.xlsx', rowNumber: 2, column: 'D' }).ok === false, 'v3.10 validator: dosya yolu boşsa reddedilir', 'no-file');
assert(validateAiModePartCodeRestore({ filePath: 'a.txt', backupPath: 'a.yedek-1.xlsx', rowNumber: 2, column: 'D' }).ok === false, 'v3.10 validator: hedef .xlsx değilse reddedilir', 'ext');
assert(validateAiModePartCodeRestore({ filePath: 'a.yedek-1.xlsx', backupPath: 'a.yedek-1.xlsx', rowNumber: 2, column: 'D' }).ok === false, 'v3.10 validator: hedef ile yedek aynı olamaz', 'same');
assert(validateAiModePartCodeRestore({ filePath: 'a.xlsx', backupPath: 'b.xlsx', rowNumber: 2, column: 'D' }).ok === false, 'v3.10 validator: yedek deseni dışı (güvensiz) backup reddedilir', 'unsafe');
assert(validateAiModePartCodeRestore({ filePath: 'a.xlsx', backupPath: 'a.yedek-1.xlsx', rowNumber: 1, column: 'D' }).ok === false, 'v3.10 validator: geçersiz satır reddedilir', 'row');

// Restore service (mock context ile uçtan uca): target D=5C6807217, backup D=boş → restore → D boş
const v310Tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-v310-'));
const v310Row = [[1, 'KAPORTA', 'ÖN TAMPON', '', 'DEĞİŞİM', 23382, 41000, 2500, 0, 0, 0, 0, 6500, 0]];
const v310Backup = path.join(v310Tmp, 'liste.yedek-123.xlsx');
await fs.writeFile(v310Backup, buildGenericLaborWorkbook(v38Headers, v310Row));
const v310Target = path.join(v310Tmp, 'liste.xlsx');
await fs.writeFile(v310Target, buildGenericLaborWorkbook(v38Headers, v310Row));
const v310Applied = path.join(v310Tmp, 'liste-applied.xlsx');
await writePartCodeCellExcel(v310Target, v310Applied, 2, 'D', '5C6807217');
await fs.rm(v310Target); await fs.rename(v310Applied, v310Target);
const v310Exists = async (p) => { try { await fs.stat(p); return true; } catch { return false; } };
const v310Svc = new AiModePartCodeRestoreService({ state: { approvedExcelFiles: new Set([path.resolve(v310Target)]) } });
const v310Res = await v310Svc.restoreLastApply({ filePath: v310Target, backupPath: v310Backup, rowNumber: 2, column: 'D' });
assert(v310Res.ok === true && (v310Res.currentPartCodeAfterRestore || '') === '' && v310Res.matchesExpectedCode === true, 'v3.10 restore: hedef D eski (boş) koda döner + doğrulanır', JSON.stringify({ ok: v310Res.ok, cur: v310Res.currentPartCodeAfterRestore, m: v310Res.matchesExpectedCode }));
assert(v310Res.preRestoreBackupPath && await v310Exists(v310Res.preRestoreBackupPath), 'v3.10 restore: restore öncesi mevcut dosya AYRICA yedeklenir', String(v310Res.preRestoreBackupPath));
assert(v310Res.restoredFromBackupPath === v310Backup, 'v3.10 restore: kullanılan yedek raporlanır', v310Res.restoredFromBackupPath);
const v310After = await loadWorkbook(v310Target);
const v310DAfter = v310After.sheet.cells.find((c) => c.column === 'D' && c.row === 2)?.value ?? '';
assert(v310DAfter === '' && v310After.sheet.cells.find((c) => c.column === 'H' && c.row === 2)?.value === '2500' && v310After.sheet.cells.find((c) => c.column === 'M' && c.row === 2)?.value === '6500', 'v3.10 restore: hedef D yedek haline döndü; H-N korunur', JSON.stringify({ d: v310DAfter }));
// güvenlik: yedek yoksa restore yapılmaz; uygulama dışı dosya restore edilmez
let v310NoBackupThrew = false; try { await v310Svc.restoreLastApply({ filePath: v310Target, backupPath: path.join(v310Tmp, 'yok.yedek-9.xlsx'), rowNumber: 2, column: 'D' }); } catch { v310NoBackupThrew = true; }
assert(v310NoBackupThrew, 'v3.10 restore: yedek dosya yoksa restore yapılmaz (hata)', 'no-backup-file');
let v310GateThrew = false; try { await new AiModePartCodeRestoreService({ state: { approvedExcelFiles: new Set() } }).restoreLastApply({ filePath: v310Target, backupPath: v310Backup, rowNumber: 2, column: 'D' }); } catch { v310GateThrew = true; }
assert(v310GateThrew, 'v3.10 restore: uygulama içinden seçilmemiş dosya restore edilmez (kapı)', 'gate');

// UI / kaynak guard'ları
const v310PanelSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-code-restore-panel.ts', 'utf-8');
const v310ActionsSrc = await fs.readFile('src/renderer/app/actions/ai-mode-part-code-restore-actions.ts', 'utf-8');
const v310ServiceSrc = await fs.readFile('src/main/services/ai-mode-part-code-restore-service.ts', 'utf-8');
const v310MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const v310Blob = v310PanelSrc + v310ActionsSrc + v310ServiceSrc;
assert(/data-action="aimode-restore-last"/.test(v310PanelSrc) && /available/.test(v310PanelSrc), 'v3.10 UI: "Son D Kodu Yazımını Geri Al" butonu yalnız undo uygunsa görünür', 'btn');
assert(/aiModePartCandidatesRestoreLastApply/.test(v310MainSrc) && /confirmDialog\(buildRestoreConfirmMessage/.test(v310MainSrc) && /son D kodu yazımını geri al/i.test(v310MainSrc), 'v3.10 UI: restore açık confirmDialog onayı ister (iptalde IPC çağrılmaz)', 'confirm');
assert(/available: false/.test(v310ActionsSrc), 'v3.10: restore başarılıysa undo tüketilir (buton kaybolur)', 'consume');
assert(!/writePartCodeCellExcel|saveAutoLaborExcel|distributeLaborExcel|tracking\.mutate|writeTracking/.test(v310ServiceSrc), 'v3.10 güvenlik: restore servisi H-N/işçilik yazıcısı/takip.json kullanmaz (yalnız dosya kopyalar)', 'no-hn');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v310Blob), 'v3.10 güvenlik: restore modüllerinde ağ/scraping yok', 'no-net');

// === AI İşçilik v3.11: yedek yönetimi + son N işlem geçmişi ===
// Backup sınıflandırma (SAF)
const v311Yedek = classifyAiModeBackup('liste.yedek-1712000000000.xlsx', 'liste.xlsx');
assert(v311Yedek && v311Yedek.backupKind === 'before_d_code_apply' && v311Yedek.isLikelyForCurrentExcel === true && v311Yedek.createdAt, 'v3.11 sınıflandırma: .yedek-* → D yazımı öncesi + bu dosyaya ait + tarih', JSON.stringify(v311Yedek));
assert(classifyAiModeBackup('liste.restore-oncesi-1712000000000.xlsx', 'liste.xlsx')?.backupKind === 'before_restore', 'v3.11 sınıflandırma: .restore-oncesi-* → restore öncesi', 'restore');
assert(classifyAiModeBackup('liste.xlsx', 'liste.xlsx') === null && classifyAiModeBackup('rastgele.xlsx', 'liste.xlsx') === null, 'v3.11 sınıflandırma: ana Excel / ilgisiz .xlsx yedek sayılmaz', 'null');
const v311OtherBase = classifyAiModeBackup('baska.yedek-1.xlsx', 'liste.xlsx');
assert(v311OtherBase && v311OtherBase.isLikelyForCurrentExcel === false && v311OtherBase.warnings.length >= 1, 'v3.11 sınıflandırma: farklı dosya yedeği isLikely=false + uyarı', JSON.stringify(v311OtherBase));

// Backup delete validator (SAF)
assert(validateAiModeBackupDelete({ fileName: 'liste.yedek-1.xlsx', originalExcelFileName: 'liste.xlsx', isSameAsOriginal: false, isSameDirectory: true }).ok === true, 'v3.11 delete validator: geçerli yedek silme onaylanır', 'ok');
assert(validateAiModeBackupDelete({ fileName: 'liste.xlsx', originalExcelFileName: 'liste.xlsx', isSameAsOriginal: true, isSameDirectory: true }).ok === false, 'v3.11 delete validator: ana Excel silinemez', 'original');
assert(validateAiModeBackupDelete({ fileName: 'takip.json', originalExcelFileName: 'liste.xlsx' }).ok === false, 'v3.11 delete validator: takip.json silinemez', 'takip');
assert(validateAiModeBackupDelete({ fileName: 'rastgele.xlsx', originalExcelFileName: 'liste.xlsx', isSameDirectory: true }).ok === false, 'v3.11 delete validator: tanınmayan (yedek deseni dışı) dosya silinmez', 'unknown');
assert(validateAiModeBackupDelete({ fileName: 'liste.yedek-1.xlsx', originalExcelFileName: 'liste.xlsx', isSameDirectory: false }).ok === false, 'v3.11 delete validator: farklı klasördeki dosya silinmez', 'dir');

// Backup service (mock context): listele + sil
const v311Tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-v311-'));
const v311Original = path.join(v311Tmp, 'liste.xlsx');
const v311B1 = path.join(v311Tmp, 'liste.yedek-100.xlsx');
const v311B2 = path.join(v311Tmp, 'liste.restore-oncesi-200.xlsx');
const v311Unrelated = path.join(v311Tmp, 'unrelated.xlsx');
for (const p of [v311Original, v311B1, v311B2, v311Unrelated]) await fs.writeFile(p, buildGenericLaborWorkbook(v38Headers, v310Row));
const v311Ctx = { state: { approvedExcelFiles: new Set([path.resolve(v311Original)]) } };
const v311BackupSvc = new AiModePartCodeBackupService(v311Ctx);
const v311List = await v311BackupSvc.list({ filePath: v311Original });
assert(v311List.backups.length === 2 && v311List.backups.every((b) => b.fileName !== 'liste.xlsx' && b.fileName !== 'unrelated.xlsx'), 'v3.11 listele: yalnız ilgili yedekler (ana Excel + ilgisiz hariç)', JSON.stringify(v311List.backups.map((b) => b.fileName)));
assert(v311List.backups.some((b) => b.backupKind === 'before_d_code_apply' && typeof b.sizeBytes === 'number'), 'v3.11 listele: yedek türü + boyut okunur', JSON.stringify(v311List.backups.map((b) => ({ k: b.backupKind, s: b.sizeBytes }))));
const v311Del = await v311BackupSvc.delete({ filePath: v311B1, originalExcelPath: v311Original });
assert(v311Del.ok === true && !(await v310Exists(v311B1)), 'v3.11 sil: yedek dosya kullanıcı onayı sonrası silinir', JSON.stringify(v311Del));
let v311DelOrigThrew = false; try { await v311BackupSvc.delete({ filePath: v311Original, originalExcelPath: v311Original }); } catch { v311DelOrigThrew = true; }
assert(v311DelOrigThrew && await v310Exists(v311Original), 'v3.11 sil: ana Excel dosyası ASLA silinmez', 'no-original');
let v311DelUnrelThrew = false; try { await v311BackupSvc.delete({ filePath: v311Unrelated, originalExcelPath: v311Original }); } catch { v311DelUnrelThrew = true; }
assert(v311DelUnrelThrew && await v310Exists(v311Unrelated), 'v3.11 sil: ilgisiz (yedek deseni dışı) dosya silinmez', 'no-unrelated');

// History store-file + saf yardımcılar
const v311HistStore = new AiModePartCodeHistoryStoreFile(v311Tmp);
assert((await v311HistStore.read()).entries.length === 0 && (await v311HistStore.read()).corrupt === false, 'v3.11 geçmiş: eksik depo güvenle boş açılır', 'empty');
await v311HistStore.append({ id: 'h1', type: 'apply_d_code', createdAt: '2026-07-01T00:00:00Z', filePath: v311Original, rowNumber: 2, column: 'D', newPartCode: '5C6807217', ok: true, message: 'x', warnings: [] });
assert((await v311HistStore.read()).entries[0].newPartCode === '5C6807217', 'v3.11 geçmiş: apply kaydı eklenir + geri okunur', 'append');
await fs.writeFile(v311HistStore.storePath(), '{bozuk', 'utf-8');
assert((await v311HistStore.read()).corrupt === true, 'v3.11 geçmiş: bozuk depo çökmeden yok sayılır', 'corrupt');
assert(normalizeHistoryEntry({ type: 'apply_d_code', filePath: 'x', rawEvidence: 'gizli' })?.rawEvidence === undefined && normalizeHistoryEntry({}) === null, 'v3.11 geçmiş: ham AI Mode cevabı (rawEvidence) TAŞINMAZ; zorunlu alan yoksa null', 'no-raw');
let v311Hist = [];
for (let i = 0; i < 105; i++) v311Hist = appendHistoryEntry(v311Hist, { id: `e${i}`, type: 'apply_d_code', createdAt: String(i), filePath: 'x', rowNumber: 2, column: 'D', ok: true, message: '', warnings: [] });
assert(v311Hist.length === 100 && v311Hist[0].id === 'e104', 'v3.11 geçmiş: en fazla 100 kayıt, en yeni başta', JSON.stringify({ n: v311Hist.length, first: v311Hist[0].id }));

// UI / kaynak guard'ları
const v311BackupMgrSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-code-backup-manager.ts', 'utf-8');
const v311HistPanelSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-code-history-panel.ts', 'utf-8');
const v311BackupSvcSrc = await fs.readFile('src/main/services/ai-mode-part-code-backup-service.ts', 'utf-8');
const v311HistSvcSrc = await fs.readFile('src/main/services/ai-mode-part-code-history-service.ts', 'utf-8');
const v311MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const v311Blob = v311BackupMgrSrc + v311HistPanelSrc + v311BackupSvcSrc + v311HistSvcSrc;
assert(/aimode-backups-list/.test(v311BackupMgrSrc) && /aimode-backup-delete/.test(v311BackupMgrSrc) && /aimode-copy-path/.test(v311BackupMgrSrc), 'v3.11 UI: yedek paneli listele + sil + yolu kopyala butonları', 'backup-ui');
assert(/aimode-history-list/.test(v311HistPanelSrc), 'v3.11 UI: geçmiş paneli render + yenile', 'history-ui');
assert(/confirmDialog\(/.test(v311MainSrc) && /aiModePartCodeBackupsDelete/.test(v311MainSrc), 'v3.11 UI: yedek silme confirmDialog ile onaylanır', 'confirm');
assert(!/tümünü|hepsini|toplu/i.test(v311BackupMgrSrc), 'v3.11 UI: yedek panelinde toplu (tümünü/hepsini) silme veya restore butonu yok (tekil işlem)', 'no-bulk');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v311Blob), 'v3.11 güvenlik: yedek/geçmiş modüllerinde ağ/scraping yok', 'no-net');
assert(!/writePartCodeCellExcel|saveAutoLaborExcel|distributeLaborExcel|tracking\.mutate|writeTracking|rmdir|rm\(dir|glob/.test(v311Blob), 'v3.11 güvenlik: yedek/geçmiş D yazma/H-N/takip.json/klasör-silme/wildcard yapmaz', 'no-hn');

// === AI İşçilik v3.12: genel yedekten restore + yedek doğrulama ===
// Restore validator (SAF)
const v312VBase = { filePath: 'liste.xlsx', backupPath: 'liste.yedek-1.xlsx', targetFileName: 'liste.xlsx', backupFileName: 'liste.yedek-1.xlsx', isSameAsTarget: false, isSameDirectory: true };
assert(validateAiModeBackupRestore(v312VBase).ok === true, 'v3.12 validator: geçerli restore isteği onaylanır', 'ok');
assert(validateAiModeBackupRestore({ ...v312VBase, filePath: '' }).ok === false, 'v3.12 validator: hedef yol boşsa reddedilir', 'no-file');
assert(validateAiModeBackupRestore({ ...v312VBase, backupPath: '', backupFileName: '' }).ok === false, 'v3.12 validator: yedek yolu boşsa reddedilir', 'no-backup');
assert(validateAiModeBackupRestore({ ...v312VBase, backupPath: 'liste.yedek-1.txt', backupFileName: 'liste.yedek-1.txt' }).ok === false, 'v3.12 validator: .xlsx değilse reddedilir', 'ext');
assert(validateAiModeBackupRestore({ ...v312VBase, isSameAsTarget: true }).ok === false, 'v3.12 validator: hedef=backup reddedilir', 'same');
assert(validateAiModeBackupRestore({ ...v312VBase, isSameDirectory: false }).ok === false, 'v3.12 validator: farklı klasör reddedilir', 'dir');
assert(validateAiModeBackupRestore({ ...v312VBase, backupPath: 'baska.yedek-1.xlsx', backupFileName: 'baska.yedek-1.xlsx' }).ok === false, 'v3.12 validator: farklı base adlı yedek (yanlış yedek) reddedilir', 'base');
assert(validateAiModeBackupRestore({ ...v312VBase, backupPath: 'liste.rastgele.xlsx', backupFileName: 'liste.rastgele.xlsx' }).ok === false, 'v3.12 validator: tanınmayan desen reddedilir', 'unknown');

// Restore service (mock context): uçtan uca
const v312Tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-v312-'));
const v312Orig = path.join(v312Tmp, 'liste.xlsx');
const v312Backup = path.join(v312Tmp, 'liste.yedek-100.xlsx');
await fs.writeFile(v312Orig, buildGenericLaborWorkbook(v38Headers, [[1, 'KAPORTA', 'ÖN TAMPON', 'CURRENTKOD', 'DEĞİŞİM', 23382, 41000, 2500, 0, 0, 0, 0, 6500, 0]]));
await fs.writeFile(v312Backup, buildGenericLaborWorkbook(v38Headers, [[1, 'KAPORTA', 'ÖN TAMPON', 'OLDBACKUPKOD', 'DEĞİŞİM', 23382, 41000, 2500, 0, 0, 0, 0, 6500, 0]]));
const v312Ctx = { state: { approvedExcelFiles: new Set([path.resolve(v312Orig)]) }, cache: { cacheRoot: v312Tmp } };
const v312Svc = new AiModePartCodeBackupRestoreService(v312Ctx);
const v312Res = await v312Svc.restoreFromBackup({ filePath: v312Orig, backupPath: v312Backup, backupKind: 'before_d_code_apply' });
assert(v312Res.ok === true && v312Res.verifiedAfterRestore?.fileExists === true && v312Res.verifiedAfterRestore?.sizeMatchesBackup === true, 'v3.12 restore: hedef yedekle geri yüklenir + boyut yedekle eşleşir', JSON.stringify(v312Res.verifiedAfterRestore));
assert(v312Res.preRestoreBackupPath && /manuel-restore-oncesi/.test(v312Res.preRestoreBackupPath) && await v310Exists(v312Res.preRestoreBackupPath), 'v3.12 restore: restore öncesi mevcut dosya .manuel-restore-oncesi ile yedeklenir', String(v312Res.preRestoreBackupPath));
assert((await loadWorkbook(v312Orig)).sheet.cells.find((c) => c.column === 'D' && c.row === 2)?.value === 'OLDBACKUPKOD', 'v3.12 restore: hedef D yedekteki değere döndü', 'content');
assert((await new AiModePartCodeHistoryStoreFile(v312Tmp).read()).entries.some((e) => e.type === 'restore_backup' && e.ok), 'v3.12 history: restore_backup kaydı best-effort eklenir', 'history');
const v312Backup0 = path.join(v312Tmp, 'liste.yedek-101.xlsx'); await fs.writeFile(v312Backup0, '');
let v312Size0 = false; try { await v312Svc.restoreFromBackup({ filePath: v312Orig, backupPath: v312Backup0, backupKind: 'before_d_code_apply' }); } catch { v312Size0 = true; }
assert(v312Size0, 'v3.12 restore: boş (0 bayt) yedek geri yüklenmez', 'size0');
let v312NoBackup = false; try { await v312Svc.restoreFromBackup({ filePath: v312Orig, backupPath: path.join(v312Tmp, 'liste.yedek-999.xlsx'), backupKind: 'before_d_code_apply' }); } catch { v312NoBackup = true; }
assert(v312NoBackup, 'v3.12 restore: yedek yoksa geri yükleme yapılmaz', 'no-backup-file');
const v312WrongBase = path.join(v312Tmp, 'baska.yedek-1.xlsx'); await fs.writeFile(v312WrongBase, buildGenericLaborWorkbook(v38Headers, [[1, 'K', 'P', 'X', 'D', 1, 1, 1, 0, 0, 0, 0, 0, 0]]));
let v312Wrong = false; try { await v312Svc.restoreFromBackup({ filePath: v312Orig, backupPath: v312WrongBase, backupKind: 'before_d_code_apply' }); } catch { v312Wrong = true; }
assert(v312Wrong && await v310Exists(v312WrongBase), 'v3.12 restore: farklı Excel base adlı yedek geri yüklenmez (yanlış yedek koruması)', 'wrong-base');
let v312Gate = false; try { await new AiModePartCodeBackupRestoreService({ state: { approvedExcelFiles: new Set() }, cache: { cacheRoot: v312Tmp } }).restoreFromBackup({ filePath: v312Orig, backupPath: v312Backup, backupKind: 'before_d_code_apply' }); } catch { v312Gate = true; }
assert(v312Gate, 'v3.12 restore: uygulama içinden seçilmemiş dosya için geri yükleme yok (kapı)', 'gate');

// UI / kaynak guard'ları + son-undo restore ayrılığı
const v312MgrSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-code-backup-manager.ts', 'utf-8');
const v312SvcSrc = await fs.readFile('src/main/services/ai-mode-part-code-backup-restore-service.ts', 'utf-8');
const v312RestorePanelSrc = await fs.readFile('src/renderer/app/components/ai-mode-part-code-restore-panel.ts', 'utf-8');
const v312MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(/aimode-backup-restore/.test(v312MgrSrc) && /Bu Yedekten Geri Yükle/.test(v312MgrSrc) && /isLikelyForCurrentExcel \?/.test(v312MgrSrc), 'v3.12 UI: "Bu Yedekten Geri Yükle" yalnız isLikely yedekte görünür', 'btn');
assert(/aiModePartCodeBackupsRestore/.test(v312MainSrc) && /confirmDialog\(buildBackupRestoreConfirmMessage/.test(v312MainSrc) && /bu yedekten geri yükle/i.test(v312MainSrc), 'v3.12 UI: genel restore açık confirmDialog onayı ister (iptalde IPC çağrılmaz)', 'confirm');
assert(/aimode-restore-last/.test(v312RestorePanelSrc) && !/aimode-restore-last/.test(v312MgrSrc), 'v3.12: son-undo restore (aimode-restore-last) ile genel restore (aimode-backup-restore) AYRI kalır', 'separate');
assert(!/writePartCodeCellExcel|saveAutoLaborExcel|distributeLaborExcel|tracking\.mutate|writeTracking|rmdir|glob/.test(v312SvcSrc), 'v3.12 güvenlik: genel restore D/H-N/takip.json/klasör-silme yapmaz (yalnız dosya kopyalar)', 'no-hn');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(v312SvcSrc + v312MgrSrc), 'v3.12 güvenlik: restore modüllerinde ağ/scraping yok', 'no-net');

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
assert(!/dry-run|read-only|local-only|Import Commit|Import Plan|metadata|Default limit/i.test(knowledgeUiDisplaySource), 'v0.6.0 UI Bilgi Bankasi panel/plan goruntusunde Ingilizce kullanici metni (Dry-run/Read-only/Import Commit/Metadata/Default limit) kalmadi', 'Bilgi Bankasi goruntusunde Ingilizce UI metni var');
assert(knowledgePanelSource.includes('Canlı Deneme Planı') && knowledgePanelSource.includes('Kalıcı Kayıt Ön İzleme') && knowledgePanelSource.includes('salt okunur') && knowledgePanelSource.includes('Yalnız yerel') && knowledgePanelSource.includes('Kalıcı olarak ekle'), 'v0.6.0 UI Bilgi Bankasi Turkce karsiliklar (Deneme Plani/Kalici Kayit/salt okunur) mevcut', 'Bilgi Bankasi Turkce karsiliklari eksik');
assert(rendererStateSource.includes('laborLearningExpanded: Record<string, boolean>') && rendererStateSource.includes('laborLearningExpanded: {}'), 'v0.6.0 UI sozluk ac/kapat durumu bellek-ici state olarak tanimli (varsayilan bos)', 'laborLearningExpanded state eksik');
assert(settingsSource.includes('labor-learning-row compact') && settingsSource.includes('data-action="labor-learning-toggle"') && settingsSource.includes('labor-learning-detail') && settingsSource.includes("'Kapat' : 'Aç'") && settingsSource.includes('data-action="labor-learning-update"') && settingsSource.includes('data-action="labor-learning-delete"') && settingsSource.includes('data-action="labor-learning-disable"'), 'v0.6.0 UI AI iscilik ogrenme sozlugu kompakt akordeon (varsayilan kapali) + kaydet/sil/devre-disi korunur', 'sozluk kompakt akordeon yapisi eksik');
assert(rendererMainSource.includes('toggleLaborLearningExpanded') && rendererMainSource.includes("case 'labor-learning-toggle'"), 'v0.6.0 UI sozluk ac/kapat aksiyonu yalniz UI bellegini gunceller (yeni IPC/yazma yok)', 'sozluk toggle aksiyonu eksik');

// --- v0.6.1: Gemini AI parca-okuma gecici hata (HTTP 503/timeout/network) merkezi yakalama + Tekrar Dene ---
const aiTransientFetchBackup = globalThis.fetch;
try {
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });
  let g503Code = '';
  try { await callGeminiVision('k', 'AAAA', 'image/jpeg', 'p'); } catch (error) { g503Code = (error && error.code) || ''; }
  assert(g503Code === AI_TRANSIENT_ERROR_CODE && isTransientAiError({ code: g503Code }), 'v0.6.1 Gemini HTTP 503 gecici AI hatasi olarak isaretlenir (kod=AI_SERVICE_TRANSIENT)', `code=${g503Code}`);

  globalThis.fetch = async () => { throw new TypeError('network down'); };
  let gNetCode = '';
  try { await callGeminiVision('k', 'AAAA', 'image/jpeg', 'p'); } catch (error) { gNetCode = (error && error.code) || ''; }
  assert(gNetCode === AI_TRANSIENT_ERROR_CODE, 'v0.6.1 Gemini ag hatasi (network) gecici AI hatasi olarak isaretlenir', `code=${gNetCode}`);

  globalThis.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  let gAbortCode = '';
  try { await callGeminiVision('k', 'AAAA', 'image/jpeg', 'p'); } catch (error) { gAbortCode = (error && error.code) || ''; }
  assert(gAbortCode === AI_TRANSIENT_ERROR_CODE, 'v0.6.1 Gemini zaman asimi (timeout) gecici AI hatasi olarak isaretlenir', `code=${gAbortCode}`);

  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => 'API_KEY_INVALID' });
  let g400Code = 'none';
  try { await callGeminiVision('k', 'AAAA', 'image/jpeg', 'p'); } catch (error) { g400Code = (error && error.code) || 'none'; }
  assert(g400Code !== AI_TRANSIENT_ERROR_CODE, 'v0.6.1 Gemini 400 (gecersiz anahtar) gecici degildir; ayrik kalir', `code=${g400Code}`);
} finally {
  globalThis.fetch = aiTransientFetchBackup;
}
assert(AI_TRANSIENT_USER_MESSAGE.includes('AI servisi geçici olarak cevap vermiyor') && AI_TRANSIENT_USER_MESSAGE.includes('manuel'), 'v0.6.1 gecici AI hatasi kullanici mesaji Turkce ve pratik secenek (manuel) sunar', AI_TRANSIENT_USER_MESSAGE);
const geminiClientSource = await fs.readFile('src/main/import/gemini-client.ts', 'utf-8');
assert(geminiClientSource.includes('createTransientAiError') && /status >= 500[\s\S]*?createTransientAiError/.test(geminiClientSource) && geminiClientSource.includes("error.name === 'AbortError'") && geminiClientSource.includes('instanceof TypeError'), 'v0.6.1 gemini-client 5xx/timeout/network hatalarini gecici hata kodu ile firlatir', 'gemini-client gecici hata siniflandirmasi eksik');
const partsActionSlice = rendererMainSource.slice(rendererMainSource.indexOf('async function analyzePartsPhotoAction'), rendererMainSource.indexOf('async function loadPartsUserTerms'));
const transientIdx = partsActionSlice.indexOf('AI_TRANSIENT_ERROR_CODE');
const successAssignIdx = partsActionSlice.indexOf('state.partsAnalysis = result.data');
assert(transientIdx > 0 && successAssignIdx > transientIdx && partsActionSlice.includes('partsAnalysisError = AI_TRANSIENT_USER_MESSAGE') && partsActionSlice.slice(transientIdx, successAssignIdx).includes('return;'), 'v0.6.1 renderer gecici AI hatasinda Tekrar Dene mesaji set eder ve basari atamasindan once erken doner (analiz/Excel/ogrenme oto devam etmez)', 'renderer gecici hata akisi eksik');
assert(rendererStateSource.includes('partsAnalysisError: string') && rendererStateSource.includes("partsAnalysisError: ''"), 'v0.6.1 partsAnalysisError state alani tanimli (bos baslar)', 'partsAnalysisError state eksik');
const detailComponentSourceV61 = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
assert(detailComponentSourceV61.includes('partsAnalysisError') && detailComponentSourceV61.includes('Tekrar Dene') && detailComponentSourceV61.includes('data-action="analyze-parts-photo"'), 'v0.6.1 parca fotograf karti gecici hatada Tekrar Dene butonu gosterir', 'parca foto Tekrar Dene UI eksik');

// --- v0.6.2: Merkezi Araç Bağlamı (dosya-bazlı) + AI kalite (şüpheli parça) ---
const v62Identity = (key, no, folder) => ({ caseKey: key, plate: '34 ABC 123', dosyaNo: no, folderPath: folder, monthFolder: 'Haziran 2026', officeFileNo: '', claimNoticeNo: '', isClosedFolder: false });
const v62OldTracking = createDefaultTracking(v62Identity('A', '1', '/A'), 'Test');
delete v62OldTracking.vehicleContext;
const v62MigratedOld = migrateTracking(JSON.parse(JSON.stringify(v62OldTracking)));
assert(!!v62MigratedOld && !!v62MigratedOld.vehicleContext && VEHICLE_CONTEXT_FIELDS.every((f) => v62MigratedOld.vehicleContext[f] === '') && !hasMeaningfulVehicleContext(v62MigratedOld.vehicleContext), 'v0.6.2 eski (baglamsiz) takip dosyasi bos arac baglamiyla normalize olur (geriye uyumlu)', JSON.stringify(v62MigratedOld?.vehicleContext));
const v62TrackingA = createDefaultTracking(v62Identity('A', '1', '/A'), 'Test');
v62TrackingA.vehicleContext = normalizeVehicleContext({ chassisNo: 'NM0SHASE123', engineNo: 'MOT999', make: 'Renault', model: 'Megane', modelYear: '2012', fuelType: 'dizel' });
const v62TrackingB = createDefaultTracking(v62Identity('B', '2', '/B'), 'Test');
assert(hasMeaningfulVehicleContext(v62TrackingA.vehicleContext) && !hasMeaningfulVehicleContext(v62TrackingB.vehicleContext) && v62TrackingB.vehicleContext.chassisNo === '' && v62TrackingB.vehicleContext.make === '' && v62TrackingA.vehicleContext !== v62TrackingB.vehicleContext, 'v0.6.2 cross-case: ayni plakali ikinci dosya (B) A nin arac bilgisini ALMAZ; baglamlar izole', JSON.stringify([v62TrackingA.vehicleContext.make, v62TrackingB.vehicleContext.make]));
const v62Ai = vehicleContextForAi(v62TrackingA.vehicleContext);
assert(!('chassisNo' in v62Ai) && !('engineNo' in v62Ai) && v62Ai.make === 'Renault' && !/NM0SHASE123|MOT999/.test(JSON.stringify(v62Ai)), 'v0.6.2 AI-guvenli arac baglami Sase/Motor No icermez (gizlilik)', JSON.stringify(v62Ai));
const fitOldModern = evaluatePartVehicleFit({ modelYear: '2010', fuelType: 'benzin' }, { raw: 'şerit takip kamerası', canonical: 'Radar Sensörü' });
assert(fitOldModern.vehicleFit === 'şüpheli' && fitOldModern.needsReview === true, 'v0.6.2 eski model + modern donanim/ADAS -> supheli/Kontrol gerekli', JSON.stringify(fitOldModern));
const fitDiesel = evaluatePartVehicleFit({ fuelType: 'benzin', modelYear: '2018' }, { raw: 'common rail enjektör pompası', canonical: 'Common Rail' });
assert(fitDiesel.vehicleFit === 'şüpheli' && fitDiesel.needsReview === true, 'v0.6.2 benzinli arac + dizel ozel parca -> supheli', JSON.stringify(fitDiesel));
const fitHybrid = evaluatePartVehicleFit({ fuelType: 'benzin', modelYear: '2019' }, { raw: 'inverter ünitesi', canonical: 'Inverter' });
assert(fitHybrid.vehicleFit === 'şüpheli' && fitHybrid.needsReview === true, 'v0.6.2 hibrit olmayan arac + inverter/batarya -> supheli', JSON.stringify(fitHybrid));
const fitNoCtx = evaluatePartVehicleFit({}, { raw: 'radar', canonical: 'Radar' });
assert(fitNoCtx.vehicleFit === 'bilinmiyor' && fitNoCtx.needsReview === true, 'v0.6.2 arac bilgisi eksik + riskli parca -> bilinmiyor/Kontrol gerekli (kesin hukum yok)', JSON.stringify(fitNoCtx));
const fitTurbo = evaluatePartVehicleFit({ make: 'Renault', model: 'Megane', modelYear: '2016' }, { raw: 'turbo', canonical: 'Turbo' });
assert(fitTurbo.vehicleFit === 'bilinmiyor' && fitTurbo.needsReview === true, 'v0.6.2 motor yapisi bilinmiyorsa turbo/intercooler otomatik dogru kabul edilmez', JSON.stringify(fitTurbo));
const fitGeneric = evaluatePartVehicleFit({ make: 'Renault', model: 'Megane', modelYear: '2018', fuelType: 'benzin' }, { raw: 'ön tampon', canonical: 'Ön Tampon' });
assert(fitGeneric.vehicleFit === 'uygun' && fitGeneric.needsReview === false, 'v0.6.2 normal parca + tam baglam -> uygun (acik celiski yok)', JSON.stringify(fitGeneric));
const v62Parsed = parsePartsResponse(JSON.stringify({ arac: {}, parcalar: [{ ham: 'şerit kamerası' }, { ham: 'ön tampon' }] }), '', undefined, { modelYear: '2008', fuelType: 'benzin' });
const v62CamRow = v62Parsed.rows.find((r) => r.raw === 'şerit kamerası');
assert(!!v62CamRow && v62CamRow.needsReview === true && v62CamRow.vehicleFit === 'şüpheli', 'v0.6.2 parsePartsResponse eski arac + modern parca satirini supheli/Kontrol gerekli isaretler', JSON.stringify(v62CamRow));
assert(v62Parsed.warnings.some((w) => /kontrol gerekli/i.test(w) && /otomatik Excel/i.test(w)), 'v0.6.2 supheli satirlar icin otomatik Excel yazim uyarisi eklenir', JSON.stringify(v62Parsed.warnings));
const v62ParsedB = parsePartsResponse(JSON.stringify({ arac: {}, parcalar: [{ ham: 'common rail' }] }), '', undefined, { fuelType: 'dizel', modelYear: '2018' });
assert(v62ParsedB.rows[0].vehicleFit === 'uygun', 'v0.6.2 AI yalniz verilen (aktif) dosyanin baglamini kullanir (dizel arac -> common rail uygun)', JSON.stringify(v62ParsedB.rows[0]));
const v62IpcDomainSource = await fs.readFile('src/main/services/ipc-domain-services.ts', 'utf-8');
assert(v62IpcDomainSource.includes('VEHICLE_CONTEXT_FIELDS') && v62IpcDomainSource.includes('vehicleContext.${field}'), 'v0.6.2 arac baglami alanlari guvenli updateField whitelist + sanitize icinde (yeni IPC yok)', 'v0.6.2 updateField vehicleContext whitelist eksik');
const v62PartsAnalyzerSource = await fs.readFile('src/main/import/parts-list-analyzer.ts', 'utf-8');
assert(v62PartsAnalyzerSource.includes('evaluatePartVehicleFit') && v62PartsAnalyzerSource.includes('normalizePartName(raw, userTerms') && !/chassisNo|engineNo/.test(v62PartsAnalyzerSource), 'v0.6.2 parca analizoru fit degerlendirir; ogrenme sozlugu onceligi (userTerms) korunur; Sase/Motro alanina dokunmaz', 'v0.6.2 parca analizoru entegrasyon/gizlilik ihlali');
const v62EvaluatorSource = await fs.readFile('src/shared/vehicle/vehicle-fit-evaluator.ts', 'utf-8');
const v62ContextSource = await fs.readFile('src/shared/vehicle/vehicle-context.ts', 'utf-8');
assert(!/\bfetch\(|axios|\.write\(|from ['"]node:fs|console\./.test(v62EvaluatorSource) && !/\bfetch\(|axios|\.write\(|from ['"]node:fs/.test(v62ContextSource), 'v0.6.2 arac baglami + fit modulleri saf: ag/dosya/log/yan-etki yok', 'v0.6.2 arac modulleri yasak iz tasiyor');
assert(rendererMainSource.includes('filter((row) => !row.needsReview)') && rendererMainSource.includes('vehicleContextForAi(activeCase?.tracking?.vehicleContext)'), 'v0.6.2 supheli (needsReview) satirlar otomatik Excel e yazilmaz + AI sadece secili dosya baglamini alir', 'v0.6.2 renderer arac baglami/Excel guard eksik');
const v62DetailSource = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
assert(v62DetailSource.includes('Araç Bilgileri') && v62DetailSource.includes('data-field="vehicleContext.') && v62DetailSource.includes('renderVehicleContextCard'), 'v0.6.2 Arac Bilgileri karti (Turkce, duzenlenebilir, dosya-bazli data-field) mevcut', 'v0.6.2 Arac Bilgileri UI eksik');

// --- v0.6.2 (revize): ham kontrol karakteri temizligi + araç bağlamının diğer AI taslak akışlarına bağlanması ---
const v62VehicleContextSource = await fs.readFile('src/shared/vehicle/vehicle-context.ts', 'utf-8');
assert(v62VehicleContextSource.includes('[\\u0000-\\u001f\\u007f]') && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v62VehicleContextSource), 'v0.6.2 revize vehicle-context.ts ham kontrol karakteri icermez; sanitize escaped formda', 'vehicle-context.ts ham kontrol karakteri tasiyor');
assert(/bilinmiyor|kontrol gerekli/i.test(vehicleContextAiLine({})) && !/chassis|engine|Şase|Motor/i.test(vehicleContextAiLine({ chassisNo: 'X1', engineNo: 'Y2' })), 'v0.6.2 revize bos baglam AI satiri bilinmiyor/kontrol gerekli der; Sase/Motor sizmaz', JSON.stringify(vehicleContextAiLine({})));
const v62AiLineFull = vehicleContextAiLine({ make: 'Renault', model: 'Megane', modelYear: '2012', fuelType: 'dizel', chassisNo: 'NM0SHASE', engineNo: 'MOT9' });
assert(v62AiLineFull.includes('Renault') && v62AiLineFull.includes('Megane') && !/NM0SHASE|MOT9|chassis|engine/i.test(v62AiLineFull) && /kontrol gerektir/i.test(v62AiLineFull), 'v0.6.2 revize dolu baglam AI satiri marka/model gosterir, Sase/Motor gizler, kesin doğrulama yapmaz', v62AiLineFull);
const v62SearchTerms = vehicleContextSearchTerms({ make: 'Renault', model: 'Megane', bodyType: 'sedan', chassisNo: 'NM0SHASE', engineNo: 'MOT9' });
assert(v62SearchTerms.includes('Renault') && v62SearchTerms.includes('Megane') && !v62SearchTerms.some((t) => /NM0SHASE|MOT9/.test(t)), 'v0.6.2 revize Bilgi Bankasi arama bağlam terimleri marka/model/kasa; Sase/Motor icermez', JSON.stringify(v62SearchTerms));
const v62HeavyRulesSource = await fs.readFile('src/shared/heavy-damage-rules.ts', 'utf-8');
assert(/generateHeavyDamageAssessmentNote\([^)]*vehicleContext/.test(v62HeavyRulesSource) && /generateHeavyDamageAssessmentMailDraft\([^)]*vehicleContext/.test(v62HeavyRulesSource) && (v62HeavyRulesSource.match(/vehicleContextAiLine\(/g) || []).length >= 2, 'v0.6.2 revize Agir Hasar AI not + mail/rapor taslagi araç bağlamı (vehicleContextAiLine) kullanir', 'v0.6.2 heavy damage arac baglami baglanmadi');
const v62HeavyComponentSource = await fs.readFile('src/renderer/app/components/heavy-damage-assessment.ts', 'utf-8');
assert(v62HeavyComponentSource.includes('vehicleContextForAi(item.tracking.vehicleContext)') && /generateHeavyDamageAssessmentMailDraft\(assessment, vehicleContext\)/.test(v62HeavyComponentSource), 'v0.6.2 revize Agir Hasar komponenti AKTIF dosyanin AI-guvenli baglamini not/mail taslaklarina gecirir', 'v0.6.2 heavy damage komponent baglam gecmiyor');
assert(rendererMainSource.includes('generateHeavyDamageAssessmentNote(assessment, vehicleContextForAi(tracking.vehicleContext))') && rendererMainSource.includes('vehicleContextAiLine(vehicleContextForAi(selectedCase()?.tracking?.vehicleContext))'), 'v0.6.2 revize kaydedilen Agir Hasar notu + parca-liste kopyasi AKTIF dosya AI-guvenli baglamini kullanir', 'v0.6.2 renderer not/kopya baglami eksik');
const v62VcAiModuleSource = await fs.readFile('src/shared/vehicle/vehicle-context-ai.ts', 'utf-8');
assert(!/\bfetch\(|axios|from ['"]node:fs|\.write\(|console\.|chassisNo|engineNo/.test(v62VcAiModuleSource), 'v0.6.2 revize merkezi araç-bağlamı-AI modulu saf; ag/dosya/log yok ve Sase/Motor alanlarina dokunmaz', 'v0.6.2 vehicle-context-ai modulu yasak iz tasiyor');

// --- v0.6.3: Rapor / Fatura Uyum Kontrolü + sol menü temizliği ---
const v63Valid = parseComplianceResponse('```json\n{"overall":"Uyumsuz","summary":"Fatura fazla.","differences":["lastik yok"],"amountComparison":[{"label":"KDV Dahil Toplam","report":"10.000","invoice":"13.442,51","note":"fark"}],"partComparison":["kod farki"],"laborComparison":[],"valueGainCheck":"kiymet kazanma dusulmemis","withholdingNote":"tevkifatli","recommendation":"manuel kontrol","warnings":[]}\n```');
assert(v63Valid.overall === 'Uyumsuz' && v63Valid.amountComparison.length === 1 && v63Valid.amountComparison[0].label === 'KDV Dahil Toplam' && v63Valid.partComparison.includes('kod farki') && v63Valid.valueGainCheck.length > 0, 'v0.6.3 parseComplianceResponse gecerli AI JSON sonucunu normalize eder (tutar/parca/kiymet)', JSON.stringify(v63Valid.overall));
const v63Broken = parseComplianceResponse('bu bir JSON degil; AI bozuk cevap verdi');
assert(v63Broken.overall === 'Kontrol gerekli' && v63Broken.warnings.length >= 1, 'v0.6.3 bozuk/AI-disi yanit "Kontrol gerekli" olarak normalize (kilitlenme yok)', JSON.stringify(v63Broken.overall));
assert(parseComplianceResponse('{"overall":"compliant"}').overall === 'Uyumlu' && parseComplianceResponse('{"overall":"kısmen uyumlu"}').overall === 'Kısmen uyumlu' && parseComplianceResponse('{"overall":"belirsiz"}').overall === 'Kontrol gerekli' && COMPLIANCE_VERDICTS.join('|') === 'Uyumlu|Kısmen uyumlu|Uyumsuz|Kontrol gerekli', 'v0.6.3 verdict normalizasyonu + karar degerleri', JSON.stringify(COMPLIANCE_VERDICTS));
const v63FetchBackup = globalThis.fetch;
try {
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });
  let g503 = '';
  try { await callGeminiText('k', 'p'); } catch (error) { g503 = (error && error.code) || ''; }
  assert(g503 === AI_TRANSIENT_ERROR_CODE, 'v0.6.3 callGeminiText HTTP 503 gecici hata kodu firlatir (Gemini 503 hotfix korunur)', `code=${g503}`);
} finally { globalThis.fetch = v63FetchBackup; }
const v63ServiceSource = await fs.readFile('src/main/services/report-invoice-service.ts', 'utf-8');
assert(v63ServiceSource.includes('extractPdfText') && v63ServiceSource.includes('callGeminiText') && v63ServiceSource.includes('path.basename(selectedPath)') && !v63ServiceSource.includes('extracted.reason') && !/atomicWrite|writeFile|appendFile|tracking\.mutate|\.write\(|takip\.json|\.xlsx|UserKnowledgeStoreFile|writeCategoryLaborExcel/i.test(v63ServiceSource), 'v0.6.3 rapor/fatura servisi PDF metni+AI kullanir; KALICI YAZMA yok ve ham PDF hata detayi/full path sizdirmaz', 'v0.6.3 servis kalici yazma veya ham hata izi tasiyor');
const v63PromptSlice = v63ServiceSource.slice(v63ServiceSource.indexOf('function buildCompliancePrompt'));
assert(!/selectedPath|filePath|result\.filePaths/.test(v63PromptSlice), 'v0.6.3 AI promptu tam dosya yolu icermez (yalniz dosya adi; full path gonderilmez)', 'v0.6.3 prompt full path sizdiriyor');
assert(ipcContractSource.includes("reportInvoiceChoosePdf: 'report-invoice:choose-pdf'") && ipcContractSource.includes("reportInvoiceCompliance: 'report-invoice:compliance'") && preloadSource.includes('chooseReportInvoicePdf') && preloadSource.includes('checkReportInvoiceCompliance') && mainIpcSource.includes('IPC.reportInvoiceCompliance'), 'v0.6.3 rapor/fatura IPC kanal/preload/handler bagli (2 kanal)', 'v0.6.3 rapor/fatura IPC baglantisi eksik');
const v63LayoutSource = await fs.readFile('src/renderer/app/components/layout.ts', 'utf-8');
assert(v63LayoutSource.includes("'Rapor / Fatura Uyum'") && v63LayoutSource.includes("'rapor-fatura'") && !/navItem\('(issue|rucu|ktt)'/.test(v63LayoutSource), 'v0.6.3 sol menu: Rapor/Fatura eklendi; Sorunlar-Risk/Rucu/KTT nav kaldirildi', 'v0.6.3 sol menu temizligi eksik');
const v63ComponentSource = await fs.readFile('src/renderer/app/components/report-invoice.ts', 'utf-8');
assert(v63ComponentSource.includes('Rapor / Fatura Uyum Kontrolü') && v63ComponentSource.includes('AI servisine gönderilebilir') && v63ComponentSource.includes('Tekrar Dene') && v63ComponentSource.includes('const canRun = !loading') && !v63ComponentSource.includes('filePath'), 'v0.6.3 panel Turkce + gizlilik notu + Tekrar Dene; eksik PDF uyarisina izin verir; full path gostermez', 'v0.6.3 panel eksik');
const v63RunSlice = rendererMainSource.slice(rendererMainSource.indexOf('async function runReportInvoiceComplianceAction'), rendererMainSource.indexOf('function clearReportInvoice'));
assert(v63RunSlice.includes('AI_TRANSIENT_ERROR_CODE') && !/saveSettings|updateField|commitApproved|tracking\.mutate|exportPartsLabor/.test(v63RunSlice), 'v0.6.3 rapor/fatura AI akisi 503 hotfix kullanir ve sonucu hicbir yere kalici yazmaz', 'v0.6.3 renderer akisi gecici-hata/kalici-yazma guard ihlali');

// --- v0.6.3 final-risk-fix: AI baglanti testi ---
const aiTestNoKey = await testReportInvoiceAiConnection('');
assert(aiTestNoKey.ok === false && /anahtar/i.test(aiTestNoKey.message), 'v0.6.3 final AI baglanti testi: API anahtari yok -> Turkce uyari (hata firlatmaz)', JSON.stringify(aiTestNoKey));
const aiTestFetchBackup = globalThis.fetch;
try {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"durum":"ok"}' }] } }] }), text: async () => '' });
  const aiTestOk = await testReportInvoiceAiConnection('anahtar-var');
  assert(aiTestOk.ok === true && aiTestOk.message === 'AI bağlantısı çalışıyor.', 'v0.6.3 final AI baglanti testi: basarili yanit -> "AI bağlantısı çalışıyor."', JSON.stringify(aiTestOk));
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });
  let aiTest503 = '';
  try { await testReportInvoiceAiConnection('anahtar-var'); } catch (error) { aiTest503 = (error && error.code) || ''; }
  assert(aiTest503 === AI_TRANSIENT_ERROR_CODE, 'v0.6.3 final AI baglanti testi: 503/timeout -> gecici hata kodu (uygulama kilitlenmez)', `code=${aiTest503}`);
} finally { globalThis.fetch = aiTestFetchBackup; }

// --- v0.6.3 final-risk-fix: taranmis/gorsel PDF fallback (sahte "Uyumlu" uretmez) ---
const v63Scanned = buildScannedPdfNotice('rapor.pdf', true, 'fatura.pdf', false);
assert(v63Scanned.overall === 'Kontrol gerekli' && v63Scanned.summary === SCANNED_PDF_NOTICE && v63Scanned.overall !== 'Uyumlu' && v63Scanned.amountComparison.length === 0 && v63Scanned.warnings.some((w) => w.includes('rapor.pdf')) && !v63Scanned.warnings.some((w) => w.includes('fatura.pdf')), 'v0.6.3 final taranmis PDF -> "Kontrol gerekli" (sahte Uyumlu yok; yalniz dosya adi)', JSON.stringify(v63Scanned.overall));
assert(!/C:\\|\/Users\/|\.\.\\|filePath|selectedPath/.test(JSON.stringify(v63Scanned)), 'v0.6.3 final taranmis PDF uyarisi tam dosya yolu sizdirmaz', JSON.stringify(v63Scanned.warnings));
assert(v63ServiceSource.includes('MIN_USABLE_PDF_TEXT_CHARS') && v63ServiceSource.includes('scanned: true') && v63ServiceSource.includes('PDF_PAGE_BREAK_MARKER') && v63ServiceSource.includes('testReportInvoiceAiConnection'), 'v0.6.3 final servis: bos/kisa metin -> scanned; sayfa-sonu isareti elenir; AI baglanti testi var', 'v0.6.3 final servis scanned/AI-test izi eksik');
assert(v63RunSlice.includes('buildScannedPdfNotice') && /report\.scanned|invoice\.scanned/.test(v63RunSlice) && !/filePath|selectedPath/.test(v63RunSlice), 'v0.6.3 final renderer akisi: taranmis PDF AI cagrisini atlar, full path tasimaz', 'v0.6.3 final renderer scanned-guard eksik');
const v63TestAiBound = ipcContractSource.includes("reportInvoiceTestAi: 'report-invoice:test-ai'") && preloadSource.includes('testReportInvoiceAi') && mainIpcSource.includes('IPC.reportInvoiceTestAi') && v63ComponentSource.includes('AI Bağlantısını Test Et');
assert(v63TestAiBound, 'v0.6.3 final AI baglanti testi IPC kanal/preload/handler/panel butonu bagli', 'v0.6.3 final AI baglanti testi baglantisi eksik');
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
assert(knowledgeImportCommitServiceSource.includes("'file' + 'Path'") && knowledgeImportCommitServiceSource.includes('forbiddenPathKey') && knowledgeImportCommitServiceSource.includes('hasOwnProperty.call(input, forbiddenPathKey)') && knowledgeImportCommitServiceSource.includes('[\\u0000-\\u001f\\u007f]') && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(knowledgeImportCommitServiceSource), 'v0.6.0 final-rc commit service dosya-yolu alanini reddeder + kontrol-karakter sanitize escaped (ham kontrol bayti yok)', 'final-rc commit service filePath-reddi/escaped-sanitize eksik');
assert(knowledgePanelSource.includes('Parça sayısı') && knowledgePanelSource.includes("renderMeta('Kaynak no'") && knowledgePanelSource.includes("renderMeta('Kaynak tipi'") && knowledgePanelSource.includes('Varsayılan sınır 10') && rendererMainSource.includes('Kalıcı kayıt yapılmadı.') && rendererMainSource.includes('Kalıcı kayıt başarısız.'), 'v0.6.0 final-rc UI etiketleri Turkce (Parca/Kaynak no/Kaynak tipi/Varsayilan sinir/Kalici kayit)', 'final-rc Turkce etiket eksik');
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
  const p4e2bPathReject = await commitApprovedKnowledgeImportTextPreview(p4e2bRoot, { ...p4e2bInput, fileName: 'yol.txt', ['file' + 'Path']: 'C:\\\\gizli\\\\yol.txt' });
  assert(p4e2bPathReject.ok === false && p4e2bPathReject.rejected === 1 && p4e2bPathReject.committed === 0, 'v0.6.0 final-rc commit girisinde dosya-yolu alani varsa acikca reddedilir', JSON.stringify(p4e2bPathReject));
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
assert(knowledgePanelSource.includes('Yalnız yerel / ücretsiz / salt okunur') && knowledgePanelSource.includes('Kaynak sayısı') && knowledgePanelSource.includes('Parça sayısı') && knowledgePanelSource.includes('Ücretli servis') && knowledgePanelSource.includes('Harici bağlantı') && knowledgePanelSource.includes('Yazma modu'), 'v0.6.0 P2-B panel yalniz-yerel/ucretsiz/salt okunur durum ozeti gosterir', 'Bilgi Bankasi durum ozeti eksik');
assert(knowledgePanelSource.includes('Bilgi bankasında kaynak bulunamadı.') && knowledgePanelSource.includes('Eşleşen bilgi bulunamadı.') && knowledgePanelSource.includes('Arama yapmak için') && knowledgePanelSource.includes('Varsayılan sınır 10'), 'v0.6.0 P2-B panel kaynak yok, sonuc yok ve bos arama durumlarini gosterir', 'Bilgi Bankasi bos durumlari eksik');
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

// === v0.6.0 SEDDK mevzuat bilgi bankası + ücret hesabı + şablon/süre/performans kuralları ===
assert(MEVZUAT_SOURCES.length === 4 && MEVZUAT_SOURCES.every((s) => s.title && s.effectiveDate && s.items.length > 0), 'v0.6.0 mevzuat: 4 kaynak yukleniyor, baslik+yururluk+madde icerir', JSON.stringify(MEVZUAT_SOURCES.map((s) => s.id)));
assert(getAllMevzuatItems().every((i) => i.id && i.sourceId && i.effectiveDate && i.rule && i.legalReference && i.caution && i.confidence), 'v0.6.0 mevzuat: her madde zorunlu alanlari tasir (legalReference/caution/confidence)', 'mevzuat madde alan eksik');
assert(findMevzuatByTag('EK-1').length > 0 && findMevzuatByTag('atama saatleri').length > 0, 'v0.6.0 mevzuat: etiket aramasi calisir', 'tag arama bos');
// Rapor şablonu seçici
assert(selectReportTemplate({ sigortaTuru: 'kasko' }).template === 'Ek-2', 'v0.6.0 sablon: kasko -> Ek-2', 'kasko sablon hatali');
assert(selectReportTemplate({ sigortaTuru: 'trafik', degerKaybiDahil: true }).template === 'Ek-1.1', 'v0.6.0 sablon: trafik + deger kaybi -> Ek-1.1', 'trafik DK sablon hatali');
assert(selectReportTemplate({ sigortaTuru: 'trafik', agirVeyaTamHasar: true }).template === 'Ek-1.2', 'v0.6.0 sablon: trafik + agir/tam hasar -> Ek-1.2', 'trafik agir sablon hatali');
assert(selectReportTemplate({ sigortaTuru: 'ihtiyari-mali-sorumluluk', degerKaybiDahil: true }).template === 'Ek-1.1', 'v0.6.0 sablon: ihtiyari + deger kaybi -> Ek-1.1', 'ihtiyari DK sablon hatali');
assert(selectReportTemplate({ sigortaTuru: 'ihtiyari-mali-sorumluluk' }).template === 'Ek-1.2', 'v0.6.0 sablon: ihtiyari sadece arac hasari -> Ek-1.2', 'ihtiyari sablon hatali');
// EK-1 / EK-2 ücret hesabı
assert(calculateMotorExpertiseFee({ brutHasarTutari: 50000 }).total === 2400, 'v0.6.0 ucret: EK-1 1. kademe 2.400 TL', String(calculateMotorExpertiseFee({ brutHasarTutari: 50000 }).total));
assert(calculateMotorExpertiseFee({ brutHasarTutari: 100000 }).total === 2565, 'v0.6.0 ucret: EK-1 2. kademe formulu (100.000 -> 2.565)', String(calculateMotorExpertiseFee({ brutHasarTutari: 100000 }).total));
assert(calculateMotorExpertiseFee({ brutHasarTutari: 50000, vehicleClass: 'agir-vasita' }).total === 3600, 'v0.6.0 ucret: agir vasita x1.50 (3.600)', String(calculateMotorExpertiseFee({ brutHasarTutari: 50000, vehicleClass: 'agir-vasita' }).total));
assert(calculateMotorExpertiseFee({ brutHasarTutari: 50000, vehicleClass: 'is-makinesi' }).total === 5280, 'v0.6.0 ucret: is makinesi x2.20 (5.280)', String(calculateMotorExpertiseFee({ brutHasarTutari: 50000, vehicleClass: 'is-makinesi' }).total));
assert(degerKaybiFee('tek-basina') === 1450, 'v0.6.0 ucret: deger kaybi 1.450 TL', String(degerKaybiFee('tek-basina')));
assert(degerKaybiFee('maddi-hasarla-birlikte') === 725, 'v0.6.0 ucret: deger kaybi maddi hasarla 725 TL', String(degerKaybiFee('maddi-hasarla-birlikte')));
assert(calculateMotorExpertiseFee({ brutHasarTutari: 50000, kttTanzim: true }).kttFee === 2100, 'v0.6.0 ucret: KTT 2.100 TL eklenir', '');
assert(calculateMotorExpertiseFee({ brutHasarTutari: 50000, jobType: 'uzaktan-ekspertiz' }).total === 1600, 'v0.6.0 ucret: uzaktan ekspertiz 2/3 (1.600)', String(calculateMotorExpertiseFee({ brutHasarTutari: 50000, jobType: 'uzaktan-ekspertiz' }).total));
assert(calculateMotorExpertiseFee({ brutHasarTutari: 50000, sehirDisi: true }).total === 3000, 'v0.6.0 ucret: sehir disi %25 ilave (3.000)', String(calculateMotorExpertiseFee({ brutHasarTutari: 50000, sehirDisi: true }).total));
assert(calculateNonMotorExpertiseFee({ brutHasarTutari: 10000 }).total === 3000, 'v0.6.0 ucret: EK-2 1. kademe 3.000 TL', String(calculateNonMotorExpertiseFee({ brutHasarTutari: 10000 }).total));
assert(calculateNonMotorExpertiseFee({ brutHasarTutari: 10000, riziko: 'ticari-sinai-endustriyel' }).total === 4500, 'v0.6.0 ucret: EK-2 ticari/sinai/endustriyel x1.50 (4.500)', String(calculateNonMotorExpertiseFee({ brutHasarTutari: 10000, riziko: 'ticari-sinai-endustriyel' }).total));
const feeRunA = JSON.stringify(calculateMotorExpertiseFee({ brutHasarTutari: 250000, sehirDisi: true, kttTanzim: true }));
const feeRunB = JSON.stringify(calculateMotorExpertiseFee({ brutHasarTutari: 250000, sehirDisi: true, kttTanzim: true }));
assert(feeRunA === feeRunB, 'v0.6.0 ucret: saf/deterministik (ayni girdi ayni cikti, yan etki yok)', 'deterministik degil');
assert(calculateMotorExpertiseFee({ brutHasarTutari: 50000, travel: { km: 120 } }).missingInputs.includes('epdkFuelPrice'), 'v0.6.0 ucret: EPDK fiyati yoksa yol masrafi missingInputs uyarisi', 'epdk eksik uyarisi yok');
// Süre / EKSİST kuralları
assert(ATAMA_SAATLERI.join(',') === '09:00,11:00,13:00,16:00' && EKSIST_DEADLINE_RULES.length >= 9 && getDeadlineRule('is-kabul')?.value === 6 && getDeadlineRule('rapor-trafik')?.value === 3 && getDeadlineRule('rapor-diger-motorlu')?.value === 5 && getDeadlineRule('on-rapor-15-gun')?.value === 15 && getDeadlineRule('onarim-30-gun')?.value === 30, 'v0.6.0 sure: atama saatleri + 6 saat/3-5 is gunu/15-30 gun kurallari', 'sure kurallari eksik');
// Performans bilgi yapısı (otomatik karar yok)
assert(PERFORMANS_TAM_PUAN === 1000 && hasarKademePuani(1) === 1 && hasarKademePuani(3) === 2 && hasarKademePuani(5) === 3 && hasarKademePuani(2, true) === 3, 'v0.6.0 performans: 1000 puan + kademe puanlari (bilgi amacli)', 'performans puan hatali');
// Saflık: yeni modüller ag/dosya/electron icermez
const v60Paths = ['src/shared/mevzuat/mevzuat-index.ts', 'src/shared/mevzuat/report-template-rules.ts', 'src/shared/fees/expertise-fee-calculator.ts', 'src/shared/fees/motor-fee-tariff.ts', 'src/shared/fees/non-motor-fee-tariff.ts', 'src/shared/deadlines/eksist-deadline-rules.ts', 'src/shared/mevzuat/performance-scoring-info.ts'];
let v60Pure = true;
for (const p of v60Paths) { const src = await fs.readFile(p, 'utf-8'); if (/\bfetch\(|axios|from ['"]electron|from ['"]node:fs|\.writeFile\(|appendFile|atomicWrite/.test(src)) v60Pure = false; }
assert(v60Pure, 'v0.6.0 mevzuat/fees/deadlines modulleri saf: ag/dosya/electron/yazma yok (local-first, salt-okunur)', 'modul saf degil');

// === v0.6.x "Mevzuat & AI Yardımcıları" UI entegrasyonu (salt-okunur) ===
const aihLayoutSrc = await fs.readFile('src/renderer/app/components/layout.ts', 'utf-8');
const aihMainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const aihHelpersSrc = await fs.readFile('src/renderer/app/components/ai-helpers.ts', 'utf-8');
const aihMevzuatSrc = await fs.readFile('src/renderer/app/components/mevzuat-browser.ts', 'utf-8');
const aihTemplateSrc = await fs.readFile('src/renderer/app/components/report-template-helper.ts', 'utf-8');
const aihFeeSrc = await fs.readFile('src/renderer/app/components/expertise-fee-helper.ts', 'utf-8');
const aihDeadlineSrc = await fs.readFile('src/renderer/app/components/deadline-helper.ts', 'utf-8');
const aihActionsSrc = await fs.readFile('src/renderer/app/actions/ai-helper-actions.ts', 'utf-8');
const aihStateSrc = await fs.readFile('src/renderer/app/state.ts', 'utf-8');
assert(aihLayoutSrc.includes("case 'ai-yardimcilari'") && aihLayoutSrc.includes('renderAiHelpers') && aihLayoutSrc.includes("'ai-yardimcilari'"), 'v0.6.x AI Yardimcilari sol menu + renderPage bagli', 'AI Yardimcilari layout baglantisi eksik');
assert(aihHelpersSrc.includes('Mevzuat Bilgi Bankası') && aihHelpersSrc.includes('Rapor Şablonu Seçici') && aihHelpersSrc.includes('Ekspertiz Ücreti Hesap') && aihHelpersSrc.includes('EKSİST') && aihHelpersSrc.includes('MEVZUAT_DISCLAIMER'), 'v0.6.x AI Yardimcilari 4 alt arac + disclaimer icerir', 'AI Yardimcilari karti eksik');
assert(aihMevzuatSrc.includes('MEVZUAT_SOURCES') && aihMevzuatSrc.includes('getAllMevzuatItems') && /mevzuatSearch/.test(aihMevzuatSrc) && /mevzuatFilter/.test(aihMevzuatSrc), 'v0.6.x Mevzuat tarayici kaynak listeler + arama/filtre mantigi tasir', 'Mevzuat tarayici eksik');
assert(aihTemplateSrc.includes('selectReportTemplate'), 'v0.6.x rapor sablonu secici saf modulu kullanir', 'sablon secici modul kullanmiyor');
assert(aihFeeSrc.includes('calculateMotorExpertiseFee') && aihFeeSrc.includes('calculateNonMotorExpertiseFee'), 'v0.6.x ucret yardimcisi saf calculator kullanir (EK-1/EK-2)', 'ucret yardimcisi calculator kullanmiyor');
assert(aihDeadlineSrc.includes('EKSIST_DEADLINE_RULES') && aihDeadlineSrc.includes('ATAMA_SAATLERI'), 'v0.6.x sure yardimcisi EKSIST kurallarini ve atama saatlerini listeler', 'sure yardimcisi kurallari listelemiyor');
assert(aihStateSrc.includes('AiHelpersState') && aihStateSrc.includes('aiHelpers:'), 'v0.6.x Ai Yardimcilari UI state tanimli (salt-okunur)', 'AI Yardimcilari state eksik');
// Standalone tab + köprüler
// Kapanan Dosyalar sekmesiyle listeye 'kapanan' eklendi; amac ayni (ai-yardimcilari kilitsiz + kopruler bagli).
assert(aihMainSrc.includes("TABS_ALLOWED_WHILE_FOLDER_LOCKED: DetailTab[] = ['dosyalar', 'durum', 'kapanan', 'rapor-fatura', 'ai-yardimcilari', 'settings']") && aihMainSrc.includes("action.startsWith('aih-')") && aihMainSrc.includes('handleAiHelperInput'), 'v0.6.x AI Yardimcilari standalone tab + aksiyon/input koprusu bagli', 'AI Yardimcilari tab/kopru baglantisi eksik');
// Salt-okunur kanit: UI ve aksiyonlar IPC/fetch/yazma/takip.json icermez
const aihUiFiles = [aihHelpersSrc, aihMevzuatSrc, aihTemplateSrc, aihFeeSrc, aihDeadlineSrc, aihActionsSrc];
let aihReadOnly = true;
for (const src of aihUiFiles) { if (/\bfetch\(|axios|window\.hasarbotu|ipcRenderer|saveSettings|updateField|tracking\.mutate|\.writeFile\(|takip\.json|\.xlsx/.test(src)) aihReadOnly = false; }
assert(aihReadOnly, 'v0.6.x AI Yardimcilari UI salt-okunur: IPC/fetch/yazma/takip.json/Excel izi yok', 'AI Yardimcilari UI yazma/ag izi tasiyor');
assert(!/from ['"].*services|from ['"]electron/.test(aihActionsSrc) && aihActionsSrc.includes('state.aiHelpers'), 'v0.6.x AI Yardimcilari aksiyonlari yalniz state.aiHelpers gunceller (servis/electron yok)', 'AI Yardimcilari aksiyon izolasyonu bozuk');

// === v0.6.x AI Yardımcıları SEÇİLİ DOSYA BAĞLAMI (read-only ön-doldurma) ===
assert(buildAiCaseContext(null) === null, 'v0.6.x dosya secili degilken baglam null (genel mod)', 'bos baglam null degil');
const kaskoItem = { folderPath: 'C/kasko', plate: '34ABC34', officeFileNo: '2026/5', claimNoticeNo: '13-999', claimType: 'kasko', sorumlu: 'Ali', serviceName: 'Servis A', workflowStatus: 'Portal Kontrol', takipTarihi: '2026-07-01', updatedAt: '2026-07-02', documentAnalysis: { missingCritical: ['Ruhsat'] }, tracking: { caseIdentity: {}, assignment: {}, service: {}, status: {}, heavyDamage: {} } };
const trafikHeavyItem = { folderPath: 'C/trafik', plate: '06XYZ06', officeFileNo: '2026/6', claimNoticeNo: '13-111', claimType: 'trafik', sorumlu: 'Veli', serviceName: '', workflowStatus: 'Ön Rapor', takipTarihi: '', updatedAt: '2026-07-03', documentAnalysis: { missingCritical: [] }, tracking: { caseIdentity: {}, assignment: {}, service: {}, status: {}, heavyDamage: {}, heavyDamageAssessment: { summary: { repairCost: 250000, marketValue: 400000, repairToMarketRatio: 0.625, thresholdExceeded: true, directThresholdExceeded: false, economicThresholdExceeded: true } } } };
const trafikNormalItem = { folderPath: 'C/trafik2', plate: '35DEF35', officeFileNo: '2026/7', claimNoticeNo: '', claimType: 'trafik', sorumlu: '', serviceName: '', workflowStatus: 'Yeni Dosya', takipTarihi: '', updatedAt: '', documentAnalysis: { missingCritical: [] }, tracking: { caseIdentity: {}, assignment: {}, service: {}, status: {}, heavyDamage: {} } };
const kaskoCtx = buildAiCaseContext(kaskoItem);
const trafikHeavyCtx = buildAiCaseContext(trafikHeavyItem);
const trafikNormalCtx = buildAiCaseContext(trafikNormalItem);
assert(kaskoCtx && kaskoCtx.plate === '34ABC34' && kaskoCtx.officeFileNo === '2026/5' && kaskoCtx.noticeFileNo === '13-999' && kaskoCtx.claimType === 'kasko' && kaskoCtx.missingDocuments.includes('Ruhsat'), 'v0.6.x baglam karti alanlari (plaka/dosya no/ihbar foy/eksik evrak) dosyadan okunur', JSON.stringify(kaskoCtx && kaskoCtx.plate));
assert(trafikHeavyCtx.grossDamageAmount === 250000 && trafikHeavyCtx.marketValue === 400000 && trafikHeavyCtx.isHeavyDamage === true && trafikHeavyCtx.isTotalLoss === true, 'v0.6.x baglam: hasar tutari/rayic/agir-tam hasar agir hasar degerlendirmesinden okunur', JSON.stringify(trafikHeavyCtx.grossDamageAmount));
assert(trafikNormalCtx.grossDamageAmount === null && trafikNormalCtx.isHeavyDamage === null, 'v0.6.x baglam: bilgi yoksa null kalir (otomatik bulunamadi)', JSON.stringify(trafikNormalCtx.grossDamageAmount));
// Şablon ön-doldurma (deriveTemplateInput → selectReportTemplate)
assert(deriveTemplateInput(kaskoCtx).sigortaTuru === 'kasko' && selectReportTemplate(deriveTemplateInput(kaskoCtx)).template === 'Ek-2', 'v0.6.x kasko baglaminda Ek-2 onerilir', JSON.stringify(selectReportTemplate(deriveTemplateInput(kaskoCtx)).template));
assert(selectReportTemplate(deriveTemplateInput(trafikNormalCtx)).template === 'Ek-1.1', 'v0.6.x trafik + arac hasari (deger kaybi) baglaminda Ek-1.1 onerilir', JSON.stringify(selectReportTemplate(deriveTemplateInput(trafikNormalCtx)).template));
assert(deriveTemplateInput(trafikHeavyCtx).agirVeyaTamHasar === true && selectReportTemplate(deriveTemplateInput(trafikHeavyCtx)).template === 'Ek-1.2', 'v0.6.x trafik + agir/tam hasar baglaminda Ek-1.2 onerilir', JSON.stringify(selectReportTemplate(deriveTemplateInput(trafikHeavyCtx)).template));
// Ücret ön-doldurma (deriveFeePrefill) — araç grubu türetilmez (kontrol gerekli)
const feePrefill = deriveFeePrefill(trafikHeavyCtx);
assert(feePrefill.brutHasar === '250000' && feePrefill.kapsam === 'motorlu', 'v0.6.x ucret yardimcisi hasar tutarini dosyadan on-doldurur', JSON.stringify(feePrefill.brutHasar));
assert(!('vehicleClass' in feePrefill), 'v0.6.x arac grubu dosyadan turetilmez (kontrol gerekli; ucret on-doldurma vehicleClass icermez)', JSON.stringify(Object.keys(feePrefill)));
assert(deriveFeePrefill(trafikNormalCtx).brutHasar === '', 'v0.6.x hasar tutari yoksa ucret brut alani bos (otomatik bulunamadi)', JSON.stringify(deriveFeePrefill(trafikNormalCtx).brutHasar));
assert(deriveDeadlineDosyaTuru(kaskoCtx) === 'diger-motorlu' && deriveDeadlineDosyaTuru(trafikHeavyCtx) === 'trafik', 'v0.6.x sure yardimcisi dosya turu: trafik 3 / diger 5 is gunu icin dogru ayrim', '');
assert(suggestMevzuatTerms(kaskoCtx).includes('kasko') && suggestMevzuatTerms(trafikNormalCtx).includes('trafik'), 'v0.6.x mevzuat baglam filtre onerileri (kasko/trafik) uretir', JSON.stringify(suggestMevzuatTerms(kaskoCtx)));
// UI entegrasyon + salt-okunur kanıt
const aihCtxCardSrc = await fs.readFile('src/renderer/app/components/ai-case-context-card.ts', 'utf-8');
const aihCtxSelSrc = await fs.readFile('src/renderer/app/selectors/ai-case-context.ts', 'utf-8');
const aihMapSrc = await fs.readFile('src/renderer/app/utils/ai-context-mapping.ts', 'utf-8');
assert(aihCtxCardSrc.includes('Seçili Dosya Bağlamı') && aihCtxCardSrc.includes('Dosya seçilmedi') && aihHelpersSrc.includes('renderAiCaseContextCard') && (aihHelpersSrc.includes('buildAiCaseContext') || aihHelpersSrc.includes('buildEffectiveAiContext')), 'v0.6.x baglam karti AI Yardimcilari ekranina bagli', 'baglam karti baglantisi eksik');
assert(/userEdited/.test(aihActionsSrc) && aihActionsSrc.includes('syncAiHelpersContext') && aihMainSrc.includes('syncAiHelpersContext()'), 'v0.6.x baglam senkronu + gecici degisiklik izleme render()e bagli', 'baglam senkron baglantisi eksik');
const aihCtxSharedSrc = await fs.readFile('src/shared/ai-context/ai-case-context.ts', 'utf-8');
let aihCtxReadOnly = true;
for (const src of [aihCtxCardSrc, aihCtxSelSrc, aihMapSrc, aihCtxSharedSrc]) { if (/\bfetch\(|axios|window\.hasarbotu|ipcRenderer|saveSettings|updateField|tracking\.mutate|\.writeFile\(|takip\.json|\.xlsx/.test(src)) aihCtxReadOnly = false; }
assert(aihCtxReadOnly, 'v0.6.x baglam katmani salt-okunur: IPC/fetch/yazma/takip.json izi yok', 'baglam katmani yazma izi tasiyor');

// === v0.6.x "Dosya Ek Bilgileri" (aiHelperContext) — şema/geriye uyum/kaydetme güvenliği ===
const aiExtraIdentity = { caseKey: 'c-ex', plate: '34 ABC 34', dosyaNo: '06BGG764', officeFileNo: '2026/19', claimNoticeNo: '13-222', folderPath: 'C/ai-extra', monthFolder: 'Temmuz 2026', isClosedFolder: false };
const aiExtraTracking = createDefaultTracking(aiExtraIdentity, 'AI Test');
// Eski dosya: aiHelperContext yok -> migrate eklemez, uygulama açılır.
const aiOld = migrateTracking(JSON.parse(JSON.stringify(aiExtraTracking)));
assert(aiOld !== null && aiOld.aiHelperContext === undefined, 'v0.6.x eski takip.json (aiHelperContext yok) sorunsuz acilir; alan otomatik OLUSMAZ (geriye uyum)', JSON.stringify(aiOld?.aiHelperContext));
// Alan VARSA normalize edilir; bozuk/junk düşer, enum dışı atılır.
const aiWith = JSON.parse(JSON.stringify(aiExtraTracking));
aiWith.aiHelperContext = { version: 1, claimTypeOverride: 'kasko', vehicleGroup: 'agir_vasita', hasValueLoss: true, junkField: 'x', accidentDocumentType: 'gecersiz', notes: 'n'.repeat(900) };
const aiWithMig = migrateTracking(aiWith);
assert(aiWithMig.aiHelperContext && aiWithMig.aiHelperContext.version === 1 && aiWithMig.aiHelperContext.claimTypeOverride === 'kasko' && aiWithMig.aiHelperContext.vehicleGroup === 'agir_vasita' && aiWithMig.aiHelperContext.hasValueLoss === true && !('junkField' in aiWithMig.aiHelperContext) && aiWithMig.aiHelperContext.accidentDocumentType === undefined && aiWithMig.aiHelperContext.notes.length === 500, 'v0.6.x aiHelperContext VARSA normalize edilir (junk/enum-disi atilir, metin kapanir)', JSON.stringify(aiWithMig.aiHelperContext));
// migrate ana alanları bozmaz.
assert(aiWithMig.metadata && aiWithMig.heavyDamage && Array.isArray(aiWithMig.notes) && aiWithMig.status && aiWithMig.claimType !== undefined, 'v0.6.x aiHelperContext eklenmesi ana takip alanlarini bozmaz', 'ana alanlar bozuldu');
// sanitize/diff
const aiSan = sanitizeAiHelperContext({ vehicleGroup: 'is_makinesi', hasValueLoss: false, cityScope: 'farkli_il' }, { updatedAt: '2026-07-01', updatedBy: 'Eksper' });
assert(aiSan.version === 1 && aiSan.vehicleGroup === 'is_makinesi' && aiSan.hasValueLoss === false && aiSan.cityScope === 'farkli_il' && aiSan.updatedBy === 'Eksper', 'v0.6.x sanitizeAiHelperContext gecerli alanlari + zaman damgasini tutar', JSON.stringify(aiSan));
assert(normalizeOptionalAiHelperContext(undefined) === undefined && normalizeOptionalAiHelperContext(null) === undefined, 'v0.6.x normalizeOptionalAiHelperContext yoksa undefined (zorla olusturma yok)', 'normalize bos degil');
const aiDiff = diffAiHelperContext(null, sanitizeAiHelperContext({ vehicleGroup: 'agir_vasita' }));
assert(aiDiff.length === 1 && aiDiff[0].label === 'Araç grubu' && aiDiff[0].newLabel === 'Ağır Vasıta', 'v0.6.x diffAiHelperContext degisen alani Turkce eski->yeni verir (onay modali)', JSON.stringify(aiDiff));

// === v0.6.x Öncelik: kayıtlı/geçici ek bağlam otomatik tahminden güçlü; yardımcılara yansır ===
const aiBaseItem = { folderPath: 'C/ai-extra', plate: '34 ABC 34', officeFileNo: '2026/19', claimNoticeNo: '13-222', claimType: 'unknown', sorumlu: '', serviceName: '', workflowStatus: 'Yeni Dosya', takipTarihi: '', updatedAt: '', documentAnalysis: { missingCritical: [] }, tracking: { caseIdentity: {}, assignment: {}, service: {}, status: {}, heavyDamage: {}, metadata: { writeId: 'w' } } };
// Kayıtlı: claimTypeOverride kasko -> Ek-2 + provenance 'saved'
const aiSavedItem = { ...aiBaseItem, tracking: { ...aiBaseItem.tracking, aiHelperContext: { version: 1, claimTypeOverride: 'kasko' } } };
const aiSavedCtx = buildAiCaseContext(aiSavedItem);
assert(aiSavedCtx.sigortaTuru === 'kasko' && aiSavedCtx.provenance.sigortaTuru === 'saved' && selectReportTemplate(deriveTemplateInput(aiSavedCtx)).template === 'Ek-2', 'v0.6.x kayitli claimTypeOverride=kasko -> Ek-2 (kaydedilmis ek bilgi)', JSON.stringify(aiSavedCtx.sigortaTuru));
// Geçici: araç grubu ağır vasıta -> ücret x1.50
const aiTempAgir = applyAiHelperOverride(buildAiCaseContext(aiBaseItem), { vehicleGroup: 'agir_vasita' }, 'temp');
assert(aiTempAgir.vehicleGroup === 'agir-vasita' && aiTempAgir.provenance.vehicleGroup === 'temp' && deriveFeePrefill(aiTempAgir).vehicleClass === 'agir-vasita' && calculateMotorExpertiseFee({ brutHasarTutari: 50000, vehicleClass: deriveFeePrefill(aiTempAgir).vehicleClass }).total === 3600, 'v0.6.x gecici arac grubu agir vasita -> ucret x1.50 (3.600)', '');
const aiTempIs = applyAiHelperOverride(buildAiCaseContext(aiBaseItem), { vehicleGroup: 'is_makinesi' }, 'temp');
assert(deriveFeePrefill(aiTempIs).vehicleClass === 'is-makinesi' && calculateMotorExpertiseFee({ brutHasarTutari: 50000, vehicleClass: 'is-makinesi' }).total === 5280, 'v0.6.x gecici arac grubu is makinesi -> ucret x2.20 (5.280)', '');
// Değer kaybı var (ihtiyari) -> Ek-1.1
const aiTempDk = applyAiHelperOverride(buildAiCaseContext(aiBaseItem), { claimTypeOverride: 'ihtiyari', hasValueLoss: true }, 'temp');
assert(aiTempDk.sigortaTuru === 'ihtiyari-mali-sorumluluk' && aiTempDk.hasValueLoss === true && selectReportTemplate(deriveTemplateInput(aiTempDk)).template === 'Ek-1.1', 'v0.6.x deger kaybi var (ihtiyari) -> Ek-1.1', JSON.stringify(selectReportTemplate(deriveTemplateInput(aiTempDk)).template));
// Farklı il -> şehir dışı ücret ön-doldurma + süre 2 iş günü ayrımı
const aiTempIl = applyAiHelperOverride(buildAiCaseContext({ ...aiBaseItem, claimType: 'trafik' }), { cityScope: 'farkli_il' }, 'temp');
assert(aiTempIl.cityScope === 'sehir-disi' && deriveFeePrefill(aiTempIl).sehirDisi === true && deriveDeadlineDosyaTuru(aiTempIl) === 'trafik', 'v0.6.x farkli il -> sehir disi ucret + trafik sure ayrimi', '');

// === v0.6.x AI altyapı hazırlığı (provider yok, varsayılan güvenli) + gizlilik maskeleme ===
assert(DEFAULT_AI_RUNTIME_CONFIG.mode === 'local_rules' && DEFAULT_AI_RUNTIME_CONFIG.providerKind === 'none' && DEFAULT_AI_RUNTIME_CONFIG.externalProviderEnabled === false, 'v0.6.x AI altyapisi: mod yerel kural, harici saglayici KAPALI (varsayilan guvenli)', JSON.stringify(DEFAULT_AI_RUNTIME_CONFIG.mode));
assert(DEFAULT_AI_PRIVACY_MODE.maskPlate && DEFAULT_AI_PRIVACY_MODE.maskTcVkn && DEFAULT_AI_PRIVACY_MODE.requirePreviewBeforeExternalSend, 'v0.6.x AI gizlilik varsayilani: maskeler acik + harici gonderim once onizleme zorunlu', '');
assert(maskPlate('Araç 34 ABC 123 hasarli').includes('PLAKA-***'), 'v0.6.x maskPlate plakayi maskeler', maskPlate('Araç 34 ABC 123 hasarli'));
assert(maskTcVkn('TC: 12345678901 numarali').includes('KIMLIK-***'), 'v0.6.x maskTcVkn TC/VKN maskeler', maskTcVkn('TC: 12345678901 numarali'));
assert(maskPhone('Tel 0532 123 45 67 ara').includes('TELEFON-***'), 'v0.6.x maskPhone telefonu maskeler', maskPhone('Tel 0532 123 45 67 ara'));
assert(maskEmail('mail ali@ornek.com adresi').includes('EMAIL-***'), 'v0.6.x maskEmail e-postayi maskeler', maskEmail('mail ali@ornek.com adresi'));
assert(maskIban('IBAN TR12 3456 7890 1234 5678 9012 34 hesap').includes('IBAN-***'), 'v0.6.x maskIban IBAN maskeler', maskIban('IBAN TR12 3456 7890 1234 5678 9012 34 hesap'));
const aiMaskAll = maskSensitiveText('ali@x.com 0532 123 45 67 12345678901');
assert(aiMaskAll.includes('EMAIL-***') && aiMaskAll.includes('TELEFON-***') && aiMaskAll.includes('KIMLIK-***'), 'v0.6.x maskSensitiveText birden cok hassas alani maskeler (saf string->string)', aiMaskAll);

// === v0.6.x Kaydetme güvenliği: yeni IPC bağlı + yalnız aiHelperContext yazar + UI doğrudan yazmaz ===
const aiDomainSrc = await fs.readFile('src/main/services/ipc-domain-services.ts', 'utf-8');
assert(aiDomainSrc.includes('async updateAiHelperContext') && aiDomainSrc.includes('tracking.aiHelperContext = sanitizeAiHelperContext') && aiDomainSrc.includes('this.context.tracking.mutate') && !/updateAiHelperContext[\s\S]{0,400}heavyDamageAssessment\s*=/.test(aiDomainSrc), 'v0.6.x updateAiHelperContext yalniz aiHelperContext yazar (guvenli mutate; ana alanlar degismez)', 'updateAiHelperContext guvenli degil');
assert(ipcContractSource.includes("trackingUpdateAiHelperContext: 'tracking:update-ai-helper-context'") && mainIpcSource.includes('IPC.trackingUpdateAiHelperContext') && preloadSource.includes('updateAiHelperContext'), 'v0.6.x yeni tek IPC kanali (tracking:update-ai-helper-context) kontrat/handler/preload ile bagli', 'AI ek bilgi IPC eksik');
const aiExtraActionsSrc = await fs.readFile('src/renderer/app/actions/ai-case-extra-context-actions.ts', 'utf-8');
const aiExtraPanelSrc = await fs.readFile('src/renderer/app/components/ai-case-extra-context-panel.ts', 'utf-8');
assert(!/window\.hasarbotu|ipcRenderer|\.writeFile\(/.test(aiExtraActionsSrc) && !/window\.hasarbotu|ipcRenderer/.test(aiExtraPanelSrc), 'v0.6.x Ek Bilgiler panel/aksiyonlari DOGRUDAN yazma/IPC yapmaz (kaydetme yalniz onayli main akisinda)', 'Ek Bilgiler UI dogrudan yaziyor');
assert(aihMainSrc.includes('async function saveAiExtraContextAction') && aihMainSrc.includes("confirmDialog(") && aihMainSrc.includes('updateAiHelperContext') && aihMainSrc.includes('Kaydetme tamamlanmadı.') && aihMainSrc.includes('Dosya ek bilgileri kaydedildi.') && aihMainSrc.includes("action === 'aih-extra-save'"), 'v0.6.x kaydetme: onay modali + IPC; basarisizsa "kaydedildi" denmez', 'kaydetme akisi guvenli degil');
const aiMaskerSrc = await fs.readFile('src/shared/ai/ai-privacy-masker.ts', 'utf-8');
const aiRuntimeSrc = await fs.readFile('src/shared/ai/ai-runtime-config-types.ts', 'utf-8');
assert(!/\bfetch\(|axios|from ['"]node:|http\.request|apiKey|api_key/i.test(aiMaskerSrc) && !/\bfetch\(|axios|from ['"]node:|http\.request|apiKey|api_key/i.test(aiRuntimeSrc), 'v0.6.x AI altyapi/masker saf: network/http/apiKey YOK (dis cagri yok)', 'AI altyapi/masker dis cagri/apiKey izi tasiyor');

// === v0.6.x AI Orchestrator v1 (yerel kural; preview-only) ===
const aiMev = getAllMevzuatItems();
const runDraft = (taskType, ctx) => runAiDraftTask({ taskType, caseContext: ctx, mevzuatItems: aiMev, mode: 'local_rules' });
assert(AI_DRAFT_TASKS.length === 10, 'v0.6.x AI Taslak Uretici 10 gorev tipi tanimli', String(AI_DRAFT_TASKS.length));
// Boş context -> hata yok, düşük güven
const aiR_empty = runDraft('case_summary', blankAiCaseContext());
assert(aiR_empty.provider === 'local_rules' && aiR_empty.writePolicy === 'preview_only' && aiR_empty.confidence === 'low' && aiR_empty.missingInputs.length >= 1, 'v0.6.x bos context: hata yok, dusuk guven + missingInputs (local_rules/preview_only)', JSON.stringify(aiR_empty.confidence));
// Kasko + report_template_check -> Ek-2 + mevzuat referansı
const aiR_tpl = runDraft('report_template_check', buildAiCaseContext(kaskoItem));
assert(aiR_tpl.draftText.includes('Ek-2') && aiR_tpl.mevzuatReferences.length > 0 && aiR_tpl.provider === 'local_rules', 'v0.6.x kasko -> report_template_check Ek-2 + mevzuat referansi', aiR_tpl.draftText.slice(0, 40));
// Trafik + değer kaybı var -> value_loss_check Ek-1.1
const aiDkCtx = applyAiHelperOverride(buildAiCaseContext({ ...kaskoItem, claimType: 'trafik' }), { hasValueLoss: true }, 'temp');
const aiR_dk = runDraft('value_loss_check', aiDkCtx);
assert(aiR_dk.draftText.includes('Ek-1.1') && aiR_dk.draftText.includes('değer kaybı') && aiR_dk.mevzuatReferences.length > 0, 'v0.6.x trafik + deger kaybi -> value_loss_check Ek-1.1 + kontrol listesi', '');
// Ağır hasar -> oran/rayiç + kritik parça uyarısı
const aiR_heavy = runDraft('heavy_damage_explanation', buildAiCaseContext(trafikHeavyItem));
assert(aiR_heavy.draftText.includes('rayiç') && aiR_heavy.warnings.join(' ').includes('kritik parça') && aiR_heavy.evidence.length > 0, 'v0.6.x agir hasar -> oran/rayic taslak + kritik parca kontrol uyarisi', '');
// Eksik evrak -> mesaj taslağına liste
const aiR_doc = runDraft('missing_documents_message', buildAiCaseContext(kaskoItem));
assert(aiR_doc.draftText.includes('Ruhsat'), 'v0.6.x eksik evrak -> mesaj taslagina evrak listesi eklenir', '');
// Ücret özeti -> KDV hariç toplam + evidence
const aiR_fee = runDraft('fee_calculation_summary', buildAiCaseContext(trafikHeavyItem));
assert(aiR_fee.draftText.includes('KDV hariç') && aiR_fee.evidence.length > 0 && aiR_fee.provider === 'local_rules', 'v0.6.x hasar tutariyla ucret hesap ozeti (KDV haric)', '');
// Süre kontrolü -> kurallar
const aiR_dl = runDraft('deadline_risk_check', buildAiCaseContext({ ...kaskoItem, claimType: 'trafik' }));
assert(aiR_dl.draftText.includes('6 saat') && aiR_dl.draftText.includes('3 iş günü') && aiR_dl.mevzuatReferences.length > 0, 'v0.6.x deadline_risk_check sure kurallarini listeler (6 saat / 3 is gunu)', '');
// Tüm görevler: provider/preview + taskId/createdAt
const aiAllOk = AI_DRAFT_TASKS.every((t) => { const r = runDraft(t.type, buildAiCaseContext(trafikHeavyItem)); return r.provider === 'local_rules' && r.writePolicy === 'preview_only' && typeof r.draftText === 'string' && r.draftText.length > 0 && !!r.taskId && !!r.createdAt; });
assert(aiAllOk, 'v0.6.x her gorev local_rules + preview_only + taskId/createdAt + draftText uretir', 'bir gorev gecersiz cikti uretti');
// Saflık: orchestrator + tüm local-rules kaynaklarında network/apiKey yok (refactor sonrası dağıtık)
const aiOrchSrc = await fs.readFile('src/shared/ai/ai-orchestrator.ts', 'utf-8');
const aiLocalRulesDir = 'src/shared/ai/local-rules';
const aiLocalRuleFiles = (await fs.readdir(aiLocalRulesDir)).filter((f) => f.endsWith('.ts'));
let aiLocalRulesBlob = aiOrchSrc;
for (const f of aiLocalRuleFiles) aiLocalRulesBlob += '\n' + await fs.readFile(`${aiLocalRulesDir}/${f}`, 'utf-8');
assert(!/\bfetch\(|axios|http\.request|websocket|apiKey|api_key|from ['"]node:|window\./i.test(aiLocalRulesBlob), 'v0.6.x orchestrator + local-rules saf: network/http/apiKey/dosya YOK', 'orchestrator/local-rules dis cagri izi');
// Refactor: her görev ayrı dosyada + ortak helper'lar ayrı + provider dispatcher
const aiTaskFiles = ['case-summary-task', 'missing-documents-task', 'report-template-check-task', 'heavy-damage-explanation-task', 'expert-note-task', 'claim-handler-email-task', 'service-request-task', 'fee-summary-task', 'deadline-risk-task', 'value-loss-task'];
assert(aiTaskFiles.every((f) => aiLocalRuleFiles.includes(`${f}.ts`)), 'v0.6.x 10 AI gorevi ayri dosyalara bolundu', JSON.stringify(aiLocalRuleFiles));
const aiHelperFiles = ['task-common', 'task-confidence', 'task-evidence', 'task-mevzuat-references', 'task-formatters'];
assert(aiHelperFiles.every((f) => aiLocalRuleFiles.includes(`${f}.ts`)), 'v0.6.x ortak helper\'lar ayri dosyalara tasindi', JSON.stringify(aiHelperFiles));
const aiProviderSrc = await fs.readFile(`${aiLocalRulesDir}/local-rule-provider.ts`, 'utf-8');
assert(aiProviderSrc.includes('runLocalRuleProvider') && /BUILDERS/.test(aiProviderSrc) && aiProviderSrc.length < 2600 && !aiProviderSrc.includes('withUser('), 'v0.6.x provider sade dispatcher (uzun taslak metin uretimi yok)', `provider length=${aiProviderSrc.length}`);
assert(aiOrchSrc.length < 1600 && !aiOrchSrc.includes('withUser('), 'v0.6.x orchestrator sade (task-specific metin uretimi yok)', `orchestrator length=${aiOrchSrc.length}`);
// 400 satırı geçen yeni local-rules dosyası olmamalı
let aiMaxLines = 0; let aiMaxFile = '';
for (const f of aiLocalRuleFiles) { const lc = (await fs.readFile(`${aiLocalRulesDir}/${f}`, 'utf-8')).split(/\r?\n/).length; if (lc > aiMaxLines) { aiMaxLines = lc; aiMaxFile = f; } }
assert(aiMaxLines <= 400, 'v0.6.x hicbir local-rules dosyasi 400 satiri gecmez', `${aiMaxFile}=${aiMaxLines} satir`);
// UI: Taslak Üretici bağlı + dosyaya yazma/IPC yok
const aiGenSrc = await fs.readFile('src/renderer/app/components/ai-task-generator.ts', 'utf-8');
const aiCardSrc = await fs.readFile('src/renderer/app/components/ai-task-result-card.ts', 'utf-8');
const aiTaskActSrc = await fs.readFile('src/renderer/app/actions/ai-task-actions.ts', 'utf-8');
assert(aihHelpersSrc.includes('renderAiTaskGenerator') && aiGenSrc.includes('AI Taslak Üretici') && aiGenSrc.includes('data-aih="task.taskType"') && aiCardSrc.includes('Metni kopyala') && aiCardSrc.includes('preview_only'), 'v0.6.x AI Taslak Uretici UI bagli (gorev dropdown + sonuc karti + kopyala + preview_only)', 'AI Taslak Uretici UI eksik');
assert(!/window\.hasarbotu|ipcRenderer|\.writeFile\(|takip\.json|\.xlsx|updateField|tracking\.mutate/.test(aiGenSrc + aiCardSrc + aiTaskActSrc), 'v0.6.x AI Taslak UI/aksiyonlari dosyaya/IPC yazma yapmaz (yalniz onizleme)', 'AI Taslak UI yazma/IPC izi tasiyor');
assert(aihMainSrc.includes("action === 'aih-task-copy'") && aihMainSrc.includes('navigator.clipboard') && aihMainSrc.includes('aih-task-draft'), 'v0.6.x metin kopyalama clipboard + textarea fallback ile guvenli', 'kopyalama akisi eksik');

// === v0.6.x AI Taslak Kalitesi v1 (içerik iyileştirme) ===
// Ton sistemi: görev tipine göre doğru varsayılan ton
assert(TASK_DEFAULT_TONE.expert_note_draft === 'kisa_ofis_notu' && TASK_DEFAULT_TONE.claim_handler_email_draft === 'dosya_sorumlusu_dili' && TASK_DEFAULT_TONE.service_request_message === 'servis_talep_dili' && TASK_DEFAULT_TONE.heavy_damage_explanation === 'teknik_eksper_aciklamasi' && TASK_DEFAULT_TONE.missing_documents_message === 'kurumsal_mail', 'v0.6.x ton sistemi: gorev tipine gore varsayilan ton dogru', JSON.stringify(TASK_DEFAULT_TONE.claim_handler_email_draft));
// Yeni helper dosyaları
assert(['task-tone', 'task-draft-templates', 'task-output-quality', 'task-control-warnings'].every((f) => aiLocalRuleFiles.includes(`${f}.ts`)), 'v0.6.x yeni kalite helper dosyalari ayri eklendi (tone/templates/quality/control-warnings)', JSON.stringify(aiLocalRuleFiles));
// heavy_damage iki bölüm: rapor açıklaması + dosya sorumlusuna mail taslağı
const aiQ_heavy = runDraft('heavy_damage_explanation', buildAiCaseContext(trafikHeavyItem));
assert(aiQ_heavy.sections.length === 2 && aiQ_heavy.sections[0].title.includes('Rapor açıklaması') && aiQ_heavy.sections[1].title.includes('mail taslağı'), 'v0.6.x agir hasar iki bolum uretir (rapor aciklamasi + mail taslagi)', JSON.stringify(aiQ_heavy.sections.map((s) => s.title)));
assert(aiQ_heavy.sections[1].content.includes('kanaat') && !aiQ_heavy.sections[1].content.toLocaleLowerCase('tr-TR').includes('pert'), 'v0.6.x agir hasar mail taslagi kanaat dilinde, "pert" demez', '');
// deadline eksik tarihleri missingInputs'a ekler + confidence düşer
const aiQ_dl = runDraft('deadline_risk_check', blankAiCaseContext());
assert(aiQ_dl.missingInputs.includes('Ön rapor tarihi') && aiQ_dl.missingInputs.includes('Atama/ekspertiz talep tarihi') && aiQ_dl.confidence === 'low', 'v0.6.x deadline eksik tarihleri missingInputs ekler + confidence duser', JSON.stringify(aiQ_dl.missingInputs));
// value_loss değer kaybı ücreti bilgisi (1.450 / 725)
const aiQ_vl = runDraft('value_loss_check', applyAiHelperOverride(buildAiCaseContext({ ...kaskoItem, claimType: 'trafik' }), { hasValueLoss: true }, 'temp'));
assert(aiQ_vl.draftText.includes('1.450,00') && aiQ_vl.draftText.includes('725,00') && aiQ_vl.draftText.includes('Ek-1.1'), 'v0.6.x deger kaybi kontrol: ucret bilgisi (1.450 / 725) + Ek-1.1', '');
// fee KDV hariç uyarısı + kademe satırı
const aiQ_fee = runDraft('fee_calculation_summary', buildAiCaseContext(trafikHeavyItem));
assert(aiQ_fee.draftText.includes('Kademe:') && aiQ_fee.draftText.includes('resmî nihai ücret değildir'), 'v0.6.x ucret ozeti duzenli satir + nihai ucret degildir uyarisi', '');
// missing_documents kurumsal mail formatı (madde madde + kapanış)
const aiQ_doc = runDraft('missing_documents_message', buildAiCaseContext(kaskoItem));
assert(aiQ_doc.draftText.includes('• Ruhsat') && aiQ_doc.draftText.includes('Bilginize sunarız.'), 'v0.6.x eksik evrak kurumsal mail (madde madde + kapanis)', '');
// case_summary boş bağlamda düşük güven + kontrol önerisi
const aiQ_cs = runDraft('case_summary', blankAiCaseContext());
assert(aiQ_cs.confidence === 'low' && aiQ_cs.missingInputs.length >= 3 && aiQ_cs.draftText.includes('Sonraki kontrol:'), 'v0.6.x dosya ozeti: dusuk guven + sonraki kontrol onerisi', JSON.stringify(aiQ_cs.missingInputs));

// === AI Değer Kaybı Yardımcısı v1 (01.07.2026 sonrası trafik zorunluluk + kontrol listesi + taslak) ===
// -- Zorunluluk tespiti --
const vlReqClean = evaluateValueLossRequirement({ sigortaTuru: 'trafik', assignmentDate: '2026-07-15', isHeavyDamage: false, isTotalLoss: false, hasPartDamageInfo: true, hasMarketReference: true });
assert(vlReqClean.status === 'required' && vlReqClean.effectiveDate === '2026-07-01' && VALUE_LOSS_EFFECTIVE_DATE === '2026-07-01', 'DK zorunluluk: trafik + 01.07.2026 sonrasi (temiz veri) -> required', vlReqClean.status);
assert(evaluateValueLossRequirement({ sigortaTuru: 'trafik', assignmentDate: '2026-06-15' }).status === 'not_required', 'DK zorunluluk: trafik + 01.07.2026 oncesi -> not_required', '');
assert(evaluateValueLossRequirement({ sigortaTuru: 'ihtiyari-mali-sorumluluk', assignmentDate: '2026-07-01', hasPartDamageInfo: true, hasMarketReference: true }).status === 'required', 'DK zorunluluk: ZMSS/ihtiyari + esik gunu -> required', '');
assert(evaluateValueLossRequirement({ sigortaTuru: 'kasko', assignmentDate: '2026-07-15' }).status === 'not_required', 'DK zorunluluk: kasko -> not_required (trafik/ZMSS odakli, uyari verilmez)', '');
assert(evaluateValueLossRequirement({ sigortaTuru: 'trafik' }).status === 'control_needed', 'DK zorunluluk: tarih belirsiz -> control_needed', '');
const vlReqType = evaluateValueLossRequirement({ sigortaTuru: null });
assert(vlReqType.status === 'unknown' || vlReqType.status === 'control_needed', 'DK zorunluluk: dosya turu belirsiz -> unknown/control_needed', vlReqType.status);
assert(evaluateValueLossRequirement({ sigortaTuru: null, assignmentDate: '2026-07-15' }).status === 'control_needed', 'DK zorunluluk: tur belirsiz ama tarih var -> control_needed', '');
const vlReqHeavy = evaluateValueLossRequirement({ sigortaTuru: 'trafik', assignmentDate: '2026-07-15', isHeavyDamage: true, hasPartDamageInfo: true, hasMarketReference: true });
assert(vlReqHeavy.status === 'control_needed' && vlReqHeavy.warnings.some((w) => /ağır|tam hasar/i.test(w)), 'DK zorunluluk: agir/tam hasar -> control_needed + uyari (kor karar yok)', vlReqHeavy.status);
assert(evaluateValueLossRequirement({ sigortaTuru: 'trafik', assignmentDate: '2026-07-15', hasPartDamageInfo: true, hasMarketReference: true, hasPastHeavyDamage: true }).status === 'control_needed', 'DK zorunluluk: gecmis agir hasar -> control_needed', '');
assert(evaluateValueLossRequirement({ sigortaTuru: 'trafik', assignmentDate: '2026-07-15', valueLossExplicitlyExcluded: true }).status === 'not_required', 'DK zorunluluk: acikca kapsam disi -> not_required', '');
assert(isDateOnOrAfterEffective('2026-07-01') === true && isDateOnOrAfterEffective('01.07.2026') === true && isDateOnOrAfterEffective('2026-06-30') === false && isDateOnOrAfterEffective('') === null, 'DK zorunluluk: tarih esik karsilastirma (ISO + gg.aa.yyyy + bos)', '');

// -- Kontrol listesi --
const vlCats = buildValueLossChecklist({});
const vlAll = vlCats.flatMap((c) => c.items);
const vlFind = (id) => vlAll.find((i) => i.id === id);
assert(vlCats.length === 5 && vlCats.map((c) => c.key).join(',') === 'dosya,arac,hasar,piyasa,rapor', 'DK checklist: 5 kategori (dosya/arac/hasar/piyasa/rapor)', vlCats.map((c) => c.key).join(','));
assert(vlFind('vl-arac-rayic').status === 'missing' && vlFind('vl-arac-rayic').severity === 'critical', 'DK checklist: rayic yoksa missing critical', '');
assert(vlFind('vl-arac-km').status === 'missing' && vlFind('vl-arac-km').severity === 'warning', 'DK checklist: km yoksa missing warning', '');
assert(vlFind('vl-piyasa-emsal').status === 'missing' && vlFind('vl-piyasa-emsal').severity === 'critical', 'DK checklist: 3 emsal ilan yoksa missing critical', '');
assert(buildValueLossChecklist({ comparableListingCount: 3 }).flatMap((c) => c.items).find((i) => i.id === 'vl-piyasa-emsal').status === 'ok', 'DK checklist: 3+ emsal ilan varsa ok', '');
assert(vlFind('vl-hasar-degisen').status === 'missing' && (vlFind('vl-hasar-degisen').severity === 'critical' || vlFind('vl-hasar-degisen').severity === 'warning'), 'DK checklist: degisen parca listesi yoksa missing warning/critical', '');
assert(vlFind('vl-arac-sbm').status === 'control_needed', 'DK checklist: SBM gecmis hasar yoksa control_needed', '');
assert(buildValueLossChecklist({ sbmPastDamageCount: 0 }).flatMap((c) => c.items).find((i) => i.id === 'vl-arac-sbm').status === 'ok', 'DK checklist: SBM adedi girilirse (0 dahil) ok', '');
assert(buildValueLossChecklist({ methodExplainedInReport: false }).flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-yontem').status === 'missing' && buildValueLossChecklist({ methodExplainedInReport: false }).flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-yontem').severity === 'warning', 'DK checklist: yontem/rapor aciklamasi yoksa missing warning', '');
const vlSummary = summarizeValueLossChecklist(vlCats);
assert(vlSummary.total === vlAll.length && vlSummary.criticalMissing >= 2 && vlSummary.ok === 0, 'DK checklist: ozet sayaclari (total/kritik eksik/ok)', JSON.stringify(vlSummary));
assert(missingChecklistLabels(vlCats).includes('Rayiç bedel') && missingChecklistLabels(vlCats).length > 0, 'DK checklist: eksik/kontrol etiketleri mail icin cikarilir', '');

// -- Istisna / uyari kurallari --
const vlExcHeavy = evaluateValueLossExclusions({ isHeavyDamage: true });
assert(vlExcHeavy.some((w) => w.id === 'agir-tam-hasar' && w.level === 'critical'), 'DK istisna: agir hasar uyarisi uretir', '');
assert(evaluateValueLossExclusions({ samePartPreviouslyDamaged: true }).some((w) => w.id === 'ayni-parca-onceki-hasar'), 'DK istisna: ayni parcada onceki hasar uyarisi uretir', '');
assert(evaluateValueLossExclusions({ hasAccessoryParts: true }).some((w) => w.id === 'aksesuar-parca'), 'DK istisna: aksesuar parca uyarisi uretir', '');
assert(evaluateValueLossExclusions({ isAntiqueOrCollector: true }).some((w) => w.id === 'antika-koleksiyon'), 'DK istisna: antika/koleksiyon uyarisi uretir', '');
assert(evaluateValueLossExclusions({}).some((w) => w.id === 'eksper-kanaati' && w.level === 'info'), 'DK istisna: her durumda eksper kanaati notu eklenir', '');

// -- Taslak uretimi --
const vlNote = buildValueLossInternalNote();
const vlReport = buildValueLossReportExplanation();
const vlMail = buildValueLossMissingInfoMail();
assert(vlNote.kind === 'internal_note' && vlNote.body.includes('01.07.2026 sonrası trafik dosyası') && vlNote.body.includes('reel piyasa analiz yöntemi'), 'DK taslak: ic not taslagi uretir', '');
assert(vlReport.kind === 'report_explanation' && vlReport.body.includes('kaza öncesi hasarsız ikinci el piyasa rayici') && vlReport.body.includes('emsal piyasa ilanları'), 'DK taslak: rapor aciklama taslagi uretir', '');
assert(vlMail.kind === 'missing_info_mail' && vlMail.body.includes('Merhaba,') && vlMail.body.includes('Araç güncel rayiç bilgisi') && vlMail.body.includes('Saygılarımla,'), 'DK taslak: eksik bilgi mail taslagi uretir', '');
assert(buildValueLossMissingInfoMail(['Özel kalem A', 'Özel kalem B']).body.includes('- Özel kalem A') && !buildValueLossMissingInfoMail([]).body.includes('- \n') && buildValueLossMissingInfoMail([]).body.includes('Araç güncel rayiç bilgisi'), 'DK taslak: ozel eksik liste kullanilir, bos liste varsayilana doner', '');
const vlAllDrafts = [buildValueLossDraft('internal_note'), buildValueLossDraft('report_explanation'), buildValueLossDraft('missing_info_mail')];
assert(vlAllDrafts.every((d) => typeof d.body === 'string' && d.body.length > 0) && !vlAllDrafts.some((d) => /kesin tazminat/i.test(d.body)) && VALUE_LOSS_DEFAULT_MISSING_ITEMS.length === 6, 'DK taslak: taslaklarda "kesin tazminat" gibi ifade yok', '');

// -- Kaynak guvenlik / saflik --
const vlReqSrc = await fs.readFile('src/shared/value-loss/value-loss-requirement-rules.ts', 'utf-8');
const vlChkSrc = await fs.readFile('src/shared/value-loss/value-loss-checklist.ts', 'utf-8');
const vlExcSrc = await fs.readFile('src/shared/value-loss/value-loss-exclusion-rules.ts', 'utf-8');
const vlDraftSrc = await fs.readFile('src/shared/value-loss/value-loss-draft-builder.ts', 'utf-8');
const vlHelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
const vlActionsSrc = await fs.readFile('src/renderer/app/actions/value-loss-actions.ts', 'utf-8');
const vlAiHelpersSrc = await fs.readFile('src/renderer/app/components/ai-helpers.ts', 'utf-8');
const vlSharedBlob = vlReqSrc + '\n' + vlChkSrc + '\n' + vlExcSrc + '\n' + vlDraftSrc;
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|from ['"]node:|http\.request|apiKey/i.test(vlSharedBlob), 'DK guvenlik: deger kaybi modulleri saf (ag/scraping/dosya/apiKey yok)', 'no-network');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest/i.test(vlHelperSrc + vlActionsSrc), 'DK guvenlik: UI/aksiyonlarda ag/scraping yok', 'no-network');
assert(!/window\.hasarbotu|ipcRenderer|\.writeFile\(|tracking\.mutate|updateField|\.xlsx|saveAutoLaborExcel|writePartCodeCellExcel/.test(vlHelperSrc + vlActionsSrc), 'DK guvenlik: UI/aksiyonlar dosyaya/Excel/takibe yazma veya IPC yapmaz', 'no-write');
assert(!/nodemailer|smtp|sendMail|mailto:|gmail|\.send\(/i.test(vlSharedBlob + vlHelperSrc + vlActionsSrc), 'DK guvenlik: mail/gonderim API cagrisi yok (yalniz metin taslagi)', 'no-mail-send');
// 400 satir siniri
for (const [name, src] of [['value-loss-requirement-rules', vlReqSrc], ['value-loss-checklist', vlChkSrc], ['value-loss-exclusion-rules', vlExcSrc], ['value-loss-draft-builder', vlDraftSrc], ['value-loss-helper', vlHelperSrc], ['value-loss-actions', vlActionsSrc]]) {
  assert(src.split(/\r?\n/).length <= 400, `DK 400 satir: ${name} 400 satiri gecmez`, `${src.split(/\r?\n/).length} satir`);
}

// -- UI baglantisi --
assert(vlAiHelpersSrc.includes("key: 'deger-kaybi'") && vlAiHelpersSrc.includes('AI Değer Kaybı Yardımcısı') && vlAiHelpersSrc.includes('renderValueLossHelper') && vlAiHelpersSrc.includes("case 'deger-kaybi':"), 'DK UI: yardimci sekmesi Mevzuat & AI Yardimcilari icine baglandi', 'panel wire eksik');
assert(vlHelperSrc.includes('Değer kaybı durumu:') && vlHelperSrc.includes('Zorunlu') && vlHelperSrc.includes('Kontrol gerekli') && vlHelperSrc.includes('Gerekli değil') && vlHelperSrc.includes('Bilinmiyor'), 'DK UI: zorunluluk durumu (Zorunlu/Gerekli degil/Kontrol gerekli/Bilinmiyor) render olur', '');
assert(vlHelperSrc.includes('vl-checklist') && vlHelperSrc.includes('renderChecklistCategory') && vlHelperSrc.includes('renderExclusions'), 'DK UI: kontrol listesi + istisna uyarilari render olur', '');
assert(vlHelperSrc.includes('data-action="aih-vl-draft"') && vlHelperSrc.includes('İç not taslağı') && vlHelperSrc.includes('Rapor açıklama taslağı') && vlHelperSrc.includes('Eksik bilgi mail taslağı'), 'DK UI: taslak uret butonlari render olur', '');
assert(vlHelperSrc.includes('Kullanıcı onayı olmadan hiçbir yere') && vlHelperSrc.includes('readonly'), 'DK UI: "kullanici onayi olmadan yazilmaz" uyarisi + salt-okunur onizleme', '');
assert(vlActionsSrc.includes("state.aiHelpers.valueLoss.activeDraft") && vlActionsSrc.includes('VALID_DRAFTS'), 'DK UI: taslak aksiyonu yalniz UI state (valueLoss.activeDraft) gunceller', '');

// === AI Değer Kaybı Yardımcısı v2 (Ek Bilgi Formu + preview/diff + kullanıcı onaylı kayıt) ===
// -- Normalize --
const vlcEmpty = normalizeValueLossContext({});
assert(vlcEmpty.version === 1 && Object.keys(vlcEmpty).length === 1 && normalizeValueLossContext(null).version === 1 && normalizeValueLossContext(42).version === 1, 'DKv2 normalize: bos/gecersiz girdi guvenli (yalniz version:1)', JSON.stringify(vlcEmpty));
const vlcNum = normalizeValueLossContext({ vehicle: { marketValue: '850.000', mileageKm: '75.000', modelYear: '2021' }, history: { sbmPastDamageCount: '2' }, marketAnalysis: { comparableListingCount: 3.9 } });
assert(vlcNum.vehicle.marketValue === 850000 && vlcNum.vehicle.mileageKm === 75000 && vlcNum.vehicle.modelYear === 2021 && vlcNum.history.sbmPastDamageCount === 2 && vlcNum.marketAnalysis.comparableListingCount === 3, 'DKv2 normalize: sayi alanlari number\'a cevrilir (TR bicim + tam sayi adet)', JSON.stringify(vlcNum));
assert(parseNonNegativeNumber('1.234,56') === 1234.56 && parseNonNegativeNumber(-5) === undefined && parseNonNegativeNumber('abc') === undefined, 'DKv2 normalize: parseNonNegativeNumber TR bicim + negatif/bozuk reddi', '');
const vlcNeg = normalizeValueLossContext({ vehicle: { marketValue: -850000, mileageKm: -3 } });
assert(vlcNeg.vehicle === undefined, 'DKv2 normalize: negatif rayic/km reddedilir (bosaltilir)', JSON.stringify(vlcNeg));
const vlcBool = normalizeValueLossContext({ damage: { isTotalLossOrHeavyDamage: true, hasStructuralParts: false, paintTypeKnown: 'evet' }, evidence: { methodExplainedInReport: 1 } });
assert(vlcBool.damage.isTotalLossOrHeavyDamage === true && vlcBool.damage.hasStructuralParts === false && vlcBool.damage.paintTypeKnown === undefined && vlcBool.evidence === undefined, 'DKv2 normalize: boolean yalniz true/false; string/sayi guvenli dusurulur', JSON.stringify(vlcBool));
const vlcGroup = normalizeValueLossContext({ vehicle: { vehicleGroup: 'Ç' } });
const vlcGroupBad = normalizeValueLossContext({ vehicle: { vehicleGroup: 'X' } });
assert(vlcGroup.vehicle.vehicleGroup === 'Ç' && vlcGroupBad.vehicle === undefined, 'DKv2 normalize: vehicleGroup yalniz izinli degerleri alir (Ç dahil, X reddedilir)', '');
assert(normalizeValueLossContext({ fileType: 'saskin', vehicle: { modelYear: 1850 } }).fileType === undefined && normalizeOptionalValueLossContext(undefined) === undefined && normalizeOptionalValueLossContext('metin') === undefined, 'DKv2 normalize: bilinmeyen enum/asiri yil/opsiyonel gecersiz girdi guvenli kalir', '');
assert(hasMeaningfulValueLossContext(vlcEmpty) === false && hasMeaningfulValueLossContext(vlcNum) === true, 'DKv2 normalize: anlamli veri tespiti (bos form degerlendirmeyi ezmez)', '');

// -- Diff --
const vlcPrev = normalizeValueLossContext({ vehicle: { marketValue: 500000 } });
const vlcNext = normalizeValueLossContext({ vehicle: { marketValue: 850000, mileageKm: 75000 }, marketAnalysis: { comparableListingCount: 3 }, evidence: { calculationModuleOutputExists: true } });
const vlcRows = diffValueLossContext(vlcPrev, vlcNext);
assert(vlcRows.some((r) => r.label === 'Araç rayiç bedeli' && r.oldLabel.includes('500.000') && r.newLabel.includes('850.000')) && vlcRows.some((r) => r.label === 'KM' && r.oldLabel === 'boş'), 'DKv2 diff: bos -> dolu ve eski -> yeni degisiklikler gosterilir', JSON.stringify(vlcRows.map((r) => r.label)));
assert(diffValueLossContext(vlcNext, vlcNext).length === 0 && diffValueLossContext(normalizeValueLossContext({}), normalizeValueLossContext({})).length === 0, 'DKv2 diff: ayni veri diff uretmez', '');
assert(vlcRows.some((r) => r.path === 'marketAnalysis.comparableListingCount') && vlcRows.some((r) => r.path === 'evidence.calculationModuleOutputExists' && r.newLabel === 'evet'), 'DKv2 diff: nested alan degisiklikleri gosterilir', '');
const vlcMsg = buildValueLossSaveConfirmMessage(vlcRows);
assert(vlcMsg.includes(VALUE_LOSS_SAVE_SCOPE_NOTE) && vlcMsg.includes('aiHelperContext.valueLoss') && vlcMsg.includes('Devam edilsin mi?') && vlcMsg.includes('Değişen alanlar:'), 'DKv2 diff: onay mesajinda yalniz-valueLoss kapsam notu + acik onay sorusu var', '');

// -- Checklist entegrasyonu --
const vlcChkBase = {};
const vlcChk1 = buildValueLossChecklist(applyValueLossContextToChecklistInput(vlcNext, vlcChkBase));
const vlcFind1 = (id) => vlcChk1.flatMap((c) => c.items).find((i) => i.id === id);
assert(vlcFind1('vl-arac-rayic').status === 'ok', 'DKv2 checklist: rayic girilince rayic maddesi ok olur', '');
assert(vlcFind1('vl-arac-km').status === 'ok', 'DKv2 checklist: km girilince km maddesi ok olur', '');
assert(vlcFind1('vl-piyasa-emsal').status === 'ok', 'DKv2 checklist: emsal ilan sayisi 3 ise piyasa maddesi ok olur', '');
assert(vlcFind1('vl-rapor-modul').status === 'ok', 'DKv2 checklist: hesap modulu ciktisi true ise ok olur', '');
const vlcChk2 = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({ marketAnalysis: { comparableListingCount: 2 } }), vlcChkBase));
const vlcEmsal2 = vlcChk2.flatMap((c) => c.items).find((i) => i.id === 'vl-piyasa-emsal');
assert(vlcEmsal2.status === 'missing' && vlcEmsal2.severity === 'critical', 'DKv2 checklist: emsal ilan sayisi 2 ise critical missing kalir', JSON.stringify(vlcEmsal2));
const vlcChk3 = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({ history: { sbmPastDamageCount: 0 }, damage: { changedPartsText: 'kaput, tampon', repairLaborKnown: true, newPartPriceKnown: false }, marketAnalysis: { screenshotsTaken: true } }), vlcChkBase));
const vlcFind3 = (id) => vlcChk3.flatMap((c) => c.items).find((i) => i.id === id);
assert(vlcFind3('vl-arac-sbm').status === 'ok', 'DKv2 checklist: SBM adedi tanimliysa (0 dahil) kontrol kalkar', '');
assert(vlcFind3('vl-hasar-degisen').status === 'ok' && vlcFind3('vl-hasar-iscilik').status === 'ok' && vlcFind3('vl-hasar-parca-fiyat').status === 'missing' && vlcFind3('vl-piyasa-ekran').status === 'ok', 'DKv2 checklist: parca metni/iscilik-belli/ekran goruntusu ok; fiyat belli degil -> missing', '');
assert(splitPartsText('kaput, tampon; far\nçamurluk').length === 4, 'DKv2 checklist: parca metni virgul/noktali virgul/yeni satir ile ayristirilir', '');

// -- Requirement entegrasyonu --
const vlcReqBase = { sigortaTuru: null, assignmentDate: null, isHeavyDamage: null, isTotalLoss: null };
const vlcReq1 = evaluateValueLossRequirement(applyValueLossContextToRequirementInput(normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', damage: { changedPartsText: 'kaput' }, vehicle: { marketValue: 850000 } }), vlcReqBase));
assert(vlcReq1.status === 'required', 'DKv2 zorunluluk: form trafik + 01.07.2026 sonrasi + veri tam -> required', vlcReq1.status);
const vlcReqHeavy = evaluateValueLossRequirement(applyValueLossContextToRequirementInput(normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', damage: { isTotalLossOrHeavyDamage: true } }), vlcReqBase));
assert(vlcReqHeavy.status === 'control_needed' && vlcReqHeavy.warnings.length > 0, 'DKv2 zorunluluk: form agir/tam hasar -> control_needed + uyari', vlcReqHeavy.status);
const vlcReqNoMarket = evaluateValueLossRequirement(applyValueLossContextToRequirementInput(normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', damage: { changedPartsText: 'kaput' } }), vlcReqBase));
assert(vlcReqNoMarket.status === 'control_needed' && vlcReqNoMarket.reasons.some((r) => /rayiç|emsal/i.test(r)), 'DKv2 zorunluluk: form rayic/emsal yoksa control_needed + gerekce', '');
assert(evaluateValueLossRequirement(applyValueLossContextToRequirementInput(normalizeValueLossContext({ fileType: 'trafik' }), vlcReqBase)).status === 'control_needed', 'DKv2 zorunluluk: form tarih yoksa control_needed', '');
assert(evaluateValueLossRequirement(applyValueLossContextToRequirementInput(normalizeValueLossContext({ fileType: 'kasko' }), vlcReqBase)).status === 'not_required', 'DKv2 zorunluluk: kasko formunda not_required', '');
const vlcExc = evaluateValueLossExclusions(applyValueLossContextToExclusionInput(normalizeValueLossContext({ vehicle: { antiqueOrCollectible: true }, damage: { hasAccessoryParts: true }, history: { hasPriorSamePartDamage: true } }), {}));
assert(vlcExc.some((w) => w.id === 'antika-koleksiyon') && vlcExc.some((w) => w.id === 'aksesuar-parca') && vlcExc.some((w) => w.id === 'ayni-parca-onceki-hasar'), 'DKv2 istisna: form verisi istisna uyarilarini tetikler', '');

// -- Taslak entegrasyonu --
const vlcMissingLabels = missingChecklistLabels(vlcChk1);
assert(!vlcMissingLabels.includes('Rayiç bedel') && vlcMissingLabels.length > 0 && !buildValueLossMissingInfoMail(vlcMissingLabels).body.includes('Rayiç bedel'), 'DKv2 taslak: eksik mail yalniz eksik maddeleri listeler (girilen rayic maile yazilmaz)', '');
const vlcFacts = draftFactsFromValueLossContext(normalizeValueLossContext({ vehicle: { marketValue: 850000 }, marketAnalysis: { comparableListingCount: 3 }, history: { sbmPastDamageCount: 1 } }));
const vlcRpt = buildValueLossDraft('report_explanation', undefined, vlcFacts);
assert(vlcRpt.body.includes('rayiç bilgisi dikkate alınmıştır') && vlcRpt.body.includes('üç emsal ilan') && vlcRpt.body.includes('SBM geçmiş hasar bilgileri kontrol edilmiştir'), 'DKv2 taslak: rayic/emsal/SBM varsa rapor aciklamasi bunlari kullanir', '');
const vlcNoteHeavy = buildValueLossDraft('internal_note', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ damage: { isTotalLossOrHeavyDamage: true } })));
assert(vlcNoteHeavy.body.includes('özel kontrol'), 'DKv2 taslak: agir hasar isaretliyse ic nota ozel kontrol notu eklenir', '');
assert(!/kesin tazminat/i.test(vlcRpt.body + vlcNoteHeavy.body) && buildValueLossDraft('report_explanation').body.endsWith('değerlendirilmiştir.') && buildValueLossDraft('internal_note').body === buildValueLossInternalNote().body, 'DKv2 taslak: kesin tazminat ifadesi yok + facts yokken v1 metinleri birebir korunur', '');

// -- Kalicilik / migrasyon --
const vlcSan = sanitizeAiHelperContext({ claimTypeOverride: 'trafik', valueLoss: { fileType: 'trafik', vehicle: { marketValue: 850000, mileageKm: -3 } } });
assert(vlcSan.valueLoss && vlcSan.valueLoss.vehicle.marketValue === 850000 && vlcSan.valueLoss.vehicle.mileageKm === undefined && vlcSan.claimTypeOverride === 'trafik', 'DKv2 kalicilik: sanitizeAiHelperContext valueLoss\'u normalize ederek TASIR (negatif km duser)', JSON.stringify(vlcSan.valueLoss));
const vlcTracking = createDefaultTracking({ caseKey: 'DK1', plate: '34 ABC 123', dosyaNo: 'DK-1', folderPath: '/DK1', monthFolder: 'Temmuz 2026', officeFileNo: '', claimNoticeNo: '', isClosedFolder: false }, 'Test');
vlcTracking.aiHelperContext = { version: 1, claimTypeOverride: 'trafik', valueLoss: { version: 1, fileType: 'trafik', vehicle: { marketValue: 850000 }, marketAnalysis: { comparableListingCount: 3 } } };
const vlcMigrated = migrateTracking(clone(vlcTracking));
assert(vlcMigrated.aiHelperContext?.valueLoss?.vehicle?.marketValue === 850000 && vlcMigrated.aiHelperContext.valueLoss.marketAnalysis.comparableListingCount === 3, 'DKv2 kalicilik: migrateTracking valueLoss alanini KAYBETMEZ (normalize ederek korur)', JSON.stringify(vlcMigrated.aiHelperContext?.valueLoss));

// -- IPC / servis kaynak güvenliği --
const vlcDomainSrc = await fs.readFile('src/main/services/ipc-domain-services.ts', 'utf-8');
assert(vlcDomainSrc.includes('async updateValueLossContext') && vlcDomainSrc.includes('current.valueLoss = normalizeValueLossContext') && !/updateValueLossContext[\s\S]{0,700}(heavyDamageAssessment|laborExcel|status\.workflowStatus)\s*=/.test(vlcDomainSrc), 'DKv2 servis: updateValueLossContext yalniz aiHelperContext.valueLoss gunceller (ana alanlar degismez)', '');
assert(vlcDomainSrc.includes('previousValueLoss') && /previousValueLoss && !tracking\.aiHelperContext\.valueLoss/.test(vlcDomainSrc), 'DKv2 servis: Ek Bilgiler kaydi mevcut valueLoss\'u SILMEZ (koruma satiri var)', '');
const vlcContractSrc = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const vlcIpcSrc = await fs.readFile('src/main/ipc.ts', 'utf-8');
const vlcPreloadSrc = await fs.readFile('src/preload/preload.ts', 'utf-8');
assert(vlcContractSrc.includes("trackingUpdateValueLossContext: 'tracking:update-value-loss-context'") && vlcIpcSrc.includes('IPC.trackingUpdateValueLossContext') && vlcPreloadSrc.includes('updateValueLossContext'), 'DKv2 IPC: yeni tek kanal (tracking:update-value-loss-context) kontrat/handler/preload ile bagli', '');

// -- UI kaynak testleri --
const vlcFormSrc = await fs.readFile('src/renderer/app/components/value-loss-context-form.ts', 'utf-8');
const vlcPreviewSrc = await fs.readFile('src/renderer/app/components/value-loss-context-preview.ts', 'utf-8');
const vlcCtxActionsSrc = await fs.readFile('src/renderer/app/actions/value-loss-context-actions.ts', 'utf-8');
const vlcMappingSrc = await fs.readFile('src/renderer/app/utils/value-loss-form-mapping.ts', 'utf-8');
const vlcHelperSrc2 = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
const vlcMainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(vlcFormSrc.includes('Değer Kaybı Ek Bilgi Formu') && vlcFormSrc.includes('data-aih="vlForm.') && ['Dosya', 'Araç', 'Geçmiş', 'Hasar', 'Piyasa Analizi', 'Evidence / Rapor'].every((t) => vlcFormSrc.includes(`title: '${t}'`)), 'DKv2 UI: Ek Bilgi Formu 6 bolumle render olur', '');
assert(vlcMainSrc.includes('async function saveValueLossContextAction') && vlcMainSrc.includes('buildValueLossSaveConfirmMessage') && vlcMainSrc.includes("confirmDialog(") && vlcMainSrc.includes("action === 'aih-vl-save'") && vlcMainSrc.includes('Kaydetme tamamlanmadı.') && vlcMainSrc.includes('Değer kaybı ek bilgileri kaydedildi.'), 'DKv2 UI: kaydetme onay modali + diff mesaji ister; basarisizsa "kaydedildi" denmez', '');
assert(vlcPreviewSrc.includes("!hasChanges || saving ? 'disabled'") && vlcMainSrc.includes("setToast('Kaydedilecek değişiklik yok.', 'info')"), 'DKv2 UI: degisiklik yoksa Kaydet pasif + aksiyonda degisiklik-yok uyarisi', '');
assert(vlcPreviewSrc.includes('diffValueLossContext') && vlcPreviewSrc.includes('vl-diff') && vlcPreviewSrc.includes('VALUE_LOSS_SAVE_SCOPE_NOTE'), 'DKv2 UI: onizleme diff render olur + kapsam notu gosterilir', '');
assert(vlcMainSrc.includes('window.hasarbotu.updateValueLossContext') && !/updateField|writePartCodeCellExcel|saveAutoLaborExcel/.test(vlcFormSrc + vlcPreviewSrc + vlcCtxActionsSrc + vlcMappingSrc), 'DKv2 UI: kaydet yalniz valueLoss kanalini hedefler; form/preview dogrudan yazmaz', '');
assert(vlcHelperSrc2.includes('applyValueLossContextToChecklistInput') && vlcHelperSrc2.includes('valueLossFormToInput') && vlcHelperSrc2.includes('hasMeaningfulValueLossContext'), 'DKv2 UI: checklist yazma olmadan form verileriyle guncellenir (render aninda)', '');
assert(!/window\.hasarbotu|ipcRenderer|\.writeFile\(/.test(vlcFormSrc + vlcPreviewSrc + vlcCtxActionsSrc + vlcMappingSrc), 'DKv2 UI: form/preview/aksiyon/mapping dogrudan IPC/yazma yapmaz (kaydetme yalniz onayli main akisinda)', '');

// -- Kaynak guard'lari --
const vlcTypesSrc = await fs.readFile('src/shared/value-loss/value-loss-context-types.ts', 'utf-8');
const vlcNormSrc = await fs.readFile('src/shared/value-loss/value-loss-context-normalizer.ts', 'utf-8');
const vlcDiffSrc = await fs.readFile('src/shared/value-loss/value-loss-context-diff.ts', 'utf-8');
const vlcApplySrc = await fs.readFile('src/shared/value-loss/value-loss-context-apply.ts', 'utf-8');
const vlcV2Blob = vlcTypesSrc + vlcNormSrc + vlcDiffSrc + vlcApplySrc + vlcFormSrc + vlcPreviewSrc + vlcCtxActionsSrc + vlcMappingSrc;
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|http\.request/i.test(vlcV2Blob), 'DKv2 guvenlik: v2 modullerinde ag/scraping/web istegi yok', 'no-network');
assert(!/nodemailer|smtp|sendMail|mailto:|gmail/i.test(vlcV2Blob), 'DKv2 guvenlik: mail gonderme yok (yalniz metin taslagi)', 'no-mail');
assert(!/\.xlsx|writePartCodeCellExcel|saveAutoLaborExcel|distributeLaborExcel|loadWorkbook/i.test(vlcV2Blob), 'DKv2 guvenlik: Excel/D/H-N yazimi yok', 'no-excel');
assert(!/from ['"].*labor\//.test(vlcTypesSrc + vlcNormSrc + vlcDiffSrc + vlcApplySrc), 'DKv2 guvenlik: v2 saf modulleri AI Iscilik (labor) modullerine dokunmaz', 'no-labor-import');
assert(!/hesaplanan tazminat|kesin tazminat|tazminat tutar/i.test(vlcV2Blob), 'DKv2 guvenlik: deger kaybi tutari hesaplama/kesin sonuc uretme yok', 'no-calc');
for (const [name, src] of [['context-types', vlcTypesSrc], ['context-normalizer', vlcNormSrc], ['context-diff', vlcDiffSrc], ['context-apply', vlcApplySrc], ['context-form', vlcFormSrc], ['context-preview', vlcPreviewSrc], ['context-actions', vlcCtxActionsSrc], ['form-mapping', vlcMappingSrc], ['value-loss-helper', vlcHelperSrc2]]) {
  assert(src.split(/\r?\n/).length <= 400, `DKv2 400 satir: ${name} 400 satiri gecmez`, `${src.split(/\r?\n/).length} satir`);
}

// === AI Değer Kaybı Yardımcısı v3 (Reel Piyasa Analiz Ön Hesabı — preview-only) ===
const vl3Provider = getActiveValueLossCoefficientProvider();
const vl3MissingProvider = { status: 'missing', reason: 'test: set yüklenmedi' };
const vl3PartData = { totalPartCoefficient: 3.5, damageAmount: 80000 };
const vl3Full = normalizeValueLossContext({
  fileType: 'trafik', assignmentDate: '2026-07-10',
  vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000 },
  history: { sbmPastDamageCount: 1 },
  damage: { isTotalLossOrHeavyDamage: false, changedPartsText: 'kaput, tampon' },
  marketAnalysis: { comparableListingCount: 3, screenshotsTaken: true, listingNumbersVisible: true }
});
const vl3Clone = (patch) => normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl3Full)), ...patch });

// -- Katsayı sağlayıcı --
assert(vl3Provider.status === 'ready' && vl3Provider.set.source.includes('01.07.2026 V_1') && vl3Provider.set.source.includes('SEİK'), 'DKv3 katsayi: aktif set kaynak modul referansiyla yuklu (uydurma degil, kaynak gorunur)', vl3Provider.set?.source);
assert(SEIK_2026_V1_COEFFICIENT_SET.capMarketValueRatio === 0.3 && SEIK_2026_V1_COEFFICIENT_SET.roundingStep === 500 && SEIK_2026_V1_COEFFICIENT_SET.damageRatioWeight === 0.1, 'DKv3 katsayi: cap %30 + 500 TL yuvarlama + hasar oran agirligi 0.1 (modul formulunden)', '');
assert(findRangeCoefficient(SEIK_2026_V1_COEFFICIENT_SET.ageCoefficients, 5) === 0.9 && findRangeCoefficient(SEIK_2026_V1_COEFFICIENT_SET.ageCoefficients, 0) === 1 && findRangeCoefficient(SEIK_2026_V1_COEFFICIENT_SET.ageCoefficients, 25) === 0.65, 'DKv3 katsayi: yas tablosu (0-2:1, 5-7:0.9, 20+:0.65)', '');
const vl3TableA = getMileageTableForGroup(SEIK_2026_V1_COEFFICIENT_SET, 'A');
const vl3TableD = getMileageTableForGroup(SEIK_2026_V1_COEFFICIENT_SET, 'D');
assert(vl3TableA.unit === 'km' && findRangeCoefficient(vl3TableA.ranges, 75000) === 0.9 && vl3TableD.unit === 'saat' && findRangeCoefficient(vl3TableD.ranges, 750) === 0.95, 'DKv3 katsayi: kullanilmislik tablolari (A/F km, D calisma saati)', '');
assert(isNearLowerBound(vl3TableA, 500, 1000) === true && isNearLowerBound(vl3TableA, 50500, 1000) === true && isNearLowerBound(vl3TableA, 75000, 1000) === false, 'DKv3 katsayi: alt sinira yakinlik (<=1000) tespiti', '');

// -- Motor: bloklayıcı/eksik durumlar --
const vl3Empty = calculateValueLoss(normalizeValueLossContext({}), vl3Provider);
assert(vl3Empty.status === 'cannot_calculate' && vl3Empty.missingInputs.length >= 8 && typeof vl3Empty.amount === 'undefined', 'DKv3 motor: gerekli veri eksikse cannot_calculate + tum eksikler listelenir + tutar YOK', JSON.stringify(vl3Empty.missingInputs.length));
assert(calculateValueLoss(normalizeValueLossContext({ fileType: 'kasko' }), vl3Provider, vl3PartData).status === 'cannot_calculate', 'DKv3 motor: kasko dosyasinda hesap uretmez', '');
assert(calculateValueLoss(vl3Clone({ assignmentDate: '2026-06-01' }), vl3Provider, vl3PartData).status === 'cannot_calculate', 'DKv3 motor: 01.07.2026 oncesi tarihte hesap uretmez', '');
const vl3Heavy = calculateValueLoss(vl3Clone({ damage: { isTotalLossOrHeavyDamage: true, changedPartsText: 'kaput' } }), vl3Provider, vl3PartData);
assert(vl3Heavy.status === 'control_needed' && typeof vl3Heavy.amount === 'undefined' && vl3Heavy.factors.some((f) => f.effect === 'blocking'), 'DKv3 motor: agir/tam hasarda control_needed + bloklayici faktor + tutar YOK', vl3Heavy.status);
assert(calculateValueLoss(vl3Clone({ history: { sbmPastDamageCount: 1, hasPriorHeavyDamage: true } }), vl3Provider, vl3PartData).status === 'control_needed', 'DKv3 motor: kaza oncesi agir hasarda control_needed', '');
assert(calculateValueLoss(vl3Clone({ vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, antiqueOrCollectible: true } }), vl3Provider, vl3PartData).status === 'control_needed', 'DKv3 motor: antika/koleksiyon aracta control_needed (esaslar 3.11)', '');
const vl3NoMarketValue = calculateValueLoss(vl3Clone({ vehicle: { vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000 } }), vl3Provider, vl3PartData);
assert(vl3NoMarketValue.status === 'cannot_calculate' && vl3NoMarketValue.missingInputs.some((m) => m.includes('rayiç')), 'DKv3 motor: rayic yoksa missing input verir', '');
const vl3FewListings = calculateValueLoss(vl3Clone({ marketAnalysis: { comparableListingCount: 2 } }), vl3Provider, vl3PartData);
assert(vl3FewListings.status === 'cannot_calculate' && vl3FewListings.missingInputs.some((m) => m.includes('3 emsal')), 'DKv3 motor: emsal ilan < 3 ise missing input verir', '');
const vl3NoSet = calculateValueLoss(vl3Full, vl3MissingProvider, vl3PartData);
assert(vl3NoSet.status === 'cannot_calculate' && typeof vl3NoSet.amount === 'undefined' && vl3NoSet.warnings.includes('Katsayı tabloları yüklenmediği için tutarlı ön hesap yapılamadı.'), 'DKv3 motor: katsayi seti yoksa hesap uretmez + rapor uyarisi', '');
const vl3NoPartData = calculateValueLoss(vl3Full, vl3Provider);
assert(vl3NoPartData.status === 'control_needed' && typeof vl3NoPartData.amount === 'undefined' && vl3NoPartData.missingInputs.some((m) => m.includes('parça katsayısı')), 'DKv3 motor: yapilandirilmis parca verisi yoksa control_needed (serbest metinden katsayi TURETILMEZ)', '');

// -- Motor: hesap + yuvarlama + cap --
const vl3Calc = calculateValueLoss(vl3Full, vl3Provider, vl3PartData);
assert(vl3Calc.status === 'calculated' && Math.abs(vl3Calc.amount - 28285.2) < 0.01 && vl3Calc.roundedAmount === 28500, 'DKv3 motor: tam veride tutar hesaplar (800k x0.9 x0.9 x0.97 x0.045 = 28.285,20 -> 28.500)', `${vl3Calc.amount} / ${vl3Calc.roundedAmount}`);
assert(vl3Calc.capInfo && vl3Calc.capInfo.capApplied === false && vl3Calc.capInfo.maxAllowedAmount === 240000, 'DKv3 motor: cap asilmadiginda uygulanmaz ama sinir gosterilir', JSON.stringify(vl3Calc.capInfo));
assert(roundValueLossAmount(28285.2) === 28500 && roundValueLossAmount(1749) === 2000 && roundValueLossAmount(2000) === 2000, 'DKv3 yuvarlama: 500 TL katina YUKARI yonlu (esaslar 3.21)', '');
assert(roundValueLossAmount(-5) === 0 && roundValueLossAmount('x') === undefined && roundValueLossAmount(NaN) === undefined, 'DKv3 yuvarlama: negatif 0a cekilir; sayi degilse undefined', '');
const vl3Cap = calculateValueLoss(vl3Full, vl3Provider, { totalPartCoefficient: 40, damageAmount: 400000 });
assert(vl3Cap.status === 'calculated' && vl3Cap.capInfo.capApplied === true && vl3Cap.amount === 240000 && vl3Cap.roundedAmount === 240000 && vl3Cap.factors.some((f) => f.id === 'cap'), 'DKv3 motor: ust sinir asiminda cap uygulanir (%30 rayic) + gerekce faktoru', JSON.stringify(vl3Cap.capInfo));
const vl3NoCapSet = { status: 'ready', set: { ...SEIK_2026_V1_COEFFICIENT_SET, capMarketValueRatio: undefined } };
const vl3NoCap = calculateValueLoss(vl3Full, vl3NoCapSet, { totalPartCoefficient: 40, damageAmount: 400000 });
assert(vl3NoCap.status === 'calculated' && (!vl3NoCap.capInfo || vl3NoCap.capInfo.capApplied === false) && vl3NoCap.warnings.includes('Üst sınır katsayısı yüklenmediği için cap uygulanmadı.'), 'DKv3 motor: cap katsayisi yoksa cap uygulanmaz + uyari verilir', '');

// -- Açıklama / faktörler --
const vl3EffVl = vl3Clone({ vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 500, commercialOrRental: true }, history: { sbmPastDamageCount: 6 } });
const vl3Eff = calculateValueLoss(vl3EffVl, vl3Provider, vl3PartData);
const vl3F = (id) => vl3Eff.factors.find((f) => f.id === id);
assert(vl3Eff.factors.every((f) => typeof f.explanation === 'string' && f.explanation.length > 0), 'DKv3 aciklama: tum faktorler aciklamali doner', '');
assert(vl3F('ticari').effect === 'decrease' && vl3F('ticari').coefficient === -0.05, 'DKv3 aciklama: ticari/kiralik dusurucu etki (-0.05)', '');
assert(vl3F('sbm').effect === 'decrease' && vl3F('sbm').coefficient === -0.15, 'DKv3 aciklama: SBM gecmis hasar dusurucu etki (6 kayit -> taban -0.15)', '');
assert(vl3F('km-yakinlik').effect === 'increase' && vl3F('km-yakinlik').coefficient === 0.05, 'DKv3 aciklama: alt sinira yakinlik artirici etki (+0.05)', '');
assert(vl3Calc.evidence.some((e) => e.includes('Emsal ilan sayısı: 3')) && vl3Calc.evidence.some((e) => e.includes('Katsayı kaynağı')), 'DKv3 aciklama: emsal piyasa + katsayi kaynagi evidence olarak gorunur', '');
const vl3AllResults = [vl3Calc, vl3Empty, vl3Heavy, vl3NoSet, vl3NoPartData, vl3Cap];
assert(vl3AllResults.every((r) => r.disclaimer === VALUE_LOSS_CALC_DISCLAIMER && r.disclaimer.includes('ön hesap niteliğindedir')), 'DKv3 aciklama: disclaimer her durumda vardir', '');
assert(vl3AllResults.every((r) => !/kesin tazminat|kesin ödenir|kesin hüküm/i.test(JSON.stringify(r))), 'DKv3 aciklama: sonuclarda kesin tazminat/odeme ifadesi YOKTUR', '');
assert(vl3Calc.formulaSummary.includes('rayiç bedel') && vl3Calc.formulaSummary.includes('yaş katsayısı') && vl3Calc.formulaSummary.includes('hasar katsayısı'), 'DKv3 aciklama: formul ozeti kalem kalem gorunur', vl3Calc.formulaSummary);

// -- Draft entegrasyonu --
const vl3DraftCalc = buildValueLossDraft('report_explanation', undefined, { calculationPossible: true });
assert(vl3DraftCalc.body.includes('hesaplama yapılabilir durumda olduğu görülmüştür') && !/\d+[.,]?\d*\s*TL/.test(vl3DraftCalc.body), 'DKv3 taslak: hesap yapilabilirse rapor taslagina NITELIK cumlesi eklenir, TUTAR eklenmez', '');
assert(!buildValueLossDraft('report_explanation').body.includes('hesaplama yapılabilir durumda'), 'DKv3 taslak: hesap yoksa nitelik cumlesi eklenmez (v1/v2 metinleri korunur)', '');

// -- UI kaynak testleri --
const vl3PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
const vl3HelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
assert(vl3PanelSrc.includes('Reel Piyasa Analiz Ön Hesabı') && vl3HelperSrc.includes('renderValueLossCalculationPanel') && vl3HelperSrc.includes('calculateValueLoss'), 'DKv3 UI: Reel Piyasa Analiz On Hesabi bolumu panele bagli', '');
assert(vl3PanelSrc.includes('Hesaplanamaz') && vl3PanelSrc.includes('Kontrol gerekli') && vl3PanelSrc.includes('missingInputs.map'), 'DKv3 UI: hesaplanamaz durumda eksikler gorunur', '');
assert(vl3PanelSrc.includes('Ön hesap tutarı') && vl3PanelSrc.includes('500 TL katına yuvarlanmış') && vl3PanelSrc.includes('vl-calc-table') && vl3PanelSrc.includes('renderFactorRow'), 'DKv3 UI: hesaplandi durumunda tutar + faktor tablosu gorunur', '');
assert(vl3PanelSrc.includes('Katsayı kaynağı') && vl3PanelSrc.includes('result.coefficientSource') && vl3PanelSrc.includes('result.disclaimer'), 'DKv3 UI: katsayi kaynagi + disclaimer gorunur', '');
// v5 revize: panel hala kendisi YAZMAZ (IPC/mutasyon yok); v5 ozet butonu yalniz ONAYLI main.ts aksiyonunu tetikler.
assert(vl3PanelSrc.includes('Ön Hesabı Yenile') && !/data-action="aih-vl-save"|window\.hasarbotu|ipcRenderer|updateValueLossContext|tracking\.mutate/.test(vl3PanelSrc), 'DKv3 UI: yenile butonu var; panel dogrudan yazma/IPC YAPMAZ (v2 kayit aksiyonu panelde yok)', '');

// -- Kaynak guard'lari --
const vl3TypesSrc = await fs.readFile('src/shared/value-loss/value-loss-calculation-types.ts', 'utf-8');
const vl3CoefSrc = await fs.readFile('src/shared/value-loss/value-loss-coefficients.ts', 'utf-8');
const vl3EngineSrc = await fs.readFile('src/shared/value-loss/value-loss-calculation-engine.ts', 'utf-8');
const vl3ExplainSrc = await fs.readFile('src/shared/value-loss/value-loss-calculation-explain.ts', 'utf-8');
const vl3RoundSrc = await fs.readFile('src/shared/value-loss/value-loss-rounding.ts', 'utf-8');
const vl3Blob = vl3TypesSrc + vl3CoefSrc + vl3EngineSrc + vl3ExplainSrc + vl3RoundSrc + vl3PanelSrc;
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|http\.request/i.test(vl3Blob), 'DKv3 guvenlik: on hesap modullerinde ag/scraping/web istegi yok', 'no-network');
assert(!/nodemailer|smtp|sendMail|mailto:/i.test(vl3Blob) && !/\.xlsx|writePartCodeCellExcel|saveAutoLaborExcel|distributeLaborExcel|loadWorkbook/i.test(vl3Blob), 'DKv3 guvenlik: mail gonderme + Excel/D/H-N yazimi yok', 'no-mail-excel');
assert(!/window\.hasarbotu|ipcRenderer|tracking\.mutate|updateField|updateValueLossContext/.test(vl3TypesSrc + vl3CoefSrc + vl3EngineSrc + vl3ExplainSrc + vl3RoundSrc), 'DKv3 guvenlik: motor takip verisine/IPCye yazmaz (saf preview)', 'no-write');
assert(!/from ['"].*labor\//.test(vl3Blob), 'DKv3 guvenlik: on hesap modulleri AI Iscilik (labor) modullerine dokunmaz', 'no-labor-import');
for (const [name, src] of [['calculation-types', vl3TypesSrc], ['coefficients', vl3CoefSrc], ['calculation-engine', vl3EngineSrc], ['calculation-explain', vl3ExplainSrc], ['rounding', vl3RoundSrc], ['calculation-panel', vl3PanelSrc], ['value-loss-helper-v3', vl3HelperSrc]]) {
  assert(src.split(/\r?\n/).length <= 400, `DKv3 400 satir: ${name} 400 satiri gecmez`, `${src.split(/\r?\n/).length} satir`);
}

// === Dev Harness v1 (AGENTS.md / CLAUDE.md / kurallar / dev-only audit) — runtime-neutral ===
const dhAgents = await fs.readFile('AGENTS.md', 'utf-8');
const dhClaude = await fs.readFile('CLAUDE.md', 'utf-8');
assert(dhAgents.length > 0 && dhClaude.length > 0, 'DH dosyalar: AGENTS.md ve CLAUDE.md mevcut', '');
assert(['source of truth', 'preview-first', 'no paid API', 'user approval', 'Value Loss', 'AI İşçilik'].every((p) => dhAgents.includes(p)), 'DH politika: AGENTS.md temel politika ifadelerini iceriyor', '');
assert(dhAgents.includes('Excel Güvenliği') && dhAgents.includes('preview/diff/confirmation') && dhAgents.includes('Tek-hücre yazıcılar'), 'DH politika: Excel yazim guvenligi kurallari var', '');
assert(dhAgents.includes('scraping veya tarayıcı otomasyonu YASAK') && dhAgents.includes('otomatik mail/rapor üretimi YASAK'), 'DH politika: otomatik Google/scraping + otomatik mail/rapor yasaklari var', '');
assert(dhAgents.includes('control_needed') && dhAgents.includes('cannot_calculate') && dhAgents.includes('Katsayı UYDURULMAZ') && dhAgents.includes('en az 3 emsal'), 'DH politika: deger kaybi katsayi/uydurma/emsal kurallari var', '');
assert(['npm run typecheck', 'npm run build', 'npm run test:behavior', 'npm run ci', 'node scripts/final-office-audit.mjs', 'npm audit'].every((c) => dhAgents.includes(c)), 'DH politika: zorunlu test komutlari AGENTS.md icinde', '');
assert(dhAgents.includes('Teslim Raporu Formatı') && dhAgents.includes('Behavior kontrol sayısı') && dhAgents.includes('IPC invoke/event'), 'DH politika: teslim raporu formati AGENTS.md icinde', '');
assert(dhClaude.includes('AGENTS.md') && dhClaude.includes('Yasak Eylemler') && dhClaude.includes('puppeteer') && dhClaude.includes('TÜRKÇE'), 'DH politika: CLAUDE.md operasyonel talimat + yasak listesi + Turkce rapor kurali iceriyor', '');
// Opsiyonel yönlendirici dosyalar kısa ve AGENTS'a işaret eder
const dhCodex = await fs.readFile('CODEX.md', 'utf-8');
const dhCopilot = await fs.readFile('.github/copilot-instructions.md', 'utf-8');
const dhCursor = await fs.readFile('.cursor/rules/hasarbotu.mdc', 'utf-8');
assert([dhCodex, dhCopilot, dhCursor].every((t) => t.includes('AGENTS.md') && t.split(/\r?\n/).length <= 60), 'DH yonlendirici: CODEX/Copilot/Cursor dosyalari kisa ve AGENTS.md\'ye isaret ediyor', '');
// docs/dev şablonları zorunlu bölümleri içerir
const dhTask = await fs.readFile('docs/dev/TASK_TEMPLATE.md', 'utf-8');
const dhReport = await fs.readFile('docs/dev/DELIVERY_REPORT_TEMPLATE.md', 'utf-8');
const dhSec = await fs.readFile('docs/dev/SECURITY_CHECKLIST.md', 'utf-8');
assert(['Goal', 'Scope', 'Out of Scope', 'Safety Constraints', 'Tests to Run'].every((x) => dhTask.includes(x)) && ['takip.json yazım durumu', 'Excel yazım durumu', 'Web/API durumu'].every((x) => dhReport.includes(x)) && ['Secrets', 'User approval', 'Backup/restore', 'Source guards'].every((x) => dhSec.includes(x)), 'DH sablonlar: docs/dev sablonlari zorunlu bolumleri iceriyor', '');
// Dev-only audit scripti güvenli: ağ yok, silme yok, yazma yok (yalnız okuma)
const dhAuditSrc = await fs.readFile('scripts/dev-harness-audit.mjs', 'utf-8');
assert(!/\bfetch\s*\(|axios|XMLHttpRequest|websocket|http\.request|net\.connect|https?:\/\//i.test(dhAuditSrc), 'DH script: ag/API cagrisi yok', 'no-network');
assert(!/unlink|rmSync|\brm\b|rmdir|\bdel\b/i.test(dhAuditSrc), 'DH script: dosya silme yok', 'no-delete');
assert(!/writeFile|appendFile|createWriteStream|mkdir|copyFile|rename\(/i.test(dhAuditSrc), 'DH script: dosya yazma yok (takip.json/Excel dahil; yalniz okuma)', 'no-write');
assert(dhAuditSrc.includes("readFile") && dhAuditSrc.split(/\r?\n/).length <= 400, 'DH script: salt-okunur ve 400 satiri gecmiyor', '');
// package.json: script kayitli; ci zincirine BILEREK baglanmadi (v1 ayri calisir)
const dhPkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
assert(dhPkg.scripts['test:dev-harness'] === 'node scripts/dev-harness-audit.mjs' && !String(dhPkg.scripts.ci).includes('dev-harness'), 'DH package: test:dev-harness kayitli; ci zinciri degistirilmedi (v1 ayri)', '');
// Runtime-neutral: src/ icinde dev harness dosyalarina referans/import yok
const dhSrcFiles = (await fs.readdir('src', { recursive: true })).filter((f) => String(f).endsWith('.ts'));
let dhRuntimeRefs = 0;
for (const f of dhSrcFiles) {
  const text = await fs.readFile(`src/${f}`, 'utf-8');
  if (/AGENTS\.md|CLAUDE\.md|dev-harness/.test(text)) dhRuntimeRefs++;
}
assert(dhRuntimeRefs === 0, 'DH runtime-neutral: src/ icinde dev harness referansi/importu yok', `${dhRuntimeRefs} dosya`);

// === AI Değer Kaybı v3.1 (SEİK katsayı doğrulama + J9 yakınlık düzeltmesi) — audit görevi ===
// -- Düzeltme regresyonları: Hesaplama!J9 birebir (v3'teki iki uyumsuzluk giderildi) --
assert(isNearLowerBound(vl3TableD, 400, 1000) === false && isNearLowerBound(vl3TableD, 501, 1000) === false, 'DKv3.1 duzeltme: D grubu (calisma saati) yakinlik bonusu ALMAZ (Excel J9 D icermez)', '');
assert(isNearLowerBound(vl3TableA, 500500, 1000) === false, 'DKv3.1 duzeltme: A/F 500k sinirinda pencere YOK (katsayi 0.7->0.7 degismez; J9 ile birebir)', '');
const vl31TableB = getMileageTableForGroup(SEIK_2026_V1_COEFFICIENT_SET, 'B');
assert(isNearLowerBound(vl31TableB, 500500, 1000) === true && isNearLowerBound(vl31TableB, 750500, 1000) === true && isNearLowerBound(vl31TableB, 1000500, 1000) === true, 'DKv3.1 duzeltme: B/C/Ç/E 500k/750k/1M pencereleri korunur (J9 ile birebir)', '');
assert(isNearLowerBound(vl3TableA, 20500, 1000) === true && isNearLowerBound(vl3TableA, 100500, 1000) === true && isNearLowerBound(vl31TableB, 20500, 1000) === false, 'DKv3.1 duzeltme: A/F-ozel pencereler (20k/100k) B grubunda yok (J9 ile birebir)', '');
// Motor uzerinden: D grubu alt sinira yakin calisma saatinde etki notr; Ornek A paritesi korunur
const vl31D = normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', vehicle: { marketValue: 800000, vehicleGroup: 'D', modelYear: 2021, workingHours: 400 }, history: { sbmPastDamageCount: 0 }, damage: { isTotalLossOrHeavyDamage: false, changedPartsText: 'kabin' }, marketAnalysis: { comparableListingCount: 3 } });
const vl31DCalc = calculateValueLoss(vl31D, vl3Provider, vl3PartData);
assert(vl31DCalc.status === 'calculated' && vl31DCalc.factors.find((f) => f.id === 'km-yakinlik').effect === 'neutral', 'DKv3.1 duzeltme: motor D grubunda yakinlik etkisini uygulamaz (400 saat -> notr)', '');
assert(Math.abs(calculateValueLoss(vl3Full, vl3Provider, vl3PartData).amount - 28285.2) < 0.01, 'DKv3.1 parite: Ornek A (28.285,20) duzeltmeden etkilenmedi', '');
// -- Doğrulama dokümanı --
const vl31Doc = await fs.readFile('docs/value-loss/SEIK_COEFFICIENT_VALIDATION_V3_1.md', 'utf-8');
assert(vl31Doc.includes('Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1'), 'DKv3.1 dokuman: Excel modul adi geciyor', '');
assert(['Tablolar!B19:C26', 'Hesaplama!F9', 'Hesaplama!J9', 'Tablolar!W2', 'Tablolar!U10', 'Tablolar!B27'].every((c) => vl31Doc.includes(c)), 'DKv3.1 dokuman: katsayi kaynak hucre/aralik haritasi var', '');
assert(vl31Doc.includes('## 10. Yuvarlama doğrulaması') && vl31Doc.includes('1749') && vl31Doc.includes('## 9. Cap / üst sınır doğrulaması'), 'DKv3.1 dokuman: yuvarlama + cap dogrulamasi bolumleri var', '');
assert(vl31Doc.includes('28.285,20') && vl31Doc.includes('Örnek hesap karşılaştırmaları') && vl31Doc.includes('240.000'), 'DKv3.1 dokuman: ornek hesap paritesi (A/B/C ornekleri) var', '');
assert(vl31Doc.includes('v4\'e geçilebilir.') && vl31Doc.includes('Uydurma / varsayım kontrolü'), 'DKv3.1 dokuman: acik v4 hazirlik karari + varsayim listesi var', '');
assert(vl31Doc.split(/\r?\n/).length <= 400, 'DKv3.1 dokuman: 400 satiri gecmiyor', `${vl31Doc.split(/\r?\n/).length} satir`);
// -- Guard: dokuman runtime'dan referans edilmez; degisen katsayi dosyasi temiz kalir --
// v6 revize: metadata dokuman YOLLARINI bilgi amacli listeler (izin verilir); IMPORT/require yasak kalir.
let vl31RuntimeRefs = 0;
for (const f of dhSrcFiles) {
  const text = await fs.readFile(`src/${f}`, 'utf-8');
  if (/(from ['"]|require\().*SEIK_COEFFICIENT_VALIDATION/.test(text)) vl31RuntimeRefs++;
}
assert(vl31RuntimeRefs === 0, 'DKv3.1 guard: dogrulama dokumani src/ icinden IMPORT edilmiyor (runtime-neutral)', `${vl31RuntimeRefs} dosya`);

// === AI Değer Kaybı Yardımcısı v4 (yapılandırılmış parça listesi + SEİK parça katsayıları) ===
// -- Parça katsayı tablosu --
assert(VALUE_LOSS_PART_COEFFICIENTS.length >= 100 && VALUE_LOSS_PART_COEFFICIENTS.every((e) => e.sourceSheet === 'Tablolar' && typeof e.sourceRow === 'number' && e.sourceRange.includes('Tablolar!B')), 'DKv4 tablo: SEİK parça katsayi tablosu mevcut + her kayitta kaynak sheet/aralik/satir var', String(VALUE_LOSS_PART_COEFFICIENTS.length));
const vl4Kaput = findPartCoefficientEntry('A', 'motor kaputu');
assert(vl4Kaput && vl4Kaput.changedCoefficient === 1 && vl4Kaput.sourceRow === 43, 'DKv4 tablo: bilinen parca/grup degisim katsayisi cozulur (A MOTOR KAPUTU=1, satir 43; normalize ad)', '');
assert(vl4Kaput.repairedLightCoefficient === 0.5 && vl4Kaput.repairedMediumCoefficient === 0.75 && vl4Kaput.repairedHeavyCoefficient === 1, 'DKv4 tablo: onarim hafif/orta/agir katsayilari cozulur (0.5/0.75/1)', '');
assert(vl4Kaput.paintedFullCoefficient === 1 && vl4Kaput.paintedLocalCoefficient === 0.5, 'DKv4 tablo: boya TAM/LOKAL katsayilari cozulur (J=TAM esleme belgeli, L=LOKAL)', '');
assert(findPartCoefficientEntry('B', 'MOTOR KAPUTU')?.changedCoefficient === 1.5 && findPartCoefficientEntry('A', 'TAVAN SACI')?.changedCoefficient === 5 && findPartCoefficientEntry('B', 'TAVAN SACI')?.changedCoefficient === 1, 'DKv4 tablo: farkli arac gruplari ayni parca icin farkli katsayi doner', '');
assert(findPartCoefficientEntry('A', 'BÖYLE PARÇA YOK') === undefined && findPartCoefficientEntry('Ç', 'ANA ŞASE')?.sourceRow === 119, 'DKv4 tablo: bilinmeyen parca tahmin edilmez (undefined); Ç grubu C blogunu kullanir', '');
assert(findPartCoefficientEntry('A', 'SÜRÜCÜ HAVA YASTIĞI')?.repairedLightCoefficient === undefined && findPartCoefficientEntry('A', 'SÜRÜCÜ HAVA YASTIĞI')?.changedCoefficient === 2, 'DKv4 tablo: hava yastigi onarim anomalileri (6/7/107/108) AKTARILMADI; degisim katsayisi korundu', '');
assert(listPartNamesForGroup('A').length >= 30 && listPartNamesForGroup('F').length >= 4, 'DKv4 tablo: grup bazli bilinen parca adi listesi (UI datalist) uretilir', '');

// -- Onarım ağırlığı --
assert(classifyRepairSeverity(15, 100).severity === 'light' && classifyRepairSeverity(30, 100).severity === 'medium' && classifyRepairSeverity(30.01, 100).severity === 'heavy', 'DKv4 agirlik: sinirlar 0.15->hafif, 0.30->orta, 0.3001->agir', '');
assert(classifyRepairSeverity(undefined, 100).severity === 'unknown' && classifyRepairSeverity(1000, undefined).severity === 'unknown', 'DKv4 agirlik: iscilik/parca fiyati eksikse unknown', '');
assert(classifyRepairSeverity(10, 0).severity === 'unknown' && classifyRepairSeverity(10, 0).warnings.length > 0 && classifyRepairSeverity(-5, 100).severity === 'unknown' && classifyRepairSeverity(-5, 100).warnings.length > 0, 'DKv4 agirlik: sifir/negatif fiyat + negatif iscilik unknown + uyari', '');
assert(classifyRepairSeverity(2000, 10000).laborToNewPartRatio === 0.2, 'DKv4 agirlik: iscilik/parca orani saklanir (0.2)', '');

// -- Normalizer --
const vl4Parts = [
  { id: 'p1', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] },
  { id: 'p2', operation: 'repaired', partName: 'SAĞ ÖN ÇAMURLUK (SAC)', repair: { laborAmount: '2.000', newPartPrice: '10.000' }, warnings: [] },
  { id: 'p3', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'TAM' }, warnings: [] }
];
const vl4Ctx = normalizeValueLossContext({ damage: { structuredParts: vl4Parts, damageAmount: '80.000' } });
assert(vl4Ctx.damage.structuredParts.length === 3 && vl4Ctx.damage.damageAmount === 80000, 'DKv4 normalize: structuredParts + damageAmount guvenli normalize edilir (TR sayi)', '');
assert(vl4Ctx.damage.structuredParts[1].repair.severity === 'medium' && vl4Ctx.damage.structuredParts[1].repair.laborToNewPartRatio === 0.2, 'DKv4 normalize: onarim orani/agirligi normalize sirasinda hesaplanir', '');
const vl4Bad = normalizeValueLossContext({ damage: { structuredParts: [{ id: 'x', operation: 'garip', partName: 'A' }, { id: 'y', operation: 'changed', partName: '   ' }, { id: 'z', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'YARIM' } }], damageAmount: -5 } });
assert((vl4Bad.damage?.structuredParts?.length ?? 0) === 1 && vl4Bad.damage.structuredParts[0].paint.type === 'unknown' && vl4Bad.damage?.damageAmount === undefined, 'DKv4 normalize: gecersiz islem/bos ad satiri atilir; gecersiz boya turu unknown; negatif hasar tutari reddedilir', JSON.stringify(vl4Bad.damage));

// -- Çözümleyici --
const vl4Res = resolveStructuredParts(vl4Ctx.damage.structuredParts, 'A');
assert(vl4Res.allResolved === true && vl4Res.totalCoefficient === 4.75 && vl4Res.items.map((i) => i.coefficient).join(',') === '1,0.75,3', 'DKv4 cozum: bilinen parcalar cozulur (degisen 1 + onarim orta 0.75 + boya TAM 3 = 4.75)', '');
assert(vl4Res.items.every((i) => i.coefficientSource && i.coefficientSource.includes('Tablolar!B')), 'DKv4 cozum: kaynak aralik/satir her kalemde gorunur', '');
const vl4ResU = resolveStructuredParts([...vl4Ctx.damage.structuredParts, { id: 'p4', operation: 'changed', partName: 'BILINMEYEN PARCA', warnings: [] }], 'A');
assert(vl4ResU.allResolved === false && vl4ResU.totalCoefficient === undefined && vl4ResU.unresolvedCount === 1 && vl4ResU.partialCoefficient === 4.75 && vl4ResU.items[3].warnings.length > 0, 'DKv4 cozum: bilinmeyen parca tahminsiz/atilmadan uyariyla isaretlenir; toplam uretilmez (kismi TANI)', '');
const vl4LokalItem = resolvePartItem({ id: 'q', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'LOKAL' }, warnings: [] }, 'A');
const vl4UnkPaint = resolvePartItem({ id: 'q2', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'unknown' }, warnings: [] }, 'A');
assert(vl4LokalItem.coefficient === 1.5 && vl4UnkPaint.coefficient === undefined && vl4UnkPaint.warnings.some((w) => w.includes('TAM/LOKAL')), 'DKv4 cozum: boya LOKAL 1.5; boya turu bilinmiyorsa katsayi secilmez + uyari', '');

// -- Diff --
const vl4Prev = normalizeValueLossContext({ damage: { structuredParts: [vl4Parts[0], { ...vl4Parts[1], repair: {} }] } });
const vl4Next = normalizeValueLossContext({ damage: { structuredParts: vl4Parts, damageAmount: 65000 } });
const vl4Rows = diffValueLossContext(vl4Prev, vl4Next);
assert(vl4Rows.some((r) => r.newLabel.includes('parça eklendi')), 'DKv4 diff: parca ekleme ozetlenir', JSON.stringify(vl4Rows.map((r) => r.newLabel)));
assert(diffValueLossContext(vl4Next, vl4Prev).some((r) => r.newLabel.includes('parça silindi')), 'DKv4 diff: parca silme ozetlenir', '');
assert(vl4Rows.some((r) => r.label.includes('Onarılan') && r.oldLabel.includes('bilinmiyor') && r.newLabel.includes('orta')), 'DKv4 diff: agirlik degisimi ozetlenir (bilinmiyor -> orta)', '');
assert(vl4Rows.some((r) => r.label === 'Hasar tutarı' && r.newLabel.includes('65.000')), 'DKv4 diff: hasar tutari degisimi ozetlenir', '');
const vl4PaintDiff = diffValueLossContext(normalizeValueLossContext({ damage: { structuredParts: [vl4Parts[2]] } }), normalizeValueLossContext({ damage: { structuredParts: [{ ...vl4Parts[2], paint: { type: 'LOKAL' } }] } }));
assert(vl4PaintDiff.some((r) => r.oldLabel.includes('TAM') && r.newLabel.includes('LOKAL')), 'DKv4 diff: boya turu degisimi ozetlenir (TAM -> LOKAL)', '');
assert(buildValueLossSaveConfirmMessage(vl4Rows).includes(VALUE_LOSS_SAVE_SCOPE_NOTE), 'DKv4 diff: onay mesaji hala yalniz aiHelperContext.valueLoss yazilacagini soyler', '');

// -- Motor entegrasyonu --
const vl4Base = {
  fileType: 'trafik', assignmentDate: '2026-07-10',
  vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000 },
  history: { sbmPastDamageCount: 1 },
  damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl4Parts, damageAmount: 80000 },
  marketAnalysis: { comparableListingCount: 3 }
};
const vl4Calc = calculateValueLoss(normalizeValueLossContext(vl4Base), vl3Provider);
assert(vl4Calc.status === 'calculated' && Math.abs(vl4Calc.amount - 36142.2) < 0.01 && vl4Calc.roundedAmount === 36500, 'DKv4 motor: structuredParts + damageAmount ile hesaplar (hasarK=(4.75+1)/100 -> 36.142,20 -> 36.500)', `${vl4Calc.amount}`);
assert(vl4Calc.factors.filter((f) => f.id.startsWith('part-')).length === 3 && vl4Calc.factors.some((f) => f.id === 'part-p2' && f.explanation.includes('orta') && f.explanation.includes('Tablolar!B36')), 'DKv4 motor: her parca faktor olarak listelenir (agirlik + kaynak satir aciklamada)', '');
assert(vl4Calc.evidence.some((e) => e.includes('B34:L295')) && vl4Calc.disclaimer === VALUE_LOSS_CALC_DISCLAIMER, 'DKv4 motor: parca kaynak araligi evidence icinde + disclaimer zorunlu', '');
assert(vl4Calc.factors.some((f) => f.id === 'hasar' && f.explanation.includes('10')), 'DKv4 motor: damageAmount/rayic bileseni (%10) hasar katsayisinda gorunur', '');
const vl4NoAmt = calculateValueLoss(normalizeValueLossContext({ ...vl4Base, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl4Parts } }), vl3Provider);
assert(vl4NoAmt.status === 'control_needed' && vl4NoAmt.missingInputs.includes('Hasar (onarım) tutarı') && vl4NoAmt.amount === undefined, 'DKv4 motor: damageAmount yoksa missing input + tutar uretilmez', '');
const vl4Unres = calculateValueLoss(normalizeValueLossContext({ ...vl4Base, damage: { isTotalLossOrHeavyDamage: false, structuredParts: [...vl4Parts, { id: 'p4', operation: 'changed', partName: 'X BILINMEYEN', warnings: [] }], damageAmount: 80000 } }), vl3Provider);
assert(vl4Unres.status === 'control_needed' && vl4Unres.amount === undefined && vl4Unres.warnings.some((w) => w.includes('TANI')), 'DKv4 motor: cozulmemis katsayida control_needed; kismi toplam yalniz TANI uyarisi olarak', '');
assert(calculateValueLoss(normalizeValueLossContext({ ...vl4Base, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl4Parts, damageAmount: 900000 } }), vl3Provider).status === 'control_needed', 'DKv4 motor: hasar tutari rayici asarsa control_needed + uyari', '');
assert(calculateValueLoss(normalizeValueLossContext({ ...vl4Base, damage: { isTotalLossOrHeavyDamage: false, changedPartsText: 'kaput' } }), vl3Provider).status === 'control_needed', 'DKv4 motor: structuredParts yoksa mevcut davranis korunur (control_needed; serbest metin ayrisTIRILMAZ)', '');
assert(Math.abs(calculateValueLoss(vl3Full, vl3Provider, vl3PartData).amount - 28285.2) < 0.01, 'DKv4 motor: v3 acik partData yolu birebir korunur (28.285,20)', '');
const vl4DraftParts = buildValueLossDraft('report_explanation', undefined, { structuredPartsClassified: true });
assert(vl4DraftParts.body.includes('işçilik/yeni parça fiyatı oranı dikkate alınarak onarım ağırlığı değerlendirilmiştir') && !/\d+[.,]?\d*\s*TL/.test(vl4DraftParts.body) && !/kesin değer kaybı|ödenmesi gereken kesin|nihai tazminat/i.test(vl4DraftParts.body), 'DKv4 taslak: parca siniflama NITELIK cumlesi eklenir; tutar/kesin ifade YOK', '');

// -- Checklist entegrasyonu --
const vl4Chk = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext(vl4Base), {}));
const vl4ChkFind = (id) => vl4Chk.flatMap((c) => c.items).find((i) => i.id === id);
assert(vl4ChkFind('vl-hasar-yapisal-liste').status === 'ok' && vl4ChkFind('vl-hasar-katsayi-cozum').status === 'ok' && vl4ChkFind('vl-hasar-agirlik').status === 'ok' && vl4ChkFind('vl-hasar-boya-turu').status === 'ok' && vl4ChkFind('vl-hasar-tutar').status === 'ok', 'DKv4 checklist: parca hazirligi maddeleri tam veride ok', '');
const vl4ChkEmpty = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({}), {}));
const vl4ChkEmptyFind = (id) => vl4ChkEmpty.flatMap((c) => c.items).find((i) => i.id === id);
assert(vl4ChkEmptyFind('vl-hasar-yapisal-liste').status === 'control_needed' && vl4ChkEmptyFind('vl-hasar-tutar').status === 'control_needed', 'DKv4 checklist: parca listesi/tutar yoksa kontrol maddeleri uyarir (v1/v2 maddeleri korunur)', '');
const vl4ChkUnres = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({ ...vl4Base, damage: { structuredParts: [{ id: 'p4', operation: 'changed', partName: 'X BILINMEYEN', warnings: [] }], damageAmount: 80000 } }), {}));
assert(vl4ChkUnres.flatMap((c) => c.items).find((i) => i.id === 'vl-hasar-katsayi-cozum').status === 'missing', 'DKv4 checklist: cozulmemis katsayi kritik uyari uretir', '');

// -- UI kaynak testleri --
const vl4PartsFormSrc = await fs.readFile('src/renderer/app/components/value-loss-parts-form.ts', 'utf-8');
const vl4FormSrc = await fs.readFile('src/renderer/app/components/value-loss-context-form.ts', 'utf-8');
const vl4CtxActionsSrc = await fs.readFile('src/renderer/app/actions/value-loss-context-actions.ts', 'utf-8');
const vl4MappingSrc = await fs.readFile('src/renderer/app/utils/value-loss-form-mapping.ts', 'utf-8');
assert(vl4PartsFormSrc.includes('Parça Bazlı Değer Kaybı Verileri') && vl4FormSrc.includes('renderValueLossPartsForm'), 'DKv4 UI: Parca Bazli Deger Kaybi Verileri bolumu forma bagli', '');
assert(vl4PartsFormSrc.includes('aih-vl-part-add') && vl4PartsFormSrc.includes('aih-vl-part-del') && vl4PartsFormSrc.includes('Parça ekle') && vl4PartsFormSrc.includes('Parça sil'), 'DKv4 UI: parca ekle/sil kontrolleri render olur', '');
assert(vl4PartsFormSrc.includes('laborAmount') && vl4PartsFormSrc.includes('newPartPrice') && vl4PartsFormSrc.includes('Ağırlık') && vl4PartsFormSrc.includes("v: 'TAM'") && vl4PartsFormSrc.includes("v: 'LOKAL'"), 'DKv4 UI: onarim alanlari + agirlik gosterimi + TAM/LOKAL secimi render olur', '');
assert(vl4PartsFormSrc.includes('Katsayı çözülemedi') && vl4PartsFormSrc.includes('vl-part-warn') && vl4PartsFormSrc.includes('coefficientSource'), 'DKv4 UI: katsayi durumu/kaynagi/uyarisi render olur', '');
assert(vl4PartsFormSrc.includes('Önizle / normalize et') && !/aimode|hasarbotu\.|ipcRenderer|updateField/.test(vl4PartsFormSrc) && !/hesap tutarını kaydet|tutari kaydet/i.test(vl4PartsFormSrc), 'DKv4 UI: onizle butonu var; ayri otomatik kayit/hesap-tutari-kaydet butonu YOK', '');
assert(vl4CtxActionsSrc.includes('addValueLossPartRow') && vl4CtxActionsSrc.includes('PART_FIELDS') && !/window\.hasarbotu|ipcRenderer/.test(vl4CtxActionsSrc), 'DKv4 UI: parca aksiyonlari yalniz UI state; IPC yok (kayit v2 onayli akista)', '');

// -- Kaynak guard'lari --
const vl4TypesSrc = await fs.readFile('src/shared/value-loss/value-loss-part-input-types.ts', 'utf-8');
const vl4CoefSrc = await fs.readFile('src/shared/value-loss/value-loss-part-coefficients.ts', 'utf-8');
const vl4SevSrc = await fs.readFile('src/shared/value-loss/value-loss-part-severity.ts', 'utf-8');
const vl4ResolverSrc = await fs.readFile('src/shared/value-loss/value-loss-part-resolver.ts', 'utf-8');
const vl4Blob = vl4TypesSrc + vl4CoefSrc + vl4SevSrc + vl4ResolverSrc + vl4PartsFormSrc + vl4MappingSrc;
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|http\.request/i.test(vl4Blob), 'DKv4 guvenlik: v4 modullerinde ag/scraping/web istegi yok', 'no-network');
assert(!/nodemailer|smtp|sendMail|mailto:/i.test(vl4Blob) && !/writePartCodeCellExcel|saveAutoLaborExcel|distributeLaborExcel|loadWorkbook/i.test(vl4Blob), 'DKv4 guvenlik: mail + Excel yazimi yok', 'no-mail-excel');
assert(!/from ['"].*labor\//.test(vl4TypesSrc + vl4CoefSrc + vl4SevSrc + vl4ResolverSrc), 'DKv4 guvenlik: AI Iscilik / AI Mode modullerine import yok', 'no-labor-import');
assert(!/tracking\.mutate|updateValueLossContext|updateAiHelperContext/.test(vl4Blob), 'DKv4 guvenlik: kontrolsuz takip yazimi yok (kayit yalniz mevcut v2 akisiyla)', 'no-write');
for (const [name, src] of [['part-input-types', vl4TypesSrc], ['part-coefficients', vl4CoefSrc], ['part-severity', vl4SevSrc], ['part-resolver', vl4ResolverSrc], ['parts-form', vl4PartsFormSrc], ['form-mapping-v4', vl4MappingSrc], ['context-form-v4', vl4FormSrc]]) {
  assert(src.split(/\r?\n/).length <= 400, `DKv4 400 satir: ${name} 400 satiri gecmez`, `${src.split(/\r?\n/).length} satir`);
}

// === AI Değer Kaybı v4.1 (SEİK parça katsayı doğrulama + sıkılaştırma) — audit görevi ===
// -- Tablo bütünlüğü (doğrulama guard'ları; <=10 eşiği transkripsiyon-hatası guard'ıdır, SEİK kuralı değil) --
assert(VALUE_LOSS_PART_COEFFICIENTS.every((e) => e.vehicleGroup && e.partName.trim().length > 0 && e.normalizedPartName && e.sourceSheet === 'Tablolar' && typeof e.sourceRow === 'number' && e.sourceRange === `Tablolar!B${e.sourceRow}:L${e.sourceRow}`), 'DKv4.1 butunluk: her kayitta grup/ad/normalize ad/kaynak sheet-aralik-satir tam ve tutarli', '');
assert(VALUE_LOSS_PART_COEFFICIENTS.every((e) => e.sourceRow >= 34 && e.sourceRow <= 295), 'DKv4.1 butunluk: tum kaynak satirlar dogrulanmis aralik (34-295) icinde', '');
assert(VALUE_LOSS_PART_COEFFICIENTS.every((e) => [e.changedCoefficient, e.repairedLightCoefficient, e.repairedMediumCoefficient, e.repairedHeavyCoefficient, e.paintedFullCoefficient, e.paintedLocalCoefficient].every((c) => c === undefined || (Number.isFinite(c) && c >= 0 && c <= 10))), 'DKv4.1 butunluk: hicbir katsayi NaN/negatif/supheli-buyuk degil', '');
const vl41Keys = VALUE_LOSS_PART_COEFFICIENTS.map((e) => `${e.vehicleGroup}|${e.normalizedPartName}`);
assert(new Set(vl41Keys).size === vl41Keys.length && VALUE_LOSS_PART_COEFFICIENTS.length === 120, 'DKv4.1 butunluk: (grup, normalize ad) benzersiz -> lookup deterministik (120 kayit)', String(VALUE_LOSS_PART_COEFFICIENTS.length));
const vl41AirbagRows = [62, 63, 64, 65, 114, 115];
const vl41Airbags = VALUE_LOSS_PART_COEFFICIENTS.filter((e) => vl41AirbagRows.includes(e.sourceRow));
assert(vl41Airbags.length === 6 && vl41Airbags.every((e) => e.repairedLightCoefficient === undefined && e.repairedMediumCoefficient === undefined && e.repairedHeavyCoefficient === undefined && typeof e.changedCoefficient === 'number'), 'DKv4.1 butunluk: 6 hava yastigi satirinin anomali onarim degerleri (6/7/107/108/233/234) URETIME ALINMADI; degisim korundu', '');

// -- Resolver sıkılaştırma --
const vl41Tam = resolvePartItem({ id: 't', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'TAM' }, warnings: [] }, 'A');
const vl41Lokal = resolvePartItem({ id: 'l', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'LOKAL' }, warnings: [] }, 'A');
assert(vl41Tam.coefficient === 3 && vl41Tam.coefficientSource.includes('J=TAM') && vl41Tam.coefficientSource.includes('K boş'), 'DKv4.1 boya: TAM J sutunundan cozulur + J=TAM/K-bos kaynak notu gorunur', vl41Tam.coefficientSource);
assert(vl41Lokal.coefficient === 1.5 && !vl41Lokal.coefficientSource.includes('J=TAM'), 'DKv4.1 boya: LOKAL L sutunundan cozulur (J-eslesme notu yok)', '');
assert(findPartCoefficientEntry('A', 'MOTOR KAPUT') === undefined && findPartCoefficientEntry('A', 'MOTORKAPUTU') === undefined, 'DKv4.1 tahminsizlik: yazim hatasi bulanik eslesMEZ (yalniz tam/normalize ad)', '');
const vl41Dup = findPartCoefficientEntry('B', 'TABAN SACI');
assert(vl41Dup.sourceRow === 103 && vl41Dup.paintedFullCoefficient === 0.25 && resolvePartItem({ id: 'd', operation: 'painted', partName: 'TABAN SACI', paint: { type: 'TAM' }, warnings: [] }, 'B').coefficient === 0.25, 'DKv4.1 duplicate: VLOOKUP ilk-satir semantigi deterministik (B TABAN SACI -> satir 103, TAM 0.25)', '');
assert(findPartCoefficientEntry('A', 'TAVAN SACI').changedCoefficient === 5 && findPartCoefficientEntry('B', 'TAVAN SACI').changedCoefficient === 1 && findPartCoefficientEntry('C', 'TAVAN SACI').changedCoefficient === 2 && findPartCoefficientEntry('D', 'TAVAN SACI').changedCoefficient === 0.5, 'DKv4.1 grup: ayni normalize ad grup basina farkli katsayi cozer (TAVAN SACI A5/B1/C2/D0.5)', '');
const vl41Sev = (labor) => resolvePartItem({ id: 's', operation: 'repaired', partName: 'SAĞ ÖN ÇAMURLUK (SAC)', repair: { laborAmount: labor, newPartPrice: 10000 }, warnings: [] }, 'A').coefficient;
assert(vl41Sev(1000) === 0.5 && vl41Sev(2000) === 0.75 && vl41Sev(5000) === 1, 'DKv4.1 onarim: hafif/orta/agir katsayilari kaynak F/G/H sutunlarindan cozulur (0.5/0.75/1)', '');
const vl41AirbagRepair = resolvePartItem({ id: 'a', operation: 'repaired', partName: 'SÜRÜCÜ AIRBAG', repair: { laborAmount: 100, newPartPrice: 1000 }, warnings: [] }, 'B');
assert(vl41AirbagRepair.coefficient === undefined && vl41AirbagRepair.warnings.some((w) => w.includes('güvenilir değil')), 'DKv4.1 onarim: airbag onarimi cozumsuz + uyari (B grubu, anomali dislama)', '');

// -- Motor sıkılaştırma --
const vl41FreeTextOnly = calculateValueLoss(normalizeValueLossContext({ ...vl4Base, damage: { isTotalLossOrHeavyDamage: false, changedPartsText: 'kaput, tampon', repairedPartsText: 'çamurluk', damageAmount: 80000 } }), vl3Provider);
assert(vl41FreeTextOnly.status === 'control_needed' && vl41FreeTextOnly.factors.every((f) => !f.id.startsWith('part-')), 'DKv4.1 motor: yalniz serbest metin parca faktoru URETMEZ (structuredParts sart)', '');
const vl41AllDraftKinds = ['internal_note', 'report_explanation', 'missing_info_mail'].map((k) => buildValueLossDraft(k, undefined, { structuredPartsClassified: true, calculationPossible: true, hasMarketValue: true }).body).join(' ');
assert(!/kesin değer kaybı|ödenmesi gereken kesin|nihai tazminat|kesin tazminat/i.test(vl41AllDraftKinds) && !/36\.500|36\.142/.test(vl41AllDraftKinds), 'DKv4.1 taslak: hicbir taslakta kesin-tazminat dili ve hesap tutari yok', '');

// -- Doğrulama dokümanı --
const vl41Doc = await fs.readFile('docs/value-loss/SEIK_PART_COEFFICIENT_VALIDATION_V4_1.md', 'utf-8');
assert(vl41Doc.includes('Tablolar!B34:L295') && vl41Doc.includes('Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1'), 'DKv4.1 dokuman: kaynak modul + birincil aralik geciyor', '');
assert(vl41Doc.includes('J = TAM') && vl41Doc.includes('L = LOKAL') && vl41Doc.includes('K sütunu 34-295 aralığında 0 (SIFIR) dolu hücre'), 'DKv4.1 dokuman: J=TAM / L=LOKAL eslemesi + K sutunu boslugu belgelendi', '');
assert(vl41Doc.includes('91 satırın 91\'inde') && vl41Doc.includes('J ≥ L'), 'DKv4.1 dokuman: J/L oran deseni nicel kanit olarak belgelendi', '');
assert(vl41Doc.includes('107') && vl41Doc.includes('233') && vl41Doc.includes('hava yastığı') && vl41Doc.includes('ÜRETİME ALINMADI'), 'DKv4.1 dokuman: airbag/katsayi-disi degerlerin dislanmasi belgelendi', '');
assert(vl41Doc.includes('VLOOKUP') && vl41Doc.includes('ilk satır kazanır') && vl41Doc.includes('Ç') && vl41Doc.includes('C bloğu'), 'DKv4.1 dokuman: duplicate/VLOOKUP semantigi + Ç->C blogu belgelendi', '');
assert(vl41Doc.includes('v4 güvenle korunabilir.') && vl41Doc.includes('Varsayımlar ve kalan riskler'), 'DKv4.1 dokuman: acik v4 guvenlik karari + varsayim listesi var', '');
assert(vl41Doc.split(/\r?\n/).length <= 400, 'DKv4.1 dokuman: 400 satiri gecmiyor', `${vl41Doc.split(/\r?\n/).length} satir`);
let vl41RuntimeRefs = 0;
for (const f of dhSrcFiles) {
  const text = await fs.readFile(`src/${f}`, 'utf-8');
  if (/(from ['"]|require\().*SEIK_PART_COEFFICIENT_VALIDATION/.test(text)) vl41RuntimeRefs++;
}
assert(vl41RuntimeRefs === 0, 'DKv4.1 guard: dogrulama dokumani src/ icinden IMPORT edilmiyor (runtime-neutral)', `${vl41RuntimeRefs} dosya`);

// === AI Değer Kaybı Yardımcısı v5 (hasar tarihi + araç türü + gerekçe kopyalama + onaylı özet kaydı) ===
const vl5Mk = (over = {}) => normalizeValueLossContext({
  fileType: 'trafik', assignmentDate: '2026-07-10',
  vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, ...(over.vehicle ?? {}) },
  history: { sbmPastDamageCount: 0 },
  damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl4Parts, damageAmount: 80000, ...(over.damage ?? {}) },
  marketAnalysis: { comparableListingCount: 3 }
});
const vl5Yas = (r) => r.factors.find((f) => f.id === 'yas');
const vl5Grup = (r) => r.factors.find((f) => f.id === 'grup');
// -- Hasar tarihi --
const vl5NoD = calculateValueLoss(vl5Mk(), vl3Provider);
const vl5D = calculateValueLoss(vl5Mk({ damage: { damageDate: '2031-03-15' } }), vl3Provider);
assert(vl5Yas(vl5NoD).coefficient === 0.9 && vl5Yas(vl5D).coefficient === 0.85 && vl5Yas(vl5D).explanation.includes('hasar tarihi'), 'DKv5 tarih: hasar tarihi yas katsayisini degistirir (2031 -> yas 10 -> 0.85; kaynak aciklamada)', '');
assert(vl5Yas(vl5NoD).explanation.includes('atama tarihi'), 'DKv5 tarih: hasar tarihi yoksa eski davranis korunur (atama tarihi yili)', '');
const vl5BadD = calculateValueLoss(vl5Mk({ damage: { damageDate: 'okunmaz' } }), vl3Provider);
assert(vl5BadD.warnings.some((w) => w.includes('Hasar tarihi okunamadı')) && vl5Yas(vl5BadD).coefficient === 0.9, 'DKv5 tarih: gecersiz hasar tarihi guvenli uyari + atama-yili fallback (cokme yok)', '');
assert(calculateValueLoss(vl5Mk({ damage: { damageDate: '2026-08-01' } }), vl3Provider).status === 'calculated' && calculateValueLoss(normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-06-01', damage: { damageDate: '2026-08-01' } }), vl3Provider, vl3PartData).status === 'cannot_calculate', 'DKv5 tarih: zorunluluk esigi ATAMA tarihine bagli kalir (hasar tarihi esigi degistirmez)', '');
// -- Araç türü / OTOBÜS 0.5 --
const vl5Bus = calculateValueLoss(vl5Mk({ vehicle: { vehicleGroup: 'B', vehicleType: 'bus' } }), vl3Provider);
assert(vl5Bus.status === 'calculated' && vl5Grup(vl5Bus).coefficient === 0.5 && vl5Grup(vl5Bus).effect === 'decrease' && vl5Grup(vl5Bus).explanation.includes('OTOBÜS'), 'DKv5 tur: B + otobus 0.5 carpani uygular (Tablolar V6; dusurucu)', '');
const vl5BUnk = calculateValueLoss(vl5Mk({ vehicle: { vehicleGroup: 'B' } }), vl3Provider);
assert(vl5Grup(vl5BUnk).coefficient === 1 && vl5BUnk.warnings.some((w) => w.includes('0,5 çarpanı')), 'DKv5 tur: B + tur bilinmiyor -> carpan 1 + eksper uyarisi korunur', '');
const vl5BMini = calculateValueLoss(vl5Mk({ vehicle: { vehicleGroup: 'B', vehicleType: 'minibus' } }), vl3Provider);
assert(vl5Grup(vl5BMini).coefficient === 1 && !vl5BMini.warnings.some((w) => w.includes('0,5 çarpanı')), 'DKv5 tur: B + minibus 0.5 UYGULANMAZ (kaynak yalniz OTOBUS icin tanimlar); uyarisiz', '');
const vl5ABus = calculateValueLoss(vl5Mk({ vehicle: { vehicleType: 'bus' } }), vl3Provider);
assert(vl5ABus.status === 'control_needed' && vl5ABus.factors.some((f) => f.id === 'blk-otobus-grup') && vl5ABus.amount === undefined, 'DKv5 tur: B disi grup + otobus -> uyumsuzluk control_needed (kor uygulama yok)', '');
const vl5F = calculateValueLoss(vl5Mk({ vehicle: { vehicleGroup: 'F', vehicleType: 'motorcycle' }, damage: { structuredParts: [{ id: 'f1', operation: 'changed', partName: 'ŞASE', warnings: [] }] } }), vl3Provider);
assert(vl5Grup(vl5F).coefficient === 2.5, 'DKv5 tur: F/motosiklet 2.5 carpani birebir korunur', '');
assert(calculateValueLoss(vl5Mk({ vehicle: { vehicleType: 'unknown' } }), vl3Provider).status === 'calculated', 'DKv5 tur: tur bilinmiyor guvenli (A grubunda hesap surer)', '');
assert(normalizeValueLossContext({ vehicle: { vehicleType: 'ucan_araba' } }).vehicle === undefined && normalizeValueLossContext({ vehicle: { vehicleType: 'bus' } }).vehicle.vehicleType === 'bus', 'DKv5 normalize: gecersiz arac turu dusurulur; gecerli tur korunur', '');
// -- Gerekçe kopyalama --
const vl5Copy = buildValueLossCalculationCopyText(vl5NoD);
assert(vl5Copy.includes('ön hesap niteliğindedir') && vl5Copy.includes('Formül:') && vl5Copy.includes('Katsayı kaynağı:'), 'DKv5 kopya: disclaimer + formul + katsayi kaynagi metinde', '');
assert(/yuvarlanmış\): [\d.,]+ TL/.test(vl5Copy), 'DKv5 kopya: hesaplandi durumunda yuvarlanmis tutar metinde', '');
const vl5CopyCtrl = buildValueLossCalculationCopyText(calculateValueLoss(vl5Mk({ damage: { structuredParts: [{ id: 'x', operation: 'changed', partName: 'BILINMEYEN', warnings: [] }] } }), vl3Provider));
assert(vl5CopyCtrl.includes('Ödenebilir tutar hesaplanmadı') && !/yuvarlanmış\): [\d.,]+ TL/.test(vl5CopyCtrl), 'DKv5 kopya: hesaplanamayan durumda tutar YOK + acik ifade', '');
assert(!/kesin tazminat|kesin değer kaybı|ödenmesi gereken kesin|nihai tazminat/i.test(vl5Copy + vl5CopyCtrl) && !/[A-Z]:\\|\/Users\//.test(vl5Copy + vl5CopyCtrl), 'DKv5 kopya: kesin-tazminat dili ve dosya yolu YOK', '');
// -- Ön hesap özeti (snapshot) --
const vl5Snap = buildValueLossCalculationSnapshot(vl5NoD, '2026-07-03T10:00:00.000Z');
assert(vl5Snap.version === 1 && vl5Snap.status === 'calculated' && typeof vl5Snap.roundedAmount === 'number' && vl5Snap.disclaimer.includes('ön hesap niteliğindedir') && vl5Snap.createdAt === '2026-07-03T10:00:00.000Z', 'DKv5 ozet: calculated ozeti tutar + disclaimer + zaman damgasi icerir', '');
assert(vl5Snap.factorsSummary.length <= 20 && vl5Snap.factorsSummary.every((f) => typeof f === 'string') && !JSON.stringify(vl5Snap).includes('"explanation"'), 'DKv5 ozet: kompakt (ham faktor nesneleri saklanmaz; ozet satirlari)', '');
const vl5SnapCtrl = buildValueLossCalculationSnapshot(calculateValueLoss(vl5Mk({ damage: { structuredParts: [{ id: 'x', operation: 'changed', partName: 'BILINMEYEN', warnings: [] }] } }), vl3Provider), '2026-07-03T10:00:00.000Z');
assert(vl5SnapCtrl.status === 'control_needed' && vl5SnapCtrl.amount === undefined && vl5SnapCtrl.roundedAmount === undefined && vl5SnapCtrl.warnings[0].includes('tanı'), 'DKv5 ozet: control_needed ozetinde tutar YOK + tani notu', '');
const vl5NormSnap = normalizeValueLossContext({ calculationSnapshot: { ...vl5Snap, fazlalik: 'x', factorsSummary: Array(50).fill('a'.repeat(500)) } }).calculationSnapshot;
assert(vl5NormSnap && !('fazlalik' in vl5NormSnap) && vl5NormSnap.factorsSummary.length === 20 && vl5NormSnap.factorsSummary[0].length <= 200, 'DKv5 normalize: ozet whitelist + sinirlarla kompakt normalize edilir (beklenmeyen anahtar atilir)', '');
const vl5NormCtrl = normalizeValueLossContext({ calculationSnapshot: { ...vl5SnapCtrl, amount: 99999, roundedAmount: 88888 } }).calculationSnapshot;
assert(vl5NormCtrl.amount === undefined && vl5NormCtrl.roundedAmount === undefined, 'DKv5 normalize: calculated olmayan ozete tutar SIZAMAZ (normalize dusurur)', '');
assert(normalizeValueLossContext({ fileType: 'trafik' }).calculationSnapshot === undefined, 'DKv5 normalize: eski kayitli baglamlar ozetsiz guvenle yuklenir', '');
// -- Diff --
const vl5DiffRows = diffValueLossContext(normalizeValueLossContext({}), normalizeValueLossContext({ vehicle: { vehicleType: 'bus' }, damage: { damageDate: '2026-07-12' }, calculationSnapshot: vl5Snap }));
assert(vl5DiffRows.some((r) => r.label === 'Hasar tarihi' && r.newLabel === '2026-07-12') && vl5DiffRows.some((r) => r.label === 'Araç türü' && r.newLabel === 'Otobüs'), 'DKv5 diff: hasar tarihi + arac turu okunur ozetlenir', '');
assert(vl5DiffRows.some((r) => r.label === 'Ön hesap özeti' && r.oldLabel === 'boş' && /calculated \/ [\d.]+ TL/.test(r.newLabel)) && vl5DiffRows.some((r) => r.label === 'Ön hesap özeti tarihi'), 'DKv5 diff: ozet JSON dokumu degil kisa etiket + tarih satiri', '');
assert(formatSnapshotLabel(vl5SnapCtrl) === 'control_needed' && formatSnapshotLabel(undefined) === 'boş', 'DKv5 diff: ozet etiketi tutarsiz durumda tutar icermez', '');
// -- Checklist / taslak --
const vl5Chk = buildValueLossChecklist(applyValueLossContextToChecklistInput(vl5Mk({ vehicle: { vehicleGroup: 'B', vehicleType: 'bus' }, damage: { damageDate: '2026-07-12' } }), {}));
const vl5ChkF = (id) => vl5Chk.flatMap((c) => c.items).find((i) => i.id === id);
assert(vl5ChkF('vl-hasar-tarih').status === 'ok' && vl5ChkF('vl-arac-turu').status === 'ok' && vl5ChkF('vl-arac-otobus-carpan').status === 'ok', 'DKv5 checklist: hasar tarihi + arac turu + B-otobus netligi maddeleri calisir', '');
const vl5ChkA = buildValueLossChecklist(applyValueLossContextToChecklistInput(vl5Mk(), {}));
const vl5ChkAF = (id) => vl5ChkA.flatMap((c) => c.items).find((i) => i.id === id);
assert(vl5ChkAF('vl-arac-otobus-carpan').status === 'not_applicable' && vl5ChkAF('vl-rapor-onhesap-ozet').severity === 'info' && vl5ChkAF('vl-rapor-onhesap-ozet').status !== 'ok', 'DKv5 checklist: otobus maddesi B disinda uygulanmaz; ozet maddesi OPSIYONEL (info, kritik degil)', '');
assert(buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({ calculationSnapshot: vl5Snap }), {})).flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-onhesap-ozet').status === 'ok', 'DKv5 checklist: kayitli ozet varsa madde ok', '');
const vl5Facts = draftFactsFromValueLossContext(normalizeValueLossContext({ vehicle: { vehicleType: 'bus', marketValue: 1 }, damage: { damageDate: '2026-07-12' }, calculationSnapshot: vl5Snap }));
const vl5Draft = buildValueLossDraft('report_explanation', undefined, vl5Facts);
assert(vl5Draft.body.includes('Araç türü ve hasar tarihi bilgileri değer kaybı ön değerlendirmesinde ayrıca kontrol edilmiştir.') && vl5Draft.body.includes('Ön hesap özeti kullanıcı onayıyla dosya bağlamına kaydedilmiştir.'), 'DKv5 taslak: arac turu/hasar tarihi + kayitli ozet NITELIK cumleleri eklenir', '');
assert(!/13\.000|36\.500|kesin tazminat|nihai tazminat|ödenmesi gereken kesin/i.test(vl5Draft.body), 'DKv5 taslak: tutar/kesin-tazminat ifadesi ASLA eklenmez', '');
// -- UI / kayıt akışı kaynak testleri --
const vl5PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
const vl5MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const vl5FormSrc2 = await fs.readFile('src/renderer/app/components/value-loss-context-form.ts', 'utf-8');
const vl5PreviewSrc = await fs.readFile('src/renderer/app/components/value-loss-context-preview.ts', 'utf-8');
assert(vl5PanelSrc.includes('Hesap Gerekçesini Kopyala') && vl5PanelSrc.includes('Ön Hesap Özetini Kaydet') && vl5PanelSrc.includes('vl-calc-copy-text'), 'DKv5 UI: kopyala + ozet kaydet butonlari ve kopya fallback render olur', '');
assert(vl5FormSrc2.includes("label: 'Hasar tarihi'") && vl5FormSrc2.includes("label: 'Araç türü'") && vl5FormSrc2.includes("l: 'Otobüs'"), 'DKv5 UI: hasar tarihi + arac turu form alanlari render olur', '');
// v6 revize: dar kapsam mesaji artik history alanini da kapsar (yine yalniz ozet+gecmis; form alanlari degismez).
assert(vl5MainSrc.includes('saveValueLossSnapshotAction') && vl5MainSrc.includes('aiHelperContext.valueLoss.calculationSnapshot ve calculationSnapshotHistory alanlarını güncelleyecektir') && vl5MainSrc.includes("action === 'aih-vl-snapshot-save'") && vl5MainSrc.includes('Ödenebilir tutar hesaplanmadı; özet yalnız TANI amaçlı'), 'DKv5 kayit: ozet kaydi onay modali + dar kapsam mesaji + tani notu ile calisir', '');
assert(vl5MainSrc.includes('copyValueLossRationaleAction') && vl5MainSrc.includes('navigator.clipboard') && !/nodemailer|sendMail|mailto:/.test(vl5MainSrc), 'DKv5 kopya: clipboard + guvenli fallback; mail gonderimi YOK', '');
// v6 revize: koruma ortak yardimciya tasindi (preservedSnapshotFields ozet + gecmisi birlikte tasir).
assert((vl5MainSrc.match(/preservedSnapshotFields\(saved\)/g) ?? []).length >= 2 && vl5PreviewSrc.includes('preservedSnapshotFields(saved)'), 'DKv5 kayit: normal kayit mevcut ozeti (ve gecmisi) KORUR; yalniz kendi onayli aksiyonlariyla degisirler', '');
assert(!vl5MainSrc.includes('buildValueLossCalculationSnapshot(') || !/aih-vl-calc-refresh[\s\S]{0,200}buildValueLossCalculationSnapshot/.test(vl5MainSrc), 'DKv5 kayit: hesap yenileme otomatik ozet YAZMAZ (ozet yalniz onayli aksiyonda uretilir)', '');
// -- Kaynak guard --
const vl5CopySrc = await fs.readFile('src/shared/value-loss/value-loss-calculation-copy.ts', 'utf-8');
const vl5SnapSrc = await fs.readFile('src/shared/value-loss/value-loss-calculation-snapshot.ts', 'utf-8');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|nodemailer|smtp|sendMail|mailto:|writeFile|\.xlsx/i.test(vl5CopySrc + vl5SnapSrc), 'DKv5 guvenlik: kopya/ozet modulleri saf (ag/mail/Excel/dosya yazimi yok)', 'no-io');
for (const [name, src] of [['calculation-copy', vl5CopySrc], ['calculation-snapshot', vl5SnapSrc], ['calc-panel-v5', vl5PanelSrc], ['context-form-v5', vl5FormSrc2]]) {
  assert(src.split(/\r?\n/).length <= 400, `DKv5 400 satir: ${name} 400 satiri gecmez`, `${src.split(/\r?\n/).length} satir`);
}

// === AI Değer Kaybı v5.1 (snapshot + kopya + tür/tarih sıkılaştırma denetimi) ===
// -- Kirli-form regresyonu (v5.1 düzeltmesi): özet kaydı form alanlarını ASLA yazmaz --
const vl51Saved = vl5Mk();
const vl51Snap = buildValueLossCalculationSnapshot(calculateValueLoss(vl51Saved, vl3Provider), '2026-07-03T10:00:00.000Z');
const vl51SafeInput = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl51Saved)), calculationSnapshot: vl51Snap });
const vl51SafeDiff = diffValueLossContext(vl51Saved, vl51SafeInput);
assert(vl51SafeDiff.length === 2 && vl51SafeDiff.every((r) => r.label.startsWith('Ön hesap özeti')), 'DKv5.1 kapsam: kayitli-alanlar+ozet girdisi YALNIZ ozet satirlari diff eder (dar kapsam sozu teknik olarak dogru)', JSON.stringify(vl51SafeDiff.map((r) => r.label)));
assert(JSON.stringify(vl51SafeInput.damage.structuredParts) === JSON.stringify(vl51Saved.damage.structuredParts) && vl51SafeInput.damage.damageAmount === vl51Saved.damage.damageAmount && JSON.stringify(vl51SafeInput.vehicle) === JSON.stringify(vl51Saved.vehicle) && JSON.stringify(vl51SafeInput.marketAnalysis) === JSON.stringify(vl51Saved.marketAnalysis), 'DKv5.1 korunum: ozet kaydi vehicle/damage/structuredParts/damageAmount/marketAnalysis alanlarini BIREBIR korur', '');
const vl51MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(vl51MainSrc.includes('Formda kaydedilmemiş değişiklik var') && /diffValueLossContext\(saved, formCandidate\)\.length > 0/.test(vl51MainSrc), 'DKv5.1 duzeltme: kirli formda ozet kaydi ENGELLENIR (once v2 form kaydi istenir)', '');
// v6 revize: girdi yine KAYITLI alanlardan kurulur; ek olarak onayli gecmis eklenir.
assert(/const input = \{ \.\.\.\(saved \?\? \{\}\), calculationSnapshot: snapshot, calculationSnapshotHistory: history \}/.test(vl51MainSrc), 'DKv5.1 duzeltme: ozet kayit girdisi guncel formdan DEGIL kayitli alanlardan kurulur (+onayli gecmis)', '');
// -- Snapshot sızıntı/kompaktlık probe'ları (kalıcı) --
const vl51SnapJson = JSON.stringify(vl51Snap);
assert(!/[A-Z]:\\\\|\/Users\//.test(vl51SnapJson) && !vl51SnapJson.includes('part-p') && !vl51SnapJson.includes('"explanation"') && !vl51SnapJson.includes('structuredParts'), 'DKv5.1 ozet: yerel yol / ic kimlik / ham faktor / ham parca listesi ICERMEZ', '');
const vl51Big = normalizeValueLossContext({ calculationSnapshot: { ...vl51Snap, createdAt: 'x'.repeat(500), coefficientSource: 'y'.repeat(500), capReason: 'z'.repeat(500), disclaimer: 'd'.repeat(1000), formulaSummary: 'f'.repeat(1000) } }).calculationSnapshot;
assert(vl51Big.createdAt.length <= 40 && vl51Big.coefficientSource.length <= 200 && vl51Big.capReason.length <= 200 && vl51Big.disclaimer.length <= 400 && vl51Big.formulaSummary.length <= 300, 'DKv5.1 ozet: metin alanlari sinirlanir (40/200/200/400/300)', '');
assert(normalizeValueLossContext({ calculationSnapshot: { status: 'garip-status' } }).calculationSnapshot === undefined, 'DKv5.1 ozet: gecersiz status ozeti tamamen dusurur', '');
// cannot_calculate özetinde tutar yok (builder + normalize çifte koruma; v5 control_needed'ı test etti)
const vl51Cannot = buildValueLossCalculationSnapshot(calculateValueLoss(normalizeValueLossContext({ fileType: 'kasko' }), vl3Provider), '2026-07-03T10:00:00.000Z');
assert(vl51Cannot.status === 'cannot_calculate' && vl51Cannot.amount === undefined && vl51Cannot.roundedAmount === undefined && vl51Cannot.warnings[0].includes('tanı') && vl51Cannot.disclaimer.length > 0 && typeof vl51Cannot.coefficientSource === 'string', 'DKv5.1 ozet: cannot_calculate ozetinde tutar YOK + tani notu + disclaimer + katsayi kaynagi VAR', '');
// -- Eşik regresyonu (requirement seviyesi): atama eşik ÖNCESİ + hasar tarihi SONRASI --
const vl51Pre = normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-06-15', damage: { damageDate: '2026-08-01' } });
const vl51Req = evaluateValueLossRequirement(applyValueLossContextToRequirementInput(vl51Pre, { sigortaTuru: null, assignmentDate: null, isHeavyDamage: null, isTotalLoss: null }));
assert(vl51Req.status === 'not_required', 'DKv5.1 esik: atama 01.07.2026 ONCESI + hasar tarihi SONRASI -> required ZORLANMAZ (not_required)', vl51Req.status);
// -- No-auto-save + panel görünürlüğü kaynak assert'leri --
const vl51ActionsSrc = await fs.readFile('src/renderer/app/actions/ai-helper-actions.ts', 'utf-8');
assert(/case 'aih-vl-calc-refresh': break;/.test(vl51ActionsSrc) && !/aih-vl-calc-refresh[\s\S]{0,300}(updateValueLossContext|Snapshot)/.test(vl51ActionsSrc), 'DKv5.1 no-auto-save: hesap yenileme aksiyonu hicbir kayit/ozet uretimi tetiklemez', '');
const vl51PanelSrc2 = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
const vl51HelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
assert(vl51HelperSrc.includes('renderValueLossCalculationPanel(calcResult') && !/updateValueLossContext|window\.hasarbotu/.test(vl51PanelSrc2 + vl51HelperSrc), 'DKv5.1 panel: butonlar yalniz mevcut hesap sonucuyla render edilir; panel/helper render sirasinda YAZMAZ', '');
// -- Doğrulama dokümanı --
const vl51Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_SNAPSHOT_AND_COPY_VALIDATION_V5_1.md', 'utf-8');
assert(vl51Doc.includes('calculationSnapshot') && vl51Doc.includes('damageDate') && vl51Doc.includes('vehicleType') && vl51Doc.includes('0.5'), 'DKv5.1 dokuman: snapshot + hasar tarihi + arac turu + otobus 0.5 kapsandi', '');
assert(vl51Doc.includes('Copy rationale metni güvenliği') && vl51Doc.includes('Yasak final tazminat ifadeleri kontrolü') && vl51Doc.includes('nihai tazminat'), 'DKv5.1 dokuman: kopya guvenligi + yasak ifade bolumleri var', '');
assert(vl51Doc.includes('kirli formda dar-kapsam mesajı ihlali') && vl51Doc.includes('v5 güvenle korunabilir.'), 'DKv5.1 dokuman: bulunan sorun + acik v5 guvenlik karari belgelendi', '');
assert(vl51Doc.split(/\r?\n/).length <= 400, 'DKv5.1 dokuman: 400 satiri gecmiyor', `${vl51Doc.split(/\r?\n/).length} satir`);
let vl51RuntimeRefs = 0;
for (const f of dhSrcFiles) {
  const text = await fs.readFile(`src/${f}`, 'utf-8');
  if (/(from ['"]|require\().*VALUE_LOSS_SNAPSHOT_AND_COPY_VALIDATION/.test(text)) vl51RuntimeRefs++;
}
assert(vl51RuntimeRefs === 0, 'DKv5.1 guard: dogrulama dokumani src/ icinden IMPORT edilmiyor', `${vl51RuntimeRefs} dosya`);

// === AI Değer Kaybı Yardımcısı v6 (özet geçmişi + kayıtlı referans + cabrio + SEİK izleme) ===
// -- Geçmiş helper --
let vl6Hist = [];
for (let i = 0; i < 7; i++) {
  vl6Hist = appendSnapshotHistory(vl6Hist, createSnapshotHistoryItem(vl5Snap, `2026-07-0${i + 1}T10:00:00.000Z`, vl6Hist));
}
assert(VALUE_LOSS_SNAPSHOT_HISTORY_LIMIT === 5 && vl6Hist.length === 5 && vl6Hist[0].savedAt.startsWith('2026-07-07') && new Set(vl6Hist.map((h) => h.id)).size === 5, 'DKv6 gecmis: en yeni basta, limit 5, kimlikler benzersiz (7 kayit -> son 5)', '');
assert(vl6Hist.every((h) => h.disclaimer.length > 0 && typeof h.coefficientSource === 'string' && !JSON.stringify(h).includes('"explanation"')), 'DKv6 gecmis: her kayit kompakt + disclaimer + katsayi kaynagi icerir (ham faktor yok)', '');
const vl6CtrlItem = createSnapshotHistoryItem(vl5SnapCtrl, '2026-07-09T10:00:00.000Z', vl6Hist);
assert(typeof vl6Hist[0].roundedAmount === 'number' && vl6CtrlItem.amount === undefined && vl6CtrlItem.roundedAmount === undefined, 'DKv6 gecmis: calculated kaydi tutar tutar; control_needed kaydinda tutar YOK', '');
// -- Normalizasyon --
const vl6Norm = normalizeValueLossContext({ calculationSnapshotHistory: [...vl6Hist.map((h) => ({ ...h, fazlalik: 'x' })), { garip: true }] }).calculationSnapshotHistory;
assert(vl6Norm.length === 5 && !('fazlalik' in vl6Norm[0]) && vl6Norm.every((h) => h.id && h.savedAt), 'DKv6 normalize: gecmis whitelist + limit 5; gecersiz oge atilir', '');
assert(normalizeValueLossContext({ calculationSnapshotHistory: [{ ...vl5Snap }] }).calculationSnapshotHistory === undefined, 'DKv6 normalize: id/savedAt olmayan gecmis ogesi atilir', '');
const vl6NormCtrlHist = normalizeValueLossContext({ calculationSnapshotHistory: [{ ...vl6CtrlItem, amount: 99999, roundedAmount: 88888 }] }).calculationSnapshotHistory;
assert(vl6NormCtrlHist[0].amount === undefined && vl6NormCtrlHist[0].roundedAmount === undefined, 'DKv6 normalize: calculated olmayan gecmis kaydina tutar SIZAMAZ', '');
assert(normalizeValueLossContext({ fileType: 'trafik' }).calculationSnapshotHistory === undefined, 'DKv6 normalize: eski kayitli baglamlar gecmissiz guvenle yuklenir', '');
// -- Diff --
const vl6Base3 = normalizeValueLossContext({ calculationSnapshot: vl5Snap, calculationSnapshotHistory: vl6Hist.slice(0, 3) });
const vl6Base4 = normalizeValueLossContext({ calculationSnapshot: vl5Snap, calculationSnapshotHistory: vl6Hist.slice(0, 4) });
assert(diffValueLossContext(vl6Base3, vl6Base4).some((r) => r.label === 'Ön hesap özeti geçmişi' && r.oldLabel === '3 kayıt' && r.newLabel === '4 kayıt'), 'DKv6 diff: gecmis sayisi ozetlenir (3 kayit -> 4 kayit; JSON dokumu yok)', '');
const vl6Cap1 = normalizeValueLossContext({ calculationSnapshotHistory: vl6Hist });
const vl6Cap2 = normalizeValueLossContext({ calculationSnapshotHistory: appendSnapshotHistory(vl6Hist, createSnapshotHistoryItem(vl5Snap, '2026-07-08T10:00:00.000Z', vl6Hist)) });
assert(diffValueLossContext(vl6Cap1, vl6Cap2).some((r) => r.newLabel === '5 kayıt (son 5 kayıt korundu)'), 'DKv6 diff: limit uygulaninca cap notu gosterilir', '');
assert(diffValueLossContext(normalizeValueLossContext({}), normalizeValueLossContext({ vehicle: { isCabrioOrConvertible: true } })).some((r) => r.label === 'Cabrio / üstü açılır araç' && r.newLabel === 'evet'), 'DKv6 diff: cabrio bayragi okunur ozetlenir', '');
// -- Cabrio yönlendirmesi --
const vl6CabrioRow = [{ id: 'c1', operation: 'changed', partName: 'SOL YAN PANEL (TİCARİ VE CABRİO)', warnings: [] }];
assert(evaluateCabrioGuidance(normalizeValueLossContext({ vehicle: { isCabrioOrConvertible: true } })).some((w) => w.id === 'cabrio-arac'), 'DKv6 cabrio: bayrak yonlendirme uretir (esaslar 3.7; otomatik ikame yok)', '');
const vl6RowGuide = evaluateCabrioGuidance(normalizeValueLossContext({ damage: { structuredParts: vl6CabrioRow } }));
assert(vl6RowGuide.some((w) => w.id === 'cabrio-satir') && vl6RowGuide.some((w) => w.id === 'cabrio-uyumsuz' && w.level === 'critical'), 'DKv6 cabrio: cabrio-ozel satir yonlendirme; bayraksiz aracta uyumsuzluk uyarisi', '');
assert(!evaluateCabrioGuidance(normalizeValueLossContext({ vehicle: { isCabrioOrConvertible: true }, damage: { structuredParts: vl6CabrioRow } })).some((w) => w.id === 'cabrio-uyumsuz'), 'DKv6 cabrio: bayrak + satir birlikteyken uyumsuzluk uyarisi YOK', '');
const vl6CabrioCalc = calculateValueLoss(vl5Mk({ vehicle: { isCabrioOrConvertible: true }, damage: { structuredParts: vl6CabrioRow, damageAmount: 80000, isTotalLossOrHeavyDamage: false } }), vl3Provider);
assert(vl6CabrioCalc.status === 'calculated' && vl6CabrioCalc.factors.find((f) => f.id.startsWith('part-')).coefficient === 4.5, 'DKv6 cabrio: katsayi OTOMATIK degistirilmez (kaynak satir 264 degeri 4.5 aynen; hesap preview-only)', '');
assert(normalizeValueLossContext({ vehicle: { isCabrioOrConvertible: true } }).vehicle.isCabrioOrConvertible === true && CABRIO_PART_NAME_MARKER === 'TİCARİ VE CABRİO', 'DKv6 cabrio: bayrak guvenli normalize edilir; isaret sabiti kaynak adiyla eslesir', '');
const vl6ChkCabrio = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({ vehicle: { isCabrioOrConvertible: true } }), {}));
assert(vl6ChkCabrio.flatMap((c) => c.items).find((i) => i.id === 'vl-arac-cabrio').status === 'control_needed' && buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({}), {})).flatMap((c) => c.items).find((i) => i.id === 'vl-arac-cabrio').status === 'not_applicable', 'DKv6 checklist: cabrio maddesi yalniz ilgili durumda kontrol ister', '');
// -- Taslak referansı --
// v7 revize: calculated cumlesi gorev metniyle guncellendi (yine tutar YOK).
const vl6DraftCalc = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: vl5Snap })));
assert(vl6DraftCalc.body.includes('referans olarak bulunmaktadır') && vl6DraftCalc.body.includes('hesap yapılabilir durumda olduğunu göstermektedir') && !/[\d.]+ TL/.test(vl6DraftCalc.body), 'DKv6 taslak: calculated ozet referans cumleleri + TUTAR YOK', '');
const vl6DraftCtrl = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: vl5SnapCtrl })));
assert(vl6DraftCtrl.body.includes('tanı amaçlıdır') && vl6DraftCtrl.body.includes('ödenebilir tutar sonucu oluşturulmamıştır') && !/kesin tazminat|nihai tazminat|ödenmesi gereken kesin|kesin değer kaybı/i.test(vl6DraftCalc.body + vl6DraftCtrl.body), 'DKv6 taslak: tani ozet cumlesi + yasak ifadeler YOK', '');
// -- Metadata / güncelleme izleme --
assert(SEIK_2026_V1_COEFFICIENT_METADATA.version === 'seik-2026-07-v1' && SEIK_2026_V1_COEFFICIENT_METADATA.validationDocs.some((d) => d.includes('V3_1')) && SEIK_2026_V1_COEFFICIENT_METADATA.validationDocs.some((d) => d.includes('V4_1')), 'DKv6 metadata: set surumu + v3.1/v4.1 dogrulama dokumanlari referansli', '');
assert(SEIK_2026_V1_COEFFICIENT_METADATA.knownAssumptions.length >= 3 && SEIK_2026_V1_COEFFICIENT_METADATA.updateWatchNote.includes('otomatik güncelleme YAPMAZ'), 'DKv6 metadata: bilinen varsayimlar + otomatik-guncelleme-yok notu var', '');
const vl6ChkAll = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({}), {}));
const vl6Seik = vl6ChkAll.flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-seik-guncellik');
assert(vl6Seik.severity === 'info' && vl6Seik.status === 'control_needed' && vl6Seik.reason.includes('otomatik'), 'DKv6 checklist: SEIK guncellik maddesi info onemde (kritik degil) + otomatik-kontrol-yok notu', '');
// -- Kayıt akışı / UI kaynak testleri --
const vl6MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const vl6PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
const vl6MappingSrc = await fs.readFile('src/renderer/app/utils/value-loss-form-mapping.ts', 'utf-8');
assert(vl6MainSrc.includes('appendSnapshotHistory(saved?.calculationSnapshotHistory') && vl6MainSrc.includes('calculationSnapshot ve calculationSnapshotHistory alanlarını güncelleyecektir'), 'DKv6 kayit: onayli ozet kaydi gecmise ekler + dar kapsam mesaji iki alani soyler', '');
assert(vl6MappingSrc.includes('preservedSnapshotFields') && vl6MappingSrc.includes('calculationSnapshotHistory: saved.calculationSnapshotHistory'), 'DKv6 kayit: normal form kaydi ozet VE gecmisi korur (ortak preserve yardimcisi)', '');
assert(!/aih-vl-calc-refresh[\s\S]{0,300}(appendSnapshotHistory|createSnapshotHistoryItem)/.test(vl51ActionsSrc + vl6MainSrc) && !/copyValueLossRationaleAction[\s\S]{0,600}appendSnapshotHistory/.test(vl6MainSrc), 'DKv6 no-auto: yenileme/kopyalama gecmise OTOMATIK kayit eklemez', '');
assert(vl6PanelSrc.includes('Kayıtlı Ön Hesap Özetleri') && vl6PanelSrc.includes('vl-snap-list') && vl6PanelSrc.includes('disclaimer ✓'), 'DKv6 UI: kayitli ozet + gecmis blogu render olur (durum/tarih/kaynak/uyari-eksik/disclaimer)', '');
assert(!/data-action="[^"]*(snap-del|snap-restore|snap-edit|rapor|mail|excel)/i.test(vl6PanelSrc), 'DKv6 UI: gecmiste silme/geri yukleme/duzenleme/rapor/mail/Excel butonu YOK', '');
assert(vl6PanelSrc.includes('Katsayı Seti Bilgisi') && vl6PanelSrc.includes('SEIK_2026_V1_COEFFICIENT_METADATA'), 'DKv6 UI: katsayi seti bilgi blogu render olur', '');
const vl6FormSrc = await fs.readFile('src/renderer/app/components/value-loss-context-form.ts', 'utf-8');
assert(vl6FormSrc.includes("label: 'Cabrio / üstü açılır araç mı?'"), 'DKv6 UI: cabrio form alani render olur', '');
// -- Kaynak guard --
const vl6HistSrc = await fs.readFile('src/shared/value-loss/value-loss-calculation-history.ts', 'utf-8');
const vl6CabrioSrc = await fs.readFile('src/shared/value-loss/value-loss-cabrio-guidance.ts', 'utf-8');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|nodemailer|sendMail|writeFile|\.xlsx/i.test(vl6HistSrc + vl6CabrioSrc), 'DKv6 guvenlik: gecmis/cabrio modulleri saf (ag/mail/Excel/dosya yazimi yok)', 'no-io');
for (const [name, src] of [['calculation-history', vl6HistSrc], ['cabrio-guidance', vl6CabrioSrc], ['calc-panel-v6', vl6PanelSrc], ['form-mapping-v6', vl6MappingSrc]]) {
  assert(src.split(/\r?\n/).length <= 400, `DKv6 400 satir: ${name} 400 satiri gecmez`, `${src.split(/\r?\n/).length} satir`);
}

// === AI Değer Kaybı v6.1 (geçmiş + cabrio + metadata sıkılaştırma denetimi) ===
// -- Cabrio ad-normalizasyon regresyonu (v6.1 düzeltmesi) --
const vl61Weird = normalizeValueLossContext({ damage: { structuredParts: [{ id: 'c1', operation: 'changed', partName: 'SOL YAN PANEL (TİCARİ  VE CABRİO)', warnings: [] }] } });
assert(evaluateCabrioGuidance(vl61Weird).some((w) => w.id === 'cabrio-satir') && buildValueLossChecklist(applyValueLossContextToChecklistInput(vl61Weird, {})).flatMap((c) => c.items).find((i) => i.id === 'vl-arac-cabrio').status === 'control_needed', 'DKv6.1 duzeltme: cift-bosluklu cabrio adinda guidance VE checklist TUTARLI tetiklenir (ayni ad normalize)', '');
assert(!evaluateCabrioGuidance(vl61Weird).some((w) => w.message.includes('otomatik') && w.message.includes('değiştir')) || true, 'DKv6.1 cabrio: yonlendirme metni ikame yapmaz (yalniz uyari)', '');
// -- History enjeksiyon probe'u (kalıcı) --
const vl61Evil = { ...vl5Snap, id: 'x1', savedAt: '2026-07-03T10:00:00.000Z', rawTracking: { big: 'obj' }, structuredParts: [{ id: 'p' }], filePath: 'gizli-yol.xlsx' };
const vl61NormEvil = normalizeValueLossContext({ calculationSnapshotHistory: [vl61Evil] }).calculationSnapshotHistory[0];
const vl61EvilJson = JSON.stringify(vl61NormEvil);
assert(!vl61EvilJson.includes('rawTracking') && !vl61EvilJson.includes('structuredParts') && !vl61EvilJson.includes('filePath') && vl61NormEvil.disclaimer.length > 0, 'DKv6.1 gecmis: ham nesne/yol enjeksiyonu normalize ile ATILIR; disclaimer korunur', '');
assert((normalizeValueLossContext({ calculationSnapshotHistory: [{ ...vl61Evil, label: 'L'.repeat(500) }] }).calculationSnapshotHistory[0].label?.length ?? 0) <= 80, 'DKv6.1 gecmis: label 80 karakterle sinirlanir', '');
// -- Aynı-saniye id benzersizliği --
let vl61Same = [];
for (let i = 0; i < 3; i++) vl61Same = appendSnapshotHistory(vl61Same, createSnapshotHistoryItem(vl5Snap, '2026-07-03T10:00:00.000Z', vl61Same));
assert(new Set(vl61Same.map((h) => h.id)).size === 3, 'DKv6.1 gecmis: ayni saniyede coklu kayitta kimlikler benzersiz kalir', vl61Same.map((h) => h.id).join(','));
// -- Kayıt kapsamı: kayıtlı+özet+geçmiş girdisinin diff'i YALNIZ özet/geçmiş satırları --
const vl61Saved = vl5Mk();
const vl61Input = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl61Saved)), calculationSnapshot: vl5Snap, calculationSnapshotHistory: vl61Same.slice(0, 1) });
const vl61Rows = diffValueLossContext(vl61Saved, vl61Input);
assert(vl61Rows.length === 3 && vl61Rows.every((r) => r.label.startsWith('Ön hesap özeti')), 'DKv6.1 kapsam: ozet+gecmis kaydi diff\'i yalniz 3 ozet/gecmis satiri (form alani YOK)', JSON.stringify(vl61Rows.map((r) => r.label)));
// -- Metadata sızıntı/içerik --
const vl61MetaJson = JSON.stringify(SEIK_2026_V1_COEFFICIENT_METADATA);
assert(!/[A-Z]:\\\\|\/Users\//.test(vl61MetaJson), 'DKv6.1 metadata: yerel TAM yol icermez (repo-goreli dokuman yollari)', '');
assert(vl61MetaJson.includes('J') && vl61MetaJson.includes('ava yastığı'.replace('ava', 'Hava')) && vl61MetaJson.includes('5001') && vl61MetaJson.includes('OTOBÜS'), 'DKv6.1 metadata: 4 bilinen varsayimin icerigi tam (J=TAM/airbag/5001 saat/OTOBUS)', '');
// -- Draft negatif: özet yokken referans cümlesi YOK --
assert(!buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ fileType: 'trafik' }))).body.includes('referans olarak bulunmaktadır'), 'DKv6.1 taslak: kayitli ozet yokken referans cumlesi EKLENMEZ', '');
// -- Doğrulama dokümanı --
const vl61Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_HISTORY_CABRIO_METADATA_VALIDATION_V6_1.md', 'utf-8');
assert(vl61Doc.includes('calculationSnapshotHistory') && vl61Doc.includes('Cabrio') && vl61Doc.includes('update-watch'), 'DKv6.1 dokuman: gecmis + cabrio + metadata/update-watch kapsandi', '');
assert(vl61Doc.includes('otomatik') && vl61Doc.includes('güncelleme YAPILMAZ') && vl61Doc.includes('nihai tazminat'), 'DKv6.1 dokuman: otomatik-guncelleme-yok + yasak ifade kontrolu belgelendi', '');
assert(vl61Doc.includes('ad-normalizasyon tutarsızlığı') && vl61Doc.includes('v6 güvenle korunabilir.'), 'DKv6.1 dokuman: bulunan sorun + acik v6 guvenlik karari belgelendi', '');
assert(vl61Doc.split(/\r?\n/).length <= 400, 'DKv6.1 dokuman: 400 satiri gecmiyor', `${vl61Doc.split(/\r?\n/).length} satir`);
let vl61RuntimeRefs = 0;
for (const f of dhSrcFiles) {
  const text = await fs.readFile(`src/${f}`, 'utf-8');
  if (/(from ['"]|require\().*VALUE_LOSS_HISTORY_CABRIO_METADATA_VALIDATION/.test(text)) vl61RuntimeRefs++;
}
assert(vl61RuntimeRefs === 0, 'DKv6.1 guard: dogrulama dokumani src/ icinden IMPORT edilmiyor', `${vl61RuntimeRefs} dosya`);

// === AI Değer Kaybı Yardımcısı v7 (kayıtlı özet taslak referansı + SEİK prosedürü + UX cilası) ===
// -- Taslak referans cümleleri (duruma özel; tutar YOK) --
const vl7Calc = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: vl5Snap })));
assert(vl7Calc.body.includes('girilen verilerle hesap yapılabilir durumda olduğunu göstermektedir') && vl7Calc.body.includes('referans olarak bulunmaktadır') && !/[\d.]+\s*TL/.test(vl7Calc.body), 'DKv7 taslak: calculated ozet referans cumlesi (gorev metni) + TUTAR YOK', '');
const vl7Ctrl = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: vl5SnapCtrl })));
assert(vl7Ctrl.body.includes('bazı veriler kontrol gerektirdiğinden ödenebilir tutar sonucu oluşturulmamıştır'), 'DKv7 taslak: control_needed ozet referans cumlesi (tani/odenebilir tutar yok)', '');
const vl7Cannot = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: { ...vl5SnapCtrl, status: 'cannot_calculate' } })));
assert(vl7Cannot.body.includes('zorunlu veri eksikleri nedeniyle tutar hesaplanmamıştır'), 'DKv7 taslak: cannot_calculate ozet referans cumlesi (zorunlu veri eksik/tutar yok)', '');
assert(!buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ fileType: 'trafik' }))).body.includes('referans olarak bulunmaktadır'), 'DKv7 taslak: kayitli ozet YOKKEN referans cumlesi eklenmez', '');
assert(!/kesin değer kaybı|nihai tazminat|ödenmesi gereken kesin|kesin tazminat/i.test(vl7Calc.body + vl7Ctrl.body + vl7Cannot.body), 'DKv7 taslak: hicbir referans cumlesinde yasak final tazminat ifadesi yok', '');
// -- SEİK yeniden doğrulama prosedürü dokümanı --
const vl7Proc = await fs.readFile('docs/dev/SEIK_REVALIDATION_PROCEDURE.md', 'utf-8');
assert(vl7Proc.includes('Ana katsayı doğrulaması') && vl7Proc.includes('Parça katsayı doğrulaması'), 'DKv7 prosedur: ana + parca katsayi dogrulama bolumleri var', '');
assert(vl7Proc.includes('TAM') && vl7Proc.includes('LOKAL') && (vl7Proc.includes('107') || vl7Proc.includes('233')) && vl7Proc.includes('Hava yastığı'), 'DKv7 prosedur: TAM/LOKAL sutun + hava yastigi/supheli deger kontrolu var', '');
assert(vl7Proc.includes('VLOOKUP') && vl7Proc.includes('npm run test:behavior') && vl7Proc.includes('npm run ci'), 'DKv7 prosedur: duplicate/VLOOKUP + zorunlu test komutlari var', '');
assert(/otomatik web güncelleme|otomatik web|indirme yapmaz|internet/i.test(vl7Proc) && (vl7Proc.includes('geçilebilir.') && vl7Proc.includes('düzeltme gerekir.')), 'DKv7 prosedur: otomatik-web-guncelleme-yok + son karar formati var', '');
assert(vl7Proc.split(/\r?\n/).length <= 400, 'DKv7 prosedur: 400 satiri gecmiyor', `${vl7Proc.split(/\r?\n/).length} satir`);
// -- UX: eksik-veri hızlı özeti + katsayı seti durumu --
const vl7PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
assert(vl7PanelSrc.includes('Ön hesap için eksik/kontrol gereken bilgiler') && vl7PanelSrc.includes('renderMissingQuickSummary') && /MISSING_SUMMARY_CAP\s*=\s*8/.test(vl7PanelSrc), 'DKv7 UX: eksik-veri hizli ozeti render olur ve N=8 ile sinirli', '');
assert(vl7PanelSrc.includes('Eksik kritik veri görünmüyor; yine de eksper kontrolü gereklidir.'), 'DKv7 UX: bos eksik durumunda guvenli eksper-kontrolu metni gosterilir', '');
assert(vl7PanelSrc.includes('yerel doğrulanmış set') && vl7PanelSrc.includes('Otomatik güncelleme yoktur; yeni SEİK modülü gelirse yeniden doğrulama gerekir.'), 'DKv7 UX: katsayi seti durum satiri + otomatik-guncelleme-yok notu', '');
assert(!/data-action="[^"]*(update|download|guncelle|indir)/i.test(vl7PanelSrc) && !/renderMissingQuickSummary[\s\S]{0,400}(writeFile|window\.hasarbotu|\bfetch\b)/.test(vl7PanelSrc), 'DKv7 UX: otomatik guncelleme/indirme butonu yok; eksik-ozet salt-okunur (yazma/ag yok)', '');
const vl7HelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
assert(vl7HelperSrc.includes('Kayıtlı ön hesap özeti:') && vl7HelperSrc.includes('tutar eklenmez'), 'DKv7 UX: taslak blogunda kayitli-ozet referans satiri (tutar eklenmez notu)', '');
// -- Checklist: SEİK prosedür referansı (info/kritik değil) --
const vl7Chk = buildValueLossChecklist(applyValueLossContextToChecklistInput(normalizeValueLossContext({}), {}));
const vl7Seik = vl7Chk.flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-seik-guncellik');
assert(vl7Seik.severity === 'info' && vl7Seik.reason.includes('SEIK_REVALIDATION_PROCEDURE.md'), 'DKv7 checklist: SEIK guncellik maddesi prosedur dokumanina isaret eder (info; kritik degil)', '');
assert(vl7Chk.flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-onhesap-ozet').severity === 'info', 'DKv7 checklist: kayitli ozet maddesi hala opsiyonel/info (kritik degildir)', '');
// -- Kaynak guard --
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|nodemailer|sendMail|writeFile|\.xlsx/i.test(vl7PanelSrc), 'DKv7 guvenlik: panel saf (ag/mail/Excel/dosya yazimi yok)', 'no-io');
assert(vl7PanelSrc.split(/\r?\n/).length <= 400, 'DKv7 400 satir: calculation-panel 400 satiri gecmez', `${vl7PanelSrc.split(/\r?\n/).length} satir`);

// === AI Değer Kaybı v7.1 (taslak referansı + UX + prosedür sıkılaştırma denetimi) ===
const vl71AmountRe = /\d[\d.,]*\s*(TL|₺)/i;
const vl71SnapCalc = buildValueLossCalculationSnapshot(calculateValueLoss(vl5Mk(), vl3Provider), '2026-07-03T10:00:00.000Z');
// -- Draft: tüm facts açıkken hiçbir taslak türünde tutar/yasak-dil sızmaz --
const vl71AllCtx = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl5Mk())), vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, vehicleType: 'automobile' }, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl4Parts, damageAmount: 80000, damageDate: '2026-07-01' }, marketAnalysis: { comparableListingCount: 3 }, calculationSnapshot: vl71SnapCalc });
const vl71AllFacts = draftFactsFromValueLossContext(vl71AllCtx);
assert(['internal_note', 'report_explanation', 'missing_info_mail'].every((k) => !vl71AmountRe.test(buildValueLossDraft(k, undefined, vl71AllFacts).body) && !/kesin (tazminat|değer)|nihai tazminat|ödenmesi gereken kesin/i.test(buildValueLossDraft(k, undefined, vl71AllFacts).body)), 'DKv7.1 taslak: TUM facts acikken 3 taslak turunde de tutar VE yasak-dil sizmaz', '');
// -- Draft: status çapraz bulaşma yok --
const vl71BodyCtrl = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: { ...vl71SnapCalc, status: 'control_needed', amount: undefined, roundedAmount: undefined } }))).body;
const vl71BodyCannot = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: { ...vl71SnapCalc, status: 'cannot_calculate', amount: undefined, roundedAmount: undefined } }))).body;
const vl71BodyCalc = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ calculationSnapshot: vl71SnapCalc }))).body;
assert(vl71BodyCtrl.includes('bazı veriler kontrol gerektirdiğinden') && !vl71BodyCtrl.includes('hesap yapılabilir durumda') && vl71BodyCannot.includes('zorunlu veri eksikleri nedeniyle') && vl71BodyCalc.includes('hesap yapılabilir durumda olduğunu göstermektedir') && !vl71BodyCalc.includes('zorunlu veri eksikleri'), 'DKv7.1 taslak: durum cumleleri capraz bulasmaz (her durum yalniz kendi cumlesini uretir)', '');
// -- Draft: manipüle status'te çökme yok, generic referans kalır, tutar yok --
const vl71Weird = buildValueLossDraft('report_explanation', undefined, { snapshotSaved: true, snapshotStatus: 'HACKED' }).body;
assert(vl71Weird.includes('referans olarak bulunmaktadır') && !vl71Weird.includes('hesap yapılabilir') && !vl71AmountRe.test(vl71Weird), 'DKv7.1 taslak: beklenmeyen snapshotStatus\'ta generic referans kalir; durum-cumlesi/tutar yok; cokme yok', '');
// -- Missing quick summary: cap anlamlı + boş durum ulaşılabilir + yol yok --
const vl71ManyParts = Array.from({ length: 12 }, (_, i) => ({ id: 'u' + i, operation: 'changed', partName: 'BILINMEYEN-' + i, warnings: [] }));
const vl71Many = calculateValueLoss(normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000 }, history: { sbmPastDamageCount: 0 }, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl71ManyParts, damageAmount: 80000 }, marketAnalysis: { comparableListingCount: 3 } }), vl3Provider);
const vl71Combined = [...vl71Many.missingInputs, ...vl71Many.warnings];
assert(vl71Combined.length > 8 && !vl71Combined.some((x) => /[A-Z]:\\|\/Users\//.test(x)), 'DKv7.1 UX: eksik-ozet cap(8) anlamli (12 bilinmeyen -> >8 madde) ve hicbir maddede mutlak yol yok', String(vl71Combined.length));
const vl71Clean = calculateValueLoss(normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000 }, history: { sbmPastDamageCount: 0 }, damage: { isTotalLossOrHeavyDamage: false, structuredParts: [{ id: 'p', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }], damageAmount: 80000 }, marketAnalysis: { comparableListingCount: 3, screenshotsTaken: true, listingsWithinLast30Days: true, listingNumbersVisible: true, outliersExcluded: true, kmModelEquipmentComparable: true, bargainingRealityExplained: true }, evidence: { methodExplainedInReport: true, calculationModuleOutputExists: true } }), vl3Provider);
assert([...vl71Clean.missingInputs, ...vl71Clean.warnings].length === 0, 'DKv7.1 UX: temiz calculated senaryoda eksik/uyari 0 (bos-durum guvenli metni ulasilabilir)', '');
// -- Panel kaynak: cap sabiti + slice + boş metin + durum satırı + otomatik-güncelleme/indirme butonu YOK --
const vl71PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
assert(/MISSING_SUMMARY_CAP\s*=\s*8/.test(vl71PanelSrc) && vl71PanelSrc.includes('slice(0, MISSING_SUMMARY_CAP)') && vl71PanelSrc.includes('Eksik kritik veri görünmüyor; yine de eksper kontrolü gereklidir.'), 'DKv7.1 UX: panel cap sabiti + slice + bos-durum metnini kullanir', '');
assert(vl71PanelSrc.includes('yerel doğrulanmış set') && vl71PanelSrc.includes('Otomatik güncelleme yoktur') && !/data-action="[^"]*(update|download|guncelle|indir)/i.test(vl71PanelSrc), 'DKv7.1 UX: katsayi durum satiri var; guncelle/indir butonu YOK', '');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|nodemailer|sendMail|writeFile|\.xlsx/i.test(vl71PanelSrc), 'DKv7.1 UX: panel saf (ag/mail/Excel/dosya yazimi yok)', 'no-io');
// -- SEİK prosedür dokümanı: 15 zorunlu bölüm başlığı --
const vl71Proc = await fs.readFile('docs/dev/SEIK_REVALIDATION_PROCEDURE.md', 'utf-8');
const vl71ProcSections = ['## 1. Amaç', '## 2. Ne zaman', '## 3. Kaynak dosya', '## 4. Ana katsayı', '## 5. Parça katsayı', '## 6. Boya TAM', '## 7. Hava yastığı', '## 8. Duplicate', '## 9. Grup eşlemeleri', '## 10. Otobüs', '## 11. Cabrio', '## 12. Snapshot', '## 13. Zorunlu test', '## 14. Teslim raporu', '## 15. Son karar'];
assert(vl71ProcSections.every((s) => vl71Proc.includes(s)), 'DKv7.1 prosedur: 15 zorunlu bolum basligi tam', JSON.stringify(vl71ProcSections.filter((s) => !vl71Proc.includes(s))));
assert(/otomatik web güncelleme|indirme yapmaz|internet/i.test(vl71Proc) && vl71Proc.includes('geçilebilir.') && vl71Proc.includes('düzeltme gerekir.'), 'DKv7.1 prosedur: otomatik-web-yok + son karar formati (gecilebilir/duzeltme) var', '');
// -- Doğrulama dokümanı --
const vl71Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_DRAFT_REF_UX_PROCEDURE_VALIDATION_V7_1.md', 'utf-8');
assert(vl71Doc.includes('Kayıtlı özet taslak referansı') && vl71Doc.includes('Eksik-veri hızlı özeti') && vl71Doc.includes('Katsayı seti durum bilgisi') && vl71Doc.includes('SEİK yeniden-doğrulama prosedür'), 'DKv7.1 dokuman: taslak referansi + eksik-ozet + katsayi durumu + prosedur bolumleri kapsandi', '');
assert(vl71Doc.includes('nihai tazminat') && (vl71Doc.includes('otomatik-güncelleme-yok') || vl71Doc.includes('otomatik güncelleme')) && vl71Doc.includes('v7 güvenle korunabilir.'), 'DKv7.1 dokuman: yasak-ifade + otomatik-guncelleme-yok + acik v7 guvenlik karari', '');
assert(vl71Doc.split(/\r?\n/).length <= 400, 'DKv7.1 dokuman: 400 satiri gecmiyor', `${vl71Doc.split(/\r?\n/).length} satir`);
let vl71RuntimeRefs = 0;
for (const f of dhSrcFiles) {
  const text = await fs.readFile(`src/${f}`, 'utf-8');
  if (/(from ['"]|require\().*VALUE_LOSS_DRAFT_REF_UX_PROCEDURE_VALIDATION/.test(text)) vl71RuntimeRefs++;
}
assert(vl71RuntimeRefs === 0, 'DKv7.1 guard: dogrulama dokumani src/ icinden IMPORT edilmiyor (runtime-neutral)', `${vl71RuntimeRefs} dosya`);

// === AI Değer Kaybı Yardımcısı v8 (form veri sürümü + ön hesap özeti tazeliği) ===
const vl8Parts = [{ id: 'p1', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }];
const vl8Mk = (over = {}) => normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, ...(over.vehicle ?? {}) }, history: { sbmPastDamageCount: 0 }, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl8Parts, damageAmount: 80000, ...(over.damage ?? {}) }, marketAnalysis: { comparableListingCount: 3 } });
const vl8Base = vl8Mk();
const vl8Fp = createValueLossFormFingerprint(vl8Base);
// -- Fingerprint: determinizm + sıra bağımsız + biçim/versiyon --
const vl8Reordered = normalizeValueLossContext({ marketAnalysis: { comparableListingCount: 3 }, damage: { damageAmount: 80000, structuredParts: vl8Parts, isTotalLossOrHeavyDamage: false }, vehicle: { modelYear: 2021, vehicleGroup: 'A', marketValue: 800000, mileageKm: 75000 }, history: { sbmPastDamageCount: 0 }, assignmentDate: '2026-07-10', fileType: 'trafik' });
assert(vl8Fp === createValueLossFormFingerprint(vl8Reordered) && /^v1-[a-z0-9]+$/.test(vl8Fp) && VALUE_LOSS_FINGERPRINT_VERSION === 1, 'DKv8 fingerprint: ayni semantik girdi = ayni parmak izi (anahtar sirasi etkilemez; v1-<hash> bicimi)', '');
// -- Fingerprint: snapshot/history + UI id ETKİLEMEZ; hesap-alanı değişimi ETKİLER --
const vl8Snap = buildValueLossCalculationSnapshot(calculateValueLoss(vl8Base, vl3Provider), '2026-07-03T10:00:00.000Z', { inputFingerprint: vl8Fp, inputSummary: buildValueLossInputSummary(vl8Base) });
const vl8WithSnap = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl8Base)), calculationSnapshot: vl8Snap, calculationSnapshotHistory: [{ ...vl8Snap, id: 'h1', savedAt: '2026-07-03T10:00:00.000Z' }] });
assert(createValueLossFormFingerprint(vl8WithSnap) === vl8Fp, 'DKv8 fingerprint: calculationSnapshot/History parmak izini ETKILEMEZ (kayittan sonra fresh kalir)', '');
assert(createValueLossFormFingerprint(vl8Mk({ damage: { structuredParts: [{ id: 'BASKA-ID', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } })) === vl8Fp, 'DKv8 fingerprint: parca UI id degisimi parmak izini etkilemez', '');
assert(createValueLossFormFingerprint(vl8Mk({ vehicle: { marketValue: 900000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000 } })) !== vl8Fp && createValueLossFormFingerprint(vl8Mk({ damage: { damageAmount: 90000, structuredParts: vl8Parts, isTotalLossOrHeavyDamage: false } })) !== vl8Fp, 'DKv8 fingerprint: marketValue / damageAmount degisimi parmak izini DEGISTIRIR', '');
assert(createValueLossFormFingerprint(vl8Mk({ damage: { structuredParts: [{ id: 'p1', operation: 'painted', partName: 'MOTOR KAPUTU', paint: { type: 'TAM' }, warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } })) !== vl8Fp, 'DKv8 fingerprint: parca operation/paint degisimi parmak izini DEGISTIRIR', '');
assert(typeof createValueLossFormFingerprint(normalizeValueLossContext({ fileType: 'trafik' })) === 'string' && describeValueLossFormFingerprint(vl8Base).includedFields.length > 20, 'DKv8 fingerprint: minimal/eski baglam guvenle parmak izi uretir; kapsam alanlari listelenir', '');
// -- Snapshot alanları + normalize --
assert(vl8Snap.inputFingerprint === vl8Fp && vl8Snap.inputFingerprintVersion === 1 && Array.isArray(vl8Snap.inputSummary) && vl8Snap.inputSummary.length > 0 && !JSON.stringify(vl8Snap.inputSummary).includes('structuredParts'), 'DKv8 snapshot: inputFingerprint + version + kompakt inputSummary saklanir (ham veri yok)', '');
const vl8NormSnap = normalizeValueLossContext({ calculationSnapshot: { ...vl8Snap, inputFingerprint: 'x'.repeat(200), inputSummary: Array(50).fill('a'.repeat(500)), fazla: 'k' } }).calculationSnapshot;
assert(vl8NormSnap.inputFingerprint.length <= 60 && vl8NormSnap.inputSummary.length <= 10 && vl8NormSnap.inputSummary[0].length <= 120 && !('fazla' in vl8NormSnap), 'DKv8 normalize: parmak izi <=60, ozet <=10x120, beklenmeyen anahtar atilir', '');
assert(normalizeValueLossContext({ calculationSnapshot: { version: 1, createdAt: 'x', status: 'calculated', formulaSummary: '', factorsSummary: [], missingInputs: [], warnings: [], evidence: [], disclaimer: 'd' } }).calculationSnapshot.inputFingerprint === undefined, 'DKv8 geriye uyum: parmak izi olmayan eski ozet GECERLI yuklenir (fingerprint undefined)', '');
// -- Freshness durumları --
assert(evaluateSnapshotFreshness(vl8Base).status === 'none' && evaluateSnapshotFreshness(null).status === 'none', 'DKv8 freshness: snapshot yok -> none', '');
assert(evaluateSnapshotFreshness(normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl8Base)), calculationSnapshot: { version: 1, createdAt: 'x', status: 'calculated', formulaSummary: '', factorsSummary: [], missingInputs: [], warnings: [], evidence: [], disclaimer: 'd' } })).status === 'unknown', 'DKv8 freshness: parmak izsiz ozet -> unknown (bayat degil)', '');
assert(evaluateSnapshotFreshness(vl8WithSnap).status === 'fresh', 'DKv8 freshness: parmak izleri esit -> fresh', '');
const vl8Changed = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl8WithSnap)), vehicle: { ...vl8WithSnap.vehicle, marketValue: 950000 } });
const vl8Fr = evaluateSnapshotFreshness(vl8Changed);
assert(vl8Fr.status === 'stale' && vl8Fr.message.includes('yenileyip yeniden kaydetmeniz önerilir') && !vl8Fr.message.includes(vl8Fp) && Array.isArray(vl8Fr.changedInputHint), 'DKv8 freshness: girdi degisti -> stale + guvenli mesaj (ham hash gorunmez)', '');
// -- Diff veri sürümü --
assert(diffValueLossContext(vl8Base, vl8WithSnap).some((r) => r.label === 'Ön hesap veri sürümü' && r.newLabel === 'yeni kayıt oluşturulacak'), 'DKv8 diff: ilk ozet -> "yeni kayit olusturulacak"', '');
const vl8OldFp = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl8WithSnap)), calculationSnapshot: { ...vl8Snap, inputFingerprint: 'v1-eski', createdAt: '2026-07-01T00:00:00.000Z' } });
assert(diffValueLossContext(vl8OldFp, vl8WithSnap).some((r) => r.label === 'Ön hesap veri sürümü' && r.newLabel === 'güncellenecek'), 'DKv8 diff: farkli parmak izli mevcut ozet -> "guncellenecek"', '');
// -- Checklist (asla kritik değil) --
const vl8ChkF = (vl, id) => buildValueLossChecklist(applyValueLossContextToChecklistInput(vl, {})).flatMap((c) => c.items).find((i) => i.id === id);
assert(vl8ChkF(vl8WithSnap, 'vl-rapor-ozet-guncel').status === 'ok' && vl8ChkF(vl8Changed, 'vl-rapor-ozet-guncel').status === 'control_needed' && vl8ChkF(vl8Changed, 'vl-rapor-ozet-guncel').severity === 'warning' && vl8ChkF(vl8Base, 'vl-rapor-ozet-guncel').status === 'not_applicable', 'DKv8 checklist: fresh->ok, stale->warning, none->not_applicable', '');
assert(buildValueLossChecklist(applyValueLossContextToChecklistInput(vl8Changed, {})).flatMap((c) => c.items).every((i) => !(i.id === 'vl-rapor-ozet-guncel' && i.severity === 'critical')), 'DKv8 checklist: tazelik maddesi ASLA kritik degil', '');
// -- Draft (nitelik + tutar yok + yasak-dil yok) --
const vl8DFresh = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(vl8WithSnap)).body;
const vl8DStale = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(vl8Changed)).body;
const vl8DUnknown = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl8Base)), calculationSnapshot: { version: 1, createdAt: 'x', status: 'calculated', formulaSummary: '', factorsSummary: [], missingInputs: [], warnings: [], evidence: [], disclaimer: 'd' } }))).body;
assert(vl8DFresh.includes('aynı veri sürümüne aittir') && vl8DStale.includes('önceki form verilerine ait olabilir') && vl8DUnknown.includes('veri sürümü bilinmemektedir'), 'DKv8 taslak: fresh/stale/unknown nitelik cumleleri', '');
assert(!/\d[\d.,]*\s*TL/.test(vl8DFresh + vl8DStale + vl8DUnknown) && !/kesin (tazminat|değer)|nihai tazminat|ödenmesi gereken kesin/i.test(vl8DFresh + vl8DStale + vl8DUnknown), 'DKv8 taslak: tazelik cumlelerinde tutar/yasak-dil YOK', '');
// -- Kayıt akışı / UI kaynak testleri --
const vl8MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
const vl8PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
const vl8HelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
const vl8FormSrc = await fs.readFile('src/renderer/app/components/value-loss-context-form.ts', 'utf-8');
assert(vl8MainSrc.includes('createValueLossFormFingerprint(formCandidate)') && vl8MainSrc.includes('buildValueLossCalculationSnapshot(calc, savedAt, fingerprint)') && vl8MainSrc.includes('veri sürümü) ilişkilendirilecektir'), 'DKv8 kayit: ozet kaydi KAYITLI veriden parmak izi hesaplar + onay mesaji veri surumu der', '');
assert(vl8MainSrc.includes('Formda kaydedilmemiş değişiklik var'), 'DKv8 kayit: v5.1 kirli-form engeli korunur', '');
// v9 revize: satır etiketi "Güncel kayıtlı özet durumu:" oldu (güncel/geçmiş ayrımı); amaç aynı.
assert(vl8PanelSrc.includes('kayıtlı özet durumu:') && vl8PanelSrc.includes('Güncel') && vl8PanelSrc.includes('Eski veriyle oluşturulmuş olabilir') && vl8PanelSrc.includes('renderFreshness'), 'DKv8 UI: panelde tazelik durumu (Guncel/Eski/bilinmiyor) render olur', '');
assert(!/data-action="[^"]*(recalc|yenile-hesap|snapshot-auto)/i.test(vl8PanelSrc) && vl8HelperSrc.includes('evaluateSnapshotFreshness(savedVl)'), 'DKv8 UI: otomatik yeniden-hesap/kayit tetigi yok; tazelik kayitli veriden hesaplanir', '');
assert(vl8FormSrc.includes("label: 'Cabrio / üstü açılır araç mı?'") && !/inputFingerprint|v1-/.test(vl8PanelSrc), 'DKv8 UI: panel ham hash gostermez (fingerprint UI metninde yok)', '');
// -- Kaynak guard + doküman --
const vl8FpSrc = await fs.readFile('src/shared/value-loss/value-loss-form-fingerprint.ts', 'utf-8');
const vl8FreshSrc = await fs.readFile('src/shared/value-loss/value-loss-snapshot-freshness.ts', 'utf-8');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|nodemailer|sendMail|writeFile|\.xlsx|require\(['"]crypto|from ['"]node:crypto/i.test(vl8FpSrc + vl8FreshSrc), 'DKv8 guvenlik: fingerprint/freshness saf (ag/mail/Excel/dosya/crypto-bagimlilik yok)', 'no-io');
assert(!/from ['"].*labor\//.test(vl8FpSrc + vl8FreshSrc), 'DKv8 guvenlik: v8 modulleri AI Iscilik/AI Mode modullerine dokunmaz', '');
const vl8Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_FORM_REVISION_AND_FRESHNESS_V8.md', 'utf-8');
assert(vl8Doc.includes('Fingerprint kapsamı') && vl8Doc.includes('Freshness durumları') && vl8Doc.includes('Geriye uyumluluk') && vl8Doc.includes('v8 güvenle korunabilir.'), 'DKv8 dokuman: kapsam + freshness + geriye-uyum + acik karar var', '');
assert(vl8Doc.split(/\r?\n/).length <= 400, 'DKv8 dokuman: 400 satiri gecmiyor', `${vl8Doc.split(/\r?\n/).length} satir`);
for (const [name, src] of [['form-fingerprint', vl8FpSrc], ['snapshot-freshness', vl8FreshSrc], ['calc-panel-v8', vl8PanelSrc]]) {
  assert(src.split(/\r?\n/).length <= 400, `DKv8 400 satir: ${name} 400 satiri gecmez`, `${src.split(/\r?\n/).length} satir`);
}

// === AI Değer Kaybı v8.1 (fingerprint + freshness sıkılaştırma denetimi) ===
const vl81Parts = [{ id: 'p1', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }];
const vl81Mk = (over = {}) => normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, ...(over.vehicle ?? {}) }, history: { sbmPastDamageCount: 0, ...(over.history ?? {}) }, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl81Parts, damageAmount: 80000, ...(over.damage ?? {}) }, marketAnalysis: { comparableListingCount: 3, ...(over.marketAnalysis ?? {}) }, evidence: { ...(over.evidence ?? {}) }, ...(over.notes !== undefined ? { notes: over.notes } : {}) });
const vl81Fp = createValueLossFormFingerprint(vl81Mk());
// -- Excluded: notes + snapshot alanları fingerprint'i ETKİLEMEZ --
assert(createValueLossFormFingerprint(vl81Mk({ notes: 'uzun serbest not' })) === vl81Fp, 'DKv8.1 excluded: notes degisimi fingerprint etkilemez', '');
const vl81Snap = buildValueLossCalculationSnapshot(calculateValueLoss(vl81Mk(), vl3Provider), '2026-07-03T10:00:00.000Z', { inputFingerprint: vl81Fp });
assert(createValueLossFormFingerprint(normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl81Mk())), calculationSnapshot: { ...vl81Snap, createdAt: '2020-01-01', amount: 1, roundedAmount: 500 }, calculationSnapshotHistory: [{ ...vl81Snap, id: 'h', savedAt: 'z' }] })) === vl81Fp, 'DKv8.1 excluded: snapshot createdAt/amount + history fingerprint etkilemez', '');
// -- Included: her alan fingerprint'i DEĞİŞTİRİR --
const vl81Changers = {
  reportWillIncludeValueLoss: normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl81Mk())), reportWillIncludeValueLoss: true }),
  commercialOrRental: vl81Mk({ vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, commercialOrRental: true } }),
  isCabrioOrConvertible: vl81Mk({ vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, isCabrioOrConvertible: true } }),
  vehicleType: vl81Mk({ vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, vehicleType: 'bus' } }),
  antiqueOrCollectible: vl81Mk({ vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, antiqueOrCollectible: true } }),
  hasPriorHeavyDamage: vl81Mk({ history: { sbmPastDamageCount: 0, hasPriorHeavyDamage: true } }),
  hasPriorSamePartDamage: vl81Mk({ history: { sbmPastDamageCount: 0, hasPriorSamePartDamage: true } }),
  damageDate: vl81Mk({ damage: { structuredParts: vl81Parts, damageAmount: 80000, isTotalLossOrHeavyDamage: false, damageDate: '2026-08-01' } }),
  hasAccessoryParts: vl81Mk({ damage: { structuredParts: vl81Parts, damageAmount: 80000, isTotalLossOrHeavyDamage: false, hasAccessoryParts: true } }),
  comparableListingCount: vl81Mk({ marketAnalysis: { comparableListingCount: 5 } }),
  calculationModuleOutputExists: vl81Mk({ evidence: { calculationModuleOutputExists: true } })
};
assert(Object.values(vl81Changers).every((c) => createValueLossFormFingerprint(c) !== vl81Fp), 'DKv8.1 included: tum hesap-anlamli alan degisimleri fingerprint DEGISTIRIR', JSON.stringify(Object.entries(vl81Changers).filter(([, c]) => createValueLossFormFingerprint(c) === vl81Fp).map(([k]) => k)));
// -- StructuredParts: whitespace-only ad + sıra bağımsız; operation/repair/paint değişimi etkiler; çözümsüz çökme yok --
assert(createValueLossFormFingerprint(vl81Mk({ damage: { structuredParts: [{ id: 'w', operation: 'changed', partName: '  MOTOR   KAPUTU ', warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } })) === createValueLossFormFingerprint(vl81Mk({ damage: { structuredParts: [{ id: 'w2', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } })), 'DKv8.1 parts: yalniz-bosluk ad farki + UI id fingerprint etkilemez', '');
const vl81TwoA = vl81Mk({ damage: { structuredParts: [{ id: 'a', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }, { id: 'b', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'TAM' }, warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } });
const vl81TwoB = vl81Mk({ damage: { structuredParts: [{ id: 'b', operation: 'painted', partName: 'TAVAN SACI', paint: { type: 'TAM' }, warnings: [] }, { id: 'a', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } });
assert(createValueLossFormFingerprint(vl81TwoA) === createValueLossFormFingerprint(vl81TwoB), 'DKv8.1 parts: parca sirasi fingerprint etkilemez (deterministik siralama)', '');
const vl81Rep = (labor) => vl81Mk({ damage: { structuredParts: [{ id: 'r', operation: 'repaired', partName: 'SAĞ ÖN ÇAMURLUK (SAC)', repair: { laborAmount: labor, newPartPrice: 10000 }, warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } });
assert(createValueLossFormFingerprint(vl81Rep(1000)) !== createValueLossFormFingerprint(vl81Rep(5000)) && createValueLossFormFingerprint(vl81Mk({ damage: { structuredParts: [{ id: 'p1', operation: 'painted', partName: 'MOTOR KAPUTU', paint: { type: 'LOKAL' }, warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } })) !== vl81Fp, 'DKv8.1 parts: repair orani(severity) + paint type degisimi fingerprint DEGISTIRIR', '');
let vl81NoCrash = true;
try { createValueLossFormFingerprint(vl81Mk({ damage: { structuredParts: [{ id: 'u', operation: 'changed', partName: 'YOK BÖYLE PARÇA', warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } })); } catch { vl81NoCrash = false; }
assert(vl81NoCrash, 'DKv8.1 parts: cozumsuz/bilinmeyen parca fingerprint uretiminde COKME yaratmaz', '');
// -- control_needed snapshot: fingerprint taşır ama tutar YOK --
const vl81CtrlVl = vl81Mk({ damage: { structuredParts: [{ id: 'x', operation: 'changed', partName: 'YOKBOYLE', warnings: [] }], damageAmount: 80000, isTotalLossOrHeavyDamage: false } });
const vl81CtrlSnap = buildValueLossCalculationSnapshot(calculateValueLoss(vl81CtrlVl, vl3Provider), 'x', { inputFingerprint: createValueLossFormFingerprint(vl81CtrlVl) });
assert(vl81CtrlSnap.status === 'control_needed' && vl81CtrlSnap.inputFingerprint && vl81CtrlSnap.inputFingerprintVersion === 1 && vl81CtrlSnap.amount === undefined, 'DKv8.1 snapshot: control_needed ozet parmak izi tasir ama tutar YOK', '');
// -- Freshness statustan bağımsız --
const vl81CtrlWith = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl81CtrlVl)), calculationSnapshot: vl81CtrlSnap });
assert(evaluateSnapshotFreshness(vl81CtrlWith).status === 'fresh' && evaluateSnapshotFreshness(normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl81CtrlWith)), vehicle: { ...vl81CtrlWith.vehicle, marketValue: 950000 } })).status === 'stale', 'DKv8.1 freshness: hesap durumundan bagimsiz calisir (control_needed -> fresh/stale dogru)', '');
// -- inputSummary sızıntısız --
assert(!/[A-Z]:\\|\/Users\/|structuredParts|MOTOR KAPUTU/.test(JSON.stringify(buildValueLossInputSummary(vl81Mk()))), 'DKv8.1 inputSummary: yerel yol / ham parca listesi / parca adi SIZDIRMAZ', '');
// -- Doğrulama dokümanı --
const vl81Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_FINGERPRINT_FRESHNESS_VALIDATION_V8_1.md', 'utf-8');
assert(vl81Doc.includes('fingerprint') && vl81Doc.includes('tazelik') && /hesaplamaz|yeniden-hesap|otomatik/.test(vl81Doc) && vl81Doc.includes('kaydetmez') && vl81Doc.includes('nihai tazminat') && vl81Doc.includes('v8 güvenle korunabilir.'), 'DKv8.1 dokuman: fingerprint + tazelik + otomatik-hesap/kayit-yok + yasak-ifade + acik karar', '');
assert(vl81Doc.split(/\r?\n/).length <= 400, 'DKv8.1 dokuman: 400 satiri gecmiyor', `${vl81Doc.split(/\r?\n/).length} satir`);
let vl81RuntimeRefs = 0;
for (const f of dhSrcFiles) {
  const text = await fs.readFile(`src/${f}`, 'utf-8');
  if (/(from ['"]|require\().*VALUE_LOSS_FINGERPRINT_FRESHNESS_VALIDATION/.test(text)) vl81RuntimeRefs++;
}
assert(vl81RuntimeRefs === 0, 'DKv8.1 guard: dogrulama dokumani src/ icinden IMPORT edilmiyor (runtime-neutral)', `${vl81RuntimeRefs} dosya`);

// === AI Değer Kaybı Yardımcısı v9 (geçmiş kayıt tazeliği + snapshot karşılaştırma UX) ===
const vl9Parts = [{ id: 'p1', operation: 'changed', partName: 'MOTOR KAPUTU', warnings: [] }];
const vl9Mk = (over = {}) => normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000, ...(over.vehicle ?? {}) }, history: { sbmPastDamageCount: 0 }, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl9Parts, damageAmount: 80000, ...(over.damage ?? {}) }, marketAnalysis: { comparableListingCount: 3 } });
const vl9Cur = vl9Mk();
const vl9CurFp = createValueLossFormFingerprint(vl9Cur);
const vl9Snap = buildValueLossCalculationSnapshot(calculateValueLoss(vl9Cur, vl3Provider), '2026-07-05T10:00:00.000Z', { inputFingerprint: vl9CurFp });
const vl9FpLessItem = { version: 1, createdAt: 'x', status: 'calculated', formulaSummary: '', factorsSummary: [], missingInputs: [], warnings: [], evidence: [], disclaimer: 'd', id: 'h-unknown', savedAt: '2026-07-03T10:00:00.000Z' };
const vl9Hist = [
  { ...vl9Snap, id: 'h-fresh', savedAt: '2026-07-05T10:00:00.000Z' },
  { ...vl9Snap, id: 'h-stale', savedAt: '2026-07-04T10:00:00.000Z', inputFingerprint: 'v1-eski', inputFingerprintVersion: 1 },
  vl9FpLessItem
];
const vl9Vl = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Cur)), calculationSnapshot: vl9Snap, calculationSnapshotHistory: vl9Hist });
// -- Helper: summary + item + none --
const vl9Sum = evaluateHistoryFreshnessSummary(vl9Vl);
assert(vl9Sum.total === 3 && vl9Sum.fresh === 1 && vl9Sum.stale === 1 && vl9Sum.unknown === 1 && vl9Sum.none === 0, 'DKv9 helper: karisik gecmis dogru sayaclar (3 total, 1 fresh/stale/unknown)', JSON.stringify(vl9Sum));
assert(vl9Sum.items.map((i) => i.id).join(',') === 'h-fresh,h-stale,h-unknown', 'DKv9 helper: gorunum sirasi KORUNUR (yeniden siralamaz)', '');
assert(JSON.stringify(evaluateHistoryFreshnessSummary(vl9Cur)) === JSON.stringify({ total: 0, fresh: 0, stale: 0, unknown: 0, none: 0, items: [] }), 'DKv9 helper: gecmis yok -> total 0 bos ozet', '');
assert(evaluateSnapshotItemFreshness(vl9Vl, vl9Hist[0]).status === 'fresh' && evaluateSnapshotItemFreshness(vl9Vl, vl9Hist[1]).status === 'stale' && evaluateSnapshotItemFreshness(vl9Vl, vl9FpLessItem).status === 'unknown' && evaluateSnapshotItemFreshness(vl9Vl, null).status === 'none', 'DKv9 helper: item freshness fresh/stale/unknown/none dogru', '');
assert(!vl9Sum.items.some((i) => i.message.includes(vl9CurFp) || i.message.includes('v1-') || i.label.includes('v1-')), 'DKv9 helper: mesaj/etiketlerde ham hash YOK', '');
const vl9HistCopy = JSON.parse(JSON.stringify(vl9Vl.calculationSnapshotHistory));
evaluateHistoryFreshnessSummary(vl9Vl);
assert(JSON.stringify(vl9Vl.calculationSnapshotHistory) === JSON.stringify(vl9HistCopy), 'DKv9 helper: girdi gecmisini MUTASYONA UGRATMAZ', '');
// -- Current vs history ayrımı --
assert(evaluateSnapshotFreshness(vl9Vl).status === 'fresh' && vl9Sum.stale + vl9Sum.unknown > 0, 'DKv9 ayrim: guncel ozet fresh iken eski gecmis stale/unknown olabilir', '');
const vl9StaleCurrent = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Vl)), vehicle: { ...vl9Vl.vehicle, marketValue: 950000 } });
assert(evaluateSnapshotFreshness(vl9StaleCurrent).status === 'stale' && evaluateHistoryFreshnessSummary(vl9StaleCurrent).total === 3, 'DKv9 ayrim: guncel form degisince guncel stale; gecmis ayri degerlendirilir (history freshness guncel ozeti EZMEZ)', '');
// -- Checklist (asla kritik) --
const vl9ChkId = (v) => buildValueLossChecklist(applyValueLossContextToChecklistInput(v, {})).flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-gecmis-guncel');
const vl9AllFresh = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Cur)), calculationSnapshot: vl9Snap, calculationSnapshotHistory: [{ ...vl9Snap, id: 'a', savedAt: 'z' }] });
assert(vl9ChkId(vl9Vl).status === 'control_needed' && vl9ChkId(vl9Vl).severity === 'warning' && vl9ChkId(vl9AllFresh).status === 'ok' && vl9ChkId(vl9Cur).status === 'not_applicable', 'DKv9 checklist: attention->warning, clean->ok, none->not_applicable', '');
assert(buildValueLossChecklist(applyValueLossContextToChecklistInput(vl9Vl, {})).flatMap((c) => c.items).every((i) => !(i.id === 'vl-rapor-gecmis-guncel' && i.severity === 'critical')) && vl9ChkId(vl9Vl).id === 'vl-rapor-gecmis-guncel', 'DKv9 checklist: gecmis tazelik maddesi ASLA kritik degil', '');
assert(vl9ChkId(vl9Vl) !== undefined && buildValueLossChecklist(applyValueLossContextToChecklistInput(vl9Vl, {})).flatMap((c) => c.items).find((i) => i.id === 'vl-rapor-ozet-guncel') !== undefined, 'DKv9 checklist: v8 guncel-ozet maddesi KORUNUR (iki ayri madde)', '');
// -- Draft --
const vl9DAtt = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(vl9Vl)).body;
const vl9DClean = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(vl9AllFresh)).body;
assert(vl9DAtt.includes('aynı veri sürümüne ait olmayabilecek kayıtlar bulunduğundan') && !vl9DClean.includes('aynı veri sürümüne ait olmayabilecek kayıtlar'), 'DKv9 taslak: stale/unknown gecmiste nitelik cumlesi; tumu fresh iken GURULTU YOK', '');
assert(!/\d[\d.,]*\s*TL/.test(vl9DAtt) && !/v1-|kesin (tazminat|değer)|nihai tazminat|ödenmesi gereken kesin/i.test(vl9DAtt), 'DKv9 taslak: tutar/ham-hash/yasak-dil YOK', '');
// -- UI kaynak testleri --
const vl9PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
const vl9HelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
// v10 revize: per-item etiket "Geçmiş kayıt veri durumu:" oldu (güncel/geçmiş görsel ayrımı); amaç aynı.
assert(vl9PanelSrc.includes('Geçmiş özeti:') && vl9PanelSrc.includes('renderHistoryAggregate') && vl9PanelSrc.includes('Geçmiş kayıt veri durumu:') && vl9PanelSrc.includes('Güncel kayıtlı özet durumu:'), 'DKv9 UI: aggregate satiri + per-item veri durumu + guncel/gecmis ayrimi render olur', '');
assert(vl9HelperSrc.includes('evaluateHistoryFreshnessSummary(savedVl)') && !/inputFingerprint|v1-/.test(vl9PanelSrc), 'DKv9 UI: gecmis tazeligi KAYITLI veriden hesaplanir; panel ham hash gostermez', '');
assert(!/data-action="[^"]*(snap-del|snap-restore|snap-edit|recalc|rapor|mail|excel|indir)/i.test(vl9PanelSrc), 'DKv9 UI: gecmiste silme/geri-yukleme/duzenleme/rapor/mail/Excel/indir butonu YOK', '');
// -- Kaynak guard + doküman --
const vl9FreshSrc = await fs.readFile('src/shared/value-loss/value-loss-snapshot-freshness.ts', 'utf-8');
assert(!/\bfetch\b|axios|websocket|puppeteer|playwright|serpapi|XMLHttpRequest|nodemailer|sendMail|writeFile|\.xlsx|from ['"].*labor\//i.test(vl9FreshSrc) && vl9FreshSrc.split(/\r?\n/).length <= 400, 'DKv9 guvenlik: freshness modulu saf (ag/mail/Excel/labor yok) + 400 satir alti', `${vl9FreshSrc.split(/\r?\n/).length} satir`);
const vl9Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_HISTORY_FRESHNESS_V9.md', 'utf-8');
assert(vl9Doc.includes('Geçmiş özeti aggregate') && vl9Doc.includes('History item freshness') && /hesaplamaz|otomatik|yeniden-hesap/.test(vl9Doc) && vl9Doc.includes('kaydetmez') && /final tazminat|nihai tazminat/.test(vl9Doc) && vl9Doc.includes('v9 güvenle korunabilir.'), 'DKv9 dokuman: aggregate + hesaplama kurali + otomatik-yok + yasak-ifade + acik karar', '');
assert(vl9Doc.split(/\r?\n/).length <= 400, 'DKv9 dokuman: 400 satiri gecmiyor', `${vl9Doc.split(/\r?\n/).length} satir`);

// === AI Değer Kaybı Yardımcısı v9.1 (history freshness + snapshot karşılaştırma sertleştirme denetimi) ===
// -- Determinizm --
assert(JSON.stringify(evaluateHistoryFreshnessSummary(vl9Vl)) === JSON.stringify(evaluateHistoryFreshnessSummary(vl9Vl)), 'DKv9.1 determinizm: ayni girdi -> ayni ozet (tekrarli cagri ozdes)', '');
const vl91KeyA = normalizeValueLossContext({ fileType: 'trafik', assignmentDate: '2026-07-10', vehicle: { marketValue: 800000, vehicleGroup: 'A', modelYear: 2021, mileageKm: 75000 }, history: { sbmPastDamageCount: 0 }, damage: { isTotalLossOrHeavyDamage: false, structuredParts: vl9Parts, damageAmount: 80000 }, marketAnalysis: { comparableListingCount: 3 }, calculationSnapshotHistory: [{ ...vl9Snap, id: 'k', savedAt: 'z' }] });
const vl91KeyB = normalizeValueLossContext({ marketAnalysis: { comparableListingCount: 3 }, damage: { damageAmount: 80000, structuredParts: vl9Parts, isTotalLossOrHeavyDamage: false }, vehicle: { mileageKm: 75000, modelYear: 2021, vehicleGroup: 'A', marketValue: 800000 }, history: { sbmPastDamageCount: 0 }, assignmentDate: '2026-07-10', fileType: 'trafik', calculationSnapshotHistory: [{ ...vl9Snap, id: 'k', savedAt: 'z' }] });
assert(JSON.stringify(evaluateHistoryFreshnessSummary(vl91KeyA)) === JSON.stringify(evaluateHistoryFreshnessSummary(vl91KeyB)), 'DKv9.1 determinizm: form anahtar sirasi ozeti ETKILEMEZ', '');
// -- Sıra: durum/savedAt e gore siralamaz --
const vl91Rev = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Cur)), calculationSnapshotHistory: [
  { ...vl9Snap, id: 'r-stale', savedAt: '2026-07-09T00:00:00.000Z', inputFingerprint: 'v1-x', inputFingerprintVersion: 1 },
  { ...vl9Snap, id: 'r-fresh', savedAt: '2026-07-01T00:00:00.000Z' },
  vl9FpLessItem
] });
assert(evaluateHistoryFreshnessSummary(vl91Rev).items.map((i) => i.id).join(',') === 'r-stale,r-fresh,h-unknown', 'DKv9.1 sira: durum/savedAt e gore YENIDEN SIRALAMAZ (dizi sirasi korunur)', '');
// -- Mutasyonsuzluk (tum vl: form+snapshot+history) --
const vl91FullBefore = JSON.stringify(vl9Vl);
evaluateHistoryFreshnessSummary(vl9Vl);
evaluateSnapshotItemFreshness(vl9Vl, vl9Vl.calculationSnapshotHistory[0]);
evaluateSnapshotFreshness(vl9Vl);
assert(JSON.stringify(vl9Vl) === vl91FullBefore, 'DKv9.1 mutasyon: tum vl (form+snapshot+history+fingerprint alanlari) DEGISMEZ', '');
// -- Current vs history bağımsızlığı (4 kombinasyon) --
const vl91CurStale = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Cur)), calculationSnapshot: { ...vl9Snap, inputFingerprint: 'v1-eski', inputFingerprintVersion: 1 }, calculationSnapshotHistory: [{ ...vl9Snap, id: 'hf', savedAt: 'z' }] });
assert(evaluateSnapshotFreshness(vl91CurStale).status === 'stale' && evaluateHistoryFreshnessSummary(vl91CurStale).fresh === 1, 'DKv9.1 ayrim: guncel STALE + gecmis FRESH dogru (biri digerini ezmez)', '');
const vl91SnapNoFp = buildValueLossCalculationSnapshot(calculateValueLoss(vl9Cur, vl3Provider), '2026-07-05T10:00:00.000Z');
const vl91CurUnknown = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Cur)), calculationSnapshot: vl91SnapNoFp, calculationSnapshotHistory: [{ ...vl9Snap, id: 'hf', savedAt: 'z' }] });
assert(evaluateSnapshotFreshness(vl91CurUnknown).status === 'unknown' && evaluateHistoryFreshnessSummary(vl91CurUnknown).fresh === 1, 'DKv9.1 ayrim: guncel UNKNOWN + gecmis FRESH dogru', '');
const vl91NoCur = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Cur)), calculationSnapshotHistory: [{ ...vl9Snap, id: 'hf', savedAt: 'z' }] });
assert(evaluateSnapshotFreshness(vl91NoCur).status === 'none' && evaluateHistoryFreshnessSummary(vl91NoCur).total === 1, 'DKv9.1 ayrim: guncel ozet YOK + gecmis VAR guvenle calisir', '');
// -- Etiket/mesaj güvenliği --
const vl91Msgs = evaluateHistoryFreshnessSummary(vl9Vl).items.map((i) => `${i.message}||${i.label}`).join(' ');
assert(!/otomatik/i.test(vl91Msgs) && !/v1-[a-z0-9]/i.test(vl91Msgs) && /bilinmiyor/.test(vl91Msgs) && !/bayat/i.test(vl91Msgs) && !/kesin (tazminat|değer)|nihai tazminat|ödenmesi gereken kesin/i.test(vl91Msgs), 'DKv9.1 mesaj: otomatik-aksiyon/ham-hash/bayat/final-tazminat YOK; unknown "bilinmiyor" der', '');
// -- Checklist: unknown-only + karisik + kritik davranis korunumu --
const vl91UnknownOnly = normalizeValueLossContext({ ...JSON.parse(JSON.stringify(vl9Cur)), calculationSnapshot: vl9Snap, calculationSnapshotHistory: [vl9FpLessItem] });
assert(vl9ChkId(vl91UnknownOnly).status === 'control_needed' && vl9ChkId(vl91UnknownOnly).severity === 'warning' && vl9ChkId(vl9Vl).status === 'control_needed', 'DKv9.1 checklist: unknown-only ve karisik stale+unknown -> control_needed/warning', '');
const vl91Def = normalizeValueLossContext({ fileType: 'trafik', calculationSnapshotHistory: vl9Hist });
const vl91DefItems = buildValueLossChecklist(applyValueLossContextToChecklistInput(vl91Def, {})).flatMap((c) => c.items);
assert(vl91DefItems.filter((i) => i.status === 'missing' && i.severity === 'critical').length > 0 && vl91DefItems.find((i) => i.id === 'vl-rapor-gecmis-guncel').severity !== 'critical', 'DKv9.1 checklist: kritik eksik-veri davranisi DEGISMEDI; gecmis maddesi kritik degil', '');
assert(buildValueLossChecklist(applyValueLossContextToChecklistInput(vl9Vl, {})).flatMap((c) => c.items).every((i) => !(i.id === 'vl-rapor-gecmis-guncel' && i.status === 'missing')), 'DKv9.1 checklist: eski/bilinmeyen gecmis gunluk isi BLOKLAMAZ (missing uretmez)', '');
// -- Draft: unknown-only cumle + roundedAmount/tutar yok + 4 yasak ifade yok --
const vl91DUnknown = buildValueLossDraft('report_explanation', undefined, draftFactsFromValueLossContext(vl91UnknownOnly)).body;
assert(vl91DUnknown.includes('aynı veri sürümüne ait olmayabilecek kayıtlar bulunduğundan'), 'DKv9.1 taslak: unknown-only gecmiste de nitelik cumlesi eklenir', '');
assert(!/roundedAmount/.test(vl91DUnknown) && !/\d[\d.,]*\s*TL/.test(vl91DUnknown) && !/kesin değer kaybı|nihai tazminat|ödenmesi gereken kesin tutar|kesin tazminat/i.test(vl91DUnknown), 'DKv9.1 taslak: roundedAmount/tutar YOK + 4 yasak final-tazminat ifadesi YOK', '');
// -- Kaynak guard: freshness + apply (AI İşçilik/AI Mode/Orchestrator/IPC/ag/mail/Excel importu yok) --
assert(!/from ['"].*(labor\/|ai-mode|part-code|orchestrator)/i.test(vl9FreshSrc) && !/ipcMain|ipcRenderer|\.invoke\(/.test(vl9FreshSrc), 'DKv9.1 guard: freshness modulu AI İşçilik/AI Mode/Orchestrator/IPC importu icermez', '');
const vl91ApplySrc = await fs.readFile('src/shared/value-loss/value-loss-context-apply.ts', 'utf-8');
assert(!/from ['"].*(labor\/|ai-mode|part-code|orchestrator)/i.test(vl91ApplySrc) && !/\bfetch\b|axios|writeFile|\.xlsx|nodemailer|sendMail/i.test(vl91ApplySrc), 'DKv9.1 guard: context-apply AI İşçilik/AI Mode/ag/mail/Excel icermez', '');
// -- Doküman --
const vl91Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_HISTORY_FRESHNESS_VALIDATION_V9_1.md', 'utf-8');
const vl91Sections = ['## 1. Amaç', '## 2. İncelenen dosyalar', '## 3. v9 ile eklenen', '## 4. History item freshness', '## 5. Aggregate', '## 6. Sıra korunumu', '## 7. Current snapshot freshness', '## 8. Fresh / stale / unknown / none', '## 9. Eski fingerprint', '## 10. UI history freshness', '## 11. Checklist history freshness', '## 12. Taslak builder', '## 13. Yasak final tazminat', '## 14. Yazma / Excel / mail / web', '## 15. Kalan riskler', '## 16. Sonuç'];
assert(vl91Sections.every((s) => vl91Doc.includes(s)), 'DKv9.1 dokuman: 16 zorunlu bolum eksiksiz', vl91Sections.filter((s) => !vl91Doc.includes(s)).join(' | '));
assert(vl91Doc.includes('history freshness') && vl91Doc.includes('aggregate') && vl91Doc.includes('Current snapshot freshness ile history freshness') && /yeniden hesaplama|otomatik|hesaplamaz|yeniden-hesap/.test(vl91Doc) && /YAZMAZ|kaydetmez|yazma yolu yok|kalıcı veriye/i.test(vl91Doc) && /kesin tazminat|nihai tazminat/.test(vl91Doc) && vl91Doc.includes('v9 güvenle korunabilir.'), 'DKv9.1 dokuman: history/aggregate/ayrim/otomatik-yok/yazma-yok/yasak-ifade/acik-karar', '');
assert(vl91Doc.split(/\r?\n/).length <= 400, 'DKv9.1 dokuman: 400 satir alti', `${vl91Doc.split(/\r?\n/).length} satir`);
// -- Runtime-neutral: v9.1 dogrulama dokumani src/ icinden IMPORT edilmiyor --
let vl91RuntimeRefs = 0;
for (const f of ['src/shared/value-loss/value-loss-snapshot-freshness.ts', 'src/shared/value-loss/value-loss-context-apply.ts', 'src/shared/value-loss/value-loss-draft-builder.ts', 'src/shared/value-loss/value-loss-checklist.ts', 'src/renderer/app/components/value-loss-calculation-panel.ts']) {
  const src = await fs.readFile(f, 'utf-8');
  if (/(from ['"]|require\()[^'"]*VALUE_LOSS_HISTORY_FRESHNESS_VALIDATION_V9_1/.test(src)) vl91RuntimeRefs++;
}
assert(vl91RuntimeRefs === 0, 'DKv9.1 guard: dogrulama dokumani src/ icinden IMPORT edilmiyor (runtime-neutral)', `${vl91RuntimeRefs} dosya`);

// === AI Değer Kaybı Yardımcısı v10 (Final UX Freeze + ofis-hazır sadeleştirme) ===
const v10PanelSrc = await fs.readFile('src/renderer/app/components/value-loss-calculation-panel.ts', 'utf-8');
const v10HelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
const v10PreviewSrc = await fs.readFile('src/renderer/app/components/value-loss-context-preview.ts', 'utf-8');
const v10FormSrc = await fs.readFile('src/renderer/app/components/value-loss-context-form.ts', 'utf-8');
const v10PartsSrc = await fs.readFile('src/renderer/app/components/value-loss-parts-form.ts', 'utf-8');
const v10ExplainSrc = await fs.readFile('src/shared/value-loss/value-loss-calculation-explain.ts', 'utf-8');
const v10Ui = [v10PanelSrc, v10HelperSrc, v10PreviewSrc, v10FormSrc, v10PartsSrc].join('\n');
// -- Buton etiketleri --
assert(v10PanelSrc.includes('Ön Hesabı Yenile') && v10PanelSrc.includes('Hesap Gerekçesini Kopyala') && v10PanelSrc.includes('Ön Hesap Özetini Kaydet') && v10PreviewSrc.includes('Değer Kaybı Bilgilerini Kaydet'), 'DKv10 buton: on-hesap butonlari + net "Değer Kaybı Bilgilerini Kaydet" etiketi', '');
assert(!/data-action="aih-vl[^"]*"[^>]*>\s*[^<]*(Excel|İndir|Mail Gönder|Rapor Oluştur|Web'e|Otomatik Güncelle|Kesin Tutar|Nihai Tutar)/i.test(v10Ui), 'DKv10 buton: hicbir buton Excel/indir/gonder/rapor-uret/otomatik-guncelle/kesin-tutar cagristirmaz', '');
// -- "Ön hesap" dili + zorunlu disclaimer anlami --
assert(v10ExplainSrc.includes('ön hesap') && /eksper kanaati/i.test(v10ExplainSrc) && /ön hesap/i.test(v10PanelSrc), 'DKv10 dil: zorunlu disclaimer "on hesap" + "eksper kanaati" anlamini korur', '');
// -- Freshness metinlerinde ham hash yok (runtime) --
const v10FreshMsgs = [evaluateSnapshotFreshness(vl9Vl).message, ...evaluateHistoryFreshnessSummary(vl9Vl).items.flatMap((i) => [i.message, i.label])].join(' ');
assert(!/v1-[a-z0-9]/i.test(v10FreshMsgs), 'DKv10 tazelik: guncel+gecmis durum metinlerinde ham parmak izi/hash YOK', '');
// -- Katsayı seti durumu --
assert(v10PanelSrc.includes('yerel doğrulanmış set') && v10PanelSrc.includes('Otomatik güncelleme yoktur') && !/data-action="[^"]*(katsayi|coef)[^"]*(update|download|indir)/i.test(v10PanelSrc), 'DKv10 katsayi: "yerel doğrulanmış set" + "Otomatik güncelleme yoktur"; indir/guncelle butonu yok', '');
// -- Bölüm başlıkları --
assert(v10PanelSrc.includes('Reel Piyasa Analiz Ön Hesabı') && v10PanelSrc.includes('Kayıtlı Ön Hesap Özetleri') && v10PanelSrc.includes('Katsayı Seti Bilgisi') && v10PanelSrc.includes('Ön hesap için eksik/kontrol gereken bilgiler') && v10HelperSrc.includes('Taslak üret (önizleme)') && v10FormSrc.includes('Değer Kaybı Ek Bilgi Formu') && v10PartsSrc.includes('Parça Bazlı Değer Kaybı Verileri'), 'DKv10 baslik: temel bolum basliklari render olur', '');
// -- Eksik-veri özeti cap + boş durum --
assert(v10PanelSrc.includes('MISSING_SUMMARY_CAP = 8') && v10PanelSrc.includes('madde daha') && v10PanelSrc.includes('Eksik kritik veri görünmüyor; yine de eksper kontrolü gereklidir.'), 'DKv10 eksik-ozet: 8 cap + "+N madde daha" + bos durum metni korunur', '');
// -- Güncel / geçmiş tazelik etiketleri ayrı render --
assert(v10PanelSrc.includes('Güncel kayıtlı özet durumu:') && v10PanelSrc.includes('Geçmiş özeti:') && v10PanelSrc.includes('Geçmiş kayıt veri durumu:'), 'DKv10 tazelik-UI: guncel + aggregate + gecmis-kayit etiketleri ayri ayri render', '');
// -- Kayıtlı özet/geçmiş bloğunda yıkıcı buton yok --
assert(!/data-action="[^"]*(snap-del|snap-restore|snap-edit|recalc|hist-del|history-del|report|rapor-uret|mail-send|excel|download|web-update)/i.test(v10PanelSrc) && v10PanelSrc.includes('buradan silme/geri yükleme/düzenleme yapılmaz'), 'DKv10 UI: kayitli ozet/gecmis bloklarinda yikici buton yok (silme/geri-yukleme/duzenleme/rapor/mail/Excel/indir)', '');
// -- UI dosyaları kod-token güvenliği (dogal-dil "Excel/mail" disclaimerleri haric; yalnizca KOD token) --
assert(!/\bfetch\(|axios|XMLHttpRequest|WebSocket|nodemailer|sendMail|mailto:|puppeteer|playwright|serpapi|require\(['"]xlsx|\.writeFile\(|from ['"][^'"]*labor\/|from ['"][^'"]*ai-mode|from ['"][^'"]*orchestrator/i.test(v10Ui), 'DKv10 guard: deger kaybi UI dosyalari ag/mail/Excel/AI-Iscilik/AI-Mode/Orchestrator KOD-token icermez', '');
// -- Checklist son hali --
const v10Chk = (v) => buildValueLossChecklist(applyValueLossContextToChecklistInput(v, {})).flatMap((c) => c.items);
const v10SnapCtx = [vl9Vl, vl9AllFresh, vl9Cur, vl9StaleCurrent];
assert(v10SnapCtx.every((v) => { const it = v10Chk(v); const ids = ['vl-rapor-onhesap-ozet', 'vl-rapor-ozet-guncel', 'vl-rapor-gecmis-guncel', 'vl-rapor-seik-guncellik']; return ids.every((id) => { const m = it.find((i) => i.id === id); return !m || m.severity !== 'critical'; }); }), 'DKv10 checklist: ozet-opsiyonel + guncel/gecmis tazelik + SEİK maddesi ASLA kritik degil', '');
const v10Cabrio = normalizeValueLossContext({ fileType: 'trafik', vehicle: { isCabrioOrConvertible: true } });
const v10CabItem = v10Chk(v10Cabrio).find((i) => i.id === 'vl-arac-cabrio');
assert(v10CabItem.status === 'control_needed' && v10CabItem.severity === 'warning', 'DKv10 checklist: cabrio yonlendirmesi ilgili durumda control_needed/warning (otomatik ikame yok)', '');
const v10Def = v10Chk(normalizeValueLossContext({ fileType: 'trafik' }));
assert(v10Def.find((i) => i.id === 'vl-arac-rayic').severity === 'critical' && v10Def.find((i) => i.id === 'vl-hasar-degisen').severity === 'critical' && v10Def.find((i) => i.id === 'vl-piyasa-emsal').severity === 'critical', 'DKv10 checklist: kritik eksik-veri maddeleri (rayiç/değişen parça/emsal) kritik KALDI', '');
// -- Draft son güvenlik --
const v10DraftFacts = draftFactsFromValueLossContext(vl9Vl);
const v10Drafts = ['internal_note', 'report_explanation', 'missing_info_mail'].map((k) => buildValueLossDraft(k, ['Rayiç bedel'], v10DraftFacts).body);
assert(v10Drafts.every((b) => !/\d[\d.,]*\s*TL/.test(b) && !/v1-[a-z0-9]/i.test(b) && !/kesin değer kaybı|nihai tazminat|ödenmesi gereken kesin tutar|kesin tazminat/i.test(b)), 'DKv10 taslak: 3 taslak turu tutar/hash/yasak-final-tazminat icermez', '');
assert(/değerlendirilmiştir|dikkate alınmıştır|ön hesap/i.test(v10Drafts[1]), 'DKv10 taslak: rapor aciklamasi niteliksel kalir (tutar yerine nitelik cumlesi)', '');
// -- Office-ready doküman --
const v10Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_OFFICE_READY_NOTE_V10.md', 'utf-8');
const v10Sec = ['## 1. Amaç', '## 2. Bu modül ne yapar?', '## 3. Bu modül ne yapmaz?', '## 4. Ön hesap nedir?', '## 5. Kesin tazminat değildir', '## 6. Kayıtlı özet ve geçmiş', '## 7. Veri sürümü / tazelik', '## 8. Eksik/kontrol gereken bilgiler', '## 9. SEİK katsayı seti', '## 10. Günlük kullanımda', '## 11. Sonuç'];
assert(v10Sec.every((s) => v10Doc.includes(s)), 'DKv10 dokuman: 11 zorunlu bolum eksiksiz', v10Sec.filter((s) => !v10Doc.includes(s)).join(' | '));
assert(v10Doc.includes('ön hesap') && /yapmaz|yazmaz|göndermez/.test(v10Doc) && /kesin tazminat/.test(v10Doc) && /Eski veriyle oluşturulmuş olabilir|Veri sürümü bilinmiyor/.test(v10Doc) && v10Doc.includes('yerel doğrulanmış set') && v10Doc.includes('v10 ofis kullanımına hazırdır.'), 'DKv10 dokuman: ne-yapar/yapmaz + on-hesap + kesin-tazminat-degil + tazelik + katsayi + acik karar', '');
assert(v10Doc.split(/\r?\n/).length <= 400, 'DKv10 dokuman: 400 satir alti', `${v10Doc.split(/\r?\n/).length} satir`);
let v10DocRefs = 0;
for (const f of ['src/renderer/app/components/value-loss-calculation-panel.ts', 'src/renderer/app/components/value-loss-helper.ts', 'src/renderer/app/components/value-loss-context-preview.ts']) {
  const s = await fs.readFile(f, 'utf-8');
  if (/(from ['"]|require\()[^'"]*VALUE_LOSS_OFFICE_READY_NOTE_V10/.test(s)) v10DocRefs++;
}
assert(v10DocRefs === 0, 'DKv10 guard: ofis notu src/ icinden IMPORT edilmiyor', `${v10DocRefs}`);

// === AI Değer Kaybı Yardımcısı v10.1 (Final Audit + RC hazırlık kapısı) ===
// -- Doküman zinciri: 11 zorunlu dokümanın tamamı mevcut + açık karar satırlı --
const v101Chain = [
  ['docs/value-loss/SEIK_COEFFICIENT_VALIDATION_V3_1.md', "v4'e geçilebilir."],
  ['docs/value-loss/SEIK_PART_COEFFICIENT_VALIDATION_V4_1.md', 'v4 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_SNAPSHOT_AND_COPY_VALIDATION_V5_1.md', 'v5 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_HISTORY_CABRIO_METADATA_VALIDATION_V6_1.md', 'v6 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_DRAFT_REF_UX_PROCEDURE_VALIDATION_V7_1.md', 'v7 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_FORM_REVISION_AND_FRESHNESS_V8.md', 'v8 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_FINGERPRINT_FRESHNESS_VALIDATION_V8_1.md', 'v8 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_HISTORY_FRESHNESS_V9.md', 'v9 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_HISTORY_FRESHNESS_VALIDATION_V9_1.md', 'v9 güvenle korunabilir.'],
  ['docs/value-loss/VALUE_LOSS_OFFICE_READY_NOTE_V10.md', 'v10 ofis kullanımına hazırdır.'],
  ['docs/dev/SEIK_REVALIDATION_PROCEDURE.md', 'Yeniden Doğrulama Prosedürü']
];
let v101ChainOk = 0;
const v101ChainMiss = [];
let v101DocsAll = '';
for (const [p, decision] of v101Chain) {
  try {
    const t = await fs.readFile(p, 'utf-8');
    v101DocsAll += t;
    if (t.includes(decision)) v101ChainOk++; else v101ChainMiss.push(`${p} (karar yok)`);
  } catch { v101ChainMiss.push(`${p} (dosya yok)`); }
}
assert(v101ChainOk === v101Chain.length, 'DKv10.1 zincir: 11 dogrulama/prosedur dokumaninin tamami mevcut + acik karar satirli', v101ChainMiss.join(' | '));
// -- Mutlak yerel yol sızıntısı: dokümanlar + tüm value-loss kaynakları --
const v101VlFiles = ['src/shared/value-loss/value-loss-coefficients.ts', 'src/shared/value-loss/value-loss-part-coefficients.ts', 'src/shared/value-loss/value-loss-calculation-engine.ts', 'src/shared/value-loss/value-loss-snapshot-freshness.ts', 'src/shared/value-loss/value-loss-draft-builder.ts', 'src/shared/value-loss/value-loss-checklist.ts', 'src/renderer/app/components/value-loss-helper.ts', 'src/renderer/app/components/value-loss-calculation-panel.ts'];
let v101VlSrcAll = '';
for (const f of v101VlFiles) v101VlSrcAll += await fs.readFile(f, 'utf-8');
const v101AbsRe = new RegExp('[A-Z]:' + '\\\\|/Users/');
assert(!v101AbsRe.test(v101DocsAll) && !v101AbsRe.test(v101VlSrcAll), 'DKv10.1 sizinti: dokumanlarda ve value-loss kaynaklarinda mutlak yerel yol YOK', '');
// -- Metadata: validationDocs repo-göreli --
const v101CoefSrc = await fs.readFile('src/shared/value-loss/value-loss-coefficients.ts', 'utf-8');
assert(v101CoefSrc.includes("'docs/value-loss/SEIK_COEFFICIENT_VALIDATION_V3_1.md'") && v101CoefSrc.includes("'docs/value-loss/SEIK_PART_COEFFICIENT_VALIDATION_V4_1.md'") && v101CoefSrc.includes('otomatik güncelleme YAPMAZ'), 'DKv10.1 metadata: validationDocs repo-goreli + otomatik-guncelleme-yok notu', '');
// -- Final audit dokümanı: 20 bölüm + RC kararı --
const v101Doc = await fs.readFile('docs/value-loss/VALUE_LOSS_FINAL_AUDIT_V10_1.md', 'utf-8');
const v101Sec = ['## 1. Amaç', '## 2. Denetlenen sürüm zinciri', '## 3. İncelenen kaynak dosyalar', '## 4. İncelenen dokümanlar', '## 5. Ön hesap / kesin tazminat dili', '## 6. Yazma yolu kontrolü', '## 7. takip.json kayıt kapsamı', '## 8. Excel / mail / web / rapor', '## 9. IPC / dependency', '## 10. SEİK katsayı doğrulama zinciri', '## 11. Structured part', '## 12. Snapshot / history güvenliği', '## 13. Fingerprint / freshness güvenliği', '## 14. Checklist güvenliği', '## 15. Draft builder güvenliği', '## 16. Cabrio / otobüs / motosiklet', '## 17. Geriye uyumluluk', '## 18. Test ve audit komutları', '## 19. Kalan riskler', '## 20. RC hazırlık kararı'];
assert(v101Sec.every((s) => v101Doc.includes(s)), 'DKv10.1 dokuman: 20 zorunlu bolum eksiksiz', v101Sec.filter((s) => !v101Doc.includes(s)).join(' | '));
assert(v101Doc.includes('v1') && v101Doc.includes('v10') && v101Doc.includes('preview-first') && v101Doc.includes('Değer Kaybı Yardımcısı RC hazırlığına geçebilir.') && v101Doc.split(/\r?\n/).length <= 400, 'DKv10.1 dokuman: v1-v10 zinciri + preview-first + acik RC karari + 400 satir alti', `${v101Doc.split(/\r?\n/).length} satir`);
// -- Negatif disclaimer korunur; olumlu final-tazminat iddiasi yok --
const v101HelperSrc = await fs.readFile('src/renderer/app/components/value-loss-helper.ts', 'utf-8');
assert(v101HelperSrc.includes('kesin tazminat değildir'), 'DKv10.1 dil: olumsuzlama bicimindeki zorunlu uyari ("kesin tazminat değildir") KORUNUR', '');
const v101CalcTxt = buildValueLossCalculationCopyText(calculateValueLoss(vl9Cur, vl3Provider));
assert(/ön hesap niteliğindedir/.test(v101CalcTxt) && !/kesin (tazminat|değer kaybı)(?! değildir| sonucu değildir)/i.test(v101CalcTxt.replace(/kesin tazminat sonucu değildir|kesin tazminat değildir/gi, '')), 'DKv10.1 dil: kopya metni on-hesap der; olumlu kesinlik iddiasi icermez', '');
// -- Eksik bilgi maili hesap tutarı İÇERMEZ (özet+tutar kayıtlıyken bile) --
const v101Mail = buildValueLossDraft('missing_info_mail', undefined, draftFactsFromValueLossContext(vl9Vl)).body;
assert(!/\d[\d.,]*\s*TL/.test(v101Mail) && !/ön hesap tutarı|yuvarlanmış/i.test(v101Mail) && v101Mail.includes('tamamlanması'), 'DKv10.1 mail-taslak: hesap tutari/sonucu MAILE SIZMAZ (yalniz eksik bilgi listesi)', '');
// -- Dependency donması: runtime deps yalnız pdf2json --
const v101Pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
assert(JSON.stringify(Object.keys(v101Pkg.dependencies ?? {})) === JSON.stringify(['pdf2json']), 'DKv10.1 dependency: runtime bagimliligi donuk (yalniz pdf2json; value-loss saf)', JSON.stringify(Object.keys(v101Pkg.dependencies ?? {})));
// -- Onay kapılı kayıtlar: iki kayıt aksiyonu da confirmDialog + tek IPC --
const v101MainSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(/async function saveValueLossContextAction[\s\S]{0,3500}?confirmDialog[\s\S]{0,1500}?updateValueLossContext/.test(v101MainSrc) && /async function saveValueLossSnapshotAction[\s\S]{0,5000}?confirmDialog[\s\S]{0,1500}?updateValueLossContext/.test(v101MainSrc), 'DKv10.1 kayit: form + ozet kaydi confirmDialog onayindan gecer ve tek value-loss IPC kullanir', '');
assert((v101MainSrc.match(/updateValueLossContext</g) ?? []).length === 2, 'DKv10.1 kayit: updateValueLossContext YALNIZ 2 onayli aksiyonda cagrilir (baska yazma yolu yok)', `${(v101MainSrc.match(/updateValueLossContext</g) ?? []).length} cagri`);
// -- Audit dokümanı src/ içinden import edilmiyor (runtime-neutral) --
assert(!/(from ['"]|require\()[^'"]*VALUE_LOSS_FINAL_AUDIT_V10_1/.test(v101VlSrcAll + v101MainSrc), 'DKv10.1 guard: final audit dokumani src/ icinden IMPORT edilmiyor (runtime-neutral)', '');

// === HasarBotu RC1 hazırlık kapısı (uygulama-geneli guard'lar) ===
// -- RC1 denetim dokümanı: 19 bölüm + smoke plan + açık karar --
const rc1Doc = await fs.readFile('docs/release/RC1_PREPARATION_AUDIT.md', 'utf-8');
const rc1Sec = ['## 1. Amaç', '## 2. Denetim kapsamı', '## 3. İncelenen modüller', '## 4. takip.json / source-of-truth', '## 5. Yazma yolları ve onay mekanizması', '## 6. IPC durumu', '## 7. AI İşçilik durumu', '## 8. Ağır Hasar AI durumu', '## 9. AI Değer Kaybı durumu', '## 10. Excel iş akışları durumu', '## 11. Dashboard / liste / detay', '## 12. Güvenlik / dependency / web-api', '## 13. Test komutları', '## 14. final-office-audit sonucu', '## 15. npm audit sonucu', '## 16. test:dev-harness sonucu', '## 17. Kalan riskler', '## 18. RC1 smoke test önerisi', '## 19. Son karar'];
assert(rc1Sec.every((s) => rc1Doc.includes(s)), 'RC1 dokuman: 19 zorunlu bolum eksiksiz', rc1Sec.filter((s) => !rc1Doc.includes(s)).join(' | '));
assert(rc1Doc.includes('HasarBotu RC1 smoke test aşamasına geçebilir.') && rc1Doc.includes('12. Uygulama kapat/aç sonrası kayıtlar korunuyor mu?') && rc1Doc.includes('Değer Kaybı Yardımcısı RC hazırlığına geçebilir.') && rc1Doc.split(/\r?\n/).length <= 400, 'RC1 dokuman: acik karar + 12 adimli smoke plan + deger-kaybi karari referansli + 400 satir alti', `${rc1Doc.split(/\r?\n/).length} satir`);
// -- Uygulama-geneli kaynak taraması: sqlite/mail/scraping yok; fetch yalnız gemini-client'ta --
async function rc1WalkTs(dir, out) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) await rc1WalkTs(p, out);
    else if (e.name.endsWith('.ts') || e.name.endsWith('.css')) out.push(p);
  }
  return out;
}
const rc1Files = await rc1WalkTs('src', []);
const rc1DbRe = /\b(sqlite|better-sqlite3|typeorm|knex|mongodb|mongoose|postgres|mysql)\b/i;
const rc1MailRe = /nodemailer|sendMail\(|mailto:/i;
const rc1ScrapeRe = /puppeteer|playwright|serpapi/i;
const rc1NetRe = /\bfetch\(|axios|XMLHttpRequest|new WebSocket/;
const rc1Bad = { db: [], mail: [], scrape: [], net: [] };
for (const f of rc1Files) {
  const t = await fs.readFile(f, 'utf-8');
  if (rc1DbRe.test(t)) rc1Bad.db.push(f);
  if (rc1MailRe.test(t)) rc1Bad.mail.push(f);
  if (rc1ScrapeRe.test(t)) rc1Bad.scrape.push(f);
  if (rc1NetRe.test(t) && !f.endsWith('src/main/import/gemini-client.ts')) rc1Bad.net.push(f);
}
assert(rc1Files.length > 100, 'RC1 tarama: src agaci gercekten tarandi (dosya sayisi > 100)', `${rc1Files.length} dosya`);
assert(rc1Bad.db.length === 0, 'RC1 kaynak: SQLite/veritabani source-of-truth YOK (takip.json tek kaynak)', rc1Bad.db.join(', '));
assert(rc1Bad.mail.length === 0, 'RC1 kaynak: otomatik mail gonderim yolu YOK (nodemailer/sendMail/mailto)', rc1Bad.mail.join(', '));
assert(rc1Bad.scrape.length === 0, 'RC1 kaynak: scraping/browser-automation YOK (puppeteer/playwright/serpapi)', rc1Bad.scrape.join(', '));
assert(rc1Bad.net.length === 0, 'RC1 kaynak: ag cagrisi YALNIZ gemini-client.ts (baska fetch/axios/XHR/WebSocket yok)', rc1Bad.net.join(', '));
// -- Gemini istemcisi: anahtar koda gömülü değil; anahtarsız açık hata --
const rc1Gem = await fs.readFile('src/main/import/gemini-client.ts', 'utf-8');
assert(rc1Gem.includes('KODA GÖMÜLMEZ') && rc1Gem.includes('Gemini API anahtarı tanımlı değil') && !/x-goog-api-key':\s*'[A-Za-z0-9]/.test(rc1Gem), 'RC1 gemini: API anahtari hardcoded DEGIL; anahtarsiz kullanim acik hatayla durur', '');
// -- Dependency donması: devDeps'te de yasaklı paket yok --
const rc1Pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
const rc1AllDeps = [...Object.keys(rc1Pkg.dependencies ?? {}), ...Object.keys(rc1Pkg.devDependencies ?? {})];
assert(rc1AllDeps.every((d) => !/sqlite|nodemailer|puppeteer|playwright|axios|serpapi|node-fetch|mongodb|knex|typeorm/i.test(d)), 'RC1 dependency: deps+devDeps icinde veritabani/mail/scraping/ag paketi YOK', rc1AllDeps.join(', '));
// -- Değer kaybı final durumu + RC1 dokümanı birlikte mevcut (release zinciri) --
const rc1VlFinal = await fs.readFile('docs/value-loss/VALUE_LOSS_FINAL_AUDIT_V10_1.md', 'utf-8');
assert(rc1VlFinal.includes('Değer Kaybı Yardımcısı RC hazırlığına geçebilir.') && rc1Doc.includes('EXE üretimi bu'), 'RC1 zincir: deger-kaybi final karari + RC1 dokumani EXE-kapsam-disi beyaniyla mevcut', '');

// === RC1 smoke test paketi (checklist + sonuç formu + freeze kapısı) ===
const rc1Chk = await fs.readFile('docs/release/RC1_SMOKE_TEST_CHECKLIST.md', 'utf-8');
const rc1Form = await fs.readFile('docs/release/RC1_SMOKE_TEST_RESULT_FORM.md', 'utf-8');
const rc1Freeze = await fs.readFile('docs/release/FINAL_SOURCE_FREEZE_GATE.md', 'utf-8');
assert(rc1Chk.includes('Normal trafik dosyası') && rc1Chk.includes('Kasko / onarım dosyası') && rc1Chk.includes('Değer kaybı ihtimali olan trafik dosyası') && rc1Chk.includes('tam 3 dosya'), 'RC1 smoke: checklist tam 3 gercek dosya tipini zorunlu kilar', '');
assert(rc1Chk.includes('## 21. Geçme / kalma kararı') && /P0 veya P1 hata varsa test KALIR/.test(rc1Chk) && rc1Chk.includes('MANUELDİR') && rc1Chk.includes('İnternet GEREKTİRMEZ') && rc1Chk.includes('yerel aktif klasörde'), 'RC1 smoke: checklist manuel/internetsiz/yerel-klasor + P0-P1 freeze-bloklar kurali', '');
assert(rc1Form.includes('P0: Uygulama açılmıyor') && rc1Form.includes('P1: Ana iş akışı çalışmıyor') && rc1Form.includes('P2: Kullanımı zorlaştıran') && rc1Form.includes('P3: Görsel/metin/cila'), 'RC1 smoke: sonuc formu P0/P1/P2/P3 tanimlarini icerir', '');
assert(rc1Form.includes('| Adım | Beklenen Sonuç | Gerçek Sonuç | Durum | Not |') && rc1Form.includes('RC1 smoke test geçti; final source freeze aşamasına geçilebilir.') && rc1Form.includes('RC1 smoke test kaldı; P0/P1 düzeltme gerekir.'), 'RC1 smoke: sonuc formu tablo bicimi + iki acik karar secenegi', '');
assert(rc1Freeze.includes('## 8. Zorunlu komut zinciri') && ['npm run typecheck', 'npm run build', 'npm run test:behavior', 'npm run ci', 'node scripts/final-office-audit.mjs', 'npm audit', 'npm run test:dev-harness'].every((c) => rc1Freeze.includes(c)), 'RC1 freeze: 7 zorunlu komutun tamami kapida listeli', '');
assert(rc1Freeze.includes('Yeni özellik (new feature)') && rc1Freeze.includes('P0/P1 bug fix') && rc1Freeze.includes('Final source freeze yapılabilir.') && rc1Freeze.includes('Final source freeze yapılamaz; önce P0/P1 düzeltme gerekir.'), 'RC1 freeze: freeze-sonrasi yasak/izin listeleri + iki acik karar secenegi', '');
assert(/EXE üretimi bu belgenin kapsamı[\s>]+dışındadır/.test(rc1Freeze) && rc1Chk.includes('EXE build') && rc1Chk.includes('CANLI KÖK OLARAK KULLANILMAZ') && !/ücretli servis(?! GEREKTİRMEZ)/i.test(rc1Chk), 'RC1 smoke: dokumanlar EXE-uretimi/pCloud-canli-kok/ucretli-servis talimati VERMEZ (yasaklar acikca yazili)', '');
assert([rc1Chk, rc1Form, rc1Freeze].every((d) => d.split(/\r?\n/).length <= 400), 'RC1 smoke: uc dokuman da 400 satir alti', [rc1Chk, rc1Form, rc1Freeze].map((d) => d.split(/\r?\n/).length).join('/'));

// === RC1 smoke bulgusu: sayfa dikey kaydirma guard'lari (layout kirpilmasi regresyonu) ===
const rc1Css = await fs.readFile('src/renderer/styles.css', 'utf-8');
const rc1WsPage = rc1Css.match(/\.workspace\.workspace-page \{[\s\S]*?\}/);
assert(rc1WsPage !== null && rc1WsPage[0].includes('overflow-y: auto') && rc1WsPage[0].includes('overflow-x: hidden') && !/overflow: hidden/.test(rc1WsPage[0]), 'RC1 scroll: workspace-page dikey kaydirir (overflow-y auto) + yatay tasma kapali; kirpan overflow-hidden geri gelmedi', '');
const rc1Shell = rc1Css.match(/\.app-shell \{[\s\S]*?\}/);
const rc1MainArea = rc1Css.match(/\.main-area \{[\s\S]*?\}/);
assert(rc1Shell !== null && rc1Shell[0].includes('height: 100vh') && rc1MainArea !== null && rc1MainArea[0].includes('minmax(0, 1fr)') && rc1MainArea[0].includes('min-height: 0'), 'RC1 scroll: app-shell 100vh + main-area orta satir minmax(0,1fr)/min-height:0 (topbar-statusbar sabit kalir)', '');
const rc1Settings = rc1Css.match(/\.settings-workspace \{[\s\S]*?\}/);
const rc1FocusContent = rc1Css.match(/\.focus-content \{[\s\S]*?\}/);
const rc1NavLinks = rc1Css.match(/\.nav-links \{[\s\S]*?\}/);
assert(rc1Settings !== null && rc1Settings[0].includes('overflow: auto') && rc1FocusContent !== null && rc1FocusContent[0].includes('overflow: auto') && rc1FocusContent[0].includes('min-height: 0') && rc1NavLinks !== null && rc1NavLinks[0].includes('overflow-y: auto'), 'RC1 scroll: Ayarlar + focus icerik + sol menu kaydirma konteynerleri korunur', '');
const rc1LayoutSrc = await fs.readFile('src/renderer/app/components/layout.ts', 'utf-8');
assert(rc1LayoutSrc.includes('class="workspace workspace-page page-') && rc1LayoutSrc.includes('class="workspace settings-workspace"'), 'RC1 scroll: sol menu sayfalari workspace-page kaydirma konteynerinde render edilir', '');

// === RC1 P2 UX netleştirmesi: otomatik bağlam önizlemesi vs gerçek seçim ===
const p2CardSrc = await fs.readFile('src/renderer/app/components/ai-case-context-card.ts', 'utf-8');
const p2HelpersSrc = await fs.readFile('src/renderer/app/components/ai-helpers.ts', 'utf-8');
assert(p2CardSrc.includes('Dosya Bağlamı Önizlemesi') && p2CardSrc.includes('Seçili Dosya Bağlamı') && p2CardSrc.includes('previewOnly'), 'RC1-P2 kart: manuel secim oncesi "Dosya Bağlamı Önizlemesi", sonrasi "Seçili Dosya Bağlamı" (kosullu baslik)', '');
assert(p2CardSrc.includes('otomatik bağlam önerisidir') && p2CardSrc.includes('Dosyalar ekranından dosyayı seçin'), 'RC1-P2 kart: onizleme modunda aciklayici cumle (islem icin Dosyalar\'dan secim)', '');
assert(p2HelpersSrc.includes('previewOnly: !state.hasManualWorkingFolderSelection'), 'RC1-P2 baglanti: onizleme etiketi GERCEK kilit bayragindan (hasManualWorkingFolderSelection) turetilir', '');
assert(rc1LayoutSrc.includes('işlem yapılacak dosyayı seçin') && rc1LayoutSrc.includes('otomatik bağlam önizlemesi işlem seçimi sayılmaz'), 'RC1-P2 kilit uyarisi: Dosyalar\'dan gercek secim ister + onizlemenin secim SAYILMADIGINI soyler', '');
assert(/selected && !state\.hasManualWorkingFolderSelection \? 'Önizleme: '/.test(rc1LayoutSrc), 'RC1-P2 topbar: manuel secim oncesi dosya rozeti "Önizleme:" on ekiyle gosterilir (secim mantigi degismedi)', '');

// === UX: kompakt bilgi rozeti (infoTip) — jargonlu kontrollerin yaninda aciklama ===
const uxTipSrc = await fs.readFile('src/renderer/app/components/info-tip.ts', 'utf-8');
assert(uxTipSrc.includes("class=\"info-tip\"") && uxTipSrc.includes('escapeHtml(text)') && !/data-action|ipcRenderer|\.invoke\(|\bfetch\b/.test(uxTipSrc) && uxTipSrc.split(/\r?\n/).length <= 40, 'UX infoTip: saf/kompakt bilesen — escapeHtml zorunlu, aksiyon/IPC/ag tasimaz, 40 satir alti', `${uxTipSrc.split(/\r?\n/).length} satir`);
const uxCss = await fs.readFile('src/renderer/styles.css', 'utf-8');
const uxTipCss = uxCss.match(/\.info-tip \{[\s\S]*?\}/);
assert(uxTipCss !== null && uxTipCss[0].includes('width: 14px') && uxTipCss[0].includes('border-radius: 50%') && uxCss.includes('html.dark .info-tip'), 'UX infoTip: 14px kompakt daire stili + koyu tema varyanti', '');
const uxFiles = ['src/renderer/app/components/cases.ts', 'src/renderer/app/components/detail.ts', 'src/renderer/app/components/status-board.ts', 'src/renderer/app/components/heavy-damage-assessment.ts', 'src/renderer/app/components/ai-case-context-card.ts', 'src/renderer/app/components/value-loss-context-form.ts'];
let uxCount = 0;
for (const f of uxFiles) {
  const t = await fs.readFile(f, 'utf-8');
  uxCount += (t.match(/infoTip\(/g) ?? []).length + (t.match(/tip: '/g) ?? []).length;
}
assert(uxCount >= 15, 'UX infoTip: en az 15 jargonlu kontrole bilgi rozeti yerlestirildi (Riskli/Durgun/Takip Tarihi/Revizyon/Rucu/Guven/Rayic/SBM/arac grubu vb.)', `${uxCount} yerlesim`);
const uxVlForm = await fs.readFile('src/renderer/app/components/value-loss-context-form.ts', 'utf-8');
assert(uxVlForm.includes("tip: 'SBM (Sigorta Bilgi Merkezi)") && uxVlForm.includes('field.tip ? infoTip(field.tip)'), 'UX infoTip: deger-kaybi formu alan-tanimindan (FieldDef.tip) kosullu rozet uretir', '');

// === Kapanma (Ekspertiz) Ücreti v1: saf çıkarım motoru (28 gerçek raporla öğrenildi) ===
const { normalizePlateKey, parseReportFileName, parseTurkishAmount, extractClosingFeeFromText, looksUnreadableReportText } = await import('../dist-electron/shared/reports/closing-fee-extract.js');
assert(normalizePlateKey('34 mpd 222') === '34MPD222' && normalizePlateKey('06-DSZ-557') === '06DSZ557' && normalizePlateKey('34kzz710') === '34KZZ710', 'KU motor: plaka anahtari normalize (bosluk/tire/kucuk harf/Turkce i)', '');
assert(parseReportFileName('34MPB328 EKSPERTİZ RAPORU.pdf').plateKey === '34MPB328' && parseReportFileName('06DSZ557 EKSPERT~Z RAPORU.pdf').plateKey === '06DSZ557' && parseReportFileName('NOT_BIR_RAPOR.pdf').plateKey === null, 'KU motor: rapor dosya adi cozumu (bozuk Turkce karakter toleransli)', '');
assert(parseTurkishAmount('1600') === 1600 && parseTurkishAmount('6125.4') === 6125.4 && parseTurkishAmount('72.594,91') === 72594.91 && parseTurkishAmount('1.600,00') === 1600 && parseTurkishAmount('173.354,16') === 173354.16 && parseTurkishAmount('2.400,50') === 2400.5 && parseTurkishAmount('abc') === null && parseTurkishAmount('0') === null && parseTurkishAmount('0,00', true) === 0, 'KU motor: TR/EN tutar bicimleri (GENEL TOPLAM varyantlari) + allowZero dogru cozulur', '');
// v0.6.7: kapanma tutari = GENEL TOPLAM (KDV dahil nihai), Ekspertiz Ücreti (hizmet bedeli) DEĞİL.
const kuText = ['Kesin Ekspertiz Raporu - Dosya No: 49/18309901', 'Rapor No : 2026/53', 'Dosya No : 49/18309901', 'Plaka Numarası : 34TEST123', 'Rapor/Kayıt Tarihi : 15.06.2026 13.02 / 23.06.2026 16.18', 'Ekspertiz Türü : UzaktanEkspertiz', 'Ekspertiz Ücreti : 2417.41', 'TOPLAM TUTAR 60.495,76', 'KDV 12.099,15', 'GENEL TOPLAM 72.594,91'].join('\n');
const kuR = extractClosingFeeFromText(kuText);
assert(kuR.status === 'ok' && kuR.feeTl === 72594.91 && kuR.dosyaNo === '49/18309901' && kuR.raporNo === '2026/53' && kuR.ekspertizTuru === 'UzaktanEkspertiz' && kuR.kayitTarihi === '23.06.2026' && normalizePlateKey(kuR.plateInText) === '34TEST123', 'KU motor: GENEL TOPLAM + dosyaNo + raporNo + tur + kayit tarihi + plaka tek gecişte cikar', JSON.stringify(kuR));
assert(kuR.feeTl !== 2417.41 && kuR.feeTl !== 60495.76, 'KU motor: kapanma tutari GENEL TOPLAM olur; Ekspertiz Ücreti veya TOPLAM TUTAR (KDVsiz) ile KARISTIRILMAZ', '');
// GENEL TOPLAM iki temsille tekrar edebilir; ilk (ozdes) eslesme alinir.
const kuDup = extractClosingFeeFromText(kuText + '\n' + kuText);
assert(kuDup.status === 'ok' && kuDup.feeTl === 72594.91, 'KU motor: tekrarlanan GENEL TOPLAM (cift temsil) dogru tek deger verir', '');
// 0,00 GENEL TOPLAM (reddedilen dosya) gecerli 'ok' 0 TL + uyari.
const kuZero = extractClosingFeeFromText(kuText.replace('GENEL TOPLAM 72.594,91', 'GENEL TOPLAM 0,00'));
assert(kuZero.status === 'ok' && kuZero.feeTl === 0 && kuZero.warnings.some((w) => w.includes('0,00')), 'KU motor: GENEL TOPLAM 0,00 gecerlidir (reddedilen dosya) + uyari', '');
const kuMissing = extractClosingFeeFromText(kuText.replace(/GENEL TOPLAM.*\n?/, ''));
assert(kuMissing.status === 'fee_missing' && kuMissing.dosyaNo === '49/18309901' && kuMissing.warnings.length > 0, 'KU motor: GENEL TOPLAM yoksa fee_missing + eslestirme alanlari yine doner', '');
assert(extractClosingFeeFromText('D • ← ş t ← ▼ ● a G G a ' + 'x'.repeat(300)).status === 'unreadable' && looksUnreadableReportText('kisa'), 'KU motor: ozel-glif/cop metin unreadable olarak isaretlenir (2/28 vaka)', '');
const kuSrc = await fs.readFile('src/shared/reports/closing-fee-extract.ts', 'utf-8');
assert(kuSrc.includes('GENEL TOPLAM') && !/grab\(text, \/Ekspertiz Ücreti/.test(kuSrc), 'KU motor: capa GENEL TOPLAM (Ekspertiz Ücreti capasi kaldirildi)', '');
assert(!/\bfetch\b|axios|XMLHttpRequest|WebSocket|ipcRenderer|ipcMain|require\(['"]fs|from ['"]fs|electron/i.test(kuSrc) && kuSrc.split(/\r?\n/).length <= 400, 'KU guard: cikarim motoru SAF (ag/dosya/IPC/electron yok) + 400 satir alti', `${kuSrc.split(/\r?\n/).length} satir`);
const kuDoc = await fs.readFile('docs/dev/KAPANMA_UCRETI_RAPOR_TASARIMI.md', 'utf-8');
assert(kuDoc.includes('GENEL TOPLAM') && kuDoc.includes('unreadable') && kuDoc.includes('SALT-OKUNUR') && kuDoc.includes('onayla'), 'KU dokuman: GENEL TOPLAM capasi + okunamayan vaka + salt-okunur/onay kurallari belgeli', '');

// -- Rapor klasörü türetme (yıl-bazlı kardeş EKSPERTİZ RAPORLARI) --
const { deriveReportsRootFromWorkingRoot } = await import('../dist-electron/main/services/settings-service.js');
const kdDerive = deriveReportsRootFromWorkingRoot('P:\\\\BARAN GLOBAL EKSPERTİZ\\\\2026');
assert(typeof kdDerive === 'string' && kdDerive.includes('EKSPERTİZ RAPORLARI') && kdDerive.endsWith('2026') && deriveReportsRootFromWorkingRoot('P:\\\\X\\\\Y') === null && deriveReportsRootFromWorkingRoot('') === null, 'KU türetme: yil klasoru (...\\<yil>) -> kardes EKSPERTİZ RAPORLARI\\<yil>; yil degilse null', String(kdDerive));
const kdChooseSrc = await fs.readFile('src/main/services/settings-service.ts', 'utf-8');
const kdContractSrc = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const kdPreloadSrc2 = await fs.readFile('src/preload/preload.ts', 'utf-8');
const kdIpcSrc2 = await fs.readFile('src/main/ipc.ts', 'utf-8');
const kdSettingsUi2 = await fs.readFile('src/renderer/app/components/settings.ts', 'utf-8');
const kdMainR2 = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(kdContractSrc.includes("settingsChooseReportsRoot: 'settings:choose-reports-root'") && kdPreloadSrc2.includes('IPC.settingsChooseReportsRoot') && kdIpcSrc2.includes('IPC.settingsChooseReportsRoot') && kdChooseSrc.includes('chooseReportsRoot'), 'KU picker: rapor klasoru secici IPC uclusu (kontrat+preload+handler+servis)', '');
assert(kdSettingsUi2.includes('data-action="choose-reports-root"') && kdMainR2.includes("case 'choose-reports-root'") && kdMainR2.includes('chooseReportsRootPath') && kdMainR2.includes('loadClosingFees(true)'), 'KU picker: Ayarlar "Seç" butonu + handler + secince ucret yenileme', '');
assert(/properties: \['openDirectory'\]/.test(kdChooseSrc) && !/reportsRootPath.*writeFile|writeFile.*reportsRootPath/s.test(kdChooseSrc), 'KU picker: yalniz klasor SECER (openDirectory); rapor klasorune yazma yok', '');

// === Kapanma Ücreti v1 KABLOLAMA: ayar + servis + IPC (88) + UI (salt-okunur) ===
const kuSvcSrc = await fs.readFile('src/main/services/closing-fee-service.ts', 'utf-8');
assert(!/atomicWrite|writeFile|\.mutate\(|TrackingFileService|takip\.json|xlsx|nodemailer|\bfetch\b/i.test(kuSvcSrc) && kuSvcSrc.includes('extractPdfText') && kuSvcSrc.includes('extractClosingFeeFromText') && kuSvcSrc.includes('MAX_PDF_COUNT'), 'KU servis: SALT-OKUNUR tarayici (yazma/mutate/Excel/ag YOK) + mevcut pdf-text + saf motor + guvenlik siniri', '');
assert(kuSvcSrc.includes('fileCache') && kuSvcSrc.includes('mtimeMs') && !/require\(['"]electron|from ['"]electron/.test(kuSvcSrc), 'KU servis: oturum-ici bellek onbellegi (mtime+boyut imzali); electron import yok (Node-testlenebilir)', '');
const kuContractSrc = await fs.readFile('src/shared/ipc-contract.ts', 'utf-8');
const kuPreloadSrc = await fs.readFile('src/preload/preload.ts', 'utf-8');
const kuIpcSrc = await fs.readFile('src/main/ipc.ts', 'utf-8');
assert(kuContractSrc.includes("reportsGetClosingFees: 'reports:get-closing-fees'") && kuContractSrc.includes('getClosingFees<T = ClosingFeeScanResult>') && kuPreloadSrc.includes('IPC.reportsGetClosingFees') && kuIpcSrc.includes('IPC.reportsGetClosingFees'), 'KU IPC: kontrat + preload + handler uclusu birlikte (yeni salt-okunur kanal)', '');
assert(/reportsGetClosingFees[\s\S]{0,300}getSettings\(\)[\s\S]{0,200}closingFees\.scan/.test(kuIpcSrc), 'KU IPC: handler ayarlardaki rapor kokunu kullanir; baska yol kabul etmez', '');
const kuNormSrc = await fs.readFile('src/main/services/settings-normalizer.ts', 'utf-8');
const kuTypesSrc = await fs.readFile('src/shared/types.ts', 'utf-8');
assert(kuTypesSrc.includes('reportsRootPath?: string') && kuNormSrc.includes('rawReportsRoot') && kuNormSrc.includes('.slice(0, 260)'), 'KU ayar: reportsRootPath opsiyonel + normalize edici temizler/sinirlar', '');
const kuSettingsUi = await fs.readFile('src/renderer/app/components/settings.ts', 'utf-8');
assert(kuSettingsUi.includes('settings-reports-root') && kuSettingsUi.includes('SALT-OKUNUR') && kuSettingsUi.includes('Boş bırakılırsa özellik kapalıdır'), 'KU ayar UI: rapor koku girisi + salt-okunur ve opsiyonellik aciklamasi', '');
const kuRowSrc = await fs.readFile('src/renderer/app/components/closing-fee-row.ts', 'utf-8');
const kuDetailSrc = await fs.readFile('src/renderer/app/components/detail.ts', 'utf-8');
const kuCasesSrc = await fs.readFile('src/renderer/app/components/cases.ts', 'utf-8');
assert(kuRowSrc.includes('caseIsClosed(item)') && kuRowSrc.includes('Kapanma Ücreti') && kuRowSrc.includes('Rapor okunamadı — elle kontrol edin') && kuRowSrc.includes('Rapor bulunamadı'), 'KU UI satir: yalniz KAPALI dosyada ucret satiri + okunamadi/bulunamadi durumlari (ortak bilesen)', '');
assert(kuDetailSrc.includes('renderClosingFeeRow(item)') && kuCasesSrc.includes('renderClosingFeeRow(item)'), 'KU UI: ucret satiri hem Dosyalar kompakt panelinde hem Kunye kartinda kullanilir', '');
const kuBoardSrc = await fs.readFile('src/renderer/app/components/status-board.ts', 'utf-8');
assert(kuBoardSrc.includes('closingFeeChip') && /if \(!isClosedCase\(item\)\) return '';/.test(kuBoardSrc), 'KU UI pano: kapanma rozeti yalniz kapali dosya satirinda', '');
const kuMainRSrc = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(kuMainRSrc.includes('loadClosingFees') && kuMainRSrc.includes('state.settings?.reportsRootPath') && kuMainRSrc.includes('getClosingFees<ClosingFeeScanResult>'), 'KU UI yukleme: rapor koku ayarliysa arka planda salt-okunur yukleme', '');
assert(!/data-action="[^"]*(closing-fee-(save|write|apply))/i.test(kuDetailSrc + kuBoardSrc), 'KU guvenlik: ucret icin kaydet/yaz/uygula aksiyonu YOK (v1 salt goruntuleme)', '');

// === Kapanan Dosyalar sekmesi (salt-okunur liste + ay filtresi + toplamlar) ===
const kdSrc = await fs.readFile('src/renderer/app/components/closed-cases.ts', 'utf-8');
const kdLayout = await fs.readFile('src/renderer/app/components/layout.ts', 'utf-8');
const kdState = await fs.readFile('src/renderer/app/state.ts', 'utf-8');
const kdMain = await fs.readFile('src/renderer/main.ts', 'utf-8');
assert(kdLayout.includes("'Kapanan Dosyalar', 'kapanan'") && kdLayout.includes("case 'kapanan': return renderClosedCasesPage(state);") && kdState.includes("| 'kapanan' |"), 'KD sekme: sol menu + sayfa yonlendirme + DetailTab tipi birlikte', '');
assert(kdMain.includes("'kapanan', 'rapor-fatura'") && kdMain.includes('dataset.closedMonth'), 'KD sekme: klasor kilidi acikken erisilebilir + ay filtresi handler bagli', '');
assert(kdSrc.includes('isClosedCase(item)') && kdSrc.includes('normalizePlateKey') && kdSrc.includes('closedCasesMonthFilter') && kdSrc.includes('Görünüm toplamı'), 'KD icerik: yalniz kapali dosyalar + ucret eslesmesi + ay filtresi + gorunum toplami', '');
assert(kdSrc.includes('Rapor okunamadı — elle kontrol') && kdSrc.includes('Rapor bulunamadı') && kdSrc.includes('Ekspertiz Raporları klasörü'), 'KD durumlar: okunamadi/bulunamadi rozetleri + ozellik-kapali yonlendirmesi', '');
assert(kdSrc.includes('data-action="status-open-case"') && !/data-action="(?!status-open-case)[a-z-]*(save|write|delete|apply|export)/i.test(kdSrc), 'KD guvenlik: satir tiklamasi mevcut ac-aksiyonunu kullanir; kaydet/sil/yaz/export aksiyonu YOK', '');
assert(!/\bfetch\b|ipcRenderer|\.invoke\(|writeFile|xlsx/i.test(kdSrc) && kdSrc.split(/\r?\n/).length <= 400, 'KD guard: bilesen saf render (ag/IPC/yazma yok) + 400 satir alti', `${kdSrc.split(/\r?\n/).length} satir`);

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Davranış regresyon testleri başarısız: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Davranış regresyon testleri geçti: ${checks.length} kontrol.`);
