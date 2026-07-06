/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v3: katsayı sağlayıcı (coefficient provider, SAF).
 *
 * Katsayılar UYDURMA DEĞİLDİR: kullanıcının sağladığı "Yeni Dönem Değer Kaybı Hesaplama Modülü
 * 01.07.2026 V_1" (SEİK) dosyasının yerel kopyasındaki tablo ve formüllerden çıkarılmıştır
 * (yaş katsayı tablosu, kullanılmışlık VLOOKUP eşlemesi, genel etki formülleri, %30 üst sınır,
 * 500 TL yukarı yuvarlama). Kaynak UI'da açıkça gösterilir; eksper doğrulaması önerilir.
 * Parça bazlı katsayı tabloları bu sürüme AKTARILMADI (yapılandırılmış parça listesi sonraki görev).
 */
import type {
  ValueLossCoefficientProvider, ValueLossCoefficientRange, ValueLossCoefficientSet, ValueLossMileageTable,
  ValueLossCoefficientMetadata
} from './value-loss-calculation-types';

/** v6: aktif setin güncelleme-izleme meta verisi (yerel; internet/otomatik güncelleme YOK). */
export const SEIK_2026_V1_COEFFICIENT_METADATA: ValueLossCoefficientMetadata = {
  version: 'seik-2026-07-v1',
  sourceName: 'Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1 (SEİK)',
  sourceDate: '2026-07-01',
  extractedAt: '2026-07-03',
  validationDocs: [
    'docs/value-loss/SEIK_COEFFICIENT_VALIDATION_V3_1.md',
    'docs/value-loss/SEIK_PART_COEFFICIENT_VALIDATION_V4_1.md',
    'docs/value-loss/VALUE_LOSS_SNAPSHOT_AND_COPY_VALIDATION_V5_1.md'
  ],
  knownAssumptions: [
    'Boya TAM değerleri J sütunundan eşlendi (modülde K sütunu boş; v4.1 nicel doğrulaması: 91/91 satırda J≥L).',
    'Hava yastığı onarım hücrelerindeki katsayı-dışı değerler (6/7/107/108/233/234) üretime alınmadı.',
    'D grubu 5001+ çalışma saati katsayısı tablo başlığından (0.70) alındı; kaynak formülde dal eksik.',
    'OTOBÜS 0.5 çarpanı araç TÜRÜNE bağlıdır; yalnız B grubu + kullanıcı seçimiyle uygulanır.'
  ],
  updateWatchNote: 'SEİK yeni modül sürümü yayınlarsa bu set elle yeniden doğrulanmalıdır; uygulama internet kontrolü ve otomatik güncelleme YAPMAZ.'
};

