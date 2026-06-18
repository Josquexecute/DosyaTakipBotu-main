import type { CaseIndexItem } from '../../../shared/types';
import type { CaseSortMode, UiState } from '../state';
import { escapeHtml, formatDate } from '../validation';
import { normalizeSearch } from '../../../shared/turkish';
import { isDailyOpenCase, matchesDailyWorkFilter, todayLocalDateInput } from '../../../shared/daily-work';
import { renderQuickFilterStrip } from './dashboard';
import { icon } from '../icons';

export const CASE_ROW_HEIGHT = 34;
const OVERSCAN = 10;
const VIEWPORT_FALLBACK_ROWS = 24;
const HEADER_HEIGHT = 32;
const VIRTUAL_LIST_THRESHOLD = 1500;

export function renderCaseList(state: UiState): string {
  const filtered = getFilteredCases(state.cases, state.search, state.filter, state.responsibleFilter, state.serviceFilter, state.statusFilter, state.sortMode, state.settings?.activeUser ?? '');
  const selected = state.cases.find((item) => item.folderPath === state.selectedFolderPath) ?? null;
  const modeText = filtered.length > VIRTUAL_LIST_THRESHOLD
    ? 'büyük liste modu: görünen satırlar anlık çizilir'
    : 'tüm dosyalar listeleniyor';

  if (filtered.length <= VIRTUAL_LIST_THRESHOLD) {
    return `<section class="case-workbench ${filtered.length <= 12 ? 'short-list' : 'long-list'}">
      <div class="list-card compact-list-card">
        <div class="list-toolbar compact-list-toolbar">
          ${renderCaseListHeader(filtered.length, modeText)}
          ${renderFilterSelects(state)}
          ${renderAdvancedFilters(state)}
        </div>
        <div class="table-wrap">
          <table class="case-table compact-case-table">
            <thead><tr><th>Plaka</th><th>Dosya No</th><th>İhbar No</th><th>Ay / Klasör</th><th>Durum</th><th>Sorumlu</th><th>Öncelik</th><th>Eksik</th><th>Son İşlem</th><th>Takip Tarihi</th></tr></thead>
            <tbody>${renderAllRows(filtered, state.selectedFolderPath)}</tbody>
          </table>
        </div>
      </div>
      ${renderSelectedCaseSummary(selected)}
    </section>`;
  }

  const viewportHeight = VIEWPORT_FALLBACK_ROWS * CASE_ROW_HEIGHT;
  const totalHeight = filtered.length * CASE_ROW_HEIGHT;
  const rowsHtml = renderCaseVirtualRows(filtered, state.selectedFolderPath, state.caseListScrollTop, viewportHeight);

  return `<section class="case-workbench long-list">
    <div class="list-card compact-list-card">
      <div class="list-toolbar compact-list-toolbar">
        ${renderCaseListHeader(filtered.length, modeText)}
        ${renderFilterSelects(state)}
        ${renderAdvancedFilters(state)}
      </div>
      <div class="virtual-case-list" data-virtual-list="cases" style="--row-height:${CASE_ROW_HEIGHT}px;">
        <div class="virtual-header compact-virtual-header"><span>Plaka</span><span>Dosya No</span><span>İhbar No</span><span>Ay / Klasör</span><span>Durum</span><span>Sorumlu</span><span>Eksik</span><span>Takip</span></div>
        <div class="virtual-body" data-virtual-body="cases" style="height:${Math.max(totalHeight, viewportHeight)}px;">
          ${rowsHtml}
        </div>
      </div>
    </div>
    ${renderSelectedCaseSummary(selected)}
  </section>`;
}

