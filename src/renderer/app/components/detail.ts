import type { CaseIndexItem, CaseTrackingIssue, ChecklistItem, ExcelLaborPreview, ExcelLaborRowPreview, NoteItem, PartsPhotoAnalysis, PhotoPreview, TodoItem } from '../../../shared/types';
import type { UiState, DetailTab } from '../state';
import { selectedCase } from '../state';
import { CLAIM_TYPES, DOSYA_DURUMLARI, PRIORITIES, WORKFLOW_STATUSES } from '../../../shared/workflow';
import { escapeHtml, formatDate, pct } from '../validation';
import { partCanonicalSuggestions, partCanonicalGroups } from '../../../shared/parca-sozlugu';
import { IS_NOTLARI } from '../../../shared/is-notlari';
import { icon } from '../icons';

const FOCUS_PAGE_META: Partial<Record<DetailTab, { title: string; subtitle: string }>> = {
  operasyon: { title: 'Operasyon', subtitle: 'Sorumlu, durum, görev ve notları yönetin.' },
  evrak: { title: 'Evrak & Fotoğraf', subtitle: 'Eksik evrak ve fotoğraf kontrolünü yapın.' },
  portal: { title: 'Portal', subtitle: 'Portal kontrol listesini işaretleyin.' },
  labor: { title: 'Excel Araçları', subtitle: 'İşçilik Excel dağıtımını yürütün.' },
  rucu: { title: 'Rücu', subtitle: 'Rücu durumunu ve potansiyelini izleyin.' },
  ktt: { title: 'KTT / Kusur', subtitle: 'Kusur yardımcı modülünü kullanın.' },
  heavy: { title: 'Ağır Hasar', subtitle: 'Ağır hasar yardımcı modülünü kullanın.' }
};

/**
 * v0.4.1: Tek dosyaya odaklı sayfa. Eski çok-sekmeli detay çekmecesi yerine geçer.
 * Seçili dosya (state.selectedFolderPath) üzerinde çalışır; dosya seçilmemişse yönlendirici
 * boş durum gösterir. Sayfa anahtarı sidebar'dan gelir, bu yüzden ayrı sekme çubuğu yoktur.
 */
export function renderFocusPage(item: CaseIndexItem | null, state: UiState, page: DetailTab): string {
  const meta = FOCUS_PAGE_META[page] ?? { title: 'Dosya', subtitle: '' };
  if (!item) {
    return `<section class="focus-page focus-empty">
      <div class="empty-state no-selection-panel">
        ${icon('folder')}
        <h2>${escapeHtml(meta.title)} — dosya seçilmedi</h2>
        <p>${escapeHtml(meta.subtitle)} Bu ekran seçili dosya üzerinde çalışır. Önce Dosyalar veya Klasörler ekranından bir dosya seçin.</p>
        <div class="empty-actions">
          <button class="primary compact" data-tab="dosyalar">${icon('folder')}<span>Dosyalar</span></button>
          <button class="secondary compact" data-tab="klasorler">${icon('details')}<span>Klasörler</span></button>
        </div>
      </div>
    </section>`;
  }
  const isClosed = isClosedCase(item);
  const unlocked = state.closedMutationUnlocks[item.folderPath] === true;
  return `<section class="focus-page page-${escapeHtml(page)}">
    <div class="focus-header ${item.documentAnalysis.missingCritical.length ? 'has-error' : ''}">
      <div class="focus-title-block">
        <span class="focus-eyebrow">${escapeHtml(meta.title)}</span>
        <h2>Dosya: ${escapeHtml(item.officeFileNo || item.dosyaNo || '-')} — ${escapeHtml(item.plate)}</h2>
        <div class="detail-badges"><span class="priority-chip ${priorityClass(item.oncelik)}">${escapeHtml(item.oncelik)} Öncelik</span><span class="status-chip ${severityFor(item)}">${escapeHtml(item.dosyaDurumu || item.workflowStatus)}</span><span class="focus-month">${icon('folder')}${escapeHtml(item.monthFolder || '-')}</span></div>
      </div>
      <div class="detail-actions">
        ${isClosed ? `<button class="secondary ${unlocked ? 'warning' : ''}" data-action="toggle-closed-unlock">${unlocked ? 'Kapalı Kilidi Açık' : 'Kapalıyı Düzenle'}</button>` : ''}
        <button class="secondary" data-action="open-folder">${icon('open')}<span>Klasörü Aç</span></button>
        <button class="primary" data-action="refresh-case">${icon('refresh')}<span>Tek Dosyayı Yenile</span></button>
      </div>
    </div>
    ${isClosed ? `<div class="closed-warning">${icon('warning')}<span>Kapalı klasör. ${unlocked ? 'Bu oturumda düzenleme kilidi açıldı; uygulama kapanınca tekrar kilitlenir.' : 'Düzenleme için bir kez oturum izni gerekir.'}</span></div>` : ''}
    ${item.trackingIssue ? `<div class="app-alert error">${icon('warning')}<span><b>${escapeHtml(item.trackingIssue.title)}</b> ${escapeHtml(item.trackingIssue.message)}</span></div>` : ''}
    ${item.documentAnalysis.conflictFiles.length ? `<div class="app-alert error">${icon('warning')}<span>pCloud çakışma dosyası var: ${escapeHtml(item.documentAnalysis.conflictFiles.join(', '))}</span><button class="secondary compact" data-action="inspect-conflict-copy" data-folder="${escapeHtml(item.folderPath)}">Conflict Kopyasını İncele</button></div>` : ''}
    <div class="detail-content focus-content">${renderFocusContent(item, state, page)}</div>
  </section>`;
}

