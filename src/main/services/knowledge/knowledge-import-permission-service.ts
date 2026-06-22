import {
  KNOWLEDGE_IMPORT_DANGEROUS_EXTENSION_WARNING,
  KNOWLEDGE_IMPORT_UNKNOWN_SOURCE_WARNING,
  isKnowledgeImportExtensionAllowedForDryRun,
  isKnowledgeImportExtensionDangerous
} from '../../../shared/knowledge/knowledge-import-permissions';
import type { KnowledgeImportPermissionLevel, KnowledgeImportSourceKind } from '../../../shared/knowledge/knowledge-import-types';

export interface KnowledgeImportPermissionDecision {
  permission: KnowledgeImportPermissionLevel;
  requiresUserApproval: boolean;
  warnings: string[];
  reasons: string[];
}

export class KnowledgeImportPermissionService {
  decide(fileExtension: string, sourceKind: KnowledgeImportSourceKind): KnowledgeImportPermissionDecision {
    const extension = fileExtension.toLowerCase();
    if (!extension) {
      return {
        permission: 'not_allowed',
        requiresUserApproval: false,
        warnings: ['Dosya uzantisi taninamadi; bilgi bankasi import adayi olarak kabul edilmez.'],
        reasons: ['Uzanti bulunamadigi icin guvenli dry-run planina alinmadi.']
      };
    }

    if (isKnowledgeImportExtensionDangerous(extension)) {
      return {
        permission: 'not_allowed',
        requiresUserApproval: false,
        warnings: [KNOWLEDGE_IMPORT_DANGEROUS_EXTENSION_WARNING],
        reasons: [`${extension} uzantisi guvenlik politikasinda yasakli.`]
      };
    }

    if (!isKnowledgeImportExtensionAllowedForDryRun(extension)) {
      return {
        permission: 'not_allowed',
        requiresUserApproval: false,
        warnings: [`${extension} uzantisi bilgi bankasi dry-run aday listesinde desteklenmiyor.`],
        reasons: [`${extension} uzantisi izinli dry-run uzantilari arasinda degil.`]
      };
    }

    if (sourceKind === 'claim_tracking_sheet') {
      return {
        permission: 'dry_run_only',
        requiresUserApproval: false,
        warnings: ['Excel import/parsing bu gorevde yapilmaz.'],
        reasons: ['Ihbar takip Excel dosyasi sadece metadata dry-run planina alinabilir.']
      };
    }

    if (sourceKind === 'unknown') {
      return {
        permission: 'dry_run_only',
        requiresUserApproval: false,
        warnings: [KNOWLEDGE_IMPORT_UNKNOWN_SOURCE_WARNING],
        reasons: ['Kaynak tipi kesinlesmedigi icin gercek import oncesi manuel eslestirme gerekir.']
      };
    }

    return {
      permission: 'requires_user_approval',
      requiresUserApproval: true,
      warnings: [],
      reasons: ['Kaynak tipi tahmin edildi; gercek import ileride kullanici onayi gerektirir.']
    };
  }
}
