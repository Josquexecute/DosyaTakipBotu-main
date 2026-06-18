import type { CaseIndexItem, TodoItem } from './types';
import { analyzeCaseDataQuality, matchesDataQualityFilter } from './data-quality';

export type DailyWorkFilter = 'mine' | 'overdue' | 'today' | 'week' | 'risk' | 'unassigned' | 'stale' | 'quality';
export type DailyWorkSeverity = 'critical' | 'warning' | 'info';

export interface DailyWorkItem {
  folderPath: string;
  plate: string;
  officeFileNo: string;
  claimNoticeNo: string;
  owner: string;
  serviceName: string;
  priority: string;
  reason: string;
  dueLabel: string;
  severity: DailyWorkSeverity;
  sortScore: number;
}

export interface DailyWorkSummary {
  activeUser: string;
  today: string;
  mineCount: number;
  overdueCount: number;
  todayCount: number;
  weekCount: number;
  riskCount: number;
  unassignedCount: number;
  staleCount: number;
  qualityIssueCount: number;
  qualityCriticalCount: number;
  openTodoCount: number;
  focusItems: DailyWorkItem[];
}

export function buildDailyWorkSummary(cases: CaseIndexItem[], activeUser = '', today = todayLocalDateInput()): DailyWorkSummary {
  const openCases = cases.filter(isDailyOpenCase);
  const qualityCases = cases
    .map((item) => ({ item, issues: analyzeCaseDataQuality(item, today) }))
    .filter((entry) => entry.issues.length > 0);
  const focusCandidates = cases.filter((item) => isDailyOpenCase(item) || qualityCases.some((entry) => entry.item.folderPath === item.folderPath && entry.issues.some((issue) => issue.severity === 'critical')));
  const focusItems = focusCandidates
    .map((item) => buildFocusItem(item, activeUser, today))
    .filter((item): item is DailyWorkItem => Boolean(item))
    .sort((a, b) => b.sortScore - a.sortScore || a.dueLabel.localeCompare(b.dueLabel, 'tr') || a.plate.localeCompare(b.plate, 'tr'))
    .slice(0, 10);

  return {
    activeUser,
    today,
    mineCount: openCases.filter((item) => isMine(item, activeUser)).length,
    overdueCount: openCases.filter((item) => hasOverdueWork(item, today)).length,
    todayCount: openCases.filter((item) => hasTodayWork(item, today)).length,
    weekCount: openCases.filter((item) => hasWeekWork(item, today)).length,
    riskCount: openCases.filter(hasRiskSignal).length,
    unassignedCount: openCases.filter((item) => matchesDataQualityFilter(item, 'unassigned', today)).length,
    staleCount: openCases.filter((item) => matchesDataQualityFilter(item, 'stale', today)).length,
    qualityIssueCount: qualityCases.length,
    qualityCriticalCount: qualityCases.filter((entry) => entry.issues.some((issue) => issue.severity === 'critical')).length,
    openTodoCount: openCases.reduce((sum, item) => sum + openTodos(item).length, 0),
    focusItems
  };
}

export function matchesDailyWorkFilter(item: CaseIndexItem, filter: DailyWorkFilter, activeUser = '', today = todayLocalDateInput()): boolean {
  if (filter === 'quality') return matchesDataQualityFilter(item, 'quality', today);
  if (!isDailyOpenCase(item)) return false;
  switch (filter) {
    case 'mine': return isMine(item, activeUser);
    case 'overdue': return hasOverdueWork(item, today);
    case 'today': return hasTodayWork(item, today);
    case 'week': return hasWeekWork(item, today);
    case 'risk': return hasRiskSignal(item);
    case 'unassigned': return matchesDataQualityFilter(item, 'unassigned', today);
    case 'stale': return matchesDataQualityFilter(item, 'stale', today);
    default: return false;
  }
}

