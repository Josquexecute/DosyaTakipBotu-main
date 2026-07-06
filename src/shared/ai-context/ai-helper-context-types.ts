/**
 * v0.6.x — takip.json için KONTROLLÜ, GERİYE UYUMLU ek bağlam bölümü: `aiHelperContext`.
 *
 * Bu alan yalnızca kullanıcı "Kaydet" dediğinde oluşur. Eski dosyalarda yoksa uygulama sorunsuz açılır
 * (undefined güvenli). Ana hasar/evrak/Excel/ağır hasar alanlarını ETKİLEMEZ; ayrı bir bölümdür.
 * Tipler saftır (ağ/dosya/electron yok). AI Yardımcıları'nın daha doğru öneri vermesi için kullanılır.
 */
import type { ValueLossContext } from '../value-loss/value-loss-context-types';

export type AiHelperClaimTypeOverride = 'trafik' | 'kasko' | 'ihtiyari' | 'belirsiz';
export type AiHelperVehicleGroup = 'binek_hafif_ticari_motosiklet' | 'agir_vasita' | 'is_makinesi' | 'belirsiz';
export type AiHelperCityScope = 'ayni_il' | 'farkli_il' | 'belirsiz';
export type AiHelperReportTemplateOverride = 'ek_1_1' | 'ek_1_2' | 'ek_2' | 'belirsiz';
export type AiHelperDocumentType = 'ktt' | 'zabit' | 'beyan' | 'karakol_tutanagi' | 'belirsiz';
export type AiHelperTriState = 'var' | 'yok' | 'belirsiz';

export interface AiHelperContext {
  version: 1;
  claimTypeOverride?: AiHelperClaimTypeOverride;
  vehicleGroup?: AiHelperVehicleGroup;
  hasValueLoss?: boolean | null;
  isOutOfTown?: boolean | null;
  cityScope?: AiHelperCityScope;
  insurerName?: string;
  policyTypeNote?: string;
  reportTemplateOverride?: AiHelperReportTemplateOverride;
  appointmentDateTime?: string;
  expertiseRequestDate?: string;
  firstInspectionDate?: string;
  preliminaryReportDate?: string;
  reportReadyDate?: string;
  vehicleDeliveredToService?: boolean | null;
  vehicleDeliveredToServiceDate?: string;
  repairStartedDate?: string;
  repairCompletedDate?: string;
  accidentDocumentType?: AiHelperDocumentType;
  alcoholDocumentStatus?: AiHelperTriState;
  driverLicenseStatus?: AiHelperTriState;
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
  /**
   * v0.6.x v2: Değer Kaybı Ek Bilgi Formu (kullanıcı onaylı). Yalnız kendi kaydetme akışıyla
   * (tek alan merge) yazılır; "Dosya Ek Bilgileri" kaydı bu alanı SİLMEZ (korunur).
   */
  valueLoss?: ValueLossContext;
}

/** Kaydetme/birleştirme girdisi: AiHelperContext'in version'sız esnek hali (sanitize edilir). */
export type AiHelperContextInput = Partial<Omit<AiHelperContext, 'version'>>;

export const AI_HELPER_CONTEXT_VERSION = 1 as const;
