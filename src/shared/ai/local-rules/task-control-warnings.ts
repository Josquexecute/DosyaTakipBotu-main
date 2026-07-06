/**
 * v0.6.x — "Kontrol gerekli" mantığı: bağlamdaki eksik/belirsiz alanları tek yerden toplar.
 * SAF; ağ/dosya/IPC YOK. missingInputs ve warnings üretimini standartlaştırır.
 */
import type { AiCaseContext } from '../../ai-context/ai-case-context';

export type ControlCheckKey =
  | 'dosyaTuru' | 'hasarTutari' | 'rayic' | 'aracGrubu' | 'degerKaybi' | 'agirHasar'
  | 'sehirKapsami' | 'atamaTarihi' | 'onRaporTarihi' | 'raporaHazirTarihi' | 'kritikParca';

const CHECKS: Record<ControlCheckKey, (ctx: AiCaseContext) => string | null> = {
  dosyaTuru: (ctx) => (ctx.sigortaTuru === null ? 'Dosya türü' : null),
  hasarTutari: (ctx) => (ctx.grossDamageAmount === null ? 'Hasar tutarı' : null),
  rayic: (ctx) => (ctx.marketValue === null ? 'Rayiç bedel' : null),
  aracGrubu: (ctx) => (ctx.vehicleGroup === null ? 'Araç grubu' : null),
  degerKaybi: (ctx) => (ctx.hasValueLoss === null ? 'Değer kaybı (var/yok)' : null),
  agirHasar: (ctx) => (ctx.isHeavyDamage === null ? 'Ağır/tam hasar durumu' : null),
  sehirKapsami: (ctx) => (ctx.cityScope === null ? 'Şehir içi/dışı' : null),
  atamaTarihi: (ctx) => (!ctx.appointmentDate ? 'Atama/ekspertiz talep tarihi' : null),
  onRaporTarihi: (ctx) => (!ctx.preliminaryReportDate ? 'Ön rapor tarihi' : null),
  raporaHazirTarihi: (ctx) => (!ctx.reportReadyDate ? 'Rapora hazır tarihi' : null),
  // Kritik parça bilgisi dosyada tutulmaz; bu görevde her zaman kontrol gerekli kabul edilir.
  kritikParca: () => 'Güvenlik/kritik parça bilgisi'
};

/** Seçilen kontrollerden eksik/belirsiz olanların Türkçe etiketlerini döndürür. */
export function collectMissing(ctx: AiCaseContext, keys: readonly ControlCheckKey[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const label = CHECKS[key](ctx);
    if (label) out.push(label);
  }
  return out;
}

/** Eksik alanlar için tek satır "kontrol gerekli" uyarısı (yoksa boş dizi). */
export function kontrolWarning(missing: readonly string[]): string[] {
  return missing.length ? [`Kontrol gerekli alanlar: ${missing.join(', ')}.`] : [];
}
