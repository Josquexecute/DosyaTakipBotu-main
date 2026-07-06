/**
 * v0.6.0 — EK-2 Motorlu araç dışı taban ekspertiz ücret tarifesi (sivil rizikolar, KDV hariç).
 * SAF + deterministik. HasarBotu motorlu araç odaklıdır; bu modül referans/bütünlük içindir.
 */
import type { FeeTariffBand, NonMotorRiziko, TariffResult } from './expertise-fee-types';
import { roundCurrency } from './motor-fee-tariff';

/** EK-2 kademeleri (sivil riziko baz alınır). */
export const NON_MOTOR_FEE_BANDS: readonly FeeTariffBand[] = [
  { kademe: 1, min: 0, max: 23_400, fixed: 3_000 },
  { kademe: 2, min: 23_400, max: 93_400, base: 3_000, rate: 0.055 },
  { kademe: 3, min: 93_400, max: 467_100, base: 6_850, rate: 0.04 },
  { kademe: 4, min: 467_100, max: 934_100, base: 21_798, rate: 0.035 },
  { kademe: 5, min: 934_100, max: 2_335_400, base: 38_143, rate: 0.03 },
  { kademe: 6, min: 2_335_400, max: 3_113_800, base: 80_182, rate: 0.018 },
  { kademe: 7, min: 3_113_800, max: Number.POSITIVE_INFINITY, fixed: 94_193.2, mutabakat: true }
];

/** Ticari/sınai/endüstriyel riziko çarpanı (sivil hesabın %50 fazlası). */
export const NON_MOTOR_RIZIKO_MULTIPLIERS: Readonly<Record<NonMotorRiziko, number>> = {
  'sivil': 1,
  'ticari-sinai-endustriyel': 1.5
};

/** Şehir dışı ilavesinin uygulanmadığı kademeler (6. kademe ve sonrası). */
export const NON_MOTOR_SEHIR_DISI_MAX_KADEME = 5;

/** Kapsam dışı işlemler (bu tarife ile hesaplanmaz). */
export const NON_MOTOR_KAPSAM_DISI: readonly string[] = [
  'zorunlu deprem sigortası (DASK) hasar tespiti',
  'maden çalışanları zorunlu ferdi kaza sigortası risk incelemesi'
];

/** Brüt hasar tutarına göre EK-2 temel ücretini (KDV hariç) ve kademeyi döndürür. */
export function nonMotorBaseFee(brutHasarTutari: number): TariffResult {
  if (!Number.isFinite(brutHasarTutari) || brutHasarTutari < 0) {
    return { fee: 0, kademe: 0, mutabakat: false };
  }
  const band = NON_MOTOR_FEE_BANDS.find((b) => brutHasarTutari <= b.max) ?? NON_MOTOR_FEE_BANDS[NON_MOTOR_FEE_BANDS.length - 1];
  if (!band) return { fee: 0, kademe: 0, mutabakat: false };
  const fee = band.fixed !== undefined
    ? band.fixed
    : (band.base ?? 0) + (brutHasarTutari - band.min) * (band.rate ?? 0);
  return { fee: roundCurrency(fee), kademe: band.kademe, mutabakat: band.mutabakat === true };
}
