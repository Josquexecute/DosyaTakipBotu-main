import type {
  ApiResult,
  AppSettings,
  AutoLaborCategory,
  AutoLaborPreview,
  AutoLaborSaveResult,
  CaseIndexItem,
  CaseListExportResult,
  CaseListExportRow,
  ConflictResolutionStrategy,
  ConflictTrackingCopyInfo,
  DebugHealthReport,
  DeploymentStatus,
  ExcelLaborDistributeResult,
  ExcelLaborPreview,
  FolderBrowseResult,
  ScanReport,
  AnalyzedPartRow,
  PartsPhotoAnalysis,
  ThumbnailResult,
  TrackingFile,
  TrackingWriteResult
} from '../shared/types';
import { renderApp } from './app/components/layout';
import { getFilteredCases, getVirtualListTotalHeight, renderCaseVirtualRows } from './app/components/cases';
import { statusBoardCases, statusBoardPageCount } from './app/components/status-board';
import { formatMoney, laborWrittenTotal } from './app/components/detail';
import { todayDateInput } from './app/validation';
import { state, selectedCase } from './app/state';
import { normalizeSearch } from '../shared/turkish';
import { createMutationQueue, setTrackingLocalField as setLocalField } from '../shared/renderer-stability';
import { normalizePartName } from '../shared/parca-sozlugu';
import type { UserPartTerm } from '../shared/parca-sozlugu';
import { suggestLaborForPart } from '../shared/price-list';

const appEl = document.getElementById('app') as HTMLElement | null;
if (!appEl) {
  document.body.innerHTML = '<div class="fatal-fallback"><h1>HasarBotu başlatılamadı</h1><p>Uygulama kök elementi bulunamadı. Lütfen uygulamayı yeniden başlatın.</p></div>';
  throw new Error('Uygulama kök elementi bulunamadı.');
}
const rootElement: HTMLElement = appEl;
let autoScanTimer: number | null = null;
let virtualRenderQueued = false;
let responsiveResizeTimer: number | null = null;
let searchDebounceTimer: number | null = null;
let scanRequestInFlight = false;
let toastAutoDismissTimer: number | null = null;
let errorAutoDismissTimer: number | null = null;
const SEARCH_DEBOUNCE_MS = 200;
const ERROR_AUTO_DISMISS_MS = 12000;
const THUMBNAIL_LOAD_CONCURRENCY = 4;
const mutationQueue = createMutationQueue();

// v0.4.2: Açılışta beklenmeyen bir hata olursa beyaz ekran yerine kompakt bir bilgilendirme gösterilir.
void boot().catch((error) => renderFatalError(error));

async function boot(): Promise<void> {
  await loadSettings();
  void loadPartsUserTerms();
  await loadDeploymentStatus();
  applyThemeAndZoom();
  window.hasarbotu.on('scan:finished', (payload) => {
    const report = payload as ScanReport;
    state.lastScanReport = report;
    state.scanRunning = false;
    setToast(scanToast(report, false), report.issues.length ? 'warning' : 'info');
    // v0.3.15: scanNow() zaten sonucu bekleyip reload yapıyor. Aynı scan için push event ikinci reload üretmesin.
    if (scanRequestInFlight) return;
    void reloadCache().then(render);
  });
  window.hasarbotu.on('case:updated', (payload) => {
    if (isCaseIndexItem(payload)) {
      patchCase(payload);
      void refreshDashboardOnly().then(render);
    } else void reloadCache().then(render);
  });
  window.hasarbotu.on('menu:command', (payload) => {
    if (typeof payload === 'string') void handleMenuCommand(payload);
  });
  wireEvents();

  if (!state.settings?.rootPathConfirmed) {
    state.rootSetupRequired = true;
    state.activeTab = 'settings';
    setToast('İlk kullanım için ana klasörü siz seçmelisiniz.', 'warning');
    render();
    return;
  }

  await reloadCache();
  scheduleAutoScan();
  render();
  if (state.cases.length === 0) await scanNow();
  else void scanNow();
}

async function loadSettings(): Promise<void> {
  const result = await window.hasarbotu.getSettings<AppSettings>();
  if (result.ok) state.settings = result.data;
  else state.error = result.error.message;
}


async function loadDeploymentStatus(): Promise<void> {
  const result = await window.hasarbotu.getDeploymentStatus<DeploymentStatus>();
  if (result.ok) {
    state.deploymentStatus = result.data;
    // v0.4.2: Sürüm uyarısı tek kaynaktan (kompakt ofis sürüm bandı) gösterilir; ayrıca hata satırına yazılmaz.
  }
}

async function reloadCache(): Promise<void> {
  const [casesResult, dashboardResult] = await Promise.all([
    window.hasarbotu.listCases<CaseIndexItem[]>(),
    window.hasarbotu.getDashboard()
  ]);
  if (casesResult.ok) {
    state.cases = casesResult.data;
    if (state.selectedFolderPath && !state.cases.some((item) => item.folderPath === state.selectedFolderPath)) state.selectedFolderPath = '';
    if (!state.selectedFolderPath && state.cases[0]) state.selectedFolderPath = state.cases[0].folderPath;
    if (state.selectedFolderPath) await hydrateSelectedCase(state.selectedFolderPath, false);
  } else state.error = casesResult.error.message;
  if (dashboardResult.ok) state.dashboard = dashboardResult.data;
  else state.error = dashboardResult.error.message;
}

interface FocusSnapshot {
  selector: string;
  value: string;
  checked?: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function render(): void {
  const focusSnapshot = captureFocusedControl();
  try {
    rootElement.innerHTML = renderApp(state);
  } catch (error) {
    // v0.4.2: Tek bir render hatası tüm arayüzü beyaz bırakmasın.
    renderFatalError(error);
    return;
  }
  restoreFocusedControl(focusSnapshot);
  scheduleToastAutoDismiss();
  scheduleErrorAutoDismiss();
  window.requestAnimationFrame(() => {
    restoreVirtualListScroll();
    void loadVisibleThumbnails();
  });
}

// v0.4.2: Ölümcül hata durumunda beyaz ekran yerine Türkçe bir geri dönüş paneli gösterir.
function renderFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  rootElement.innerHTML = `<div class="fatal-fallback">
    <h1>HasarBotu başlatılamadı</h1>
    <p>Arayüz yüklenirken beklenmeyen bir sorun oluştu. Lütfen yeniden deneyin; sorun sürerse uygulamayı kapatıp açın.</p>
    <pre class="fatal-detail"></pre>
    <button class="primary" data-fatal-retry>Yeniden Dene</button>
  </div>`;
  const detail = rootElement.querySelector('.fatal-detail');
  if (detail) detail.textContent = message;
  const retry = rootElement.querySelector('[data-fatal-retry]');
  retry?.addEventListener('click', () => window.location.reload());
}

function captureFocusedControl(): FocusSnapshot | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) return null;
  const selector = stableSelectorFor(active);
  if (!selector) return null;
  return {
    selector,
    value: active.value,
    ...(active instanceof HTMLInputElement && active.type === 'checkbox' ? { checked: active.checked } : {}),
    selectionStart: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.selectionStart : null,
    selectionEnd: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.selectionEnd : null
  };
}

function restoreFocusedControl(snapshot: FocusSnapshot | null): void {
  if (!snapshot) return;
  const next = document.querySelector(snapshot.selector);
  if (!(next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement || next instanceof HTMLSelectElement)) return;
  next.value = snapshot.value;
  if (next instanceof HTMLInputElement && next.type === 'checkbox' && typeof snapshot.checked === 'boolean') next.checked = snapshot.checked;
  next.focus({ preventScroll: true });
  if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
    const valueLength = next.value.length;
    const start = Math.min(snapshot.selectionStart ?? valueLength, valueLength);
    const end = Math.min(snapshot.selectionEnd ?? start, valueLength);
    try { next.setSelectionRange(start, end); } catch { /* Bazı input tipleri seçim aralığı desteklemez. */ }
  }
}

function stableSelectorFor(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string | null {
  if (element.id) return `#${cssEscape(element.id)}`;
  for (const attr of ['field', 'checklist', 'todoComplete', 'todoTitle', 'todoPriority', 'todoAssigned', 'todoDue', 'noteText', 'setting', 'settingInterval', 'userRename', 'listFilter', 'laborAmount', 'autoLaborAmount', 'autoLaborApprove', 'partCanonical', 'statusFilter', 'statusSort', 'statusResponsible', 'statusToggle']) {
    const value = element.dataset[attr];
    if (value !== undefined) return `[data-${camelToKebab(attr)}="${cssEscape(value)}"]`;
  }
  return null;
}

function camelToKebab(input: string): string {
  return input.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function cssEscape(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}


function queueSearchUpdate(value: string): void {
  if (searchDebounceTimer !== null) window.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = null;
    state.search = value;
    state.caseListScrollTop = 0;
    render();
  }, SEARCH_DEBOUNCE_MS);
}

