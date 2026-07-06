/**
 * v0.6.0 — EK-1 Motorlu araç taban ekspertiz ücret tarifesi (KDV hariç).
 * SAF + deterministik: ağ/dosya/AI yok. Sayılar SEDDK EK-1 tarifesinden alınmıştır.
 */
import type { DegerKaybiMode, FeeTariffBand, TariffResult, VehicleClass } from './expertise-fee-types';

/** Para birimini 2 ondalığa yuvarlar (kayan nokta sapmasını giderir). */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** EK-1 kademeleri (binek/hafif ticari/motosiklet baz alınır). */
export const MOTOR_FEE_BANDS: readonly FeeTariffBand[] = [
  { kademe: 1, min: 0, max: 93_400, fixed: 2_400 },
  { kademe: 2, min: 93_400, max: 186_800, base: 2_400, rate: 0.025 },
  { kademe: 3, min: 186_800, max: 280_200, base: 4_735, rate: 0.022 },
  { kademe: 4, min: 280_200, max: 778_500, base: 6_789.8, rate: 0.02 },
  { kademe: 5, min: 778_500, max: 3_113_800, base: 16_755.8, rate: 0.0021 },
  { kademe: 6, min: 3_113_800, max: Number.POSITIVE_INFINITY, fixed: 21_659.93 }
];

/** Araç grubu çarpanları (binek=1, ağır vasıta=%50 fazla, iş makinesi=%120 fazla). */
export const VEHICLE_MULTIPLIERS: Readonly<Record<VehicleClass, number>> = {
  'binek-hafif-ticari-motosiklet': 1,
  'agir-vasita': 1.5,
  'is-makinesi': 2.2
};

/** Uzaktan ekspertiz ve değer tespiti için temel ücret çarpanı (2/3). */
export const MOTOR_JOB_TYPE_REDUCED_FACTOR = 2 / 3;
export const SEHIR_DISI_MULTIPLIER = 1.25;

export const MOTOR_DEGER_KAYBI_FEE = 1_450;
export const MOTOR_DEGER_KAYBI_FEE_WITH_MADDI = 725;
export const MOTOR_KTT_FEE = 2_100;

/** Brüt hasar tutarına göre EK-1 temel ücretini (KDV hariç) ve kademeyi döndürür. */
export function motorBaseFee(brutHasarTutari: number): TariffResult {
  if (!Number.isFinite(brutHasarTutari) || brutHasarTutari < 0) {
    return { fee: 0, kademe: 0, mutabakat: false };
  }
  const band = MOTOR_FEE_BANDS.find((b) => brutHasarTutari <= b.max) ?? MOTOR_FEE_BANDS[MOTOR_FEE_BANDS.length - 1];
  if (!band) return { fee: 0, kademe: 0, mutabakat: false };
  const fee = band.fixed !== undefined
    ? band.fixed
    : (band.base ?? 0) + (brutHasarTutari - band.min) * (band.rate ?? 0);
  return { fee: roundCurrency(fee), kademe: band.kademe, mutabakat: band.mutabakat === true };
}

/** Değer kaybı ücreti (TL). Tek başına 1.450; maddi hasarla birlikte 725; yoksa 0. */
export function degerKaybiFee(mode: DegerKaybiMode): number {
  if (mode === 'tek-basina') return MOTOR_DEGER_KAYBI_FEE;
  if (mode === 'maddi-hasarla-birlikte') return MOTOR_DEGER_KAYBI_FEE_WITH_MADDI;
  return 0;
}
