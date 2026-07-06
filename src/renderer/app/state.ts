import type { AppSettings, AutoLaborCategory, AutoLaborPreview, AutoLaborSaveResult, CaseIndexItem, DashboardSummary, ExcelLaborDistributeResult, ExcelLaborPreview, FolderBrowseResult, PartsPhotoAnalysis, ScanReport, TrackingFile, DeploymentStatus } from '../../shared/types';
import type { UserPartTerm } from '../../shared/parca-sozlugu';
import { AUTO_LABOR_DEFAULT_PAGE_SIZE, type AutoLaborPreviewFilter } from '../../shared/auto-labor-view-model';
import type { LaborLearningEntry } from '../../shared/labor-learning-dictionary';
import type { HeavyDamageAssessmentPreview, HeavyDamageRowEdit } from '../../shared/heavy-damage-types';
import type { HeavyDamageFilter } from '../../shared/heavy-damage-rules';
import type { AiQueueHistoryEvent, AiTaskQueueSnapshot } from '../../shared/ai/ai-queue-types';
import type { KnowledgeImportApprovalReducerState, KnowledgeImportCommitResult, KnowledgeImportPlan, KnowledgeImportTextPreview, KnowledgeSearchResponse, KnowledgeSource, KnowledgeSourceFilter, KnowledgeSourceType } from '../../shared/knowledge';
import type { ReportInvoiceAiTestResult, ReportInvoiceComplianceResult, ReportInvoicePdfPick } from '../../shared/report-invoice/report-invoice-types';
import type { AiDraftTaskType, AiDraftTaskResult } from '../../shared/ai/ai-task-result-types';
import type { ExpertLearningPreviewResponse, ExpertLearningStoreState } from '../../shared/labor/expert-approved-learning-types';
import type { AiModeDataMode, AiModePartCandidate } from '../../shared/labor/ai-mode-part-search-types';
import type { AiModePartCandidateStoreState, ApprovedAiModePartCandidateEntry } from '../../shared/labor/ai-mode-part-candidate-store-types';
import type { AiModeCandidateFilter } from '../../shared/labor/ai-mode-part-candidate-store';
import type { ApplyAiModePartCodeResult, LastPartCodeApplyUndoState } from '../../shared/labor/ai-mode-part-code-apply-types';
import type { RestoreAiModePartCodeResult } from '../../shared/labor/ai-mode-part-code-restore-types';
import type { AiModeBackupListResult } from '../../shared/labor/ai-mode-part-code-backup-types';
import type { AiModePartCodeHistoryListResult } from '../../shared/labor/ai-mode-part-code-history-types';
import type { RestoreAiModeBackupResult } from '../../shared/labor/ai-mode-part-code-backup-restore-types';
import { emptyValueLossForm, type ValueLossForm, type ValueLossPartFormRow } from './utils/value-loss-form-mapping';

export type { ValueLossForm, ValueLossPartFormRow };

/** v3.5 Google AI Mode MANUEL parça araştırma köprüsü UI durumu (yalnız prompt + parse; ağ YOK). */
export interface AiModePartSearchUiState {
  selectedRowNumber: number | null;
  mode: AiModeDataMode;
  generatedPrompt: string;
  pastedResponse: string;
  candidates: AiModePartCandidate[];
  /** Satır no → kullanıcının evidence olarak bağladığı aday (session-only). */
  linkedByRow: Record<number, AiModePartCandidate>;
  /** v3.6 kullanıcı onaylı kalıcı aday havuzu durumu (yüklendiyse). */
  store: AiModePartCandidateStoreState | null;
  /** v3.7 duplicate onay bekleyen aday (kullanıcı onaylı yenileme için). */
  pendingDuplicate: { newEntry: ApprovedAiModePartCandidateEntry; existing: ApprovedAiModePartCandidateEntry } | null;
  /** v3.7 yönetim paneli filtresi/araması/kaynak açık kayıtları. */
  storeFilter: AiModeCandidateFilter;
  storeSearch: string;
  sourcesExpanded: Record<string, boolean>;
  /** v3.8 son D sütunu yazma işlemi raporu (session; kalıcı değil). */
  applyResult: ApplyAiModePartCodeResult | null;
  /** v3.9 son yazma için geri alma hazırlığı; v3.10 tek-tık restore için kullanılır. */
  lastApplyUndo: LastPartCodeApplyUndoState | null;
  /** v3.10 son restore/geri alma işlemi sonucu (session). */
  restoreResult: RestoreAiModePartCodeResult | null;
  /** v3.11 yedek yönetim listesi + son işlem geçmişi (yüklendiyse). */
  backupList: AiModeBackupListResult | null;
  history: AiModePartCodeHistoryListResult | null;
  /** v3.12 genel yedekten geri yükleme sonucu (session; son-undo restore'dan AYRI). */
  backupRestoreResult: RestoreAiModeBackupResult | null;
  message: string | null;
}