export function isDailyOpenCase(item: CaseIndexItem): boolean {
  return !item.isClosedFolder && item.workflowStatus !== 'Kapalı' && item.statusIsClosed !== true && item.tracking.status.kapaliMi !== true;
}

export function todayLocalDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildFocusItem(item: CaseIndexItem, activeUser: string, today: string): DailyWorkItem | null {
  const risk = hasRiskSignal(item);
  const overdue = hasOverdueWork(item, today);
  const dueToday = hasTodayWork(item, today);
  const dueThisWeek = hasWeekWork(item, today);
  const mine = isMine(item, activeUser);
  const qualityIssues = analyzeCaseDataQuality(item, today);
  const topQualityIssue = qualityIssues[0];
  const criticalQuality = qualityIssues.some((issue) => issue.severity === 'critical');
  const missingDocumentCount = item.documentAnalysis.missingCritical.length;
  const missingPhotoCount = countMissingPhotos(item);
  const portalPendingCount = item.tracking.portalChecklist.filter((entry) => !entry.completed).length;
  const todoCount = openTodos(item).length;
  const priorityScore = priorityWeight(item.oncelik);
  const hasAction = criticalQuality || topQualityIssue || risk || overdue || dueToday || dueThisWeek || missingDocumentCount > 0 || missingPhotoCount > 0 || portalPendingCount > 0 || todoCount > 0 || priorityScore >= 40 || mine;
  if (!hasAction) return null;

  const severity: DailyWorkSeverity = criticalQuality || risk || overdue || item.oncelik === 'Kritik' ? 'critical' : topQualityIssue || dueToday || missingDocumentCount > 0 || missingPhotoCount > 0 ? 'warning' : 'info';
  const sortScore =
    (criticalQuality ? 1250 : 0) +
    (risk ? 1200 : 0) +
    (overdue ? 900 : 0) +
    (dueToday ? 700 : 0) +
    (dueThisWeek ? 260 : 0) +
    (mine ? 120 : 0) +
    Math.min(260, qualityIssues.reduce((sum, issue) => sum + Math.floor(issue.sortWeight / 20), 0)) +
    priorityScore +
    Math.min(120, (missingDocumentCount + missingPhotoCount) * 30) +
    Math.min(80, portalPendingCount * 20) +
    Math.min(60, todoCount * 10);

  return {
    folderPath: item.folderPath,
    plate: item.plate,
    officeFileNo: item.officeFileNo || item.dosyaNo || '',
    claimNoticeNo: item.claimNoticeNo || '',
    owner: item.sorumlu || 'Atanmadı',
    serviceName: item.serviceName || '',
    priority: item.oncelik,
    reason: focusReason(item, today, { risk, overdue, dueToday, dueThisWeek, missingDocumentCount, missingPhotoCount, portalPendingCount, todoCount, mine, topQualityIssue }),
    dueLabel: focusDueLabel(item, today, { risk, overdue, dueToday, dueThisWeek, topQualityIssue }),
    severity,
    sortScore
  };
}

function focusReason(
  item: CaseIndexItem,
  today: string,
  flags: { risk: boolean; overdue: boolean; dueToday: boolean; dueThisWeek: boolean; missingDocumentCount: number; missingPhotoCount: number; portalPendingCount: number; todoCount: number; mine: boolean; topQualityIssue: { title: string; message: string } | undefined }
): string {
  if (flags.topQualityIssue) return flags.topQualityIssue.title;
  const firstIssue = item.trackingIssue ?? item.caseIssues?.[0];
  if (flags.risk && firstIssue) return firstIssue.title || 'Riskli takip kontrolü';
  if (flags.risk) return 'Format veya takip riski';
  if (flags.overdue) return overdueReason(item, today);
  if (flags.dueToday) return 'Bugünkü takip/görev';
  if (flags.dueThisWeek) return 'Bu hafta takip edilecek';
  if (flags.missingDocumentCount > 0) return `${flags.missingDocumentCount} kritik evrak eksik`;
  if (flags.missingPhotoCount > 0) return `${flags.missingPhotoCount} fotoğraf kontrolü`;
  if (flags.portalPendingCount > 0) return `${flags.portalPendingCount} portal maddesi açık`;
  if (flags.todoCount > 0) return `${flags.todoCount} açık görev`;
  if (item.oncelik === 'Kritik' || item.oncelik === 'Yüksek') return `${item.oncelik} öncelikli dosya`;
  if (flags.mine) return 'Bendeki açık dosya';
  return 'Açık dosya';
}

