import type { KnownKnowledgeTag } from '../../../shared/knowledge/knowledge-tags';
import { normalizeKnowledgeTags } from '../../../shared/knowledge/knowledge-tags';
import {
  normalizeKnowledgeImportExtension,
  permissionCanBePlanned
} from '../../../shared/knowledge/knowledge-import-permissions';
import { KNOWLEDGE_IMPORT_CAN_WRITE, KNOWLEDGE_IMPORT_NOT_PERFORMED_ACTIONS } from '../../../shared/knowledge/knowledge-import-safety';
import type {
  KnowledgeImportCandidate,
  KnowledgeImportDryRunRequest,
  KnowledgeImportDryRunResponse,
  KnowledgeImportPlan,
  KnowledgeImportSourceKind
} from '../../../shared/knowledge/knowledge-import-types';
import type { KnowledgeSourceType } from '../../../shared/knowledge/knowledge-types';
import { KnowledgeImportPermissionService } from './knowledge-import-permission-service';
import { sanitizeKnowledgeImportDryRunRequest } from './knowledge-import-safety-service';

interface SourceKindProfile {
  sourceType?: KnowledgeSourceType;
  tags: KnownKnowledgeTag[];
}

interface SourceKindInference {
  sourceKind: KnowledgeImportSourceKind;
  reasons: string[];
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const SOURCE_KIND_PROFILES: Record<KnowledgeImportSourceKind, SourceKindProfile> = {
  heavy_damage_guide: { sourceType: 'heavy_damage_rule', tags: ['agir_hasar', 'kritik_parca', 'pert'] },
  fault_scenario_guide: { sourceType: 'fault_rule', tags: ['ktt', 'kusur'] },
  fault_ratio_image: { sourceType: 'fault_rule', tags: ['kusur', 'asli_kusur', 'tali_kusur'] },
  expert_note: { sourceType: 'office_note', tags: ['eksper_notu', 'iscilik', 'kaporta', 'boya', 'mekanik'] },
  insurance_company_note: { sourceType: 'office_note', tags: ['eksper_notu', 'mail_taslagi', 'belge_kontrol'] },
  settlement_template: { sourceType: 'template', tags: ['mutabakat', 'mail_taslagi'] },
  policy_note: { sourceType: 'policy_rule', tags: ['police', 'muafiyet', 'indirim', 'kiymet_kazanma'] },
  vehicle_info_guide: { sourceType: 'document_rule', tags: ['belge_kontrol', 'police'] },
  claim_tracking_sheet: { sourceType: 'office_note', tags: ['belge_kontrol', 'eksper_notu'] },
  unknown: { tags: [] }
};

export class KnowledgeImportPlanner {
  constructor(private readonly permissionService = new KnowledgeImportPermissionService()) {}

  buildDryRunPlan(input: KnowledgeImportDryRunRequest | unknown): KnowledgeImportDryRunResponse {
    const request = sanitizeKnowledgeImportDryRunRequest(input);
    const candidates = request.files.map((file, index) => this.buildCandidate(file, index, request));
    const totals = {
      totalCandidates: candidates.length,
      allowedForDryRun: candidates.filter((candidate) => permissionCanBePlanned(candidate.permission)).length,
      requiresApproval: candidates.filter((candidate) => candidate.permission === 'requires_user_approval').length,
      notAllowed: candidates.filter((candidate) => candidate.permission === 'not_allowed').length
    };
    const warnings = unique(candidates.flatMap((candidate) => candidate.warnings));
    const plan: KnowledgeImportPlan = {
      planId: `knowledge-import-dry-run-${hashText(candidates.map((candidate) => candidate.fileName).join('|'))}`,
      createdAt: new Date().toISOString(),
      mode: 'dry_run',
      candidates,
      totals,
      warnings,
      canWrite: KNOWLEDGE_IMPORT_CAN_WRITE,
      notPerformedActions: [...KNOWLEDGE_IMPORT_NOT_PERFORMED_ACTIONS]
    };
    return { plan, warnings };
  }