/** v3.2 "Eksper Onaylı İşçilikten Öğren" UI durumu (yalnız önizleme + onay akışı). */
export interface ExpertLearningUiState {
  preview: ExpertLearningPreviewResponse | null;
  /** Onaylanmak için seçili öğrenme satırı id'leri (derivedEntry.id). */
  selectedIds: string[];
  store: ExpertLearningStoreState | null;
  busy: boolean;
  message: string | null;
  error: string | null;
}

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
  /** v0.6.0 UI-stability: Kullanıcı bu oturumda Dosyalar bölümünden ELLE çalışma klasörü/dosyası seçti mi.
   * Otomatik son-klasör yükleme/geri-yükleme bunu açmaz; manuel seçim yapılmadan Dosyalar (ve Ayarlar) dışı
   * sekmelere geçilemez. */
  hasManualWorkingFolderSelection: boolean;
  scanRunning: boolean;
  lastScanReport: ScanReport | null;
  toast: string;
  toastKind: 'info' | 'success' | 'warning';
  error: string;
  caseListScrollTop: number;
  conflict: ConflictDialogState | null;
  /** v0.4.7: Sert engelleme modalı (ör. yanlış plakalı fotoğraf). Kapatılmadan işlem sürmez. */
  blockModal: { title: string; message: string } | null;
  /**
   * v0.6.4: Uygulama-içi onay modalı. Electron'da bloklayan native window.confirm donma/deadlock
   * riski taşıdığından (sandbox + contextIsolation) onaylar bu modalla alınır; uygulama kilitlenmez.
   */
  confirmModal: { title: string; message: string; confirmLabel: string; cancelLabel: string; danger: boolean } | null;
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
  autoLaborFilter: AutoLaborPreviewFilter;
  autoLaborSearch: string;
  autoLaborPage: number;
  autoLaborPageSize: number;
  autoLaborReviewRows: Record<number, boolean>;
  autoLaborConfirmOpen: boolean;
  autoLaborSaveError: AutoLaborSaveErrorState | null;
  autoLaborReportSnapshot: AutoLaborReportSnapshot | null;
  /** v3.2 Eksper Onaylı İşçilikten Öğren paneli durumu. */
  expertLearning: ExpertLearningUiState;
  /** v3.5 Google AI Mode parça araştırma köprüsü durumu. */
  aiModePartSearch: AiModePartSearchUiState;
  /** İşçilik tablosunda kullanıcının elle değiştirdiği satır tutarları (satır no → tutar). */
  laborRowOverrides: Record<number, number>;
  /** AI ile okunan parça listesi fotoğrafı analizi. */
  partsAnalysis: PartsPhotoAnalysis | null;
  /** Parça fotoğrafı analizi sürüyor mu. */
  partsAnalyzing: boolean;
  /** v0.6.1: AI parça okuma geçici hata mesajı (HTTP 503/zaman aşımı/ağ). Set ise "Tekrar Dene" gösterilir; analiz/seçim bozulmaz. */
  partsAnalysisError: string;
  /** v0.6.3: Rapor / Fatura Uyum Kontrolü — bellek-içi seçimler ve sonuç. Kalıcı yazma YOK. */
  reportInvoiceReportPick: ReportInvoicePdfPick | null;
  reportInvoiceInvoicePick: ReportInvoicePdfPick | null;
  reportInvoiceResult: ReportInvoiceComplianceResult | null;
  reportInvoiceLoading: boolean;
  reportInvoicePicking: '' | 'report' | 'invoice';
  reportInvoiceError: string;
  /** v0.6.3: AI bağlantı testi durumu/sonucu (yalnız UI belleği; kalıcı değil). */
  reportInvoiceAiTesting: boolean;
  reportInvoiceAiTestResult: ReportInvoiceAiTestResult | null;
  /** v0.6.x: AI Yardımcıları (Mevzuat & AI) ekranı UI durumu (salt-okunur; kalıcı değil). */
  aiHelpers: AiHelpersState;
  /** Kullanıcının öğrettiği parça terimleri (kalıcı, kişisel sözlük). */
  partsUserTerms: UserPartTerm[];
  laborLearningEntries: LaborLearningEntry[];
  laborLearningSearch: string;
  laborLearningFilter: string;
  laborLearningLoading: boolean;
  laborLearningReport: string;
  /** v0.6.0 UI: AI İşçilik Öğrenme Sözlüğü'nde açık/genişletilmiş kayıt anahtarları (yalnız UI belleği; kalıcı değil). */
  laborLearningExpanded: Record<string, boolean>;
  aiQueueSnapshot: AiTaskQueueSnapshot | null;
  aiQueueEvents: AiQueueHistoryEvent[];
  aiQueueEventsError: string;
  aiQueueLoading: boolean;
  aiQueueSelectedTaskId: string;
  aiQueueError: string;
  aiQueueLastLoadedAt: string;
  aiQueueAutoRefreshEnabled: boolean;
  aiQueueCancelingTaskId: string;
  knowledgeSources: KnowledgeSource[];
  knowledgeSourcesLoading: boolean;
  knowledgeSourcesError: string;
  knowledgeSearchQuery: string;
  knowledgeSearchResponse: KnowledgeSearchResponse | null;
  knowledgeSearchLoading: boolean;
  knowledgeSearchError: string;
  selectedKnowledgeTags: string[];
  selectedKnowledgeSourceTypes: KnowledgeSourceType[];
  selectedKnowledgeSourceId: string;
  selectedKnowledgeResultId: string;
  /** v0.6.0 P4-E4: Bilgi Bankasi sonuc gorunumu icin salt-okunur kaynak filtresi (all/seed/user). */
  knowledgeSourceFilter: KnowledgeSourceFilter;
  /** v0.6.0 P3-H: read-only dry-run import IPC'sinden donen plan (canli panel testi). Kalici degildir. */
  knowledgeImportDryRunPlan: KnowledgeImportPlan | null;
  knowledgeImportDryRunLoading: boolean;
  knowledgeImportDryRunError: string;
  /** v0.6.0 P4-B: bellek-ici import onay kararlari. Kalici degildir; import calistirmaz (canExecuteImport=false). */
  knowledgeImportApprovalState: KnowledgeImportApprovalReducerState;
  /** v0.6.0 P4-C: yalniz .txt/.md duz-metin icerik onizlemesi (bellek-ici, yazmasiz). */
  knowledgeImportTextPreview: KnowledgeImportTextPreview | null;
  knowledgeImportTextPreviewLoading: boolean;
  knowledgeImportTextPreviewError: string;
  /** v0.6.0 P4-E2-B: kalici commit sonucu (bellek-ici gosterim). */
  knowledgeImportCommitResult: KnowledgeImportCommitResult | null;
  knowledgeImportCommitting: boolean;
  heavyDamagePreview: HeavyDamageAssessmentPreview | null;
  heavyDamageEdits: Record<string, HeavyDamageRowEdit>;
  heavyDamageFilter: HeavyDamageFilter;
  heavyDamageManualText: string;
  heavyDamageRepairCost: string;
  heavyDamageMarketValue: string;
  heavyDamageUserNotes: string;
  heavyDamageConfirmOpen: boolean;
  heavyDamageSaving: boolean;
  heavyDamageReport: string;
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
export type DetailTab = 'home' | 'dosyalar' | 'klasorler' | 'durum' | 'ozet' | 'issues' | 'operasyon' | 'evrak' | 'portal' | 'labor' | 'rucu' | 'ktt' | 'heavy' | 'ai' | 'rapor-fatura' | 'ai-yardimcilari' | 'settings';

