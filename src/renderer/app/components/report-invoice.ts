import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import type { ComplianceVerdict, ReportInvoiceComplianceResult, ReportInvoicePdfPick } from '../../../shared/report-invoice/report-invoice-types';

// v0.6.3: Rapor / Fatura Uyum Kontrolü paneli. Standalone araç (dosya seçimi gerektirmez).
// Sonuç yalnız gösterilir; takip.json/Excel/Bilgi Bankası/User Store'a yazılmaz. Tam dosya yolu gösterilmez.
export function renderReportInvoicePanel(state: UiState): string {
  const hasKey = Boolean(state.settings?.geminiApiKey);
  const report = state.reportInvoiceReportPick;
  const invoice = state.reportInvoiceInvoicePick;
  const result = state.reportInvoiceResult;
  const loading = state.reportInvoiceLoading;
  const canRun = !loading;
  return `<div class="info-card wide report-invoice-card">
    <h3>${icon('document')} Rapor / Fatura Uyum Kontrolü</h3>
    <p class="settings-help">Ekspertiz raporu PDF'i ile e-fatura PDF'ini AI bilirkişi gibi karşılaştırır. Sonuç yalnız gösterilir; takip.json veya Excel'e yazılmaz.</p>
    <div class="app-alert info">${icon('info')}<span>Bu kontrolde rapor ve fatura içeriği AI servisine gönderilebilir. Tam dosya yolu gönderilmez.</span></div>
    ${hasKey ? '' : `<div class="app-alert warning">${icon('warning')}<span>Gemini API anahtarı yok. Ayarlar → "AI / Parça Okuma" bölümünden ekleyin.</span></div>`}
    <div class="report-invoice-picks">
      ${renderPickRow('report-invoice-choose-report', 'Rapor PDF seç', report, state)}
      ${renderPickRow('report-invoice-choose-invoice', 'Fatura PDF seç', invoice, state)}
    </div>
    <div class="report-invoice-actions">
      <button class="primary" data-action="report-invoice-run" ${canRun ? '' : 'disabled'}>${icon('ai')}<span>${loading ? 'AI kontrol ediyor…' : 'AI ile Kontrol Et'}</span></button>
      <button class="secondary" data-action="report-invoice-test-ai" ${state.reportInvoiceAiTesting || loading ? 'disabled' : ''}>${icon('ai')}<span>${state.reportInvoiceAiTesting ? 'AI bağlantısı test ediliyor…' : 'AI Bağlantısını Test Et'}</span></button>
      ${report || invoice || result ? '<button class="secondary compact" data-action="report-invoice-clear">Temizle</button>' : ''}
    </div>
    ${renderAiTestResult(state)}
    ${loading ? `<div class="app-alert info" role="status" aria-live="polite">${icon('sync')}<span>Rapor ve fatura AI ile karşılaştırılıyor…</span></div>` : ''}
    ${state.reportInvoiceError && !loading ? `<div class="app-alert warning" role="status" aria-live="polite">${icon('warning')}<span>${escapeHtml(state.reportInvoiceError)}</span><button class="secondary compact" data-action="report-invoice-run">${icon('sync')}<span>Tekrar Dene</span></button></div>` : ''}
    ${result ? renderComplianceResult(result) : (report || invoice || loading ? '' : '<p class="muted">Önce rapor ve fatura PDF dosyalarını seçin, ardından "AI ile Kontrol Et" deyin.</p>')}
  </div>`;
}

function renderPickRow(action: string, label: string, pick: ReportInvoicePdfPick | null, state: UiState): string {
  const busy = state.reportInvoiceLoading || state.reportInvoicePicking !== '';
  return `<div class="report-invoice-pick">
    <button class="secondary" data-action="${escapeHtml(action)}" ${busy ? 'disabled' : ''}>${icon('upload')}<span>${escapeHtml(label)}</span></button>
    ${renderPickStatus(pick)}
  </div>`;
}

function renderPickStatus(pick: ReportInvoicePdfPick | null): string {
  if (!pick) return '<span class="muted">Seçilmedi</span>';
  // v0.6.3: Taranmış/görsel PDF — yalnız dosya ADI gösterilir, tam yol gösterilmez; metin AI'ya gitmez.
  if (pick.scanned) {
    return `<span class="report-invoice-file scanned"><b>${escapeHtml(pick.fileName)}</b><small>Metin okunamadı — taranmış/görsel olabilir, manuel kontrol gerekli.</small></span>`;
  }
  return `<span class="report-invoice-file"><b>${escapeHtml(pick.fileName)}</b><small>${pick.charCount} karakter${pick.truncated ? ' (kısaltıldı)' : ''}</small></span>`;
}

function renderAiTestResult(state: UiState): string {
  const test = state.reportInvoiceAiTestResult;
  if (!test || state.reportInvoiceAiTesting) return '';
  const tone = test.ok ? 'success' : 'warning';
  return `<div class="app-alert ${tone}" role="status" aria-live="polite">${icon(test.ok ? 'check' : 'warning')}<span>${escapeHtml(test.message)}</span></div>`;
}

function verdictTone(verdict: ComplianceVerdict): string {
  switch (verdict) {
    case 'Uyumlu': return 'ok';
    case 'Uyumsuz': return 'error';
    case 'Kısmen uyumlu': return 'warning';
    default: return 'info';
  }
}

function renderComplianceResult(result: ReportInvoiceComplianceResult): string {
  return `<div class="report-invoice-result">
    <div class="report-invoice-verdict"><span class="status-chip ${verdictTone(result.overall)}">${escapeHtml(result.overall)}</span><p>${escapeHtml(result.summary)}</p></div>
    ${result.amountComparison.length ? `<div class="report-invoice-block">
      <h4>Tutar Karşılaştırması</h4>
      <div class="report-invoice-amounts"><div class="ri-amount-head"><b>Kalem</b><b>Rapor</b><b>Fatura</b><b>Not</b></div>${result.amountComparison.map((row) => `<div class="ri-amount-row"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.report || '-')}</span><span>${escapeHtml(row.invoice || '-')}</span><span>${escapeHtml(row.note ?? '-')}</span></div>`).join('')}</div>
    </div>` : ''}
    ${renderList('Farklar', result.differences)}
    ${renderList('Parça Farkları', result.partComparison)}
    ${renderList('İşçilik Farkları', result.laborComparison)}
    ${result.valueGainCheck ? `<div class="report-invoice-block"><h4>Kıymet Kazanma Kontrolü</h4><p>${escapeHtml(result.valueGainCheck)}</p></div>` : ''}
    ${result.withholdingNote ? `<div class="report-invoice-block"><h4>Tevkifat Yorumu</h4><p>${escapeHtml(result.withholdingNote)}</p></div>` : ''}
    ${result.recommendation ? `<div class="app-alert info">${icon('info')}<span><b>Önerilen işlem:</b> ${escapeHtml(result.recommendation)}</span></div>` : ''}
    ${result.warnings.length ? `<div class="app-alert warning">${icon('warning')}<span>${escapeHtml(result.warnings.join(' • '))}</span></div>` : ''}
    <p class="muted">Bu değerlendirme AI destekli ön kontroldür; nihai karar eksper onayına tabidir. Sonuç hiçbir dosyaya kalıcı yazılmaz.</p>
  </div>`;
}

function renderList(title: string, items: readonly string[]): string {
  if (!items.length) return '';
  return `<div class="report-invoice-block"><h4>${escapeHtml(title)}</h4><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
}
