import type { UiState, DetailTab } from '../state';
import { selectedCase } from '../state';
import { escapeHtml, formatDate } from '../validation';
import { getFilteredCases, renderCaseList } from './cases';
import { renderFocusPage, renderIssuesPage } from './detail';
import { renderSettingsPage } from './settings';
import { renderHome } from './home';
import { renderFolders } from './folders';
import { renderStatusBoard } from './status-board';
import { APP_VERSION } from '../../../shared/constants';
import { icon } from '../icons';

export function renderApp(state: UiState): string {
  const activePage: DetailTab = state.rootSetupRequired ? 'settings' : state.activeTab;
  const selected = activePage === 'dosyalar' ? selectedCaseVisibleInCurrentList(state) : selectedCase();
  const rootConfirmed = state.settings?.rootPathConfirmed === true;
  const shownRootPath = rootConfirmed ? (state.settings?.rootPath ?? '') : 'Ana klasör seçilmedi';
  const rootOnline = rootConfirmed && state.dashboard?.rootAvailable === true;
  const themeLabel = state.settings?.theme === 'dark' ? 'Açık' : 'Koyu';
  const zoomPercent = Math.round((state.settings?.zoom ?? 1) * 100);
  const toastClass = state.toastKind || 'info';
  const userName = state.settings?.activeUser ?? 'Ömer Faruk İşleyen';
  const settingsMode = activePage === 'settings';

  return `
  <nav class="side-nav-bar" aria-label="Ana gezinme">
    <div class="side-profile">
      <div class="avatar">${userInitials(userName)}</div>
      <div>
        <h1>HasarBotu</h1>
        <span>Operasyon Paneli</span>
      </div>
    </div>
    <button class="primary side-primary-action" data-action="${state.scanRunning ? 'scan-cancel' : 'scan'}">
      ${icon(state.scanRunning ? 'close' : 'sync')}<span>${state.scanRunning ? 'Taramayı Durdur' : 'Yeniden Tara'}</span>
    </button>
    <div class="nav-links">
      ${navItem('dashboard', 'Ana Sayfa', 'home', activePage === 'home')}
      ${navItem('folder', 'Dosyalar', 'dosyalar', activePage === 'dosyalar')}
      ${navItem('details', 'Klasörler', 'klasorler', activePage === 'klasorler')}
      ${navItem('operation', 'Operasyon', 'operasyon', activePage === 'operasyon')}
      ${navItem('photo', 'Evrak & Fotoğraf', 'evrak', activePage === 'evrak')}
      ${navItem('issue', 'Sorunlar / Risk', 'issues', activePage === 'issues')}
      ${navItem('portal', 'Portal', 'portal', activePage === 'portal')}
      ${navItem('excel', 'Excel Araçları', 'labor', activePage === 'labor')}
      ${navItem('rucu', 'Rücu', 'rucu', activePage === 'rucu')}
      ${navItem('ktt', 'KTT / Kusur', 'ktt', activePage === 'ktt')}
      ${navItem('warning', 'Ağır Hasar', 'heavy', activePage === 'heavy')}
      ${navItem('board', 'Durum Panosu', 'durum', activePage === 'durum')}
      ${navItem('settings', 'Ayarlar', 'settings', activePage === 'settings')}
    </div>
    <div class="side-footer">
      <div class="sync-line"><span class="dot ${rootOnline ? 'ok' : rootConfirmed ? 'warning' : 'error'}"></span>${!rootConfirmed ? 'Ana klasör seçilmeli' : rootOnline ? 'Aktif kök bağlı' : 'Yerel önbellek modu'}</div>
      <div class="side-path" title="${escapeHtml(shownRootPath)}">${escapeHtml(shownRootPath)}</div>
      <div class="version-chip ${state.deploymentStatus?.isOutdated ? 'version-warning' : ''}" title="HasarBotu sürümü">Sürüm v${escapeHtml(APP_VERSION)}</div>
    </div>
  </nav>
  ${state.conflict ? renderConflictDialog(state) : ''}
  ${state.blockModal ? renderBlockModal(state) : ''}
  <div class="main-area ${settingsMode ? 'settings-mode' : 'operations-mode'}">
    <header class="top-app-bar">
      <div class="brand-block">
        <div class="brand-title">HasarBotu v${escapeHtml(APP_VERSION)}</div>
        <div class="brand-subtitle">${escapeHtml(selected?.plate ?? 'Baran Global Ekspertiz')} ${selected ? '• ' + escapeHtml(selected.workflowStatus) : '• Operasyon durumu'}</div>
      </div>
      <button class="root-chip" data-action="choose-root" title="${escapeHtml(shownRootPath)}">${icon('folder')}<span>${escapeHtml(shownRootPath)}</span></button>
      <div class="top-search"><span>${icon('search')}</span><input id="global-search" value="${escapeHtml(state.search)}" placeholder="Dosya, plaka ara..." /></div>
      <div class="top-actions">
        <button class="icon-button top-action-button" title="${state.scanRunning ? 'Taramayı durdur' : 'Yeniden tara'}" data-action="${state.scanRunning ? 'scan-cancel' : 'scan'}">${icon(state.scanRunning ? 'close' : 'sync')}<span>${state.scanRunning ? 'Dur' : 'Tara'}</span></button>
        <button class="icon-button top-action-button" title="Sürüm kontrolü" data-action="refresh-deployment-status">${icon('check')}<span>Sürüm</span></button>
        <button class="icon-button top-action-button" title="Tanılama raporu" data-action="health">${icon('pc')}<span>Tanı</span></button>
        <button class="icon-button top-action-button text-button" title="Temayı değiştir" data-action="toggle-theme">${themeLabel}<span>Tema</span></button>
        <button class="icon-button top-action-button text-button" title="Yakınlaştırmayı sıfırla (%${zoomPercent})" data-action="zoom-reset">${zoomPercent}<span>%</span></button>
        <button class="user-chip" data-tab="settings" title="Ayarlar ve kullanıcı yönetimi"><div class="avatar small">${userInitials(userName)}</div><div><b>${escapeHtml(userName)}</b><small>Raportör</small></div></button>
      </div>
    </header>
    ${settingsMode ? renderSettingsWorkspace(state, toastClass) : `
    <main class="workspace workspace-page page-${escapeHtml(activePage)}">
      ${renderDeploymentWarning(state)}
      ${renderAlerts(state, toastClass)}
      ${renderPage(state, activePage)}
    </main>`}
    <footer class="status-bar">
      <span>Son tarama: ${escapeHtml(formatDate(state.dashboard?.lastScanAt ?? ''))}</span>
      <span>Dosya: ${state.dashboard?.totalCases ?? state.cases.length}</span>
      <span>Sürüm: v${escapeHtml(APP_VERSION)}</span>
      <span>${rootOnline ? 'Aktif kök erişilebilir' : 'Yerel önbellek izleniyor'}</span>
    </footer>
  </div>`;
}

