export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ClaimType = 'trafik' | 'kasko' | 'unknown';
export type Priority = 'Düşük' | 'Normal' | 'Yüksek' | 'Kritik';
export type WorkflowStatus =
  | 'Yeni Dosya'
  | 'Föy Bekleniyor'
  | 'Evrak Bekleniyor'
  | 'Fotoğraf Bekleniyor'
  | 'Portal Kontrol'
  | 'Parça Listesi Bekleniyor'
  | 'Parça Kodu Bekleniyor'
  | 'Ön Rapor'
  | 'Uzman Onayı Bekleniyor'
  | 'Onarımda'
  | 'Kapanış Kontrolü'
  | 'Kapalı';

export interface CaseIdentity {
  caseKey: string;
  plate: string;
  dosyaNo: string;
  /** Ofis içi manuel sıra numarası: örn. 2026/18. */
  officeFileNo: string;
  /** İhbar föyü / claim notice numarası: örn. 13-17947703. */
  claimNoticeNo: string;
  folderPath: string;
  monthFolder: string;
  isClosedFolder: boolean;
}

export interface TrackingMetadata {
  createdAt: string;
  updatedAt: string;
  createdByComputer: string;
  updatedByComputer: string;
  revision: number;
  /** Hotfix 5: Her başarılı yazmada değişen kimlik. Aynı revision/farklı writeId pCloud divergence sayılır. */
  writeId: string;
}

export interface AssignmentInfo {
  sorumlu: string;
  eksper: string;
  raportor: string;
  /** Kullanıcının belirlediği takip tarihi. Mutasyonlarda otomatik bugüne çekilmez. */
  takipTarihi: string;
  /** Dosyada son gerçek işlem tarihi. Mutasyonlarda Türkiye yerel tarihiyle güncellenir. */
  sonIslemTarihi: string;
  oncelik: Priority;
}

export interface StatusInfo {
  dosyaDurumu: string;
  workflowStatus: WorkflowStatus;
  kapaliMi: boolean;
}

export interface ChecklistItem {
  key: string;
  label: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  priority: Priority;
  assignedTo: string;
  dueDate: string;
  createdAt: string;
  completedAt?: string;
}

export interface NoteItem {
  id: string;
  createdAt: string;
  createdBy: string;
  text: string;
}

export interface ServiceInfo {
  name: string;
  source: 'manual' | 'detected';
  updatedAt: string;
  updatedBy: string;
}

export interface RucuInfo {
  varMi: boolean;
  potansiyel: boolean;
  durum: string;
  not: string;
}

export interface LaborInfo {
  parcaListesiIstendi: boolean;
  parcaKodlariIstendi: boolean;
  parcaIscilikGirildi: boolean;
  not: string;
}

export interface HelperModuleInfo {
  helperOnly: boolean;
  finalDecisionWarning: string;
  not: string;
}

export interface HeavyDamageInfo extends HelperModuleInfo {
  enabled: boolean;
  skor?: number;
}

export interface AuditItem {
  at: string;
  by: string;
  computer: string;
  action: string;
  text: string;
}

export interface TrackingFile {
  schemaVersion: 1;
  caseIdentity: CaseIdentity;
  metadata: TrackingMetadata;
  assignment: AssignmentInfo;
  status: StatusInfo;
  claimType: ClaimType;
  service: ServiceInfo;
  portalChecklist: ChecklistItem[];
  todos: TodoItem[];
  notes: NoteItem[];
  rucu: RucuInfo;
  labor: LaborInfo;
  kttKusur: HelperModuleInfo;
  heavyDamage: HeavyDamageInfo;
  audit: AuditItem[];
}

export interface DocumentRequirement {
  key: string;
  label: string;
  found: boolean;
  matchedFiles: string[];
  warning?: string;
}

export interface DocumentPlateCheck {
  source: 'zarar-goren-arac';
  status: 'matched' | 'mismatch' | 'not-found' | 'unreadable' | 'skipped';
  expectedPlate: string;
  detectedPlate: string;
  fileName: string;
  method?: 'pdf-text' | 'ocr';
  message: string;
}

export interface LegacyNoteDocument {
  fileName: string;
  filePath: string;
  sourceType: 'docx' | 'txt';
  empty: boolean;
  text: string;
  warning?: string;
}

export interface DocumentOcrStatus {
  available: boolean;
  pdfAvailable: boolean;
  used: boolean;
  checkedFiles: string[];
  usedFiles: string[];
  warnings: string[];
}

