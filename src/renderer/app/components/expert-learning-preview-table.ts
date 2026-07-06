/**
 * v0.6.x — AI İşçilik v3.2: Eksper öğrenme önizleme tablosu (yalnız gösterim + satır seçimi).
 * Dosyaya/Excel'e YAZMAZ; yalnız onaylanacak satırların seçimini sunar.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import type { ExpertLearningPreviewItem, LaborDistribution } from '../../../shared/labor/expert-approved-learning-types';

const OP_LABEL: Record<string, string> = { onarim: 'Onarım', degisim: 'Değişim', belirsiz: 'Belirsiz' };
const DIST_LABEL: Array<[keyof LaborDistribution, string]> = [
  ['kaporta', 'Kaporta'], ['mekanik', 'Mekanik'], ['elektrik', 'Elektrik'],
  ['dosemeKilit', 'Döşeme/Kilit'], ['cam', 'Cam'], ['boya', 'Boya'], ['onarim', 'Onarım']
];

function tl(n: number | null): string {
  return n == null ? '—' : `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

function distributionText(dist: LaborDistribution): string {
  const parts = DIST_LABEL.filter(([key]) => (dist[key] ?? 0) > 0).map(([key, label]) => `${label} ${Math.round(dist[key]).toLocaleString('tr-TR')}`);
  return parts.length ? parts.join(' • ') : '—';
}

function renderRow(item: ExpertLearningPreviewItem, selected: boolean): string {
  const id = item.derivedEntry.id;
  const tone = item.needsReview ? 'expert-learning-row-review' : 'expert-learning-row-ok';
  return `<tr class="${tone}">
    <td><input type="checkbox" class="expert-learning-row-select" data-action="expert-learning-toggle-row" data-id="${escapeHtml(id)}" ${selected ? 'checked' : ''} aria-label="Bu satırı onaya seç" /></td>
    <td>${escapeHtml(item.partGroup || '—')}</td>
    <td><b>${escapeHtml(item.partName)}</b></td>
    <td>${escapeHtml(item.partCode || '—')}</td>
    <td>${escapeHtml(OP_LABEL[item.operationType] || item.operationType)}</td>
    <td>${tl(item.salvagePrice)}</td>
    <td>${tl(item.originalPrice)}</td>
    <td>${escapeHtml(distributionText(item.laborDistribution))}</td>
    <td>${escapeHtml(item.confidence)}</td>
    <td>${item.duplicate ? `<span class="expert-learning-dup-badge">Mevcut kayıt var</span>` : item.needsReview ? `<span class="expert-learning-warning">Kontrol gerekli</span>` : 'Uygun'}${item.warning ? `<div class="expert-learning-note">${escapeHtml(item.warning)}</div>` : ''}${item.duplicate && item.duplicateOfId ? `<div><button class="secondary compact" data-action="expert-learning-replace-dup" data-id="${escapeHtml(id)}">Eski Kaydı Pasifleştir + Yeniyi Öğren</button></div>` : ''}</td>
  </tr>`;
}

/** Önizleme tablosunu döner (önizleme yoksa boş string). */
export function renderExpertLearningPreviewTable(state: UiState): string {
  const preview = state.expertLearning.preview;
  if (!preview) return '';
  if (preview.items.length === 0) {
    return `<p class="expert-learning-empty">Bu dosyada öğrenilebilir (dolu işçilik dağıtımı olan) satır bulunamadı.${preview.skipped.length ? ` ${preview.skipped.length} satır boş dağıtım nedeniyle atlandı.` : ''}</p>`;
  }
  const selected = new Set(state.expertLearning.selectedIds);
  const rows = preview.items.map((item) => renderRow(item, selected.has(item.derivedEntry.id))).join('');
  return `<div class="expert-learning-table-wrap">
    <table class="expert-learning-table">
      <thead><tr>
        <th>Seç</th><th>Grup</th><th>Parça</th><th>Kod</th><th>İşlem</th>
        <th>Sahiplenme</th><th>Orijinal</th><th>Eksper Dağıtımı</th><th>Güven</th><th>Durum</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${preview.skipped.length ? `<p class="expert-learning-note">${preview.skipped.length} satır boş işçilik dağıtımı nedeniyle atlandı.</p>` : ''}
  </div>`;
}
