/**
 * v0.6.x — AI İşçilik v3.8: "D Sütununa Yaz" butonu + onay modalı metni + son işlem raporu (renderer).
 * Yalnız kullanıcı açık onayıyla D sütununa yazma başlatır; buton uyarılı görünür, low/farklı kodda ekstra uyarı.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import type { AutoLaborRowPreview } from '../../../shared/types';

const CONF_TR: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
const STATUS_TR: Record<string, string> = { same: 'aynı', different: 'FARKLI', missing_existing: 'mevcut D boş', missing_candidate: 'aday kod yok' };

/** Satırda yazılabilir AI Mode adayı varsa "D Sütununa Yaz" butonunu döner (aksi halde boş). */
export function renderAiModeApplyButton(state: UiState, row: AutoLaborRowPreview): string {
  const cand = row.aiModeCandidate;
  const preview = state.autoLaborPreview;
  if (!cand || !cand.candidatePartCode || !preview?.partCodeColumn) return '';
  const badges = [
    cand.status === 'different' ? '<span class="ai-mode-apply-diff-badge">Farklı D kodu</span>' : '',
    cand.confidence === 'low' ? '<span class="ai-mode-apply-warn">düşük güven</span>' : ''
  ].filter(Boolean).join(' ');
  return `<div class="ai-mode-apply"><button class="secondary compact warning" data-action="aimode-apply-d" data-row="${row.rowNumber}">Parça Kodunu D Sütununa Onayla ve Yaz</button> ${badges}</div>`;
}

/** Onay modalı için çok satırlı Türkçe metin üretir (yazma öncesi net bilgi + uyarılar). */
export function buildApplyConfirmMessage(state: UiState, row: AutoLaborRowPreview): string {
  const preview = state.autoLaborPreview;
  const cand = row.aiModeCandidate;
  const v = preview?.vehicleContext ?? {};
  const warnings: string[] = [];
  if (cand?.status === 'different') warnings.push('• Mevcut D kodu farklı; üzerine yazılacak.');
  if (cand?.confidence === 'low') warnings.push('• Aday güveni düşük; kontrol gerekli.');
  if ((cand?.sourceCount ?? 0) === 0) warnings.push('• Aday için kaynak/link yok; kontrol gerekli.');
  const vehicle = [v.vehicleModel, v.modelYear ? String(v.modelYear) : '', v.chassisPrefix, v.engineCode].filter(Boolean).join(' / ');
  return [
    'Bu işlem yalnızca seçili satırın D sütununa parça kodu yazacaktır.',
    'Excel’deki mevcut D kodu değiştirilebilir. İşçilik tutarları (H-N) ve diğer kolonlar değiştirilmeyecektir.',
    '',
    `Dosya: ${preview?.fileName ?? '-'}`,
    `Satır: ${row.rowNumber} • Parça: ${row.partName} • Grup: ${row.group || '-'}`,
    `Mevcut D kodu: ${row.partCode || 'boş'}`,
    `Yazılacak aday kod: ${cand?.candidatePartCode ?? '-'}`,
    `Aday güveni: ${CONF_TR[cand?.confidence ?? 'low'] ?? '-'} • Karşılaştırma: ${STATUS_TR[cand?.status ?? 'missing_candidate'] ?? '-'} • Kaynak: ${cand?.sourceCount ?? 0}`,
    vehicle ? `Araç: ${vehicle}` : 'Araç: (bilinmiyor)',
    warnings.length ? '' : '',
    warnings.length ? 'Uyarılar:' : '',
    ...warnings,
    '',
    'Devam etmek için açık onayınız gereklidir.'
  ].filter((l) => l !== undefined).join('\n');
}

/** Son D sütunu yazma raporunu döner (yoksa boş) — v3.9: doğrulama + yedek yolu + geri alma bilgisi. */
export function renderAiModeApplyResult(state: UiState): string {
  const r = state.aiModePartSearch.applyResult;
  if (!r) return '';
  const verify = r.verifiedAfterWrite
    ? `<div class="${r.verifiedAfterWrite.matchesWrittenCode ? 'ai-mode-verify-ok' : 'ai-mode-cand-warn'}">Yazma sonrası doğrulama: ${escapeHtml(r.verifiedAfterWrite.message)}</div>`
    : `<div class="ai-mode-cand-warn">Yazma sonrası satır yeniden doğrulanamadı. Excel dosyasını kapatıp yeniden analiz etmeniz önerilir.</div>`;
  const backup = r.backupPath ? `<div class="ai-mode-store-meta">Yedek dosya oluşturuldu: <code>${escapeHtml(r.backupPath)}</code></div>` : '<div class="ai-mode-cand-warn">Yedek alınamadı.</div>';
  const undo = state.aiModePartSearch.lastApplyUndo?.available
    ? `<div class="ai-mode-store-meta">Bu işlem geri alınabilir (aşağıdaki "Son D Kodu Yazımını Geri Al" düğmesi).</div>`
    : '';
  const warn = r.warnings.length ? `<div class="ai-mode-cand-warn">${r.warnings.map((w) => `⚠ ${escapeHtml(w)}`).join(' ')}</div>` : '';
  return `<div class="ai-mode-apply-result">
    <b>Son D sütunu işlemi</b>
    <div>Satır ${r.rowNumber} ${escapeHtml(r.column)} sütunu güncellendi:</div>
    <div class="ai-mode-store-meta">Eski kod: ${escapeHtml(r.oldPartCode || 'boş')} → Yeni kod: ${escapeHtml(r.newPartCode)}</div>
    ${verify}
    <div class="ai-mode-store-meta">İşçilik (H-N) ve diğer kolonlara dokunulmadı.</div>
    ${backup}
    ${undo}
    ${warn}
    <div class="ai-mode-store-meta">Değişikliği önizlemede görmek için "Excel Seç ve Otomatik Doldur" ile yeniden analiz etmeniz önerilir.</div>
  </div>`;
}
