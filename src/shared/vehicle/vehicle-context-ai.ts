import type { VehicleContext } from './vehicle-context';
import { hasMeaningfulVehicleContext, vehicleContextForAi, vehicleContextSummary } from './vehicle-context';

/**
 * v0.6.2 (revize): Tüm AI taslak/akış metinlerinin ORTAK kullandığı, GİZLİLİK-GÜVENLİ araç bağlamı satırı.
 *
 * - Şase No / Motor No KESİNLİKLE yer almaz (vehicleContextSummary yalnız marka/model/yıl/yakıt kullanır).
 * - AI kesin katalog doğrulaması yapıyormuş gibi davranmaz; çıktı "kontrol gerekli" tonludur.
 * - Araç bilgisi eksikse "bilinmiyor / kontrol gerekli" der.
 * - Saf/deterministik; ağ/dosya/log yan etkisi yoktur.
 */
export function vehicleContextAiLine(context?: VehicleContext | null): string {
  if (!hasMeaningfulVehicleContext(context ?? undefined)) {
    return 'Araç bilgisi girilmedi; AI kesin katalog doğrulaması yapmaz, sonuç bilinmiyor/kontrol gerekli.';
  }
  return `Araç: ${vehicleContextSummary(context)} — AI kesin doğrulama yapmaz; uyumsuz/şüpheli kalemler kontrol gerektirir.`;
}

/** Bilgi Bankası araması için GÜVENLİ ek bağlam terimleri (marka/model/kasa; Şase/Motor HARİÇ). */
export function vehicleContextSearchTerms(context?: VehicleContext | null): string[] {
  const safe = vehicleContextForAi(context ?? {});
  return [safe.make, safe.model, safe.bodyType].map((value) => (value ?? '').trim()).filter(Boolean);
}
