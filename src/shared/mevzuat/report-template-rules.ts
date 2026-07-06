/**
 * v0.6.0 — Rapor şablonu seçim kuralları (SEDDK Genelge 2026/11 m.4).
 *
 * SAF + deterministik: ağ/dosya/AI yok. Yalnız girdiye göre Ek-1.1 / Ek-1.2 / Ek-2 önerir.
 * Sonuç "eksper yardımcısı/kontrol" önerisidir; nihai şablon kararı eksper sorumluluğundadır.
 */
export type SigortaTuru = 'trafik' | 'ihtiyari-mali-sorumluluk' | 'kasko';
export type ReportTemplate = 'Ek-1.1' | 'Ek-1.2' | 'Ek-2';

export interface ReportTemplateInput {
  sigortaTuru: SigortaTuru;
  /** Eksper tam veya ağır hasar tespiti yaptı/yapacak mı. */
  agirVeyaTamHasar?: boolean;
  /** Araç hasarı ile birlikte değer kaybı da değerlendirilecek mi. */
  degerKaybiDahil?: boolean;
}

export interface ReportTemplateResult {
  template: ReportTemplate | null;
  reason: string;
  legalReference: string;
  caution: string;
}

const CAUTION = 'Şablon önerisi eksper yardımcısı bilgisidir; nihai seçim eksper sorumluluğundadır.';

/**
 * Şablon seçimi (Genelge 2026/11 m.4):
 * - Kasko → Ek-2
 * - Trafik + tam/ağır hasar → Ek-1.2 (değer kaybı hariç)
 * - Trafik + araç hasarı (değer kaybı dahil) → Ek-1.1
 * - İhtiyari mali sorumluluk + değer kaybı → Ek-1.1
 * - İhtiyari mali sorumluluk + yalnız araç hasarı → Ek-1.2
 */
export function selectReportTemplate(input: ReportTemplateInput): ReportTemplateResult {
  const ref = 'Genelge 2026/11 m.4';

  if (input.sigortaTuru === 'kasko') {
    return { template: 'Ek-2', reason: 'Kara araçları kasko sigortası dosyası.', legalReference: ref, caution: CAUTION };
  }

  if (input.sigortaTuru === 'trafik') {
    if (input.agirVeyaTamHasar === true) {
      return { template: 'Ek-1.2', reason: 'Trafik sigortasında tam/ağır hasar tespiti (değer kaybı hariç).', legalReference: ref, caution: CAUTION };
    }
    return { template: 'Ek-1.1', reason: 'Trafik sigortasında araç hasarı; değer kaybı dahil değerlendirilir.', legalReference: ref, caution: CAUTION };
  }

  if (input.sigortaTuru === 'ihtiyari-mali-sorumluluk') {
    if (input.degerKaybiDahil === true) {
      return { template: 'Ek-1.1', reason: 'İhtiyari mali sorumlulukta araç hasarı + değer kaybı.', legalReference: ref, caution: CAUTION };
    }
    return { template: 'Ek-1.2', reason: 'İhtiyari mali sorumlulukta yalnızca araç hasarı.', legalReference: ref, caution: CAUTION };
  }

  return {
    template: null,
    reason: 'Sigorta türü tanınmadı; şablon belirlenemedi.',
    legalReference: ref,
    caution: 'Manuel kontrol gerekli.'
  };
}
