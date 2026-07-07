/**
 * v0.6.x — Kapanma Ücreti dt/dd satırı (SALT görüntüleme; ortak bileşen).
 * Yalnız KAPALI dosyalarda ve rapor kökü ayarlıyken render olur. Kaynak: kesin ekspertiz
 * raporundaki "Ekspertiz Ücreti" alanı. Hiçbir yere yazılmaz; elle giriş/aksiyon yoktur.
 */
import type { CaseIndexItem } from '../../../shared/types';
import { escapeHtml } from '../validation';
import { infoTip } from './info-tip';
import { state } from '../state';
import { normalizePlateKey } from '../../../shared/reports/closing-fee-extract';

function caseIsClosed(item: CaseIndexItem): boolean {
  return item.isClosedFolder === true || item.statusIsClosed === true || item.workflowStatus === 'Kapalı' || item.tracking.status.kapaliMi === true;
}

/** Künye/özet panellerine eklenecek "Kapanma Ücreti" dt/dd çifti (uygun değilse boş). */
export function renderClosingFeeRow(item: CaseIndexItem): string {
  if (!caseIsClosed(item)) return '';
  const cf = state.closingFees;
  if (!cf) return '';
  const tip = infoTip('Kesin ekspertiz raporundaki "Ekspertiz Ücreti" alanından salt-okunur alınır; hiçbir dosyaya yazılmaz. Kaynak: Ayarlar > Ekspertiz Raporları klasörü.');
  if (cf.loading) return `<dt>Kapanma Ücreti${tip}</dt><dd class="muted">yükleniyor…</dd>`;
  const record = cf.records[normalizePlateKey(item.plate)];
  if (!record) return `<dt>Kapanma Ücreti${tip}</dt><dd class="muted">Rapor bulunamadı</dd>`;
  if (record.status === 'ok' && typeof record.feeTl === 'number') {
    const src = `${record.fileName}${record.kayitTarihi ? ` • ${record.kayitTarihi}` : ''}${record.ekspertizTuru ? ` • ${record.ekspertizTuru}` : ''}`;
    return `<dt>Kapanma Ücreti${tip}</dt><dd><b>${escapeHtml(record.feeTl.toLocaleString('tr-TR'))} TL</b> <small class="muted" title="${escapeHtml(src)}">(rapordan)</small></dd>`;
  }
  if (record.status === 'unreadable') return `<dt>Kapanma Ücreti${tip}</dt><dd class="muted">Rapor okunamadı — elle kontrol edin</dd>`;
  return `<dt>Kapanma Ücreti${tip}</dt><dd class="muted">Raporda ücret alanı yok</dd>`;
}
