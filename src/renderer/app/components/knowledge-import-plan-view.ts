import type { KnowledgeImportPlan } from '../../../shared/knowledge';
import { buildKnowledgeImportPlanViewModel, type KnowledgeImportApprovalReducerState, type KnowledgeImportCandidateView, type KnowledgeImportPlanMetricView } from '../../../shared/knowledge';
import { escapeHtml, formatDate } from '../validation';

export function renderKnowledgeImportPlanView(plan: KnowledgeImportPlan | null, approvalState?: KnowledgeImportApprovalReducerState): string {
  if (!plan) return renderEmptyKnowledgeImportPlanView();
  const view = buildKnowledgeImportPlanViewModel(plan, approvalState);
  return `<section class="knowledge-import-plan-view" aria-label="Knowledge import dry-run plan">
    <div class="knowledge-import-plan-header">
      <div>
        <h4>Import Plan Hazirlik</h4>
        <p class="settings-help">Pasif dry-run goruntuleme. Bu bolum aktif import, dosya alma akisi veya kaydetme aksiyonu sunmaz.</p>
      </div>
      <span class="status-chip warning">${escapeHtml(view.canWriteLabel)}</span>
    </div>
    <div class="knowledge-import-plan-meta">
      <span><small>planId</small><b>${escapeHtml(view.planId)}</b></span>
      <span><small>createdAt</small><b>${escapeHtml(formatDate(view.createdAt))}</b></span>
      <span><small>mode</small><b>${escapeHtml(view.modeLabel)}</b></span>
      <span><small>canWrite</small><b>${view.canWrite ? 'true' : 'false'}</b></span>
    </div>
    ${renderMetrics(view.metrics)}
    ${renderSafetyNotes(view.safetyNotes)}
    ${renderWarnings(view.warnings)}
    <div class="knowledge-import-candidate-list">
      ${view.candidates.length ? view.candidates.map(renderCandidate).join('') : '<div class="knowledge-empty">Dry-run plan adayi yok.</div>'}
    </div>
  </section>`;
}

export function renderEmptyKnowledgeImportPlanView(): string {
  return `<section class="knowledge-import-plan-view passive" aria-label="Knowledge import dry-run plan hazirlik">
    <div class="knowledge-import-plan-header">
      <div>
        <h4>Import Plan Hazirlik</h4>
        <p class="settings-help">Bu ekran sadece ilerideki dry-run plan goruntuleme modelini temsil eder. Aktif import akisi yoktur.</p>
      </div>
      <span class="status-chip info">Hazirlik</span>
    </div>
    ${renderSafetyNotes([
      'Bu ekran sadece import planini gosterir.',
      'Bu asamada dosya icerigi okunmaz.',
      'Bu asamada bilgi bankasina kalici kaynak eklenmez.',
      'takip.json, Excel veya AppData yazilmaz.',
      'Onay akisi hazirlik durumundadir; bu surumde import calistirilmaz.',
      'Plan canWrite=false olarak uretilir.'
    ])}
  </section>`;
}

function renderMetrics(metrics: KnowledgeImportPlanMetricView[]): string {
  return `<div class="knowledge-import-plan-summary">${metrics.map((metric) => `<span class="${escapeHtml(metric.tone)}"><small>${escapeHtml(metric.label)}</small><b>${escapeHtml(metric.value)}</b></span>`).join('')}</div>`;
}

function renderCandidate(candidate: KnowledgeImportCandidateView): string {
  return `<article class="knowledge-import-candidate ${escapeHtml(candidate.permissionTone)}">
    <div class="knowledge-import-candidate-head">
      <div>
        <b>${escapeHtml(candidate.fileName)}</b>
        <small>${escapeHtml(candidate.fileExtension)} / ${escapeHtml(candidate.detectedSourceType)} / ${escapeHtml(candidate.detectedSourceKind)}</small>
      </div>
      <span class="status-chip ${escapeHtml(candidate.permissionTone)}">${escapeHtml(candidate.permissionLabel)}</span>
    </div>
    <div class="knowledge-import-plan-meta compact">
      <span><small>Baslik</small><b>${escapeHtml(candidate.detectedTitle)}</b></span>
      <span><small>Onay durumu</small><b>${escapeHtml(candidate.approvalLabel)}${candidate.approvalDecided ? ' (karar)' : ' (varsayilan)'}</b></span>
      <span><small>canWrite</small><b>${candidate.canWrite ? 'true' : 'false'}</b></span>
    </div>
    <div class="knowledge-chip-list">${candidate.detectedTags.length ? candidate.detectedTags.map((tag) => `<span class="knowledge-badge">${escapeHtml(tag.replace(/_/g, ' '))}</span>`).join('') : '<span class="knowledge-muted">Etiket yok.</span>'}</div>
    ${renderList('Uyarilar', candidate.warnings)}
    ${renderList('Gerekceler', candidate.reasons)}
  </article>`;
}

function renderSafetyNotes(notes: readonly string[]): string {
  return `<div class="knowledge-import-safety-notes">${notes.map((note) => `<div class="app-alert info"><span>${escapeHtml(note)}</span></div>`).join('')}</div>`;
}

function renderWarnings(warnings: readonly string[]): string {
  return warnings.length ? `<div class="app-alert warning"><span>${escapeHtml(warnings.join(' '))}</span></div>` : '';
}

function renderList(title: string, items: readonly string[]): string {
  if (items.length === 0) return '';
  return `<details class="knowledge-import-detail-list">
    <summary>${escapeHtml(title)} (${items.length})</summary>
    <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </details>`;
}
