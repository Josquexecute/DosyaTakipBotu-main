/**
 * v0.6.x — AI İşçilik v3.1: Eksper Onaylı İşçilik Öğrenme tipleri (SAF; ağ/dosya/IPC yok).
 * Eksper Bey'in tamamlanmış/onaylanmış işçilik dağıtımları YEREL öğrenme örneği olur.
 * Hiçbir kayıt kullanıcı onayı olmadan oluşmaz; öğrenilen kural Excel'e SESSİZCE uygulanmaz (önizleme + onay).
 */
import type { OperationType } from './operation-type-detector';

/** H..N işçilik dağıtımı (eksper dosyasındaki gerçek tutarlar). */
export interface LaborDistribution {
  kaporta: number;
  mekanik: number;
  elektrik: number;
  dosemeKilit: number;
  cam: number;
  boya: number;
  onarim: number;
}

export type ExpertLearningConfidence = 'low' | 'medium' | 'high';

/** Eksper onaylı öğrenme kaydı (yerel, geri alınabilir, pasifleştirilebilir). */
export interface ExpertApprovedLaborLearningEntry {
  id: string;
  source: 'expert_approved_excel';
  vehicleModel?: string;
  modelYear?: number;
  chassisPrefix?: string;
  engineCode?: string;
  partGroup?: string;
  partName: string;
  partCode?: string;
  operationType: OperationType;
  salvagePriceBand?: string;
  originalPriceBand?: string;
  laborDistribution: LaborDistribution;
  reasoning: string;
  confidence: ExpertLearningConfidence;
  /** Yalnız kullanıcı onayladıysa true; store yalnız onaylı kaydı kalıcı kabul eder. */
  approvedByUser: boolean;
  isActive: boolean;
  createdAt: string;
}

/** Eksper Excel'inden çıkarılan ham satır (önizleme/extractor girdisi). */
export interface ExpertLearningSourceRow {
  partName: string;
  partGroup?: string;
  partCode?: string;
  operationType: OperationType;
  salvagePrice: number | null;
  originalPrice: number | null;
  laborDistribution: LaborDistribution;
  reasoning?: string;
}

export type ExpertLearningMatchLevel = 'strong' | 'medium' | 'low' | 'control-needed' | 'none';

export interface ExpertLearningQuery {
  partName: string;
  partCode?: string;
  partGroup?: string;
  operationType: OperationType;
  salvagePrice?: number | null;
  vehicleModel?: string;
  chassisPrefix?: string;
  engineCode?: string;
  /** Güvenlik/kritik parça mı (kritikte otomatik güçlü öneri uygulanmaz). */
  critical?: boolean;
}

export type VehicleFieldMatch = 'same' | 'similar' | 'missing' | 'conflict';
export type PriceBandMatch = 'same' | 'near' | 'far' | 'missing';

/** Eşleşme açıklaması: seviye + gerekçeler + uyarılar + araç/fiyat bandı uyumu (geriye uyumlu). */
export interface ExpertLearningMatchExplanation {
  level: ExpertLearningMatchLevel;
  reasons: string[];
  warnings: string[];
  vehicleMatch: { model: VehicleFieldMatch; chassisPrefix: VehicleFieldMatch; engineCode: VehicleFieldMatch };
  priceBandMatch: PriceBandMatch;
}

export interface ExpertLearningMatch {
  level: ExpertLearningMatchLevel;
  entry: ExpertApprovedLaborLearningEntry | null;
  reason: string;
  /** v3.3: yapısal açıklama (gerekçe/uyarı/araç-fiyat uyumu) — opsiyonel, geriye uyumlu. */
  reasons?: string[];
  warnings?: string[];
  vehicleMatch?: ExpertLearningMatchExplanation['vehicleMatch'];
  priceBandMatch?: PriceBandMatch;
}

/** v3.3: AI önerisi ↔ eksper dağıtımı diff görünümü (Excel'e YAZMAZ; writePolicy hep preview_only). */
export interface ExpertLaborDiffView {
  rowIndex: number;
  matchLevel: Exclude<ExpertLearningMatchLevel, 'none'>;
  matchReasons: string[];
  matchWarnings: string[];
  aiDistribution: LaborDistribution;
  expertDistribution: LaborDistribution;
  differences: Array<{
    field: keyof LaborDistribution;
    label: string;
    aiAmount: number;
    expertAmount: number;
    delta: number;
  }>;
  totalDelta: number;
  writePolicy: 'preview_only';
  /** v3.4: araç bağlamının kaynağı (diff kartında gösterilir). */
  vehicleSource?: 'active-file' | 'excel' | 'unknown';
}

/** Store durum görünümü (UI yönetim paneli için). */
export interface ExpertLearningStoreState {
  entries: ExpertApprovedLaborLearningEntry[];
  /** Depo dosyası bozuk olduğu için yok sayıldı mı. */
  corrupt: boolean;
  activeCount: number;
  passiveCount: number;
}

/** Onay sonucu: güncel durum + eklenen/atlanan duplicate sayısı. */
export interface ExpertLearningApproveResult extends ExpertLearningStoreState {
  added: number;
  skippedDuplicates: number;
}

/** Excel önizleme IPC yanıtı. */
export interface ExpertLearningPreviewResponse {
  fileName: string;
  items: ExpertLearningPreviewItem[];
  skipped: string[];
  corrupt: boolean;
  storeCount: number;
}

/** Öğrenme önizlemesi için tek satırlık görünüm. */
export interface ExpertLearningPreviewItem {
  partName: string;
  partCode?: string;
  partGroup?: string;
  operationType: OperationType;
  salvagePrice: number | null;
  originalPrice: number | null;
  laborDistribution: LaborDistribution;
  derivedEntry: ExpertApprovedLaborLearningEntry;
  confidence: ExpertLearningConfidence;
  needsReview: boolean;
  warning: string;
  /** Aktif store'da aynı parça kodu+işlem türü+araç kaydı zaten var mı (otomatik toplu onaya girmez). */
  duplicate?: boolean;
  /** Duplicate ise, çakışan mevcut store kaydının id'si (kullanıcı onaylı yenileme için). */
  duplicateOfId?: string;
}
