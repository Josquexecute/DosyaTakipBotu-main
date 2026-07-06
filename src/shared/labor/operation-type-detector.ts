/**
 * v0.6.x — AI İşçilik v3: İşlem türü (onarım / değişim) tespiti (SAF; ağ/dosya yok).
 * Belirsizse "belirsiz" + düşük güven döner; çağıran taraf KONTROL GEREKLİ işaretler (boş bırakmaz).
 */
import { normalizeSearch } from '../turkish';

export type OperationType = 'onarim' | 'degisim' | 'belirsiz';

export interface OperationDetection {
  type: OperationType;
  confidence: 'Yüksek' | 'Orta' | 'Düşük';
  /** Karara yol açan eşleşen ipucu (gerekçe metni için). */
  matched: string;
}

// Değişim/yenileme ipuçları (normalizeSearch BÜYÜK harf + TR katlama: Ç→C, Ş→S, İ/I→I, ...).
const REPLACE_HINTS = ['DEGISIM', 'DEGISTIR', 'DEGIS', 'YENILEME', 'YENILE', 'KOMPLE YENI', 'SOKME TAKMA YENI'];
// Onarım/tamir ipuçları.
const REPAIR_HINTS = [
  'ONARIM', 'TAMIR', 'DUZELTME', 'DUZELT', 'LOKAL ONARIM', 'PLASTIK TAMIR', 'PLASTIK ONARIM',
  'MOBIL ONARIM', 'PDR', 'ISIL', 'SOK TAK', 'SOKME TAKMA', 'PLASTIK KAYNAK'
];

function firstHit(text: string, hints: string[]): string {
  for (const h of hints) if (text.includes(h)) return h;
  return '';
}

/** Parça açıklaması + grup + serbest not içinden işlem türünü tespit eder. */
export function detectOperationType(partName: string, group = '', note = ''): OperationDetection {
  const text = normalizeSearch([partName, group, note].filter(Boolean).join(' '));
  if (!text) return { type: 'belirsiz', confidence: 'Düşük', matched: '' };

  const replaceHit = firstHit(text, REPLACE_HINTS);
  const repairHit = firstHit(text, REPAIR_HINTS);

  // Her iki ipucu da varsa karar belirsizdir; eksper kontrolü gerekir.
  if (replaceHit && repairHit) {
    return { type: 'belirsiz', confidence: 'Düşük', matched: `${repairHit}+${replaceHit}` };
  }
  if (replaceHit) return { type: 'degisim', confidence: 'Yüksek', matched: replaceHit };
  if (repairHit) return { type: 'onarim', confidence: 'Yüksek', matched: repairHit };
  return { type: 'belirsiz', confidence: 'Düşük', matched: '' };
}
