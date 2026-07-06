/**
 * v0.6.x — AI İşçilik v3.6/v3.7: "Onaylı Parça Kodu Adayları" yönetim paneli (filtre/arama/kaynak + duplicate yenileme).
 * Yalnız yerel kayıt yönetimi; Excel'e/D sütununa/ana veriye yazma YOK. Linkler otomatik indirilmez (yalnız gösterilir).
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import { filterAiModeCandidates, type AiModeCandidateFilter } from '../../../shared/labor/ai-mode-part-candidate-store';
import type { ApprovedAiModePartCandidateEntry } from '../../../shared/labor/ai-mode-part-candidate-store-types';

const STATUS_TR: Record<string, string> = {
  same: 'D kodu ile uyumlu', different: 'D kodundan farklı (kontrol)', missing_existing: 'D kodu yok', missing_candidate: 'aday kod yok'
};
const CONF_TR: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
const FILTERS: Array<[AiModeCandidateFilter, string]> = [
  ['all', 'Tümü'], ['active', 'Aktif'], ['passive', 'Pasif'], ['different', 'Farklı D kodu'], ['missing', 'D kodu yok'], ['sources', 'Kaynaklı']
];

function summary(e: ApprovedAiModePartCandidateEntry): string {
  const vehicle = [e.vehicleModel, e.chassisPrefix, e.engineCode].filter(Boolean).join(' / ');
  return `${escapeHtml(e.partName)} • <b>${escapeHtml(e.candidatePartCode)}</b> • ${escapeHtml(e.partKind)} • ${escapeHtml(CONF_TR[e.confidence])} güven${vehicle ? ` • ${escapeHtml(vehicle)}` : ''}`;
}

function renderEntry(state: UiState, e: ApprovedAiModePartCandidateEntry): string {
  const status = e.isActive ? '<span class="ai-mode-store-active">Aktif</span>' : '<span class="ai-mode-store-passive">Pasif</span>';
  const cmp = e.comparisonWithExistingCode ? STATUS_TR[e.comparisonWithExistingCode.status] ?? '' : '';
  const created = (e.createdAt || '').slice(0, 10);
  const updated = e.updatedAt ? ` • güncelleme: ${escapeHtml(e.updatedAt.slice(0, 10))}` : '';
  const warn = e.warnings.length ? `<div class="ai-mode-cand-warn">⚠ ${escapeHtml(e.warnings.join(' '))}</div>` : '';
  const sourcesOpen = state.aiModePartSearch.sourcesExpanded[e.id];
  const sources = e.sources.length
    ? `<div><button class="secondary compact" data-action="aimode-store-toggle-sources" data-id="${escapeHtml(e.id)}">${sourcesOpen ? 'Kaynakları Gizle' : `Kaynakları Göster (${e.sources.length})`}</button>${sourcesOpen ? `<div class="ai-mode-cand-sources">${e.sources.map((s) => `<a href="${escapeHtml(s)}" target="_blank" rel="noreferrer noopener">${escapeHtml(s)}</a>`).join(' ')}</div>` : ''}</div>`
    : '<span class="ai-mode-store-meta">kaynak yok</span>';
  return `<li class="ai-mode-store-entry">
    <div>${summary(e)} ${status}</div>
    <div class="ai-mode-store-cmp">${escapeHtml(cmp)}${e.existingPartCode ? ` (mevcut D: ${escapeHtml(e.existingPartCode)})` : ''} • oluşturma: ${escapeHtml(created)}${updated}</div>
    ${warn}
    ${sources}
    <div class="ai-mode-store-actions">
      ${e.isActive
        ? `<button class="secondary compact" data-action="aimode-store-deactivate" data-id="${escapeHtml(e.id)}">Pasifleştir</button>`
        : `<button class="secondary compact" data-action="aimode-store-reactivate" data-id="${escapeHtml(e.id)}">Yeniden Aktifleştir</button>`}
      <button class="secondary compact danger" data-action="aimode-store-delete" data-id="${escapeHtml(e.id)}">Sil</button>
    </div>
  </li>`;
}

function renderDuplicatePrompt(state: UiState): string {
  const pd = state.aiModePartSearch.pendingDuplicate;
  if (!pd) return '';
  return `<div class="ai-mode-dup-prompt">
    <div class="ai-mode-dup-badge">Mevcut aday var</div>
    <div>Mevcut aktif kayıt: ${summary(pd.existing)} • oluşturma: ${escapeHtml((pd.existing.createdAt || '').slice(0, 10))}</div>
    <div>Yeni aday: ${summary(pd.newEntry)}</div>
    <div class="ai-mode-store-actions">
      <button class="primary compact" data-action="aimode-replace-dup">Eski Kaydı Pasifleştir + Yeni Adayı Kaydet</button>
      <button class="secondary compact" data-action="aimode-replace-cancel">Vazgeç</button>
    </div>
  </div>`;
}

/** Onaylı aday havuzu yönetim bölümünü döner. */
export function renderAiModePartCandidateStoreManager(state: UiState): string {
  const store = state.aiModePartSearch.store;
  const prompt = renderDuplicatePrompt(state);
  if (!store) {
    return `<div class="ai-mode-store">${prompt}<button class="secondary compact" data-action="aimode-store-manage">Onaylı Parça Kodu Adaylarını Göster</button></div>`;
  }
  const filtered = filterAiModeCandidates(store.entries, state.aiModePartSearch.storeFilter, state.aiModePartSearch.storeSearch);
  const recent = filtered.slice(-12).reverse();
  const filterButtons = FILTERS.map(([f, label]) => `<button class="secondary compact ${state.aiModePartSearch.storeFilter === f ? 'active' : ''}" data-action="aimode-store-filter" data-filter="${f}">${label}</button>`).join('');
  return `<div class="ai-mode-store">
    ${prompt}
    <div class="ai-mode-store-summary">
      <b>Onaylı Parça Kodu Adayları</b>
      <span>Aktif: <b>${store.activeCount}</b></span>
      <span>Pasif: <b>${store.passiveCount}</b></span>
      <button class="secondary compact" data-action="aimode-store-manage">Yenile</button>
    </div>
    <div class="ai-mode-store-filters">${filterButtons}</div>
    <input id="aimode-store-search" class="ai-mode-store-search" type="search" placeholder="Ara: parça adı / kod / araç / kaynak…" value="${escapeHtml(state.aiModePartSearch.storeSearch)}" data-aimode-store-search aria-label="Aday havuzunda ara" />
    ${store.corrupt ? `<p class="ai-mode-cand-warn">Aday havuzu dosyası bozuk olduğu için yok sayıldı; mevcut akış etkilenmez.</p>` : ''}
    ${filtered.length === 0 ? '<p class="ai-mode-store-empty">Filtreye uyan kayıt yok.</p>' : `<ul class="ai-mode-store-list">${recent.map((e) => renderEntry(state, e)).join('')}</ul>`}
  </div>`;
}
