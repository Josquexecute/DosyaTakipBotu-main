/**
 * v0.6.x — AI İşçilik v3.5: Google AI Mode MANUEL parça araştırma köprüsü tipleri (SAF; ağ/scraping YOK).
 * Program yalnız prompt üretir ve kullanıcının yapıştırdığı cevabı parse eder; otomatik istek/gönderim YOKTUR.
 */
import type { LaborVehicleContext } from './labor-vehicle-context';

export type AiModeDataMode = 'masked' | 'full';

export type AiModePartKind =
  | 'orijinal' | 'oem' | 'esdeger' | 'yan_sanayi' | 'yeniden_kullanilabilir' | 'belirsiz';

export type AiModeConfidence = 'low' | 'medium' | 'high';

/** Prompt için tek satır bağlamı (AI İşçilik önizleme satırından türetilir). */
export interface AiModePartSearchRowInput {
  rowNumber: number;
  partGroup?: string;
  partName: string;
  partCode?: string;
  operationType?: 'onarim' | 'degisim' | 'belirsiz';
  salvagePrice?: number | null;
  originalPrice?: number | null;
  note?: string;
}

export interface AiModePartSearchInput {
  vehicle: LaborVehicleContext;
  row: AiModePartSearchRowInput;
  /** Araç bağlamı kaynağı (prompt notunda gösterilir). */
  vehicleSource?: 'active-file' | 'excel' | 'unknown';
}

/** AI Mode cevabından parse edilen parça kodu adayı (yalnız evidence/öneri). */
export interface AiModePartCandidate {
  partCode?: string;
  partName?: string;
  partKind?: AiModePartKind;
  compatibility?: string;
  confidence: AiModeConfidence;
  sources: string[];
  warnings: string[];
  rawEvidence: string;
}