function renderPage(state: UiState, page: DetailTab): string {
  switch (page) {
    case 'home': return renderHome(state);
    case 'dosyalar': return renderCaseList(state);
    case 'klasorler': return renderFolders(state);
    case 'durum': return renderStatusBoard(state);
    case 'issues': return renderIssuesPage(state);
    case 'operasyon':
    case 'evrak':
    case 'portal':
    case 'labor':
    case 'rucu':
    case 'ktt':
    case 'heavy':
    case 'ai':
      return renderFocusPage(selectedCase(), state, page);
    default:
      return renderHome(state);
  }
}

function selectedCaseVisibleInCurrentList(state: UiState) {
  const selected = selectedCase();
  if (!selected) return null;
  const visible = getFilteredCases(state.cases, state.search, state.filter, state.responsibleFilter, state.serviceFilter, state.statusFilter, state.sortMode, state.settings?.activeUser ?? '');
  return visible.some((item) => item.folderPath === selected.folderPath) ? selected : null;
}

function renderDeploymentWarning(state: UiState): string {
  const status = state.deploymentStatus;
  if (!status) return '';
  // v0.4.2: Bu oturumda kapatıldıysa gösterme (sürüm kontrol mantığı korunur, sadece bant gizlenir).
  if (state.deploymentBannerDismissed) return '';
  // v0.4.3: Bant YALNIZCA gerçek sürüm sorununda çıkar — bu PC ofis hedefinin gerisindeyse (isOutdated)
  // veya ofiste birden çok sürüm görülürse. "Ofis hedef sürüm dosyası bulunamadı" gibi kurulum hatırlatması
  // (ofis sürüm kontrolünü kullanmayan için gürültü) artık üstte bant olarak gösterilmez; Ayarlar'da kalır.
  const importantWarnings = status.warnings.filter((warning) => status.isOutdated || /birden çok sürüm/i.test(warning));
  if (!status.isOutdated && importantWarnings.length === 0) return '';
  // v0.4.2: Tek satırlık ince ve kapatılabilir bant. Yalnızca bir kez render edilir; üstte yer kaplamaz.
  return `<div class="deployment-banner slim ${status.isOutdated ? 'critical' : 'warning'}">
    <div class="deployment-banner-main">${icon(status.isOutdated ? 'warning' : 'info')}<span>${escapeHtml(importantWarnings[0] ?? 'Ofis sürüm kontrolü uyarısı var.')}</span></div>
    <div class="deployment-banner-actions">
      <button class="secondary compact" data-action="refresh-deployment-status" title="Sürüm kontrolünü yenile">Yenile</button>
      <button class="secondary compact" data-action="register-deployment-client" title="Bu bilgisayarı ofis sürüm listesine kaydet">Bu PC'yi Kaydet</button>
      <button class="icon-button compact banner-dismiss" data-action="dismiss-deployment-banner" title="Uyarıyı gizle" aria-label="Uyarıyı gizle">${icon('close')}</button>
    </div>
  </div>`;
}