function overdueReason(item: CaseIndexItem, today: string): string {
  if (isPastDate(item.takipTarihi, today)) return 'Takip tarihi geçti';
  const overdueTodo = openTodos(item).find((todo) => isPastDate(todo.dueDate, today));
  return overdueTodo ? `Görev gecikti: ${overdueTodo.title}` : 'Geciken iş';
}

function focusDueLabel(item: CaseIndexItem, today: string, flags: { risk: boolean; overdue: boolean; dueToday: boolean; dueThisWeek: boolean; topQualityIssue: { severity?: string } | undefined }): string {
  if (flags.risk) return 'Hemen';
  if (flags.overdue) return 'Gecikti';
  if (flags.topQualityIssue?.severity === 'critical') return 'Kontrol';
  if (flags.dueToday) return 'Bugün';
  if (flags.dueThisWeek) return 'Bu hafta';
  const dates = [item.takipTarihi, ...openTodos(item).map((todo) => todo.dueDate)].filter(isDateInput).sort();
  return dates[0] ?? '-';
}

function hasOverdueWork(item: CaseIndexItem, today: string): boolean {
  return isPastDate(item.takipTarihi, today) || openTodos(item).some((todo) => isPastDate(todo.dueDate, today));
}

function hasTodayWork(item: CaseIndexItem, today: string): boolean {
  return item.takipTarihi === today || openTodos(item).some((todo) => todo.dueDate === today);
}

function hasWeekWork(item: CaseIndexItem, today: string): boolean {
  const dates = [item.takipTarihi, ...openTodos(item).map((todo) => todo.dueDate)];
  return dates.some((value) => isFutureDateWithinDays(value, today, 7));
}

function hasRiskSignal(item: CaseIndexItem): boolean {
  return item.corruptTracking === true ||
    Boolean(item.trackingIssue) ||
    (item.caseIssues ?? []).length > 0 ||
    item.photoAnalysis.unsupportedFiles.length > 0;
}

function isMine(item: CaseIndexItem, activeUser: string): boolean {
  const user = normalizePerson(activeUser);
  if (!user) return false;
  if (normalizePerson(item.sorumlu) === user) return true;
  return openTodos(item).some((todo) => normalizePerson(todo.assignedTo) === user);
}

function openTodos(item: CaseIndexItem): TodoItem[] {
  return item.tracking.todos.filter((todo) => !todo.completed);
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

function priorityWeight(priority: string): number {
  if (priority === 'Kritik') return 120;
  if (priority === 'Yüksek') return 60;
  if (priority === 'Düşük') return -10;
  return 0;
}

function isPastDate(value: string, today: string): boolean {
  return isDateInput(value) && isDateInput(today) && value < today;
}

function isFutureDateWithinDays(value: string, today: string, days: number): boolean {
  if (!isDateInput(value) || !isDateInput(today) || value <= today) return false;
  const diff = daysBetween(today, value);
  return diff !== null && diff <= days;
}

function isDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizePerson(value: string): string {
  return value.trim().toLocaleUpperCase('tr-TR');
}

function daysBetween(start: string, end: string): number | null {
  const startDate = dateOnly(start);
  const endDate = dateOnly(end);
  if (!startDate || !endDate) return null;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function dateOnly(input: string): Date | null {
  const [yearText, monthText, dayText] = input.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