async function hydrateSelectedCase(folderPath: string, shouldRender: boolean): Promise<void> {
  if (!folderPath) return;
  const result = await window.hasarbotu.getCase<CaseIndexItem | null>(folderPath);
  if (result.ok && result.data) {
    patchCase(result.data);
    if (shouldRender) render();
  } else if (!result.ok) {
    state.error = result.error.message;
    if (shouldRender) render();
  }
}

function wireEvents(): void {
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    if (target.id === 'global-search') {
      queueSearchUpdate(target.value);
      return;
    }
    if (target.id === 'status-board-search') {
      state.statusBoardSearch = target.value;
      state.statusBoardPage = 1;
      render();
      return;
    }
    if (target.dataset.statusFilter === 'board') {
      state.statusBoardStatusFilter = target.value || 'all';
      state.statusBoardPage = 1;
      render();
      return;
    }
    if (target.dataset.statusSort === 'board') {
      state.statusBoardSort = target.value as typeof state.statusBoardSort;
      state.statusBoardPage = 1;
      render();
      return;
    }
    if (target.dataset.statusResponsible === 'board') {
      state.statusBoardResponsibleFilter = target.value || 'all';
      state.statusBoardPage = 1;
      render();
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.statusToggle !== undefined) {
      applyStatusBoardToggle(target.dataset.statusToggle, target.checked);
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.laborAmount !== undefined) {
      updateLaborOverride(target);
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.autoLaborAmount !== undefined) {
      updateAutoLaborEdit(target);
      return;
    }
    if (target.dataset.listFilter === 'responsible') {
      state.responsibleFilter = target.value || 'all';
      state.caseListScrollTop = 0;
      render();
      return;
    }
    if (target.dataset.listFilter === 'service') {
      state.serviceFilter = target.value || 'all';
      state.caseListScrollTop = 0;
      render();
      return;
    }
    if (target.dataset.listFilter === 'status') {
      state.statusFilter = target.value || 'all';
      state.caseListScrollTop = 0;
      render();
      return;
    }
    if (target.dataset.listFilter === 'sort') {
      state.sortMode = target.value as typeof state.sortMode;
      state.caseListScrollTop = 0;
      render();
      return;
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    if (target.dataset.setting || target.dataset.settingInterval || target.dataset.userRename) {
      void handleSettingsInputChange(target);
      return;
    }
    if (target.id === 'labor-target-column' || target.id === 'labor-use-price-list') {
      void refreshLaborExcelPreview();
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.autoLaborToggle === 'formula') {
      state.autoLaborAllowFormula = target.checked;
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.autoLaborApprove !== undefined) {
      const rowNumber = Number(target.dataset.autoLaborApprove);
      if (Number.isInteger(rowNumber)) state.autoLaborApprovedRows[rowNumber] = target.checked;
      return;
    }
    // v0.4.6: Kaydırılabilir parça öneri listesi (select) → ilgili "Gerçek Ad" input'unu doldurur.
    if (target instanceof HTMLSelectElement && target.dataset.partCanonicalPick !== undefined) {
      const index = target.dataset.partCanonicalPick;
      const picked = target.value;
      if (picked) {
        const input = document.querySelector<HTMLInputElement>(`[data-part-canonical="${index}"]`);
        if (input) {
          input.value = picked;
          input.focus();
        }
      }
      target.value = '';
      return;
    }
    const selected = selectedCase();
    if (!selected) return;
    if (target.dataset.checklist) {
      const key = target.dataset.checklist;
      const completed = target instanceof HTMLInputElement ? target.checked : false;
      void guardedMutation(
        (current, allowClosedMutation) => window.hasarbotu.updateChecklist<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, key, completed }),
        (tracking) => {
          const item = tracking.portalChecklist.find((x) => x.key === key);
          if (item) item.completed = completed;
        }
      );
      return;
    }
    if (target.dataset.todoComplete) {
      const id = target.dataset.todoComplete;
      const completed = target instanceof HTMLInputElement ? target.checked : false;
      void updateTodoWithCandidate(id, { completed });
      return;
    }
    if (target.dataset.todoTitle) {
      void updateTodoWithCandidate(target.dataset.todoTitle, { title: target.value });
      return;
    }
    if (target.dataset.todoPriority) {
      void updateTodoWithCandidate(target.dataset.todoPriority, { priority: target.value });
      return;
    }
    if (target.dataset.todoAssigned) {
      void updateTodoWithCandidate(target.dataset.todoAssigned, { assignedTo: target.value });
      return;
    }
    if (target.dataset.todoDue) {
      void updateTodoWithCandidate(target.dataset.todoDue, { dueDate: target.value });
      return;
    }
    if (target.dataset.noteText) {
      const id = target.dataset.noteText;
      const text = target.value.trim();
      if (!text) return;
      void guardedMutation(
        (current, allowClosedMutation) => window.hasarbotu.updateNote<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, id, text }),
        (tracking) => {
          const note = tracking.notes.find((x) => x.id === id);
          if (note) note.text = text;
        }
      );
      return;
    }
    if (target.dataset.field) {
      const field = target.dataset.field;
      const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked
        : target instanceof HTMLInputElement && target.type === 'number' ? numberOrUndefined(target.value)
        : target.value;
      void guardedMutation(
        (current, allowClosedMutation) => window.hasarbotu.updateField<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, path: field, value }),
        (tracking) => setLocalField(tracking, field, value)
      );
    }
  });

  document.addEventListener('scroll', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.virtualList !== 'cases') return;
    state.caseListScrollTop = target.scrollTop;
    queueVirtualListRender();
  }, true);

  document.addEventListener('click', (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-filter], [data-folder], [data-folder-nav], [data-tab]');
    if (!element) return;
    const action = element.dataset.action;
    if (action) {
      void handleAction(action, element);
      return;
    }
    const folderNav = element.dataset.folderNav;
    if (folderNav) {
      void loadFolders(folderNav);
      return;
    }
    const folder = element.dataset.folder;
    if (folder) {
      state.selectedFolderPath = folder;
      render();
      void hydrateSelectedCase(folder, true);
      return;
    }
    const filter = element.dataset.filter;
    if (filter) {
      state.filter = filter;
      state.caseListScrollTop = 0;
      render();
      return;
    }
    const tab = element.dataset.tab;
    if (tab) {
      state.activeTab = tab as typeof state.activeTab;
      render();
      if (tab === 'klasorler' && !state.folderBrowse && !state.folderLoading) void loadFolders();
      return;
    }
  });

  window.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || !state.settings) return;
    event.preventDefault();
    const next = clamp((state.settings.zoom ?? 1) + (event.deltaY < 0 ? 0.05 : -0.05), 0.8, 1.35);
    state.settings.zoom = Number(next.toFixed(2));
    applyThemeAndZoom();
    void window.hasarbotu.saveSettings(state.settings);
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === '0' && state.settings) {
      event.preventDefault();
      state.settings.zoom = 1;
      applyThemeAndZoom();
      void window.hasarbotu.saveSettings(state.settings);
    }
  });

  window.addEventListener('resize', handleResponsiveResize);
  window.visualViewport?.addEventListener('resize', handleResponsiveResize);
}

async function handleAction(action: string, element?: HTMLElement): Promise<void> {
  switch (action) {
    case 'scan': await scanNow(); break;
    case 'refresh-case': await refreshSelectedCase(); break;
    case 'folder-refresh': await loadFolders(state.folderBrowse?.currentPath); break;
    case 'toggle-closed-unlock': toggleClosedUnlock(); break;
    case 'scan-cancel': await cancelScan(); break;
    case 'toggle-theme': await toggleTheme(); break;
    case 'zoom-reset': await resetZoom(); break;
    case 'open-folder': await openSelectedFolder(); break;
    case 'add-todo': await addTodo(); break;
    case 'add-note': await addNote(); break;
    case 'import-legacy-note': await importLegacyNote(element); break;
    case 'delete-todo': await deleteTodo(element?.dataset.itemId ?? ''); break;
    case 'delete-note': await deleteNote(element?.dataset.itemId ?? ''); break;
    case 'choose-labor-excel': await chooseLaborExcel(); break;
    case 'distribute-labor-excel': await distributeLaborExcel(); break;
    case 'reset-labor-overrides': state.laborRowOverrides = {}; render(); break;
    case 'auto-labor-preview': await autoLaborPreviewAction(); break;
    case 'auto-labor-save': await autoLaborSaveAction(); break;
    case 'auto-labor-clear': state.autoLaborPreview = null; state.autoLaborEdits = {}; state.autoLaborApprovedRows = {}; state.autoLaborResult = null; state.autoLaborAllowFormula = false; render(); break;
    case 'analyze-parts-photo': await analyzePartsPhotoAction(); break;
    case 'clear-parts-analysis': state.partsAnalysis = null; render(); break;
    case 'learn-part-term': await learnPartTermAction(Number(element?.dataset.partIndex ?? -1)); break;
    case 'copy-parts-list': await copyPartsList(); break;
    case 'export-parts-labor': await exportPartsLaborExcel(); break;
    case 'export-cases-excel': await exportFilteredCasesExcel(); break;
    case 'status-export-all': await exportAllCasesExcel(); break;
    case 'status-toggle-advanced': state.statusBoardAdvancedOpen = !state.statusBoardAdvancedOpen; render(); break;
    case 'status-clear-filters': clearStatusBoardFilters(); break;
    case 'status-open-case': openCaseFromBoard(element?.dataset.folder); break;
    case 'status-page-prev': setStatusBoardPage(state.statusBoardPage - 1); break;
    case 'status-page-next': setStatusBoardPage(state.statusBoardPage + 1); break;
    case 'status-page-set': setStatusBoardPage(Number(element?.dataset.page ?? 1)); break;
    case 'toggle-advanced-filters': toggleAdvancedFilters(); break;
    case 'dismiss-deployment-banner': dismissDeploymentBanner(); break;
    case 'dismiss-alert': dismissError(); break;
    case 'dismiss-toast': dismissToast(); break;
    case 'conflict-use-disk': await resolveConflict('use-disk'); break;
    case 'conflict-merge': await resolveConflict('merge-safe'); break;
    case 'conflict-use-local': await resolveConflict('use-local'); break;
    case 'conflict-dismiss': state.conflict = null; render(); break;
    case 'dismiss-block-modal': state.blockModal = null; render(); break;
    case 'inspect-conflict-copy': await inspectConflictCopy(element?.dataset.folder); break;
    case 'accept-disk-baseline': await acceptDiskBaseline(element?.dataset.folder); break;
    case 'health': await showHealth(); break;
    case 'refresh-deployment-status': await refreshDeploymentStatus(); break;
    case 'register-deployment-client': await registerDeploymentClient(); break;
    case 'choose-root': await chooseRootPath(); break;
    case 'save-settings': await saveSettingsFromPage(); break;
    case 'add-user': await addUserFromPage(); break;
    case 'remove-user': await removeUserFromButton(element); break;
    case 'set-active-user': await setActiveUserFromButton(element); break;
  }
}

