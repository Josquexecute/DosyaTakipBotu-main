/**
 * v0.6.x — aiHelperContext varsayılanları + Türkçe alan etiketleri (kaydetme onay modalı için).
 * Saf veri; ağ/dosya yok.
 */
import type { AiHelperContext } from './ai-helper-context-types';
import { AI_HELPER_CONTEXT_VERSION } from './ai-helper-context-types';

/** Boş (kaydedilmemiş) ek bağlam. */
export const EMPTY_AI_HELPER_CONTEXT: AiHelperContext = { version: AI_HELPER_CONTEXT_VERSION };

/** Kullanıcıya gösterilecek Türkçe alan etiketleri (onay modalı/diff). */
export const AI_HELPER_CONTEXT_FIELD_LABELS: Readonly<Record<string, string>> = {
  claimTypeOverride: 'Dosya türü',
  vehicleGroup: 'Araç grubu',
  hasValueLoss: 'Değer kaybı',
  cityScope: 'Şehir durumu',
  insurerName: 'Sigorta şirketi',
  policyTypeNote: 'Poliçe notu',
  reportTemplateOverride: 'Rapor şablonu',
  appointmentDateTime: 'Ekspertiz talep / atama tarihi',
  expertiseRequestDate: 'Ekspertiz talep tarihi',
  firstInspectionDate: 'İlk ekspertiz tarihi',
  preliminaryReportDate: 'Ön rapor tarihi',
  reportReadyDate: 'Dosya rapora hazır tarihi',
  vehicleDeliveredToService: 'Araç servise bırakıldı mı',
  vehicleDeliveredToServiceDate: 'Servise bırakılma tarihi',
  repairStartedDate: 'Onarım başlangıç tarihi',
  repairCompletedDate: 'Onarım bitiş tarihi',
  accidentDocumentType: 'Tutanak tipi',
  alcoholDocumentStatus: 'Alkol evrak durumu',
  driverLicenseStatus: 'Ehliyet durumu',
  notes: 'Serbest not'
};
