/**
 * v0.6.x — AI İşçilik v3.3: Araç bağlamı normalize/çıkarım yardımcıları (SAF; ağ/dosya yok).
 * Örnek: WVWZZZ16ZHM026138 → prefix WVWZZZ16ZHM • CYV536292 → kod CYV • "... 2017" → 2017.
 */
import { normalizeSearch } from '../turkish';

/** Tanınan marka anahtar kelimeleri (normalize edilmiş, BÜYÜK harf). */
export const VEHICLE_BRANDS = new Set([
  'VOLKSWAGEN', 'VW', 'RENAULT', 'FIAT', 'FORD', 'OPEL', 'TOYOTA', 'BMW', 'MERCEDES', 'AUDI',
  'HYUNDAI', 'PEUGEOT', 'CITROEN', 'DACIA', 'SKODA', 'SEAT', 'HONDA', 'NISSAN', 'KIA',
  'VOLVO', 'MAZDA', 'SUZUKI', 'CHEVROLET', 'DODGE', 'JEEP', 'TOFAS'
]);

// Model token'ı sayılmayan gürültü: yıl / VIN-uzunluk / etiket / motor-şasi kodu / uzun sayı.
const MODEL_STOP_TOKENS = new Set(['SASI', 'SASE', 'SASIS', 'MOTOR', 'PLAKA', 'VIN', 'NO', 'NUMARA', 'NUMARASI', 'KODU', 'ARAC', 'MODEL', 'MARKA', 'TIP', 'RENK']);

function isModelNoiseToken(t: string): boolean {
  if (t.length >= 14) return true;                 // VIN benzeri
  if (/^(19[89]\d|20[0-4]\d)$/.test(t)) return true; // model yılı
  if (MODEL_STOP_TOKENS.has(t)) return true;        // etiket
  if (/^[A-Z]{2,4}\d{3,}$/.test(t)) return true;    // motor/şasi kodu (ör. CYV536292)
  if (/^\d{4,}$/.test(t)) return true;              // uzun saf sayı
  return false;
}

/** Araç modelini normalize eder (BÜYÜK harf + TR katlama + tek boşluk). */
export function normalizeVehicleModel(raw?: string): string {
  return raw ? normalizeSearch(raw) : '';
}

/**
 * Metinden TEMİZ araç modeli çıkarır: marka + sonraki anlamlı 1-5 token; VIN/motor/plaka/yıl/etiket dışlanır.
 * Marka yoksa veya model güveni düşükse boş döner (yanlış model üretmektense boş tercih edilir).
 */
export function extractVehicleModelFromText(text?: string): { model: string; lowConfidence: boolean } {
  if (!text) return { model: '', lowConfidence: false };
  const tokens = normalizeSearch(text).split(' ').filter(Boolean);
  const brandIdx = tokens.findIndex((t) => VEHICLE_BRANDS.has(t));
  if (brandIdx < 0) return { model: '', lowConfidence: false };
  const collected = [tokens[brandIdx]!];
  for (let i = brandIdx + 1; i < tokens.length && collected.length < 6; i++) {
    const t = tokens[i]!;
    if (isModelNoiseToken(t)) break;
    collected.push(t);
  }
  // Yalnız marka bulunduysa model güveni düşük (marka tek başına model değildir).
  return { model: collected.join(' '), lowConfidence: collected.length === 1 };
}

/** Şasi numarasının ilk 11 hanesini (WMI+VDS) önek olarak döner; kısa/yoksa boş. */
export function extractChassisPrefix(chassisNo?: string): string {
  if (!chassisNo) return '';
  const clean = chassisNo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length < 6) return '';
  return clean.slice(0, 11);
}

/** Motor numarasının baştaki harf bloğunu (motor kodu) döner; örn. CYV536292 → CYV. */
export function extractEngineCode(engineNo?: string): string {
  if (!engineNo) return '';
  const match = engineNo.trim().toUpperCase().match(/^[A-Z]{2,4}/);
  return match ? match[0] : '';
}

/** Metinden makul model yılı (1980..gelecek yıl) çıkarır; birden çoksa sonuncuyu döner. */
export function extractModelYear(text?: string): number | undefined {
  if (!text) return undefined;
  const matches = text.match(/\b(19[89]\d|20[0-4]\d)\b/g);
  if (!matches) return undefined;
  const maxYear = new Date().getFullYear() + 1;
  const candidates = matches.map(Number).filter((y) => y >= 1980 && y <= maxYear);
  return candidates.length ? candidates[candidates.length - 1] : undefined;
}
