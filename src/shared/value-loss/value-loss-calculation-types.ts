/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v3: Reel Piyasa Analiz ÖN HESAP tipleri (SAF).
 *
 * Ön hesap yalnız ÖNİZLEME amaçlıdır; bağlayıcı bir hüküm değildir ve hiçbir yere otomatik
 * yazılmaz. Katsayılar coefficient-provider mimarisiyle yönetilir; set yoksa tutar üretilmez.
 */

export type ValueLossCalcStatus = 'calculated' | 'cannot_calculate' | 'control_needed';
export type ValueLossFactorEffect = 'increase' | 'decrease' | 'neutral' | 'blocking' | 'info';

export interface ValueLossCalculationFactor {
  id: string;
  label: string;
  inputValue?: string | number | boolean;
  coefficient?: number;
  effect: ValueLossFactorEffect;
  explanation: string;
}

export interface ValueLossCalculationResult {
  status: ValueLossCalcStatus;
  /** Ham ön hesap tutarı (cap uygulanmış olabilir). Yalnız status='calculated' iken. */
  amount?: number;
  /** 500 TL katına (yukarı yönlü) yuvarlanmış tutar. */
  roundedAmount?: number;
  formulaSummary: string;
  factors: ValueLossCalculationFactor[];
  missingInputs: string[];
  warnings: string[];
  evidence: string[];
  /** Kullanılan katsayı setinin kaynağı (UI'da gösterilir). */
  coefficientSource: string;
  capInfo?: {
    maxAllowedAmount?: number;
    capApplied: boolean;
    reason?: string;
  };
  disclaimer: string;
}

/** Aralık → katsayı satırı (min dahil, max hariç; max yoksa üst sınır açık). */
export interface ValueLossCoefficientRange {
  min: number;
  max?: number;
  coefficient: number;
}

/** Kullanılmışlık (km / çalışma saati) tablo sınıfı. */
export interface ValueLossMileageTable {
  /** Bu tabloyu kullanan araç grupları (örn. ['A','F']). */
  groups: readonly string[];
  /** 'km' veya çalışma saati ('saat'). */
  unit: 'km' | 'saat';
  ranges: readonly ValueLossCoefficientRange[];
}

export interface ValueLossGeneralEffects {
  /** Ticari/kiralık araç etkisi (örn. -0.05). */
  commercialOrRental: number;
  /** SBM geçmiş hasar başına etki (örn. -0.03). */
  sbmPerClaim: number;
  /** SBM toplam etki alt sınırı (örn. -0.15). */
  sbmFloor: number;
  /** Kilometre alt sınıra yakınlık etkisi (örn. +0.05, ≤1000 birim yakınlıkta). */
  mileageLowerBoundProximity: number;
  /** Yakınlık eşiği (örn. 1000 km/saat). */
  proximityThreshold: number;
}

export interface ValueLossCoefficientSet {
  version: string;
  /** Katsayıların kaynağı (UI'da açıkça gösterilir). */
  source: string;
  /** Desteklenen araç grupları. */
  vehicleGroups: readonly string[];
  /** Araç yaşı → katsayı (yaş = atama yılı - model yılı). */
  ageCoefficients: readonly ValueLossCoefficientRange[];
  /** Kullanılmışlık tabloları (grup sınıfına göre). */
  mileageTables: readonly ValueLossMileageTable[];
  generalEffects: ValueLossGeneralEffects;
  /** Grup/araç türü çarpanları (örn. F → 2.5). Belirtilmeyen gruplar 1. */
  groupMultipliers: Readonly<Record<string, number>>;
  /** v5: araç TÜRÜNE bağlı çarpanlar (örn. bus → 0.5; kaynak modülde OTOBÜS bloğu). */
  vehicleTypeMultipliers?: Readonly<Record<string, number>>;
  /** Üst sınır: rayiç bedelin oranı (örn. 0.3). Yoksa cap uygulanmaz + uyarı verilir. */
  capMarketValueRatio?: number;
  /** Yuvarlama adımı (TL). */
  roundingStep: number;
  /**
   * Hasar katsayısı formül sabiti: (Σ parça katsayıları + hasarOranıYüzde × bu değer) / 100.
   * Kaynak modüldeki karşılığı 0.1'dir.
   */
  damageRatioWeight: number;
}

/**
 * v6: Katsayı seti güncelleme-izleme META VERİSİ (yalnız yerel bilgi; internet kontrolü YAPILMAZ,
 * otomatik güncelleme YOKTUR). UI'da "Katsayı Seti Bilgisi" bloğunda gösterilir.
 */
export interface ValueLossCoefficientMetadata {
  version: string;
  sourceName: string;
  sourceDate?: string;
  extractedAt?: string;
  validationDocs: readonly string[];
  knownAssumptions: readonly string[];
  updateWatchNote: string;
}

export type ValueLossCoefficientProvider =
  | { status: 'ready'; set: ValueLossCoefficientSet }
  | { status: 'missing'; reason: string };

/**
 * Yapılandırılmış parça/hasar verisi (v3'te formda YOK; sonraki görevde yapılandırılmış parça
 * listesi eklenecek). Verilmezse motor tutar üretmez; serbest metinden katsayı TÜRETİLMEZ.
 */
export interface ValueLossPartDamageData {
  /** Değişen+onarılan+boyanan parça katsayılarının toplamı (kaynak modül tablolarından). */
  totalPartCoefficient: number;
  /** Değer kaybına esas hasar (onarım) tutarı, TL. */
  damageAmount: number;
}
