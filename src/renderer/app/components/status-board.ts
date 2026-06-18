import type { CaseIndexItem } from '../../../shared/types';
import type { UiState, StatusBoardSort } from '../state';
import { escapeHtml, formatDate } from '../validation';
import { normalizeSearch } from '../../../shared/turkish';
import { WORKFLOW_STATUSES } from '../../../shared/workflow';
import { isClosedCase } from '../../../shared/data-quality';
import { icon } from '../icons';

export const STATUS_BOARD_PAGE_SIZE = 50;

/**
 * Durum Panosu için filtrelenip sıralanmış dosya listesi.
 * v0.4.6: Varsayılan olarak SADECE AÇIK dosyalar gösterilir (kapalı dosyalar klasörü /
 * Kapalı durum / kapanmış dosyalar gizlenir). "Kapalıları göster" açılırsa hepsi gelir.
 * Gelişmiş filtreler: sorumlu, sadece eksikli, sadece açık görevli.
 */
export function statusBoardCases(state: UiState): CaseIndexItem[] {
  const query = normalizeSearch(state.statusBoardSearch);
  const statusFilter = state.statusBoardStatusFilter;
  const responsible = state.statusBoardResponsibleFilter;
  const filtered = state.cases.filter((item) => {
    // Varsayılan: kapalı dosyalar klasöründeki / kapanmış dosyaları gizle.
    if (!state.statusBoardShowClosed && isClosedCase(item)) return false;
    if (statusFilter !== 'all' && item.workflowStatus !== statusFilter) return false;
    if (responsible !== 'all' && (item.sorumlu || '') !== responsible) return false;
    if (state.statusBoardMissingOnly && missingCount(item) <= 0) return false;
    if (state.statusBoardOpenTodoOnly && openTodoCount(item) <= 0) return false;
    if (!query) return true;
    const text = item.searchText ?? normalizeSearch([item.plate, item.dosyaNo, item.officeFileNo, item.claimNoticeNo, item.sorumlu].join(' '));
    return text.includes(query);
  });
  return sortStatusBoard(filtered, state.statusBoardSort);
}

function openTodoCount(item: CaseIndexItem): number {
  return item.trackingSummary?.openTodoCount ?? item.tracking.todos.filter((todo) => !todo.completed).length;
}

function sortStatusBoard(cases: CaseIndexItem[], sort: StatusBoardSort): CaseIndexItem[] {
  const list = cases.slice();
  switch (sort) {
    case 'plate-az': return list.sort((a, b) => a.plate.localeCompare(b.plate, 'tr'));
    case 'updated-desc': return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    case 'durum': return list.sort((a, b) => a.workflowStatus.localeCompare(b.workflowStatus, 'tr') || fileNoKey(a).localeCompare(fileNoKey(b), 'tr', { numeric: true }));
    default: return list.sort((a, b) => fileNoKey(a).localeCompare(fileNoKey(b), 'tr', { numeric: true }));
  }
}

function fileNoKey(item: CaseIndexItem): string {
  return item.officeFileNo || item.dosyaNo || item.claimNoticeNo || item.plate || '';
}

/** Toplam sayfa sayısı (en az 1). */
export function statusBoardPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / STATUS_BOARD_PAGE_SIZE));
}

export function renderStatusBoard(state: UiState): string {
  const all = statusBoardCases(state);
  const total = all.length;
  const pageCount = statusBoardPageCount(total);
  const page = Math.min(Math.max(1, state.statusBoardPage), pageCount);
  const start = (page - 1) * STATUS_BOARD_PAGE_SIZE;
  const pageItems = all.slice(start, start + STATUS_BOARD_PAGE_SIZE);
  const filterActive = isFilterActive(state);
  const exportLabel = filterActive ? `Filtreliyi Excel'e Aktar (${total})` : `Tümünü Excel'e Aktar (${total})`;
  const subtitle = state.statusBoardShowClosed
    ? 'Açık + kapalı dosyalar — dosya no\'ya göre sıralı.'
    : 'Açık dosyalar — kapalı dosyalar klasörü gizli, dosya no\'ya göre sıralı.';

  return `<section class="status-board">
    <div class="status-board-heading">
      <div>
        <h2>Durum Panosu</h2>
        <p>${escapeHtml(subtitle)} Sayfa başına ${STATUS_BOARD_PAGE_SIZE} dosya.</p>
      </div>
      <button class="primary compact" data-action="status-export-all" title="${filterActive ? 'Panoda görünen (filtrelenmiş) dosyaları Excel olarak indir' : 'Görünen tüm açık dosyaları Excel olarak indir'}">${icon('export')}<span>${escapeHtml(exportLabel)}</span></button>
    </div>
    ${renderStatusSummary(all, total)}
    <div class="status-board-toolbar">
      <div class="status-search">${icon('search')}<input id="status-board-search" value="${escapeHtml(state.statusBoardSearch)}" placeholder="Plaka, dosya no ara..." /></div>
      <label>Durum<select data-status-filter="board">${statusFilterOptions(state)}</select></label>
      <label>Sırala<select data-status-sort="board">${sortOptions(state.statusBoardSort)}</select></label>
      <button class="ghost compact ${state.statusBoardAdvancedOpen ? 'active' : ''}" data-action="status-toggle-advanced" title="Gelişmiş filtreleme">${icon('filter')}<span>Gelişmiş${filterActive ? ' •' : ''}</span></button>
      ${filterActive ? `<button class="ghost compact" data-action="status-clear-filters" title="Tüm filtreleri temizle">Temizle</button>` : ''}
    </div>
    ${state.statusBoardAdvancedOpen ? renderAdvancedFilters(state) : ''}
    ${total === 0
      ? `<div class="empty-state small">${icon('search')}<h3>Dosya bulunamadı</h3><p>Filtre/arama sonucunda dosya yok.${!state.statusBoardShowClosed ? ' (Kapalı dosyalar varsayılan olarak gizli — gelişmiş filtreden açabilirsiniz.)' : ''}</p></div>`
      : `<div class="table-wrap"><table class="status-table"><thead><tr>
          <th>Dosya / Plaka</th><th>Durum</th><th>İlerleme / Eksik</th><th>Sorumlu / Takip</th><th>Son İşlem</th><th>Son Not</th><th>Aktif Görev</th>
        </tr></thead><tbody>${pageItems.map((item, index) => statusRow(item, start + index + 1, item.folderPath === state.selectedFolderPath)).join('')}</tbody></table></div>
        ${renderPager(page, pageCount, total, start, pageItems.length)}`}
  </section>`;
}

