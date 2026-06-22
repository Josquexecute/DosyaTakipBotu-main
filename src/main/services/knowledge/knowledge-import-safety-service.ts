import { normalizeKnowledgeTags } from '../../../shared/knowledge/knowledge-tags';
import { KNOWLEDGE_IMPORT_DRY_RUN_MODE } from '../../../shared/knowledge/knowledge-import-safety';
import type { KnowledgeImportDryRunRequest, KnowledgeImportFileInput, KnowledgeImportSourceKind } from '../../../shared/knowledge/knowledge-import-types';

const MAX_DRY_RUN_FILES = 200;
const MAX_FILE_NAME_LENGTH = 260;
const MAX_FILE_PATH_LENGTH = 1000;

const SOURCE_KINDS = new Set<KnowledgeImportSourceKind>([
  'heavy_damage_guide',
  'fault_scenario_guide',
  'fault_ratio_image',
  'expert_note',
  'insurance_company_note',
  'settlement_template',
  'policy_note',
  'vehicle_info_guide',
  'claim_tracking_sheet',
  'unknown'
]);

export function sanitizeKnowledgeImportDryRunRequest(input: unknown): KnowledgeImportDryRunRequest {
  if (!isRecord(input)) throw new Error('Knowledge import dry-run istegi nesne olmali.');
  if (input.mode !== KNOWLEDGE_IMPORT_DRY_RUN_MODE) throw new Error('Knowledge import planlayici sadece dry_run modunu kabul eder.');
  if (!Array.isArray(input.files)) throw new Error('Knowledge import dry-run icin files listesi zorunludur.');

  const files = input.files.slice(0, MAX_DRY_RUN_FILES).map(sanitizeKnowledgeImportFileInput).filter((file) => file.fileName.length > 0);
  const request: KnowledgeImportDryRunRequest = {
    mode: KNOWLEDGE_IMPORT_DRY_RUN_MODE,
    files
  };

  const preferredSourceKind = normalizePreferredSourceKind(input.preferredSourceKind);
  if (preferredSourceKind) request.preferredSourceKind = preferredSourceKind;

  const preferredTags = normalizeKnowledgeTags(Array.isArray(input.preferredTags) ? input.preferredTags : []);
  if (preferredTags.length > 0) request.preferredTags = preferredTags;

  return request;
}

function sanitizeKnowledgeImportFileInput(input: unknown): KnowledgeImportFileInput {
  const record = isRecord(input) ? input : {};
  const fileName = safeText(record.fileName, MAX_FILE_NAME_LENGTH);
  const file: KnowledgeImportFileInput = { fileName };
  const filePath = safeText(record.filePath, MAX_FILE_PATH_LENGTH);
  if (filePath) file.filePath = filePath;
  const sizeBytes = Number(record.sizeBytes);
  if (Number.isFinite(sizeBytes) && sizeBytes >= 0) file.sizeBytes = Math.floor(sizeBytes);
  return file;
}

function normalizePreferredSourceKind(input: unknown): KnowledgeImportSourceKind | undefined {
  return typeof input === 'string' && SOURCE_KINDS.has(input as KnowledgeImportSourceKind)
    ? input as KnowledgeImportSourceKind
    : undefined;
}

function safeText(input: unknown, maxLength: number): string {
  return typeof input === 'string'
    ? input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}