function renderFocusContent(item: CaseIndexItem, state: UiState, page: DetailTab): string {
  switch (page) {
    case 'operasyon': return renderOperation(item, state);
    case 'evrak': return renderDocuments(item);
    case 'portal': return renderPortal(item);
    case 'labor': return renderLabor(item, state);
    case 'rucu': return renderRucu(item);
    case 'ktt': return renderKtt(item);
    case 'heavy': return renderHeavy(item);
    case 'ai': return renderAi(item);
    default: return renderSummary(item);
  }
}

/**
 * Sorunlar / Risk sayfası: küresel tespit listesi + (seçiliyse) dosya bazlı risk özeti.
 * Eski 'issues' ve 'ai' sekmelerini tek ekranda birleştirir.
 */
export function renderIssuesPage(state: UiState): string {
  const item = selectedCase();
  return `<section class="focus-page page-issues">
    <div class="focus-header">
      <div class="focus-title-block">
        <span class="focus-eyebrow">Sorunlar / Risk</span>
        <h2>Sistem Sağlığı ve Tespitler</h2>
        <div class="detail-badges"><span class="status-chip info">Canlı kullanım riskleri, tarama uyarıları ve seçili dosya riski</span></div>
      </div>
    </div>
    <div class="detail-content focus-content">
      ${renderIssues(state)}
      ${item ? `<div class="focus-risk-section"><div class="section-heading compact"><div><h3>Seçili Dosya Riski — ${escapeHtml(item.plate)}</h3><p>${escapeHtml(item.officeFileNo || item.dosyaNo || '-')}</p></div></div>${renderAi(item)}</div>` : ''}
    </div>
  </section>`;
}

function isClosedCase(item: CaseIndexItem): boolean {
  return item.isClosedFolder === true || item.statusIsClosed === true || item.workflowStatus === 'Kapalı' || item.tracking.status.kapaliMi === true;
}

function renderIssues(state: UiState): string {
  const caseIssues = state.cases.flatMap((item) => collectCaseIssues(item).map((issue) => ({ item, issue })));
  const scanIssues = state.lastScanReport?.issues ?? [];
  if (caseIssues.length === 0 && scanIssues.length === 0) {
    return `<div class="empty-state panel-empty">${icon('check')}<h3>Sorun yok</h3><p>Son tarama ve mevcut dosya listesinde kritik canlı kullanım sorunu görünmüyor.</p></div>`;
  }
  return `<div class="issues-panel">
    <div class="issue-summary-card"><div><h3>Aktif Tespitler</h3><p>Corrupt takip, desteklenmeyen schema, pCloud çakışma kopyası ve aynı revizyon/farklı writeId olayları burada toplanır. Otomatik silme veya otomatik merge yapılmaz.</p></div><span class="status-chip error">${caseIssues.length + scanIssues.length}</span></div>
    ${caseIssues.map(({ item, issue }) => renderIssueRow(item, issue)).join('')}
    ${scanIssues.map((issue) => `<div class="issue-row ${issue.severity}"><div class="issue-marker">${icon(issue.severity === 'critical' ? 'warning' : 'info')}</div><div><b>${escapeHtml(issue.type)}</b><p>${escapeHtml(issue.message)}</p><small>${escapeHtml(issue.folderPath)}</small></div></div>`).join('')}
  </div>`;
}

function collectCaseIssues(item: CaseIndexItem): CaseTrackingIssue[] {
  const issues = [...(item.caseIssues ?? [])];
  if (item.trackingIssue && !issues.some((issue) => issue.type === item.trackingIssue?.type && issue.message === item.trackingIssue?.message)) issues.push(item.trackingIssue);
  if (item.documentAnalysis.conflictFiles.length > 0 && !issues.some((issue) => issue.type === 'pcloud-conflict-copy')) {
    issues.push({
      type: 'pcloud-conflict-copy',
      severity: 'critical',
      title: 'pCloud çakışma kopyası',
      message: item.documentAnalysis.conflictFiles.join(', '),
      source: 'scanner',
      action: 'compare'
    });
  }
  return issues;
}

function renderIssueRow(item: CaseIndexItem, issue: CaseTrackingIssue): string {
  const canCompare = issue.type === 'pcloud-conflict-copy' || issue.type === 'same-revision-different-write' || issue.type === 'revision-regression';
  return `<div class="issue-row ${issue.severity}">
    <div class="issue-marker">${icon(issue.severity === 'critical' ? 'warning' : 'info')}</div>
    <div>
      <b>${escapeHtml(issue.title)}</b>
      <p>${escapeHtml(issue.message)}</p>
      <small>${escapeHtml(item.plate)} • ${escapeHtml(item.folderPath)}</small>
    </div>
    <div class="issue-actions">
      <button class="secondary compact" data-folder="${escapeHtml(item.folderPath)}">Dosyayı Seç</button>
      ${canCompare ? `<button class="secondary compact" data-action="inspect-conflict-copy" data-folder="${escapeHtml(item.folderPath)}">Conflict İncele</button>` : ''}
      ${issue.type === 'revision-regression' ? `<button class="secondary compact" data-action="accept-disk-baseline" data-folder="${escapeHtml(item.folderPath)}">Disk Baseline Kabul</button>` : ''}
    </div>
  </div>`;
}

