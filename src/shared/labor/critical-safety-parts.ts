/**
 * v0.6.x — AI İşçilik v3.1: Güvenlik/kritik parça tespiti (SAF; ağ/dosya yok).
 * Bu parçalarda ekonomik onarım uygun görünse bile teknik uygunluk kontrolü (kontrol gerekli) KALIR;
 * v3 ekonomi tek başına "uygundur" sonucu üretemez. Yapısal/güvenlik bütünlüğü eksper kararıdır.
 */
import { normalizeSearch } from '../turkish';

// Tam kelime (boşlukla sınırlı) eşleşir; kısa token'ların (AKS/ABS/FREN) yanlış eşleşmesini önler.
const CRITICAL_SAFETY_PHRASES = [
  'ON PANEL', 'ON GOGUS', 'TRAVERS', 'SASI', 'SASE', 'YAPISAL',
  'DIREKSIYON', 'AKS', 'PORYA', 'SUSPANSIYON', 'SALINCAK',
  'AIRBAG', 'HAVA YASTIGI', 'EMNIYET KEMERI', 'MODUL',
  'FREN', 'ABS'
];

/** Parça adı/grubu güvenlik-kritik/yapısal bir parçaya işaret ediyor mu? */
export function isCriticalSafetyPart(partName: string, group = ''): boolean {
  const text = ` ${normalizeSearch([partName, group].filter(Boolean).join(' '))} `;
  return CRITICAL_SAFETY_PHRASES.some((p) => text.includes(` ${p} `));
}
