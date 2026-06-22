import type { UiState } from '../state';
import { escapeHtml, formatDate } from '../validation';
import { icon } from '../icons';
import type { KnowledgeSearchResult, KnowledgeSource, KnowledgeSourceType } from '../../../shared/knowledge';
// P3-F: Pasif (read-only) statik ORNEK dry-run plan + ornek onay durumu gosterimi. Gercek tarama, dosya alma, IPC veya yazma yoktur.
import { approvalLabel, buildKnowledgeImportCommitPlan, buildSampleKnowledgeImportApprovalState, buildSampleKnowledgeImportPlan, getKnowledgeImportApprovalState, summarizeKnowledgeImportApprovals } from '../../../shared/knowledge';
import { renderKnowledgeImportPlanView } from './knowledge-import-plan-view';

const MAX_VISIBLE_SOURCES = 30;
const MAX_VISIBLE_RESULTS = 10;
const SOURCE_TYPE_ORDER: KnowledgeSourceType[] = [
  'guide',
  'note',
  'template',
  'policy_rule',
  'fault_rule',
  'heavy_damage_rule',
  'labor_rule',
  'document_rule',
  'office_note'
];

export function renderKnowledgePanel(state: UiState): string {
  const sources = state.knowledgeSources;
  const activeSources = sources.filter((source) => source.isEnabled).length;
  const chunkTotal = sources.reduce((total, source) => total + (source.chunkCount ?? 0), 0);
  const results = state.knowledgeSearchResponse?.results ?? [];
  const selectedSource = state.selectedKnowledgeSourceId ? sources.find((source) => source.sourceId === state.selectedKnowledgeSourceId) ?? null : null;
  const selectedResult = state.selectedKnowledgeResultId ? results.find((result) => result.chunkId === state.selectedKnowledgeResultId) ?? null : null;
  const availableTags = collectAvailableTags(sources, results);
  const availableSourceTypes = collectAvailableSourceTypes(sources);

  return `<div class="info-card wide knowledge-panel" aria-busy="${state.knowledgeSourcesLoading || state.knowledgeSearchLoading ? 'true' : 'false'}">
    <div class="knowledge-header">
      <div>
        <h3>${icon('health')} Bilgi Bankası</h3>
        <p class="settings-help">Local-only / ücretsiz / salt okunur</p>
      </div>
      <div class="settings-header-actions">
        <button class="secondary compact" data-action="knowledge-refresh" type="button" ${state.knowledgeSourcesLoading ? 'disabled' : ''}>${icon('refresh')}<span>Yenile</span></button>
      </div>
    </div>
    ${renderStatusSummary({
      sourceCount: sources.length,
      activeSources,
      chunkTotal,
      resultCount: results.length,
      selectedTagCount: state.selectedKnowledgeTags.length,
      selectedSourceTypeCount: state.selectedKnowledgeSourceTypes.length
    })}
    ${renderSafetyNotes()}
    ${state.knowledgeSourcesError ? `<div class="app-alert warning" role="status" aria-live="polite">${icon('warning')}<span>${escapeHtml(state.knowledgeSourcesError)}</span></div>` : ''}
    ${state.knowledgeSourcesLoading ? `<div class="app-alert info" role="status" aria-live="polite">${icon('sync')}<span>Bilgi bankası kaynakları okunuyor...</span></div>` : ''}
    <div class="knowledge-workspace">
      <div class="knowledge-search-panel knowledge-search-controls">
        ${renderSearchBar(state)}
        ${renderKnowledgeFilters(state, availableTags, availableSourceTypes)}
      </div>
      <div class="knowledge-source-panel">
        ${renderSourceList(sources, state.selectedKnowledgeSourceId)}
        ${renderSourceDetail(selectedSource)}
      </div>
      <div class="knowledge-results-panel">
        ${renderSearchResults(state)}
        ${renderResultDetail(selectedResult, selectedSource)}
      </div>
    </div>
    ${renderKnowledgeImportLiveStatus(state)}
    ${renderKnowledgeImportTextPreview(state)}
    ${renderKnowledgeImportApprovalControls(state)}
    ${renderKnowledgeImportCommitPreview(state)}
    ${renderKnowledgeImportPlanView(buildSampleKnowledgeImportPlan(), buildSampleKnowledgeImportApprovalState())}
  </div>`;
}

