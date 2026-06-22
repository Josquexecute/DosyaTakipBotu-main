export const KNOWLEDGE_IMPORT_DRY_RUN_MODE = 'dry_run' as const;
export const KNOWLEDGE_IMPORT_CAN_WRITE = false as const;

export const KNOWLEDGE_IMPORT_FORBIDDEN_RUNTIME_ACTIONS = [
  'write',
  'save',
  'apply',
  'delete',
  'sync',
  'upload',
  'download',
  'copy'
] as const;

export const KNOWLEDGE_IMPORT_NOT_PERFORMED_ACTIONS = [
  'Dosya icerigi okunmadi.',
  'PDF/DOCX/XLSX parse edilmedi.',
  'OCR calistirilmadi.',
  'Bilgi bankasina kalici kaynak eklenmedi.',
  'takip.json, Excel, PDF, foto veya AppData verisi yazilmadi.'
] as const;
