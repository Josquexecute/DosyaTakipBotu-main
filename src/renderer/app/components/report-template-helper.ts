import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { selectReportTemplate } from '../../../shared/mevzuat/report-template-rules';
import type { AiCaseContext } from '../selectors/ai-case-context';
import { aiFieldStatus, aiFieldBadge } from '../utils/ai-context-mapping';

// v0.6.x: Rapor Şablonu Seçici — saf selectReportTemplate ile yalnız ÖNERİ gösterir; yazma yok.
// Dosya seçiliyken alanlar dosya bağlamından ön-doldurulur (rozetlerle işaretli).

export function renderReportTemplateHelper(state: UiState, ctx: AiCaseContext | null): string {
  const t = state.aiHelpers.template;
  const edited = state.aiHelpers.userEdited;
  const has = !!ctx;
  const badgeTuru = aiFieldBadge(aiFieldStatus(has, !!ctx && ctx.claimType !== 'unknown', edited['template.sigortaTuru'] === true));
  const badgeDk = aiFieldBadge(aiFieldStatus(has, !!ctx && ctx.hasValueLoss !== null, edited['template.degerKaybiDahil'] === true));
  const badgeAgir = aiFieldBadge(aiFieldStatus(has, !!ctx && ctx.isHeavyDamage !== null, edited['template.agirVeyaTamHasar'] === true));
  const result = selectReportTemplate({
    sigortaTuru: t.sigortaTuru,
    degerKaybiDahil: t.degerKaybiDahil,
    agirVeyaTamHasar: t.agirVeyaTamHasar
  });

  return `<div class="aih-panel">
    <p class="settings-help">Dosya türü ve hasar niteliğine göre kullanılacak ekspertiz raporu şablonunu önerir (SEDDK Genelge 2026/11).</p>
    ${has ? '<p class="muted aih-prefill-note">Alanlar dosya bağlamından ön-doldurulmuştur; eksper kontrolü gerektirir ve dosyaya yazılmaz.</p>' : ''}
    <div class="aih-form">
      <label class="aih-field"><span>Dosya türü ${badgeTuru}</span>
        <select data-aih="template.sigortaTuru">
          <option value="trafik" ${t.sigortaTuru === 'trafik' ? 'selected' : ''}>Trafik / ZMSS</option>
          <option value="ihtiyari-mali-sorumluluk" ${t.sigortaTuru === 'ihtiyari-mali-sorumluluk' ? 'selected' : ''}>İhtiyari Mali Sorumluluk</option>
          <option value="kasko" ${t.sigortaTuru === 'kasko' ? 'selected' : ''}>Kasko</option>
        </select>
      </label>
      <label class="aih-check"><input type="checkbox" data-aih="template.degerKaybiDahil" ${t.degerKaybiDahil ? 'checked' : ''} /> <span>Değer kaybı da değerlendirilecek (sadece araç hasarı değil) ${badgeDk}</span></label>
      <label class="aih-check"><input type="checkbox" data-aih="template.agirVeyaTamHasar" ${t.agirVeyaTamHasar ? 'checked' : ''} /> <span>Ağır hasar / tam hasar var ${badgeAgir}</span></label>
    </div>
    <div class="aih-result">
      <div class="aih-result-head">${icon('document')}<span>Önerilen şablon:</span> <b class="aih-template-badge">${result.template ? escapeHtml(result.template) : 'Belirlenemedi'}</b></div>
      <p><b>Gerekçe:</b> ${escapeHtml(result.reason)}</p>
      <p class="muted"><b>Mevzuat:</b> ${escapeHtml(result.legalReference)}</p>
      <div class="app-alert warning">${icon('warning')}<span>${escapeHtml(result.caution)}</span></div>
    </div>
  </div>`;
}
