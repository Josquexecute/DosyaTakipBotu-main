/**
 * v0.6.x — AI İşçilik v3.3/v3.4: Araç bağlamını yerel kaynaklardan (Excel hücreleri / case / manuel) çıkarır (SAF).
 * OCR/internet YOK. Bulunamazsa boş bağlam döner; mevcut iş akışı bozulmaz. Tam şasi/motor yalnız yerel kalır.
 */
import { normalizeSearch } from '../turkish';
import {
  VEHICLE_BRANDS,
  extractChassisPrefix,
  extractEngineCode,
  extractModelYear,
  extractVehicleModelFromText
} from './labor-vehicle-context-normalizer';
import type { LaborVehicleContext } from './labor-vehicle-context';

// VIN: 17 haneli alfanümerik (I/O/Q hariç). MOTOR etiketli kod; TR plaka.
const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;
const ENGINE_LABELED_RE = /MOTOR(?:\s*(?:NO|NUMARASI|KODU))?\s*[:\-]?\s*([A-Z]{2,4}\d{3,})/;
const ENGINE_UNLABELED_RE = /\b([A-Z]{2,4}\d{4,9})\b/;
const PLATE_RE = /\b\d{2}\s?[A-Z]{1,4}\s?\d{2,5}\b/;

/** Yalnız tanımlı alanları olan iki bağlamı birleştirir (a önceliklidir). */
export function mergeLaborVehicleContext(a: LaborVehicleContext = {}, b: LaborVehicleContext = {}): LaborVehicleContext {
  const out: LaborVehicleContext = {};
  const keys: (keyof LaborVehicleContext)[] = ['vehicleModel', 'modelYear', 'chassisNo', 'chassisPrefix', 'engineNo', 'engineCode', 'plate'];
  for (const key of keys) {
    const value = (a[key] ?? b[key]) as never;
    if (value !== undefined && value !== '') out[key] = value;
  }
  if (!out.chassisPrefix && out.chassisNo) out.chassisPrefix = extractChassisPrefix(out.chassisNo);
  if (!out.engineCode && out.engineNo) out.engineCode = extractEngineCode(out.engineNo);
  return out;
}

/** Case/dosya araç bilgisini (VehicleContext benzeri) LaborVehicleContext'e çevirir. */
export function caseVehicleToLaborContext(vc?: {
  plate?: string; make?: string; model?: string; modelYear?: string | number;
  chassisNo?: string; engineNo?: string;
}): LaborVehicleContext {
  if (!vc) return {};
  const out: LaborVehicleContext = {};
  const model = [vc.make, vc.model].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
  if (model) out.vehicleModel = normalizeSearch(model);
  const year = typeof vc.modelYear === 'number' ? vc.modelYear : extractModelYear(String(vc.modelYear ?? ''));
  if (typeof year === 'number') out.modelYear = year;
  if (vc.chassisNo) { out.chassisNo = vc.chassisNo; out.chassisPrefix = extractChassisPrefix(vc.chassisNo); }
  if (vc.engineNo) { out.engineNo = vc.engineNo; out.engineCode = extractEngineCode(vc.engineNo); }
  if (vc.plate) out.plate = vc.plate.trim();
  return out;
}

/**
 * Excel hücre metinlerinden araç bağlamı çıkarır (şasi/plaka/temiz marka-model-yıl/motor). base ile birleştirir (base öncelikli).
 */
export function buildLaborVehicleContext(texts: readonly string[], base: LaborVehicleContext = {}): LaborVehicleContext {
  const found: LaborVehicleContext = {};
  for (const raw of texts) {
    if (!raw) continue;
    const upper = normalizeSearch(raw);
    const vehicleLine = VIN_RE.test(upper) || /MOTOR/.test(upper) || [...VEHICLE_BRANDS].some((b) => upper.includes(b));
    if (!found.chassisNo) {
      const vin = upper.match(VIN_RE);
      if (vin) { found.chassisNo = vin[0]; found.chassisPrefix = extractChassisPrefix(vin[0]); }
    }
    if (!found.engineNo) {
      // Önce etiketli (MOTOR …), sonra yalnız araç satırında etiketsiz motor kodu (VIN token hariç).
      const labeled = upper.match(ENGINE_LABELED_RE);
      if (labeled?.[1]) {
        found.engineNo = labeled[1];
        found.engineCode = extractEngineCode(labeled[1]);
      } else if (vehicleLine) {
        const withoutVin = found.chassisNo ? upper.replace(found.chassisNo, ' ') : upper;
        const cand = withoutVin.match(ENGINE_UNLABELED_RE);
        if (cand?.[1] && cand[1].length < 14) { found.engineNo = cand[1]; found.engineCode = extractEngineCode(cand[1]); }
      }
    }
    if (!found.plate) {
      const plate = upper.match(PLATE_RE);
      if (plate) found.plate = plate[0].replace(/\s+/g, ' ').trim();
    }
    if (!found.vehicleModel) {
      const { model } = extractVehicleModelFromText(raw);
      if (model) {
        found.vehicleModel = model;
        const year = extractModelYear(upper);
        if (year) found.modelYear = year;
      }
    }
  }
  return mergeLaborVehicleContext(base, found);
}