export function getFilteredCases(cases: CaseIndexItem[], query: string, filter: string, responsibleFilter = 'all', serviceFilter = 'all', statusFilter = 'all', sortMode: CaseSortMode = 'plate-az', activeUser = '', today = todayLocalDateInput()): CaseIndexItem[] {
  const q = normalizeSearch(query);
  const filtered = cases.filter((item) => {
    const searchText = item.searchText ?? normalizeSearch([item.plate, item.dosyaNo, item.officeFileNo, item.claimNoticeNo, item.sorumlu, item.serviceName].join(' '));
    if (q && !searchText.includes(q)) return false;
    if (!matchesResponsibleFilter(item, responsibleFilter)) return false;
    if (!matchesServiceFilter(item, serviceFilter)) return false;
    if (!matchesStatusFilter(item, statusFilter)) return false;
    switch (filter) {
      case 'mine': return matchesDailyWorkFilter(item, 'mine', activeUser, today);
      case 'overdue': return matchesDailyWorkFilter(item, 'overdue', activeUser, today);
      case 'today': return matchesDailyWorkFilter(item, 'today', activeUser, today);
      case 'week': return matchesDailyWorkFilter(item, 'week', activeUser, today);
      case 'risk': return matchesDailyWorkFilter(item, 'risk', activeUser, today);
      case 'unassigned': return matchesDailyWorkFilter(item, 'unassigned', activeUser, today);
      case 'stale': return matchesDailyWorkFilter(item, 'stale', activeUser, today);
      case 'quality': return matchesDailyWorkFilter(item, 'quality', activeUser, today);
      case 'open': return isDailyOpenCase(item);
      case 'closed': return item.isClosedFolder || item.workflowStatus === 'Kapalı';
      case 'missing-docs': return isDailyOpenCase(item) && item.documentAnalysis.missingCritical.length > 0;
      case 'missing-photos': return isDailyOpenCase(item) && hasMissingPhotoAction(item);
      case 'photo-format': return isDailyOpenCase(item) && item.photoAnalysis.unsupportedFiles.length > 0;
      case 'portal': return isDailyOpenCase(item) && item.tracking.portalChecklist.some((x) => !x.completed);
      case 'rucu': return isDailyOpenCase(item) && (item.tracking.rucu.potansiyel || item.documentAnalysis.counterpartyPolicyCandidate);
      default: return true;
    }
  });
  return sortCases(filtered, sortMode);
}

export function renderCaseVirtualRows(filtered: CaseIndexItem[], selectedFolderPath: string, scrollTop: number, viewportHeight: number): string {
  if (filtered.length === 0) return `<div class="empty-list-state">${icon('search')}<h3>Arama sonucunda dosya bulunamadı</h3><p>Filtreleri temizleyin veya farklı anahtar kelime deneyin.</p></div>`;
  const rowsInViewport = Math.max(1, Math.ceil(Math.max(viewportHeight - HEADER_HEIGHT, CASE_ROW_HEIGHT) / CASE_ROW_HEIGHT));
  const maxStart = Math.max(0, filtered.length - rowsInViewport - OVERSCAN);
  const start = Math.min(maxStart, Math.max(0, Math.floor(scrollTop / CASE_ROW_HEIGHT) - OVERSCAN));
  const end = Math.min(filtered.length, start + rowsInViewport + OVERSCAN * 2);
  return filtered.slice(start, end).map((item, index) => virtualRow(item, item.folderPath === selectedFolderPath, (start + index) * CASE_ROW_HEIGHT)).join('');
}

export function getVirtualListTotalHeight(filteredCount: number, viewportHeight: number): number {
  return Math.max(filteredCount * CASE_ROW_HEIGHT, Math.max(viewportHeight - HEADER_HEIGHT, CASE_ROW_HEIGHT * 4));
}

function renderCaseListHeader(filteredCount: number, modeText: string): string {
  return `<div class="list-title">
    <h2>Dosya Listesi</h2>
    <p>Toplam ${filteredCount} dosya bulundu • ${escapeHtml(modeText)}</p>
    <button class="secondary compact" data-action="export-cases-excel">${icon('export')}<span>Excel</span></button>
  </div>`;
}

function filterButton(state: UiState, key: string, label: string): string {
  return `<button class="filter-chip ${state.filter === key ? 'active' : ''}" data-filter="${key}">${escapeHtml(label)}</button>`;
}

/**
 * v0.4.2: İkincil filtre çipleri varsayılan olarak gizli "Gelişmiş Filtreler" bölümünde tutulur.
 * Şerit + çip kümesi yalnızca state.advancedFiltersOpen true olduğunda görünür; kapalıyken
 * display:none olur ve liste alanını daraltmaz.
 */
function renderAdvancedFilters(state: UiState): string {
  return `<div class="advanced-filters"${state.advancedFiltersOpen ? '' : ' hidden'} aria-label="Gelişmiş filtreler">
    ${renderQuickFilterStrip(state)}
    ${renderFilterButtons(state)}
  </div>`;
}

