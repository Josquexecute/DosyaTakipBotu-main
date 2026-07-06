/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v5: hesap gerekçesi kopya metni (SAF).
 *
 * Panoya kopyalanacak düz metni üretir: durum, (yalnız hesaplandıysa) yuvarlanmış tutar, formül,
 * katsayı kaynağı, faktörler, eksikler, uyarılar, cap ve zorunlu disclaimer. Dosya yolu/iç kimlik
 * içermez; mail/rapor üretmez; hiçbir yere yazmaz. Bağlayıcı sonuç dili KULLANILMAZ.
 */
import type { ValueLossCalculationResult } from './value-loss-calculation-types';
import { formatCalcAmount, formatCoefficient } from './value-loss-calculation-explain';

const STATUS_TR: Record<ValueLossCalculationResult['status'], string> = {
  calculated: 'Hesaplandı (ön hesap / eksper kontrolü gerekli)',
  cannot_calculate: 'Hesaplanamaz',
  control_needed: 'Kontrol gerekli'
};

/** Ön hesap sonucunu panoya uygun, denetlenebilir düz metne çevirir. */
export function buildValueLossCalculationCopyText(result: ValueLossCalculationResult): string {
  const lines: string[] = [];
  lines.push('REEL PİYASA ANALİZ ÖN HESABI — GEREKÇE ÖZETİ');
  lines.push(`Durum: ${STATUS_TR[result.status]}`);
  if (result.status === 'calculated' && typeof result.roundedAmount === 'number') {
    lines.push(`Ön hesap tutarı (500 TL katına yuvarlanmış): ${formatCalcAmount(result.roundedAmount)}`);
    if (typeof result.amount === 'number') lines.push(`Yuvarlama öncesi: ${formatCalcAmount(result.amount)}`);
  } else {
    lines.push('Ödenebilir tutar hesaplanmadı.');
  }
  if (result.formulaSummary) lines.push(`Formül: ${result.formulaSummary}`);
  lines.push(`Katsayı kaynağı: ${result.coefficientSource}`);
  if (result.capInfo) {
    lines.push(`Üst sınır: ${result.capInfo.maxAllowedAmount !== undefined ? formatCalcAmount(result.capInfo.maxAllowedAmount) : 'tanımsız'} — ${result.capInfo.capApplied ? `UYGULANDI${result.capInfo.reason ? ` (${result.capInfo.reason})` : ''}` : 'uygulanmadı'}`);
  }
  if (result.factors.length) {
    lines.push('', 'Faktörler:');
    for (const f of result.factors) {
      lines.push(`- ${f.label}${f.coefficient !== undefined ? ` [${formatCoefficient(f.coefficient)}]` : ''}: ${f.explanation}`);
    }
  }
  if (result.missingInputs.length) {
    lines.push('', 'Eksik girdiler:');
    for (const m of result.missingInputs) lines.push(`- ${m}`);
  }
  if (result.warnings.length) {
    lines.push('', 'Uyarılar:');
    for (const w of result.warnings) lines.push(`- ${w}`);
  }
  if (result.evidence.length) {
    lines.push('', 'Dayanaklar:');
    for (const e of result.evidence) lines.push(`- ${e}`);
  }
  lines.push('', result.disclaimer);
  return lines.join('\n');
}
