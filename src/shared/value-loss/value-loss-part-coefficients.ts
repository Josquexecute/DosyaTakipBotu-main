/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v4: SEİK parça katsayı tablosu (SAF).
 *
 * Katsayılar UYDURMA DEĞİLDİR: "Yeni Dönem Değer Kaybı Hesaplama Modülü 01.07.2026 V_1" (SEİK)
 * Tablolar!B34:L295 aralığından hücre hücre aktarılmıştır (v3.1 doğrulama yöntemiyle).
 * Sütun eşlemesi: C=değişen, F/G/H=onarılan hafif/orta/ağır, J=boya TAM, L=boya LOKAL.
 * NOT (belgelendi): Hesaplama sayfası TAM için K sütununa başvurur ancak modülde K sütunu
 * tamamen BOŞTUR; TAM değerleri J sütunundadır (tüm satırlarda J ≈ 2×L deseni) → J=TAM eşlendi.
 * Hava yastığı onarım hücrelerindeki değerler (6/7/107/108/233/234) katsayı deseni dışında
 * olduğundan AKTARILMADI (çözülemez → kontrol gerekir). Aynı ada sahip tekrar satırlarda kaynak
 * modülün VLOOKUP davranışına uygun olarak İLK satır esas alındı. C ve Ç grupları ortak bloğu
 * kullanır (Hesaplama!C16 formülü). Satır 264-265 (TİCARİ VE CABRİO yan panel) esaslar 3.7
 * gereği A grubu adlarıyla eklendi.
 */
import type { ValueLossPartOperation, ValueLossRepairSeverity, ValueLossPaintType } from './value-loss-part-input-types';

export interface ValueLossPartCoefficientEntry {
  vehicleGroup: 'A' | 'B' | 'C' | 'Ç' | 'D' | 'E' | 'F';
  partName: string;
  normalizedPartName: string;
  changedCoefficient?: number;
  repairedLightCoefficient?: number;
  repairedMediumCoefficient?: number;
  repairedHeavyCoefficient?: number;
  paintedFullCoefficient?: number;
  paintedLocalCoefficient?: number;
  sourceSheet: 'Tablolar';
  sourceRange: string;
  sourceRow?: number;
}

/** Parça adını karşılaştırma için normalize eder (TR büyük harf + boşluk sadeleştirme). */
export function normalizeValueLossPartName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR');
}

const u = undefined;
type Row = readonly [string, string, number | undefined, number | undefined, number | undefined, number | undefined, number | undefined, number | undefined, number];

