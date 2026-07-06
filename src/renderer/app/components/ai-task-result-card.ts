import { escapeHtml } from '../validation';
import { icon } from '../icons';
import type { AiDraftTaskResult } from '../../../shared/ai/ai-task-result-types';

// v0.6.x: AI Taslak sonuç kartı — yalnız önizleme. Kopyalanabilir metin; dosyaya yazma butonu YOK.

const CONF_LABEL: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
const SOURCE_LABEL: Record<string, string> = { case: 'Dosya', aiHelperContext: 'Ek bilgi', mevzuat: 'Mevzuat', calculation: 'Hesap', user: 'Kullanıcı' };

export function renderAiTaskResultCard(result: AiDraftTaskResult | null, copyError: string): string {
  if (!result) return '';
  return `<div class="aih-task-result">
    <div class="aih-task-result-head">
      <b>${escapeHtml(result.title)}</b>
      <span class="aih-conf aih-conf-${result.confidence === 'high' ? 'yuksek' : result.confidence === 'medium' ? 'orta' : 'dusuk'}">Güven: ${escapeHtml(CONF_LABEL[result.confidence] ?? result.confidence)}</span>
      <span class="aih-chip static">Sağlayıcı: ${escapeHtml(result.provider)}</span>
      <span class="aih-chip static">${escapeHtml(result.writePolicy === 'preview_only' ? 'yalnız önizleme' : result.writePolicy)}</span>
    </div>
    <p class="muted">${escapeHtml(result.summary)}</p>
    <label class="aih-field aih-field-wide"><span>Taslak metin (kopyalanabilir)</span>
      <textarea id="aih-task-draft" class="aih-task-draft" rows="8" readonly>${escapeHtml(result.draftText)}</textarea></label>
    <div class="aih-task-actions">
      <button class="primary" data-action="aih-task-copy">${icon('note')}<span>Metni kopyala</span></button>
      <button class="secondary compact" data-action="aih-task-clear">Sonucu temizle</button>
    </div>
    ${copyError ? `<div class="app-alert warning">${icon('warning')}<span>${escapeHtml(copyError)}</span></div>` : ''}
    ${result.sections.length ? `<div class="aih-task-sections">${result.sections.map((s) => `<div class="aih-task-section"><h5>${escapeHtml(s.title)}</h5><p>${escapeHtml(s.content).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>` : ''}
    ${result.evidence.length ? `<div class="aih-task-block"><h5>Kullanılan dosya verileri</h5><div class="aih-evidence">${result.evidence.map((e) => `<div class="aih-evidence-row"><span>${escapeHtml(e.label)}</span><span>${escapeHtml(e.value)}</span><small>${escapeHtml(SOURCE_LABEL[e.source] ?? e.source)}</small></div>`).join('')}</div></div>` : ''}
    ${result.mevzuatReferences.length ? `<div class="aih-task-block"><h5>Mevzuat referansları</h5><ul>${result.mevzuatReferences.map((r) => `<li><b>${escapeHtml(r.title)}</b>${r.legalReference ? ` — ${escapeHtml(r.legalReference)}` : ''}${r.rule ? `<br><small>${escapeHtml(r.rule)}</small>` : ''}</li>`).join('')}</ul></div>` : ''}
    ${result.missingInputs.length ? `<div class="app-alert warning">${icon('warning')}<span><b>Eksik girdiler:</b> ${escapeHtml(result.missingInputs.join(', '))}</span></div>` : ''}
    ${result.warnings.length ? `<div class="app-alert info">${icon('info')}<span>${escapeHtml(result.warnings.join(' • '))}</span></div>` : ''}
    <p class="muted">Bu çıktı taslak/kontrol amaçlıdır; kesin karar değildir ve hiçbir dosyaya yazılmaz.</p>
  </div>`;
}
