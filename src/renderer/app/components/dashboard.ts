import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { buildDailyWorkSummary } from '../../../shared/daily-work';
import { icon } from '../icons';

interface QuickFilter {
  key: string;
  label: string;
  value: number;
  icon: string;
  tone: 'info' | 'warning' | 'critical';
}

/**
 * v0.4.1: "Bugün İş Masası" hızlı filtreleri.
 * Eskiden Ana Sayfa'da büyük KPI kartları + "Önce Bakılacak Dosyalar" odak listesi +
 * "Bugün X konu dikkat istiyor" uyarı bloğu olarak duruyordu. Bu kalabalık kaldırıldı.
 * Artık SADECE Dosyalar ekranında tek satırlık kompakt filtre şeridi olarak gösterilir;
 * Ana Sayfa'da render edilmez. Şerit, tam dosya listesine hızlı filtre uygular.
 */
export function renderQuickFilterStrip(state: UiState): string {
  const daily = buildDailyWorkSummary(state.cases, state.settings?.activeUser ?? '');
  const unsupported = state.dashboard?.unsupportedPhotos ?? 0;
  const filters: QuickFilter[] = [
    { key: 'mine', label: 'Bendeki', value: daily.mineCount, icon: 'operation', tone: 'info' },
    { key: 'overdue', label: 'Geciken', value: daily.overdueCount, icon: 'warning', tone: daily.overdueCount ? 'critical' : 'info' },
    { key: 'today', label: 'Bugün', value: daily.todayCount, icon: 'calendar', tone: daily.todayCount ? 'warning' : 'info' },
    { key: 'week', label: 'Bu Hafta', value: daily.weekCount, icon: 'calendar', tone: daily.weekCount ? 'warning' : 'info' },
    { key: 'risk', label: 'Riskli', value: daily.riskCount, icon: 'issue', tone: daily.riskCount ? 'critical' : 'info' },
    { key: 'unassigned', label: 'Sahipsiz', value: daily.unassignedCount, icon: 'warning', tone: daily.unassignedCount ? 'critical' : 'info' },
    { key: 'stale', label: 'Durgun', value: daily.staleCount, icon: 'operation', tone: daily.staleCount ? 'warning' : 'info' },
    { key: 'quality', label: 'Veri Kalitesi', value: daily.qualityIssueCount, icon: 'warning', tone: daily.qualityCriticalCount ? 'critical' : daily.qualityIssueCount ? 'warning' : 'info' },
    { key: 'photo-format', label: 'Format Uyarısı', value: unsupported, icon: 'photo', tone: unsupported ? 'warning' : 'info' }
  ];
  return `<div class="daily-work-desk dosyalar-quick-filters" role="group" aria-label="Bugün İş Masası hızlı filtreleri" title="Bugün İş Masası — listeye hızlı filtre">
    ${filters.map((filter) => `<button class="quick-filter-chip ${filter.tone} ${state.filter === filter.key ? 'active' : ''}" data-filter="${escapeHtml(filter.key)}" title="${escapeHtml(filter.label)} (${filter.value})">
      <span class="quick-filter-icon">${icon(filter.icon)}</span>
      <b>${escapeHtml(String(filter.value))}</b>
      <span class="quick-filter-label">${escapeHtml(filter.label)}</span>
    </button>`).join('')}
  </div>`;
}