/**
 * P3-H: Canli read-only dry-run import IPC testi. state.knowledgeImportDryRunPlan'i (IPC'den donen plan) read-only
 * gosterir. Buton, dosya alma, aktif aksiyon veya yazma yoktur; yalniz aday sayisi / mode / canWrite gosterilir.
 */
function renderKnowledgeImportTextPreview(state: UiState): string {
  const preview = state.knowledgeImportTextPreview;
  const loadingBlock = state.knowledgeImportTextPreviewLoading
    ? `<div class="app-alert info"><span>Metin dosyasi okunuyor (yazmasiz)...</span></div>`
    : '';
  const errorBlock = state.knowledgeImportTextPreviewError
    ? `<div class="app-alert warning"><span>${escapeHtml(state.knowledgeImportTextPreviewError)}</span></div>`
    : '';
  const body = preview
    ? `<div class="knowledge-import-plan-meta compact">
        <span><small>Dosya</small><b>${escapeHtml(preview.fileName)}</b></span>
        <span><small>Boyut (bayt)</small><b>${escapeHtml(preview.sizeBytes)}</b></span>
        <span><small>Kisaltildi</small><b>${preview.truncated ? 'evet' : 'hayir'}</b></span>
        <span><small>canWrite</small><b>${preview.canWrite ? 'true' : 'false'}</b></span>
      </div>
      <pre class="knowledge-import-text-preview">${escapeHtml(preview.text)}</pre>`
    : `<div class="knowledge-empty">Onizleme icin .txt/.md dosyasi sec.</div>`;
  return `<section class="knowledge-import-plan-view" aria-label="TXT/MD icerik onizleme (yazmasiz)">
    <div class="knowledge-import-plan-header">
      <div>
        <h4>TXT/MD Icerik Onizleme (yazmasiz)</h4>
        <p class="settings-help">Yalniz .txt/.md duz-metin okunur ve bellek-ici gosterilir; PDF/DOCX/XLSX acilmaz, ayristirma/gorsel-metin yok, kalici yazma yok.</p>
      </div>
      <button class="secondary compact" data-action="knowledge-preview-text" type="button" ${state.knowledgeImportTextPreviewLoading ? 'disabled' : ''}>TXT/MD onizle</button>
    </div>
    ${loadingBlock}${errorBlock}${body}
  </section>`;
}

function renderKnowledgeImportCommitPreview(state: UiState): string {
  const plan = state.knowledgeImportDryRunPlan;
  if (!plan || plan.candidates.length === 0) return '';
  const commit = buildKnowledgeImportCommitPlan(plan, state.knowledgeImportApprovalState);
  const preview = state.knowledgeImportTextPreview;
  const committable = !!preview
    && (preview.fileExtension === '.txt' || preview.fileExtension === '.md')
    && !!preview.text && preview.text.trim().length > 0
    && commit.candidates.some((candidate) => candidate.willCommit && candidate.fileName === preview.fileName);
  const result = state.knowledgeImportCommitResult;
  const resultBlock = result
    ? `<div class="app-alert ${result.ok ? 'info' : 'warning'}"><span>${escapeHtml(result.message)} (committed=${result.committed}, duplicate=${result.skippedDuplicate}, revision=${escapeHtml(result.storeRevision ?? '-')}, writeId=${escapeHtml(result.writeId ?? '-')})</span></div>`
    : '';
  const rows = commit.candidates.map((candidate) => `<div class="knowledge-import-approval-row">
      <div class="knowledge-import-approval-main">
        <b>${escapeHtml(candidate.fileName)}</b>
        <small>${escapeHtml(candidate.status)}</small>
      </div>
      <span class="status-chip ${candidate.willCommit ? 'ok' : 'info'}">${candidate.willCommit ? 'commit edilebilir' : 'yazilmaz'}</span>
    </div>`).join('');
  return `<section class="knowledge-import-plan-view" aria-label="Import commit on izleme">
    <div class="knowledge-import-plan-header">
      <div>
        <h4>Import Commit On Izleme (onaylanmis .txt/.md)</h4>
        <p class="settings-help">Onizlenmis ve onaylanmis tek .txt/.md icerigi ayri kullanici bilgi deposuna kalici yazar. takip.json/Excel/dosya klasorlerine dokunulmaz; yazimdan once son onay sorulur.</p>
      </div>
      <button class="primary compact" data-action="knowledge-commit-text-preview" type="button" ${committable && !state.knowledgeImportCommitting ? '' : 'disabled'}>Kalici ice aktar</button>
    </div>
    <div class="knowledge-import-plan-meta compact">
      <span><small>Hedef depo</small><b>${escapeHtml(commit.targetStore)}</b></span>
      <span><small>Onayli</small><b>${commit.totals.approved}</b></span>
      <span><small>Uygun</small><b>${commit.totals.wouldCommit}</b></span>
      <span><small>willWrite</small><b>${commit.willWrite ? 'true' : 'false'}</b></span>
      <span><small>lockOpen</small><b>${commit.lockOpen ? 'true' : 'false'}</b></span>
    </div>
    ${resultBlock}
    <div class="knowledge-import-approval-list">${rows}</div>
  </section>`;
}

