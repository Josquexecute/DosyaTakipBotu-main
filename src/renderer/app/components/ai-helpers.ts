import type { UiState, AiHelperTool } from '../state';
import { selectedCase } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { MEVZUAT_DISCLAIMER } from '../../../shared/mevzuat/mevzuat-index';
import type { AiCaseContext } from '../selectors/ai-case-context';
import { buildEffectiveAiContext } from '../utils/ai-extra-context-mapping';
import { renderAiCaseContextCard } from './ai-case-context-card';
import { renderAiCaseExtraContextPanel } from './ai-case-extra-context-panel';
import { renderMevzuatBrowser } from './mevzuat-browser';
import { renderReportTemplateHelper } from './report-template-helper';
import { renderExpertiseFeeHelper } from './expertise-fee-helper';
import { renderDeadlineHelper } from './deadline-helper';
import { renderValueLossHelper } from './value-loss-helper';
import { renderAiTaskGenerator } from './ai-task-generator';

// v0.6.x: "Mevzuat & AI Yardımcıları" alanı. Seçili dosya bağlamı + kullanıcı onaylı ek bilgiler +
// 4 yardımcı. Yardımcılar salt-okunur; ek bilgiler yalnız kullanıcı "Kaydet" deyince yazılır.

const TOOLS: ReadonlyArray<{ key: AiHelperTool; label: string; iconName: string; desc: string }> = [
  { key: 'sablon', label: 'Rapor Şablonu Seçici', iconName: 'details', desc: 'Ek-1.1 / Ek-1.2 / Ek-2 önerisi' },
  { key: 'ucret', label: 'Ekspertiz Ücreti Hesap', iconName: 'labor', desc: 'EK-1 / EK-2 taban tarife hesabı' },
  { key: 'sure', label: 'EKSİST / Süre Kontrol', iconName: 'calendar', desc: 'Atama ve rapor süre kuralları' },
  { key: 'deger-kaybi', label: 'AI Değer Kaybı Yardımcısı', iconName: 'risk', desc: '01.07.2026 sonrası trafik değer kaybı kontrolü' },
  { key: 'mevzuat', label: 'Mevzuat Bilgi Bankası', iconName: 'document', desc: 'SEDDK yönetmelik ve genelge maddeleri' }
];

export function renderAiHelpers(state: UiState): string {
  const active = state.aiHelpers.activeTool;
  // Efektif bağlam = otomatik + kayıtlı ek bilgi + geçici form değişiklikleri (yazma yok).
  const ctx = buildEffectiveAiContext(selectedCase(), state.aiHelpers.extra);
  return `<div class="info-card wide ai-helpers-card">
    <h3>${icon('ai')} Mevzuat & AI Yardımcıları</h3>
    <p class="settings-help">SEDDK mevzuat bilgisi, rapor şablonu önerisi, ekspertiz ücret hesabı ve süre kuralları. Tümü yereldir; internet/harici AI kullanılmaz. Dosya seçiliyken alanlar dosyadan ön-doldurulur; eksik alanlar "Dosya Ek Bilgileri" ile kullanıcı onayıyla tamamlanabilir.</p>
    ${renderAiCaseContextCard(ctx, { previewOnly: !state.hasManualWorkingFolderSelection })}
    ${renderAiCaseExtraContextPanel(state)}
    <div class="aih-tools">
      ${TOOLS.map((tool) => `<button class="aih-tool ${active === tool.key ? 'active' : ''}" data-action="aih-tool" data-aih-tool="${tool.key}">
        ${icon(tool.iconName)}<span class="aih-tool-label">${escapeHtml(tool.label)}</span><small>${escapeHtml(tool.desc)}</small>
      </button>`).join('')}
    </div>
    <div class="aih-active">
      ${renderActiveTool(state, active, ctx)}
    </div>
    ${renderAiTaskGenerator(state)}
    <div class="app-alert info aih-footer">${icon('info')}<span>${escapeHtml(MEVZUAT_DISCLAIMER)} Bu alan mevzuat bilgilerini karar destek amacıyla gösterir; nihai değerlendirme kullanıcı/eksper sorumluluğundadır.</span></div>
    <p class="muted aih-infra-note">AI altyapısı şu an <b>yerel</b> çalışır (mod: yerel kural motoru); harici/online AI sağlayıcı <b>kapalıdır</b>. Online AI sağlayıcıları sonraki görevde, kullanıcı açık onayıyla etkinleştirilecektir.</p>
  </div>`;
}

function renderActiveTool(state: UiState, tool: AiHelperTool, ctx: AiCaseContext | null): string {
  switch (tool) {
    case 'mevzuat': return renderMevzuatBrowser(state, ctx);
    case 'sablon': return renderReportTemplateHelper(state, ctx);
    case 'ucret': return renderExpertiseFeeHelper(state, ctx);
    case 'sure': return renderDeadlineHelper(state, ctx);
    case 'deger-kaybi': return renderValueLossHelper(state, ctx);
    default: return renderMevzuatBrowser(state, ctx);
  }
}
