/**
 * v0.6.x — Değer Kaybı Ek Bilgi Formu (v2) bileşeni (SALT-OKUNUR render).
 *
 * Alanlar `data-aih="vlForm.*"` ile UI belleğe yazılır (generic güvenli input yolu); hiçbir alan
 * doğrudan kalıcı dosyaya yazılmaz. Kaydetme yalnız önizleme + açık kullanıcı onayıyla yapılır.
 */
import type { UiState, ValueLossForm } from '../state';
import { escapeHtml } from '../validation';
import { infoTip } from './info-tip';
import { renderValueLossContextPreview } from './value-loss-context-preview';
import { renderValueLossPartsForm } from './value-loss-parts-form';

type FieldKind = 'text' | 'textarea' | 'tri' | 'fileType' | 'group' | 'vehicleType';

interface FieldDef {
  key: keyof ValueLossForm;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  /** Kafa karıştırabilecek alanlar için kompakt ⓘ açıklaması (yalnız görsel; davranış yok). */
  tip?: string;
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

const SECTIONS: readonly SectionDef[] = [
  {
    title: 'Dosya',
    fields: [
      { key: 'fileType', label: 'Dosya türü', kind: 'fileType' },
      { key: 'assignmentDate', label: 'Atama tarihi', kind: 'text', placeholder: 'yyyy-aa-gg' },
      { key: 'reportWillIncludeValueLoss', label: 'Değer kaybı aynı raporda değerlendirilecek mi?', kind: 'tri' }
    ]
  },
  {
    title: 'Araç',
    fields: [
      { key: 'brandModel', label: 'Marka/model', kind: 'text' },
      { key: 'modelYear', label: 'Model yılı', kind: 'text', placeholder: 'örn. 2021' },
      { key: 'mileageKm', label: 'Kilometre', kind: 'text', placeholder: 'örn. 75.000' },
      { key: 'workingHours', label: 'Çalışma saati (iş makinesi)', kind: 'text' },
      { key: 'marketValue', label: 'Rayiç bedel (TL)', kind: 'text', placeholder: 'örn. 850.000', tip: 'Aracın hasar öncesi 2. el piyasa değeri; emsal ilan/kasko değer listesinden belirlenir. Ön hesabın ana çarpanıdır.' },
      { key: 'vehicleGroup', label: 'Araç grubu', kind: 'group', tip: 'SEİK tablosundaki A–F araç grubu (otomobil, minibüs/otobüs, kamyon vb.). Grup çarpanını belirler; ruhsattaki araç cinsinden bulunur.' },
      { key: 'vehicleType', label: 'Araç türü', kind: 'vehicleType', tip: 'Grubun içindeki tür ayrımı; bazı türler özel çarpan uygular (örn. B grubunda OTOBÜS 0,5).' },
      { key: 'commercialOrRental', label: 'Ticari/kiralık mı?', kind: 'tri' },
      { key: 'foreignPlate', label: 'Yabancı plakalı mı?', kind: 'tri' },
      { key: 'antiqueOrCollectible', label: 'Antika/koleksiyon mu?', kind: 'tri' },
      { key: 'isCabrioOrConvertible', label: 'Cabrio / üstü açılır araç mı?', kind: 'tri' }
    ]
  },
  {
    title: 'Geçmiş',
    fields: [
      { key: 'sbmPastDamageCount', label: 'SBM geçmiş hasar adedi', kind: 'text', placeholder: 'örn. 0', tip: 'SBM (Sigorta Bilgi Merkezi) sorgusunda görünen geçmiş hasar kaydı sayısı; geçmiş hasar katsayısını etkiler.' },
      { key: 'hasPriorHeavyDamage', label: 'Kaza öncesi ağır hasar var mı?', kind: 'tri' },
      { key: 'hasPriorSamePartDamage', label: 'Aynı parçada önceki hasar/onarım var mı?', kind: 'tri' },
      { key: 'historyNotes', label: 'Geçmiş notu', kind: 'textarea' }
    ]
  },
  {
    title: 'Hasar',
    fields: [
      { key: 'isTotalLossOrHeavyDamage', label: 'Mevcut dosya ağır/tam hasar mı?', kind: 'tri' },
      { key: 'damageAmount', label: 'Hasar (onarım) tutarı (TL)', kind: 'text', placeholder: 'örn. 65.000' },
      { key: 'damageDate', label: 'Hasar tarihi', kind: 'text', placeholder: 'yyyy-aa-gg' },
      { key: 'changedPartsText', label: 'Değişen parçalar', kind: 'textarea' },
      { key: 'repairedPartsText', label: 'Onarılan parçalar', kind: 'textarea' },
      { key: 'paintedPartsText', label: 'Boyanan parçalar', kind: 'textarea' },
      { key: 'hasStructuralParts', label: 'Yapısal parça var mı?', kind: 'tri' },
      { key: 'hasSemiStructuralParts', label: 'Yarı yapısal parça var mı?', kind: 'tri' },
      { key: 'hasCosmeticParts', label: 'Kozmetik parça var mı?', kind: 'tri' },
      { key: 'hasAccessoryParts', label: 'Aksesuar parça var mı?', kind: 'tri' },
      { key: 'paintTypeKnown', label: 'Boya türü belli mi?', kind: 'tri' },
      { key: 'repairLaborKnown', label: 'Onarım işçilik bedeli belli mi?', kind: 'tri' },
      { key: 'newPartPriceKnown', label: 'Yeni parça fiyatı belli mi?', kind: 'tri' }
    ]
  },
  {
    title: 'Piyasa Analizi',
    fields: [
      { key: 'comparableListingCount', label: 'Emsal ilan sayısı', kind: 'text', placeholder: 'örn. 3' },
      { key: 'listingsWithinLast30Days', label: 'İlanlar son 30 güne ait mi?', kind: 'tri' },
      { key: 'listingNumbersVisible', label: 'İlan numaraları görünüyor mu?', kind: 'tri' },
      { key: 'screenshotsTaken', label: 'Ekran görüntüsü alındı mı?', kind: 'tri' },
      { key: 'kmModelEquipmentComparable', label: 'KM/model/donanım benzerliği var mı?', kind: 'tri' },
      { key: 'outliersExcluded', label: 'Aşırı düşük/yüksek ilan dışlandı mı?', kind: 'tri' },
      { key: 'bargainingRealityExplained', label: 'Pazarlık/piyasa gerçekliği açıklanmış mı?', kind: 'tri' }
    ]
  },
  {
    title: 'Evidence / Rapor',
    fields: [
      { key: 'calculationModuleOutputExists', label: 'Hesap modülü çıktısı var mı?', kind: 'tri' },
      { key: 'marketScreenshotsExist', label: 'Piyasa ekran görüntüleri var mı?', kind: 'tri' },
      { key: 'damagePhotosExist', label: 'Hasar fotoğrafları var mı?', kind: 'tri' },
      { key: 'repairPartEvidenceExists', label: 'Parça/onarım gerekçesi var mı?', kind: 'tri' },
      { key: 'methodExplainedInReport', label: 'Yöntem raporda açıklanmış mı?', kind: 'tri' },
      { key: 'digitalArchiveReady', label: 'Dijital arşiv hazır mı?', kind: 'tri' },
      { key: 'notes', label: 'Serbest not', kind: 'textarea' }
    ]
  }
];

const TRI_OPTIONS: ReadonlyArray<{ v: string; l: string }> = [
  { v: 'belirsiz', l: 'Belirsiz' }, { v: 'evet', l: 'Evet' }, { v: 'hayir', l: 'Hayır' }
];
const FILE_TYPE_OPTIONS: ReadonlyArray<{ v: string; l: string }> = [
  { v: 'belirsiz', l: 'Bilinmiyor' }, { v: 'trafik', l: 'Trafik / ZMSS' }, { v: 'kasko', l: 'Kasko' }
];
const GROUP_OPTIONS: ReadonlyArray<{ v: string; l: string }> = [
  { v: 'belirsiz', l: 'Belirsiz' },
  ...['A', 'B', 'C', 'Ç', 'D', 'E', 'F'].map((g) => ({ v: g, l: `Grup ${g}` }))
];
const VEHICLE_TYPE_OPTIONS: ReadonlyArray<{ v: string; l: string }> = [
  { v: 'unknown', l: 'Bilinmiyor' }, { v: 'automobile', l: 'Otomobil' }, { v: 'taxi', l: 'Taksi' },
  { v: 'minibus', l: 'Minibüs' }, { v: 'bus', l: 'Otobüs' }, { v: 'pickup', l: 'Kamyonet' },
  { v: 'truck', l: 'Kamyon' }, { v: 'special_purpose', l: 'Özel amaçlı' }, { v: 'tractor', l: 'Traktör' },
  { v: 'work_machine', l: 'İş makinesi' }, { v: 'trailer', l: 'Römork' }, { v: 'motorcycle', l: 'Motosiklet' }
];

function renderSelect(key: string, value: string, options: ReadonlyArray<{ v: string; l: string }>): string {
  return `<select data-aih="vlForm.${key}">
    ${options.map((o) => `<option value="${escapeHtml(o.v)}" ${value === o.v ? 'selected' : ''}>${escapeHtml(o.l)}</option>`).join('')}
  </select>`;
}

function renderField(form: ValueLossForm, field: FieldDef): string {
  const value = String(form[field.key] ?? '');
  let control: string;
  switch (field.kind) {
    case 'tri': control = renderSelect(field.key, value, TRI_OPTIONS); break;
    case 'fileType': control = renderSelect(field.key, value, FILE_TYPE_OPTIONS); break;
    case 'group': control = renderSelect(field.key, value, GROUP_OPTIONS); break;
    case 'vehicleType': control = renderSelect(field.key, value, VEHICLE_TYPE_OPTIONS); break;
    case 'textarea':
      control = `<textarea data-aih="vlForm.${field.key}" rows="2" placeholder="${escapeHtml(field.placeholder ?? '')}">${escapeHtml(value)}</textarea>`;
      break;
    default:
      control = `<input type="text" data-aih="vlForm.${field.key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder ?? '')}">`;
  }
  return `<label class="aih-field ${field.kind === 'textarea' ? 'aih-field-wide' : ''}"><span>${escapeHtml(field.label)}${field.tip ? infoTip(field.tip) : ''}</span>${control}</label>`;
}

/** Değer Kaybı Ek Bilgi Formu bölümünü döner (katlanabilir; kaydetme yalnız önizleme+onay ile). */
export function renderValueLossContextForm(state: UiState): string {
  const open = state.aiHelpers.valueLoss.formOpen;
  if (!open) {
    return `<div class="vl-block vl-context-form">
      <button class="secondary compact" data-action="aih-vl-form-toggle">Değer Kaybı Ek Bilgi Formu'nu Aç</button>
      <p class="muted vl-form-note">Form verileri yalnız açık onayınızla dosyaya kaydedilir; kaydetmeden de kontrol listesi geçici olarak bu verilerle güncellenir.</p>
    </div>`;
  }
  const form = state.aiHelpers.vlForm;
  return `<div class="vl-block vl-context-form">
    <div class="vl-draft-head"><h5 class="vl-cat-title">Değer Kaybı Ek Bilgi Formu</h5>
      <button class="secondary compact" data-action="aih-vl-form-toggle">Kapat</button></div>
    <p class="muted vl-form-note">Bilinmeyen alanları "Belirsiz" bırakın; uydurma değer girmeyin. Form geçici bellektedir; yalnız "Kaydet" onayıyla dosyanın değer kaybı ek bilgi alanına yazılır.</p>
    ${SECTIONS.map((s) => `<div class="vl-form-section">
      <h6 class="vl-form-section-title">${escapeHtml(s.title)}</h6>
      <div class="aih-form vl-form-grid">${s.fields.map((f) => renderField(form, f)).join('')}</div>
    </div>`).join('')}
    ${renderValueLossPartsForm(state)}
    ${renderValueLossContextPreview(state)}
  </div>`;
}