function renderKnowledgeImportApprovalControls(state: UiState): string {
  const plan = state.knowledgeImportDryRunPlan;
  if (!plan || plan.candidates.length === 0) return '';
  const approvalState = state.knowledgeImportApprovalState;
  const summary = summarizeKnowledgeImportApprovals(approvalState);
  const rows = plan.candidates.map((candidate) => {
    const decided = getKnowledgeImportApprovalState(approvalState, plan.planId, candidate.candidateId);
    return `<div class="knowledge-import-approval-row">
      <div class="knowledge-import-approval-main">
        <b>${escapeHtml(candidate.fileName)}</b>
        <small>Karar: ${escapeHtml(approvalLabel(decided))}</small>
      </div>
      <div class="knowledge-import-approval-buttons">
        <button class="secondary compact" data-action="knowledge-approve-candidate" data-candidate-id="${escapeHtml(candidate.candidateId)}" data-decision="approve" type="button">Onayla</button>
        <button class="secondary compact" data-action="knowledge-approve-candidate" data-candidate-id="${escapeHtml(candidate.candidateId)}" data-decision="review" type="button">Manuel</button>
        <button class="secondary compact" data-action="knowledge-approve-candidate" data-candidate-id="${escapeHtml(candidate.candidateId)}" data-decision="reject" type="button">Reddet</button>
      </div>
    </div>`;
  }).join('');
  return `<section class="knowledge-import-plan-view" aria-label="Bellek-ici import onay kararlari">
    <div class="knowledge-import-plan-header">
      <div>
        <h4>Onay Kararlari (bellek-ici)</h4>
        <p class="settings-help">Kararlar yalniz bellekte tutulur; import calistirmaz, diske/AppData/takip.json/Excel yazmaz. "Onayla" karari bile import baslatmaz (canExecuteImport=false).</p>
      </div>
      <button class="secondary compact" data-action="knowledge-approval-reset" type="button">Kararlari sifirla</button>
    </div>
    <div class="knowledge-import-plan-meta compact">
      <span><small>Onaylandi (calistirilmadi)</small><b>${summary.approvedButNotExecuted}</b></span>
      <span><small>Reddedildi</small><b>${summary.rejected}</b></span>
      <span><small>Manuel inceleme</small><b>${summary.userReviewRequired}</b></span>
      <span><small>Calistirildi</small><b>${summary.executed}</b></span>
      <span><small>canExecuteImport</small><b>${summary.canExecuteImport ? 'true' : 'false'}</b></span>
    </div>
    <div class="knowledge-import-approval-list">${rows}</div>
  </section>`;
}

