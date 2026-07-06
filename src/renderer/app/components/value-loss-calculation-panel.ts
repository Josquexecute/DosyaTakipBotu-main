/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v3: "Reel Piyasa Analiz Ön Hesabı" paneli (SALT-OKUNUR).
 *
 * Sonuç render anında saf motorla hesaplanır ve YALNIZ önizlenir: kaydetme/yazma butonu YOKTUR,
 * hiçbir dosyaya/Excel'e/rapora otomatik yazılmaz. Katsayı kaynağı ve disclaimer her zaman gösterilir.
 */
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import type { ValueLossCalculationResult, ValueLossCalculationFactor } from '../../../shared/value-loss/value-loss-calculation-types';
import type { ValueLossCalculationSnapshot, ValueLossCalculationSnapshotHistoryItem } from '../../../shared/value-loss/value-loss-context-types';
import { formatCalcAmount, formatCoefficient } from '../../../shared/value-loss/value-loss-calculation-explain';
import { buildValueLossCalculationCopyText } from '../../../shared/value-loss/value-loss-calculation-copy';
import { formatSnapshotLabel } from '../../../shared/value-loss/value-loss-calculation-snapshot';
import { SEIK_2026_V1_COEFFICIENT_METADATA } from '../../../shared/value-loss/value-loss-coefficients';
import type { ValueLossSnapshotFreshnessResult, ValueLossHistoryFreshnessSummary } from '../../../shared/value-loss/value-loss-snapshot-freshness';

const STATUS_META: Record<ValueLossCalculationResult['status'], { label: string; cls: string }> = {
  calculated: { label: 'Hesaplandı (ön hesap / eksper kontrolü gerekli)', cls: 'success' },
  cannot_calculate: { label: 'Hesaplanamaz', cls: 'info' },
  control_needed: { label: 'Kontrol gerekli', cls: 'warning' }
};

const EFFECT_TR: Record<ValueLossCalculationFactor['effect'], string> = {
  increase: 'Artırıcı', decrease: 'Düşürücü', neutral: 'Nötr', blocking: 'Bloklayıcı', info: 'Bilgi'
};

function renderFactorRow(f: ValueLossCalculationFactor): string {
  const input = f.inputValue === undefined ? '—'
    : f.inputValue === true ? 'evet' : f.inputValue === false ? 'hayır' : String(f.inputValue);
  const coef = f.coefficient === undefined ? '—' : formatCoefficient(f.coefficient);
  return `<tr class="vl-calc-effect-${f.effect}">
    <td>${escapeHtml(f.label)}</td>
    <td>${escapeHtml(input)}</td>
    <td>${escapeHtml(coef)}</td>
    <td>${escapeHtml(EFFECT_TR[f.effect])}</td>
    <td>${escapeHtml(f.explanation)}</td>
  </tr>`;
}

function renderAmounts(result: ValueLossCalculationResult): string {
  if (result.status !== 'calculated' || typeof result.amount !== 'number') return '';
  const cap = result.capInfo;
  return `<div class="vl-calc-amounts">
    <div class="vl-calc-amount"><span>Ön hesap tutarı</span><b>${escapeHtml(formatCalcAmount(result.amount))}</b></div>
    <div class="vl-calc-amount"><span>500 TL katına yuvarlanmış</span><b>${escapeHtml(formatCalcAmount(result.roundedAmount ?? result.amount))}</b></div>
    ${cap ? `<div class="vl-calc-cap ${cap.capApplied ? 'applied' : ''}">Üst sınır: ${cap.maxAllowedAmount !== undefined ? escapeHtml(formatCalcAmount(cap.maxAllowedAmount)) : 'tanımsız'} — ${cap.capApplied ? `UYGULANDI${cap.reason ? ` (${escapeHtml(cap.reason)})` : ''}` : 'uygulanmadı (aşım yok)'}</div>` : ''}
    <div class="vl-calc-formula"><span>Formül:</span> ${escapeHtml(result.formulaSummary)}</div>
  </div>`;
}

/** v5: kopyalama başarısızsa metni seçilebilir alan olarak sunar (mail/rapor üretimi YOK). */
function renderCopyFallback(result: ValueLossCalculationResult, copyError: string): string {
  if (!copyError) return '';
  return `<div class="vl-calc-copy-fallback">
    <p class="vl-warnings">⚠ ${escapeHtml(copyError)}</p>
    <textarea id="vl-calc-copy-text" class="vl-draft-text" rows="6" readonly>${escapeHtml(buildValueLossCalculationCopyText(result))}</textarea>
  </div>`;
}

export interface ValueLossCalcPanelOptions {
  copyError?: string;
  savedSnapshot?: ValueLossCalculationSnapshot | null;
  savedHistory?: readonly ValueLossCalculationSnapshotHistoryItem[];
  freshness?: ValueLossSnapshotFreshnessResult | null;
  historyFreshness?: ValueLossHistoryFreshnessSummary | null;
}

