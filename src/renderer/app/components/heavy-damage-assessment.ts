import type { CaseIndexItem } from '../../../shared/types';
import type { UiState } from '../state';
import type { HeavyDamageAssessmentRecord, HeavyDamageAssessmentRow } from '../../../shared/heavy-damage-types';
import {
  HEAVY_DAMAGE_FILTERS,
  applyHeavyDamageEdits,
  generateHeavyDamageAssessmentMailDraft,
  generateHeavyDamageAssessmentNote,
  heavyDamageFilterMatches,
  heavyDamageGuideOptions,
  type HeavyDamageFilter
} from '../../../shared/heavy-damage-rules';
import { escapeHtml } from '../validation';
import { icon } from '../icons';

const FILTER_LABELS: Record<HeavyDamageFilter, string> = {
  all: 'Tüm satırlar',
  scored: 'Puanlanan kritik parçalar',
  review: 'Kontrol gerekli',
  low: 'Düşük güven',
  threshold: '35 eşiğine etki eden',
  out: 'Kapsam dışı',
  change: 'Değişim',
  'repair-light': 'Onarım hafif',
  'repair-medium': 'Onarım orta',
  'repair-heavy': 'Onarım ağır'
};

export function renderHeavyDamageAssessment(item: CaseIndexItem, state: UiState): string {
  const saved = item.tracking.heavyDamageAssessment ?? null;
  const preview = state.heavyDamagePreview
    ? applyHeavyDamageEdits(state.heavyDamagePreview, state.heavyDamageEdits, state.heavyDamageUserNotes, state.heavyDamagePreview.assessedAt)
    : null;
  return `<div class="heavy-damage-workspace">
    <div class="info-card wide heavy-damage-intro">
      <div class="heavy-damage-title">
        <div>
          <h3>${icon('warning')} Ağır Hasar AI Ön Değerlendirme</h3>
          <p>Yapısal kritik parça rehberine göre puanlamalı, açıklanabilir ve eksper onaylı ön kontrol.</p>
        </div>
        <span class="status-chip warning">Karar destek</span>
      </div>
      <div class="app-alert warning">${icon('warning')}<span>Bu değerlendirme yapay zekâ destekli ön kontroldür. Nihai ağır hasar kararı eksper onayı ve dosya içeriği değerlendirmesiyle verilmelidir.</span></div>
      <div class="heavy-damage-input-grid">
        <label class="wide">Manuel parça / hasar girdisi
          <textarea id="heavy-damage-manual" rows="4" placeholder="Örn: Sağ ön şasi kolu değişim&#10;Ön göğüs sacı değişim&#10;Airbag değişim">${escapeHtml(state.heavyDamageManualText)}</textarea>
        </label>
        <label>Hasar tutarı
          <input id="heavy-damage-repair-cost" type="number" min="0" step="100" value="${escapeHtml(state.heavyDamageRepairCost)}" placeholder="TL" />
        </label>
        <label>Rayiç bedel
          <input id="heavy-damage-market-value" type="number" min="0" step="100" value="${escapeHtml(state.heavyDamageMarketValue)}" placeholder="TL" />
        </label>
      </div>
      <div class="heavy-damage-actions">
        <button class="primary" data-action="heavy-damage-preview" ${state.heavyDamageSaving ? 'disabled' : ''}>${icon('check')}<span>Ön Değerlendirme Başlat</span></button>
        ${state.heavyDamagePreview ? `<button class="secondary" data-action="heavy-damage-reset">Önizlemeyi Temizle</button>` : ''}
        ${saved ? `<button class="secondary danger" data-action="heavy-damage-clear">Kayıtlı Değerlendirmeyi Temizle</button>` : ''}
      </div>
      ${state.heavyDamageReport ? `<div class="app-alert info"><span>${escapeHtml(state.heavyDamageReport)}</span></div>` : ''}
    </div>
    ${saved && !state.heavyDamagePreview ? renderSavedAssessment(saved) : ''}
    ${preview ? renderAssessmentPreview(preview, state) : saved ? '' : '<div class="empty-state panel-empty"><h3>Henüz ön değerlendirme yok</h3><p>Dosya notları ve manuel girişlerden kritik yapısal parça adayları analiz edilir; kaydetmeden önce son onay gerekir.</p></div>'}
    ${preview && state.heavyDamageConfirmOpen ? renderConfirmModal(preview, state) : ''}
  </div>`;
}

function renderSavedAssessment(assessment: HeavyDamageAssessmentRecord): string {
  return `<div class="info-card wide heavy-damage-saved">
    <h3>Kayıtlı Ön Değerlendirme</h3>
    <div class="heavy-summary-cards">
      <span><small>Toplam puan</small><b>${assessment.summary.totalScore}</b></span>
      <span><small>Sonuç</small><b>${escapeHtml(assessment.summary.riskLabel)}</b></span>
      <span><small>Onaylayan</small><b>${escapeHtml(assessment.assessedBy)}</b></span>
      <span><small>Tarih</small><b>${escapeHtml(new Date(assessment.assessedAt).toLocaleString('tr-TR'))}</b></span>
    </div>
    <p class="muted">${escapeHtml(generateHeavyDamageAssessmentNote(assessment))}</p>
  </div>`;
}

