/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v3: ön hesap açıklama yardımcıları (SAF).
 * Formül özeti, sayı biçimleme ve zorunlu disclaimer. Kesin tazminat dili KULLANILMAZ.
 */
import type { ValueLossCalculationFactor } from './value-loss-calculation-types';

/** Her ön hesap sonucunda gösterilmesi zorunlu uyarı metni. */
export const VALUE_LOSS_CALC_DISCLAIMER =
  'Bu sonuç, girilen veriler ve yerel katsayı seti üzerinden oluşturulan ön hesap niteliğindedir. '
  + 'Nihai değer kaybı değerlendirmesi eksper kanaati, dosya kapsamı, piyasa verileri ve rapor gerekçesi ile birlikte yapılmalıdır.';

/** TL tutarını tr-TR biçiminde yazar. */
export function formatCalcAmount(value: number): string {
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;
}

/** Katsayıyı kısa biçimde yazar (0,90 gibi). */
export function formatCoefficient(value: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
}

/** Faktör oluşturma kısayolu. */
export function calcFactor(
  id: string, label: string, effect: ValueLossCalculationFactor['effect'], explanation: string,
  inputValue?: string | number | boolean, coefficient?: number
): ValueLossCalculationFactor {
  const out: ValueLossCalculationFactor = { id, label, effect, explanation };
  if (inputValue !== undefined) out.inputValue = inputValue;
  if (coefficient !== undefined) out.coefficient = coefficient;
  return out;
}

/** Hesap adımlarından okunur formül özeti üretir. */
export function buildFormulaSummary(parts: ReadonlyArray<{ label: string; coefficient?: number }>): string {
  return parts
    .map((p) => (p.coefficient === undefined ? p.label : `${p.label} (${formatCoefficient(p.coefficient)})`))
    .join(' × ');
}
