import type { CaseIndexItem, TodoItem } from './types';

export type DataQualityIssueCode =
  | 'missing-owner'
  | 'missing-followup'
  | 'overdue-followup'
  | 'overdue-todo'
  | 'closed-open-todo'
  | 'close-readiness'
  | 'stale-open-case'
  | 'pdf-plate-mismatch'
  | 'pdf-plate-unverified';

export type DataQualitySeverity = 'critical' | 'warning' | 'info';

export interface DataQualityIssue {
  code: DataQualityIssueCode;
  severity: DataQualitySeverity;
  title: string;
  message: string;
  sortWeight: number;
}

export interface DataQualityCaseSummary {
  folderPath: string;
  plate: string;
  owner: string;
  issues: DataQualityIssue[];
}

export interface DataQualitySummary {
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  caseCount: number;
  unassignedCount: number;
  staleCount: number;
  closedOpenTodoCount: number;
  missingFollowupCount: number;
  casesWithIssues: DataQualityCaseSummary[];
}

export function buildDataQualitySummary(cases: CaseIndexItem[], today = todayLocalDateInput(), staleDays = 3): DataQualitySummary {
  const casesWithIssues = cases
    .map((item) => ({
      folderPath: item.folderPath,
      plate: item.plate,
      owner: item.sorumlu || 'Atanmadı',
      issues: analyzeCaseDataQuality(item, today, staleDays)
    }))
    .filter((item) => item.issues.length > 0)
    .sort((a, b) => issueScore(b.issues) - issueScore(a.issues) || a.plate.localeCompare(b.plate, 'tr'));

  return {
    issueCount: casesWithIssues.reduce((sum, item) => sum + item.issues.length, 0),
    criticalCount: casesWithIssues.reduce((sum, item) => sum + item.issues.filter((issue) => issue.severity === 'critical').length, 0),
    warningCount: casesWithIssues.reduce((sum, item) => sum + item.issues.filter((issue) => issue.severity === 'warning').length, 0),
    caseCount: casesWithIssues.length,
    unassignedCount: casesWithIssues.filter((item) => item.issues.some((issue) => issue.code === 'missing-owner')).length,
    staleCount: casesWithIssues.filter((item) => item.issues.some((issue) => issue.code === 'stale-open-case')).length,
    closedOpenTodoCount: casesWithIssues.filter((item) => item.issues.some((issue) => issue.code === 'closed-open-todo')).length,
    missingFollowupCount: casesWithIssues.filter((item) => item.issues.some((issue) => issue.code === 'missing-followup')).length,
    casesWithIssues
  };
}