function renderFilterButtons(state: UiState): string {
  return `<div class="filters">
    ${filterButton(state, 'all', 'Tüm Durumlar')}
    ${filterButton(state, 'mine', 'Bendeki')}
    ${filterButton(state, 'overdue', 'Geciken')}
    ${filterButton(state, 'today', 'Bugün')}
    ${filterButton(state, 'week', 'Bu Hafta')}
    ${filterButton(state, 'risk', 'Riskli')}
    ${filterButton(state, 'unassigned', 'Sahipsiz')}
    ${filterButton(state, 'stale', 'Durgun')}
    ${filterButton(state, 'quality', 'Veri Kalitesi')}
    ${filterButton(state, 'open', 'Açık Dosyalar')}
    ${filterButton(state, 'closed', 'Kapalı Dosyalar')}
    ${filterButton(state, 'missing-docs', 'Eksik Evrak')}
    ${filterButton(state, 'missing-photos', 'Eksik Fotoğraf')}
    ${filterButton(state, 'photo-format', 'Format Uyarısı')}
    ${filterButton(state, 'portal', 'Portal Hatası')}
    ${filterButton(state, 'rucu', 'Rücu')}
  </div>`;
}

function renderFilterSelects(state: UiState): string {
  const responsibleOptions = buildResponsibleOptions(state.cases);
  const serviceOptions = buildServiceOptions(state.cases);
  const statusOptions = buildStatusOptions(state.cases);
  return `<div class="filter-selects compact-filter-selects">
    <label>Sorumlu<select data-list-filter="responsible">${selectOptions(['all', ...responsibleOptions], state.responsibleFilter, 'Tümü')}</select></label>
    <label>Servis<select data-list-filter="service">${selectOptions(['all', ...serviceOptions], state.serviceFilter, 'Tümü')}</select></label>
    <label>Durum<select data-list-filter="status">${selectOptions(['all', ...statusOptions], state.statusFilter, 'Tümü')}</select></label>
    <label>Sırala<select data-list-filter="sort">
      <option value="plate-az" ${state.sortMode === 'plate-az' ? 'selected' : ''}>Plaka A-Z</option>
      <option value="plate-za" ${state.sortMode === 'plate-za' ? 'selected' : ''}>Plaka Z-A</option>
      <option value="office-az" ${state.sortMode === 'office-az' ? 'selected' : ''}>Dosya No</option>
      <option value="notice-az" ${state.sortMode === 'notice-az' ? 'selected' : ''}>İhbar Föyü</option>
      <option value="updated-desc" ${state.sortMode === 'updated-desc' ? 'selected' : ''}>Son İşlem</option>
      <option value="followup-asc" ${state.sortMode === 'followup-asc' ? 'selected' : ''}>Takip Tarihi</option>
    </select></label>
    <button class="secondary compact advanced-filters-toggle ${state.advancedFiltersOpen ? 'active' : ''}" data-action="toggle-advanced-filters" aria-expanded="${state.advancedFiltersOpen ? 'true' : 'false'}" title="Gelişmiş filtreleri ${state.advancedFiltersOpen ? 'gizle' : 'göster'}">${icon('details')}<span>Gelişmiş Filtreler</span></button>
  </div>`;
}