async function handleMenuCommand(command: string): Promise<void> {
  switch (command) {
    case 'menu:scan': await scanNow(); break;
    case 'menu:toggle-theme': await toggleTheme(); break;
    case 'menu:zoom-reset': await resetZoom(); break;
    case 'menu:zoom-in': await adjustZoom(0.05); break;
    case 'menu:zoom-out': await adjustZoom(-0.05); break;
    case 'menu:health': await showHealth(); break;
    case 'menu:settings': state.activeTab = 'settings'; render(); break;
  }
}

async function scanNow(): Promise<void> {
  if (state.scanRunning) return;
  if (!state.settings?.rootPathConfirmed) {
    state.rootSetupRequired = true;
    state.activeTab = 'settings';
    setToast('Tarama için önce ana klasörü seçin.', 'warning');
    render();
    return;
  }
  state.scanRunning = true;
  scanRequestInFlight = true;
  setToast('Aktif kök klasörleri taranıyor. Arayüz yerel önbellek üzerinden kullanılmaya devam eder.', 'info');
  state.error = '';
  render();
  const result = await window.hasarbotu.scanNow<ScanReport>();
  state.scanRunning = false;
  scanRequestInFlight = false;
  if (result.ok) {
    state.lastScanReport = result.data;
    setToast(scanToast(result.data, true), result.data.issues.length ? 'warning' : 'success');
    await reloadCache();
  } else state.error = result.error.message;
  render();
}

async function cancelScan(): Promise<void> {
  const result = await window.hasarbotu.cancelScan<boolean>();
  if (result.ok && result.data) setToast('Tarama durdurma isteği gönderildi. İşlenen son klasörden sonra duracak.', 'warning');
  else setToast('Devam eden tarama bulunamadı.', 'info');
  render();
}

async function toggleTheme(): Promise<void> {
  if (!state.settings) return;
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  applyThemeAndZoom();
  await window.hasarbotu.saveSettings(state.settings);
  render();
}

async function resetZoom(): Promise<void> {
  if (!state.settings) return;
  state.settings.zoom = 1;
  applyThemeAndZoom();
  await window.hasarbotu.saveSettings(state.settings);
}

async function adjustZoom(delta: number): Promise<void> {
  if (!state.settings) return;
  const next = clamp((state.settings.zoom ?? 1) + delta, 0.8, 1.35);
  state.settings.zoom = Number(next.toFixed(2));
  applyThemeAndZoom();
  await window.hasarbotu.saveSettings(state.settings);
}

async function openSelectedFolder(): Promise<void> {
  const item = selectedCase();
  if (!item) return;
  const result = await window.hasarbotu.openFolder(item.folderPath);
  if (!result.ok) {
    state.error = result.error.message;
    render();
  }
}

async function loadFolders(folderPath?: string): Promise<void> {
  if (!state.settings?.rootPathConfirmed) {
    state.activeTab = 'settings';
    state.rootSetupRequired = true;
    setToast('Klasör görüntüleme için önce ana klasörü seçin.', 'warning');
    render();
    return;
  }
  state.folderLoading = true;
  render();
  // v0.4.1: Yalnızca-okunur klasör gezgini. Tüm veri güvenli IPC üzerinden gelir;
  // renderer dosya sistemine erişmez ve hiçbir klasör/dosya oluşturulmaz/değiştirilmez.
  const result = await window.hasarbotu.listFolders<FolderBrowseResult>(folderPath);
  state.folderLoading = false;
  if (result.ok) {
    state.folderBrowse = result.data;
    state.error = '';
  } else {
    state.error = result.error.message;
  }
  render();
}

async function refreshSelectedCase(): Promise<void> {
  const item = selectedCase();
  if (!item) return;
  setToast('Seçili dosya yenileniyor. Tam yıl taraması yapılmayacak.', 'info');
  render();
  const result = await window.hasarbotu.refreshCase<CaseIndexItem>(item.folderPath);
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  patchCase(result.data);
  clearScanIssuesForCase(result.data.folderPath);
  await refreshDashboardOnly();
  setToast('Seçili dosya yenilendi.', 'success');
  render();
}

function clearScanIssuesForCase(folderPath: string): void {
  if (!state.lastScanReport?.issues?.length) return;
  state.lastScanReport = {
    ...state.lastScanReport,
    issues: state.lastScanReport.issues.filter((issue) => issue.folderPath !== folderPath)
  };
}

function toggleClosedUnlock(): void {
  const item = selectedCase();
  if (!item) return;
  const isClosed = item.isClosedFolder === true || item.statusIsClosed === true || item.workflowStatus === 'Kapalı' || item.tracking.status.kapaliMi === true;
  if (!isClosed) return;
  const current = state.closedMutationUnlocks[item.folderPath] === true;
  if (current) {
    delete state.closedMutationUnlocks[item.folderPath];
    setToast('Kapalı dosya düzenleme kilidi tekrar kapatıldı.', 'info');
  } else {
    const ok = window.confirm('Bu kapalı dosyada düzenleme izni bu oturum için açılacak. Devam edilsin mi?');
    if (!ok) return;
    state.closedMutationUnlocks[item.folderPath] = true;
    setToast('Kapalı dosya bu oturum için düzenlemeye açıldı.', 'warning');
  }
  render();
}

async function addTodo(): Promise<void> {
  const item = selectedCase();
  const input = document.getElementById('todo-title') as HTMLInputElement | null;
  if (!item || !input || !input.value.trim()) return;
  const title = input.value.trim();
  const dueDate = todayDateInput();
  const assignedTo = fileResponsibleOrActiveUser(item.sorumlu);
  const id = createTrackingItemId('todo');
  await guardedMutation(
    (current, allowClosedMutation) => window.hasarbotu.addTodo<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, id, title, priority: 'Normal', assignedTo, dueDate }),
    (tracking) => tracking.todos.push({ id, title, completed: false, priority: 'Normal', assignedTo, dueDate, createdAt: new Date().toISOString() })
  );
}

async function addNote(): Promise<void> {
  const item = selectedCase();
  const input = document.getElementById('note-text') as HTMLInputElement | null;
  const text = input?.value.trim() ?? '';
  if (!item || !text) return;
  const id = createTrackingItemId('note');
  await guardedMutation(
    (current, allowClosedMutation) => window.hasarbotu.addNote<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, id, text }),
    (tracking) => tracking.notes.push({ id, createdAt: new Date().toISOString(), createdBy: state.settings?.activeUser ?? 'Sistem', text })
  );
}

async function importLegacyNote(element?: HTMLElement): Promise<void> {
  const item = selectedCase();
  const index = Number(element?.dataset.legacyNoteIndex ?? -1);
  const legacy = Number.isInteger(index) ? item?.documentAnalysis.legacyNotes?.[index] : undefined;
  const legacyText = legacy?.text.trim() ?? '';
  if (!item || !legacy || !legacyText) return;
  if (item.tracking.notes.some((note) => note.text.includes(legacyText.slice(0, 120)))) {
    setToast('Bu eski not zaten takip notlarına aktarılmış görünüyor.', 'info');
    render();
    return;
  }
  const id = createTrackingItemId('note');
  const text = `Eski ${legacy.fileName}:\n${legacyText}`;
  await guardedMutation(
    (current, allowClosedMutation) => window.hasarbotu.addNote<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, id, text }),
    (tracking) => tracking.notes.push({ id, createdAt: new Date().toISOString(), createdBy: state.settings?.activeUser ?? 'Sistem', text })
  );
}

