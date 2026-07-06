/**
 * v0.6.0 — Ekspertiz ücret hesaplayıcı (SEDDK EK-1 / EK-2).
 *
 * SAF + deterministik + yan etkisiz: ağ/dosya/AI/log YOK. Aynı girdi → aynı çıktı.
 * Tüm ücretler varsayılan KDV HARİÇ döner. Sonuç eksper yardımcısı/kontrol amaçlıdır.
 */
import type {
  FeeBreakdown, MotorFeeInput, NonMotorFeeInput, TravelInput
} from './expertise-fee-types';
import { DEFAULT_KDV_ORANI } from './expertise-fee-types';
import {
  degerKaybiFee, motorBaseFee, roundCurrency, MOTOR_KTT_FEE,
  MOTOR_JOB_TYPE_REDUCED_FACTOR, SEHIR_DISI_MULTIPLIER, VEHICLE_MULTIPLIERS
} from './motor-fee-tariff';
import {
  nonMotorBaseFee, NON_MOTOR_RIZIKO_MULTIPLIERS, NON_MOTOR_SEHIR_DISI_MAX_KADEME
} from './non-motor-fee-tariff';

export { degerKaybiFee, motorBaseFee, roundCurrency } from './motor-fee-tariff';
export { nonMotorBaseFee, NON_MOTOR_KAPSAM_DISI } from './non-motor-fee-tariff';
export {
  MOTOR_KTT_FEE, MOTOR_DEGER_KAYBI_FEE, MOTOR_DEGER_KAYBI_FEE_WITH_MADDI, VEHICLE_MULTIPLIERS
} from './motor-fee-tariff';

const TRAVEL_DISTANCE_THRESHOLD_KM = 50;
const TRAVEL_FUEL_PER_100KM = 7;
const TRAVEL_FACTOR = 1.3;

/** Yol masrafı (saf). EPDK fiyatı yoksa cost=null + missingInputs döner. */
function computeTravelCost(travel: TravelInput | undefined): { cost: number | null; missing: string[]; notes: string[] } {
  if (!travel) return { cost: null, missing: [], notes: [] };
  const notes: string[] = [];
  const km = Number(travel.km);
  if (!Number.isFinite(km) || km <= TRAVEL_DISTANCE_THRESHOLD_KM) {
    return { cost: 0, missing: [], notes: ['Ulaşım 50 km altı: yol masrafı yok.'] };
  }
  if (travel.epdkFuelPrice === undefined || !Number.isFinite(travel.epdkFuelPrice)) {
    return { cost: null, missing: ['epdkFuelPrice'], notes: ['EPDK akaryakıt fiyatı yok; yol masrafı hesaplanamadı.'] };
  }
  const fileCount = travel.fileCount && travel.fileCount > 0 ? travel.fileCount : 1;
  const fuel = (km * TRAVEL_FUEL_PER_100KM / 100) * travel.epdkFuelPrice * TRAVEL_FACTOR / fileCount;
  const extras = (travel.highway ?? 0) + (travel.bridge ?? 0) + (travel.ferry ?? 0) + (travel.parking ?? 0);
  return { cost: roundCurrency(fuel + extras), missing: [], notes };
}

/** EK-1 motorlu araç ekspertiz ücreti. */
export function calculateMotorExpertiseFee(input: MotorFeeInput): FeeBreakdown {
  const missingInputs: string[] = [];
  const notes: string[] = [];
  const amount = Number(input.brutHasarTutari);

  if (!Number.isFinite(amount) || amount < 0) {
    missingInputs.push('brutHasarTutari');
    return emptyBreakdown(missingInputs, ['Geçerli brüt hasar tutarı gerekli; hesap yapılmadı.']);
  }

  const tariff = motorBaseFee(amount);
  const vehicleClass = input.vehicleClass ?? 'binek-hafif-ticari-motosiklet';
  const jobType = input.jobType ?? 'standart';
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleClass];
  const jobTypeFactor = jobType === 'standart' ? 1 : MOTOR_JOB_TYPE_REDUCED_FACTOR;

  let ekspertiz = roundCurrency(tariff.fee * vehicleMultiplier);
  ekspertiz = roundCurrency(ekspertiz * jobTypeFactor);
  if (input.sehirDisi === true) ekspertiz = roundCurrency(ekspertiz * SEHIR_DISI_MULTIPLIER);

  const dk = degerKaybiFee(input.degerKaybi ?? 'yok');
  const ktt = input.kttTanzim === true ? MOTOR_KTT_FEE : 0;
  const travel = computeTravelCost(input.travel);
  for (const m of travel.missing) missingInputs.push(m);
  for (const n of travel.notes) notes.push(n);

  const subtotal = roundCurrency(ekspertiz + dk + ktt + (travel.cost ?? 0));
  const kdvDahil = input.kdvDahil === true;
  const kdvOrani = input.kdvOrani !== undefined && input.kdvOrani >= 0 ? input.kdvOrani : DEFAULT_KDV_ORANI;
  const kdv = kdvDahil ? roundCurrency(subtotal * kdvOrani) : 0;
  if (!kdvDahil) notes.push('Tutar KDV hariçtir.');

  return {
    baseFee: tariff.fee,
    kademe: tariff.kademe,
    vehicleMultiplier,
    jobTypeFactor,
    ekspertizUcreti: ekspertiz,
    degerKaybiFee: dk,
    kttFee: ktt,
    travelCost: travel.cost,
    subtotalKdvHaric: subtotal,
    kdv,
    total: roundCurrency(subtotal + kdv),
    mutabakatGerekli: tariff.mutabakat,
    missingInputs,
    notes
  };
}