export function analyzeCaseDataQuality(item: CaseIndexItem, today = todayLocalDateInput(), staleDays = 3): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const open = isOpenCase(item);
  const closed = isClosedCase(item);
  const activeTodos = openTodos(item);
  const pdfPlateCheck = item.documentAnalysis.zararGorenPlateCheck;
  const pdfPlateMismatch = pdfPlateCheck?.status === 'mismatch' ? pdfPlateCheck : null;

  if (pdfPlateMismatch) {
    issues.push({
      code: 'pdf-plate-mismatch',
      severity: 'critical',
      title: 'PDF plaka uyuşmazlığı',
      message: `İhbar PDF Zarar Gören Araç plakası ${pdfPlateMismatch.detectedPlate}; klasör plakası ${pdfPlateMismatch.expectedPlate}.`,
      sortWeight: 940
    });
  }

  if (pdfPlateCheck && (pdfPlateCheck.status === 'not-found' || pdfPlateCheck.status === 'unreadable')) {
    issues.push({
      code: 'pdf-plate-unverified',
      severity: 'warning',
      title: 'PDF plaka doğrulanamadı',
      message: pdfPlateCheck.message,
      sortWeight: 610
    });
  }

  if (open && !item.sorumlu.trim()) {
    issues.push({
      code: 'missing-owner',
      severity: 'critical',
      title: 'Sorumlu atanmamış',
      message: 'Açık dosyada sorumlu boş; dosya sahipsiz kalabilir.',
      sortWeight: 950
    });
  }

  if (open && !isDateInput(item.takipTarihi)) {
    issues.push({
      code: 'missing-followup',
      severity: 'warning',
      title: 'Takip tarihi boş',
      message: 'Açık dosyada takip tarihi yok; sabah iş sırası zayıflar.',
      sortWeight: 520
    });
  }

  if (open && isPastDate(item.takipTarihi, today)) {
    issues.push({
      code: 'overdue-followup',
      severity: 'critical',
      title: 'Takip tarihi geçti',
      message: `${item.takipTarihi} tarihli takip bekliyor.`,
      sortWeight: 900
    });
  }

  const overdueTodo = activeTodos.find((todo) => isPastDate(todo.dueDate, today));
  if (overdueTodo) {
    issues.push({
      code: 'overdue-todo',
      severity: 'critical',
      title: 'Görev gecikti',
      message: overdueTodo.title,
      sortWeight: 880
    });
  }

  if (closed && activeTodos.length > 0) {
    issues.push({
      code: 'closed-open-todo',
      severity: 'critical',
      title: 'Kapalı dosyada açık görev',
      message: `${activeTodos.length} açık görev kapanıştan sonra kaldı.`,
      sortWeight: 920
    });
  }

  const closingLike = item.workflowStatus === 'Kapanış Kontrolü' || closed;
  const closingBlockers = closingLike ? closingReadinessBlockers(item) : 0;
  if (closingBlockers > 0) {
    issues.push({
      code: 'close-readiness',
      severity: closed ? 'critical' : 'warning',
      title: 'Kapanış kontrol eksiği',
      message: `${closingBlockers} evrak/fotoğraf/format kontrolü açık görünüyor.`,
      sortWeight: closed ? 910 : 620
    });
  }

  if (open && isStaleOpenCase(item, today, staleDays)) {
    issues.push({
      code: 'stale-open-case',
      severity: 'warning',
      title: 'Durgun dosya',
      message: `${staleDays}+ gündür son işlem görünmüyor.`,
      sortWeight: 430
    });
  }

  return issues.sort((a, b) => b.sortWeight - a.sortWeight || a.title.localeCompare(b.title, 'tr'));
}

export function matchesDataQualityFilter(item: CaseIndexItem, filter: 'quality' | 'unassigned' | 'stale', today = todayLocalDateInput(), staleDays = 3): boolean {
  const issues = analyzeCaseDataQuality(item, today, staleDays);
  if (filter === 'quality') return issues.length > 0;
  if (filter === 'unassigned') return issues.some((issue) => issue.code === 'missing-owner');
  return issues.some((issue) => issue.code === 'stale-open-case');
}

export function isStaleOpenCase(item: CaseIndexItem, today = todayLocalDateInput(), staleDays = 3): boolean {
  if (!isOpenCase(item)) return false;
  const lastAction = item.tracking.assignment.sonIslemTarihi || item.updatedAt || item.tracking.metadata.updatedAt;
  const days = daysBetween(lastAction, today);
  return days !== null && days >= staleDays;
}

export function todayLocalDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isOpenCase(item: CaseIndexItem): boolean {
  return !item.isClosedFolder && item.workflowStatus !== 'Kapalı' && item.statusIsClosed !== true && item.tracking.status.kapaliMi !== true;
}

export function isClosedCase(item: CaseIndexItem): boolean {
  return item.isClosedFolder || item.workflowStatus === 'Kapalı' || item.statusIsClosed === true || item.tracking.status.kapaliMi === true;
}

function openTodos(item: CaseIndexItem): TodoItem[] {
  return item.tracking.todos.filter((todo) => !todo.completed);
}

function closingReadinessBlockers(item: CaseIndexItem): number {
  return item.documentAnalysis.missingCritical.length + countMissingPhotos(item) + item.photoAnalysis.unsupportedFiles.length;
}

function countMissingPhotos(item: CaseIndexItem): number {
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

function issueScore(issues: DataQualityIssue[]): number {
  return issues.reduce((sum, issue) => sum + issue.sortWeight, 0);
}

function isPastDate(value: string, today: string): boolean {
  return isDateInput(value) && isDateInput(today) && value < today;
}

function isDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetween(input: string, today: string): number | null {
  const start = dateOnly(input);
  const end = dateOnly(today);
  if (!start || !end) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function dateOnly(input: string): Date | null {
  const dateText = input.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!dateText) return null;
  const [yearText, monthText, dayText] = dateText.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
