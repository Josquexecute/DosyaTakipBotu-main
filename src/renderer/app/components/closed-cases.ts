/**
 * v0.6.x — "Kapanan Dosyalar" sekmesi (SALT-OKUNUR).
 *
 * Yalnız kapalı dosyaları listeler; her satırda ekspertiz raporundan okunan KAPANMA ÜCRETİ ve
 * rapor durumu gösterilir. Ay filtresi + görünüm toplamı + (Tümü seçiliyken) ay bazlı toplam
 * dökümü sunar. Hiçbir yere yazmaz; satıra tıklamak dosyayı mevcut aksiyonla açar.
 */
import type { CaseIndexItem } from '../../../shared/types';
import type { UiState } from '../state';
import { state } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { infoTip } from './info-tip';
import { isClosedCase } from '../../../shared/data-quality';
import { normalizePlateKey } from '../../../shared/reports/closing-fee-extract';
import type { ClosingFeeRecord } from '../../../shared/reports/closing-fee-scan-types';

interface ClosedRow {
  item: CaseIndexItem;
  record: ClosingFeeRecord | null;
}

function feeRecordFor(item: CaseIndexItem): ClosingFeeRecord | null {
  const cf = state.closingFees;
  if (!cf || cf.loading) return null;
  return cf.records[normalizePlateKey(item.plate)] ?? null;
}

function monthOf(item: CaseIndexItem): string {
  return (item.monthFolder || 'Bilinmeyen Ay').trim();
}

function tl(value: number): string {
  return `${value.toLocaleString('tr-TR')} TL`;
}

/** Rapor durumu hücresi: okundu → tutar; diğer durumlar açıklayıcı rozet. */
function feeCell(record: ClosingFeeRecord | null, loading: boolean): { fee: string; status: string; cls: string } {
  if (loading) return { fee: '—', status: 'yükleniyor…', cls: 'muted' };
  if (!record) return { fee: '—', status: 'Rapor bulunamadı', cls: 'muted' };
  if (record.status === 'ok' && typeof record.feeTl === 'number') {
    return { fee: tl(record.feeTl), status: 'Rapordan okundu', cls: 'ok' };
  }
  if (record.status === 'unreadable') return { fee: '—', status: 'Rapor okunamadı — elle kontrol', cls: 'warn' };
  return { fee: '—', status: 'Raporda ücret alanı yok', cls: 'warn' };
}

/** Kapanan Dosyalar sayfasını döner (sol menü sekmesi; dosya seçimi gerektirmez). */
export function renderClosedCasesPage(ui: UiState): string {
  const closed: ClosedRow[] = ui.cases
    .filter((item) => isClosedCase(item))
    .map((item) => ({ item, record: feeRecordFor(item) }))
    .sort((a, b) => monthOf(a.item).localeCompare(monthOf(b.item), 'tr') || a.item.plate.localeCompare(b.item.plate, 'tr'));

  const months = [...new Set(closed.map((r) => monthOf(r.item)))];
  const filter = ui.closedCasesMonthFilter;
  const visible = filter === 'all' ? closed : closed.filter((r) => monthOf(r.item) === filter);
  const loading = ui.closingFees?.loading === true;
  const featureOff = !ui.settings?.reportsRootPath;

  const okRows = visible.filter((r) => r.record?.status === 'ok' && typeof r.record.feeTl === 'number');
  const total = okRows.reduce((sum, r) => sum + (r.record?.feeTl ?? 0), 0);
  const unreadable = visible.filter((r) => r.record?.status === 'unreadable').length;
  const missing = visible.filter((r) => !r.record).length;

  const monthTotals = filter === 'all' && months.length > 1
    ? months.map((m) => {
        const rows = closed.filter((r) => monthOf(r.item) === m && r.record?.status === 'ok' && typeof r.record.feeTl === 'number');
        const mt = rows.reduce((sum, r) => sum + (r.record?.feeTl ?? 0), 0);
        return `<span class="closed-month-total">${escapeHtml(m)}: <b>${escapeHtml(tl(mt))}</b> (${rows.length} dosya)</span>`;
      }).join(' · ')
    : '';

  const rowsHtml = visible.map((r) => {
    const cell = feeCell(r.record, loading);
    const src = r.record?.status === 'ok' ? `${r.record.fileName}${r.record.kayitTarihi ? ` • ${r.record.kayitTarihi}` : ''}` : '';
    return `<tr class="status-row" data-action="status-open-case" data-folder="${escapeHtml(r.item.folderPath)}" title="${escapeHtml(r.item.plate)} dosyasını aç">
      <td>${escapeHtml(monthOf(r.item))}</td>
      <td><b>${escapeHtml(r.item.plate)}</b><small>${escapeHtml(r.item.officeFileNo || r.item.dosyaNo || '-')}</small></td>
      <td>${escapeHtml(r.item.workflowStatus)}<small>${escapeHtml(r.item.sorumlu || 'Atanmadı')}</small></td>
      <td class="closed-fee-cell ${cell.cls}" ${src ? `title="${escapeHtml(src)}"` : ''}><b>${escapeHtml(cell.fee)}</b></td>
      <td class="closed-status-cell ${cell.cls}">${escapeHtml(cell.status)}</td>
    </tr>`;
  }).join('');

  return `<section class="closed-cases-page">
    <div class="section-heading"><h2>${icon('folder')} Kapanan Dosyalar${infoTip('Kapanma tutarı, Ayarlar ekranındaki Ekspertiz Raporları klasöründeki kesin ekspertiz raporlarının "GENEL TOPLAM" (KDV dahil) satırından SALT-OKUNUR alınır; hiçbir dosyaya yazılmaz.')}</h2>
      <label>Ay<select data-closed-month="1">
        <option value="all" ${filter === 'all' ? 'selected' : ''}>Tümü</option>
        ${months.map((m) => `<option value="${escapeHtml(m)}" ${filter === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
      </select></label>
    </div>
    ${featureOff ? `<div class="app-alert info">${icon('info')}<span>Kapanma ücreti için Ayarlar ekranından "Ekspertiz Raporları klasörü" seçilmelidir. Liste yine de kapalı dosyaları gösterir.</span></div>` : ''}
    <div class="vl-summary">Kapalı dosya: <b>${visible.length}</b> • Ücreti okunan: <b>${okRows.length}</b> • Okunamayan: ${unreadable} • Rapor bulunamayan: ${missing} • Görünüm toplamı: <b>${escapeHtml(tl(total))}</b>${loading ? ' • yükleniyor…' : ''}</div>
    ${monthTotals ? `<div class="closed-month-totals">${monthTotals}</div>` : ''}
    ${visible.length === 0
      ? `<div class="empty-state small">${icon('folder')}<h3>Kapalı dosya yok</h3><p>${filter === 'all' ? 'Taranan klasörde kapalı (KAPALI ay klasörü / Kapalı durum) dosya bulunamadı.' : 'Seçili ayda kapalı dosya yok.'}</p></div>`
      : `<div class="table-wrap"><table class="status-table"><thead><tr>
          <th>Ay</th><th>Plaka / Dosya No</th><th>Durum / Sorumlu</th><th>Kapanma Ücreti</th><th>Rapor Durumu</th>
        </tr></thead><tbody>${rowsHtml}</tbody></table></div>`}
    <p class="muted vl-form-note">Bu ekran salt-okunurdur: ücretler rapor PDF'lerinden okunur, hiçbir dosyaya/Excel'e yazılmaz. Satıra tıklayınca dosya Dosyalar ekranında açılır.</p>
  </section>`;
}
