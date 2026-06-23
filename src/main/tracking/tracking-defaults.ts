import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { CaseIdentity, TrackingFile } from '../../shared/types';
import { PORTAL_CHECKLIST_DEFAULTS } from '../../shared/document-rules';
import { normalizeSearch } from '../../shared/turkish';
import { normalizeVehicleContext } from '../../shared/vehicle/vehicle-context';

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayLocalDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computerName(): string {
  return os.hostname() || 'BILINMEYEN-PC';
}

export function createDefaultTracking(caseIdentity: CaseIdentity, user = 'Sistem'): TrackingFile {
  const now = nowIso();
  const computer = computerName();
  const heavyDamageHint = hasHeavyDamageFolderHint(caseIdentity.caseKey);
  const normalizedIdentity = {
    ...caseIdentity,
    officeFileNo: caseIdentity.officeFileNo ?? '',
    claimNoticeNo: caseIdentity.claimNoticeNo ?? ''
  };
  return {
    schemaVersion: 1,
    caseIdentity: normalizedIdentity,
    metadata: {
      createdAt: now,
      updatedAt: now,
      createdByComputer: computer,
      updatedByComputer: computer,
      revision: 1,
      writeId: randomUUID()
    },
    assignment: {
      // Dosya sorumlusu aktif bilgisayar kullanıcısı değildir.
      // Bu alan dosyaya özel seçilir ve _HASARBOTU/takip.json üzerinden tüm bilgisayarlarda aynı görünür.
      sorumlu: 'Atanmadı',
      eksper: 'Baran Gürbüz',
      raportor: user && user !== 'Sistem' ? user : 'Ömer Faruk İşleyen',
      takipTarihi: '',
      sonIslemTarihi: '',
      oncelik: 'Normal'
    },
    status: {
      dosyaDurumu: 'İncelemede',
      workflowStatus: 'Yeni Dosya',
      kapaliMi: caseIdentity.isClosedFolder
    },
    claimType: 'unknown',
    service: { name: '', source: 'manual', updatedAt: '', updatedBy: '' },
    portalChecklist: PORTAL_CHECKLIST_DEFAULTS.map((item) => ({
      key: item.key,
      label: item.label,
      completed: item.key === 'klasor-acildi',
      ...(item.key === 'klasor-acildi' ? { completedBy: 'Sistem', completedAt: now } : {})
    })),
    todos: [],
    notes: [],
    rucu: { varMi: false, potansiyel: false, durum: 'Yok', not: '' },
    labor: { parcaListesiIstendi: false, parcaKodlariIstendi: false, parcaIscilikGirildi: false, not: '' },
    kttKusur: {
      helperOnly: true,
      finalDecisionWarning: 'Bu modül yalnızca yardımcıdır. Nihai kusur kararı kullanıcı tarafından verilmelidir.',
      not: ''
    },
    heavyDamage: {
      enabled: heavyDamageHint,
      helperOnly: true,
      finalDecisionWarning: 'Bu modül yalnızca yardımcıdır. Ağır hasar/pert kararı otomatik verilmez.',
      not: heavyDamageHint ? 'Klasör adında ağır hasar/pert ibaresi görüldü. Kullanıcı doğrulaması gerekir.' : ''
    },
    vehicleContext: normalizeVehicleContext({}),
    audit: [{
      at: now,
      by: user,
      computer,
      action: 'tracking-file-created',
      text: 'Takip dosyası oluşturuldu.'
    }]
  };
}

function hasHeavyDamageFolderHint(folderName: string): boolean {
  const normalized = ` ${normalizeSearch(folderName)} `.replace(/[^A-Z0-9]+/g, ' ');
  return /\sPERT\s/.test(normalized) || /\sAGIR\s+HASAR(LI)?\s/.test(normalized);
}