function renderKnowledgeImportLiveStatus(state: UiState): string {
  const plan = state.knowledgeImportDryRunPlan;
  const body = state.knowledgeImportDryRunLoading
    ? `<div class="app-alert info"><span>Canli dry-run IPC cagrisi yapiliyor...</span></div>`
    : state.knowledgeImportDryRunError
      ? `<div class="app-alert warning"><span>${escapeHtml(state.knowledgeImportDryRunError)}</span></div>`
      : plan
        ? `<div class="knowledge-import-plan-meta compact">
            <span><small>Aday</small><b>${escapeHtml(plan.candidates.length)}</b></span>
            <span><small>mode</small><b>${escapeHtml(plan.mode)}</b></span>
            <span><small>canWrite</small><b>${plan.canWrite ? 'true' : 'false'}</b></span>
          </div>`
        : `<div class="knowledge-empty">Canli dry-run IPC henuz cagrilmadi.</div>`;
  return `<section class="knowledge-import-plan-view" aria-label="Canli read-only dry-run import IPC testi">
    <div class="knowledge-import-plan-header">
      <div>
        <h4>Canli Dry-run IPC Testi (read-only)</h4>
        <p class="settings-help">Sabit ornek ya da secilen dosyalarin yalniz ad+boyut metadata'si ile read-only dry-run plan; icerik okuma veya kalici yazma yoktur.</p>
      </div>
      <div class="settings-header-actions">
        <button class="secondary compact" data-action="knowledge-dryrun-choose-files" type="button" ${state.knowledgeImportDryRunLoading ? 'disabled' : ''}>Dosya sec (dry-run)</button>
        <span class="status-chip info">read-only</span>
      </div>
    </div>
    ${body}
  </section>`;
}

function renderStatusSummary(args: {
  sourceCount: number;
  activeSources: number;
  chunkTotal: number;
  resultCount: number;
  selectedTagCount: number;
  selectedSourceTypeCount: number;
}): string {
  const cards = [
    ['Kaynak sayısı', args.sourceCount],
    ['Chunk sayısı', args.chunkTotal],
    ['Aktif kaynak', args.activeSources],
    ['Sonuç', args.resultCount],
    ['Seçili etiket', args.selectedTagCount],
    ['Seçili kaynak tipi', args.selectedSourceTypeCount],
    ['Local-only', 'Evet'],
    ['Ücretli servis', 'Yok'],
    ['Harici API', 'Yok'],
    ['Yazma modu', 'Kapalı']
  ];
  return `<div class="knowledge-summary" role="status" aria-live="polite">${cards.map(([label, value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('')}</div>`;
}

function renderSafetyNotes(): string {
  return `<div class="knowledge-safety">
    <div class="app-alert info">${icon('info')}<span>Bu panel bilgi bankasını sadece okur. takip.json, Excel veya dosya klasörlerine yazma yapmaz.</span></div>
    <div class="app-alert info">${icon('info')}<span>Bilgi bankası sonuçları ön bilgi niteliğindedir; nihai karar kullanıcı/eksper onayına tabidir. Local-only / ücretsiz / harici API yok.</span></div>
  </div>`;
}

function renderSourceList(sources: KnowledgeSource[], selectedSourceId: string): string {
  const visible = sources.slice(0, MAX_VISIBLE_SOURCES);
  const body = visible.length
    ? visible.map((source) => renderSourceRow(source, selectedSourceId === source.sourceId)).join('')
    : `<div class="knowledge-empty">Bilgi bankasında kaynak bulunamadı.</div>`;
  return `<section class="knowledge-sources" aria-label="Bilgi bankası kaynakları">
    <div class="knowledge-subhead">
      <b>Kaynak listesi</b>
      <small>${sources.length > visible.length ? `İlk ${visible.length} kaynak gösteriliyor.` : `${sources.length} kaynak`}</small>
    </div>
    <div class="knowledge-source-list">${body}</div>
  </section>`;
}

