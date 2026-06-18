import type { AppSettings, AutoLaborPreview, AutoLaborSaveResult, CaseIndexItem, DashboardSummary, ExcelLaborDistributeResult, ExcelLaborPreview, FolderBrowseResult, PartsPhotoAnalysis, ScanReport, TrackingFile, DeploymentStatus } from '../../shared/types';
import type { UserPartTerm } from '../../shared/parca-sozlugu';

export interface UiState {
  settings: AppSettings | null;
  dashboard: DashboardSummary | null;
  cases: CaseIndexItem[];
  selectedFolderPath: string;
  search: string;
  filter: string;
  responsibleFilter: string;
  serviceFilter: string;
  /** v0.4.2 Dosyalar: Durum (workflowStatus) açılır filtresi; varsayılan 'all'. */
  statusFilter: string;
  sortMode: CaseSortMode;
  activeTab: DetailTab;
  scanRunning: boolean;
  lastScanReport: ScanReport | null;
  toast: string;
  toastKind: 'info' | 'success' | 'warning';
  error: string;
  caseListScrollTop: number;
  conflict: ConflictDialogState | null;
  /** v0.4.7: Sert engelleme modalı (ör. yanlış plakalı fotoğraf). Kapatılmadan işlem sürmez. */
  blockModal: { title: string; message: string } | null;
  rootSetupRequired: boolean;
  laborExcelPreview: ExcelLaborPreview | null;
  laborExcelResult: ExcelLaborDistributeResult | null;
  /** v0.4.11 AI İşçilik Dağıtıcı: önizleme, kullanıcı düzeltmeleri (satır→kategori→tutar), satır onayları, kayıt sonucu. */
  autoLaborPreview: AutoLaborPreview | null;
  autoLaborEdits: Record<number, Record<string, number>>;
  autoLaborApprovedRows: Record<number, boolean>;
  autoLaborSaving: boolean;
  autoLaborResult: AutoLaborSaveResult | null;
  autoLaborAllowFormula: boolean;
  /** İşçilik tablosunda kullanıcının elle değiştirdiği satır tutarları (satır no → tutar). */
  laborRowOverrides: Record<number, number>;
  /** AI ile okunan parça listesi fotoğrafı analizi. */
  partsAnalysis: PartsPhotoAnalysis | null;
  /** Parça fotoğrafı analizi sürüyor mu. */
  partsAnalyzing: boolean;
  /** Kullanıcının öğrettiği parça terimleri (kalıcı, kişisel sözlük). */
  partsUserTerms: UserPartTerm[];
  deploymentStatus: DeploymentStatus | null;
  /** v0.4.1 Klasörler: yalnızca-okunur pCloud klasör gezgini durumu. */
  folderBrowse: FolderBrowseResult | null;
  folderLoading: boolean;
  /** v0.3.16: Kapalı dosyada düzenleme onayı oturum içinde bir kez alınır. */
  closedMutationUnlocks: Record<string, boolean>;
  /** v0.4.2 Dosyalar: Gelişmiş Filtreler bölümü açık mı (varsayılan kapalı). */
  advancedFiltersOpen: boolean;
  /** v0.4.2: Ofis sürüm uyarı bandı bu oturumda kapatıldı mı (kalıcı değil). */
  deploymentBannerDismissed: boolean;
  /** v0.4.5 Durum Panosu: aktif sayfa (1 tabanlı), 50 dosya/sayfa. */
  statusBoardPage: number;
  /** Durum Panosu arama metni. */
  statusBoardSearch: string;
  /** Durum Panosu sıralaması (varsayılan dosya no'ya göre). */
  statusBoardSort: StatusBoardSort;
  /** Durum Panosu operasyon durumu filtresi ('all' veya workflowStatus). */
  statusBoardStatusFilter: string;
  /** v0.4.6 Durum Panosu: kapalı dosyalar klasörü/kapalı dosyalar da gösterilsin mi (varsayılan false = sadece açık). */
  statusBoardShowClosed: boolean;
  /** v0.4.6 Durum Panosu: gelişmiş filtreler bölümü açık mı (varsayılan kapalı). */
  statusBoardAdvancedOpen: boolean;
  /** v0.4.6 Durum Panosu: sorumlu filtresi ('all' veya kişi adı). */
  statusBoardResponsibleFilter: string;
  /** v0.4.6 Durum Panosu: sadece eksik/risk içeren dosyaları göster. */
  statusBoardMissingOnly: boolean;
  /** v0.4.6 Durum Panosu: sadece açık görevi olan dosyaları göster. */
  statusBoardOpenTodoOnly: boolean;
}

export interface ConflictDialogState {
  folderPath: string;
  message: string;
  expectedRevision: number;
  currentRevision: number;
  baseTracking: TrackingFile;
  localTracking: TrackingFile;
  diskTracking: TrackingFile;
}

export type CaseSortMode = 'plate-az' | 'plate-za' | 'office-az' | 'notice-az' | 'updated-desc' | 'followup-asc';

/**
 * v0.4.1: Üst düzey SAYFA anahtarı. 'home' (Ana Sayfa), 'dosyalar' (tam dosya listesi) ve
 * 'klasorler' (yalnızca-okunur klasör gezgini) yeni sayfalardır. 'ozet' yalnızca detay
 * özet görünümünde kullanılır.
 */
export type DetailTab = 'home' | 'dosyalar' | 'klasorler' | 'durum' | 'ozet' | 'issues' | 'operasyon' | 'evrak' | 'portal' | 'labor' | 'rucu' | 'ktt' | 'heavy' | 'ai' | 'settings';

export type StatusBoardSort = 'dosya-az' | 'plate-az' | 'updated-desc' | 'durum';

export const state: UiState = {
  settings: null,
  dashboard: null,
  cases: [],
  selectedFolderPath: '',
  search: '',
  filter: 'all',
  responsibleFilter: 'all',
  serviceFilter: 'all',
  statusFilter: 'all',
  sortMode: 'plate-az',
  activeTab: 'home',
  scanRunning: false,
  lastScanReport: null,
  toast: '',
  toastKind: 'info',
  error: '',
  caseListScrollTop: 0,
  conflict: null,
  blockModal: null,
  rootSetupRequired: false,
  laborExcelPreview: null,
  laborExcelResult: null,
  autoLaborPreview: null,
  autoLaborEdits: {},
  autoLaborApprovedRows: {},
  autoLaborSaving: false,
  autoLaborResult: null,
  autoLaborAllowFormula: false,
  laborRowOverrides: {},
  partsAnalysis: null,
  partsAnalyzing: false,
  partsUserTerms: [],
  deploymentStatus: null,
  folderBrowse: null,
  folderLoading: false,
  closedMutationUnlocks: {},
  advancedFiltersOpen: false,
  deploymentBannerDismissed: false,
  statusBoardPage: 1,
  statusBoardSearch: '',
  statusBoardSort: 'dosya-az',
  statusBoardStatusFilter: 'all',
  statusBoardShowClosed: false,
  statusBoardAdvancedOpen: false,
  statusBoardResponsibleFilter: 'all',
  statusBoardMissingOnly: false,
  statusBoardOpenTodoOnly: false
};

export function selectedCase(): CaseIndexItem | null {
  // v0.3.16: Detay paneli/listede görünmeyen rastgele ilk dosyaya düşmez.
  if (!state.selectedFolderPath) return null;
  return state.cases.find((item) => item.folderPath === state.selectedFolderPath) ?? null;
}