/** v0.6.x: "AI Yardımcıları" alanındaki alt araç anahtarı. */
export type AiHelperTool = 'mevzuat' | 'sablon' | 'ucret' | 'sure' | 'deger-kaybi';

/** v0.6.x: AI Değer Kaybı Yardımcısı'nda önizlenen taslak türü. */
export type ValueLossDraftKind = 'internal_note' | 'report_explanation' | 'missing_info_mail';

export type AiTriForm = 'var' | 'yok' | 'belirsiz';

/**
 * v0.6.x: "Dosya Ek Bilgileri" formu (kullanıcı onaylı ek bağlam). Bu form UI bellektedir; yalnız
 * "Değişiklikleri dosyaya kaydet" deyince takip.json'a (aiHelperContext) yazılır.
 */
export interface AiExtraForm {
  claimType: 'trafik' | 'kasko' | 'ihtiyari' | 'belirsiz';
  vehicleGroup: 'binek_hafif_ticari_motosiklet' | 'agir_vasita' | 'is_makinesi' | 'belirsiz';
  hasValueLoss: AiTriForm;
  cityScope: 'ayni_il' | 'farkli_il' | 'belirsiz';
  insurerName: string;
  accidentDocumentType: 'ktt' | 'zabit' | 'beyan' | 'karakol_tutanagi' | 'belirsiz';
  alcoholDocumentStatus: AiTriForm;
  driverLicenseStatus: AiTriForm;
  appointmentDateTime: string;
  firstInspectionDate: string;
  preliminaryReportDate: string;
  reportReadyDate: string;
  vehicleDeliveredToService: AiTriForm;
  vehicleDeliveredToServiceDate: string;
  repairStartedDate: string;
  repairCompletedDate: string;
  notes: string;
}