/** EK-2 motorlu araç dışı ekspertiz ücreti. */
export function calculateNonMotorExpertiseFee(input: NonMotorFeeInput): FeeBreakdown {
  const missingInputs: string[] = [];
  const notes: string[] = [];
  const amount = Number(input.brutHasarTutari);

  if (!Number.isFinite(amount) || amount < 0) {
    missingInputs.push('brutHasarTutari');
    return emptyBreakdown(missingInputs, ['Geçerli brüt hasar tutarı gerekli; hesap yapılmadı.']);
  }

  const tariff = nonMotorBaseFee(amount);
  const riziko = input.riziko ?? 'sivil';
  const jobType = input.jobType ?? 'standart';
  const rizikoMultiplier = NON_MOTOR_RIZIKO_MULTIPLIERS[riziko];
  const jobTypeFactor = jobType === 'standart' ? 1 : MOTOR_JOB_TYPE_REDUCED_FACTOR;

  let ekspertiz = roundCurrency(tariff.fee * rizikoMultiplier);
  ekspertiz = roundCurrency(ekspertiz * jobTypeFactor);
  if (input.sehirDisi === true) {
    if (tariff.kademe <= NON_MOTOR_SEHIR_DISI_MAX_KADEME) {
      ekspertiz = roundCurrency(ekspertiz * SEHIR_DISI_MULTIPLIER);
    } else {
      notes.push('Şehir dışı ilavesi 6. kademe ve sonrasına uygulanmaz.');
    }
  }

  const travel = computeTravelCost(input.travel);
  for (const m of travel.missing) missingInputs.push(m);
  for (const n of travel.notes) notes.push(n);

  const subtotal = roundCurrency(ekspertiz + (travel.cost ?? 0));
  const kdvDahil = input.kdvDahil === true;
  const kdvOrani = input.kdvOrani !== undefined && input.kdvOrani >= 0 ? input.kdvOrani : DEFAULT_KDV_ORANI;
  const kdv = kdvDahil ? roundCurrency(subtotal * kdvOrani) : 0;
  if (!kdvDahil) notes.push('Tutar KDV hariçtir.');
  if (tariff.mutabakat) notes.push('Üst kademe: belirtilen tutardan az olmamak üzere mutabakatla.');

  return {
    baseFee: tariff.fee,
    kademe: tariff.kademe,
    vehicleMultiplier: rizikoMultiplier,
    jobTypeFactor,
    ekspertizUcreti: ekspertiz,
    degerKaybiFee: 0,
    kttFee: 0,
    travelCost: travel.cost,
    subtotalKdvHaric: subtotal,
    kdv,
    total: roundCurrency(subtotal + kdv),
    mutabakatGerekli: tariff.mutabakat,
    missingInputs,
    notes
  };
}

function emptyBreakdown(missingInputs: string[], notes: string[]): FeeBreakdown {
  return {
    baseFee: 0, kademe: 0, vehicleMultiplier: 1, jobTypeFactor: 1, ekspertizUcreti: 0,
    degerKaybiFee: 0, kttFee: 0, travelCost: null, subtotalKdvHaric: 0, kdv: 0, total: 0,
    mutabakatGerekli: false, missingInputs, notes
  };
}