function renderSourceRow(source: KnowledgeSource, selected: boolean): string {
  return `<button class="knowledge-source-row ${selected ? 'active' : ''}" data-action="knowledge-source-select" data-knowledge-source-id="${escapeHtml(source.sourceId)}" type="button" aria-pressed="${selected ? 'true' : 'false'}" aria-label="${escapeHtml(`Kaynak seç: ${source.title}`)}">
    <span class="status-chip ${source.isEnabled ? 'ok' : 'warning'}">${source.isEnabled ? 'Aktif' : 'Pasif'}</span>
    <span class="knowledge-source-main">
      <b>${escapeHtml(source.title)}</b>
      <small>${escapeHtml(sourceTypeLabel(source.sourceType))}${source.version ? ` · v${escapeHtml(source.version)}` : ''} · ${escapeHtml(formatDate(source.updatedAt ?? source.createdAt))}</small>
      <small>${escapeHtml(source.description ?? '')}</small>
      ${renderInlineBadges(source.tags, 'Etiket')}
    </span>
    <span class="knowledge-source-count"><small>Chunk</small><b>${escapeHtml(source.chunkCount ?? 0)}</b></span>
  </button>`;
}

function renderSourceDetail(source: KnowledgeSource | null): string {
  if (!source) {
    return `<section class="knowledge-detail-card knowledge-source-detail" aria-label="Bilgi bankası kaynak detayı">
      <div class="knowledge-empty">Kaynak seçilmedi.</div>
    </section>`;
  }
  return `<section class="knowledge-detail-card knowledge-source-detail" aria-label="Bilgi bankası kaynak detayı">
    <div class="knowledge-subhead">
      <b>Kaynak detayı</b>
      <span class="status-chip ${source.isEnabled ? 'ok' : 'warning'}">${source.isEnabled ? 'Aktif kaynak' : 'Pasif kaynak'}</span>
    </div>
    <div class="knowledge-detail-meta">
      ${renderMeta('Başlık', source.title)}
      ${renderMeta('sourceId', source.sourceId)}
      ${renderMeta('sourceType', source.sourceType)}
      ${renderMeta('Sürüm', source.version ?? '-')}
      ${renderMeta('Oluşturma', formatDate(source.createdAt))}
      ${renderMeta('Güncelleme', source.updatedAt ? formatDate(source.updatedAt) : '-')}
      ${renderMeta('Sahip', source.owner ?? '-')}
      ${renderMeta('Chunk', source.chunkCount ?? 0)}
    </div>
    ${source.description ? `<p>${escapeHtml(source.description)}</p>` : ''}
    ${renderBadgeBlock('Etiketler', source.tags)}
  </section>`;
}

function renderSearchBar(state: UiState): string {
  return `<div class="knowledge-search-bar" role="search" aria-label="Bilgi bankası araması">
    <label class="knowledge-search-input" for="knowledge-search">${icon('search')}<input id="knowledge-search" value="${escapeHtml(state.knowledgeSearchQuery)}" placeholder="Örnek: ön göğüs, firewall, muafiyet" autocomplete="off" spellcheck="false" aria-label="Bilgi bankası arama metni" /></label>
    <button class="primary compact" data-action="knowledge-search" type="button" aria-label="Bilgi bankasında ara" ${state.knowledgeSearchLoading ? 'disabled' : ''}>${icon('search')}<span>Ara</span></button>
    <button class="secondary compact" data-action="knowledge-clear-search" type="button" aria-label="Arama metnini ve sonucu temizle" ${state.knowledgeSearchQuery || state.knowledgeSearchResponse || state.knowledgeSearchError ? '' : 'disabled'}>Temizle</button>
  </div>`;
}

function renderKnowledgeFilters(state: UiState, tags: string[], sourceTypes: KnowledgeSourceType[]): string {
  const hasFilters = state.selectedKnowledgeTags.length > 0 || state.selectedKnowledgeSourceTypes.length > 0;
  return `<section class="knowledge-filter-panel" aria-label="Bilgi bankası filtreleri">
    <div class="knowledge-subhead">
      <b>Filtreler</b>
      <button class="secondary compact" data-action="knowledge-filter-clear" type="button" aria-label="Seçili etiket ve kaynak tipi filtrelerini temizle" ${hasFilters ? '' : 'disabled'}>Filtreleri temizle</button>
    </div>
    <div class="knowledge-filter-group">
      <div class="knowledge-filter-title"><b>Etiket</b><small>${escapeHtml(state.selectedKnowledgeTags.length)} seçili</small></div>
      <div class="knowledge-chip-list">${tags.length ? tags.map((tag) => renderFilterChip('knowledge-tag-toggle', 'knowledgeTag', tag, tagLabel(tag), state.selectedKnowledgeTags.includes(tag))).join('') : '<span class="knowledge-muted">Etiket yok.</span>'}</div>
    </div>
    <div class="knowledge-filter-group">
      <div class="knowledge-filter-title"><b>Kaynak tipi</b><small>${escapeHtml(state.selectedKnowledgeSourceTypes.length)} seçili</small></div>
      <div class="knowledge-chip-list">${sourceTypes.length ? sourceTypes.map((type) => renderFilterChip('knowledge-source-type-toggle', 'knowledgeSourceType', type, sourceTypeLabel(type), state.selectedKnowledgeSourceTypes.includes(type))).join('') : '<span class="knowledge-muted">Kaynak tipi yok.</span>'}</div>
    </div>
  </section>`;
}