function fmtDate(value: string | undefined): string {
  return (value || '').slice(0, 19).replace('T', ' ') || '—';
}

const FRESHNESS_META: Record<string, { label: string; cls: string }> = {
  fresh: { label: 'Güncel', cls: 'ok' },
  stale: { label: 'Eski veriyle oluşturulmuş olabilir', cls: 'warn' },
  unknown: { label: 'Veri sürümü bilinmiyor', cls: 'warn' },
  none: { label: 'Kayıtlı özet yok', cls: 'muted' }
};

/** v8: kayıtlı özet tazelik durumu (salt-okunur; otomatik yenileme/kayıt YOK). */
function renderFreshness(freshness: ValueLossSnapshotFreshnessResult | null | undefined): string {
  if (!freshness || freshness.status === 'none') return '';
  const meta = FRESHNESS_META[freshness.status] ?? { label: 'Veri sürümü bilinmiyor', cls: 'warn' };
  const warn = freshness.status === 'stale'
    ? `<div class="vl-warnings">⚠ ${escapeHtml(freshness.message)}</div>`
    : '';
  return `<div class="vl-snap-fresh fresh-${meta.cls}">Güncel kayıtlı özet durumu: <b>${escapeHtml(meta.label)}</b></div>${warn}`;
}

/** v9: geçmiş kayıt aggregate satırı ("N kayıt · X güncel · Y eski · Z bilinmiyor"). */
function renderHistoryAggregate(hs: ValueLossHistoryFreshnessSummary | null | undefined): string {
  if (!hs || hs.total === 0) return '';
  return `<p class="muted vl-hist-agg">Geçmiş özeti: ${hs.total} kayıt · ${hs.fresh} güncel · ${hs.stale} eski · ${hs.unknown} bilinmiyor</p>`;
}

const HIST_ITEM_CLS: Record<string, string> = { fresh: 'ok', stale: 'warn', unknown: 'warn', none: 'muted' };

/** v6: kayıtlı özet + geçmiş bloğu (salt görüntüleme; silme/geri yükleme/düzenleme YOK). */
function renderSavedSnapshots(saved: ValueLossCalculationSnapshot | null | undefined, history: readonly ValueLossCalculationSnapshotHistoryItem[], freshness: ValueLossSnapshotFreshnessResult | null | undefined, historyFreshness: ValueLossHistoryFreshnessSummary | null | undefined): string {
  if (!saved && history.length === 0) return '';
  const current = saved
    ? `<div class="vl-snap-current">Güncel: <b>${escapeHtml(formatSnapshotLabel(saved))}</b> — ${escapeHtml(fmtDate(saved.createdAt))}
       <small>${escapeHtml(saved.coefficientSource ?? '')} • ${saved.warnings.length} uyarı / ${saved.missingInputs.length} eksik</small></div>
       ${renderFreshness(freshness)}`
    : '';
  // v9: her geçmiş kaydının veri durumu id ile eşlenir (sıra korunur; ham hash gösterilmez).
  const hf = new Map((historyFreshness?.items ?? []).map((i) => [i.id, i]));
  const items = history.map((h) => {
    const fi = hf.get(h.id);
    const status = fi?.status ?? 'unknown';
    const statusLine = `<span class="vl-hist-status fresh-${HIST_ITEM_CLS[status] ?? 'warn'}">Geçmiş kayıt veri durumu: ${escapeHtml(fi?.label ?? 'Veri sürümü bilinmiyor')}</span>`;
    const note = fi && fi.message ? `<small class="vl-warnings">⚠ ${escapeHtml(fi.message)}</small>` : '';
    return `<li class="vl-snap-item">
      <span>${escapeHtml(fmtDate(h.savedAt))}</span>
      <b>${escapeHtml(formatSnapshotLabel(h))}</b>
      ${statusLine}
      <small>${h.warnings.length} uyarı / ${h.missingInputs.length} eksik • ${escapeHtml(h.coefficientSource ?? '')} • ${h.disclaimer ? 'disclaimer ✓' : ''}</small>
      ${note}
    </li>`;
  }).join('');
  return `<div class="vl-block vl-snap-block">
    <h5 class="vl-cat-title">Kayıtlı Ön Hesap Özetleri</h5>
    ${current}
    ${renderHistoryAggregate(historyFreshness)}
    ${history.length ? `<ul class="vl-snap-list">${items}</ul>` : '<p class="muted">Geçmiş kaydı yok.</p>'}
    <p class="muted vl-form-note">Özetler yalnız kullanıcı onayıyla kaydedilir; buradan silme/geri yükleme/düzenleme yapılmaz.</p>
  </div>`;
}