/**
 * v0.6.x: AI Yardımcıları (Mevzuat & AI) ekranı UI durumu. SALT-OKUNUR/öneri amaçlı; hiçbir
 * dosyaya yazma yapmaz, harici servis kullanmaz. Yalnız form girdileri + UI seçimleri tutulur;
 * sonuçlar saf modüllerle render anında hesaplanır (state'te sonuç saklanmaz).
 */
export interface AiHelpersState {
  activeTool: AiHelperTool;
  /** Formun en son ön-doldurulduğu dosya (folderPath). Değişince yeniden ön-doldurulur. null = genel mod. */
  contextFolderPath: string | null;
  /** Kullanıcının bu bağlamda elle değiştirdiği form alanları (data-aih anahtarı → true). */
  userEdited: Record<string, boolean>;
  mevzuatSearch: string;
  /** Aktif mevzuat filtre terimi ('' = tümü). */
  mevzuatFilter: string;
  mevzuatExpanded: Record<string, boolean>;
  template: {
    sigortaTuru: 'trafik' | 'ihtiyari-mali-sorumluluk' | 'kasko';
    degerKaybiDahil: boolean;
    agirVeyaTamHasar: boolean;
  };
  fee: {
    kapsam: 'motorlu' | 'motorlu-disi';
    brutHasar: string;
    vehicleClass: 'binek-hafif-ticari-motosiklet' | 'agir-vasita' | 'is-makinesi';
    jobType: 'standart' | 'uzaktan-ekspertiz' | 'deger-tespiti';
    degerKaybi: 'yok' | 'tek-basina' | 'maddi-hasarla-birlikte';
    kttTanzim: boolean;
    sehirDisi: boolean;
    kdvDahil: boolean;
    kdvOrani: string;
    riziko: 'sivil' | 'ticari-sinai-endustriyel';
    travelEnabled: boolean;
    km: string;
    epdk: string;
    fileCount: string;
    highway: string;
    bridge: string;
    ferry: string;
    parking: string;
  };
  deadline: {
    ilDurumu: 'ayni' | 'farkli';
    dosyaTuru: 'trafik' | 'diger-motorlu';
  };
  /** v0.6.x: Dosya Ek Bilgileri formu (UI bellek; yalnız Kaydet ile takip.json'a yazılır). */
  extra: AiExtraForm;
  /** Dosya Ek Bilgileri paneli açık mı (uzun olduğu için katlanabilir). */
  extraOpen: boolean;
  /** Kaydetme sürüyor mu. */
  extraSaving: boolean;
  /** v0.6.x: AI Taslak Üretici (Orchestrator v1) durumu. Sonuç yalnız UI'da; dosyaya yazılmaz. */
  task: {
    taskType: AiDraftTaskType;
    userInstruction: string;
    result: AiDraftTaskResult | null;
    /** Son 5 sonuç (yalnız oturum belleği; kalıcı değil). */
    history: AiDraftTaskResult[];
    copyError: string;
  };
  /** v0.6.x: AI Değer Kaybı Yardımcısı UI durumu. Taslak seçimi + v2 form panel/önizleme/kaydetme meta. */
  valueLoss: {
    activeDraft: ValueLossDraftKind | null;
    /** v2: Değer Kaybı Ek Bilgi Formu paneli açık mı. */
    formOpen: boolean;
    /** v2: Kaydetme öncesi diff önizlemesi açık mı. */
    previewOpen: boolean;
    /** v2: Kaydetme sürüyor mu. */
    saving: boolean;
    /** v5: hesap gerekçesi kopyalama hata/uyarı mesajı ('' = yok). */
    copyError: string;
  };
  /** v0.6.x v2: Değer Kaybı Ek Bilgi Formu (UI bellek; yalnız onaylı Kaydet ile yazılır). */
  vlForm: ValueLossForm;
  /** v0.6.x v4: Parça Bazlı Değer Kaybı satırları (UI bellek; kayıt yalnız v2 onaylı akışla). */
  vlParts: ValueLossPartFormRow[];
}