function renderAssessmentPreview(assessment: HeavyDamageAssessmentRecord, state: UiState): string {
  const rows = assessment.rows.filter((row) => heavyDamageFilterMatches(row, state.heavyDamageFilter));
  return `<div class="info-card wide heavy-damage-preview-card">
    <div class="heavy-preview-header">
      <div>
        <h3>Yapısal Kritik Parça Değerlendirme</h3>
        <p>${escapeHtml(assessment.officeFileNo || '-')} • ${escapeHtml(assessment.plate || '-')} • ${assessment.rows.length} satır</p>
      </div>
      <span class="status-chip ${assessment.summary.thresholdExceeded ? 'error' : assessment.summary.riskLevel === 'review' ? 'warning' : 'ok'}">${escapeHtml(assessment.summary.riskLabel)}</span>
    </div>
    ${renderSummary(assessment)}
    ${renderFilters(state, assessment)}
    <div class="heavy-damage-table-wrap">
      <div class="heavy-damage-table">
        <div class="heavy-damage-row header"><b>Parça</b><b>Rehber</b><b>Hasar</b><b>Puan</b><b>Güven</b><b>Kontrol</b><b>Gerekçe</b></div>
        ${rows.map(renderAssessmentRow).join('') || '<div class="heavy-damage-empty">Bu filtrede satır yok.</div>'}
      </div>
    </div>
    <label class="wide heavy-damage-user-note">Kullanıcı / eksper notu
      <textarea id="heavy-damage-user-notes" rows="3">${escapeHtml(state.heavyDamageUserNotes)}</textarea>
    </label>
    <div class="heavy-note-preview">
      <b>Rapor notu önizlemesi</b>
      <p>${escapeHtml(generateHeavyDamageAssessmentNote(assessment))}</p>
    </div>
    <details class="heavy-note-preview">
      <summary>Mail taslağı</summary>
      <pre>${escapeHtml(generateHeavyDamageAssessmentMailDraft(assessment))}</pre>
    </details>
    <div class="heavy-damage-actions">
      <button class="primary" data-action="heavy-damage-save" ${state.heavyDamageSaving ? 'disabled' : ''}>${icon('check')}<span>Değerlendirmeyi Kaydet</span></button>
      <span class="muted">Son onay modalı açılmadan takip.json içine yazılmaz.</span>
    </div>
  </div>`;
}

function renderSummary(assessment: HeavyDamageAssessmentRecord): string {
  const s = assessment.summary;
  const ratio = s.repairToMarketRatio === undefined ? '-' : `%${s.repairToMarketRatio}`;
  const cards = [
    ['Toplam kritik parça puanı', String(s.totalScore)],
    ['Kritik parça sayısı', String(s.criticalPartCount)],
    ['35 puan eşiği', s.thresholdExceeded ? 'Aşıldı' : 'Aşılmadı'],
    ['Rayiç bedel', moneyOrDash(s.marketValue)],
    ['Hasar tutarı', moneyOrDash(s.repairCost)],
    ['Hasar / rayiç', ratio],
    ['%60 ekonomik eşik', s.economicThresholdExceeded ? 'Aşıldı' : 'Aşılmadı'],
    ['Kontrol gerekli', String(s.needsReviewRows)],
    ['Düşük güven', String(s.lowConfidenceRows)]
  ];
  return `<div class="heavy-summary-cards">${cards.map(([label, value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('')}</div>
    <div class="app-alert ${!s.economicThresholdExceeded && s.thresholdExceeded ? 'warning' : 'info'}">${icon('info')}<span>${escapeHtml(!s.economicThresholdExceeded && s.thresholdExceeded ? `Ekonomik eşik aşılmadı ancak yapısal kritik parça eşiği aşıldı. ${s.aiSummary}` : s.aiSummary)}</span></div>`;
}

function renderFilters(state: UiState, assessment: HeavyDamageAssessmentRecord): string {
  const counts = Object.fromEntries(HEAVY_DAMAGE_FILTERS.map((filter) => [filter, assessment.rows.filter((row) => heavyDamageFilterMatches(row, filter)).length])) as Record<HeavyDamageFilter, number>;
  return `<div class="heavy-filter-bar">${HEAVY_DAMAGE_FILTERS.map((filter) => `<button class="auto-labor-filter-button ${state.heavyDamageFilter === filter ? 'active' : ''}" data-action="heavy-damage-filter" data-heavy-damage-filter="${filter}">${escapeHtml(FILTER_LABELS[filter])} <b>${counts[filter]}</b></button>`).join('')}</div>`;
}