function renderSummary(item: CaseIndexItem): string {
  const done = item.tracking.portalChecklist.filter((x) => x.completed).length;
  const activeTodos = item.tracking.todos.filter((todo) => !todo.completed);
  return `<div class="detail-overview">
    ${alertBox(item)}
    <div class="info-card identity-card">
      <h3>Dosya Künyesi</h3>
      <dl class="dense-dl"><dt>Plaka</dt><dd>${escapeHtml(item.plate)}</dd><dt>Dosya No</dt><dd>${escapeHtml(item.officeFileNo || item.dosyaNo || '-')}</dd><dt>İhbar No</dt><dd>${escapeHtml(item.claimNoticeNo || '-')}</dd><dt>Servis</dt><dd>${escapeHtml(item.serviceName || '-')}</dd><dt>Revizyon</dt><dd>${item.revision}</dd></dl>
    </div>
    <div class="info-card identity-card">
      <h3>Operasyon</h3>
      <dl class="dense-dl"><dt>Sorumlu Uzman</dt><dd>${escapeHtml(item.sorumlu || 'Atanmadı')}</dd><dt>Öncelik Seviyesi</dt><dd>${escapeHtml(item.oncelik)}</dd><dt>Dosya Durumu</dt><dd>${escapeHtml(item.workflowStatus)}</dd><dt>Takip Tarihi</dt><dd>${escapeHtml(item.takipTarihi || '-')}</dd><dt>Son İşlem</dt><dd>${escapeHtml(formatDate(item.tracking.assignment.sonIslemTarihi || item.updatedAt))}</dd></dl>
    </div>
    <div class="info-card progress-card">
      <h3>Portal Durumu</h3>
      <div class="progress"><span style="width:${pct(done, item.tracking.portalChecklist.length)}%"></span></div>
      <p>${done}/${item.tracking.portalChecklist.length} tamamlandı</p>
    </div>
    <div class="info-card">
      <h3>Notlar & Görevler</h3>
      ${activeTodos.slice(0, 5).map((todo) => `<p class="note-line"><b>${escapeHtml(todo.priority)}</b> ${escapeHtml(todo.title)} <small>${escapeHtml(todo.dueDate || '-')}</small></p>`).join('') || '<p>Aktif görev yok.</p>'}
      ${item.tracking.notes.slice(-2).map((n) => `<p class="note-line"><b>${escapeHtml(n.createdBy)}</b> ${escapeHtml(n.text)}</p>`).join('')}
    </div>
  </div>`;
}

function renderOperation(item: CaseIndexItem, state: UiState): string {
  const users = uniqueOptions(state.settings?.users?.length ? state.settings.users : ['Ömer Faruk İşleyen', 'Enes Özmen', 'Baran Gürbüz', 'Berfin Kapar'], item.sorumlu, ...item.tracking.todos.map((todo) => todo.assignedTo));
  return `<div class="operation-grid">
    <div class="form-grid compact-form">
      <label>Dosya No<input data-field="caseIdentity.officeFileNo" value="${escapeHtml(item.officeFileNo || '')}" placeholder="Örn: 2026/18" /></label>
      <label>İhbar Föyü No<input data-field="caseIdentity.claimNoticeNo" value="${escapeHtml(item.claimNoticeNo || '')}" placeholder="Örn: 13-17947703" /></label>
      <label>Dosya Tipi<select data-field="claimType">${opt(CLAIM_TYPES, item.tracking.claimType || item.claimType)}</select></label>
      <label>Servis<input data-field="service.name" value="${escapeHtml(item.serviceName || '')}" placeholder="Servis adı..." /></label>
      <label>Dosya Durumu<select data-field="status.dosyaDurumu">${opt(DOSYA_DURUMLARI, item.dosyaDurumu)}</select></label>
      <label>Operasyon Durumu<select data-field="status.workflowStatus">${opt(WORKFLOW_STATUSES, item.workflowStatus)}</select></label>
      <label>Sorumlu<select data-field="assignment.sorumlu">${opt(users, item.sorumlu)}</select></label>
      <label>Takip Tarihi<input type="date" data-field="assignment.takipTarihi" value="${escapeHtml(item.takipTarihi)}" /></label>
      <label>Öncelik<select data-field="assignment.oncelik">${opt(PRIORITIES, item.oncelik)}</select></label>
    </div>
    <div class="info-card wide"><h3>Görevler <button class="info-button" title="Görevler takip.json içine yazılır. Düzenleme ve silme kayıtlı dosyada revision artırır.">i</button></h3>${renderTodos(item.tracking.todos, users)}<div class="inline-add"><input id="todo-title" placeholder="Yeni görev..." /><button class="primary" data-action="add-todo">Ekle</button></div></div>
    <div class="info-card wide"><h3>Notlar <button class="info-button" title="Notlar yalnızca seçili dosyanın _HASARBOTU/takip.json dosyasına yazılır. Eski NOTLAR dosyası otomatik yazılmaz; Aktar düğmesi mevcut güvenli not ekleme akışını kullanır.">i</button></h3>${renderLegacyNotes(item)}${renderNotes(item.tracking.notes)}<div class="inline-add"><input id="note-text" placeholder="Dosya notu yaz..." /><button class="primary" data-action="add-note">Not Ekle</button></div></div>
  </div>`;
}