async function updateTodoWithCandidate(id: string, patch: { completed?: boolean; title?: string; priority?: string; assignedTo?: string; dueDate?: string }): Promise<void> {
  const item = selectedCase();
  if (!item) return;
  await guardedMutation(
    (current, allowClosedMutation) => window.hasarbotu.updateTodo<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, id, ...patch }),
    (tracking) => {
      const todo = tracking.todos.find((x) => x.id === id);
      if (!todo) return;
      if (patch.completed !== undefined) todo.completed = patch.completed;
      if (patch.title !== undefined) todo.title = patch.title;
      if (patch.priority !== undefined) todo.priority = patch.priority as typeof todo.priority;
      if (patch.assignedTo !== undefined) todo.assignedTo = patch.assignedTo;
      if (patch.dueDate !== undefined) todo.dueDate = patch.dueDate;
    }
  );
}

async function deleteTodo(id: string): Promise<void> {
  const item = selectedCase();
  if (!item || !id) return;
  if (!window.confirm('Bu görevi silmek istiyor musunuz?')) return;
  await guardedMutation(
    (current, allowClosedMutation) => window.hasarbotu.deleteTodo<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, id }),
    (tracking) => { tracking.todos = tracking.todos.filter((x) => x.id !== id); }
  );
}

async function deleteNote(id: string): Promise<void> {
  const item = selectedCase();
  if (!item || !id) return;
  if (!window.confirm('Bu notu silmek istiyor musunuz?')) return;
  await guardedMutation(
    (current, allowClosedMutation) => window.hasarbotu.deleteNote<TrackingWriteResult>({ folderPath: current.folderPath, allowClosedMutation, expectedRevision: current.revision, expectedWriteId: current.tracking.metadata.writeId, id }),
    (tracking) => { tracking.notes = tracking.notes.filter((x) => x.id !== id); }
  );
}

async function analyzePartsPhotoAction(): Promise<void> {
  if (state.partsAnalyzing) return;
  if (!state.settings?.geminiApiKey) {
    state.error = 'Önce Ayarlar → "AI / Parça Okuma" bölümünden Gemini API anahtarınızı girin.';
    state.activeTab = 'settings';
    render();
    return;
  }
  // v0.4.7: Aktif dosya bağlamı gönderilir; main tarafı yanlış plakalı fotoğrafı SERT engeller.
  const activeCase = selectedCase();
  state.partsAnalyzing = true;
  setToast('Fotoğraf Gemini ile okunuyor…', 'info');
  render();
  const result = await window.hasarbotu.analyzePartsPhoto<PartsPhotoAnalysis>({
    activePlate: activeCase?.plate ?? '',
    activeFolderPath: activeCase?.folderPath ?? ''
  });
  state.partsAnalyzing = false;
  if (!result.ok) {
    // Yanlış plakalı fotoğraf → modal ile engelle; fotoğraf veri merkezine/analize EKLENMEZ.
    if (result.error.code === 'PHOTO_PLATE_MISMATCH') {
      state.blockModal = { title: 'İşlem engellendi', message: result.error.message };
      render();
      return;
    }
    reportOperationError(result.error.message);
    return;
  }
  // v0.4.6: Fotoğraftan OKUNAN plaka (Gemini), seçili dosyanın plakasıyla uyuşmuyorsa ayrıca uyar.
  const selected = selectedCase();
  const readPlate = (result.data.vehicle.plate || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const casePlate = (selected?.plate || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const plateMismatch = readPlate.length >= 5 && casePlate.length >= 5 && readPlate !== casePlate;
  if (plateMismatch) {
    result.data.warnings = [`Fotoğraftaki plaka (${result.data.vehicle.plate}) seçili dosyanın plakasıyla (${selected?.plate}) uyuşmuyor olabilir — yanlış fotoğraf/dosya olmadığını kontrol edin.`, ...result.data.warnings];
  }
  state.partsAnalysis = result.data;
  setToast(`Parça listesi okundu: ${result.data.rows.length} satır • ${result.data.matchedCount} eşleşti.${plateMismatch ? ' ⚠ Plaka uyuşmuyor olabilir.' : ''}`, plateMismatch ? 'warning' : 'success');
  render();
}

async function loadPartsUserTerms(): Promise<void> {
  const result = await window.hasarbotu.getPartUserTerms<UserPartTerm[]>();
  if (result.ok) state.partsUserTerms = result.data;
}

async function learnPartTermAction(index: number): Promise<void> {
  const analysis = state.partsAnalysis;
  const row = analysis?.rows[index];
  if (!analysis || !row) return;
  const input = document.querySelector<HTMLInputElement>(`[data-part-canonical="${index}"]`);
  const canonical = (input?.value ?? '').trim();
  if (!canonical) {
    state.error = 'Önce gerçek parça adını yazın, sonra Öğret deyin.';
    render();
    return;
  }
  const result = await window.hasarbotu.learnPartTerm<UserPartTerm[]>({ alias: row.raw, canonical });
  if (!result.ok) {
    reportOperationError(result.error.message);
    return;
  }
  state.partsUserTerms = result.data;
  reapplyPartsUserTerms();
  setToast(`Öğrenildi: "${row.raw}" → ${canonical}. Bundan sonra otomatik tanınacak.`, 'success');
  render();
}

// Öğrenilen terimler güncellendiğinde mevcut listeyi yeniden normalize eder.
function reapplyPartsUserTerms(): void {
  const analysis = state.partsAnalysis;
  if (!analysis) return;
  const rows: AnalyzedPartRow[] = analysis.rows.map((row) => {
    const match = normalizePartName(row.raw, { userTerms: state.partsUserTerms });
    return {
      raw: row.raw,
      canonical: match.canonical,
      category: match.category,
      matched: match.matched,
      ...(match.laborPart ? { laborPart: match.laborPart } : {}),
      ...(row.quantity ? { quantity: row.quantity } : {}),
      ...(row.amount ? { amount: row.amount } : {}),
      ...(row.note ? { note: row.note } : {})
    };
  });
  const matchedCount = rows.filter((row) => row.matched).length;
  state.partsAnalysis = { ...analysis, rows, matchedCount, unmatchedCount: rows.length - matchedCount };
}

async function exportPartsLaborExcel(): Promise<void> {
  const analysis = state.partsAnalysis;
  if (!analysis || analysis.rows.length === 0) return;
  const rows = analysis.rows.map((row) => {
    const labor = row.laborPart ? suggestLaborForPart(row.laborPart) : null;
    return {
      description: row.matched ? `${row.canonical}${labor ? ` / ${labor.islem}` : ''}` : row.raw,
      partAmount: row.amount ?? 0,
      laborAmount: labor?.tutar ?? 0
    };
  });
  const result = await window.hasarbotu.exportPartsLaborExcel<CaseListExportResult>({ rows });
  if (!result.ok) {
    reportOperationError(result.error.message);
    return;
  }
  setToast(`Parça + işçilik Excel kaydedildi: ${result.data.rowCount} satır.`, 'success');
  render();
}

async function copyPartsList(): Promise<void> {
  const analysis = state.partsAnalysis;
  if (!analysis || analysis.rows.length === 0) return;
  const text = analysis.rows
    .map((row) => `${row.matched ? row.canonical : row.raw}${row.quantity ? ` x${row.quantity}` : ''}`)
    .join('\n');
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    document.body.removeChild(textarea);
  }
  if (copied) setToast('Temiz liste panoya kopyalandı.', 'success');
  else { state.error = 'Kopyalama başarısız oldu.'; }
  render();
}

async function chooseLaborExcel(): Promise<void> {
  const result = await window.hasarbotu.chooseLaborExcel<ExcelLaborPreview | null>();
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  if (!result.data) return;
  state.laborExcelPreview = result.data;
  state.laborExcelResult = null;
  state.laborRowOverrides = {};
  setToast(`Excel seçildi: ${result.data.rowCount} işçilik satırı bulundu.`, 'info');
  render();
}

function updateLaborOverride(input: HTMLInputElement): void {
  const rowNumber = Number(input.dataset.laborAmount);
  if (!Number.isInteger(rowNumber)) return;
  const raw = input.value.trim();
  if (raw === '') {
    delete state.laborRowOverrides[rowNumber];
  } else {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) return;
    state.laborRowOverrides[rowNumber] = Math.round(amount * 100) / 100;
  }
  updateLaborLiveTotal();
}

// v0.4.11 AI İşçilik Dağıtıcı — kullanıcının önizlemede elle düzelttiği tutarı kaydeder (re-render yok, focus korunur).
function updateAutoLaborEdit(input: HTMLInputElement): void {
  const rowNumber = Number(input.dataset.row);
  const category = input.dataset.cat ?? '';
  if (!Number.isInteger(rowNumber) || !category) return;
  const raw = input.value.trim();
  const edits = state.autoLaborEdits[rowNumber] ?? {};
  if (raw === '') {
    edits[category] = 0; // boş → yazma (0)
  } else {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) return;
    edits[category] = Math.round(amount);
  }
  state.autoLaborEdits[rowNumber] = edits;
}