/** Herhangi bir filtre/arama aktif mi (varsayılan açık-dosya görünümü dışında). */
function isFilterActive(state: UiState): boolean {
  return state.statusBoardSearch.trim() !== ''
    || state.statusBoardStatusFilter !== 'all'
    || state.statusBoardResponsibleFilter !== 'all'
    || state.statusBoardMissingOnly
    || state.statusBoardOpenTodoOnly
    || state.statusBoardShowClosed;
}

/** v0.4.6: Gelişmiş filtreleme paneli (sorumlu, kapalıları göster, eksikli, açık görevli). */
function renderAdvancedFilters(state: UiState): string {
  return `<div class="status-advanced-filters">
    <label>Sorumlu<select data-status-responsible="board">${responsibleFilterOptions(state)}</select></label>
    <label class="check"><input type="checkbox" data-status-toggle="show-closed" ${state.statusBoardShowClosed ? 'checked' : ''}/> Kapalı dosyaları da göster</label>
    <label class="check"><input type="checkbox" data-status-toggle="missing-only" ${state.statusBoardMissingOnly ? 'checked' : ''}/> Sadece eksik/risk içerenler</label>
    <label class="check"><input type="checkbox" data-status-toggle="open-todo-only" ${state.statusBoardOpenTodoOnly ? 'checked' : ''}/> Sadece açık görevi olanlar</label>
  </div>`;
}

