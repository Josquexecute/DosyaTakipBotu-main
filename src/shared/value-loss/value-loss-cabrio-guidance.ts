/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v6: Cabrio / üstü açılır araç yönlendirmesi (SAF).
 *
 * Kaynak: SEİK uygulama esasları 3.7 — hususi cabrio ve/veya tek kapılı hafif ticari kamyonet
 * tipi araçlarda arka çamurluk hesaplamalarında sağ/sol yan panel satırları dikkate alınır.
 * Bu modül YALNIZ yönlendirme/uyarı üretir: parça adı OTOMATİK DEĞİŞTİRİLMEZ, katsayı
 * OTOMATİK EZİLMEZ, satır otomatik seçilmez; nihai karar eksperindir.
 */
import type { ValueLossContext } from './value-loss-context-types';
import type { ValueLossWarning } from './value-loss-exclusion-rules';
import { normalizeValueLossPartName } from './value-loss-part-coefficients';

/** v4 tablosundaki cabrio-özel satırların ad işareti (Tablolar!B264:L265). */
export const CABRIO_PART_NAME_MARKER = 'TİCARİ VE CABRİO';

function hasCabrioRows(vl: ValueLossContext): boolean {
  return (vl.damage?.structuredParts ?? []).some((p) =>
    normalizeValueLossPartName(p.partName).includes(CABRIO_PART_NAME_MARKER));
}

/** Cabrio yönlendirme uyarılarını üretir (hesabı DEĞİŞTİRMEZ; yalnız bilgi/kontrol). */
export function evaluateCabrioGuidance(vl: ValueLossContext | null | undefined): ValueLossWarning[] {
  if (!vl) return [];
  const out: ValueLossWarning[] = [];
  const flag = vl.vehicle?.isCabrioOrConvertible;
  const cabrioRows = hasCabrioRows(vl);
  if (flag === true) {
    out.push({
      id: 'cabrio-arac', level: 'warning',
      message: 'Cabrio/üstü açılır araç: uygulama esasları 3.7 gereği arka çamurluk hesabında sağ/sol yan panel (TİCARİ VE CABRİO) satırları gündeme gelebilir; uygun olduğunda bu özel satırları BİLİNÇLİ seçin. Otomatik ikame yapılmaz; eksper kontrolü gerekir.'
    });
  }
  if (cabrioRows) {
    out.push({
      id: 'cabrio-satir', level: 'warning',
      message: 'Parça listesinde cabrio/ticari özel yan panel satırı var: bu satırlar esaslar 3.7 kapsamındaki özel durumlara aittir; kullanım gerekçesi eksper tarafından kontrol edilmelidir.'
    });
    if (flag !== true) {
      out.push({
        id: 'cabrio-uyumsuz', level: 'critical',
        message: 'Cabrio-özel yan panel satırı seçilmiş ancak araç cabrio/üstü açılır olarak işaretlenmemiş; veri tutarsız görünüyor, kontrol gerekir.'
      });
    }
  }
  return out;
}