function renderDocuments(item: CaseIndexItem): string {
  const groups = item.folderContents?.groups ?? [];
  const folderSummary = groups.length
    ? `<div class="info-card wide"><h3>Klasör Okuma Özeti <button class="info-button" title="EVRAK, HASAR, OLAY YERİ ve ONARIM klasörleri alt klasörlerle birlikte okunur.">i</button></h3><div class="folder-count-grid">${groups.map((g) => `<div class="folder-count ${g.exists ? 'ok' : 'missing'}"><b>${escapeHtml(g.key)}</b><span>${g.exists ? `${g.filesScanned} dosya` : 'Klasör yok'}</span><small>${escapeHtml(g.sampleFiles.slice(0, 4).join(' • ') || '-')}</small></div>`).join('')}</div></div>`
    : '';
  const corrupt = item.photoAnalysis.corruptSuspects;
  const unsupported = item.photoAnalysis.unsupportedFiles;
  return `<div class="document-workspace">
    <div class="section-heading compact"><div><h2>Evrak & Fotoğraf Kontrolü</h2><p>Dosya: ${escapeHtml(item.officeFileNo || item.dosyaNo || '-')} | Plaka: ${escapeHtml(item.plate)}</p></div><button class="secondary" data-action="open-folder">${icon('open')}<span>Klasörü Aç</span></button></div>
    ${unsupported.length ? `<div class="app-alert warning">${icon('warning')}<span>Görüntülenemeyen dosyalar: HEIC/RAW formatlı ${unsupported.length} dosya var.</span></div>` : ''}
    ${item.photoAnalysis.warnings.length ? `<div class="app-alert warning">${icon('photo')}<span>${escapeHtml(item.photoAnalysis.warnings.join(' • '))}</span></div>` : ''}
    <div class="split-section">
      <div class="info-card"><h3>${icon('document')} Evrak Listesi</h3><p class="muted">${item.documentAnalysis.requirements.length} zorunlu evrak kontrol ediliyor. Uygulama karar vermez; yalnızca evrak takibini destekler.</p>${item.documentAnalysis.requirements.map((r) => `<div class="check-row ${r.found ? 'ok' : 'missing'}"><span>${r.found ? icon('check') : icon('warning')}</span><div><b>${escapeHtml(r.label)}</b><small>${escapeHtml(r.matchedFiles.join(', ') || r.warning || 'Bulunamadı')}</small></div></div>`).join('')}</div>
      <div class="info-card"><h3>${icon('photo')} Fotoğraf Kontrolü</h3><div class="photo-stats"><span>Toplam <b>${item.photoAnalysis.totalImageFiles}</b></span><span>Hasar <b>${item.photoAnalysis.damagePhotoCount}</b></span><span>KM <b>${item.photoAnalysis.hasKm ? 'Var' : 'Yok'}</b></span><span>Vites <b>${item.photoAnalysis.hasVites ? 'Var' : 'Yok'}</b></span><span>Şase <b>${item.photoAnalysis.hasSaseOrSasi ? 'Var' : 'Yok'}</b></span><span>Olay Yeri <b>${item.photoAnalysis.hasOlayYeri ? item.photoAnalysis.olayYeriPhotoCount ?? 1 : 'Yok'}</b></span></div>${corrupt.length ? `<div class="app-alert error">${icon('warning')}<span>Bozuk fotoğraf şüphesi: ${escapeHtml(corrupt.slice(0, 8).join(' • '))}</span></div>` : ''}<div class="thumb-grid">${item.photoAnalysis.previews.slice(0, 24).map((p) => renderPhotoThumb(p)).join('') || '<p>Önizlenecek fotoğraf yok.</p>'}</div></div>
      ${folderSummary}
    </div>
  </div>`;
}

function renderPortal(item: CaseIndexItem): string {
  return `<div class="info-card portal-card"><h3>Portal Kontrol Listesi <button class="info-button" title="Portal yükleme durumu kullanıcı tarafından manuel işaretlenir.">i</button></h3>${item.tracking.portalChecklist.map((c) => checklist(c)).join('')}</div>`;
}

