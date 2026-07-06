/**
 * v0.6.x — AiCaseContext → AI Yardımcıları form ön-doldurma (renderer state/UI glue).
 *
 * Saf türetmeler `src/shared/ai-context`'tedir. Bu modül yalnız `state.aiHelpers` form alanlarını
 * ön-doldurur (UI bellek) ve rozet üretir. Hiçbir kalıcı yazma, IPC veya ağ YOKTUR.
 */
import type { AiCaseContext, AiFieldProvenance } from '../selectors/ai-case-context';
import type { AiHelpersState } from '../state';
import { deriveTemplateInput, deriveFeePrefill, deriveDeadlineDosyaTuru, primaryMevzuatTerm } from '../../../shared/ai-context/ai-case-context';

export { suggestMevzuatTerms } from '../../../shared/ai-context/ai-case-context';

/**
 * Bağlamı AI Yardımcıları form alanlarına ön-doldurur (yalnız UI state mutasyonu).
 * Kullanıcının düzelttiği alanları (userEdited) ÇAĞIRAN sıfırlar; bu fonksiyon yalnız değer atar.
 */
export function applyContextToAiHelpers(ai: AiHelpersState, ctx: AiCaseContext, options: { setMevzuatFilter?: boolean } = {}): void {
  const tpl = deriveTemplateInput(ctx);
  if (tpl.sigortaTuru) ai.template.sigortaTuru = tpl.sigortaTuru;
  ai.template.degerKaybiDahil = tpl.degerKaybiDahil;
  ai.template.agirVeyaTamHasar = tpl.agirVeyaTamHasar;

  const fee = deriveFeePrefill(ctx);
  ai.fee.kapsam = fee.kapsam;
  ai.fee.brutHasar = fee.brutHasar;
  ai.fee.degerKaybi = fee.degerKaybi;
  ai.fee.sehirDisi = fee.sehirDisi;
  // Araç grubu yalnız ek bağlamdan gelir (otomatik türetilmez); varsa ücret hesabına ön-doldurulur.
  if (fee.vehicleClass) ai.fee.vehicleClass = fee.vehicleClass;

  ai.deadline.dosyaTuru = deriveDeadlineDosyaTuru(ctx);

  if (options.setMevzuatFilter !== false) {
    const primary = primaryMevzuatTerm(ctx);
    if (primary) ai.mevzuatFilter = primary;
  }
}

/** Bağlam kaynağına göre rozet (otomatik/kayıtlı ek bilgi/geçici değişiklik). */
export function aiProvenanceBadge(prov: AiFieldProvenance | undefined): string {
  if (prov === 'saved') return '<span class="aih-badge saved">kaydedilmiş ek bilgi</span>';
  if (prov === 'temp') return '<span class="aih-badge edited">geçici değişiklik</span>';
  if (prov === 'auto') return '<span class="aih-badge from">dosyadan geldi</span>';
  return '';
}

export type AiFieldStatus = 'from-context' | 'user-edited' | 'needs-check' | 'none';

/** Bir form alanının bağlam durumunu belirler (rozet için). */
export function aiFieldStatus(hasContext: boolean, providedByContext: boolean, userEdited: boolean): AiFieldStatus {
  if (!hasContext) return 'none';
  if (userEdited) return 'user-edited';
  return providedByContext ? 'from-context' : 'needs-check';
}

/** Alan durumunu küçük Türkçe rozet HTML'ine çevirir (statik metin). */
export function aiFieldBadge(status: AiFieldStatus): string {
  switch (status) {
    case 'from-context': return '<span class="aih-badge from">dosyadan geldi</span>';
    case 'user-edited': return '<span class="aih-badge edited">geçici değişiklik</span>';
    case 'needs-check': return '<span class="aih-badge check">kontrol gerekli</span>';
    default: return '';
  }
}
