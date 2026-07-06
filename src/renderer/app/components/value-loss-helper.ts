/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v1 paneli (SALT-OKUNUR / preview-first).
 *
 * Seçili dosya bağlamından türetir: 01.07.2026 sonrası trafik/ZMSS zorunluluk tespiti, kontrol listesi,
 * istisna uyarıları ve taslak önizlemesi. Hiçbir kalıcı dosyaya/Excel'e yazma, mail gönderimi veya
 * ağ isteği YOKTUR. Sonuçlar saf modüllerle render anında hesaplanır (state'te sonuç saklanmaz).
 */
import type { UiState } from '../state';
import { selectedCase } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import type { AiCaseContext } from '../selectors/ai-case-context';
import {
  evaluateValueLossRequirement,
  isDateOnOrAfterEffective,
  VALUE_LOSS_EFFECTIVE_DATE
} from '../../../shared/value-loss/value-loss-requirement-rules';
import type {
  ValueLossRequirementInput,
  ValueLossRequirementResult
} from '../../../shared/value-loss/value-loss-requirement-rules';
import {
  buildValueLossChecklist,
  summarizeValueLossChecklist,
  missingChecklistLabels
} from '../../../shared/value-loss/value-loss-checklist';
import type {
  ValueLossChecklistInput,
  ValueLossChecklistItem,
  ValueLossChecklistCategory
} from '../../../shared/value-loss/value-loss-checklist';
import { evaluateValueLossExclusions } from '../../../shared/value-loss/value-loss-exclusion-rules';
import type { ValueLossExclusionInput, ValueLossWarning } from '../../../shared/value-loss/value-loss-exclusion-rules';
import { buildValueLossDraft } from '../../../shared/value-loss/value-loss-draft-builder';
import type { ValueLossContext } from '../../../shared/value-loss/value-loss-context-types';
import { normalizeValueLossContext, hasMeaningfulValueLossContext } from '../../../shared/value-loss/value-loss-context-normalizer';
import {
  applyValueLossContextToRequirementInput,
  applyValueLossContextToChecklistInput,
  applyValueLossContextToExclusionInput,
  draftFactsFromValueLossContext
} from '../../../shared/value-loss/value-loss-context-apply';
import { valueLossFormToInput } from '../utils/value-loss-form-mapping';
import { evaluateCabrioGuidance } from '../../../shared/value-loss/value-loss-cabrio-guidance';
import { evaluateSnapshotFreshness, evaluateHistoryFreshnessSummary } from '../../../shared/value-loss/value-loss-snapshot-freshness';
import { renderValueLossContextForm } from './value-loss-context-form';
import { calculateValueLoss } from '../../../shared/value-loss/value-loss-calculation-engine';
import { getActiveValueLossCoefficientProvider } from '../../../shared/value-loss/value-loss-coefficients';
import { renderValueLossCalculationPanel } from './value-loss-calculation-panel';

const STATUS_META: Record<ValueLossRequirementResult['status'], { label: string; cls: string; ic: string }> = {
  required: { label: 'Zorunlu', cls: 'warning', ic: 'warning' },
  control_needed: { label: 'Kontrol gerekli', cls: 'warning', ic: 'warning' },
  not_required: { label: 'Gerekli değil', cls: 'info', ic: 'info' },
  unknown: { label: 'Bilinmiyor', cls: 'info', ic: 'info' }
};

const ITEM_META: Record<ValueLossChecklistItem['status'], { sym: string; cls: string; tr: string }> = {
  ok: { sym: '✓', cls: 'vl-ok', tr: 'tamam' },
  missing: { sym: '✗', cls: 'vl-missing', tr: 'eksik' },
  control_needed: { sym: '⚠', cls: 'vl-control', tr: 'kontrol' },
  not_applicable: { sym: '–', cls: 'vl-na', tr: 'uygulanmaz' }
};

const DRAFTS: ReadonlyArray<{ kind: 'internal_note' | 'report_explanation' | 'missing_info_mail'; label: string }> = [
  { kind: 'internal_note', label: 'İç not taslağı' },
  { kind: 'report_explanation', label: 'Rapor açıklama taslağı' },
  { kind: 'missing_info_mail', label: 'Eksik bilgi mail taslağı' }
];

function toRequirementInput(ctx: AiCaseContext): ValueLossRequirementInput {
  return {
    sigortaTuru: ctx.sigortaTuru,
    assignmentDate: ctx.appointmentDate || null,
    isHeavyDamage: ctx.isHeavyDamage,
    isTotalLoss: ctx.isTotalLoss,
    hasMarketReference: typeof ctx.marketValue === 'number' && ctx.marketValue > 0 ? true : null
  };
}

function toChecklistInput(ctx: AiCaseContext): ValueLossChecklistInput {
  const isTrafik = ctx.sigortaTuru === 'trafik' || ctx.sigortaTuru === 'ihtiyari-mali-sorumluluk';
  return {
    isTrafikOrZmss: ctx.sigortaTuru === null ? null : isTrafik,
    assignmentAfterEffective: isDateOnOrAfterEffective(ctx.appointmentDate),
    marketValue: ctx.marketValue,
    vehicleGroup: ctx.vehicleGroup
    // Diğer alanlar v1'de dosyadan otomatik gelmez → kontrol listesi 'eksik'/'kontrol' işaretler (uydurma yok).
  };
}

function toExclusionInput(ctx: AiCaseContext): ValueLossExclusionInput {
  return { isHeavyDamage: ctx.isHeavyDamage, isTotalLoss: ctx.isTotalLoss };
}

function renderReasons(result: ValueLossRequirementResult): string {
  const reasons = result.reasons.length
    ? `<ul class="vl-reasons">${result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
    : '';
  const warnings = result.warnings.length
    ? `<ul class="vl-warnings">${result.warnings.map((w) => `<li>⚠ ${escapeHtml(w)}</li>`).join('')}</ul>`
    : '';
  return reasons + warnings;
}

function renderChecklistItem(item: ValueLossChecklistItem): string {
  const meta = ITEM_META[item.status];
  const reason = item.reason ? `<small class="vl-item-reason">${escapeHtml(item.reason)}</small>` : '';
  return `<li class="vl-item ${meta.cls} sev-${item.severity}">
    <span class="vl-item-sym" title="${meta.tr}">${meta.sym}</span>
    <span class="vl-item-body"><span class="vl-item-label">${escapeHtml(item.label)}</span>${reason}</span>
  </li>`;
}

function renderChecklistCategory(cat: ValueLossChecklistCategory): string {
  return `<div class="vl-cat">
    <h5 class="vl-cat-title">${escapeHtml(cat.title)}</h5>
    <ul class="vl-item-list">${cat.items.map(renderChecklistItem).join('')}</ul>
  </div>`;
}

function renderExclusions(warnings: readonly ValueLossWarning[]): string {
  if (!warnings.length) return '';
  return `<div class="vl-block">
    <h5 class="vl-cat-title">İstisna / uyarı kontrolleri</h5>
    <ul class="vl-warn-list">
      ${warnings.map((w) => `<li class="vl-warn lvl-${w.level}">${escapeHtml(w.message)}</li>`).join('')}
    </ul>
  </div>`;
}

function renderDraftPreview(state: UiState, categories: readonly ValueLossChecklistCategory[], vl: ValueLossContext | null, calculationPossible: boolean): string {
  const kind = state.aiHelpers.valueLoss.activeDraft;
  if (!kind) return '';
  const missing = kind === 'missing_info_mail' ? missingChecklistLabels(categories) : undefined;
  // v3: ön hesap 'calculated' ise rapor açıklamasına yalnız NİTELİK cümlesi eklenir; tutar taslağa girmez.
  const facts = { ...draftFactsFromValueLossContext(vl), ...(calculationPossible ? { calculationPossible: true } : {}) };
  const draft = buildValueLossDraft(kind, missing, facts);
  return `<div class="vl-draft-preview">
    <div class="vl-draft-head"><b>${escapeHtml(draft.title)}</b>
      <button class="secondary compact" data-action="aih-vl-draft-clear">Kapat</button></div>
    <p class="muted">Aşağıdaki metni seçip kopyalayın (Ctrl+C). Otomatik gönderim/kaydetme yapılmaz.</p>
    <textarea id="vl-draft-preview" class="vl-draft-text" rows="8" readonly>${escapeHtml(draft.body)}</textarea>
  </div>`;
}

/** AI Değer Kaybı Yardımcısı bölümünü döner. Dosya seçili değilse bilgilendirme gösterir. */
export function renderValueLossHelper(state: UiState, ctx: AiCaseContext | null): string {
  if (!ctx) {
    return `<div class="aih-panel vl-panel">
      <p class="settings-help">AI Değer Kaybı Yardımcısı için önce bir dosya seçin. 01.07.2026 sonrası trafik/ZMSS dosyalarında hasar tespitiyle birlikte değer kaybı kontrolü de değerlendirilir.</p>
    </div>`;
  }

  // v2: Ek Bilgi Formu verisi (kayıtlıdan/bağlamdan kurulmuş + geçici düzenlemeler) değerlendirmeyi
  // YAZMADAN güçlendirir. Öncelik: form > dosya bağlamı > bilinmiyor. Anlamlı veri yoksa yalnız bağlam.
  const formCandidate = normalizeValueLossContext(valueLossFormToInput(state.aiHelpers.vlForm, state.aiHelpers.vlParts));
  const savedVl = selectedCase()?.tracking?.aiHelperContext?.valueLoss ?? null;
  const vl = hasMeaningfulValueLossContext(formCandidate) ? formCandidate : savedVl;

  const requirement = evaluateValueLossRequirement(applyValueLossContextToRequirementInput(vl, toRequirementInput(ctx)));
  const categories = buildValueLossChecklist(applyValueLossContextToChecklistInput(vl, toChecklistInput(ctx)));
  const summary = summarizeValueLossChecklist(categories);
  // v6: cabrio/özel satır yönlendirmesi istisna listesine EKLENİR (hesap davranışı değişmez).
  const exclusions = [
    ...evaluateValueLossExclusions(applyValueLossContextToExclusionInput(vl, toExclusionInput(ctx))),
    ...evaluateCabrioGuidance(vl)
  ];
  // v3: Reel piyasa analiz ön hesabı (preview-only; yapılandırılmış parça verisi olmadan tutar üretmez).
  const calcResult = calculateValueLoss(vl, getActiveValueLossCoefficientProvider());
  const meta = STATUS_META[requirement.status];
  const active = state.aiHelpers.valueLoss.activeDraft;

  return `<div class="aih-panel vl-panel">
    <p class="settings-help">Bu yardımcı, seçili dosyayı değer kaybı yönünden değerlendirir: 01.07.2026 sonrası trafik/ZMSS zorunluluğu, kontrol listesi, istisna uyarıları ve rapor/mail taslakları. Tümü yereldir; hesaplama motoru yoktur, kesin tutar üretmez.</p>

    <div class="app-alert ${meta.cls} vl-status">
      ${icon(meta.ic)}<span><b>Değer kaybı durumu: ${escapeHtml(meta.label)}</b> <small>(eşik tarihi ${escapeHtml(VALUE_LOSS_EFFECTIVE_DATE)})</small></span>
    </div>
    ${renderReasons(requirement)}

    <div class="vl-summary">Kontrol listesi: ${summary.ok}/${summary.total} tamam • ${summary.missing} eksik • ${summary.controlNeeded} kontrol${summary.criticalMissing ? ` • <b>${summary.criticalMissing} kritik eksik</b>` : ''}</div>
    <div class="vl-checklist">${categories.map(renderChecklistCategory).join('')}</div>

    ${renderExclusions(exclusions)}

    ${renderValueLossContextForm(state)}

    ${renderValueLossCalculationPanel(calcResult, { copyError: state.aiHelpers.valueLoss.copyError, savedSnapshot: savedVl?.calculationSnapshot ?? null, savedHistory: savedVl?.calculationSnapshotHistory ?? [], freshness: evaluateSnapshotFreshness(savedVl), historyFreshness: evaluateHistoryFreshnessSummary(savedVl) })}

    <div class="vl-block vl-draft-block">
      <h5 class="vl-cat-title">Taslak üret (önizleme)</h5>
      ${savedVl?.calculationSnapshot ? `<p class="muted vl-snap-ref">Kayıtlı ön hesap özeti: ${savedVl.calculationSnapshot.status === 'calculated'
        ? `Var / calculated / ${escapeHtml((savedVl.calculationSnapshot.createdAt || '').slice(0, 10))}`
        : `Tanı amaçlı / ${escapeHtml(savedVl.calculationSnapshot.status)}`} — taslaklara yalnız nitelik cümlesi eklenir, tutar eklenmez.</p>` : ''}
      <div class="vl-draft-actions">
        ${DRAFTS.map((d) => `<button class="secondary compact ${active === d.kind ? 'active' : ''}" data-action="aih-vl-draft" data-vl-draft="${d.kind}">${escapeHtml(d.label)}</button>`).join('')}
      </div>
      ${renderDraftPreview(state, categories, vl, calcResult.status === 'calculated')}
    </div>

    <div class="app-alert info vl-footer">${icon('info')}<span>Bu ekran salt-okunur ve önizleme amaçlıdır. Kullanıcı onayı olmadan hiçbir yere (dosya, Excel, rapor, mail) yazılmaz; taslaklar otomatik gönderilmez. Sonuç kesin tazminat değildir; eksper kanaati ve hesaplama gerekçesi esastır.</span></div>
  </div>`;
}