async function autoLaborPreviewAction(): Promise<void> {
  if (state.autoLaborSaving) return;
  setToast('Excel seçiliyor ve tüm satırlar analiz ediliyor…', 'info');
  const result = await window.hasarbotu.autoLaborPreview<AutoLaborPreview>();
  if (!result.ok) {
    if (!/iptal/i.test(result.error.message)) reportOperationError(result.error.message);
    return;
  }
  state.autoLaborPreview = result.data;
  state.autoLaborEdits = {};
  state.autoLaborApprovedRows = {};
  state.autoLaborResult = null;
  state.autoLaborAllowFormula = false;
  const s = result.data.summary;
  setToast(`AI dağıtım hazır: ${s.processed} satır işlendi • ${s.highConfidence} yüksek güven • ${s.needsReview} kontrol gerekli.`, 'success');
  render();
}

async function autoLaborSaveAction(): Promise<void> {
  const preview = state.autoLaborPreview;
  if (!preview || state.autoLaborSaving) return;
  if (preview.columns.length === 0) { reportOperationError('İşçilik kategori sütunları bulunamadı; bu Excel için AI yazamaz.'); return; }
  const validCategories = new Set<AutoLaborCategory>(preview.columns.map((c) => c.category));
  const rows: Array<{ rowNumber: number; amounts: Partial<Record<AutoLaborCategory, number>> }> = [];
  const corrections: NonNullable<Parameters<typeof window.hasarbotu.autoLaborSave>[0]['corrections']> = [];
  for (const row of preview.rows) {
    const edits = state.autoLaborEdits[row.rowNumber];
    const approved = state.autoLaborApprovedRows[row.rowNumber] === true;
    const hasEdits = !!edits && Object.keys(edits).length > 0;
    const amounts: Partial<Record<AutoLaborCategory, number>> = {};
    for (const [cat, value] of Object.entries(row.amounts)) {
      if (typeof value === 'number' && value > 0) amounts[cat as AutoLaborCategory] = value;
    }
    if (edits) {
      for (const [cat, value] of Object.entries(edits)) {
        if (!validCategories.has(cat as AutoLaborCategory)) continue;
        if (value > 0) amounts[cat as AutoLaborCategory] = Math.round(value);
        else delete amounts[cat as AutoLaborCategory];
      }
    }
    if (Object.keys(amounts).length > 0) rows.push({ rowNumber: row.rowNumber, amounts });
    if ((approved || hasEdits) && Object.keys(amounts).length > 0) {
      corrections.push({
        alias: row.partName,
        ...(row.partCode ? { partCode: row.partCode } : {}),
        categories: Object.keys(amounts) as AutoLaborCategory[],
        amounts,
        amountLogic: hasEdits ? 'kullanıcı düzeltmesi (AI dağıtıcı)' : 'kullanıcı onayı (AI dağıtıcı)'
      });
    }
  }
  if (rows.length === 0) { reportOperationError('Yazılacak işçilik tutarı bulunamadı.'); return; }
  state.autoLaborSaving = true;
  render();
  const result = await window.hasarbotu.autoLaborSave<AutoLaborSaveResult>({
    filePath: preview.filePath,
    rows,
    columns: preview.columns,
    allowFormulaReplacement: state.autoLaborAllowFormula,
    needsReviewRows: preview.rows.filter((row) => row.needsReview).length,
    corrections
  });
  state.autoLaborSaving = false;
  if (!result.ok) {
    if (!/iptal/i.test(result.error.message)) reportOperationError(result.error.message);
    render();
    return;
  }
  state.autoLaborResult = result.data;
  setToast(`AI işçilik kaydedildi: ${result.data.changedRows} satır • ${result.data.learnedCount} öğrenildi • yedek alındı.`, 'success');
  render();
}

function updateLaborLiveTotal(): void {
  const preview = state.laborExcelPreview;
  const el = document.getElementById('labor-live-total');
  if (preview && el) el.textContent = formatMoney(laborWrittenTotal(preview, state.laborRowOverrides));
}

async function refreshLaborExcelPreview(): Promise<void> {
  const preview = state.laborExcelPreview;
  if (!preview) return;
  const usePriceList = (document.getElementById('labor-use-price-list') as HTMLInputElement | null)?.checked ?? (preview.distributionMode === 'price-list');
  const totalInput = document.getElementById('labor-target-total') as HTMLInputElement | null;
  const columnSelect = document.getElementById('labor-target-column') as HTMLSelectElement | null;
  const targetTotal = Number(totalInput?.value ?? '');
  const inspectArgs: { filePath: string; targetTotal?: number; targetColumn?: string; usePriceList?: boolean } = {
    filePath: preview.filePath,
    targetColumn: columnSelect?.value || preview.targetColumn
  };
  if (usePriceList) inspectArgs.usePriceList = true;
  else if (Number.isFinite(targetTotal) && targetTotal > 0) inspectArgs.targetTotal = targetTotal;
  const result = await window.hasarbotu.inspectLaborExcel<ExcelLaborPreview>(inspectArgs);
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  // Kolon/mod değişince satırlar ve hesaplanan tutarlar değiştiği için elle düzenlemeler sıfırlanır.
  state.laborExcelPreview = result.data;
  state.laborExcelResult = null;
  state.laborRowOverrides = {};
  render();
}

async function distributeLaborExcel(): Promise<void> {
  const preview = state.laborExcelPreview;
  if (!preview) {
    state.error = 'Önce Excel dosyası seçin.';
    render();
    return;
  }
  const usePriceList = (document.getElementById('labor-use-price-list') as HTMLInputElement | null)?.checked ?? (preview.distributionMode === 'price-list');
  const input = document.getElementById('labor-target-total') as HTMLInputElement | null;
  const targetTotal = Number(input?.value ?? '');
  if (!usePriceList && (!Number.isFinite(targetTotal) || targetTotal <= 0)) {
    state.error = 'Hedef toplam işçilik tutarı 0’dan büyük olmalıdır.';
    render();
    return;
  }
  if (usePriceList && (preview.matchedRowCount ?? 0) === 0) {
    state.error = 'Fiyat listesiyle eşleşen satır yok. Açıklamalar parça/işlem adlarıyla eşleşmiyor olabilir; İşçilik kolonunu kontrol edin.';
    render();
    return;
  }
  const columnSelect = document.getElementById('labor-target-column') as HTMLSelectElement | null;
  const allowRiskyColumn = (document.getElementById('labor-allow-risky-column') as HTMLInputElement | null)?.checked ?? !preview.requiresUserConfirmation;
  const allowFormulaReplacement = (document.getElementById('labor-allow-formula') as HTMLInputElement | null)?.checked ?? !preview.formulasWillBeReplaced;
  const allowEqualDistribution = usePriceList ? true : ((document.getElementById('labor-allow-equal') as HTMLInputElement | null)?.checked ?? preview.distributionMode !== 'equal');
  const missingApprovals = [
    ...(preview.requiresUserConfirmation && !allowRiskyColumn ? ['Kolon seçimi onayı'] : []),
    ...(preview.formulasWillBeReplaced && !allowFormulaReplacement ? ['Formül dönüşümü onayı'] : []),
    ...(!usePriceList && preview.distributionMode === 'equal' && !allowEqualDistribution ? ['Eşit dağıtım onayı'] : [])
  ];
  if (missingApprovals.length > 0) {
    state.error = `${missingApprovals.join(', ')} eksik. Excel dağıtımı yapılmadı.`;
    render();
    return;
  }
  const overrides = Object.entries(state.laborRowOverrides).map(([rowNumber, amount]) => ({ rowNumber: Number(rowNumber), amount }));
  const result = await window.hasarbotu.distributeLaborExcel<ExcelLaborDistributeResult>({
    filePath: preview.filePath,
    targetTotal: usePriceList ? 0 : targetTotal,
    targetColumn: columnSelect?.value || preview.targetColumn,
    allowRiskyColumn,
    allowFormulaReplacement,
    allowEqualDistribution,
    usePriceList,
    ...(overrides.length ? { overrides } : {})
  });
  if (!result.ok) {
    reportOperationError(result.error.message);
    return;
  }
  state.laborExcelResult = result.data;
  state.laborExcelPreview = result.data;
  // Elle düzenlemeler korunur ki tablo yazılan değerleri göstermeye devam etsin;
  // yeni dosya/kolon/mod seçildiğinde otomatik sıfırlanır.
  setToast('İşçilik Excel dağıtımı doğrulandı ve kaydedildi.', 'success');
  render();
}

