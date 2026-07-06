/**
 * v0.6.x — AI İşçilik v3: Onarım/değişim ekonomi değerlendirmesi (SAF; ağ/dosya/fiyat sorgusu yok).
 * KURAL: "Onarım pahalı diye otomatik reddedilmez." Değişim toplamı = sahiplenme bedeli +
 * sök/tak + boya + sarf + kalibrasyon ek işçilikleri. Sahiplenme bedeli yüksekse onarım işçiliği
 * yüksek görünse bile makul olabilir. Karar değil; eksper yardımcısı gerekçesi üretir.
 */
import type { OperationType } from './operation-type-detector';

export type EconomicVerdict = 'onarim-ekonomik' | 'degisim-uygun' | 'kontrol-gerekli';

export interface RepairVsReplaceInput {
  operationType: OperationType;
  /** F = Parça Sahiplenme Bedeli. */
  salvagePrice: number | null;
  /** G = Parça Orijinal Bedeli. */
  originalPrice: number | null;
  /** Bu satıra dağıtılan onarım işçiliği toplamı (varsa). */
  repairLaborTotal?: number | null;
}

export interface RepairVsReplaceEvaluation {
  verdict: EconomicVerdict;
  /** Değişim toplam tahmini (sahiplenme + ek işçilik kalemleri); hesaplanamazsa null. */
  replacementEstimate: number | null;
  note: string;
}

/** Değişimde parçaya ek olarak doğan işçilik kalemleri (sök/tak + boya + sarf + kalibrasyon) tahmini tabanı. */
export const REPLACE_EXTRA_LABOR_BASELINE = 3000;

function formatTL(n: number): string {
  const rounded = Math.round(n);
  const withDots = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots} ₺`;
}

function priceLabel(salvage: number | null, original: number | null): string {
  const parts: string[] = [];
  if (salvage !== null) parts.push(`sahiplenme bedeli ${formatTL(salvage)}`);
  if (original !== null) parts.push(`orijinal bedel ${formatTL(original)}`);
  return parts.join(', ');
}

/** Onarım/değişim ekonomisini değerlendirir; verdict + Türkçe gerekçe döner. */
export function evaluateRepairVsReplace(input: RepairVsReplaceInput): RepairVsReplaceEvaluation {
  const { operationType, salvagePrice, originalPrice, repairLaborTotal } = input;
  const prices = priceLabel(salvagePrice, originalPrice);

  if (operationType === 'belirsiz') {
    return {
      verdict: 'kontrol-gerekli',
      replacementEstimate: null,
      note: `İşlem türü (onarım/değişim) netleşmedi${prices ? ` (${prices})` : ''}; kontrol gerekli.`
    };
  }

  if (operationType === 'degisim') {
    const note = salvagePrice !== null
      ? `Değişim: parça ${prices}; değişimde sök/tak + boya + sarf + kalibrasyon ek işçilikleri doğar, dağıtım buna göre değerlendirilmeli.`
      : `Değişim işlemi${prices ? ` (${prices})` : ''}; parça bedeli okunamadıysa kontrol gerekli.`;
    return {
      verdict: salvagePrice !== null ? 'degisim-uygun' : 'kontrol-gerekli',
      replacementEstimate: salvagePrice !== null ? salvagePrice + REPLACE_EXTRA_LABOR_BASELINE : null,
      note
    };
  }

  // operationType === 'onarim'
  if (salvagePrice === null && originalPrice === null) {
    return {
      verdict: 'kontrol-gerekli',
      replacementEstimate: null,
      note: 'Onarım işlemi ama parça bedeli (sahiplenme/orijinal) okunamadı; ekonomi değerlendirilemedi, kontrol gerekli.'
    };
  }

  if (salvagePrice !== null) {
    const replacementEstimate = salvagePrice + REPLACE_EXTRA_LABOR_BASELINE;
    if (typeof repairLaborTotal === 'number' && Number.isFinite(repairLaborTotal)) {
      if (repairLaborTotal <= replacementEstimate) {
        return {
          verdict: 'onarim-ekonomik',
          replacementEstimate,
          note: `Onarım işçiliği (${formatTL(repairLaborTotal)}) ≈ değişim toplamı tahmini ${formatTL(replacementEstimate)} (${prices} + ek işçilik) altında; onarım ekonomik değerlendirilebilir.`
        };
      }
      return {
        verdict: 'kontrol-gerekli',
        replacementEstimate,
        note: `Onarım işçiliği (${formatTL(repairLaborTotal)}) değişim toplamı tahmininden (${formatTL(replacementEstimate)}) yüksek görünüyor; ${prices} dikkate alınarak teknik/ekonomik uygunluk kontrol edilmeli (otomatik reddedilmez).`
      };
    }
    return {
      verdict: 'onarim-ekonomik',
      replacementEstimate,
      note: `Onarım: parça ${prices} olduğundan değişimde sök/tak + boya + sarf + kalibrasyon ek işçilikleri doğar; mevcut onarım işçiliği ekonomik değerlendirilebilir. Teknik uygunluk eksper kontrolü gerektirir.`
    };
  }

  // Sadece orijinal bedel var.
  return {
    verdict: 'kontrol-gerekli',
    replacementEstimate: null,
    note: `Onarım işlemi (${prices}); sahiplenme bedeli okunamadığından değişim toplamı netleşmedi, kontrol gerekli.`
  };
}
