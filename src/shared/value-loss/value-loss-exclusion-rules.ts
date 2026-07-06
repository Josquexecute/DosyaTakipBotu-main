/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v1: değer kaybı istisna / uyarı kuralları.
 * SAF (ağ/dosya/electron/DOM yok). Kör karar üretmez; yalnızca dikkat edilmesi gereken durumları uyarır.
 */

export type ValueLossWarningLevel = 'info' | 'warning' | 'critical';

export interface ValueLossWarning {
  id: string;
  level: ValueLossWarningLevel;
  message: string;
}

export interface ValueLossExclusionInput {
  isHeavyDamage?: boolean | null;
  isTotalLoss?: boolean | null;
  hasPreAccidentHeavyDamage?: boolean | null;
  samePartPreviouslyDamaged?: boolean | null;
  weldedPartPreviouslyRepairedNowChanged?: boolean | null;
  isAntiqueOrCollector?: boolean | null;
  hasAccessoryParts?: boolean | null;
  hasPlasticCosmeticParts?: boolean | null;
}

/**
 * İstisna / uyarı kurallarını değerlendirir. İlgili gösterge varsa uyarı ekler; sonda her zaman
 * eksper kanaati notunu döner. Hiçbir uyarı "değer kaybı kesinlikle yoktur" demez.
 */
export function evaluateValueLossExclusions(input: ValueLossExclusionInput): ValueLossWarning[] {
  const out: ValueLossWarning[] = [];

  if (input.isHeavyDamage === true || input.isTotalLoss === true) {
    out.push({ id: 'agir-tam-hasar', level: 'critical', message: 'Ağır hasar / tam hasar dosyasında değer kaybı yapılmayabilir; önce kontrol edilmelidir. Kör karar verilmemeli.' });
  }
  if (input.hasPreAccidentHeavyDamage === true) {
    out.push({ id: 'kaza-oncesi-agir-hasar', level: 'warning', message: 'Kaza öncesi ağır hasar varsa değer kaybı hesaplanmaması gerekebilir; ayrıca kontrol edilmelidir.' });
  }
  if (input.samePartPreviouslyDamaged === true) {
    out.push({ id: 'ayni-parca-onceki-hasar', level: 'warning', message: 'Önceden hasarlı/onarımlı aynı parça varsa değer kaybı etkisi sınırlanabilir veya hariç tutulabilir.' });
  }
  if (input.weldedPartPreviouslyRepairedNowChanged === true) {
    out.push({ id: 'kaynakli-parca-degisim', level: 'warning', message: 'Sabit/kaynaklı parça geçmişte onarımlı olup bu kazada değişmişse özel kontrol gerekir.' });
  }
  if (input.isAntiqueOrCollector === true) {
    out.push({ id: 'antika-koleksiyon', level: 'warning', message: 'Antika/koleksiyon araçlarda referans modül dışı ayrı değerlendirme gerekebilir.' });
  }
  if (input.hasAccessoryParts === true) {
    out.push({ id: 'aksesuar-parca', level: 'info', message: 'Aksesuar parçalar değer kaybı hesabında dikkate alınmayabilir.' });
  }
  if (input.hasPlasticCosmeticParts === true) {
    out.push({ id: 'plastik-kozmetik-parca', level: 'info', message: 'Plastik/kozmetik parçalar için parça sınıfı ve boya ayrımı kontrol edilmelidir.' });
  }

  // Her durumda geçerli standing not.
  out.push({ id: 'eksper-kanaati', level: 'info', message: 'Değer kaybı sonucu kesin hüküm gibi değil; eksper kanaati ve hesaplama gerekçesiyle sunulmalıdır.' });
  return out;
}