// [grup, parça adı, değişen(C), hafif(F), orta(G), ağır(H), boyaTAM(J), boyaLOKAL(L), kaynak satır]
const ROWS: readonly Row[] = [
  ['A', 'TAVAN SACI', 5, 1, 1.5, 2, 3, 1.5, 34],
  ['A', 'ÖN PANEL (SAC)', 1, 0.5, 1, 1.5, 0.5, 0.25, 35],
  ['A', 'SAĞ ÖN ÇAMURLUK (SAC)', 1, 0.5, 0.75, 1, 1, 0.5, 36],
  ['A', 'SOL ÖN ÇAMURLUK (SAC)', 1, 0.5, 0.75, 1, 1, 0.5, 37],
  ['A', 'SAĞ ÖN PODYA SACI', 2, 0.5, 0.75, 1, 0.5, 0.25, 38],
  ['A', 'SOL ÖN PODYA SACI', 2, 0.5, 0.75, 1, 0.5, 0.25, 39],
  ['A', 'SAĞ ŞASE ÖN', 3, 1, 1.5, 2, 0.5, 0.25, 40],
  ['A', 'SOL ŞASE ÖN', 3, 1, 1.5, 2, 0.5, 0.25, 41],
  ['A', 'GÖĞÜS SACI', 4, 1, 1.5, 2, 0.5, 0.25, 42],
  ['A', 'MOTOR KAPUTU', 1, 0.5, 0.75, 1, 1, 0.5, 43],
  ['A', 'SAĞ ÖN KAPI (KAPI SACI)', 1, 0.5, 0.75, 1, 1, 0.5, 44],
  ['A', 'SOL ÖN KAPI (KAPI SACI)', 1, 0.5, 0.75, 1, 1, 0.5, 45],
  ['A', 'SAĞ ARKA KAPI (KAPI SACI)', 1, 0.5, 0.75, 1, 1, 0.5, 46],
  ['A', 'SOL ARKA KAPI (KAPI SACI)', 1, 0.5, 0.75, 1, 1, 0.5, 47],
  ['A', 'SAĞ MARŞPİYEL (SAC)', 2, 0.5, 0.75, 1, 0.5, 0.25, 48],
  ['A', 'SOL MARŞPİYEL (SAC)', 2, 0.5, 0.75, 1, 0.5, 0.25, 49],
  ['A', 'A DİREĞİ SAĞ', 1, 0.5, 0.75, 1, 0.5, 0.25, 50],
  ['A', 'B DİREĞİ SAĞ', 2, 0.5, 0.75, 1, 0.5, 0.25, 51],
  ['A', 'A DİREĞİ SOL', 1, 0.5, 0.75, 1, 0.5, 0.25, 52],
  ['A', 'B DİREĞİ SOL', 2, 0.5, 0.75, 1, 0.5, 0.25, 53],
  ['A', 'BAGAJ KAPAĞI', 1, 0.5, 1, 1.5, 1, 0.5, 54],
  ['A', 'ARKA PANEL', 2, 0.5, 1, 1.5, 1, 0.5, 55],
  ['A', 'SAĞ ARKA ÇAMURLUK', 4, 0.5, 1, 1.5, 1, 0.5, 56],
  ['A', 'SOL ARKA ÇAMURLUK', 4, 0.5, 1, 1.5, 1, 0.5, 57],
  ['A', 'HAVUZ SACI', 3, 0.5, 1, 1.5, 0.5, 0.25, 58],
  ['A', 'SAĞ ŞASE ARKA', 3, 1, 1.5, 2, 0.5, 0.25, 59],
  ['A', 'SOL ŞASE ARKA', 3, 1, 1.5, 2, 0.5, 0.25, 60],
  ['A', 'MOTOR TRAVERSİ /DİNGİL', 1, 1, 1.5, 2, 0, 0, 61],
  ['A', 'YOLCU HAVA YASTIĞI', 2, u, u, u, u, u, 62],
  ['A', 'SÜRÜCÜ HAVA YASTIĞI', 2, u, u, u, u, u, 63],
  ['A', 'SAĞ YAN HAVA YASTIĞI', 2, u, u, u, u, u, 64],
  ['A', 'SOL YAN HAVA YASTIĞI', 2, u, u, u, u, u, 65],
  ['B', 'MOTOR KAPUTU', 1.5, 0.5, 0.75, 1, 1, 0.5, 70],
  ['B', 'ÖN PANEL (SAC)', 0.5, 0.55, 0.65, 0.75, 0.5, 0.25, 71],
  ['B', 'YAN KAPAK 1', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 72],
  ['B', 'YAN KAPAK 2', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 73],
  ['B', 'YAN KAPAK 3', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 74],
  ['B', 'YAN KAPAK 4', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 75],
  ['B', 'YAN KAPAK 5', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 76],
  ['B', 'YAN KAPAK 6', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 77],
  ['B', 'YAN KAPAK 7', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 78],
  ['B', 'YAN KAPAK 8', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 79],
  ['B', 'ANA ŞASE', 6, 1, 2, 3, 0, 0, 80],
  ['B', 'GÖĞÜS SACI', 1, 0.5, 0.75, 1, 1, 0.5, 81],
  ['B', 'SAĞ YAN PANEL SACI', 1, 0.5, 0.75, 1, 3, 1.5, 82],
  ['B', 'SOL YAN PANEL SACI', 1, 0.5, 0.75, 1, 3, 1.5, 83],
  ['B', 'SAĞ ÖN KAPI', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 84],
  ['B', 'SAĞ ARKA KAPI', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 85],
  ['B', 'SOL ÖN KAPI', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 86],
  ['B', 'SOL ARKA KAPI', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 87],
  ['B', 'SAĞ PODYA SACI', 0.25, 0.25, 0.5, 0.75, 0.5, 0.5, 88],
  ['B', 'SOL PODYA SACI', 0.25, 0.25, 0.5, 0.75, 0.5, 0.5, 89],
  ['B', 'BAGAJ KAPAĞI SAĞ', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 90],
  ['B', 'BAGAJ KAPAĞI SOL', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 91],
  ['B', 'BAGAJ KAPAĞI (TEK)', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 92],
  ['B', 'ARKA PANEL', 0.75, 0.5, 0.75, 1, 1, 0.5, 93],
  ['B', 'SAĞ BOMBE SACI', 0.75, 0.25, 0.5, 0.75, 1, 0.5, 94],
  ['B', 'SOL BOMBE SACI', 0.75, 0.25, 0.5, 0.75, 1, 0.5, 95],
  ['B', 'SAĞ MARŞPİYEL SACI', 0.75, 0.25, 0.5, 0.75, 1, 0.5, 96],
  ['B', 'SOL MARŞPİYEL SACI', 0.75, 0.25, 0.5, 0.75, 1, 0.5, 97],
  ['B', 'ARKA DUVAR PANELİ', 1, 0.5, 0.75, 1, 2, 1, 98],
  ['B', 'SOL ÖN ÇAMURLUK (SAC)', 0.25, 0.25, 0.5, 0.75, 0.25, 0.25, 99],
  ['B', 'SAĞ ÖN ÇAMURLUK (SAC)', 0.25, 0.25, 0.5, 0.75, 0.25, 0.25, 100],
  ['B', 'ÇAMURLUK (SAC-OTOBÜS)', 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 101],
  ['B', 'TABAN SACI', 1, 0.5, 0.75, 1, 0.25, 0, 103],
  ['B', 'TAVAN SACI', 1, 0.5, 0.75, 1, 1, 0.5, 107],
  ['B', 'ÖN İSKELET', 2, 1, 1.5, 2, 0, 0, 111],
  ['B', 'ARKA İSKELET', 2, 1, 1.5, 2, 0, 0, 112],
  ['B', 'YAN İSKELET', 2, 1, 1.5, 2, 0, 0, 113],
  ['B', 'SÜRÜCÜ AIRBAG', 1, u, u, u, u, u, 114],
  ['B', 'YOLCU AIRBAG', 1, u, u, u, u, u, 115],
  ['C', 'ANA ŞASE', 2.5, 0.5, 1, 1.5, 0, 0, 119],
  ['C', 'MOTOR KAPUTU (SAC)', 0.25, 0.25, 0.5, 0.75, 0.5, 0.25, 120],
  ['C', 'GÖĞÜS SACI', 1, 0.5, 0.75, 1, 0.5, 0.25, 121],
  ['C', 'SOL ÖN ÇAMURLUK (SAC)', 0.2, 0.25, 0.5, 0.75, 0.25, 0.15, 122],
  ['C', 'SAĞ ÖN ÇAMURLUK (SAC)', 0.2, 0.25, 0.5, 0.75, 0.25, 0.15, 123],
  ['C', 'SOL ÖN DİREK SACI', 0.5, 0.25, 0.5, 0.75, 0.4, 0.2, 124],
  ['C', 'SAĞ ÖN DİREK SACI', 0.5, 0.25, 0.5, 0.75, 0.4, 0.2, 125],
  ['C', 'TAVAN SACI', 2, 0.5, 0.75, 1, 1, 0.5, 126],
  ['C', 'SAĞ YAN PANEL', 1, 0.25, 0.5, 0.75, 0.75, 0.4, 127],
  ['C', 'SOL YAN PANEL', 1, 0.25, 0.5, 0.75, 0.75, 0.4, 128],
  ['C', 'SAĞ ÖN KAPI', 0.5, 0.5, 0.75, 1, 0.5, 0.25, 129],
  ['C', 'SOL ÖN KAPI', 0.5, 0.5, 0.75, 1, 0.5, 0.25, 130],
  ['C', 'SIRT SACI', 2, 0.5, 0.75, 1, 1, 0.5, 131],
  ['C', 'KABİN (TRİMSİZ)', 1, 0, 0, 0, 4, 0, 132],
  ['C', 'TÜNEL / TABAN SACI', 2, 0.5, 0.75, 1, 0.4, 0.2, 133],
  ['C', 'SAĞ ARKA KAPI', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 134],
  ['C', 'SOL ARKA KAPI', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 135],
  ['C', 'SAĞ PODYA SACI', 0.25, 0.25, 0.5, 0.75, 0.5, 0.5, 136],
  ['C', 'SOL PODYA SACI', 0.25, 0.25, 0.5, 0.75, 0.5, 0.5, 137],
  ['C', 'BAGAJ KAPAĞI SAĞ', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 138],
  ['C', 'BAGAJ KAPAĞI SOL', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 139],
  ['C', 'BAGAJ KAPAĞI (TEK)', 0.5, 0.25, 0.5, 0.75, 1, 0.5, 140],
  ['C', 'ARKA PANEL', 0.75, 0.5, 0.75, 1, 1, 0.5, 141],
  ['C', 'SAĞ BOMBE SACI', 0.75, 0.25, 0.5, 0.75, 1, 0.5, 142],
  ['C', 'SOL BOMBE SACI', 0.75, 0.25, 0.5, 0.75, 1, 0.5, 143],
  ['C', 'SÜRÜCÜ AIRBAG', 0.5, 0, 0, 0, 0, 0, 144],
  ['C', 'YOLCU AIRBAG', 0.5, 0, 0, 0, 0, 0, 145],
  ['C', 'ARKA DİNGİL/KOVAN', 0.5, 0, 0, 0, 0, 0, 146],
  ['D', 'KABİN', 2, 0.25, 0.5, 1, 0.25, 0, 155],
  ['D', 'MOTOR KAPUTU (SAC)', 0.5, 0.25, 0.5, 0.75, 0.25, 0, 156],
  ['D', 'SAĞ ÇAMURLUK (SAC)', 0.5, 0.25, 0.5, 0.75, 0.25, 0, 157],
  ['D', 'SOL ÇAMURLUK (SAC)', 0.5, 0.25, 0.5, 0.75, 0.25, 0, 158],
  ['D', 'ŞASE', 2, 0.5, 0.75, 1, 0.25, 0, 159],
  ['D', 'TAVAN SACI', 0.5, 0.25, 0.5, 0.75, 0.25, 0, 160],
  ['D', 'ARKA KOVAN', 0.5, 0, 0, 0, 0, 0, 161],
  ['D', 'KAPAK SAC', 0.5, 0.25, 0.5, 0.75, 0.25, 0, 162],
  ['E', 'TAVAN', 2, 0.5, 1, 1.5, 0.5, 0.25, 192],
  ['E', 'ŞASE', 3, 1, 1.5, 2, 0, 0, 193],
  ['E', 'SAĞ YAN PANEL', 2, 0.5, 1, 1.5, 0.5, 0.25, 194],
  ['E', 'SOL YAN PANEL', 2, 0.5, 1, 1.5, 0.5, 0.25, 195],
  ['E', 'ARKA SOL KAPAK', 0.75, 0.25, 0.5, 0.75, 0.25, 0, 196],
  ['E', 'ARKA SAĞ KAPAK', 0.75, 0.25, 0.5, 0.75, 0.25, 0, 197],
  ['E', 'ÖN DUVAR', 0.75, 0.25, 0.5, 0.75, 0.25, 0, 198],
  ['F', 'YAKIT DEPOSU', 2, 0.5, 1, 1.5, 1, 0, 228],
  ['F', 'GİDON', 1, 0, 0, 0, 0, 0, 229],
  ['F', 'KAFA DEMİRİ', 1, 0, 0, 0, 0, 0, 230],
  ['F', 'ŞASE', 3, 1, 1.5, 2, 0, 0, 231],
  ['A', 'SOL YAN PANEL (TİCARİ VE CABRİO)', 4.5, 1, 1.5, 2, 1.5, 0.75, 264],
  ['A', 'SAĞ YAN PANEL (TİCARİ VE CABRİO)', 4.5, 1, 1.5, 2, 1.5, 0.75, 265]
];