const MISSING_SUMMARY_CAP = 8;

/** v7: eksik/kontrol gereken bilgiler için kompakt, SALT-OKUNUR özet (otomatik doldurma YOK). */
function renderMissingQuickSummary(result: ValueLossCalculationResult): string {
  const items = [...result.missingInputs, ...result.warnings];
  const shown = items.slice(0, MISSING_SUMMARY_CAP);
  const more = items.length - shown.length;
  return `<div class="vl-missing-quick">
    <b>Ön hesap için eksik/kontrol gereken bilgiler</b>
    ${shown.length === 0
      ? '<p class="muted">Eksik kritik veri görünmüyor; yine de eksper kontrolü gereklidir.</p>'
      : `<ul>${shown.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>${more > 0 ? `<small class="muted">+${more} madde daha (ayrıntılar aşağıda)</small>` : ''}`}
  </div>`;
}

/** v6: katsayı seti bilgi bloğu (yalnız yerel bilgi; internet kontrolü/otomatik güncelleme YOK). */
function renderCoefficientMetadata(): string {
  const m = SEIK_2026_V1_COEFFICIENT_METADATA;
  return `<div class="vl-coef-status">Katsayı seti: <b>${escapeHtml(m.version)}</b> / yerel doğrulanmış set
    <small>Otomatik güncelleme yoktur; yeni SEİK modülü gelirse yeniden doğrulama gerekir.</small></div>
  <details class="vl-calc-evidence vl-coef-meta"><summary>Katsayı Seti Bilgisi (${escapeHtml(m.version)})</summary>
    <p class="muted">Kaynak: <b>${escapeHtml(m.sourceName)}</b>${m.extractedAt ? ` • çıkarım: ${escapeHtml(m.extractedAt)}` : ''}</p>
    <p class="muted">Doğrulama dokümanları:</p>
    <ul>${m.validationDocs.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
    <p class="muted">Bilinen varsayımlar:</p>
    <ul>${m.knownAssumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
    <p class="vl-warnings">⚠ ${escapeHtml(m.updateWatchNote)}</p>
  </details>`;
}

/** Reel Piyasa Analiz Ön Hesabı bölümünü döner (sonuç render anında hesaplanmış olarak verilir). */
export function renderValueLossCalculationPanel(result: ValueLossCalculationResult, options: ValueLossCalcPanelOptions = {}): string {
  const meta = STATUS_META[result.status];
  const saved = options.savedSnapshot;
  return `<div class="vl-block vl-calc-panel">
    <div class="vl-draft-head">
      <h5 class="vl-cat-title">Reel Piyasa Analiz Ön Hesabı</h5>
      <div class="vl-draft-actions">
        <button class="secondary compact" data-action="aih-vl-calc-refresh">Ön Hesabı Yenile</button>
        <button class="secondary compact" data-action="aih-vl-calc-copy">Hesap Gerekçesini Kopyala</button>
        <button class="secondary compact" data-action="aih-vl-snapshot-save">Ön Hesap Özetini Kaydet</button>
      </div>
    </div>
    ${renderSavedSnapshots(saved, options.savedHistory ?? [], options.freshness, options.historyFreshness)}
    <div class="app-alert ${meta.cls} vl-calc-status">${icon(result.status === 'calculated' ? 'check' : 'warning')}<span><b>${escapeHtml(meta.label)}</b></span></div>
    ${renderMissingQuickSummary(result)}
    ${renderAmounts(result)}
    <div class="vl-calc-source">Katsayı kaynağı: <b>${escapeHtml(result.coefficientSource)}</b></div>
    ${result.missingInputs.length ? `<div class="vl-calc-missing"><b>Eksik girdiler (${result.missingInputs.length}):</b><ul>${result.missingInputs.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : ''}
    ${result.warnings.length ? `<ul class="vl-warnings">${result.warnings.map((w) => `<li>⚠ ${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
    ${result.factors.length ? `<div class="vl-calc-table-wrap"><table class="vl-calc-table">
      <thead><tr><th>Faktör</th><th>Girdi</th><th>Katsayı</th><th>Etki</th><th>Açıklama</th></tr></thead>
      <tbody>${result.factors.map(renderFactorRow).join('')}</tbody>
    </table></div>` : ''}
    ${result.evidence.length ? `<details class="vl-calc-evidence"><summary>Dayanaklar (${result.evidence.length})</summary><ul>${result.evidence.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></details>` : ''}
    ${renderCopyFallback(result, options.copyError ?? '')}
    ${renderCoefficientMetadata()}
    <div class="app-alert info vl-calc-disclaimer">${icon('info')}<span>${escapeHtml(result.disclaimer)}</span></div>
  </div>`;
}