function caseToExportRow(item: CaseIndexItem): CaseListExportRow {
  return {
    officeFileNo: item.officeFileNo || '',
    claimNoticeNo: item.claimNoticeNo || '',
    plate: item.plate || '',
    claimType: item.claimType || '',
    workflowStatus: item.workflowStatus || '',
    dosyaDurumu: item.dosyaDurumu || '',
    sorumlu: item.sorumlu || '',
    serviceName: item.serviceName || '',
    takipTarihi: item.takipTarihi || '',
    sonIslemTarihi: item.tracking.assignment.sonIslemTarihi || '',
    missingDocuments: item.documentAnalysis.missingCritical.length,
    missingPhotos: missingPhotoCountForExport(item),
    unsupportedPhotos: item.photoAnalysis.unsupportedFiles.length,
    openTodos: item.tracking.todos.filter((todo) => !todo.completed).length,
    folderPath: item.folderPath
  };
}

async function exportFilteredCasesExcel(): Promise<void> {
  const filtered = getFilteredCases(state.cases, state.search, state.filter, state.responsibleFilter, state.serviceFilter, state.statusFilter, state.sortMode, state.settings?.activeUser ?? '');
  const result = await window.hasarbotu.exportCaseListExcel<CaseListExportResult>({ rows: filtered.map(caseToExportRow) });
  if (!result.ok) {
    reportOperationError(result.error.message);
    return;
  }
  setToast(`Excel liste dışa aktarıldı: ${result.data.rowCount} dosya.`, 'success');
  render();
}

// Durum Panosu: panoda GÖRÜNEN (filtre + arama + sıralama uygulanmış) dosyaları Excel'e aktarır.
// Bir filtre aktifse sadece o filtreye uyan dosyaları aktarır; filtre yoksa görünen tüm dosyalar.
async function exportAllCasesExcel(): Promise<void> {
  const cases = statusBoardCases(state);
  if (cases.length === 0) {
    state.error = 'Aktarılacak dosya yok (panoda görünen dosya bulunmuyor).';
    render();
    return;
  }
  const result = await window.hasarbotu.exportCaseListExcel<CaseListExportResult>({ rows: cases.map(caseToExportRow) });
  if (!result.ok) {
    reportOperationError(result.error.message);
    return;
  }
  setToast(`Panodaki ${result.data.rowCount} dosya Excel'e aktarıldı.`, 'success');
  render();
}

function setStatusBoardPage(page: number): void {
  const pageCount = statusBoardPageCount(statusBoardCases(state).length);
  state.statusBoardPage = Math.min(Math.max(1, Number.isFinite(page) ? page : 1), pageCount);
  render();
}

// v0.4.6 Durum Panosu gelişmiş filtre anahtarları.
function applyStatusBoardToggle(key: string, value: boolean): void {
  if (key === 'show-closed') state.statusBoardShowClosed = value;
  else if (key === 'missing-only') state.statusBoardMissingOnly = value;
  else if (key === 'open-todo-only') state.statusBoardOpenTodoOnly = value;
  else return;
  state.statusBoardPage = 1;
  render();
}

function clearStatusBoardFilters(): void {
  state.statusBoardSearch = '';
  state.statusBoardStatusFilter = 'all';
  state.statusBoardResponsibleFilter = 'all';
  state.statusBoardMissingOnly = false;
  state.statusBoardOpenTodoOnly = false;
  state.statusBoardShowClosed = false;
  state.statusBoardPage = 1;
  render();
}

function openCaseFromBoard(folder?: string): void {
  if (!folder) return;
  state.selectedFolderPath = folder;
  state.activeTab = 'operasyon';
  render();
  void hydrateSelectedCase(folder, true);
}

function missingPhotoCountForExport(item: CaseIndexItem): number {
  const p = item.photoAnalysis;
  return [!p.hasarFolderExists, p.damagePhotoCount === 0, !p.hasKm, !p.hasVites, !p.hasSaseOrSasi].filter(Boolean).length;
}

async function inspectConflictCopy(folderPath?: string): Promise<void> {
  const item = folderPath ? state.cases.find((caseItem) => caseItem.folderPath === folderPath) : selectedCase();
  if (!item) return;
  state.selectedFolderPath = item.folderPath;
  const result = await window.hasarbotu.inspectConflictCopy<ConflictTrackingCopyInfo>(item.folderPath);
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  state.conflict = {
    folderPath: item.folderPath,
    message: `pCloud çakışma kopyası inceleniyor: ${result.data.fileName}. Güvenli birleştirme ile çakışma kopyasındaki farklı alanlar ana takip dosyasına alınabilir.`,
    expectedRevision: result.data.current.metadata.revision,
    currentRevision: result.data.current.metadata.revision,
    baseTracking: result.data.current,
    localTracking: result.data.conflictTracking,
    diskTracking: result.data.current
  };
  state.error = '';
  render();
}


async function acceptDiskBaseline(folderPath?: string): Promise<void> {
  const item = folderPath ? state.cases.find((caseItem) => caseItem.folderPath === folderPath) : selectedCase();
  if (!item) return;
  const ok = window.confirm('Diskteki takip.json bu bilgisayar için yeni güvenli baseline kabul edilecek. Bu işlem rollback sonrası kalıcı revizyon gerilemesi uyarısını temizlemek içindir. Emin misiniz?');
  if (!ok) return;
  const result = await window.hasarbotu.acceptDiskBaseline(item.folderPath);
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  setToast('Disk sürümü yeni baseline olarak kabul edildi.', 'success');
  await reloadCache();
  render();
}

async function resolveConflict(strategy: ConflictResolutionStrategy): Promise<void> {
  const conflict = state.conflict;
  if (!conflict) return;
  if (strategy === 'use-local') {
    const ok = window.confirm('Bendeki yerel sürüm diskteki güncel sürümün üzerine yazılacak. Emin misiniz?');
    if (!ok) return;
  }
  const result = await window.hasarbotu.resolveConflict<TrackingWriteResult>({
    folderPath: conflict.folderPath,
    currentRevision: conflict.currentRevision,
    currentWriteId: conflict.diskTracking.metadata.writeId,
    allowClosedMutation: true,
    strategy,
    baseTracking: conflict.baseTracking,
    localTracking: conflict.localTracking
  });
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  if ('conflict' in result.data) {
    state.conflict = {
      ...conflict,
      message: result.data.message,
      currentRevision: result.data.currentRevision,
      diskTracking: result.data.current
    };
    render();
    return;
  }
  state.conflict = null;
  setToast(strategy === 'use-disk' ? 'Diskteki güncel sürüm kullanıldı.' : 'Çakışma çözüldü ve takip dosyası güncellendi.', 'success');
  await reloadCache();
  render();
}


async function refreshDashboardOnly(): Promise<void> {
  const result = await window.hasarbotu.getDashboard();
  if (result.ok) state.dashboard = result.data;
  else state.error = result.error.message;
}

function patchCase(item: CaseIndexItem): void {
  const index = state.cases.findIndex((candidate) => candidate.folderPath === item.folderPath);
  if (index === -1) state.cases.unshift(item);
  else state.cases[index] = item;
  if (!state.selectedFolderPath) state.selectedFolderPath = item.folderPath;
}

function patchTrackingResult(folderPath: string, tracking: TrackingFile): void {
  const index = state.cases.findIndex((candidate) => candidate.folderPath === folderPath);
  if (index === -1) return;
  const previous = state.cases[index]!;
  const claimType = tracking.claimType !== 'unknown' ? tracking.claimType : previous.documentAnalysis.claimType;
  const officeFileNo = tracking.caseIdentity.officeFileNo || previous.officeFileNo || '';
  const claimNoticeNo = tracking.caseIdentity.claimNoticeNo || previous.documentAnalysis.claimNoticeNo || previous.claimNoticeNo || tracking.caseIdentity.dosyaNo || '';
  const next: CaseIndexItem = {
    ...previous,
    claimType,
    officeFileNo,
    claimNoticeNo,
    workflowStatus: tracking.status.workflowStatus,
    dosyaDurumu: tracking.status.dosyaDurumu,
    oncelik: tracking.assignment.oncelik,
    sorumlu: tracking.assignment.sorumlu,
    serviceName: tracking.service?.name ?? '',
    eksper: tracking.assignment.eksper,
    raportor: tracking.assignment.raportor,
    takipTarihi: tracking.assignment.takipTarihi,
    revision: tracking.metadata.revision,
    updatedAt: tracking.metadata.updatedAt,
    tracking,
    statusIsClosed: tracking.status.kapaliMi
  };
  next.searchText = normalizeSearch([
    next.plate,
    officeFileNo,
    claimNoticeNo,
    next.dosyaNo,
    next.monthFolder,
    next.folderPath,
    next.sorumlu,
    next.serviceName,
    next.claimType,
    next.eksper,
    next.raportor,
    next.dosyaDurumu,
    next.workflowStatus
  ].filter(Boolean).join(' '));
  state.cases[index] = next;
}

function isCaseIndexItem(value: unknown): value is CaseIndexItem {
  return !!value && typeof value === 'object' && typeof (value as CaseIndexItem).folderPath === 'string' && !!(value as CaseIndexItem).tracking;
}