function renderFilterChip(action: string, dataName: string, value: string, label: string, active: boolean): string {
  const dataAttr = dataName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return `<button class="knowledge-chip ${active ? 'active' : ''}" data-action="${escapeHtml(action)}" data-${escapeHtml(dataAttr)}="${escapeHtml(value)}" type="button" aria-pressed="${active ? 'true' : 'false'}" aria-label="${escapeHtml(`${label} filtresi`)}">${escapeHtml(label)}</button>`;
}

function renderSearchResults(state: UiState): string {
  const response = state.knowledgeSearchResponse;
  const results = response?.results.slice(0, MAX_VISIBLE_RESULTS) ?? [];
  const warning = state.knowledgeSearchError
    ? `<div class="app-alert warning" role="status" aria-live="polite">${icon('warning')}<span>${escapeHtml(state.knowledgeSearchError)}</span></div>`
    : '';
  const loading = state.knowledgeSearchLoading
    ? `<div class="app-alert info" role="status" aria-live="polite">${icon('sync')}<span>Bilgi bankası aranıyor...</span></div>`
    : '';
  const serviceWarnings = response?.warnings.length
    ? `<div class="app-alert warning" role="status" aria-live="polite">${icon('warning')}<span>${escapeHtml(response.warnings.join(' '))}</span></div>`
    : '';

  if (!response) {
    return `<section class="knowledge-results" aria-label="Bilgi bankası arama sonuçları" aria-live="polite">
      <div class="knowledge-subhead"><b>Arama sonucu</b><small>Default limit 10</small></div>
      ${warning}${loading}
      <div class="knowledge-empty">Arama yapmak için parça, kural veya poliçe terimi girin.</div>
    </section>`;
  }

  const body = results.length
    ? results.map((result) => renderResultRow(result, state.selectedKnowledgeResultId === result.chunkId)).join('')
    : `<div class="knowledge-empty">Eşleşen bilgi bulunamadı.</div>`;

  return `<section class="knowledge-results" aria-label="Bilgi bankası arama sonuçları" aria-live="polite">
    <div class="knowledge-subhead">
      <b>Arama sonucu</b>
      <small>${escapeHtml(response.total)} eşleşme · ${escapeHtml(response.normalizedQuery || response.query || '-')}</small>
    </div>
    ${warning}${loading}${serviceWarnings}
    <div class="knowledge-result-list">${body}</div>
  </section>`;
}

function renderResultRow(result: KnowledgeSearchResult, selected: boolean): string {
  const location = [result.section, result.page !== undefined ? `Sayfa ${result.page}` : ''].filter(Boolean).join(' · ');
  return `<button class="knowledge-result-row ${selected ? 'active' : ''}" data-action="knowledge-result-select" data-knowledge-result-id="${escapeHtml(result.chunkId)}" type="button" aria-pressed="${selected ? 'true' : 'false'}" aria-label="${escapeHtml(`Sonuç seç: ${result.sourceTitle}`)}">
    <span class="knowledge-result-heading">
      <b>${escapeHtml(result.sourceTitle)}</b>
      <span class="status-chip info">Skor: ${escapeHtml(formatScore(result.score))}</span>
    </span>
    ${location ? `<small>${escapeHtml(location)}</small>` : ''}
    <p class="knowledge-result-preview"><b>Ön izleme</b> ${escapeHtml(shortText(result.text, 160))}</p>
    ${renderInlineBadges(result.matchedTerms, 'Terimler')}
    ${renderInlineBadges(result.tags, 'Etiket')}
    <details class="knowledge-rationale">
      <summary>Gerekçe</summary>
      <small>${escapeHtml(shortText(result.rationale, 140))}</small>
    </details>
  </button>`;
}

