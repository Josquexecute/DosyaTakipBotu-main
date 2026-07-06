/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v4: yapılandırılmış parça satırı tipleri (SAF).
 *
 * Parça satırları KULLANICI tarafından girilir; serbest metinden katsayı TÜRETİLMEZ.
 * Katsayılar yalnız SEİK parça tablosundan (bilinen ad + grup eşleşmesi) çözülür; çözülemeyen
 * satır tahmin edilmez, uyarı üretir. Kayıt yalnız v2 önizleme/diff/onay akışıyla yapılır.
 */

export type ValueLossPartOperation = 'changed' | 'repaired' | 'painted';
export type ValueLossRepairSeverity = 'light' | 'medium' | 'heavy' | 'unknown';
export type ValueLossPaintType = 'TAM' | 'LOKAL' | 'unknown';

export interface ValueLossPartRepairInfo {
  /** İşçilik bedeli (KDV hariç, iskontosuz — esaslar 3.3). */
  laborAmount?: number;
  /** Yeni parça fiyatı (KDV hariç, iskontosuz). */
  newPartPrice?: number;
  /** İşçilik/yeni parça oranından türetilen onarım ağırlığı (esaslar 3.4). */
  severity?: ValueLossRepairSeverity;
  laborToNewPartRatio?: number;
}

export interface ValueLossPartPaintInfo {
  type?: ValueLossPaintType;
}

export interface ValueLossPartItem {
  id: string;
  operation: ValueLossPartOperation;
  partName: string;
  vehicleGroup?: 'A' | 'B' | 'C' | 'Ç' | 'D' | 'E' | 'F' | 'unknown';
  /** Çözülen SEİK katsayısı (yalnız tablo eşleşmesiyle; tahmin YOK). */
  coefficient?: number;
  /** Katsayının kaynağı (sheet/aralık/satır) — denetlenebilirlik için. */
  coefficientSource?: string;
  repair?: ValueLossPartRepairInfo;
  paint?: ValueLossPartPaintInfo;
  warnings: string[];
}

/** Çözümleme özeti: motor ve checklist bu özet üzerinden karar verir. */
export interface ValueLossPartsResolution {
  items: ValueLossPartItem[];
  /** Tüm satırların katsayısı çözüldüyse toplam; aksi halde undefined (kısmi toplam ayrı). */
  totalCoefficient?: number;
  /** Çözülen satırların diagnostik ara toplamı (kısmi; sonuç olarak SUNULMAZ). */
  partialCoefficient: number;
  resolvedCount: number;
  unresolvedCount: number;
  allResolved: boolean;
  warnings: string[];
}