async function refreshDeploymentStatus(): Promise<void> {
  const result = await window.hasarbotu.getDeploymentStatus<DeploymentStatus>();
  if (result.ok) {
    state.deploymentStatus = result.data;
    state.deploymentBannerDismissed = false;
    setToast(result.data.versionCheckAvailable
      ? `Sürüm kontrolü yenilendi: bu PC v${result.data.appVersion}, ofis hedefi v${result.data.expectedVersion}.`
      : `Sürüm kontrolü yenilendi: bu PC v${result.data.appVersion}. Ofis hedef sürüm kaydı yok.`, result.data.isOutdated ? 'warning' : 'info');
  } else state.error = result.error.message;
  render();
}

async function registerDeploymentClient(): Promise<void> {
  const result = await window.hasarbotu.registerDeploymentClient<DeploymentStatus>();
  if (result.ok) {
    state.deploymentStatus = result.data;
    state.deploymentBannerDismissed = false;
    setToast(`Bu bilgisayar ofis sürüm listesine kaydedildi: ${result.data.activeComputer} / v${result.data.appVersion}.`, result.data.isOutdated ? 'warning' : 'success');
  } else state.error = result.error.message;
  render();
}

async function showHealth(): Promise<void> {
  const result = await window.hasarbotu.getHealth<DebugHealthReport>();
  if (result.ok) setToast(`Tanılama: ${result.data.caseCount} dosya • önbellek: ${result.data.cacheRoot} • ana klasör: ${result.data.rootAvailable ? 'bağlı' : 'yok'}`, 'info');
  else state.error = result.error.message;
  render();
}

function scanToast(report: ScanReport, manual: boolean): string {
  const stopped = report.warnings.includes('Tarama kullanıcı isteğiyle durduruldu.');
  if (stopped) return `Tarama durduruldu: ${report.totalCases} dosya işlendi.`;
  const critical = report.corruptTrackingFiles > 0 || report.failedCases > 0 || report.conflictFiles > 0 || (report.issues?.length ?? 0) > 0;
  if (critical) {
    return `Dikkat: taramada ${report.corruptTrackingFiles} takip sorunu, ${report.conflictFiles} çakışma, ${report.failedCases} okunamayan klasör var.`;
  }
  return manual ? `Tarama tamamlandı: ${report.totalCases} dosya, ${report.changedCases} değişen klasör.` : '';
}

async function handleSettingsInputChange(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): Promise<void> {
  if (!state.settings) return;
  const setting = target.dataset.setting;
  if (setting === 'activeUser') {
    state.settings.activeUser = cleanName(target.value);
    state.settings.users = normalizeUserList(state.settings.users, state.settings.activeUser);
    await persistSettings('Aktif kullanıcı değiştirildi.');
    return;
  }
  if (setting === 'theme') {
    state.settings.theme = target.value === 'dark' ? 'dark' : 'light';
    applyThemeAndZoom();
    await persistSettings('Tema kaydedildi.');
    return;
  }
  if (setting === 'zoom') {
    state.settings.zoom = clamp(Number(target.value) || 1, 0.8, 1.35);
    applyThemeAndZoom();
    await persistSettings('Yakınlaştırma kaydedildi.');
    return;
  }
  if (setting === 'geminiApiKey') {
    state.settings.geminiApiKey = target.value.trim();
    await persistSettings(target.value.trim() ? 'Gemini API anahtarı kaydedildi.' : 'Gemini API anahtarı temizlendi.');
    return;
  }
  const intervalKey = target.dataset.settingInterval as keyof AppSettings['scanIntervals'] | undefined;
  if (intervalKey && intervalKey in state.settings.scanIntervals) {
    const value = Number(target.value);
    if (Number.isFinite(value)) state.settings.scanIntervals[intervalKey] = Math.round(value);
    await persistSettings('Tarama aralığı kaydedildi.');
    scheduleAutoScan();
    return;
  }
  const renameIndex = target.dataset.userRename;
  if (renameIndex !== undefined) await renameUser(Number(renameIndex), target.value);
}

async function chooseRootPath(): Promise<void> {
  const result = await window.hasarbotu.chooseRoot<AppSettings>();
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  state.settings = result.data;
  state.rootSetupRequired = false;
  state.activeTab = 'home';
  state.filter = 'all';
  state.responsibleFilter = 'all';
  state.serviceFilter = 'all';
  state.statusFilter = 'all';
  state.search = '';
  state.caseListScrollTop = 0;
  setToast('Ana klasör seçildi. Tarama başlatılıyor.', 'success');
  state.error = '';
  await loadDeploymentStatus();
  await reloadCache();
  render();
  await scanNow();
}

async function saveSettingsFromPage(): Promise<void> {
  if (!state.settings) return;
  const rootInput = document.getElementById('settings-root-path') as HTMLInputElement | null;
  if (rootInput) state.settings.rootPath = rootInput.value.trim();
  if (!state.settings.rootPath) {
    state.error = 'Ana klasör yolu boş olamaz.';
    render();
    return;
  }
  state.settings.rootPathConfirmed = true;
  state.settings.users = normalizeUserList(state.settings.users, state.settings.activeUser);
  await persistSettings('Ayarlar kaydedildi.');
  state.rootSetupRequired = false;
  state.activeTab = 'home';
  state.filter = 'all';
  state.responsibleFilter = 'all';
  state.serviceFilter = 'all';
  state.statusFilter = 'all';
  state.search = '';
  state.caseListScrollTop = 0;
  await loadDeploymentStatus();
  await reloadCache();
  await scanNow();
}

async function addUserFromPage(): Promise<void> {
  if (!state.settings) return;
  const input = document.getElementById('new-user-name') as HTMLInputElement | null;
  const name = cleanName(input?.value ?? '');
  if (!name) {
    state.error = 'Kullanıcı adı boş olamaz.';
    render();
    return;
  }
  state.settings.users = normalizeUserList([...(state.settings.users ?? []), name], state.settings.activeUser);
  if (input) input.value = '';
  await persistSettings('Kullanıcı eklendi.');
}

async function removeUserFromButton(element?: HTMLElement): Promise<void> {
  if (!state.settings) return;
  const button = element?.closest<HTMLButtonElement>('[data-user-index]') ?? null;
  const index = Number(button?.dataset.userIndex ?? -1);
  const users = normalizeUserList(state.settings.users, state.settings.activeUser);
  if (!Number.isInteger(index) || index < 0 || index >= users.length) return;
  if (users.length <= 1) {
    state.error = 'En az bir kullanıcı kalmalıdır.';
    render();
    return;
  }
  const removed = users[index] ?? '';
  state.settings.users = users.filter((_, i) => i !== index);
  if (state.settings.activeUser === removed) state.settings.activeUser = state.settings.users[0] ?? 'Sistem';
  await persistSettings('Kullanıcı silindi. Eski takip kayıtları korunur.');
}

async function setActiveUserFromButton(element?: HTMLElement): Promise<void> {
  if (!state.settings) return;
  const button = element?.closest<HTMLButtonElement>('[data-user-index]') ?? null;
  const index = Number(button?.dataset.userIndex ?? -1);
  const users = normalizeUserList(state.settings.users, state.settings.activeUser);
  if (!Number.isInteger(index) || index < 0 || index >= users.length) return;
  state.settings.activeUser = users[index] ?? 'Sistem';
  await persistSettings('Aktif kullanıcı değiştirildi.');
}

async function renameUser(index: number, rawName: string): Promise<void> {
  if (!state.settings) return;
  const users = normalizeUserList(state.settings.users, state.settings.activeUser);
  if (!Number.isInteger(index) || index < 0 || index >= users.length) return;
  const oldName = users[index] ?? '';
  const newName = cleanName(rawName);
  if (!newName) {
    state.error = 'Kullanıcı adı boş olamaz.';
    render();
    return;
  }
  users[index] = newName;
  state.settings.users = normalizeUserList(users, state.settings.activeUser === oldName ? newName : state.settings.activeUser);
  if (state.settings.activeUser === oldName) state.settings.activeUser = newName;
  await persistSettings('Kullanıcı adı güncellendi.');
}

async function persistSettings(message: string): Promise<void> {
  if (!state.settings) return;
  const result = await window.hasarbotu.saveSettings<AppSettings>(state.settings);
  if (result.ok) {
    state.settings = result.data;
    setToast(message, 'success');
    state.error = '';
    applyThemeAndZoom();
  } else state.error = result.error.message;
  render();
}


function setToast(message: string, kind: 'info' | 'success' | 'warning' = 'info'): void {
  state.toast = message;
  state.toastKind = kind;
}

// v0.4.2: Kullanıcı iptali (örn. Excel kaydetme/dışa aktarma iptali) kalıcı hata bandı yerine
// kendiliğinden kapanan bir uyarı olarak gösterilir; gerçek hatalar hata bandında kalır.
function reportOperationError(message: string): void {
  if (/iptal edildi/i.test(message)) {
    state.error = '';
    setToast(message, 'warning');
  } else {
    state.error = message;
  }
  render();
}

function scheduleToastAutoDismiss(): void {
  if (toastAutoDismissTimer !== null) {
    window.clearTimeout(toastAutoDismissTimer);
    toastAutoDismissTimer = null;
  }
  if (!state.toast) return;
  const message = state.toast;
  const duration = state.toastKind === 'warning' ? 8000 : 5000;
  toastAutoDismissTimer = window.setTimeout(() => {
    if (state.toast === message) {
      state.toast = '';
      render();
    }
  }, duration);
}

