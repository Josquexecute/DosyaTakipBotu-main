import type { AppSettings, UiCaseListSortMode, UiFilterPreferences, UiStatusBoardSortMode } from '../../shared/types';
import { DEFAULT_PCLOUD_ROOT } from '../../shared/constants';
import { safeFileDisplayName } from '../../shared/turkish';
import { WORKFLOW_STATUSES } from '../../shared/workflow';

/**
 * Ayarlar / dağıtım (deployment) normalize ve sürüm karşılaştırma yardımcıları.
 * ipc-domain-services.ts'ten ayrıştırıldı (davranış birebir korunur).
 */

/** Ofis istemci dosya adını güvenli hâle getirir (dağıtım sürüm kayıtları için). */
export function safeClientFileName(value: string): string {
  const cleaned = safeFileDisplayName(value || 'BILINMEYEN-PC').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64);
  return cleaned || 'BILINMEYEN-PC';
}

/** Semver benzeri sürüm karşılaştırması. Yalnızca prerelease/build ekini (-, +) ayırır; noktayı sürüm bileşeni olarak bölmez. */
export function compareVersions(left: string, right: string): number {
  const l = (left.split(/[+-]/)[0] ?? '').split('.').map((part) => Number(part) || 0);
  const r = (right.split(/[+-]/)[0] ?? '').split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(l.length, r.length); i += 1) {
    const diff = (l[i] ?? 0) - (r[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Sayısal aralığı [min,max] içine kıstırır; geçersizse fallback döner. */
export function clampInterval(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Kullanıcı listesini temizler; aktif kullanıcıyı başa ekler, tekrarsız ve sınırlı tutar. */
export function normalizeUsers(input: unknown, activeUser: string): string[] {
  const defaults = ['Ömer Faruk İşleyen', 'Enes Özmen', 'Baran Gürbüz', 'Berfin Kapar'];
  const raw = Array.isArray(input) ? input : defaults;
  const users = raw
    .map((value) => safeFileDisplayName(String(value ?? '').trim()))
    .filter((value) => value.length > 0 && value.length <= 80);
  if (!users.includes(activeUser)) users.unshift(activeUser);
  return [...new Set(users)].slice(0, 50);
}

/** Uygulama ayarlarını güvenli varsayılanlara normalize eder (Gemini anahtarı yalnızca doluysa korunur). */
export function normalizeSettings(input: AppSettings): AppSettings {
  const { geminiApiKey: rawGeminiKey, reportsRootPath: rawReportsRoot, ...rest } = input;
  const reportsRootPath = typeof rawReportsRoot === 'string' ? rawReportsRoot.trim().slice(0, 260) : '';
  const rootPath = String(rest.rootPath || DEFAULT_PCLOUD_ROOT).trim();
  if (!rootPath) throw new Error('Ana klasör yolu boş olamaz.');
  const activeUser = safeFileDisplayName(rest.activeUser || 'Sistem') || 'Sistem';
  const users = normalizeUsers(rest.users, activeUser);
  const geminiApiKey = typeof rawGeminiKey === 'string' ? rawGeminiKey.trim().slice(0, 200) : '';
  return {
    ...rest,
    rootPath,
    rootPathConfirmed: rest.rootPathConfirmed === true,
    theme: rest.theme === 'dark' ? 'dark' : 'light',
    zoom: Math.min(1.35, Math.max(0.8, Number(rest.zoom) || 1)),
    activeUser,
    activeComputer: safeFileDisplayName(rest.activeComputer || ''),
    users,
    scanIntervals: {
      fullYearLightMs: clampInterval(rest.scanIntervals?.fullYearLightMs, 300000, 3600000, 300000)
    },
    uiPreferences: normalizeUiPreferences(rest.uiPreferences),
    ...(geminiApiKey ? { geminiApiKey } : {}),
    ...(reportsRootPath ? { reportsRootPath } : {})
  };
}

export function normalizeUiPreferences(input: unknown): UiFilterPreferences {
  const raw = typeof input === 'object' && input !== null ? input as Partial<UiFilterPreferences> : {};
  const caseList: Partial<UiFilterPreferences['caseList']> = typeof raw.caseList === 'object' && raw.caseList !== null ? raw.caseList : {};
  const statusBoard: Partial<UiFilterPreferences['statusBoard']> = typeof raw.statusBoard === 'object' && raw.statusBoard !== null ? raw.statusBoard : {};
  return {
    caseList: {
      quickFilter: allowedString(caseList.quickFilter, CASE_LIST_FILTERS, 'all'),
      responsibleFilter: safeFilterValue(caseList.responsibleFilter),
      serviceFilter: safeFilterValue(caseList.serviceFilter),
      statusFilter: safeFilterValue(caseList.statusFilter),
      sortMode: allowedString(caseList.sortMode, CASE_LIST_SORTS, 'plate-az') as UiCaseListSortMode,
      advancedOpen: caseList.advancedOpen === true
    },
    statusBoard: {
      sort: allowedString(statusBoard.sort, STATUS_BOARD_SORTS, 'dosya-az') as UiStatusBoardSortMode,
      statusFilter: allowedString(statusBoard.statusFilter, ['all', ...WORKFLOW_STATUSES], 'all'),
      showClosed: statusBoard.showClosed === true,
      advancedOpen: statusBoard.advancedOpen === true,
      responsibleFilter: safeFilterValue(statusBoard.responsibleFilter),
      missingOnly: statusBoard.missingOnly === true,
      openTodoOnly: statusBoard.openTodoOnly === true
    }
  };
}

const CASE_LIST_FILTERS = [
  'all',
  'mine',
  'overdue',
  'today',
  'week',
  'risk',
  'unassigned',
  'stale',
  'quality',
  'open',
  'closed',
  'missing-docs',
  'missing-photos',
  'photo-format',
  'portal',
  'rucu'
] as const;
const CASE_LIST_SORTS = ['plate-az', 'plate-za', 'office-az', 'notice-az', 'updated-desc', 'followup-asc'] as const;
const STATUS_BOARD_SORTS = ['dosya-az', 'plate-az', 'updated-desc', 'durum'] as const;

function allowedString<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function safeFilterValue(value: unknown): string {
  const cleaned = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    : '';
  return cleaned || 'all';
}
