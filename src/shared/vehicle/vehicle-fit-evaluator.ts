import type { VehicleContext } from './vehicle-context';
import { hasMeaningfulVehicleContext, vehicleFuelClass, vehicleModelYear } from './vehicle-context';

/**
 * v0.6.2: Parça ↔ Araç uyumu için YEREL, kural-tabanlı (sallama olmayan) değerlendirici.
 *
 * AI kesin katalog doğrulaması yapmaz; bu değerlendirici yalnızca AÇIK çelişkileri ("şüpheli") veya
 * bilgi yetersizliğini ("bilinmiyor") işaretler. Emin olunmayan durumda "Kontrol gerekli" der.
 * Harici servise veri GÖNDERMEZ; tamamen yereldir ve saf/deterministiktir.
 */
export type VehicleFit = 'uygun' | 'şüpheli' | 'bilinmiyor';
export type FitConfidence = 'yüksek' | 'orta' | 'düşük';

export interface VehicleFitResult {
  vehicleFit: VehicleFit;
  reason: string;
  confidence: FitConfidence;
  needsReview: boolean;
}

export interface EvaluablePart {
  raw?: string;
  canonical?: string;
  category?: string;
}

type PartHint = 'modern_equipment' | 'hybrid_ev' | 'diesel_specific' | 'forced_induction' | 'generic';

// NOT: Türkçe ekler ve ş/ç/ö/ü gibi karakterler `\b` (ASCII kelime sınırı) ile güvenilir çalışmaz
// ("kamerası", "şerit" boundary tutmaz). Bu yüzden alt-dize (substring) eşleşmesi kullanılır.
/** Modern donanım/ADAS (eski model araçta şüpheli). */
const MODERN_EQUIPMENT = /adas|radar|kamera|sensor|sensör|şerit|serit|kör nokta|kor nokta|gece görüş|gece gorus|çarpışma|carpisma|blind spot|lane assist|şerit takip/;
/** Hibrit/elektrikli özel parça (hibrit/elektrikli olmayan araçta şüpheli). 12V "akü" hariç tutulur. */
const HYBRID_EV = /inverter|invertör|hibrit batarya|yüksek voltaj|yuksek voltaj|elektrik motoru|şarj ünitesi|sarj unitesi|tahrik bataryas|hv batarya/;
/** Dizel'e özgü parça (dizel olmayan araçta şüpheli). */
const DIESEL_SPECIFIC = /dpf|partikül filtresi|partikul filtresi|common rail|kızdırma bujisi|kizdirma bujisi|enjektör pompas|enjektor pompas|mazot pompas|egr valfi|adblue|scr kataliz/;
/** Turbo/intercooler — motor yapısı bilinmiyorsa otomatik doğru kabul EDİLMEZ. */
const FORCED_INDUCTION = /turbo|intercooler|turboşarj|turbosarj|şarj havas|sarj havas/;

function classifyPartHint(text: string): PartHint {
  const t = text.toLocaleLowerCase('tr-TR');
  if (MODERN_EQUIPMENT.test(t)) return 'modern_equipment';
  if (HYBRID_EV.test(t)) return 'hybrid_ev';
  if (DIESEL_SPECIFIC.test(t)) return 'diesel_specific';
  if (FORCED_INDUCTION.test(t)) return 'forced_induction';
  return 'generic';
}

const MODERN_EQUIPMENT_MIN_YEAR = 2015;

export function evaluatePartVehicleFit(context: VehicleContext | undefined | null, part: EvaluablePart): VehicleFitResult {
  const hint = classifyPartHint(`${part.raw ?? ''} ${part.canonical ?? ''} ${part.category ?? ''}`);
  const hasContext = hasMeaningfulVehicleContext(context ?? undefined);

  // Araç bilgisi yoksa KESİN HÜKÜM verilmez. Riskli kategoriler ayrıca kontrol için işaretlenir.
  if (!hasContext) {
    if (hint === 'generic') return result('bilinmiyor', 'Araç bilgisi girilmediği için araçla uyum doğrulanamadı.', 'düşük', false);
    return result('bilinmiyor', 'Araç bilgisi yok; bu parçanın araçla uyumu doğrulanamıyor, kontrol gerekli.', 'düşük', true);
  }

  const year = vehicleModelYear(context);
  const fuel = vehicleFuelClass(context);

  if (hint === 'modern_equipment') {
    if (year === null) return result('bilinmiyor', 'Model yılı bilinmediği için modern donanım uyumu doğrulanamadı; kontrol gerekli.', 'düşük', true);
    if (year < MODERN_EQUIPMENT_MIN_YEAR) return result('şüpheli', `Eski model (${year}) araçta modern donanım/ADAS şüpheli; kontrol gerekli.`, 'orta', true);
    return result('uygun', 'Model yılı modern donanımla uyumlu görünüyor.', 'orta', false);
  }

  if (hint === 'hybrid_ev') {
    if (fuel === 'hibrit' || fuel === 'elektrik') return result('uygun', 'Hibrit/elektrikli araçla uyumlu görünüyor.', 'orta', false);
    if (fuel === 'unknown') return result('bilinmiyor', 'Yakıt tipi bilinmediği için hibrit/elektrik parçası doğrulanamadı; kontrol gerekli.', 'düşük', true);
    return result('şüpheli', `Hibrit/elektrikli olmayan (${fuel}) araçta inverter/batarya gibi parça şüpheli; kontrol gerekli.`, 'orta', true);
  }

  if (hint === 'diesel_specific') {
    if (fuel === 'dizel') return result('uygun', 'Dizel araçla uyumlu görünüyor.', 'orta', false);
    if (fuel === 'unknown') return result('bilinmiyor', 'Yakıt tipi bilinmediği için dizel özel parçası doğrulanamadı; kontrol gerekli.', 'düşük', true);
    return result('şüpheli', `Dizel olmayan (${fuel}) araçta dizele özgü parça şüpheli; kontrol gerekli.`, 'orta', true);
  }

  if (hint === 'forced_induction') {
    if (fuel === 'dizel') return result('uygun', 'Dizel motorda turbo/intercooler beklenir.', 'orta', false);
    // Motor yapısı bilinmiyorsa otomatik doğru kabul edilmez.
    return result('bilinmiyor', 'Motor yapısı (turbolu mu) kesinleşmediği için turbo/intercooler otomatik doğru kabul edilmedi; kontrol gerekli.', 'düşük', true);
  }

  // Generic parça + bağlam var → açık çelişki yok.
  return result('uygun', 'Araç bilgisiyle açık bir çelişki bulunmadı.', 'yüksek', false);
}

function result(vehicleFit: VehicleFit, reason: string, confidence: FitConfidence, needsReview: boolean): VehicleFitResult {
  return { vehicleFit, reason, confidence, needsReview };
}
