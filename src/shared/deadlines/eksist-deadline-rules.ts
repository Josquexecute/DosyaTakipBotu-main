/**
 * v0.6.0 — EKSİST / süre kuralları (SEDDK Atama Yönetmeliği + Genelge 2026/7).
 *
 * SAF veri + saf yardımcılar: ağ/dosya/AI/takvim-UI/hatırlatıcı YOK. Yalnız kural verisi ve
 * basit, yan etkisiz sorgulardır. Süreler "eksper yardımcısı/kontrol" amaçlıdır.
 */
export type DeadlineUnit = 'saat' | 'is-gunu' | 'gun' | 'saat-listesi';

export interface DeadlineRule {
  id: string;
  title: string;
  /** Sayısal değer (saat-listesi türünde kullanılmaz). */
  value: number | null;
  unit: DeadlineUnit;
  detail: string;
  legalReference: string;
}

/** Günlük atama pencereleri (HH:MM). Hafta sonu/resmî tatilde atama yapılmaz. */
export const ATAMA_SAATLERI: readonly string[] = ['09:00', '11:00', '13:00', '16:00'];

export const EKSIST_DEADLINE_RULES: readonly DeadlineRule[] = [
  {
    id: 'atama-saatleri',
    title: 'Atama saatleri',
    value: null, unit: 'saat-listesi',
    detail: 'Atamalar günde 4 kez (09:00/11:00/13:00/16:00) yapılır. Hafta sonu ve resmî tatilde atama yapılmaz; sonrası ilk atama zamanında.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'is-kabul',
    title: 'İş kabul süresi',
    value: 6, unit: 'saat',
    detail: 'Atama bildiriminden itibaren 6 saat içinde EKSİST\'te kabul/ret bildirilmezse iş kabul edilmiş sayılır.',
    legalReference: 'Atama Yönetmeliği m.13 / Genelge 2026/7'
  },
  {
    id: 'sirket-atama',
    title: 'Şirket atama süresi',
    value: 1, unit: 'is-gunu',
    detail: 'Sigorta şirketi, belgeler tamamlandıktan sonra 1 iş günü içinde atama yapar.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'ekspertiz-ayni-il',
    title: 'Aynı il ekspertiz süresi',
    value: 1, unit: 'is-gunu',
    detail: 'Eksper aynı ildeyse atamayı takip eden ilk iş günü içinde ekspertiz işlemini yapar.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'ekspertiz-farkli-il',
    title: 'Farklı il ekspertiz süresi',
    value: 2, unit: 'is-gunu',
    detail: 'Eksper farklı ildeyse en geç 2 iş günü içinde ekspertiz işlemini yapar.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'rapor-trafik',
    title: 'Trafik raporu tamamlama',
    value: 3, unit: 'is-gunu',
    detail: 'Dosya rapor düzenlenebilir hale geldiği tarihten itibaren trafik raporu 3 iş günü içinde tamamlanır.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'rapor-diger-motorlu',
    title: 'Diğer motorlu araç raporu tamamlama',
    value: 5, unit: 'is-gunu',
    detail: 'Diğer motorlu araç sigortalarında rapor 5 iş günü içinde tamamlanır.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'on-rapor-15-gun',
    title: 'Ön rapor sonrası 15 gün',
    value: 15, unit: 'gun',
    detail: 'Ön rapor tarihinden itibaren 15 gün içinde araç ekspertiz için servise bırakılmazsa rapor kapatılır.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'onarim-30-gun',
    title: 'Ekspertiz sonrası onarım 30 gün',
    value: 30, unit: 'gun',
    detail: 'Ekspertiz sonrası onarım için 30 gün içinde araç servise bırakılmazsa ilk tespitlerle gerekçeli rapor tamamlanır.',
    legalReference: 'Genelge 2026/7'
  },
  {
    id: 'itiraz',
    title: 'İtiraz süresi',
    value: 3, unit: 'is-gunu',
    detail: 'Eksper tespitlerine 3 iş günü içinde itiraz edilebilir. Hakem eksper raporu nihai kabul edilir.',
    legalReference: 'Atama Yönetmeliği m.8'
  }
];

/** id → kural. */
export function getDeadlineRule(id: string): DeadlineRule | null {
  return EKSIST_DEADLINE_RULES.find((rule) => rule.id === id) ?? null;
}

/**
 * Verilen "HH:MM" saatinden sonraki ilk atama penceresini döndürür (saf string karşılaştırma).
 * Aynı gün kalan pencere yoksa null döner (ertesi iş gününe geçiş bu modülde hesaplanmaz).
 */
export function nextAtamaSlot(currentHHMM: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(currentHHMM)) return ATAMA_SAATLERI[0] ?? null;
  return ATAMA_SAATLERI.find((slot) => slot > currentHHMM) ?? null;
}