/** Boş (kaydedilmemiş) Dosya Ek Bilgileri formu. */
export function emptyAiExtraForm(): AiExtraForm {
  return {
    claimType: 'belirsiz', vehicleGroup: 'belirsiz', hasValueLoss: 'belirsiz', cityScope: 'belirsiz',
    insurerName: '', accidentDocumentType: 'belirsiz', alcoholDocumentStatus: 'belirsiz', driverLicenseStatus: 'belirsiz',
    appointmentDateTime: '', firstInspectionDate: '', preliminaryReportDate: '', reportReadyDate: '',
    vehicleDeliveredToService: 'belirsiz', vehicleDeliveredToServiceDate: '', repairStartedDate: '', repairCompletedDate: '', notes: ''
  };
}

export type StatusBoardSort = 'dosya-az' | 'plate-az' | 'updated-desc' | 'durum';
export type { AutoLaborPreviewFilter };

export interface AutoLaborSaveErrorState {
  message: string;
  originalStatus: string;
  backupStatus: string;
  partialWriteStatus: string;
}

export interface AutoLaborReportSnapshot {
  categoryTotals: Partial<Record<AutoLaborCategory, number>>;
  userEditedRows: number;
  learningCandidateRows: number;
  oldClearedCells: number;
  lowConfidenceRows: number;
  mediumConfidenceRows: number;
  formulaRows: number;
  partialWriteStatus: string;
  warnings: string[];
}

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
  hasManualWorkingFolderSelection: false,
  scanRunning: false,
  lastScanReport: null,
  toast: '',
  toastKind: 'info',
  error: '',
  caseListScrollTop: 0,
  conflict: null,
  blockModal: null,
  confirmModal: null,
  rootSetupRequired: false,
  laborExcelPreview: null,
  laborExcelResult: null,
  autoLaborPreview: null,
  autoLaborEdits: {},
  autoLaborApprovedRows: {},
  autoLaborSaving: false,
  autoLaborResult: null,
  autoLaborAllowFormula: false,
  autoLaborFilter: 'all',
  autoLaborSearch: '',
  autoLaborPage: 1,
  autoLaborPageSize: AUTO_LABOR_DEFAULT_PAGE_SIZE,
  autoLaborReviewRows: {},
  autoLaborConfirmOpen: false,
  autoLaborSaveError: null,
  autoLaborReportSnapshot: null,
  expertLearning: { preview: null, selectedIds: [], store: null, busy: false, message: null, error: null },
  aiModePartSearch: { selectedRowNumber: null, mode: 'masked', generatedPrompt: '', pastedResponse: '', candidates: [], linkedByRow: {}, store: null, pendingDuplicate: null, storeFilter: 'all', storeSearch: '', sourcesExpanded: {}, applyResult: null, lastApplyUndo: null, restoreResult: null, backupList: null, history: null, backupRestoreResult: null, message: null },
  laborRowOverrides: {},
  partsAnalysis: null,
  partsAnalyzing: false,
  partsAnalysisError: '',
  reportInvoiceReportPick: null,
  reportInvoiceInvoicePick: null,
  reportInvoiceResult: null,
  reportInvoiceLoading: false,
  reportInvoicePicking: '',
  reportInvoiceError: '',
  reportInvoiceAiTesting: false,
  reportInvoiceAiTestResult: null,
  aiHelpers: {
    activeTool: 'mevzuat',
    contextFolderPath: null,
    userEdited: {},
    mevzuatSearch: '',
    mevzuatFilter: '',
    mevzuatExpanded: {},
    template: { sigortaTuru: 'trafik', degerKaybiDahil: false, agirVeyaTamHasar: false },
    fee: {
      kapsam: 'motorlu', brutHasar: '', vehicleClass: 'binek-hafif-ticari-motosiklet',
      jobType: 'standart', degerKaybi: 'yok', kttTanzim: false, sehirDisi: false,
      kdvDahil: false, kdvOrani: '20', riziko: 'sivil', travelEnabled: false,
      km: '', epdk: '', fileCount: '1', highway: '', bridge: '', ferry: '', parking: ''
    },
    deadline: { ilDurumu: 'ayni', dosyaTuru: 'trafik' },
    extra: emptyAiExtraForm(),
    extraOpen: false,
    extraSaving: false,
    task: { taskType: 'case_summary', userInstruction: '', result: null, history: [], copyError: '' },
    valueLoss: { activeDraft: null, formOpen: false, previewOpen: false, saving: false, copyError: '' },
    vlForm: emptyValueLossForm(),
    vlParts: []
  },
  partsUserTerms: [],
  laborLearningEntries: [],
  laborLearningSearch: '',
  laborLearningFilter: 'all',
  laborLearningLoading: false,
  laborLearningReport: '',
  laborLearningExpanded: {},
  aiQueueSnapshot: null,
  aiQueueEvents: [],
  aiQueueEventsError: '',
  aiQueueLoading: false,
  aiQueueSelectedTaskId: '',
  aiQueueError: '',
  aiQueueLastLoadedAt: '',
  aiQueueAutoRefreshEnabled: true,
  aiQueueCancelingTaskId: '',
  knowledgeSources: [],
  knowledgeSourcesLoading: false,
  knowledgeSourcesError: '',
  knowledgeSearchQuery: '',
  knowledgeSearchResponse: null,
  knowledgeSearchLoading: false,
  knowledgeSearchError: '',
  selectedKnowledgeTags: [],
  selectedKnowledgeSourceTypes: [],
  selectedKnowledgeSourceId: '',
  selectedKnowledgeResultId: '',
  knowledgeSourceFilter: 'all',
  knowledgeImportDryRunPlan: null,
  knowledgeImportDryRunLoading: false,
  knowledgeImportDryRunError: '',
  knowledgeImportApprovalState: { entries: [], canExecuteImport: false },
  knowledgeImportTextPreview: null,
  knowledgeImportTextPreviewLoading: false,
  knowledgeImportTextPreviewError: '',
  knowledgeImportCommitResult: null,
  knowledgeImportCommitting: false,
  heavyDamagePreview: null,
  heavyDamageEdits: {},
  heavyDamageFilter: 'all',
  heavyDamageManualText: '',
  heavyDamageRepairCost: '',
  heavyDamageMarketValue: '',
  heavyDamageUserNotes: '',
  heavyDamageConfirmOpen: false,
  heavyDamageSaving: false,
  heavyDamageReport: '',
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
