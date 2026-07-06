/**
 * v0.6.x — AI taslak çıktı KALİTESİ yardımcıları (oran biçimi, sonraki kontrol önerisi).
 * SAF; ağ/dosya/IPC YOK.
 */

/** Onarım/rayiç oranını "%xx,x" biçiminde verir (null → 'belirsiz'). */
export function ratioLabel(ratio: number | null): string {
  if (ratio === null) return 'belirsiz';
  return `%${(ratio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

/** Hasar tutarı + rayiçten oran hesaplar (mevcut damageRatio öncelikli). */
export function computeRatio(damageRatio: number | null, grossDamageAmount: number | null, marketValue: number | null): number | null {
  if (damageRatio !== null) return damageRatio;
  if (grossDamageAmount !== null && marketValue && marketValue > 0) return grossDamageAmount / marketValue;
  return null;
}

/** Eksik alanlara göre kısa "sonraki kontrol önerisi" satırı (yoksa boş). */
export function nextControlSuggestion(missing: readonly string[]): string {
  if (!missing.length) return 'Sonraki adım: dosya rapor sürecine uygun şekilde ilerletilebilir.';
  return `Sonraki kontrol: ${missing.join(', ')} netleştirilmeli.`;
}
