import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { EKSIST_DEADLINE_RULES, ATAMA_SAATLERI } from '../../../shared/deadlines/eksist-deadline-rules';
import type { AiCaseContext } from '../selectors/ai-case-context';
import { aiFieldStatus, aiFieldBadge } from '../utils/ai-context-mapping';

// v0.6.x: EKSİST / Süre Kontrol Yardımcısı — sabit kural verisi + basit, salt-okunur öneri.
// Otomatik hatırlatıcı / takvim / kalıcı dosya yazımı YOKTUR. Dosya seçiliyken dosya türü ön-doldurulur.

export function renderDeadlineHelper(state: UiState, ctx: AiCaseContext | null): string {
  const d = state.aiHelpers.deadline;
  const has = !!ctx;
  const badgeTur = aiFieldBadge(aiFieldStatus(has, !!ctx && ctx.claimType !== 'unknown', state.aiHelpers.userEdited['deadline.dosyaTuru'] === true));
  const ekspertizSuresi = d.ilDurumu === 'ayni'
    ? 'Atamayı takip eden ilk iş günü'
    : 'En geç 2 iş günü';
  const raporSuresi = d.dosyaTuru === 'trafik'
    ? 'Trafik raporu: 3 iş günü (dosya rapora hazır olduğu tarihten itibaren)'
    : 'Diğer motorlu araç sigortaları: 5 iş günü (dosya rapora hazır olduğu tarihten itibaren)';

  return `<div class="aih-panel">
    <p class="settings-help">SEDDK Atama Yönetmeliği ve Genelge 2026/7'deki atama ve süre kuralları. Yalnız bilgilendirme/kontrol amaçlıdır.</p>

    <div class="aih-form">
      <label class="aih-field"><span>Eksperin konumu</span>
        <select data-aih="deadline.ilDurumu">
          <option value="ayni" ${d.ilDurumu === 'ayni' ? 'selected' : ''}>Aynı il</option>
          <option value="farkli" ${d.ilDurumu === 'farkli' ? 'selected' : ''}>Farklı il</option>
        </select>
      </label>
      <label class="aih-field"><span>Dosya türü ${badgeTur}</span>
        <select data-aih="deadline.dosyaTuru">
          <option value="trafik" ${d.dosyaTuru === 'trafik' ? 'selected' : ''}>Trafik</option>
          <option value="diger-motorlu" ${d.dosyaTuru === 'diger-motorlu' ? 'selected' : ''}>Diğer motorlu araç</option>
        </select>
      </label>
    </div>
    ${has ? '<p class="muted aih-prefill-note">Dosya türü dosya bağlamından ön-doldurulmuştur. Süreler takip amaçlıdır, kesin süre hesabı değildir; resmî tatil/hafta sonu kullanıcı tarafından teyit edilmelidir.</p>' : ''}

    <div class="aih-result">
      <div class="aih-result-head">${icon('calendar')}<span>Seçime göre geçerli süreler</span></div>
      <p><b>Ekspertiz işlemi:</b> ${escapeHtml(ekspertizSuresi)}</p>
      <p><b>Rapor tamamlama:</b> ${escapeHtml(raporSuresi)}</p>
      <p><b>İş kabulü:</b> 6 saat (bildirilmezse kabul edilmiş sayılır)</p>
      <div class="app-alert warning">${icon('warning')}<span>Gecikme riski ve iş günü hesabı (resmî tatil/hafta sonu) eksper sorumluluğundadır; bu ekran otomatik hatırlatma yapmaz.</span></div>
    </div>

    <div class="aih-deadline-block">
      <h4>Atama saatleri</h4>
      <div class="aih-chips">${ATAMA_SAATLERI.map((s) => `<span class="aih-chip static">${escapeHtml(s)}</span>`).join('')}</div>
      <p class="muted">Hafta sonu ve resmî tatilde atama yapılmaz; sonrası ilk atama zamanında yapılır.</p>
    </div>

    <div class="aih-deadline-block">
      <h4>Tüm süre kuralları</h4>
      <div class="aih-rule-list">
        ${EKSIST_DEADLINE_RULES.map((rule) => `<div class="aih-rule-item">
          <span class="aih-rule-title"><b>${escapeHtml(rule.title)}</b><small>${escapeHtml(rule.legalReference)}</small></span>
          <span class="aih-rule-detail">${escapeHtml(rule.detail)}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}
