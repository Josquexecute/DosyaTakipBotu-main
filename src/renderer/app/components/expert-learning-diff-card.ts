/**
 * v0.6.x — AI İşçilik v3.3: Eksper Örneği Karşılaştırma (diff) kartı.
 * Mevcut AI önerisi ile eksper onaylı geçmiş dağıtımı YAN YANA gösterir; Excel'e UYGULA butonu İÇERMEZ.
 * Yalnız karşılaştırma/evidence; "kullanıcı onayı olmadan uygulanmaz".
 */
import { escapeHtml } from '../validation';
import type { ExpertLaborDiffView } from '../../../shared/labor/expert-approved-learning-types';

const LEVEL_TR: Record<string, string> = { strong: 'Güçlü', medium: 'Orta', low: 'Düşük', 'control-needed': 'Kontrol gerekli' };
const VEHICLE_SOURCE_TR: Record<string, string> = { 'active-file': 'aktif dosya', excel: 'Excel', unknown: 'bilinmiyor' };

function tl(n: number): string {
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

/** Bir önizleme satırının diff kartını döner (diff yoksa boş string). */
export function renderExpertLearningDiffCard(diff: ExpertLaborDiffView | undefined): string {
  if (!diff) return '';
  const badge = `<span class="expert-learning-match-badge expert-learning-match-${diff.matchLevel}">${escapeHtml(LEVEL_TR[diff.matchLevel] ?? diff.matchLevel)}</span>`;
  const vehicleSrc = `<div class="expert-learning-diff-vehicle">Araç bağlamı kaynağı: <b>${escapeHtml(VEHICLE_SOURCE_TR[diff.vehicleSource ?? 'unknown'] ?? 'bilinmiyor')}</b></div>`;
  const reasons = diff.matchReasons.length ? `<div class="expert-learning-diff-reasons">${diff.matchReasons.map((r) => `<span>${escapeHtml(r)}</span>`).join('')}</div>` : '';
  const warnings = diff.matchWarnings.length ? `<div class="expert-learning-diff-warnings">${diff.matchWarnings.map((w) => `<span>⚠ ${escapeHtml(w)}</span>`).join('')}</div>` : '';
  const rows = diff.differences.length
    ? diff.differences.map((d) => `<tr><td>${escapeHtml(d.label)}</td><td>${tl(d.aiAmount)}</td><td>${tl(d.expertAmount)}</td><td class="${d.delta >= 0 ? 'expert-learning-delta-pos' : 'expert-learning-delta-neg'}">${d.delta >= 0 ? '+' : ''}${tl(d.delta)}</td></tr>`).join('')
    : `<tr><td colspan="4">AI önerisi eksper örneğiyle birebir aynı.</td></tr>`;

  return `<div class="expert-learning-diff-card">
    <div class="expert-learning-diff-head"><b>Eksper Onaylı Geçmiş Örnek</b> ${badge}</div>
    ${vehicleSrc}
    ${reasons}
    ${warnings}
    <table class="expert-learning-diff-table">
      <thead><tr><th>Kalem</th><th>AI Önerisi</th><th>Eksper Örneği</th><th>Fark</th></tr></thead>
      <tbody>${rows}</tbody>
      ${diff.differences.length ? `<tfoot><tr><td>Toplam fark</td><td></td><td></td><td>${tl(diff.totalDelta)}</td></tr></tfoot>` : ''}
    </table>
    <p class="expert-learning-diff-note">Bu yalnızca karşılaştırmadır; eksper dağıtımı kullanıcı onayı olmadan Excel'e uygulanmaz.</p>
  </div>`;
}
