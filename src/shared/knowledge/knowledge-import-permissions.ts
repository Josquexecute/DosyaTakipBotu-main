import type { KnowledgeImportPermissionLevel } from './knowledge-import-types';

export const KNOWLEDGE_IMPORT_ALLOWED_DRY_RUN_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.xls',
  '.txt',
  '.md',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp'
] as const;

export const KNOWLEDGE_IMPORT_DANGEROUS_EXTENSIONS = [
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.js',
  '.ts',
  '.zip',
  '.rar',
  '.7z',
  '.msi',
  '.scr',
  '.com',
  '.vbs'
] as const;

export const KNOWLEDGE_IMPORT_DANGEROUS_EXTENSION_WARNING =
  'Guvenlik nedeniyle bu dosya tipi bilgi bankasi import adayi olarak kabul edilmez.';

export const KNOWLEDGE_IMPORT_UNKNOWN_SOURCE_WARNING =
  'Kaynak tipi otomatik taninamadi; manuel eslestirme gerekir.';

export type KnowledgeImportKnownExtension =
  | typeof KNOWLEDGE_IMPORT_ALLOWED_DRY_RUN_EXTENSIONS[number]
  | typeof KNOWLEDGE_IMPORT_DANGEROUS_EXTENSIONS[number];

const ALLOWED_EXTENSION_SET = new Set<string>(KNOWLEDGE_IMPORT_ALLOWED_DRY_RUN_EXTENSIONS);
const DANGEROUS_EXTENSION_SET = new Set<string>(KNOWLEDGE_IMPORT_DANGEROUS_EXTENSIONS);

export function normalizeKnowledgeImportExtension(fileName: string): string {
  const safeName = String(fileName ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  const dotIndex = safeName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === safeName.length - 1) return '';
  return safeName.slice(dotIndex).toLowerCase();
}

export function isKnowledgeImportExtensionAllowedForDryRun(fileExtension: string): boolean {
  return ALLOWED_EXTENSION_SET.has(fileExtension.toLowerCase());
}

export function isKnowledgeImportExtensionDangerous(fileExtension: string): boolean {
  return DANGEROUS_EXTENSION_SET.has(fileExtension.toLowerCase());
}

export function permissionCanBePlanned(permission: KnowledgeImportPermissionLevel): boolean {
  return permission !== 'not_allowed';
}