function responsibleFilterOptions(state: UiState): string {
  const names = Array.from(new Set(state.cases.map((item) => (item.sorumlu || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr'));
  const options = ['all', ...names];
  return options.map((value) => `<option value="${escapeHtml(value)}" ${value === state.statusBoardResponsibleFilter ? 'selected' : ''}>${escapeHtml(value === 'all' ? 'Tüm Sorumlular' : value)}</option>`).join('');
}

function renderStatusSummary(cases: CaseIndexItem[], total: number): string {
  const counts = new Map<string, number>();
  for (const item of cases) counts.set(item.workflowStatus, (counts.get(item.workflowStatus) ?? 0) + 1);
  const chips = WORKFLOW_STATUSES
    .filter((status) => (counts.get(status) ?? 0) > 0)
    .map((status) => `<span class="status-summary-chip"><b>${counts.get(status) ?? 0}</b> ${escapeHtml(status)}</span>`)
    .join('');
  return `<div class="status-summary"><span class="status-summary-total"><b>${total}</b> dosya</span>${chips}</div>`;
}

function statusRow(item: CaseIndexItem, rowNumber: number, active: boolean): string {
  const progress = caseProgressPercent(item);
  const missing = missingCount(item);
  const lastNoteText = item.trackingSummary?.lastNoteText || item.tracking.notes.at(-1)?.text || '';
  const lastNoteBy = item.trackingSummary?.lastNoteBy || item.tracking.notes.at(-1)?.createdBy || '';
  const activeTodos = item.tracking.todos.filter((todo) => !todo.completed);
  const topTodo = activeTodos[0];
  const extraTodos = (item.trackingSummary?.openTodoCount ?? activeTodos.length) - (topTodo ? 1 : 0);
  const severity = missing > 0 ? 'warning' : 'ok';
  return `<tr class="status-row ${active ? 'selected' : ''}" data-action="status-open-case" data-folder="${escapeHtml(item.folderPath)}" title="${escapeHtml(item.plate)} dosyasını aç">
    <td><span class="mono-cell">#${rowNumber} ${escapeHtml(item.officeFileNo || item.dosyaNo || '-')}</span><small>${escapeHtml(item.plate)}</small></td>
    <td><span class="status-chip ${workflowTone(item.workflowStatus)}">${escapeHtml(item.workflowStatus)}</span><small>${escapeHtml(item.dosyaDurumu || '-')}</small></td>
    <td><div class="progress-cell"><div class="progress-bar"><span style="width:${progress}%"></span></div><small>${progress}% ${missing > 0 ? `· <b class="miss-${severity}">Eksik ${missing}</b>` : '· Tam'}</small></div></td>
    <td>${escapeHtml(item.sorumlu || 'Atanmadı')}<small>${escapeHtml(item.eksper || '-')} · Takip: ${escapeHtml(item.takipTarihi || '-')}</small></td>
    <td>${escapeHtml(formatDate(item.updatedAt || item.tracking.metadata.updatedAt))}<small>${escapeHtml(daysAgoLabel(item.updatedAt || item.tracking.metadata.updatedAt))}</small></td>
    <td class="note-cell">${lastNoteText ? `${escapeHtml(truncate(lastNoteText, 90))}<small>${escapeHtml(lastNoteBy)}</small>` : '<span class="muted">—</span>'}</td>
    <td class="todo-cell">${topTodo ? `${escapeHtml(truncate(topTodo.title, 70))}${extraTodos > 0 ? `<small>+${extraTodos} görev daha</small>` : ''}` : '<span class="muted">Yok</span>'}</td>
  </tr>`;
}

function renderPager(page: number, pageCount: number, total: number, start: number, shown: number): string {
  if (pageCount <= 1) return `<div class="status-pager"><span class="pager-info">Toplam ${total} dosya</span></div>`;
  const numbers = pageWindow(page, pageCount).map((value) =>
    value === '…'
      ? '<span class="pager-gap">…</span>'
      : `<button class="pager-num ${value === page ? 'active' : ''}" data-action="status-page-set" data-page="${value}">${value}</button>`
  ).join('');
  return `<div class="status-pager">
    <span class="pager-info">${start + 1}–${start + shown} / ${total} dosya • Sayfa ${page}/${pageCount}</span>
    <div class="pager-controls">
      <button class="pager-nav" data-action="status-page-prev" ${page <= 1 ? 'disabled' : ''}>${icon('open')} Önceki</button>
      ${numbers}
      <button class="pager-nav" data-action="status-page-next" ${page >= pageCount ? 'disabled' : ''}>Sonraki ${icon('open')}</button>
    </div>
  </div>`;
}

function pageWindow(current: number, total: number): Array<number | '…'> {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, 2, total - 1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let previous = 0;
  for (const value of sorted) {
    if (value - previous > 1) out.push('…');
    out.push(value);
    previous = value;
  }
  return out;
}

export function caseProgressPercent(item: CaseIndexItem): number {
  const reqs = item.documentAnalysis.requirements;
  const evrak = reqs.length ? reqs.filter((req) => req.found).length / reqs.length : 1;
  const portalItems = item.tracking.portalChecklist;
  const portal = portalItems.length ? portalItems.filter((entry) => entry.completed).length / portalItems.length : 1;
  const photo = item.photoAnalysis;
  const photoChecks = [photo.damagePhotoCount > 0, photo.hasKm, photo.hasVites, photo.hasSaseOrSasi];
  const foto = photoChecks.filter(Boolean).length / photoChecks.length;
  return Math.round((evrak * 0.4 + portal * 0.35 + foto * 0.25) * 100);
}

function missingCount(item: CaseIndexItem): number {
  const minDamagePhotos = item.claimType === 'trafik' ? 4 : 6;
  const missingDamage = Math.max(0, minDamagePhotos - item.photoAnalysis.damagePhotoCount);
  const missingChecklist = [item.photoAnalysis.hasKm, item.photoAnalysis.hasVites, item.photoAnalysis.hasSaseOrSasi].filter((value) => !value).length;
  return item.documentAnalysis.missingCritical.length + missingDamage + missingChecklist + item.photoAnalysis.unsupportedFiles.length;
}

function daysAgoLabel(iso: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const diff = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diff <= 0) return 'bugün';
  if (diff === 1) return 'dün';
  return `${diff} gün önce`;
}

function workflowTone(status: string): string {
  if (status === 'Kapalı') return 'ok';
  if (status === 'Kapanış Kontrolü' || status === 'Portal Kontrol') return 'warning';
  return '';
}

function statusFilterOptions(state: UiState): string {
  const options = ['all', ...WORKFLOW_STATUSES];
  return options.map((value) => `<option value="${escapeHtml(value)}" ${value === state.statusBoardStatusFilter ? 'selected' : ''}>${escapeHtml(value === 'all' ? 'Tüm Durumlar' : value)}</option>`).join('');
}

function sortOptions(selected: StatusBoardSort): string {
  const labels: Array<[StatusBoardSort, string]> = [
    ['dosya-az', 'Dosya No'],
    ['plate-az', 'Plaka A-Z'],
    ['updated-desc', 'Son İşlem'],
    ['durum', 'Duruma göre']
  ];
  return labels.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