function renderLabor(item: CaseIndexItem, state: UiState): string {
  const preview = state.laborExcelPreview;
  const result = state.laborExcelResult;
  const priceListMode = preview?.distributionMode === 'price-list';
  const previewRows = preview?.rows ?? [];
  const columnOptions = preview?.availableColumns?.length
    ? preview.availableColumns.map((col) => `<option value="${escapeHtml(col.column)}" ${col.column === preview.selectedColumn ? 'selected' : ''}>${escapeHtml(col.column)} - ${escapeHtml(col.header)} (${escapeHtml(col.reason)})</option>`).join('')
    : '';
  return `<div class="excel-workflow">
    <div class="section-heading compact"><div><h2>Excel & Parça Veri Merkezi</h2><p>Parça listesi fotoğrafını AI ile okuyun, Excel verilerini güvenle aktarın ve işçiliği dağıtın.</p></div></div>
    ${renderPartsPhotoCard(state)}
    <div class="form-grid compact-form">
      <label class="switch"><input type="checkbox" data-field="labor.parcaListesiIstendi" ${item.tracking.labor.parcaListesiIstendi ? 'checked' : ''}/> Parça listesi istendi</label>
      <label class="switch"><input type="checkbox" data-field="labor.parcaKodlariIstendi" ${item.tracking.labor.parcaKodlariIstendi ? 'checked' : ''}/> Parça kodları istendi</label>
      <label class="switch"><input type="checkbox" data-field="labor.parcaIscilikGirildi" ${item.tracking.labor.parcaIscilikGirildi ? 'checked' : ''}/> Parça/işçilik girildi</label>
      <label class="wide">Not<textarea data-field="labor.not">${escapeHtml(item.tracking.labor.not)}</textarea></label>
    </div>
    <div class="info-card wide labor-excel-card">
      <h3>Portal Excel İşçilik Dağıtıcı <button class="info-button" title="Orijinal Excel dosyası değiştirilmez. Dağıtılmış yeni .xlsx dosyası kaydedilir.">i</button></h3>
      <div class="excel-steps">
        <div class="excel-step active">${icon('upload')}<b>1. Excel Dosyası Seç</b><span>${preview ? escapeHtml(preview.fileName) : 'İşlenecek .xlsx veya .csv dosyasını yükleyin.'}</span><button class="secondary" data-action="choose-labor-excel">Excel Seç</button></div>
        <div class="excel-step ${preview ? 'active' : ''}">${icon('excel')}<b>2. Sütun Eşleştirme</b><span>${preview ? `${escapeHtml(preview.targetColumn)} - ${escapeHtml(preview.targetHeader || '-')}` : 'Sistem sütunlarını Excel başlıklarıyla eşleştirin.'}</span></div>
        <div class="excel-step ${preview ? 'active' : ''}">${icon('risk')}<b>3. Risk & Onay</b><span>Formül ve eşit dağıtım için açık onay gerekir.</span></div>
      </div>
      <label class="switch labor-price-list-toggle"><input id="labor-use-price-list" type="checkbox" ${priceListMode ? 'checked' : ''}/> Gömülü "Boya ve İşçilikler" fiyat listesine göre hesapla (satır bazında tutar atar; hedef toplam gerekmez)</label>
      ${priceListMode ? `<p class="labor-learn-hint">${icon('ai')} Akıllı eşleştirme: fiyat listesiyle doğrudan eşleşmeyen satırlar, <b>öğrenen usta sözlüğü</b> ile resmi parça adına çevrilip işçiliğe bağlanır (ör. "tabla"→Salıncak, "motor kulağı"→Motor Takozu). Parça öğrettikçe dağıtıcı da iyileşir.</p>` : ''}
      <div class="labor-excel-actions">
        ${priceListMode ? '' : '<label>Hedef Toplam İşçilik (TL)<input id="labor-target-total" type="number" min="0" step="0.01" placeholder="Örn: 33000" /></label>'}
        <button class="primary" data-action="distribute-labor-excel" ${preview ? '' : 'disabled'}>${icon('excel')}<span>${priceListMode ? 'Fiyat Listesine Göre Yaz ve Kaydet' : 'Tutarı Dağıt ve Kaydet'}</span></button>
      </div>
      ${preview ? `<div class="labor-preview">
        <label class="wide labor-column-picker">İşçilik Kolonu<select id="labor-target-column">${columnOptions}</select></label>
        <p><b>Seçilen Excel:</b> ${escapeHtml(preview.fileName)} • Sayfa: ${escapeHtml(preview.sheetName)} • Sütun: ${escapeHtml(preview.targetColumn)} (${escapeHtml(preview.targetHeader || '-')}) • Satır: ${preview.rowCount}</p>
        <p>Mevcut toplam: <b>${formatMoney(preview.existingTotal)}</b> • Algılama: ${escapeHtml(preview.detection)} / ${escapeHtml(preview.confidence)} • Dağıtım: <b>${priceListMode ? 'Fiyat listesi' : preview.distributionMode === 'equal' ? 'Eşit bölüşüm' : 'Oranlı'}</b></p>
        ${priceListMode ? `<p class="labor-price-list-summary">Fiyat listesi: <b>${preview.matchedRowCount ?? 0}</b> satır eşleşti${(preview.unmatchedRowCount ?? 0) > 0 ? `, <b>${preview.unmatchedRowCount}</b> satır eşleşmedi (mevcut tutarı korunur)` : ''} • Yazılacak toplam: <b>${formatMoney(preview.priceListTotal ?? 0)}</b></p>` : ''}
        <div class="labor-safety-options">
          ${preview.requiresUserConfirmation ? '<label class="switch"><input id="labor-allow-risky-column" type="checkbox" /> Bu kolon seçimini onaylıyorum</label>' : '<span class="status-chip ok">Kolon güveni yüksek</span>'}
          ${preview.formulasWillBeReplaced ? `<label class="switch"><input id="labor-allow-formula" type="checkbox" /> ${preview.formulaCellsFound} formüllü hücrenin sabit tutara çevrilmesini onaylıyorum</label>` : '<span class="status-chip ok">Formül dönüşümü yok</span>'}
          ${priceListMode ? '<span class="status-chip ok">Fiyat listesi tutarları</span>' : preview.distributionMode === 'equal' ? '<label class="switch"><input id="labor-allow-equal" type="checkbox" /> Eşit dağıtım modunu onaylıyorum</label>' : '<span class="status-chip ok">Oranlı dağıtım</span>'}
        </div>
        ${preview.availableColumns.length ? `<div class="labor-column-list">${preview.availableColumns.slice(0, 8).map((col) => `<div class="labor-column-option ${col.column === preview.selectedColumn ? 'active' : ''}"><b>${escapeHtml(col.column)}</b><span>${escapeHtml(col.header)}</span><small>${escapeHtml(col.reason)} • Toplam: ${formatMoney(col.existingTotal)}</small></div>`).join('')}</div>` : ''}
        ${preview.warnings.length ? `<div class="app-alert error">${icon('warning')}<span>${escapeHtml(preview.warnings.join(' • '))}</span></div>` : ''}
        ${previewRows.length ? `
        <div class="labor-grid-hint">${icon('details')}<span>“Yeni (TL)” sütunundaki tutarları elle değiştirebilirsiniz. ${priceListMode ? 'Eşleşmeyen bir satıra tutar yazarsanız o da yazılır; boş bırakılırsa mevcut tutarı korunur.' : 'Elle girilen tutar hesaplanan değerin yerine yazılır.'}</span></div>
        ${priceListMode
          ? `<div class="labor-preview-table price-list editable"><div><b>Satır</b><b>Açıklama</b><b>Eşleşen Kalem</b><b>Eski</b><b>Yeni (TL)</b></div>${previewRows.map((row) => laborEditRow(row, state.laborRowOverrides, true)).join('')}</div>`
          : `<div class="labor-preview-table editable"><div><b>Satır</b><b>Açıklama</b><b>Eski</b><b>Yeni (TL)</b></div>${previewRows.map((row) => laborEditRow(row, state.laborRowOverrides, false)).join('')}</div>`}
        <div class="labor-grid-footer">
          <span>Yazılacak toplam: <b id="labor-live-total">${formatMoney(laborWrittenTotal(preview, state.laborRowOverrides))}</b></span>
          ${Object.keys(state.laborRowOverrides).length ? `<button class="secondary compact" data-action="reset-labor-overrides">${icon('refresh')}<span>Elle değişiklikleri sıfırla (${Object.keys(state.laborRowOverrides).length})</span></button>` : ''}
        </div>` : ''}
      </div>` : '<p class="muted">Henüz Excel seçilmedi.</p>'}
      ${result ? `<div class="app-alert success">${icon('check')}<span>Dağıtılmış Excel kaydedildi: ${escapeHtml(result.outputPath)} • Toplam: ${formatMoney(result.distributedTotal)} • Doğrulanan: ${formatMoney(result.verifiedExistingTotal)}</span></div>` : ''}
    </div>
    ${renderIsNotlari()}
  </div>`;
}

