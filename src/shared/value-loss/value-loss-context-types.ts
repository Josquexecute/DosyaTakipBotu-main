/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v2: kullanıcı onaylı Değer Kaybı Ek Bilgi Formu veri tipi.
 *
 * Bu alan YALNIZ kullanıcı "Kaydet" onayı verince `tracking.aiHelperContext.valueLoss` altında saklanır.
 * Eski dosyalarda yoktur (undefined güvenli); ana hasar/evrak/Excel alanlarını ETKİLEMEZ.
 * Tipler saftır (ağ/dosya/electron yok). Tutar hesabı YAPILMAZ; yalnız veri toplama içindir.
 */

export type ValueLossFileType = 'trafik' | 'kasko' | 'unknown';
export type ValueLossVehicleGroup = 'A' | 'B' | 'C' | 'Ç' | 'D' | 'E' | 'F' | 'unknown';

/** v5: Araç türü (grubun daha özel hali; marka/modelden ÇIKARILMAZ, kullanıcı seçer). */
export type ValueLossVehicleType =
  | 'automobile' | 'taxi' | 'minibus' | 'bus' | 'pickup' | 'truck'
  | 'special_purpose' | 'tractor' | 'work_machine' | 'trailer' | 'motorcycle' | 'unknown';

/**
 * v5: Kullanıcı ONAYIYLA kaydedilen kompakt ön hesap özeti (denetim amaçlı; tutar bağlayıcı değildir).
 * Yalnız `aiHelperContext.valueLoss.calculationSnapshot` altında saklanır; otomatik yazılmaz.
 */
export interface ValueLossCalculationSnapshot {
  version: 1;
  createdAt: string;
  status: 'calculated' | 'cannot_calculate' | 'control_needed';
  /** Yalnız status='calculated' iken bulunur (tanı özetlerinde tutar saklanmaz). */
  amount?: number;
  roundedAmount?: number;
  formulaSummary: string;
  coefficientSource?: string;
  factorsSummary: string[];
  missingInputs: string[];
  warnings: string[];
  evidence: string[];
  capApplied?: boolean;
  capReason?: string;
  disclaimer: string;
  /** v8: özet kaydedildiği andaki form verisinin deterministik parmak izi (tazelik kontrolü). */
  inputFingerprint?: string;
  inputFingerprintVersion?: 1;
  /** v8: kompakt, insan-okur girdi özeti (ham veri/dosya yolu içermez). */
  inputSummary?: string[];
}

export interface ValueLossVehicleInfo {
  brandModel?: string;
  modelYear?: number;
  mileageKm?: number;
  workingHours?: number;
  marketValue?: number;
  vehicleGroup?: ValueLossVehicleGroup;
  /** v5: araç türü (örn. OTOBÜS 0.5 çarpanı için); kullanıcı seçimi, otomatik çıkarım yok. */
  vehicleType?: ValueLossVehicleType;
  commercialOrRental?: boolean;
  foreignPlate?: boolean;
  antiqueOrCollectible?: boolean;
  /** v6: cabrio/üstü açılır araç (esaslar 3.7 özel yan panel satırları yönlendirmesi için). */
  isCabrioOrConvertible?: boolean;
}

export interface ValueLossHistoryInfo {
  sbmPastDamageCount?: number;
  hasPriorHeavyDamage?: boolean;
  hasPriorSamePartDamage?: boolean;
  notes?: string;
}

import type { ValueLossPartItem } from './value-loss-part-input-types';

export interface ValueLossDamageInfo {
  isTotalLossOrHeavyDamage?: boolean;
  changedPartsText?: string;
  repairedPartsText?: string;
  paintedPartsText?: string;
  /** v4: yapılandırılmış parça satırları (SEİK katsayı eşleşmesi için; serbest metin ayrıştırılmaz). */
  structuredParts?: ValueLossPartItem[];
  /** v4: değer kaybına esas hasar (onarım) tutarı, TL (esaslar: kasa üst yapısı hariç). */
  damageAmount?: number;
  /**
   * v5: HASAR tarihi — yaş katsayısı kaynağı (kaynak modül `Tablolar!B27` ile uyum).
   * Zorunluluk eşiği (01.07.2026) atama/ihbar tarihine bağlı KALIR; bu alan onu değiştirmez.
   */
  damageDate?: string;
  hasStructuralParts?: boolean;
  hasSemiStructuralParts?: boolean;
  hasCosmeticParts?: boolean;
  hasAccessoryParts?: boolean;
  paintTypeKnown?: boolean;
  repairLaborKnown?: boolean;
  newPartPriceKnown?: boolean;
}

export interface ValueLossMarketAnalysisInfo {
  comparableListingCount?: number;
  listingsWithinLast30Days?: boolean;
  listingNumbersVisible?: boolean;
  screenshotsTaken?: boolean;
  kmModelEquipmentComparable?: boolean;
  outliersExcluded?: boolean;
  bargainingRealityExplained?: boolean;
}

export interface ValueLossEvidenceInfo {
  calculationModuleOutputExists?: boolean;
  marketScreenshotsExist?: boolean;
  damagePhotosExist?: boolean;
  repairPartEvidenceExists?: boolean;
  methodExplainedInReport?: boolean;
  digitalArchiveReady?: boolean;
}

export interface ValueLossContext {
  version: 1;
  updatedAt?: string;
  fileType?: ValueLossFileType;
  assignmentDate?: string;
  reportWillIncludeValueLoss?: boolean;
  vehicle?: ValueLossVehicleInfo;
  history?: ValueLossHistoryInfo;
  damage?: ValueLossDamageInfo;
  marketAnalysis?: ValueLossMarketAnalysisInfo;
  evidence?: ValueLossEvidenceInfo;
  /** v5: kullanıcı onaylı kompakt ön hesap özeti (opsiyonel; yalnız onaylı kayıtla). */
  calculationSnapshot?: ValueLossCalculationSnapshot;
  /** v6: onaylı özet geçmişi (en yeni başta; en fazla 5; yalnız onaylı kayıtla güncellenir). */
  calculationSnapshotHistory?: ValueLossCalculationSnapshotHistoryItem[];
  notes?: string;
}

/**
 * v6: Ön hesap özeti geçmiş kaydı (kompakt; yalnız kullanıcı onaylı kayıtla eklenir).
 * En yeni kayıt başta tutulur; normalize en fazla 5 kayıt saklar.
 */
export interface ValueLossCalculationSnapshotHistoryItem extends ValueLossCalculationSnapshot {
  /** Yerel, kararlı kimlik (dosya yolu/iç sistem kimliği DEĞİLDİR). */
  id: string;
  savedAt: string;
  label?: string;
}

/** Kaydetme girdisi: version'sız esnek hal (normalize edilir). */
export type ValueLossContextInput = Partial<Omit<ValueLossContext, 'version'>>;

export const VALUE_LOSS_CONTEXT_VERSION = 1 as const;