export interface DocumentAnalysis {
  claimType: ClaimType;
  evrakFolderExists: boolean;
  filesScanned: number;
  requirements: DocumentRequirement[];
  missingCritical: string[];
  claimNoticeNo: string;
  claimNoticeFiles: string[];
  hasKttOrZabitOrBeyan: boolean;
  counterpartyPolicyCandidate: boolean;
  conflictFiles: string[];
  zararGorenPlateCheck?: DocumentPlateCheck;
  legacyNotes?: LegacyNoteDocument[];
  ocrStatus?: DocumentOcrStatus;
  warnings: string[];
}

export interface PhotoAnalysis {
  hasarFolderExists: boolean;
  totalImageFiles: number;
  damagePhotoCount: number;
  hasKm: boolean;
  hasVites: boolean;
  hasSaseOrSasi: boolean;
  hasOlayYeri?: boolean;
  olayYeriPhotoCount?: number;
  unsupportedFiles: string[];
  corruptSuspects: string[];
  previews: PhotoPreview[];
  warnings: string[];
}

export interface PhotoPreview {
  fileName: string;
  filePath: string;
  kind: 'hasar' | 'km' | 'vites' | 'sase' | 'other';
  supported: boolean;
  corrupt?: boolean;
}

export interface ThumbnailResult {
  filePath: string;
  dataUrl: string | null;
  cacheHit: boolean;
  reason?: string;
}


export interface FolderFingerprint {
  folderPath: string;
  mtimeMs: number;
  size: number;
  childCount: number;
  evrakMtimeMs: number;
  hasarMtimeMs: number;
  trackingMtimeMs: number;
  hash: string;
}


export interface FolderContentGroup {
  key: 'EVRAK' | 'HASAR' | 'OLAY YERİ' | 'ONARIM';
  exists: boolean;
  filesScanned: number;
  sampleFiles: string[];
  warnings: string[];
}

export interface CaseFolderContents {
  groups: FolderContentGroup[];
  totalFilesScanned: number;
  warnings: string[];
}

/**
 * v0.4.1 Klasörler: pCloud klasör ağacının yalnızca-okunur gezinme görünümü.
 * Bu tipler sadece pasif gezinme içindir; hiçbir oluşturma/değiştirme yapılmaz.
 */
export interface FolderTrackingStatus {
  exists: boolean;
  revision?: number;
  updatedAt?: string;
  updatedByComputer?: string;
  issue?: 'corrupt' | 'unreadable';
}

export interface FolderNode {
  name: string;
  path: string;
  kind: 'month' | 'case' | 'group' | 'folder';
  /** Dosya klasörü ise tahmini plaka (gösterim amaçlı). */
  plate?: string;
  /** Grup düğümü ise EVRAK/HASAR/OLAY YERİ/ONARIM kanonik anahtarı. */
  groupKey?: FolderContentGroup['key'];
  /** EVRAK/HASAR/OLAY YERİ/ONARIM gibi zorunlu alt klasör mü. */
  required?: boolean;
  exists: boolean;
  navigable: boolean;
  selectable: boolean;
}

export interface FolderBrowseResult {
  rootPath: string;
  currentPath: string;
  parentPath: string | null;
  atRoot: boolean;
  rootAvailable: boolean;
  /** Hedef klasör bir dosya (case) klasörü ise true; nodes grup düğümlerini içerir. */
  targetIsCase: boolean;
  /** targetIsCase iken _HASARBOTU/takip.json durumu. */
  tracking?: FolderTrackingStatus;
  nodes: FolderNode[];
}

export interface CaseIndexItem {
  id: string;
  plate: string;
  dosyaNo: string;
  officeFileNo: string;
  claimNoticeNo: string;
  monthFolder: string;
  folderPath: string;
  isClosedFolder: boolean;
  claimType: ClaimType;
  workflowStatus: WorkflowStatus;
  dosyaDurumu: string;
  oncelik: Priority;
  sorumlu: string;
  serviceName: string;
  eksper: string;
  raportor: string;
  takipTarihi: string;
  revision: number;
  updatedAt: string;
  documentAnalysis: DocumentAnalysis;
  photoAnalysis: PhotoAnalysis;
  folderContents: CaseFolderContents;
  tracking: TrackingFile;
  /** v0.3.15: Liste payload'ı için küçük özet. Tam notes/todos cases:get ile hydrate edilir. */
  trackingSummary?: {
    noteCount: number;
    todoCount: number;
    openTodoCount: number;
    lastNoteText: string;
    lastNoteBy: string;
    lastNoteAt: string;
  };
  fingerprint: FolderFingerprint;
  searchText: string;
  corruptTracking?: boolean;
  trackingIssue?: CaseTrackingIssue;
  /** Dosya bazlı birden çok canlı kullanım sorunu. Sorunlar panelinin ana girdisidir. */
  caseIssues?: CaseTrackingIssue[];
  statusIsClosed?: boolean;
}