/** v0.4.6: "İŞ NOTLAR" — sahada parça/işçilik kararı için iç operasyon referansı (native <details>). */
function renderIsNotlari(): string {
  const sections = IS_NOTLARI.map((bolum) => `<div class="is-notu-bolum">
    <h4>${escapeHtml(bolum.baslik)}</h4>
    ${bolum.maddeler.map((madde) => `<div class="is-notu-madde">
      <b>${escapeHtml(madde.konu)}</b>
      <span>${escapeHtml(madde.not)}</span>
      <small>${icon('warning')} ${escapeHtml(madde.dikkat)}</small>
    </div>`).join('')}
  </div>`).join('');
  return `<details class="info-card wide is-notlari">
    <summary>${icon('note')} İŞ NOTLARI — Saha / Parça & İşçilik Referansı <small>(iç operasyon notu; nihai kontrol dosya/poliçeye göre)</small></summary>
    <div class="is-notlari-body">${sections}</div>
  </details>`;
}

function renderPartsPhotoCard(state: UiState): string {
  const analysis = state.partsAnalysis;
  const analyzing = state.partsAnalyzing;
  const hasKey = Boolean(state.settings?.geminiApiKey);
  return `<div class="info-card wide parts-photo-card">
    <h3>${icon('photo')} Parça Listesi Fotoğrafı → Temiz Liste (AI) <button class="info-button" title="El yazısı/karışık parça listesi fotoğrafını Gemini ile okur, usta dilini gerçek parça adına çevirir. Fotoğraf analiz için Google'a gönderilir.">i</button></h3>
    ${hasKey ? '' : `<div class="app-alert warning">${icon('warning')}<span>Gemini API anahtarı yok. Ayarlar → "AI / Parça Okuma" bölümünden ekleyin.</span></div>`}
    <div class="parts-photo-actions">
      <button class="primary" data-action="analyze-parts-photo" ${analyzing ? 'disabled' : ''}>${icon('upload')}<span>${analyzing ? 'Okunuyor…' : 'Parça Listesi Fotoğrafı Seç ve Oku'}</span></button>
      ${analysis && analysis.matchedCount > 0 ? '<button class="secondary compact" data-action="export-parts-labor">' + icon('excel') + '<span>İşçiliğe Aktar (Excel)</span></button>' : ''}
      ${analysis ? '<button class="secondary compact" data-action="copy-parts-list">' + icon('export') + '<span>Kopyala</span></button>' : ''}
      ${analysis ? '<button class="secondary compact" data-action="clear-parts-analysis">Temizle</button>' : ''}
    </div>
    ${analysis ? renderPartsAnalysis(analysis) : '<p class="muted">El yazısı/karışık parça listesi fotoğrafını seçin; usta dili gerçek parça adına çevrilir. Yanlış/eksik çıkanı düzeltip <b>Öğret</b> dersen sözlük bir daha doğru okur.</p>'}
  </div>`;
}

function renderPartsAnalysis(analysis: PartsPhotoAnalysis): string {
  const vehicle = [analysis.vehicle.make, analysis.vehicle.model, analysis.vehicle.plate].filter(Boolean).join(' • ');
  const rows = analysis.rows;
  // v0.4.6: Kaydırma çubuklu (scrollbar'lı) açılır liste için native <select> kullanılır;
  // ayrıca serbest yazım için datalist'li input korunur. Picker seçilince input dolar.
  const datalist = `<datalist id="part-canonical-list">${partCanonicalSuggestions().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>`;
  const groups = partCanonicalGroups();
  const pickerOptions = groups.map((group) =>
    `<optgroup label="${escapeHtml(group.category)}">${group.names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}</optgroup>`
  ).join('');
  return `<div class="parts-analysis">
    <p><b>${escapeHtml(analysis.fileName || 'Fotoğraf')}</b>${vehicle ? ` • Araç: ${escapeHtml(vehicle)}` : ''} • ${analysis.matchedCount} eşleşti / ${analysis.unmatchedCount} eşleşmedi</p>
    ${analysis.warnings.length ? `<div class="app-alert ${analysis.unmatchedCount ? 'warning' : 'info'}">${icon('info')}<span>${escapeHtml(analysis.warnings.join(' • '))}</span></div>` : ''}
    ${datalist}
    ${rows.length ? `<div class="parts-table editable"><div><b>Okunan (usta dili)</b><b>Gerçek Ad (düzeltilebilir)</b><b>Kategori</b><b>Adet / Tutar</b></div>${rows.map((row, index) => `<div class="${row.matched ? '' : 'unmatched'}${row.ambiguousSide ? ' ambiguous-side' : ''}">
      <span>${escapeHtml(row.raw)}${row.note ? ` <small class="part-note">(${escapeHtml(row.note)})</small>` : ''}${row.ambiguousSide ? ' <small class="part-warn" title="Resmi ad yönlü (Ön/Arka) ama okunan ifade yön belirtmedi; ön/arka kontrol edin.">⚠ yön?</small>' : ''}</span>
      <span class="part-edit-cell">
        <input class="part-canonical-input" data-part-canonical="${index}" list="part-canonical-list" value="${escapeHtml(row.matched ? row.canonical : '')}" placeholder="${row.matched ? '' : 'gerçek adı yaz'}" aria-label="Satır ${index + 1} gerçek parça adı" />
        <select class="part-canonical-picker" data-part-canonical-pick="${index}" title="Listeden gerçek parça adını seç (kaydırılabilir)" aria-label="Satır ${index + 1} parça listesi"><option value="">▾ Listeden seç…</option>${pickerOptions}</select>
        <button class="secondary compact" data-action="learn-part-term" data-part-index="${index}" title="Bu eşleştirmeyi kişisel sözlüğe kaydet">Öğret</button>
      </span>
      <span>${escapeHtml(row.category || '-')}</span>
      <span>${row.quantity ? `${row.quantity} adet ` : ''}${row.amount ? formatMoney(row.amount) : (row.quantity ? '' : '-')}</span>
    </div>`).join('')}</div>` : ''}
  </div>`;
}

