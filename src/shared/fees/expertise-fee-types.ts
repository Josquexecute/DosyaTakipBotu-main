/**
 * v0.6.0 — Ekspertiz ücret hesabı tipleri (SEDDK EK-1 / EK-2 taban tarifeleri).
 * SAF modül: ağ/dosya/AI yok. Tüm ücretler aksi belirtilmedikçe KDV HARİÇ hesaplanır.
 */

/** EK-1 araç grubu. */
export type VehicleClass = 'binek-hafif-ticari-motosiklet' | 'agir-vasita' | 'is-makinesi';

/** Ekspertiz iş tipi (temel ücrete uygulanan oran). */
export type FeeJobType = 'standart' | 'uzaktan-ekspertiz' | 'deger-tespiti';

/** Değer kaybı ücreti modu. */
export type DegerKaybiMode = 'yok' | 'tek-basina' | 'maddi-hasarla-birlikte';

/** EK-2 riziko türü. */
export type NonMotorRiziko = 'sivil' | 'ticari-sinai-endustriyel';

/** Bir tarife kademesi. `fixed` doluysa sabit ücret; değilse base + (tutar-min)*rate. */
export interface FeeTariffBand {
  kademe: number;
  min: number;
  max: number;
  fixed?: number;
  base?: number;
  rate?: number;
  /** 7. kademe gibi "mutabakatla, X TL'den az olmamak" durumları. */
  mutabakat?: boolean;
}

export interface TariffResult {
  fee: number;
  kademe: number;
  /** Mutabakat gereken üst kademe (ör. EK-2 7. kademe). */
  mutabakat: boolean;
}

/** Yol masrafı girdisi (opsiyonel). */
export interface TravelInput {
  km: number;
  epdkFuelPrice?: number;
  fileCount?: number;
  highway?: number;
  bridge?: number;
  ferry?: number;
  parking?: number;
}

export interface MotorFeeInput {
  brutHasarTutari: number;
  vehicleClass?: VehicleClass;
  jobType?: FeeJobType;
  sehirDisi?: boolean;
  degerKaybi?: DegerKaybiMode;
  kttTanzim?: boolean;
  kdvDahil?: boolean;
  kdvOrani?: number;
  travel?: TravelInput;
}

export interface NonMotorFeeInput {
  brutHasarTutari: number;
  riziko?: NonMotorRiziko;
  jobType?: 'standart' | 'uzaktan-ekspertiz';
  sehirDisi?: boolean;
  kdvDahil?: boolean;
  kdvOrani?: number;
  travel?: TravelInput;
}

export interface FeeBreakdown {
  baseFee: number;
  kademe: number;
  vehicleMultiplier: number;
  jobTypeFactor: number;
  ekspertizUcreti: number;
  degerKaybiFee: number;
  kttFee: number;
  travelCost: number | null;
  subtotalKdvHaric: number;
  kdv: number;
  total: number;
  mutabakatGerekli: boolean;
  missingInputs: readonly string[];
  notes: readonly string[];
}

export const DEFAULT_KDV_ORANI = 0.20;