function buildResponsibleOptions(cases: CaseIndexItem[]): string[] {
  return [...new Set(cases.map((item) => item.sorumlu).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
}

function buildServiceOptions(cases: CaseIndexItem[]): string[] {
  return [...new Set(cases.map((item) => item.serviceName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
}

function buildStatusOptions(cases: CaseIndexItem[]): string[] {
  return [...new Set(cases.map((item) => item.workflowStatus).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
}

function selectOptions(options: string[], selected: string, allLabel: string): string {
  return options.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value === 'all' ? allLabel : value)}</option>`).join('');
}

function matchesResponsibleFilter(item: CaseIndexItem, filter: string): boolean {
  return filter === 'all' || item.sorumlu === filter;
}

function matchesServiceFilter(item: CaseIndexItem, filter: string): boolean {
  return filter === 'all' || item.serviceName === filter;
}

function matchesStatusFilter(item: CaseIndexItem, filter: string): boolean {
  return filter === 'all' || item.workflowStatus === filter;
}

function sortCases(cases: CaseIndexItem[], sortMode: CaseSortMode): CaseIndexItem[] {
  const sorted = cases.slice();
  switch (sortMode) {
    case 'plate-za': return sorted.sort((a, b) => b.plate.localeCompare(a.plate, 'tr'));
    case 'office-az': return sorted.sort((a, b) => (a.officeFileNo || a.dosyaNo).localeCompare(b.officeFileNo || b.dosyaNo, 'tr', { numeric: true }));
    case 'notice-az': return sorted.sort((a, b) => (a.claimNoticeNo || '').localeCompare(b.claimNoticeNo || '', 'tr', { numeric: true }));
    case 'updated-desc': return sorted.sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''));
    case 'followup-asc': return sorted.sort((a, b) => (a.takipTarihi || '9999-12-31').localeCompare(b.takipTarihi || '9999-12-31'));
    default: return sorted.sort((a, b) => a.plate.localeCompare(b.plate, 'tr'));
  }
}

function renderAllRows(filtered: CaseIndexItem[], selectedFolderPath: string): string {
  if (filtered.length === 0) return `<tr><td colspan="10" class="empty-table-state">${icon('search')} Arama sonucunda dosya bulunamadı.</td></tr>`;
  return filtered.map((item) => tableRow(item, item.folderPath === selectedFolderPath)).join('');
}

function severityFor(item: CaseIndexItem): 'critical' | 'warning' | 'ok' {
  if (item.trackingIssue?.severity === 'critical' || (item.caseIssues ?? []).some((issue) => issue.severity === 'critical')) return 'critical';
  if (item.documentAnalysis.missingCritical.length > 0 || item.photoAnalysis.warnings.length > 0 || item.trackingSummary?.openTodoCount) return 'warning';
  return 'ok';
}

function hasMissingPhotoAction(item: CaseIndexItem): boolean {
  return item.photoAnalysis.warnings.some((warning) => !/desteklenmeyen|HEIC|RAW/i.test(warning));
}

function missingPhotoCount(item: CaseIndexItem): number {
  const minDamagePhotos = item.claimType === 'trafik' ? 4 : 6;
  const missingDamage = Math.max(0, minDamagePhotos - item.photoAnalysis.damagePhotoCount);
  const missingChecklist = [
    item.photoAnalysis.hasKm,
    item.photoAnalysis.hasVites,
    item.photoAnalysis.hasSaseOrSasi,
    item.photoAnalysis.hasOlayYeri === true
  ].filter((value) => !value).length;
  return missingDamage + missingChecklist;
}

function missingCount(item: CaseIndexItem): number {
  return item.documentAnalysis.missingCritical.length + missingPhotoCount(item) + item.photoAnalysis.unsupportedFiles.length + (item.trackingSummary?.openTodoCount ?? 0);
}

function tableRow(item: CaseIndexItem, active: boolean): string {
  const severity = severityFor(item);
  const missing = missingCount(item);
  return `<tr class="case-row compact-case-row ${active ? 'selected' : ''} ${severity}" data-folder="${escapeHtml(item.folderPath)}">
    <td><b class="plate">${escapeHtml(item.plate)}</b><small>${escapeHtml(item.claimType.toUpperCase())}</small></td>
    <td><span class="mono-cell">${escapeHtml(item.officeFileNo || item.dosyaNo || '-')}</span></td>
    <td><span class="mono-cell">${escapeHtml(item.claimNoticeNo || '-')}</span></td>
    <td><span class="month-cell">${escapeHtml(item.monthFolder || '-')}</span></td>
    <td><span class="status-chip ${severity}">${escapeHtml(item.workflowStatus)}</span></td>
    <td>${escapeHtml(item.sorumlu || 'Atanmadı')}</td>
    <td><span class="priority-chip ${priorityClass(item.oncelik)}">${escapeHtml(item.oncelik)}</span></td>
    <td>${missing > 0 ? `<span class="status-chip error">${missing}</span>` : '<span class="status-chip ok">Tam</span>'}</td>
    <td>${escapeHtml(formatDate(item.updatedAt || item.tracking.metadata.updatedAt))}</td>
    <td>${escapeHtml(item.takipTarihi || '-')}</td>
  </tr>`;
}

function virtualRow(item: CaseIndexItem, active: boolean, top: number): string {
  const severity = severityFor(item);
  const missing = missingCount(item);
  return `<div class="case-virtual-row compact-case-virtual-row ${active ? 'selected' : ''} ${severity}" data-folder="${escapeHtml(item.folderPath)}" style="top:${top}px">
    <div><b class="plate">${escapeHtml(item.plate)}</b><small>${escapeHtml(item.claimType.toUpperCase())}</small></div>
    <div><span class="mono-cell">${escapeHtml(item.officeFileNo || item.dosyaNo || '-')}</span></div>
    <div><span class="mono-cell">${escapeHtml(item.claimNoticeNo || '-')}</span></div>
    <div><span class="month-cell">${escapeHtml(item.monthFolder || '-')}</span></div>
    <div><span class="status-chip ${severity}">${escapeHtml(item.workflowStatus)}</span></div>
    <div>${escapeHtml(item.sorumlu || 'Atanmadı')}</div>
    <div>${missing > 0 ? `<span class="status-chip error">${missing}</span>` : '<span class="status-chip ok">Tam</span>'}</div>
    <div>${escapeHtml(item.takipTarihi || '-')}</div>
  </div>`;
}

/**
 * v0.4.2: Seçili dosya paneli kompakttır (listenin ~%70-80'i listede kalır).
 * Yalnızca hızlı bakış alanları gösterilir: kimlik, durum, eksik özeti, son işlem ve hızlı aksiyonlar.
 * Portal/veri kalitesi/risk detayları ilgili odak sayfalarında (Operasyon, Evrak & Fotoğraf, Sorunlar/Risk) durur.
 */
function renderSelectedCaseSummary(item: CaseIndexItem | null): string {
  if (!item) {
    return `<aside class="case-summary-card empty-state workbench-empty">
      ${icon('search')}
      <div>
        <h3>Operasyon Alanı</h3>
        <p>Listeden bir dosya seçildiğinde plaka, durum, eksik özeti ve hızlı aksiyonlar burada görünür.</p>
      </div>
    </aside>`;
  }
  const missingDocs = item.documentAnalysis.missingCritical.slice(0, 4);
  const missingPhotos = missingPhotoCount(item);
  const missing = missingCount(item);
  const severity = severityFor(item);
  const controlText = [...missingDocs, missingPhotos ? `Fotoğraf: ${missingPhotos}` : '', item.photoAnalysis.unsupportedFiles.length ? `Format: ${item.photoAnalysis.unsupportedFiles.length}` : ''].filter(Boolean).join(' • ');
  const lastAudit = item.tracking.audit.at(-1);
  const lastText = lastAudit ? `${formatDate(lastAudit.at)} · ${lastAudit.action}` : formatDate(item.updatedAt || item.tracking.metadata.updatedAt);
  return `<aside class="case-summary-card">
    <div class="summary-id">
      <div class="summary-primary">
        <div class="summary-plate">${escapeHtml(item.plate)}</div>
        <span class="priority-chip ${priorityClass(item.oncelik)}">${escapeHtml(item.oncelik)}</span>
        <span class="status-chip ${severity}">${escapeHtml(item.workflowStatus)}</span>
      </div>
      <p class="summary-service">${escapeHtml(item.serviceName || 'Servis bilgisi yok')}</p>
    </div>
    <dl>
      <dt>Dosya No</dt><dd>${escapeHtml(item.officeFileNo || item.dosyaNo || '-')}</dd>
      <dt>İhbar No</dt><dd>${escapeHtml(item.claimNoticeNo || '-')}</dd>
      <dt>Sorumlu</dt><dd>${escapeHtml(item.sorumlu || 'Atanmadı')}</dd>
      <dt>Durum</dt><dd>${escapeHtml(item.workflowStatus)}</dd>
      <dt>Takip</dt><dd>${escapeHtml(item.takipTarihi || '-')}</dd>
    </dl>
    <div class="summary-status-lines">
      <div class="summary-line ${missing > 0 ? 'warning' : 'ok'}">
        ${icon(missing > 0 ? 'warning' : 'check')}<span><b>Eksik</b> ${missing > 0 ? escapeHtml(controlText || `${missing} kontrol`) : 'Kritik eksik görünmüyor'}</span>
      </div>
      <div class="summary-line">
        ${icon('operation')}<span><b>Son işlem</b> ${escapeHtml(lastText)}</span>
      </div>
    </div>
    <div class="summary-actions">
      <button class="secondary" data-action="open-folder">${icon('open')}<span>Klasörü Aç</span></button>
      <button class="primary" data-action="refresh-case">${icon('refresh')}<span>Yenile</span></button>
    </div>
  </aside>`;
}

function priorityClass(priority: string): string {
  if (priority === 'Kritik') return 'critical';
  if (priority === 'Yüksek') return 'warning';
  if (priority === 'Düşük') return 'low';
  return 'normal';
}
