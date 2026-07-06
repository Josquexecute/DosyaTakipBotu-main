/**
 * v0.6.x — AI İşçilik v3.5: Google AI Mode için MANUEL araştırma promptu üretir (SAF; ağ/gönderim YOK).
 * Maskeli mod (varsayılan): tam şasi/motor/plaka göstermez (şasi öneki + motor kodu). Tam mod: kullanıcı isterse.
 */
import { extractChassisPrefix } from './labor-vehicle-context-normalizer';
import type { AiModeDataMode, AiModePartSearchInput } from './ai-mode-part-search-types';

const OP_LABEL: Record<string, string> = { onarim: 'ONARIM', degisim: 'DEĞİŞİM', belirsiz: 'ONARIM / DEĞİŞİM (belirsiz)' };
const SOURCE_LABEL: Record<string, string> = { 'active-file': 'aktif dosya', excel: 'Excel', unknown: 'bilinmiyor' };

function tl(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('tr-TR')} TL` : '(belirtilmemiş)';
}

/** Maskeli modda dışarı verilmeyen tam kimlik bilgileri için gizlilik uyarısı + araç satırları. */
export const AI_MODE_PRIVACY_NOTICE =
  'GİZLİLİK: Bu metni Google AI Mode\'a yapıştırırsanız içindeki araç/dosya bilgileri Google tarafına MANUEL gönderilmiş olur. Program otomatik gönderim/araştırma yapmaz.';

function vehicleLines(input: AiModePartSearchInput, mode: AiModeDataMode): string[] {
  const v = input.vehicle;
  const lines = [
    `- Marka/Model: ${v.vehicleModel || '(bilinmiyor)'}`,
    `- Model Yılı: ${v.modelYear ?? '(bilinmiyor)'}`
  ];
  if (mode === 'full') {
    lines.push(`- Şasi No: ${v.chassisNo || '(yok)'}`);
    lines.push(`- Motor No: ${v.engineNo || '(yok)'}`);
    if (v.plate) lines.push(`- Plaka: ${v.plate}`);
  } else {
    lines.push(`- Şasi Öneki: ${v.chassisPrefix || extractChassisPrefix(v.chassisNo) || '(yok)'}`);
  }
  lines.push(`- Motor Kodu: ${v.engineCode || '(yok)'}`);
  lines.push(`- Araç bilgisi kaynağı: ${SOURCE_LABEL[input.vehicleSource ?? 'unknown'] ?? 'bilinmiyor'}`);
  return lines;
}

/** Seçili satır + araç bağlamından kopyala-yapıştır hazır Türkçe AI Mode araştırma promptu üretir. */
export function buildAiModeSearchPrompt(input: AiModePartSearchInput, mode: AiModeDataMode = 'masked'): string {
  const r = input.row;
  const partLines = [
    `- Parça Grubu: ${r.partGroup || '(belirtilmemiş)'}`,
    `- Parça Açıklaması: ${r.partName || '(belirtilmemiş)'}`,
    `- Mevcut Parça Kodu: ${r.partCode && r.partCode.trim() ? r.partCode.trim() : 'boş'}`,
    `- İşlem Türü: ${OP_LABEL[r.operationType ?? 'belirsiz'] ?? 'ONARIM / DEĞİŞİM'}`
  ];
  if (mode === 'full' || r.salvagePrice != null) partLines.push(`- Parça Sahiplenme Bedeli: ${tl(r.salvagePrice)}`);
  if (mode === 'full' || r.originalPrice != null) partLines.push(`- Parça Orijinal Bedeli: ${tl(r.originalPrice)}`);
  if (r.note) partLines.push(`- Not: ${r.note}`);
  partLines.push('- Not: Bu parça hasar dosyası işçilik dağıtımı için araştırılıyor.');

  return [
    AI_MODE_PRIVACY_NOTICE,
    '',
    'Aşağıdaki araç ve parça için doğru parça kodu adaylarını araştır.',
    '',
    'Araç:',
    ...vehicleLines(input, mode),
    '',
    'Parça:',
    ...partLines,
    '',
    'İstenen çıktı:',
    '1. Bu araca uyabilecek muhtemel orijinal/OEM parça kodları.',
    '2. Eşdeğer veya yan sanayi karşılıkları varsa ayrı belirt.',
    '3. Kodların hangi yıl/kasa/motor ile uyumlu olduğunu yaz.',
    '4. Emin olmadığın kodları "kontrol gerekli" diye işaretle.',
    '5. Kaynak/link varsa listele.',
    '6. Sonuçları tablo halinde ver:',
    '   | Parça Kodu | Parça Adı | Tür (orijinal/eşdeğer/yan sanayi) | Uyumluluk Gerekçesi | Güven (yüksek/orta/düşük) | Kaynak |'
  ].join('\n');
}
