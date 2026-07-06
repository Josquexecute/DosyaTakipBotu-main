/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v4: yapılandırılmış parça çözümleyici (SAF).
 *
 * Kullanıcının girdiği parça satırlarını SEİK tablosuyla eşler ve işlem türüne göre katsayıyı
 * çözer. Bilinmeyen parça TAHMİN EDİLMEZ ve sessizce ATILMAZ: satır uyarıyla işaretlenir ve
 * toplam "çözülmemiş" sayılır (motor control_needed döner). Serbest metin ayrıştırılmaz.
 */
import type { ValueLossPartItem, ValueLossPartsResolution } from './value-loss-part-input-types';
import { findPartCoefficientEntry } from './value-loss-part-coefficients';
import { classifyRepairSeverity } from './value-loss-part-severity';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Tek parça satırının katsayısını çözer (yeni nesne döner; girdi değişmez). */
export function resolvePartItem(item: ValueLossPartItem, vehicleGroup: string): ValueLossPartItem {
  const out: ValueLossPartItem = { ...item, warnings: [...item.warnings] };
  delete out.coefficient;
  delete out.coefficientSource;

  const entry = findPartCoefficientEntry(vehicleGroup, item.partName);
  if (!entry) {
    out.warnings.push(`'${item.partName}' ${vehicleGroup} grubu SEİK tablosunda bulunamadı; katsayı çözülemedi (tahmin yapılmaz, eksper kontrolü gerekir).`);
    return out;
  }
  const source = `${entry.sourceRange} (satır ${entry.sourceRow})`;

  if (item.operation === 'changed') {
    if (entry.changedCoefficient === undefined) {
      out.warnings.push(`'${entry.partName}' için değişim katsayısı kaynak tabloda yok; kontrol gerekir.`);
      return out;
    }
    out.coefficient = entry.changedCoefficient;
    out.coefficientSource = source;
    return out;
  }

  if (item.operation === 'repaired') {
    const sev = classifyRepairSeverity(item.repair?.laborAmount, item.repair?.newPartPrice);
    out.repair = { ...(item.repair ?? {}), severity: sev.severity };
    if (sev.laborToNewPartRatio !== undefined) out.repair.laborToNewPartRatio = sev.laborToNewPartRatio;
    out.warnings.push(...sev.warnings);
    if (sev.severity === 'unknown') {
      out.warnings.push(`'${entry.partName}' onarım ağırlığı sınıflanamadı (işçilik/yeni parça fiyatı gerekir); katsayı seçilemedi.`);
      return out;
    }
    const coef = sev.severity === 'light' ? entry.repairedLightCoefficient
      : sev.severity === 'medium' ? entry.repairedMediumCoefficient
      : entry.repairedHeavyCoefficient;
    if (coef === undefined) {
      out.warnings.push(`'${entry.partName}' için onarım katsayısı kaynak tabloda güvenilir değil/yok (örn. hava yastığı); kontrol gerekir.`);
      return out;
    }
    out.coefficient = coef;
    out.coefficientSource = source;
    return out;
  }

  // painted
  const paintType = item.paint?.type;
  if (paintType !== 'TAM' && paintType !== 'LOKAL') {
    out.warnings.push(`'${entry.partName}' boya türü (TAM/LOKAL) belirtilmedi; katsayı seçilemedi, kontrol gerekir.`);
    return out;
  }
  const paintCoef = paintType === 'TAM' ? entry.paintedFullCoefficient : entry.paintedLocalCoefficient;
  if (paintCoef === undefined) {
    out.warnings.push(`'${entry.partName}' için ${paintType} boya katsayısı kaynak tabloda yok; kontrol gerekir.`);
    return out;
  }
  out.coefficient = paintCoef;
  out.coefficientSource = paintType === 'TAM' ? `${source} — TAM için J sütunu (modülde K boş; J=TAM eşlendi)` : source;
  return out;
}

/** Tüm satırları çözer ve toplam/kısmi katsayı özetini döner. */
export function resolveStructuredParts(parts: readonly ValueLossPartItem[] | undefined, vehicleGroup: string | undefined): ValueLossPartsResolution {
  const items = (parts ?? []).map((p) => resolvePartItem(p, vehicleGroup ?? 'unknown'));
  const resolved = items.filter((i) => typeof i.coefficient === 'number');
  const partial = round4(resolved.reduce((sum, i) => sum + (i.coefficient ?? 0), 0));
  const allResolved = items.length > 0 && resolved.length === items.length;
  const warnings: string[] = [];
  if (!vehicleGroup || vehicleGroup === 'unknown') warnings.push('Araç grubu belirsiz; parça katsayıları grup olmadan çözülemez.');
  const unresolvedCount = items.length - resolved.length;
  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} parça satırının katsayısı çözülemedi; kısmi ara toplam (${partial}) yalnız TANI amaçlıdır, sonuç olarak kullanılamaz.`);
  }
  const out: ValueLossPartsResolution = {
    items, partialCoefficient: partial, resolvedCount: resolved.length,
    unresolvedCount, allResolved, warnings
  };
  if (allResolved) out.totalCoefficient = partial;
  return out;
}