// v0.4.2: Hatalar da kalıcı kalmasın; okunacak kadar görünüp otomatik kapanır (kullanıcı ✕ ile de kapatabilir).
function scheduleErrorAutoDismiss(): void {
  if (errorAutoDismissTimer !== null) {
    window.clearTimeout(errorAutoDismissTimer);
    errorAutoDismissTimer = null;
  }
  if (!state.error) return;
  const message = state.error;
  errorAutoDismissTimer = window.setTimeout(() => {
    if (state.error === message) {
      state.error = '';
      render();
    }
  }, ERROR_AUTO_DISMISS_MS);
}

function toggleAdvancedFilters(): void {
  state.advancedFiltersOpen = !state.advancedFiltersOpen;
  render();
}

function dismissDeploymentBanner(): void {
  state.deploymentBannerDismissed = true;
  render();
}

function dismissError(): void {
  state.error = '';
  render();
}

function dismissToast(): void {
  if (toastAutoDismissTimer !== null) {
    window.clearTimeout(toastAutoDismissTimer);
    toastAutoDismissTimer = null;
  }
  state.toast = '';
  render();
}

function fileResponsibleOrActiveUser(sorumlu: string | undefined): string {
  const responsible = cleanName(sorumlu ?? '');
  if (responsible && responsible !== 'Atanmadı') return responsible;
  return state.settings?.activeUser ?? 'Sistem';
}

function normalizeUserList(input: string[] | undefined, activeUser: string): string[] {
  const cleaned = (input ?? []).map((name) => cleanName(name)).filter((name) => name.length > 0);
  const active = cleanName(activeUser);
  if (active && !cleaned.includes(active)) cleaned.unshift(active);
  const unique = [...new Set(cleaned)].slice(0, 50);
  return unique.length ? unique : ['Sistem'];
}

function cleanName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function guardedMutation(
  operation: (item: CaseIndexItem, allowClosedMutation: boolean) => Promise<ApiResult<TrackingWriteResult>>,
  localCandidateMutator?: (tracking: TrackingFile) => void
): Promise<void> {
  const initial = selectedCase();
  if (!initial) return;
  const folderPath = initial.folderPath;
  await mutationQueue.run(folderPath, () => executeGuardedMutation(folderPath, operation, localCandidateMutator));
}

async function executeGuardedMutation(
  folderPath: string,
  operation: (item: CaseIndexItem, allowClosedMutation: boolean) => Promise<ApiResult<TrackingWriteResult>>,
  localCandidateMutator?: (tracking: TrackingFile) => void
): Promise<void> {
  const item = state.cases.find((candidate) => candidate.folderPath === folderPath) ?? selectedCase();
  if (!item) return;
  const baseTracking = cloneTracking(item.tracking);
  const localTracking = cloneTracking(item.tracking);
  try {
    localCandidateMutator?.(localTracking);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    render();
    return;
  }
  const isClosed = item.isClosedFolder === true || item.statusIsClosed === true || item.workflowStatus === 'Kapalı' || item.tracking.status.kapaliMi === true;
  let allowClosedMutation = false;
  if (isClosed) {
    if (state.closedMutationUnlocks[item.folderPath] !== true) {
      const ok = window.confirm('Bu dosya kapalı. Bu oturum için düzenleme izni açılsın mı?');
      if (!ok) { render(); return; }
      state.closedMutationUnlocks[item.folderPath] = true;
      setToast('Kapalı dosya bu oturum için düzenlemeye açıldı.', 'warning');
    }
    allowClosedMutation = true;
  }
  const result = await operation(item, allowClosedMutation);
  if (!result.ok) {
    state.error = result.error.message;
    render();
    return;
  }
  if ('conflict' in result.data) {
    state.conflict = {
      folderPath: item.folderPath,
      message: result.data.message,
      expectedRevision: result.data.expectedRevision,
      currentRevision: result.data.currentRevision,
      baseTracking,
      localTracking,
      diskTracking: result.data.current
    };
    state.error = '';
    render();
    return;
  }
  patchTrackingResult(folderPath, result.data.tracking);
  setToast('Takip dosyası güncellendi.', 'success');
  await refreshDashboardOnly();
  render();
}

async function loadVisibleThumbnails(): Promise<void> {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('img[data-thumbnail-path]')).filter((img) => !img.dataset.loaded && !img.dataset.loading).slice(0, 24);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(THUMBNAIL_LOAD_CONCURRENCY, images.length) }, async () => {
    while (cursor < images.length) {
      const img = images[cursor++];
      if (!img) continue;
      const filePath = img.dataset.thumbnailPath;
      if (!filePath) continue;
      img.dataset.loading = '1';
      const result = await window.hasarbotu.getPhotoThumbnail<ThumbnailResult>(filePath);
      img.dataset.loading = '';
      img.dataset.loaded = '1';
      if (result.ok && result.data.dataUrl) {
        img.src = result.data.dataUrl;
        img.hidden = false;
      } else {
        img.parentElement?.classList.add('thumbnail-error');
        img.hidden = true;
      }
    }
  });
  await Promise.all(workers);
}

function restoreVirtualListScroll(): void {
  const list = document.querySelector<HTMLElement>('[data-virtual-list="cases"]');
  if (!list) return;
  if (Math.abs(list.scrollTop - state.caseListScrollTop) > 2) list.scrollTop = state.caseListScrollTop;
  updateVirtualCaseList();
}

function queueVirtualListRender(): void {
  if (virtualRenderQueued) return;
  virtualRenderQueued = true;
  window.requestAnimationFrame(() => {
    virtualRenderQueued = false;
    updateVirtualCaseList();
    void loadVisibleThumbnails();
  });
}

function updateVirtualCaseList(): void {
  const list = document.querySelector<HTMLElement>('[data-virtual-list="cases"]');
  const body = document.querySelector<HTMLElement>('[data-virtual-body="cases"]');
  if (!list || !body) return;
  const filtered = getFilteredCases(state.cases, state.search, state.filter, state.responsibleFilter, state.serviceFilter, state.statusFilter, state.sortMode, state.settings?.activeUser ?? '');
  const viewportHeight = Math.max(160, list.clientHeight || 0);
  body.style.height = `${getVirtualListTotalHeight(filtered.length, viewportHeight)}px`;
  body.innerHTML = renderCaseVirtualRows(filtered, state.selectedFolderPath, state.caseListScrollTop, viewportHeight);
}

function cloneTracking(input: TrackingFile): TrackingFile {
  return JSON.parse(JSON.stringify(input)) as TrackingFile;
}

function createTrackingItemId(prefix: 'todo' | 'note'): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function applyThemeAndZoom(): void {
  const settings = state.settings;
  const responsive = computeResponsiveScale();
  const manualZoom = clamp(settings?.zoom ?? 1, 0.8, 1.35);
  const effectiveZoom = Number(manualZoom.toFixed(3));
  const root = document.documentElement;
  root.classList.toggle('dark', settings?.theme === 'dark');
  root.classList.toggle('light', settings?.theme !== 'dark');
  root.classList.toggle('density-compact', responsive.density === 'compact');
  root.classList.toggle('density-tight', responsive.density === 'tight');
  root.style.setProperty('--app-zoom', String(manualZoom));
  root.style.setProperty('--display-scale', '1');
  root.style.setProperty('--effective-zoom', String(effectiveZoom));
  root.dataset.viewport = `${Math.round(responsive.width)}x${Math.round(responsive.height)}`;
  root.dataset.dpr = responsive.devicePixelRatio.toFixed(2);
}

function computeResponsiveScale(): { scale: number; density: 'normal' | 'compact' | 'tight'; width: number; height: number; devicePixelRatio: number } {
  const width = window.innerWidth || document.documentElement.clientWidth || 1440;
  const height = window.innerHeight || document.documentElement.clientHeight || 900;
  const devicePixelRatio = window.devicePixelRatio || 1;
  let scale = 1;
  let density: 'normal' | 'compact' | 'tight' = 'normal';

  if (width < 1180 || height < 760 || (devicePixelRatio >= 1.5 && width < 1500)) {
    density = 'tight';
  } else if (width < 1320 || height < 840) {
    density = 'compact';
  }

  return { scale, density, width, height, devicePixelRatio };
}

function handleResponsiveResize(): void {
  applyThemeAndZoom();
  if (responsiveResizeTimer !== null) window.clearTimeout(responsiveResizeTimer);
  responsiveResizeTimer = window.setTimeout(() => {
    responsiveResizeTimer = null;
    updateVirtualCaseList();
    void loadVisibleThumbnails();
  }, 80);
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scheduleAutoScan(): void {
  if (autoScanTimer !== null) {
    window.clearInterval(autoScanTimer);
    autoScanTimer = null;
  }
  const interval = state.settings?.scanIntervals.fullYearLightMs ?? 0;
  if (!Number.isFinite(interval) || interval < 300000) return;
  autoScanTimer = window.setInterval(() => {
    if (state.scanRunning) return;
    void scanNow();
  }, interval);
}
