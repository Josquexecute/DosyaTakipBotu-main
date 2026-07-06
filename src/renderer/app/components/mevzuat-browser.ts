import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { MEVZUAT_SOURCES, getAllMevzuatItems } from '../../../shared/mevzuat/mevzuat-index';
import type { MevzuatKnowledgeItem } from '../../../shared/mevzuat/mevzuat-types';
import type { AiCaseContext } from '../selectors/ai-case-context';
import { suggestMevzuatTerms } from '../utils/ai-context-mapping';

// v0.6.x: Mevzuat Bilgi Bankası — SALT-OKUNUR. Saf shared/mevzuat verisini gösterir; yazma/ağ yok.
// Dosya seçiliyken bağlama göre önerilen filtre çipleri gösterilir (uygulanabilir + değiştirilebilir).

const FILTER_CHIPS: ReadonlyArray<{ label: string; term: string }> = [
  { label: 'Atama', term: 'atama' },
  { label: 'İş kabul', term: 'kabul' },
  { label: 'Süreler', term: 'süre' },
  { label: 'Ön rapor', term: 'ön rapor' },
  { label: 'Rapor şablonu', term: 'şablon' },
  { label: 'Ağır hasar', term: 'ağır hasar' },
  { label: 'Tam hasar', term: 'tam hasar' },
  { label: 'Değer kaybı', term: 'değer kaybı' },
  { label: 'Ücret', term: 'ücret' },
  { label: 'Performans', term: 'performans' },
  { label: 'Kasko', term: 'kasko' },
  { label: 'Trafik', term: 'trafik' }
];

const CONFIDENCE_LABEL: Record<string, string> = { yuksek: 'Yüksek', orta: 'Orta', dusuk: 'Düşük' };

function itemBlob(item: MevzuatKnowledgeItem): string {
  return [item.topic, item.title, item.rule, item.detail, item.sourceTitle, ...item.tags, ...item.usageAreas]
    .join(' ')
    .toLocaleLowerCase('tr-TR');
}

export function renderMevzuatBrowser(state: UiState, ctx: AiCaseContext | null): string {
  const ui = state.aiHelpers;
  const search = ui.mevzuatSearch.trim().toLocaleLowerCase('tr-TR');
  const filter = ui.mevzuatFilter.trim().toLocaleLowerCase('tr-TR');
  const suggestions = ctx ? suggestMevzuatTerms(ctx) : [];
  const all = getAllMevzuatItems();
  const matched = all.filter((item) => {
    const blob = itemBlob(item);
    if (filter && !blob.includes(filter)) return false;
    if (search && !blob.includes(search)) return false;
    return true;
  });

  return `<div class="aih-panel">
    <div class="aih-sources">
      ${MEVZUAT_SOURCES.map((source) => `<div class="aih-source-chip" title="${escapeHtml(source.title)}">
        <b>${escapeHtml(source.title)}</b>
        <small>Tarih: ${escapeHtml(source.sourceDate)} • Yürürlük: ${escapeHtml(source.effectiveDate)}${source.circularNo ? ` • Genelge ${escapeHtml(source.circularNo)}` : ''}${source.officialGazette ? ` • RG ${escapeHtml(source.officialGazette)}` : ''}</small>
      </div>`).join('')}
    </div>
    <div class="aih-search-row">
      <span>${icon('search')}</span>
      <input id="aih-mevzuat-search" data-aih="mevzuatSearch" data-aih-live="1" type="text" placeholder="Başlık, kural, etiket veya kaynakta ara..." value="${escapeHtml(ui.mevzuatSearch)}" />
    </div>
    ${suggestions.length ? `<div class="aih-suggest-row"><small>Dosya bağlamına göre öneri:</small>${suggestions.map((term) => `<button class="aih-chip suggest ${filter === term ? 'active' : ''}" data-action="aih-mevzuat-filter" data-mevzuat-term="${escapeHtml(term)}">${escapeHtml(term)}</button>`).join('')}</div>` : ''}
    <div class="aih-chips">
      <button class="aih-chip ${filter ? '' : 'active'}" data-action="aih-mevzuat-filter" data-mevzuat-term="">Tümü</button>
      ${FILTER_CHIPS.map((chip) => `<button class="aih-chip ${filter === chip.term ? 'active' : ''}" data-action="aih-mevzuat-filter" data-mevzuat-term="${escapeHtml(chip.term)}">${escapeHtml(chip.label)}</button>`).join('')}
    </div>
    <p class="muted aih-count">${matched.length} bilgi maddesi gösteriliyor (toplam ${all.length}).</p>
    <div class="aih-item-list">
      ${matched.length ? matched.map((item) => renderItem(item, ui.mevzuatExpanded[item.id] === true)).join('') : '<p class="muted">Eşleşen mevzuat maddesi bulunamadı. Filtreyi/aramayı değiştirin.</p>'}
    </div>
  </div>`;
}

function renderItem(item: MevzuatKnowledgeItem, expanded: boolean): string {
  return `<div class="aih-item ${expanded ? 'open' : ''}">
    <button class="aih-item-head" data-action="aih-mevzuat-toggle" data-mevzuat-item="${escapeHtml(item.id)}">
      <span class="aih-item-title"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.sourceTitle)} • ${escapeHtml(item.legalReference)}</small></span>
      <span class="aih-badges"><span class="aih-topic">${escapeHtml(item.topic)}</span><span class="aih-conf aih-conf-${escapeHtml(item.confidence)}">Güven: ${escapeHtml(CONFIDENCE_LABEL[item.confidence] ?? item.confidence)}</span>${icon(expanded ? 'down' : 'open')}</span>
    </button>
    <p class="aih-rule">${escapeHtml(item.rule)}</p>
    ${expanded ? `<div class="aih-item-detail">
      <p>${escapeHtml(item.detail)}</p>
      <div class="aih-tags">${item.tags.map((t) => `<span class="aih-tag">${escapeHtml(t)}</span>`).join('')}</div>
      <p class="aih-usage"><b>Kullanım alanı:</b> ${escapeHtml(item.usageAreas.join(', ') || '-')}</p>
      <div class="app-alert warning aih-caution">${icon('warning')}<span>${escapeHtml(item.caution)}</span></div>
    </div>` : ''}
  </div>`;
}