function renderRucu(item: CaseIndexItem): string {
  return `<div class="form-grid compact-form"><label class="switch"><input type="checkbox" data-field="rucu.varMi" ${item.tracking.rucu.varMi ? 'checked' : ''}/> Rücu var</label><label class="switch"><input type="checkbox" data-field="rucu.potansiyel" ${item.tracking.rucu.potansiyel ? 'checked' : ''}/> Rücu potansiyeli</label><label>Durum<input data-field="rucu.durum" value="${escapeHtml(item.tracking.rucu.durum)}" /></label><label class="wide">Not<textarea data-field="rucu.not">${escapeHtml(item.tracking.rucu.not)}</textarea></label>${item.documentAnalysis.counterpartyPolicyCandidate ? '<div class="app-alert info"><span>Karşı taraf poliçesi olabilecek belge tespit edildi. Kullanıcı doğrulamalı.</span></div>' : ''}</div>`;
}

function renderKtt(item: CaseIndexItem): string {
  return `<div class="info-card"><h3>KTT / Kusur Yardımcı Modülü</h3><div class="app-alert info">${icon('info')}<span>${escapeHtml(item.tracking.kttKusur.finalDecisionWarning)}</span></div><label>Not<textarea data-field="kttKusur.not">${escapeHtml(item.tracking.kttKusur.not)}</textarea></label></div>`;
}

function renderHeavy(item: CaseIndexItem): string {
  return `<div class="info-card"><h3>Ağır Hasar Yardımcı Modülü</h3><div class="app-alert error">${icon('warning')}<span>${escapeHtml(item.tracking.heavyDamage.finalDecisionWarning)}</span></div><label class="switch"><input type="checkbox" data-field="heavyDamage.enabled" ${item.tracking.heavyDamage.enabled ? 'checked' : ''}/> Ağır hasar takibi açık</label><label>Skor<input type="number" data-field="heavyDamage.skor" value="${escapeHtml(item.tracking.heavyDamage.skor ?? '')}" /></label><label>Not<textarea data-field="heavyDamage.not">${escapeHtml(item.tracking.heavyDamage.not)}</textarea></label></div>`;
}

function renderAi(item: CaseIndexItem): string {
  const warnings = [...item.documentAnalysis.warnings, ...item.photoAnalysis.warnings];
  return `<div class="info-card"><h3>Risk Kontrol Özeti</h3><p>Bu ekran otomatik karar vermez; yalnızca klasör, evrak ve fotoğraf risklerini listeler.</p>${warnings.map((w) => `<div class="check-row missing"><span>${icon('warning')}</span><div>${escapeHtml(w)}</div></div>`).join('') || `<div class="check-row ok"><span>${icon('check')}</span><div>Kritik uyarı yok.</div></div>`}</div>`;
}

function alertBox(item: CaseIndexItem): string {
  const missing = item.documentAnalysis.missingCritical;
  if (missing.length === 0 && item.photoAnalysis.warnings.length === 0) return `<div class="app-alert info wide">${icon('check')}<span>Dosya temel kontrollerde kritik eksik göstermiyor.</span></div>`;
  return `<div class="app-alert error wide">${icon('warning')}<span><b>Kontrol Uyarısı:</b> ${escapeHtml([...missing, ...item.photoAnalysis.warnings].slice(0, 5).join(' • '))}</span></div>`;
}

function checklist(c: ChecklistItem): string {
  return `<label class="checklist-item"><input type="checkbox" data-checklist="${escapeHtml(c.key)}" ${c.completed ? 'checked' : ''}/><span>${escapeHtml(c.label)}</span><small>${c.completed ? escapeHtml(c.completedBy || 'Tamamlandı') : 'Bekliyor'}</small></label>`;
}

function renderTodos(todos: TodoItem[], users: string[]): string {
  return todos.length ? `<div class="editable-list">${todos.map((todo) => `<div class="todo-edit-row ${todo.completed ? 'done' : ''}">
    <input type="checkbox" data-todo-complete="${escapeHtml(todo.id)}" ${todo.completed ? 'checked' : ''} title="Tamamlandı" />
    <input class="todo-title-input" data-todo-title="${escapeHtml(todo.id)}" value="${escapeHtml(todo.title)}" aria-label="Görev başlığı" />
    <select data-todo-priority="${escapeHtml(todo.id)}" aria-label="Görev önceliği">${opt(PRIORITIES, todo.priority)}</select>
    <select data-todo-assigned="${escapeHtml(todo.id)}" aria-label="Görev sorumlusu">${opt(users, todo.assignedTo)}</select>
    <input type="date" data-todo-due="${escapeHtml(todo.id)}" value="${escapeHtml(todo.dueDate)}" aria-label="Görev tarihi" />
    <button class="secondary danger compact" data-action="delete-todo" data-item-id="${escapeHtml(todo.id)}">Sil</button>
  </div>`).join('')}</div>` : '<p>Aktif görev yok.</p>';
}

