/**
 * v0.6.x — AI İşçilik v3.1: Ekonomik/işlem/kalibrasyon bağlamının KARARA kontrollü etkisi (SAF).
 * Mevcut dağıtım motoru korunur (kategori/tutar DEĞİŞMEZ). Yalnız needsReview/confidence/reason ayarlanır.
 * İlke: açıkça güvenli durumda karar kalitesi iyileşir; şüpheli/kritik durumda "kontrol gerekli" KALIR.
 */
import type { LaborV3Context } from './part-economic-context';

export type LaborConfidence = 'Yüksek' | 'Orta' | 'Düşük';

export interface BaseLaborDecision {
  confidence: LaborConfidence;
  needsReview: boolean;
  reason: string;
  /** 'learned' | 'rules' | 'fallback' | ... — fallback (bilinmeyen) yumuşatılmaz. */
  source: string;
}

export interface LaborDecisionAdjustment {
  needsReview: boolean;
  confidence: LaborConfidence;
  reason: string;
  warnings: string[];
  /** v3.1 needsReview/confidence değerini değiştirdi mi? */
  changed: boolean;
}

export interface AdjustOptions {
  /** Güvenlik/kritik/yapısal parça mı (ekonomik olsa da kontrol gerekli kalır). */
  critical: boolean;
  /** Sayfada F/G (Sahiplenme/Orijinal) ekonomik bağlam sütunu var mı. Yoksa karar etkisi uygulanmaz. */
  hasPriceContext: boolean;
}

const ORDER: LaborConfidence[] = ['Düşük', 'Orta', 'Yüksek'];
const up = (c: LaborConfidence): LaborConfidence => ORDER[Math.min(ORDER.indexOf(c) + 1, 2)]!;
const down = (c: LaborConfidence): LaborConfidence => ORDER[Math.max(ORDER.indexOf(c) - 1, 0)]!;

/** Temel kararı v3 bağlamıyla kontrollü biçimde günceller; nihai reason'ı da kurar. */
export function adjustLaborDecisionV3(
  base: BaseLaborDecision,
  v3: LaborV3Context,
  opts: AdjustOptions
): LaborDecisionAdjustment {
  let needsReview = base.needsReview;
  let confidence = base.confidence;
  const notes: string[] = [];
  const warnings: string[] = [];
  let changed = false;

  if (opts.hasPriceContext) {
    if (opts.critical) {
      // Güvenlik/kritik parça: ekonomik onarım uygun görünse de kontrol gerekli kalır.
      if (!needsReview) { needsReview = true; changed = true; }
      notes.push('Güvenlik/kritik parça: ekonomik onarım uygun görünse de teknik/yapısal uygunluk kontrol edilmelidir.');
      warnings.push('Güvenlik/kritik parça: teknik uygunluk kontrolü gerekli.');
    } else if (v3.operation.type === 'belirsiz') {
      // İşlem türü net değil: boş bırakma; kontrol gerekli + güven bir kademe düşer.
      if (!needsReview) { needsReview = true; changed = true; }
      const c2 = down(confidence);
      if (c2 !== confidence) { confidence = c2; changed = true; }
      notes.push('İşlem türü (onarım/değişim) net değil; dağıtım parça adı/grubu/fiyata göre yapıldı, kullanıcı kontrolü gereklidir.');
    } else if (v3.economic.verdict === 'onarim-ekonomik' && base.source !== 'fallback' && base.confidence !== 'Düşük') {
      // Onarım ekonomik ve tek şüphe yüksek işçilik ise: kontrol yumuşatılır, güven bir kademe artar.
      if (needsReview) { needsReview = false; changed = true; }
      const c2 = up(confidence);
      if (c2 !== confidence) { confidence = c2; changed = true; }
      notes.push('Onarım ekonomik olarak savunulabilir; teknik uygunluk kullanıcı/eksper tarafından kontrol edilmelidir.');
      warnings.push('Onarım ekonomik kabul edildi; teknik uygunluk kontrolü önerilir.');
    } else if (v3.economic.verdict === 'kontrol-gerekli') {
      // Onarım/değişim ekonomisi sınırda: otomatik reddetme yok, kontrol gerekli.
      if (!needsReview) { needsReview = true; changed = true; }
      notes.push('Onarım/değişim ekonomisi sınırda; teknik açıklama ve görsel kontrol önerilir.');
    }

    // Kalibrasyon örtüşmesi (kritik parça zaten kontrol gerekli; orada şüpheli demeyiz).
    if (!opts.critical) {
      if (v3.calibration.context === 'belirsiz' && v3.calibration.needsReview) {
        if (!needsReview) { needsReview = true; changed = true; }
        notes.push('Kalibrasyon/rot-balans açıklaması net değil; kontrol gerekli.');
      } else if (v3.calibration.reasonable && v3.calibration.context === 'on-duzen') {
        notes.push('Bu parça bağlamında kalibrasyon kalemi rot-balans/ön düzen olarak değerlendirilebilir.');
      }
    }
  }

  const reason = [
    base.reason,
    `v3: ${v3.note}`,
    notes.length ? `Karar etkisi: ${notes.join(' ')}` : ''
  ].filter(Boolean).join(' | ');

  return { needsReview, confidence, reason, warnings, changed };
}