/** SEİK 01.07.2026 V_1 modülünden çıkarılan katsayı seti. */
export const SEIK_2026_V1_COEFFICIENT_SET: ValueLossCoefficientSet = {
  version: 'seik-2026-07-v1',
  source: 'Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1 (SEİK) — yerel kopyadan çıkarıldı',
  vehicleGroups: ['A', 'B', 'C', 'Ç', 'D', 'E', 'F'],
  // Araç yaşı (atama yılı - model yılı) → katsayı. Kaynak: Tablolar!B19:C26.
  ageCoefficients: [
    { min: 0, max: 3, coefficient: 1 },
    { min: 3, max: 5, coefficient: 0.95 },
    { min: 5, max: 8, coefficient: 0.9 },
    { min: 8, max: 11, coefficient: 0.85 },
    { min: 11, max: 14, coefficient: 0.8 },
    { min: 14, max: 17, coefficient: 0.75 },
    { min: 17, max: 20, coefficient: 0.7 },
    { min: 20, coefficient: 0.65 }
  ],
  // Kullanılmışlık tabloları. Kaynak: Tablolar!E13:R20 + Hesaplama!F9 VLOOKUP aralık eşlemesi.
  mileageTables: [
    {
      groups: ['A', 'F'],
      unit: 'km',
      ranges: [
        { min: 0, max: 20000, coefficient: 1 },
        { min: 20000, max: 50000, coefficient: 0.95 },
        { min: 50000, max: 100000, coefficient: 0.9 },
        { min: 100000, max: 150000, coefficient: 0.85 },
        { min: 150000, max: 200000, coefficient: 0.8 },
        { min: 200000, max: 300000, coefficient: 0.75 },
        { min: 300000, max: 500000, coefficient: 0.7 },
        { min: 500000, coefficient: 0.7 }
      ]
    },
    {
      groups: ['B', 'C', 'Ç', 'E'],
      unit: 'km',
      ranges: [
        { min: 0, max: 50000, coefficient: 1 },
        { min: 50000, max: 150000, coefficient: 0.95 },
        { min: 150000, max: 300000, coefficient: 0.9 },
        { min: 300000, max: 500000, coefficient: 0.85 },
        { min: 500000, max: 750000, coefficient: 0.8 },
        { min: 750000, max: 1000000, coefficient: 0.75 },
        { min: 1000000, coefficient: 0.7 }
      ]
    },
    {
      groups: ['D'],
      unit: 'saat',
      ranges: [
        { min: 0, max: 501, coefficient: 1 },
        { min: 501, max: 1001, coefficient: 0.95 },
        { min: 1001, max: 2001, coefficient: 0.9 },
        { min: 2001, max: 3001, coefficient: 0.85 },
        { min: 3001, max: 4001, coefficient: 0.8 },
        { min: 4001, max: 5001, coefficient: 0.75 },
        { min: 5001, coefficient: 0.7 }
      ]
    }
  ],
  // Kaynak: Hesaplama!I5 (ticari EVET → -0.05), I7 (SBM adet×-0.03, taban -0.15), I9 (+0.05 / ≤1000).
  generalEffects: {
    commercialOrRental: -0.05,
    sbmPerClaim: -0.03,
    sbmFloor: -0.15,
    mileageLowerBoundProximity: 0.05,
    proximityThreshold: 1000
  },
  // Kaynak: Tablolar!V2=2.5 (F/motosiklet bloğu, C1 koşulu $C$3="F").
  groupMultipliers: { F: 2.5 },
  // v5 — Kaynak: Tablolar!V6=0.5 (U6 bloğu, C1 koşulu $B$3="OTOBÜS"): araç TÜRÜ otobüs ise.
  // Motor bunu yalnız B grubu + kullanıcı seçimi 'bus' iken uygular; tür bilinmiyorsa uyarı üretir.
  vehicleTypeMultipliers: { bus: 0.5 },
  // Kaynak: Tablolar!W2 = rayiç × 0.3 (üst sınır) ve C1 yuvarlama dalları (500'e yukarı).
  capMarketValueRatio: 0.3,
  roundingStep: 500,
  // Kaynak: Hesaplama!I3 = (Σ parça katsayıları + (hasar/rayiç×100)×0.1) / 100.
  damageRatioWeight: 0.1
};

/** Aktif katsayı sağlayıcı. Set doğrulanamasaydı { status:'missing' } dönerdi (tutar üretilmez). */
export function getActiveValueLossCoefficientProvider(): ValueLossCoefficientProvider {
  return { status: 'ready', set: SEIK_2026_V1_COEFFICIENT_SET };
}

/** Aralık tablosundan katsayı bulur (min dahil, max hariç). Bulunamazsa undefined. */
export function findRangeCoefficient(ranges: readonly ValueLossCoefficientRange[], value: number): number | undefined {
  for (const r of ranges) {
    if (value >= r.min && (r.max === undefined || value < r.max)) return r.coefficient;
  }
  return undefined;
}

/** Araç grubunun kullanılmışlık tablosunu döner (yoksa undefined). */
export function getMileageTableForGroup(set: ValueLossCoefficientSet, group: string): ValueLossMileageTable | undefined {
  return set.mileageTables.find((t) => t.groups.includes(group));
}

/**
 * Kilometre değerinin, tablodaki bir aralık ALT SINIRINA yakınlığını kontrol eder
 * (uygulama esasları 3.5: en fazla 1.000 km). Kaynak modül Hesaplama!J9 ile birebir (v3.1 doğrulama):
 * - Yalnız KM tabloları: D grubu (çalışma saati) J9'da hiç yer almaz → yakınlık etkisi yok.
 * - Katsayının önceki aralıkla AYNI kaldığı sınır gerçek eşik değildir → pencere yok
 *   (örn. A/F grubunda 500.000: 0.7 → 0.7; J9'da bu pencere yalnız B/C/Ç/E için tanımlı).
 * - 0 alt sınırı için değer ≤ eşik kuralı uygulanır (tüm km gruplarında).
 */
export function isNearLowerBound(table: ValueLossMileageTable, value: number, threshold: number): boolean {
  if (table.unit !== 'km') return false;
  for (let i = 0; i < table.ranges.length; i++) {
    const r = table.ranges[i]!;
    if (r.min === 0) {
      if (value <= threshold) return true;
      continue;
    }
    const previous = table.ranges[i - 1];
    if (previous && previous.coefficient === r.coefficient) continue;
    if (value >= r.min && value <= r.min + threshold) return true;
  }
  return false;
}
