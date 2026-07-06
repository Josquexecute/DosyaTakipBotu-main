import { escapeHtml } from '../validation';
import { icon } from '../icons';
import type { AiCaseContext } from '../selectors/ai-case-context';

// v0.6.x: "Seçili Dosya Bağlamı" kartı — SALT-OKUNUR. AiCaseContext'i özetler; yazma yok.

function tri(value: boolean | null): string {
  if (value === true) return 'Evet';
  if (value === false) return 'Hayır';
  return 'Bulunamadı';
}

function money(value: number | null): string {
  return value === null ? 'Bulunamadı' : value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function claimLabel(ctx: AiCaseContext): string {
  if (ctx.sigortaTuru === 'trafik') return 'Trafik / ZMSS';
  if (ctx.sigortaTuru === 'kasko') return 'Kasko';
  if (ctx.sigortaTuru === 'ihtiyari-mali-sorumluluk') return 'İhtiyari Mali Sorumluluk';
  return 'Belirsiz (kontrol gerekli)';
}

const CONF_LABEL: Record<string, string> = { yuksek: 'Yüksek', orta: 'Orta', dusuk: 'Düşük' };

// v0.6.4 RC1 P2: manuel seçim yokken kart "önizleme" olarak etiketlenir (davranış aynı; yalnız metin).
export function renderAiCaseContextCard(ctx: AiCaseContext | null, options: { previewOnly?: boolean } = {}): string {
  if (!ctx) {
    return `<div class="aih-context-card empty">${icon('info')}<span>Dosya seçilmedi. Yardımcılar genel modda çalışıyor; alanları elle girebilirsiniz.</span></div>`;
  }
  const cells: Array<[string, string]> = [
    ['Plaka', ctx.plate || 'Bulunamadı'],
    ['Dosya No', ctx.officeFileNo || 'Bulunamadı'],
    ['İhbar Föyü No', ctx.noticeFileNo || 'Bulunamadı'],
    ['Dosya türü', claimLabel(ctx)],
    ['Servis', ctx.serviceName || 'Bulunamadı'],
    ['Sorumlu', ctx.responsible || 'Bulunamadı'],
    ['Durum', ctx.status || 'Bulunamadı'],
    ['Hasar tutarı', money(ctx.grossDamageAmount)],
    ['Rayiç bedel', money(ctx.marketValue)],
    ['Ağır/Tam hasar', `${tri(ctx.isHeavyDamage)}${ctx.isTotalLoss === true ? ' (tam hasar)' : ''}`],
    ['Değer kaybı', tri(ctx.hasValueLoss)]
  ];
  const headTitle = options.previewOnly === true ? 'Dosya Bağlamı Önizlemesi' : 'Seçili Dosya Bağlamı';
  const previewNote = options.previewOnly === true
    ? `<p class="muted aih-context-preview-note">Bu alan otomatik bağlam önerisidir. İşlem yapmak için Dosyalar ekranından dosyayı seçin.</p>`
    : '';
  return `<div class="aih-context-card">
    <div class="aih-context-head">${icon('folder')}<b>${headTitle}</b><span class="aih-conf aih-conf-${escapeHtml(ctx.sourceConfidence)}">Güven: ${escapeHtml(CONF_LABEL[ctx.sourceConfidence] ?? ctx.sourceConfidence)}</span></div>
    ${previewNote}
    <div class="aih-context-grid">
      ${cells.map(([k, v]) => `<div class="aih-context-cell"><small>${escapeHtml(k)}</small><span>${escapeHtml(v)}</span></div>`).join('')}
    </div>
    ${ctx.missingDocuments.length ? `<div class="app-alert warning aih-context-missing">${icon('warning')}<span><b>Eksik evrak:</b> ${escapeHtml(ctx.missingDocuments.join(', '))}</span></div>` : ''}
    ${ctx.warnings.length ? `<p class="muted aih-context-warn">${icon('info')} ${escapeHtml(ctx.warnings.join(' '))}</p>` : ''}
    <p class="muted aih-context-note">Bu bilgiler dosyadan salt-okunur alınır; yardımcı/kontrol amaçlıdır ve hiçbir dosyaya yazılmaz.</p>
  </div>`;
}