// v0.4.2: Hata/uyarı bantları artık kapatılabilir (✕) ve kalıcı kalmaz (renderer otomatik kapatır).
function renderAlerts(state: UiState, toastClass: string): string {
  const errorAlert = state.error
    ? `<div class="app-alert error">${icon('warning')}<span>${escapeHtml(state.error)}</span><button class="icon-button compact alert-dismiss" data-action="dismiss-alert" title="Kapat" aria-label="Kapat">${icon('close')}</button></div>`
    : '';
  const toastAlert = state.toast
    ? `<div class="app-alert ${escapeHtml(toastClass)}">${icon(toastClass === 'warning' ? 'warning' : 'info')}<span>${escapeHtml(state.toast)}</span><button class="icon-button compact alert-dismiss" data-action="dismiss-toast" title="Kapat" aria-label="Kapat">${icon('close')}</button></div>`
    : '';
  return `${errorAlert}${toastAlert}`;
}

function navItem(iconName: string, label: string, tab: string, active: boolean): string {
  return `<button class="nav-item ${active ? 'active' : ''}" data-tab="${escapeHtml(tab)}" title="${escapeHtml(label)}">${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
}

function renderSettingsWorkspace(state: UiState, toastClass: string): string {
  return `<main class="workspace settings-workspace">
    ${state.rootSetupRequired ? `<div class="root-setup-card"><h2>İlk kurulum gerekli</h2><p>HasarBotu dosyaları otomatik bir konumdan başlatmayacak. Lütfen 2026 ana klasörünü veya çalışacağınız ay klasörünü seçin.</p><button class="primary" data-action="choose-root">${icon('folder')}<span>Ana Klasör Seç</span></button></div>` : ''}
    ${renderAlerts(state, toastClass)}
    ${renderSettingsPage(state)}
  </main>`;
}

function renderConflictDialog(state: UiState): string {
  const conflict = state.conflict;
  if (!conflict) return '';
  const diskStatus = conflict.diskTracking.status.workflowStatus;
  const localStatus = conflict.localTracking.status.workflowStatus;
  const diskTodos = conflict.diskTracking.todos.length;
  const localTodos = conflict.localTracking.todos.length;
  const diskNotes = conflict.diskTracking.notes.length;
  const localNotes = conflict.localTracking.notes.length;
  return `<div class="conflict-overlay" role="dialog" aria-modal="true">
    <div class="conflict-card">
      <h2>Çakışma çözümü gerekli</h2>
      <p>${escapeHtml(conflict.message)}</p>
      <div class="conflict-compare">
        <div><h3>Diskteki güncel sürüm</h3><p>Revizyon: <b>${conflict.currentRevision}</b></p><p>Durum: ${escapeHtml(diskStatus)}</p><p>Görev/Not: ${diskTodos}/${diskNotes}</p></div>
        <div><h3>Bendeki yerel sürüm</h3><p>Eski revizyon: <b>${conflict.expectedRevision}</b></p><p>Durum: ${escapeHtml(localStatus)}</p><p>Görev/Not: ${localTodos}/${localNotes}</p></div>
      </div>
      <div class="app-alert info">${icon('info')}<span>Güvenli birleştirme farklı alan değişikliklerini birleştirir. Aynı alan iki bilgisayarda değiştiyse diskteki değer korunur; veri ezilmez.</span></div>
      <div class="conflict-actions">
        <button class="secondary" data-action="conflict-use-disk">Diskteki Sürümü Kullan</button>
        <button class="secondary" data-action="conflict-merge">Güvenli Birleştir</button>
        <button class="secondary danger" data-action="conflict-use-local">Bendeki Sürümü Yaz</button>
        <button class="secondary" data-action="conflict-dismiss">Kapat</button>
      </div>
    </div>
  </div>`;
}

/** v0.4.7: Sert engelleme modalı — kapatılmadan altındaki işlem sürmez (yanlış plakalı fotoğraf vb.). */
function renderBlockModal(state: UiState): string {
  const modal = state.blockModal;
  if (!modal) return '';
  return `<div class="conflict-overlay block-overlay" role="alertdialog" aria-modal="true">
    <div class="conflict-card block-card">
      <h2>${icon('warning')} ${escapeHtml(modal.title)}</h2>
      <div class="app-alert error">${icon('warning')}<span>${escapeHtml(modal.message)}</span></div>
      <div class="conflict-actions">
        <button class="primary" data-action="dismiss-block-modal" autofocus>Anladım, kapat</button>
      </div>
    </div>
  </div>`;
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? 'H'}${parts.at(-1)?.[0] ?? 'B'}`.toLocaleUpperCase('tr-TR').slice(0, 2);
}