function renderNotes(notes: NoteItem[]): string {
  return notes.length ? `<div class="editable-list">${notes.slice().reverse().map((note) => `<div class="note-edit-row">
    <div class="note-meta"><b>${escapeHtml(note.createdBy)}</b><small>${escapeHtml(formatDate(note.createdAt))}</small></div>
    <textarea data-note-text="${escapeHtml(note.id)}" aria-label="Not metni">${escapeHtml(note.text)}</textarea>
    <button class="secondary danger compact" data-action="delete-note" data-item-id="${escapeHtml(note.id)}">Sil</button>
  </div>`).join('')}</div>` : '<p>Henüz not yok.</p>';
}

function renderLegacyNotes(item: CaseIndexItem): string {
  const legacyNotes = item.documentAnalysis.legacyNotes ?? [];
  if (legacyNotes.length === 0) return '';
  return `<div class="legacy-notes">
    <h4>Eski NOTLAR dosyası</h4>
    ${legacyNotes.map((note, index) => {
      const imported = note.text.length > 0 && isLegacyNoteImported(item.tracking.notes, note.text);
      return `<div class="legacy-note-row ${note.empty ? 'empty' : imported ? 'ok' : 'warning'}">
        <div>
          <b>${escapeHtml(note.fileName)}</b>
          <p>${escapeHtml(note.text || note.warning || 'Boş not dosyası')}</p>
          ${note.warning ? `<small>${escapeHtml(note.warning)}</small>` : ''}
        </div>
        ${note.text ? `<button class="secondary compact" data-action="import-legacy-note" data-legacy-note-index="${index}" ${imported ? 'disabled' : ''}>${imported ? 'Aktarıldı' : 'Takip Notuna Aktar'}</button>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function isLegacyNoteImported(notes: NoteItem[], legacyText: string): boolean {
  const needle = legacyText.trim().slice(0, 120);
  return needle.length > 0 && notes.some((note) => note.text.includes(needle));
}

function renderPhotoThumb(preview: PhotoPreview): string {
  const stateClass = preview.corrupt ? 'corrupt' : preview.supported ? 'supported' : 'unsupported';
  return `<div class="thumb ${stateClass}">
    <div class="thumb-preview-box">
      ${preview.supported && !preview.corrupt ? `<img class="photo-thumb-img" data-thumbnail-path="${escapeHtml(preview.filePath)}" alt="${escapeHtml(preview.fileName)}" hidden />` : `<span class="thumb-placeholder">${preview.corrupt ? '!' : 'HEIC'}</span>`}
    </div>
    <span>${escapeHtml(preview.fileName)}</span>
  </div>`;
}

function opt(values: readonly string[], selected: string): string {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

// Denetim çapası: uniqueOptions(values, selected)
function uniqueOptions(values: readonly string[], ...extra: Array<string | undefined>): string[] {
  const normalized = [...values, ...extra]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(normalized)];
}

function severityFor(item: CaseIndexItem): 'critical' | 'warning' | 'ok' {
  if (item.trackingIssue?.severity === 'critical' || (item.caseIssues ?? []).some((issue) => issue.severity === 'critical')) return 'critical';
  if (item.documentAnalysis.missingCritical.length > 0 || item.photoAnalysis.warnings.length > 0 || item.trackingSummary?.openTodoCount) return 'warning';
  return 'ok';
}

function priorityClass(priority: string): string {
  if (priority === 'Kritik') return 'critical';
  if (priority === 'Yüksek') return 'warning';
  if (priority === 'Düşük') return 'low';
  return 'normal';
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(value);
}

/** İşçilik tablosunda yazılacak toplam: override varsa o, yoksa yazılacak satırların hesaplanan tutarı. */
export function laborWrittenTotal(preview: ExcelLaborPreview, overrides: Record<number, number>): number {
  const priceListMode = preview.distributionMode === 'price-list';
  return preview.rows.reduce((sum, row) => {
    const override = overrides[row.rowNumber];
    if (override !== undefined) return sum + override;
    const writable = !priceListMode || row.matched === true;
    return writable ? sum + row.newAmount : sum;
  }, 0);
}

function laborEditRow(row: ExcelLaborRowPreview, overrides: Record<number, number>, priceListMode: boolean): string {
  const override = overrides[row.rowNumber];
  const writable = !priceListMode || row.matched === true;
  const value = override !== undefined ? String(override) : (writable ? String(row.newAmount) : '');
  const placeholder = !writable && override === undefined ? String(row.oldAmount ?? 0) : '';
  const leadCells = priceListMode
    ? `<span>${row.rowNumber}</span><span>${escapeHtml(row.description)}</span><span>${row.matched ? escapeHtml(row.matchedLabel || '-') : 'Eşleşmedi'}</span><span>${row.oldAmount === null ? '-' : formatMoney(row.oldAmount)}</span>`
    : `<span>${row.rowNumber}</span><span>${escapeHtml(row.description)}</span><span>${row.oldAmount === null ? '-' : formatMoney(row.oldAmount)}</span>`;
  const rowClass = `${priceListMode && !row.matched ? 'unmatched' : ''}${override !== undefined ? ' overridden' : ''}`.trim();
  return `<div class="${rowClass}">${leadCells}<span class="labor-amount-cell"><input type="number" min="0" step="0.01" class="labor-amount-input" data-labor-amount="${row.rowNumber}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" aria-label="Satır ${row.rowNumber} tutarı" /></span></div>`;
}