export type CaseTrackingIssueType =
  | 'corrupt-tracking'
  | 'unsupported-schema'
  | 'pcloud-conflict-copy'
  | 'same-revision-different-write'
  | 'revision-regression'
  | 'partial-sync-missing-tracking'
  | 'scan-failed-folder';

export interface CaseTrackingIssue {
  type: CaseTrackingIssueType;
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  detectedAt?: string;
  source?: 'scanner' | 'tracking' | 'excel' | 'ui';
  action?: 'open-folder' | 'compare' | 'ignore';
}

export interface CaseIndexFile {
  schemaVersion: 1;
  rootPath: string;
  generatedAt: string;
  cases: CaseIndexItem[];
}

export interface DashboardSummary {
  totalCases: number;
  openCases: number;
  closedCases: number;
  missingDocuments: number;
  missingPhotos: number;
  /** v0.3.16: HEIC/RAW gibi önizleme format uyarıları eksik foto KPI'sından ayrı sayılır. */
  unsupportedPhotos: number;
  portalPending: number;
  overdueFollowUps: number;
  rucuPotential: number;
  heavyDamageEnabled: number;
  openTasks: number;
  overdueTasks: number;
  todayTasks: number;
  weekTasks: number;
  conflicts: number;
  lastScanAt: string;
  rootAvailable: boolean;
}

export interface AppSettings {
  rootPath: string;
  /** Ana klasör kullanıcı tarafından açıkça seçildiyse true olur. Eski kurulumlarda false kabul edilir. */
  rootPathConfirmed: boolean;
  theme: 'light' | 'dark';
  zoom: number;
  activeUser: string;
  activeComputer: string;
  users: string[];
  scanIntervals: {
    /** Uygulamanın otomatik güvenli yıl tarama aralığı. Eski seçili/açık/kapalı ay aralıkları v0.3.18'de kaldırıldı. */
    fullYearLightMs: number;
  };
  /** Parça listesi fotoğrafı analizi için Google Gemini API anahtarı. Yalnızca bu bilgisayarın yerel ayarında tutulur. */
  geminiApiKey?: string;
}

export interface AnalyzedPartRow {
  /** Görselde okunan ham (usta dili) metin. */
  raw: string;
  /** Usta sözlüğüyle normalize edilmiş resmi parça adı. */
  canonical: string;
  /** Kategori (eşleşmediyse boş). */
  category: string;
  /** Sözlükte eşleşti mi? */
  matched: boolean;
  /** Varsa işçilik fiyat listesindeki parça adı. */
  laborPart?: string;
  /** Görselde yazılıysa adet. */
  quantity?: number;
  /** Görselde yazılıysa tutar (TL). */
  amount?: number;
  /** Satırdaki işlem/durum ipucu (onarım, değişim, boyalı, orjinal…). */
  note?: string;
  /** v0.4.6: Resmi ad yönlü (Ön/Arka) ama ham ifade yön belirtmedi → ön/arka kontrol edilmeli. */
  ambiguousSide?: boolean;
}

export interface PartsPhotoAnalysis {
  filePath: string;
  fileName: string;
  vehicle: { make: string; model: string; plate: string };
  rows: AnalyzedPartRow[];
  matchedCount: number;
  unmatchedCount: number;
  warnings: string[];
}

export interface ScanReport {
  startedAt: string;
  finishedAt: string;
  rootPath: string;
  rootAvailable: boolean;
  totalCases: number;
  changedCases: number;
  reusedCases: number;
  createdTrackingFiles: number;
  corruptTrackingFiles: number;
  failedCases: number;
  conflictFiles: number;
  warnings: string[];
  issues: ScanIssue[];
}

export interface ScanIssue {
  folderPath: string;
  folderName: string;
  type: CaseTrackingIssueType;
  severity: 'critical' | 'warning';
  message: string;
}

export interface TrackingMutationResult {
  tracking: TrackingFile;
  revision: number;
}

export interface ConflictResult {
  conflict: true;
  current: TrackingFile;
  expectedRevision: number;
  currentRevision: number;
  message: string;
  reason?: 'revision-mismatch' | 'same-revision-different-write' | 'pcloud-conflict-copy';
}

export type TrackingWriteResult = TrackingMutationResult | ConflictResult;

export type ConflictResolutionStrategy = 'use-disk' | 'use-local' | 'merge-safe';

export interface ConflictResolutionArgs {
  folderPath: string;
  currentRevision: number;
  currentWriteId?: string;
  allowClosedMutation?: boolean;
  strategy: ConflictResolutionStrategy;
  baseTracking: TrackingFile;
  localTracking: TrackingFile;
}