function renderAssessmentRow(row: HeavyDamageAssessmentRow): string {
  const guideOptions = heavyDamageGuideOptions().map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === row.guideCategory ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
  const structuralToggle = row.guideCategory === 'firewall' || row.structuralConfirmationRequired
    ? `<label class="auto-labor-mini-check structural-confirm"><input type="checkbox" data-heavy-row-structural="${escapeHtml(row.id)}" ${row.structuralConfirmed ? 'checked' : ''}/> <small>Yapısal sac/firewall teyit edildi</small></label>`
    : '';
  return `<div class="heavy-damage-row ${row.needsReview ? 'needs-review' : ''} ${row.confidence === 'Düşük' ? 'low-confidence' : ''} ${row.userEdited ? 'user-edited' : ''}">
    <div><b>${escapeHtml(row.sourcePartName)}</b><small>${escapeHtml(row.normalizedPartName)} • ${escapeHtml(sourceLabel(row.source))}</small>${row.userEdited ? '<small class="part-ok">kullanıcı tarafından düzeltildi</small>' : ''}</div>
    <label><select data-heavy-row-category="${escapeHtml(row.id)}">${guideOptions}</select></label>
    <div class="heavy-inline-controls">
      <select data-heavy-row-damage="${escapeHtml(row.id)}">${damageOptions(row.damageType)}</select>
      <select data-heavy-row-severity="${escapeHtml(row.id)}">${severityOptions(row.repairSeverity)}</select>
    </div>
    <label><input type="number" min="0" step="0.5" data-heavy-row-score="${escapeHtml(row.id)}" value="${row.score}" /></label>
    <span><span class="status-chip ${row.confidence === 'Yüksek' ? 'ok' : row.confidence === 'Orta' ? 'warning' : 'error'}">${escapeHtml(row.confidence)}</span></span>
    <label class="auto-labor-mini-check"><input type="checkbox" data-heavy-row-review="${escapeHtml(row.id)}" ${row.needsReview ? 'checked' : ''}/> <small>Kontrol</small></label>
    <details class="auto-labor-reason" data-default-closed="true">
      <summary>Gerekçe / sorular</summary>
      <small>${escapeHtml(row.reason)}</small>
      ${structuralToggle}
      ${row.questions.length ? `<ul>${row.questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>` : ''}
      <textarea data-heavy-row-note="${escapeHtml(row.id)}" rows="2" placeholder="Eksper notu">${escapeHtml(row.userNote ?? '')}</textarea>
    </details>
  </div>`;
}

function renderConfirmModal(assessment: HeavyDamageAssessmentRecord, state: UiState): string {
  const s = assessment.summary;
  return `<div class="conflict-overlay heavy-confirm-overlay" role="dialog" aria-modal="true">
    <div class="conflict-card heavy-confirm-card">
      <h2>Kaydetmeden Önce Son Kontrol</h2>
      <div class="app-alert warning">${icon('warning')}<span>Bu sonuç eksper onayı olmadan nihai karar değildir.</span></div>
      <div class="auto-labor-confirm-grid">
        <span><small>Toplam puan</small><b>${s.totalScore}</b></span>
        <span><small>35 eşik durumu</small><b>${escapeHtml(s.riskLabel)}</b></span>
        <span><small>Hasar / rayiç</small><b>${s.repairToMarketRatio === undefined ? '-' : `%${s.repairToMarketRatio}`}</b></span>
        <span><small>Kontrol gerekli</small><b>${s.needsReviewRows}</b></span>
        <span><small>Düşük güven</small><b>${s.lowConfidenceRows}</b></span>
        <span><small>Kullanıcı düzeltmesi</small><b>${assessment.rows.filter((row) => row.userEdited).length}</b></span>
      </div>
      <div class="heavy-note-preview"><b>Rapor notu</b><p>${escapeHtml(generateHeavyDamageAssessmentNote(assessment))}</p></div>
      <div class="conflict-actions">
        <button class="secondary" data-action="heavy-damage-confirm-back">Geri dön ve düzenle</button>
        <button class="primary" data-action="heavy-damage-save-confirm" ${state.heavyDamageSaving ? 'disabled' : ''}>${state.heavyDamageSaving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        <button class="secondary" data-action="heavy-damage-save-cancel">İptal</button>
      </div>
    </div>
  </div>`;
}

function damageOptions(selected: string): string {
  return [['change', 'Değişim'], ['repair', 'Onarım'], ['unknown', 'Bilinmiyor']]
    .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function severityOptions(selected: string): string {
  return [['none', '-'], ['light', 'Hafif'], ['medium', 'Orta'], ['heavy', 'Ağır'], ['unknown', 'Bilinmiyor']]
    .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function sourceLabel(source: string): string {
  if (source === 'manual') return 'manuel';
  if (source === 'tracking-note') return 'dosya notu';
  if (source === 'labor-note') return 'işçilik notu';
  if (source === 'heavy-note') return 'ağır hasar notu';
  if (source === 'legacy-note') return 'eski not';
  if (source === 'folder') return 'klasör';
  return 'sistem';
}

function moneyOrDash(value?: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value ?? 0) : '-';
}