  private buildCandidate(file: KnowledgeImportDryRunRequest['files'][number], index: number, request: KnowledgeImportDryRunRequest): KnowledgeImportCandidate {
    const fileName = baseName(file.fileName);
    const fileExtension = normalizeKnowledgeImportExtension(fileName);
    const inference = inferSourceKind(fileName, fileExtension, request.preferredSourceKind);
    const profile = SOURCE_KIND_PROFILES[inference.sourceKind];
    const permission = this.permissionService.decide(fileExtension, inference.sourceKind);
    const preferredTags = normalizeKnowledgeTags(request.preferredTags);
    const detectedTags = uniqueTags([...profile.tags, ...preferredTags]);
    const detectedTitle = titleFromFileName(fileName);
    const candidate: KnowledgeImportCandidate = {
      candidateId: `knowledge-import-candidate-${index + 1}-${slugify(fileName) || 'kaynak'}`,
      fileName,
      fileExtension,
      detectedSourceKind: inference.sourceKind,
      detectedTags,
      permission: permission.permission,
      requiresUserApproval: permission.requiresUserApproval,
      canWrite: KNOWLEDGE_IMPORT_CAN_WRITE,
      warnings: unique(permission.warnings),
      reasons: unique([...inference.reasons, ...permission.reasons])
    };
    if (file.filePath) candidate.filePath = file.filePath;
    if (typeof file.sizeBytes === 'number') candidate.sizeBytes = file.sizeBytes;
    if (profile.sourceType) candidate.detectedSourceType = profile.sourceType;
    if (detectedTitle) candidate.detectedTitle = detectedTitle;
    return candidate;
  }
}

export function buildDryRunPlan(request: KnowledgeImportDryRunRequest | unknown): KnowledgeImportDryRunResponse {
  return new KnowledgeImportPlanner().buildDryRunPlan(request);
}

function inferSourceKind(fileName: string, fileExtension: string, preferredSourceKind?: KnowledgeImportSourceKind): SourceKindInference {
  if (preferredSourceKind && preferredSourceKind !== 'unknown') {
    return {
      sourceKind: preferredSourceKind,
      reasons: [`Kullanici tercihli kaynak turu uygulandi: ${preferredSourceKind}.`]
    };
  }

  const normalized = normalizeImportText(fileName);
  if (hasAny(normalized, ['agir hasar', 'kritik parca'])) {
    return { sourceKind: 'heavy_damage_guide', reasons: ['Dosya adinda agir hasar/kritik parca kaniti bulundu.'] };
  }
  if (hasAny(normalized, ['ktt', 'kaza durum', 'senaryo'])) {
    return { sourceKind: 'fault_scenario_guide', reasons: ['Dosya adinda KTT/kaza senaryosu kaniti bulundu.'] };
  }
  if (IMAGE_EXTENSIONS.has(fileExtension) && hasAll(normalized, ['kusur', 'oran'])) {
    return { sourceKind: 'fault_ratio_image', reasons: ['Gorsel dosya adinda kusur orani kaniti bulundu.'] };
  }
  if (hasAny(normalized, ['is not', 'iscilik not', 'eksper not'])) {
    return { sourceKind: 'expert_note', reasons: ['Dosya adinda is/eksper notu kaniti bulundu.'] };
  }
  if (hasAny(normalized, ['sigorta', 'sirket not', 'sirket'])) {
    return { sourceKind: 'insurance_company_note', reasons: ['Dosya adinda sigorta sirket notu kaniti bulundu.'] };
  }
  if (normalized.includes('mutabakat')) {
    return { sourceKind: 'settlement_template', reasons: ['Dosya adinda mutabakat kaniti bulundu.'] };
  }
  if (hasAny(normalized, ['police', 'muafiyet', 'indirim'])) {
    return { sourceKind: 'policy_note', reasons: ['Dosya adinda police/muafiyet/indirim kaniti bulundu.'] };
  }
  if (hasAny(normalized, ['arac bilgileri', 'ekspertiz arac'])) {
    return { sourceKind: 'vehicle_info_guide', reasons: ['Dosya adinda ekspertiz arac bilgileri kaniti bulundu.'] };
  }
  if (hasAny(normalized, ['ihbar takip'])) {
    return { sourceKind: 'claim_tracking_sheet', reasons: ['Dosya adinda ihbar takip Excel kaniti bulundu.'] };
  }
  return { sourceKind: 'unknown', reasons: ['Dosya adindan kaynak tipi kesin olarak taninamadi.'] };
}

function normalizeImportText(input: string): string {
  let value = input;
  const replacements: Array<[RegExp, string]> = [
    [/\u00c3\u00a7/gi, 'c'],
    [/\u00c4\u0178/gi, 'g'],
    [/\u00c4\u00b1/g, 'i'],
    [/\u00c4\u00b0/g, 'i'],
    [/\u00c3\u00b6/gi, 'o'],
    [/\u00c5\u0178/gi, 's'],
    [/\u00c3\u00bc/gi, 'u']
  ];
  for (const [pattern, replacement] of replacements) value = value.replace(pattern, replacement);
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00e7\u00c7]/g, 'c')
    .replace(/[\u011f\u011e]/g, 'g')
    .replace(/[\u0131\u0130]/g, 'i')
    .replace(/[\u00f6\u00d6]/g, 'o')
    .replace(/[\u015f\u015e]/g, 's')
    .replace(/[\u00fc\u00dc]/g, 'u')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function hasAll(value: string, needles: readonly string[]): boolean {
  return needles.every((needle) => value.includes(needle));
}

function baseName(fileName: string): string {
  return fileName.replace(/\\/g, '/').split('/').pop()?.trim() || 'kaynak';
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(input: string): string {
  return normalizeImportText(input).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}

function hashText(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueTags(values: KnownKnowledgeTag[]): KnownKnowledgeTag[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