function renderResultDetail(result: KnowledgeSearchResult | null, fallbackSource: KnowledgeSource | null): string {
  if (!result) {
    return `<section class="knowledge-detail-card knowledge-result-detail" aria-label="Bilgi bankası sonuç detayı">
      <div class="knowledge-empty">Sonuç seçilmedi.</div>
    </section>`;
  }
  const sourceType = result.sourceType ?? fallbackSource?.sourceType;
  const location = [result.section, result.page !== undefined ? `Sayfa ${result.page}` : ''].filter(Boolean).join(' · ') || '-';
  return `<section class="knowledge-detail-card knowledge-result-detail" aria-label="Bilgi bankası sonuç detayı">
    <div class="knowledge-subhead">
      <b>Sonuç detayı</b>
      <span class="status-chip info">Skor: ${escapeHtml(formatScore(result.score))}</span>
    </div>
    <div class="knowledge-detail-meta">
      ${renderMeta('Kaynak', result.sourceTitle)}
      ${renderMeta('sourceId', result.sourceId)}
      ${renderMeta('chunkId', result.chunkId)}
      ${renderMeta('sourceType', sourceType ?? '-')}
      ${renderMeta('Konum', location)}
      ${renderMeta('Öncelik', result.priority ?? '-')}
    </div>
    ${renderBadgeBlock('Eşleşen terimler', result.matchedTerms)}
    ${renderBadgeBlock('Etiketler', result.tags)}
    <div class="knowledge-detail-text">
      <b>Metin</b>
      <p>${escapeHtml(result.text)}</p>
    </div>
    <div class="knowledge-detail-text">
      <b>Gerekçe</b>
      <p>${escapeHtml(result.rationale)}</p>
    </div>
    <div class="app-alert info">${icon('info')}<span>Bu bilgi ön bilgi niteliğindedir; nihai karar eksper/kullanıcı onayına tabidir.</span></div>
  </section>`;
}

function renderMeta(label: string, value: unknown): string {
  return `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(value ?? '-')}</b></span>`;
}

function renderInlineBadges(values: readonly string[], label: string): string {
  return `<small>${escapeHtml(label)}: ${values.length ? values.map((value) => `<span class="knowledge-badge">${escapeHtml(tagLabel(value))}</span>`).join('') : '-'}</small>`;
}

function renderBadgeBlock(title: string, values: readonly string[]): string {
  return `<div class="knowledge-badge-block">
    <b>${escapeHtml(title)}</b>
    <div class="knowledge-chip-list">${values.length ? values.map((value) => `<span class="knowledge-badge">${escapeHtml(tagLabel(value))}</span>`).join('') : '<span class="knowledge-muted">-</span>'}</div>
  </div>`;
}

function collectAvailableTags(sources: KnowledgeSource[], results: KnowledgeSearchResult[]): string[] {
  return [...new Set([...sources.flatMap((source) => source.tags), ...results.flatMap((result) => result.tags)])].sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), 'tr'));
}

function collectAvailableSourceTypes(sources: KnowledgeSource[]): KnowledgeSourceType[] {
  const values = new Set(sources.map((source) => source.sourceType));
  return SOURCE_TYPE_ORDER.filter((type) => values.has(type));
}

function sourceTypeLabel(type: KnowledgeSourceType): string {
  switch (type) {
    case 'guide': return 'Kılavuz';
    case 'note': return 'Not';
    case 'template': return 'Şablon';
    case 'policy_rule': return 'Poliçe kuralı';
    case 'fault_rule': return 'Kusur kuralı';
    case 'heavy_damage_rule': return 'Ağır hasar kuralı';
    case 'labor_rule': return 'İşçilik kuralı';
    case 'document_rule': return 'Evrak kuralı';
    case 'office_note': return 'Ofis notu';
  }
}

function tagLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function shortText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '-';
}
