/**
 * v0.6.x — AI İşçilik v3.5: AI Mode parça adayı güven puanlama (SAF). Belirsizlik ifadeleri güveni düşürür;
 * uyumluluk teyidi (VIN/motor/yıl) güveni artırır. Uydurma/belirsiz sonuç düşük güven kalır.
 */
import { normalizeSearch } from '../turkish';
import type { AiModeConfidence } from './ai-mode-part-search-types';

// Güveni DÜŞÜREN ifadeler (normalize edilmiş).
const LOWERING = ['EMIN DEGIL', 'KONTROL GEREKLI', 'UYUMSUZ OLABILIR', 'BELIRSIZ', 'NET DEGIL', 'DOGRULANMALI', 'TAHMIN', 'OLABILIR', 'KESIN DEGIL'];
// Güveni ARTIRAN ifadeler.
const RAISING = ['VIN UYUMLU', 'SASI UYUMLU', 'MOTOR KODU UYUMLU', 'MOTOR UYUMLU', 'YIL UYUMLU', 'UYUMLUDUR', 'DOGRULANDI', 'RESMI OEM', 'TAM UYUMLU'];

/** Bir aday metninden güven seviyesi + uyarıları çıkarır. Açık "yüksek/orta/düşük" etiketi önceliklidir. */
export function scoreCandidateConfidence(text: string): { confidence: AiModeConfidence; warnings: string[] } {
  const t = normalizeSearch(text);
  const warnings: string[] = [];
  const lowered = LOWERING.some((p) => t.includes(p));
  const raised = RAISING.some((p) => t.includes(p));
  if (lowered) warnings.push('Kaynak metni belirsizlik/uyumsuzluk ifadesi içeriyor; kontrol gerekli.');

  const explicit: AiModeConfidence | null =
    /\bDUSUK\b/.test(t) ? 'low' : /\bYUKSEK\b/.test(t) ? 'high' : /\bORTA\b/.test(t) ? 'medium' : null;

  let confidence: AiModeConfidence = explicit ?? (lowered ? 'low' : raised ? 'high' : 'medium');
  // Belirsizlik ifadesi varsa yüksek güven en fazla ortaya iner (güvenli taraf).
  if (lowered && confidence === 'high') confidence = 'medium';
  return { confidence, warnings };
}