export interface ExcelLaborRowPreview {
  rowNumber: number;
  description: string;
  oldAmount: number | null;
  newAmount: number;
  /** Fiyat listesi modunda: bu satır gömülü listeyle eşleşti mi? */
  matched?: boolean;
  /** Fiyat listesi modunda eşleşen kalem etiketi (ör. "Ön Tampon / Macunlu Boya"). */
  matchedLabel?: string;
}

export interface ExcelLaborColumnCandidate {
  column: string;
  header: string;
  detection: ExcelLaborDetection;
  confidence: ExcelLaborConfidence;
  score: number;
  numericCount: number;
  formulaCellsFound: number;
  existingTotal: number;
  requiresUserConfirmation: boolean;
  reason: string;
}

export type ExcelLaborDetection = 'strong-header' | 'fallback-numeric-column';
export type ExcelLaborConfidence = 'high' | 'low';
export type ExcelLaborDistributionMode = 'proportional' | 'equal' | 'price-list';

export interface ExcelLaborPreview {
  filePath: string;
  fileName: string;
  sheetName: string;
  targetColumn: string;
  targetHeader: string;
  headerRow: number;
  rowCount: number;
  existingTotal: number;
  warnings: string[];
  detection: ExcelLaborDetection;
  confidence: ExcelLaborConfidence;
  requiresUserConfirmation: boolean;
  formulaCellsFound: number;
  formulasWillBeReplaced: boolean;
  distributionMode: ExcelLaborDistributionMode;
  selectedColumn: string;
  availableColumns: ExcelLaborColumnCandidate[];
  rows: ExcelLaborRowPreview[];
  /** Fiyat listesi modunda: eşleşen satırların toplam tutarı + eşleşmeyenlerin mevcut tutarı. */
  priceListTotal?: number;
  /** Fiyat listesi modunda eşleşen satır sayısı. */
  matchedRowCount?: number;
  /** Fiyat listesi modunda eşleşmeyen satır sayısı. */
  unmatchedRowCount?: number;
}

export interface ExcelLaborDistributeResult extends ExcelLaborPreview {
  outputPath: string;
  targetTotal: number;
  distributedTotal: number;
  verifiedExistingTotal: number;
}

export interface CaseListExportRow {
  officeFileNo: string;
  claimNoticeNo: string;
  plate: string;
  claimType: string;
  workflowStatus: string;
  dosyaDurumu: string;
  sorumlu: string;
  serviceName: string;
  takipTarihi: string;
  sonIslemTarihi: string;
  missingDocuments: number;
  missingPhotos: number;
  unsupportedPhotos: number;
  openTodos: number;
  folderPath: string;
}

export interface CaseListExportResult {
  outputPath: string;
  rowCount: number;
}


export interface TrackingWriteIndexEntry {
  casePathHash: string;
  casePath: string;
  lastSeenRevision: number;
  lastSeenWriteId: string;
  lastSeenAt: string;
}

export interface TrackingWriteIndexFile {
  schemaVersion: 1;
  rootPath: string;
  generatedAt: string;
  entries: Record<string, TrackingWriteIndexEntry>;
}

export interface ConflictTrackingCopyInfo {
  folderPath: string;
  fileName: string;
  filePath: string;
  current: TrackingFile;
  conflictTracking: TrackingFile;
}


export interface OfficeVersionClient {
  computer: string;
  user: string;
  appVersion: string;
  packageName: string;
  platform: string;
  rootPath: string;
  recordedAt: string;
}

export interface OfficeVersionMarker {
  schemaVersion: 1;
  expectedVersion: string;
  packageName: string;
  setAt: string;
  setByComputer: string;
}

export interface DeploymentStatus {
  appVersion: string;
  packageName: string;
  activeComputer: string;
  activeUser: string;
  rootPath: string;
  rootAvailable: boolean;
  checkedAt: string;
  officeStatusFolder: string;
  expectedVersion: string;
  expectedVersionSetAt: string;
  isOutdated: boolean;
  versionCheckAvailable: boolean;
  canWriteClientStatus: boolean;
  clients: OfficeVersionClient[];
  warnings: string[];
}

export interface DebugHealthReport {
  appVersion: string;
  electronVersion: string;
  platform: string;
  cacheRoot: string;
  rootPath: string;
  rootAvailable: boolean;
  caseCount: number;
  lastScanAt: string;
  cspEnabled: boolean;
  security: {
    contextIsolation: boolean;
    nodeIntegration: boolean;
    sandbox: boolean;
    webSecurity: boolean;
  };
}
