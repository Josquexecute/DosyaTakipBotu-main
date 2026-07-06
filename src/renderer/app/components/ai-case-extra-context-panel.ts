import type { UiState, AiExtraForm } from '../state';
import { selectedCase } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { savedToExtraForm, extraFieldBadge, extraFormToInput, changedOverride } from '../utils/ai-extra-context-mapping';

// v0.6.x: "Dosya Ek Bilgileri" — kullanıcı onaylı ek bağlam. Geçici değişiklikler ekranda kalır;
// yalnız "Değişiklikleri dosyaya kaydet" ile (onay modalı sonrası) takip.json'a yazılır.

function opts(list: ReadonlyArray<[string, string]>, current: string): string {
  return list.map(([v, label]) => `<option value="${v}" ${current === v ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

const TRI: ReadonlyArray<[string, string]> = [['belirsiz', 'Belirsiz'], ['var', 'Var'], ['yok', 'Yok']];

function selField(label: string, key: keyof AiExtraForm, list: ReadonlyArray<[string, string]>, form: AiExtraForm, savedForm: AiExtraForm): string {
  return `<label class="aih-field"><span>${escapeHtml(label)} ${extraFieldBadge(form[key], savedForm[key])}</span>
    <select data-aih="extra.${String(key)}">${opts(list, form[key])}</select></label>`;
}

function textField(label: string, key: keyof AiExtraForm, form: AiExtraForm, savedForm: AiExtraForm, type = 'text'): string {
  return `<label class="aih-field"><span>${escapeHtml(label)} ${extraFieldBadge(form[key], savedForm[key])}</span>
    <input data-aih="extra.${String(key)}" type="${type}" value="${escapeHtml(form[key])}" /></label>`;
}

export function renderAiCaseExtraContextPanel(state: UiState): string {
  const item = selectedCase();
  const saved = item?.tracking?.aiHelperContext ?? null;
  const savedForm = savedToExtraForm(saved);
  const f = state.aiHelpers.extra;
  const open = state.aiHelpers.extraOpen;
  const saving = state.aiHelpers.extraSaving;
  const changeCount = Object.keys(changedOverride(extraFormToInput(f), saved)).length;

  if (!item) {
    return `<div class="aih-extra-card"><div class="aih-extra-head">${icon('details')}<b>Dosya Ek Bilgileri</b></div>
      <p class="muted">Önce bir dosya seçin. Ek bilgiler yalnızca seçili dosya için kaydedilebilir.</p></div>`;
  }

  return `<div class="aih-extra-card">
    <button class="aih-extra-head" data-action="aih-extra-toggle">
      ${icon('details')}<b>Dosya Ek Bilgileri</b>
      ${changeCount ? `<span class="aih-badge edited">${changeCount} değişiklik · kaydedilmedi</span>` : (saved ? '<span class="aih-badge saved">kayıtlı</span>' : '')}
      <span class="aih-extra-toggle-icon">${icon(open ? 'down' : 'open')}</span>
    </button>
    <p class="muted aih-extra-intro">Bu alanlar AI Yardımcıları'nın daha doğru öneri vermesi için kullanılır. Kaydetmediğiniz değişiklikler sadece bu ekranda geçicidir; "Kaydet" demeden takip.json'a yazılmaz.</p>
    ${open ? `<div class="aih-form">
      ${selField('Dosya türü netleştirme', 'claimType', [['belirsiz', 'Belirsiz'], ['trafik', 'Trafik / ZMSS'], ['kasko', 'Kasko'], ['ihtiyari', 'İhtiyari Mali Sorumluluk']], f, savedForm)}
      ${selField('Araç grubu', 'vehicleGroup', [['belirsiz', 'Belirsiz'], ['binek_hafif_ticari_motosiklet', 'Binek / Hafif Ticari / Motosiklet'], ['agir_vasita', 'Ağır Vasıta'], ['is_makinesi', 'İş Makinesi']], f, savedForm)}
      ${selField('Değer kaybı', 'hasValueLoss', TRI, f, savedForm)}
      ${selField('Şehir durumu', 'cityScope', [['belirsiz', 'Belirsiz'], ['ayni_il', 'Aynı il'], ['farkli_il', 'Farklı il']], f, savedForm)}
      ${textField('Sigorta şirketi', 'insurerName', f, savedForm)}
      ${selField('Tutanak tipi', 'accidentDocumentType', [['belirsiz', 'Belirsiz'], ['ktt', 'KTT'], ['zabit', 'Zabıt'], ['beyan', 'Beyan'], ['karakol_tutanagi', 'Karakol Tutanağı']], f, savedForm)}
      ${selField('Alkol evrak durumu', 'alcoholDocumentStatus', TRI, f, savedForm)}
      ${selField('Ehliyet durumu', 'driverLicenseStatus', TRI, f, savedForm)}
      ${textField('Ekspertiz talep / atama tarihi', 'appointmentDateTime', f, savedForm, 'date')}
      ${textField('İlk ekspertiz tarihi', 'firstInspectionDate', f, savedForm, 'date')}
      ${textField('Ön rapor tarihi', 'preliminaryReportDate', f, savedForm, 'date')}
      ${textField('Dosya rapora hazır tarihi', 'reportReadyDate', f, savedForm, 'date')}
      ${selField('Araç servise bırakıldı mı?', 'vehicleDeliveredToService', TRI, f, savedForm)}
      ${textField('Servise bırakılma tarihi', 'vehicleDeliveredToServiceDate', f, savedForm, 'date')}
      ${textField('Onarım başlangıç tarihi', 'repairStartedDate', f, savedForm, 'date')}
      ${textField('Onarım bitiş tarihi', 'repairCompletedDate', f, savedForm, 'date')}
      <label class="aih-field aih-field-wide"><span>Serbest not (AI yardımcısı notu)</span>
        <textarea data-aih="extra.notes" rows="2">${escapeHtml(f.notes)}</textarea></label>
    </div>
    <div class="aih-extra-actions">
      <button class="secondary" data-action="aih-extra-apply">Geçici uygula</button>
      <button class="primary" data-action="aih-extra-save" ${saving || changeCount === 0 ? 'disabled' : ''}>${saving ? 'Kaydediliyor…' : 'Değişiklikleri dosyaya kaydet'}</button>
      <button class="secondary compact" data-action="aih-extra-revert">Dosyadaki kayıtlı ek bilgiye dön</button>
      <button class="secondary compact" data-action="aih-extra-clear">Temizle</button>
    </div>
    <div class="app-alert info">${icon('info')}<span>Kaydet, yalnızca dosya ek bağlamını (aiHelperContext) günceller. Hasar tespit tutarı, evrak durumu ve dosya ana bilgileri otomatik değişmez.</span></div>` : ''}
  </div>`;
}
