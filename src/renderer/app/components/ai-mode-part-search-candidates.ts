/**
 * v0.6.x — AI İşçilik v3.5: AI Mode parça kodu adayları listesi + satıra bağlı evidence notu (yalnız gösterim).
 * "D sütununa yaz" / "Excel'e uygula" butonu İÇERMEZ; aday yalnız öneri/evidence olarak bağlanır.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import type { AiModePartCandidate } from '../../../shared/labor/ai-mode-part-search-types';

const KIND_TR: Record<string, string> = {
  orijinal: 'Orijinal', oem: 'OEM', esdeger: 'Eşdeğer', yan_sanayi: 'Yan sanayi',
  yeniden_kullanilabilir: 'Çıkma/Yeniden kullanılabilir', belirsiz: 'Belirsiz'
};
const CONF_TR: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

function renderCandidate(c: AiModePartCandidate, index: number): string {
  const sources = c.sources.length ? `<div class="ai-mode-cand-sources">${c.sources.map((s) => `<a href="${escapeHtml(s)}" target="_blank" rel="noreferrer noopener">${escapeHtml(s)}</a>`).join(' ')}</div>` : '';
  const warnings = c.warnings.length ? `<div class="ai-mode-cand-warn">${c.warnings.map((w) => `⚠ ${escapeHtml(w)}`).join(' ')}</div>` : '';
  return `<li class="ai-mode-cand ai-mode-cand-${c.confidence}">
    <div class="ai-mode-cand-head"><b>${escapeHtml(c.partCode || '(kod yok)')}</b> <span class="ai-mode-cand-kind">${escapeHtml(KIND_TR[c.partKind ?? 'belirsiz'] ?? '')}</span> <span class="ai-mode-cand-conf">Güven: ${escapeHtml(CONF_TR[c.confidence])}</span></div>
    ${c.partName ? `<div class="ai-mode-cand-name">${escapeHtml(c.partName)}</div>` : ''}
    ${c.compatibility ? `<div class="ai-mode-cand-compat">${escapeHtml(c.compatibility)}</div>` : ''}
    ${warnings}
    ${sources}
    <div class="ai-mode-cand-actions">
      <button class="secondary compact" data-action="aimode-link" data-aimode-index="${index}">Evidence olarak bağla</button>
      <button class="primary compact" data-action="aimode-approve-store" data-aimode-index="${index}">Onayla ve Aday Havuzuna Kaydet</button>
    </div>
  </li>`;
}

/** Aday listesini döner (aday yoksa boş string). */
export function renderAiModeCandidates(state: UiState): string {
  const candidates = state.aiModePartSearch.candidates;
  if (!candidates.length) return '';
  return `<div class="ai-mode-candidates">
    <h4>Parça Kodu Adayları <small>(yalnız öneri/evidence — Excel'e yazılmaz)</small></h4>
    <ul class="ai-mode-cand-list">${candidates.map(renderCandidate).join('')}</ul>
  </div>`;
}

/** Bir önizleme satırına bağlı AI Mode evidence notunu döner (yoksa boş string). */
export function renderAiModeLinkedEvidence(state: UiState, rowNumber: number): string {
  const c = state.aiModePartSearch.linkedByRow[rowNumber];
  if (!c) return '';
  return `<div class="ai-mode-linked-evidence">Google AI Mode manuel araştırmasından parça kodu adayı bağlandı: <b>${escapeHtml(c.partCode || '(kod yok)')}</b> (${escapeHtml(CONF_TR[c.confidence])} güven). Kullanıcı onayı olmadan Excel'e yazılmaz.</div>`;
}
