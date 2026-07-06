/**
 * v0.6.x — AI İşçilik v3: Kalibrasyon / rot-balans bağlam kuralları (SAF; ağ/dosya yok).
 * Amaç: ön takım / direksiyon / tekerlek parçalarında kalibrasyon-rot/balans makul kabul edilir;
 * radar/kamera yoksa ADAS kalibrasyonu VARSAYILMAZ. Otomatik "şüpheli" damgalamaz.
 */
import { normalizeSearch } from '../turkish';

export type CalibrationContext = 'on-duzen' | 'adas' | 'belirsiz' | 'yok';

export interface CalibrationEvaluation {
  context: CalibrationContext;
  /** Kalibrasyon/rot-balans işçiliği bu parçada makul mü? */
  reasonable: boolean;
  needsReview: boolean;
  note: string;
}

// Ön düzen / tekerlek / direksiyon bağlamı (normalizeSearch BÜYÜK harf + TR katlama).
const FRONT_GEOMETRY_PHRASES = [
  'JANT', 'LASTIK', 'PORYA', 'ROT BASI', 'ROT KOLU', 'ROT', 'SALINCAK', 'AKS', 'DIREKSIYON',
  'SUSPANSIYON', 'ON TAKIM', 'AMORTISOR', 'MAFSAL', 'BILYA', 'ROTIL', 'RULMAN', 'ON DUZEN', 'GEOMETRI'
];
// ADAS / sürüş destek kalibrasyonu yalnız bu ipuçlarıyla varsayılır.
const ADAS_PHRASES = ['RADAR', 'KAMERA', 'ADAS', 'SERIT TAKIP', 'MESAFE SENSORU', 'ON KAMERA', 'SENSOR KALIBRASYON'];
const CALIBRATION_PHRASES = ['KALIBRASYON', 'ROT BALANS', 'BALANS', 'ON DUZEN AYARI', 'AKS AYARI'];

function hasAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

/** Parça/işlem bağlamına göre kalibrasyon makullüğünü değerlendirir. */
export function evaluateCalibrationContext(partName: string, group = '', note = ''): CalibrationEvaluation {
  const text = normalizeSearch([partName, group, note].filter(Boolean).join(' '));
  const mentionsCalibration = hasAny(text, CALIBRATION_PHRASES);
  const frontGeometry = hasAny(text, FRONT_GEOMETRY_PHRASES);
  const adas = hasAny(text, ADAS_PHRASES);

  if (adas) {
    return {
      context: 'adas',
      reasonable: true,
      needsReview: true,
      note: 'Radar/kamera bağlamı tespit edildi; ADAS kalibrasyonu gündeme gelebilir, teknik uygunluk kontrol edilmeli.'
    };
  }
  if (frontGeometry) {
    return {
      context: 'on-duzen',
      reasonable: true,
      needsReview: false,
      note: mentionsCalibration
        ? 'Ön takım/tekerlek parçası; kalibrasyon rot-balans / ön düzen ayarı olarak makul değerlendirilir.'
        : 'Ön takım/tekerlek parçası; gerekirse rot-balans / ön düzen ayarı makuldür.'
    };
  }
  if (mentionsCalibration) {
    // Ön düzen veya radar/kamera bağlamı yokken kalibrasyon: otomatik reddetme; kontrol gerekli.
    return {
      context: 'belirsiz',
      reasonable: false,
      needsReview: true,
      note: 'Kalibrasyon/rot-balans açıklaması var ama ön düzen veya radar/kamera bağlamı netleşmedi; kontrol gerekli.'
    };
  }
  return { context: 'yok', reasonable: false, needsReview: false, note: '' };
}