function toEntry(row: Row): ValueLossPartCoefficientEntry {
  const [group, partName, changed, rl, rm, rh, pf, pl, sourceRow] = row;
  const out: ValueLossPartCoefficientEntry = {
    vehicleGroup: group as ValueLossPartCoefficientEntry['vehicleGroup'],
    partName,
    normalizedPartName: normalizeValueLossPartName(partName),
    sourceSheet: 'Tablolar',
    sourceRange: `Tablolar!B${sourceRow}:L${sourceRow}`,
    sourceRow
  };
  if (changed !== undefined) out.changedCoefficient = changed;
  if (rl !== undefined) out.repairedLightCoefficient = rl;
  if (rm !== undefined) out.repairedMediumCoefficient = rm;
  if (rh !== undefined) out.repairedHeavyCoefficient = rh;
  if (pf !== undefined) out.paintedFullCoefficient = pf;
  if (pl !== undefined) out.paintedLocalCoefficient = pl;
  return out;
}

/** Tüm SEİK parça katsayı kayıtları (salt-okunur). */
export const VALUE_LOSS_PART_COEFFICIENTS: readonly ValueLossPartCoefficientEntry[] = ROWS.map(toEntry);

/** Ç grubu C bloğunu kullanır (Hesaplama!C16: IF(OR(C3="C",C3="Ç") ...)). */
function lookupGroup(group: string): string {
  return group === 'Ç' ? 'C' : group;
}

/** Bilinen parça+grup kaydını bulur (tam/normalize eşleşme; tahmin YOK). */
export function findPartCoefficientEntry(vehicleGroup: string, partName: string): ValueLossPartCoefficientEntry | undefined {
  const g = lookupGroup(vehicleGroup);
  const n = normalizeValueLossPartName(partName);
  return VALUE_LOSS_PART_COEFFICIENTS.find((e) => e.vehicleGroup === g && e.normalizedPartName === n);
}

/** Grup için bilinen parça adları (UI datalist için). */
export function listPartNamesForGroup(vehicleGroup: string): readonly string[] {
  const g = lookupGroup(vehicleGroup);
  return VALUE_LOSS_PART_COEFFICIENTS.filter((e) => e.vehicleGroup === g).map((e) => e.partName);
}

export type { ValueLossPartOperation, ValueLossRepairSeverity, ValueLossPaintType };
