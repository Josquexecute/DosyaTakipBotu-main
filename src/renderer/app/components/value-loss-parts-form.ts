/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v4: "Parça Bazlı Değer Kaybı Verileri" bölümü (SALT-OKUNUR render).
 *
 * Satırlar UI bellekte tutulur (`state.aiHelpers.vlParts`); katsayı çözümü render anında SAF
 * çözümleyiciyle yapılır ve yalnız GÖSTERİLİR. Kayıt yalnız mevcut v2 önizleme/diff/onay akışıyla;
 * ayrı otomatik kaydetme YOKTUR. Serbest metin alanlarından parça çıkarılmaz.
 */
import type { UiState, ValueLossPartFormRow } from '../state';
import { escapeHtml } from '../validation';
import { partRowsToInput } from '../utils/value-loss-form-mapping';
import { resolvePartItem } from '../../../shared/value-loss/value-loss-part-resolver';
import { listPartNamesForGroup } from '../../../shared/value-loss/value-loss-part-coefficients';
import type { ValueLossPartItem } from '../../../shared/value-loss/value-loss-part-input-types';

const OP_OPTIONS = [
  { v: 'changed', l: 'Değişen' }, { v: 'repaired', l: 'Onarılan' }, { v: 'painted', l: 'Boyanan' }
] as const;
const PAINT_OPTIONS = [
  { v: 'belirsiz', l: 'Bilinmiyor' }, { v: 'TAM', l: 'TAM' }, { v: 'LOKAL', l: 'LOKAL' }
] as const;
const SEV_TR: Record<string, string> = { light: 'Hafif', medium: 'Orta', heavy: 'Ağır', unknown: 'Bilinmiyor' };

function renderResolution(resolved: ValueLossPartItem | null): string {
  if (!resolved) return '';
  const coef = typeof resolved.coefficient === 'number'
    ? `<span class="vl-part-coef ok">Katsayı: <b>${escapeHtml(resolved.coefficient.toLocaleString('tr-TR'))}</b></span>
       <small class="vl-part-source">${escapeHtml(resolved.coefficientSource ?? '')}</small>`
    : '<span class="vl-part-coef missing">Katsayı çözülemedi</span>';
  const sev = resolved.operation === 'repaired' && resolved.repair
    ? `<span class="vl-part-sev">Ağırlık: <b>${escapeHtml(SEV_TR[resolved.repair.severity ?? 'unknown'] ?? '')}</b>${resolved.repair.laborToNewPartRatio !== undefined ? ` (oran ${escapeHtml(String(resolved.repair.laborToNewPartRatio))})` : ''}</span>`
    : '';
  const warns = resolved.warnings.length
    ? `<div class="vl-part-warn">${resolved.warnings.map((w) => `⚠ ${escapeHtml(w)}`).join('<br>')}</div>`
    : '';
  return `<div class="vl-part-status">${coef}${sev}${warns}</div>`;
}

function renderRow(row: ValueLossPartFormRow, index: number, resolved: ValueLossPartItem | null): string {
  const p = (field: string) => `vlPart:${index}:${field}`;
  return `<li class="vl-part-row">
    <div class="aih-form vl-form-grid">
      <label class="aih-field"><span>İşlem</span>
        <select data-aih="${p('operation')}">${OP_OPTIONS.map((o) => `<option value="${o.v}" ${row.operation === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}</select>
      </label>
      <label class="aih-field"><span>Parça adı (SEİK listesinden seçin)</span>
        <input type="text" list="vl-part-names" data-aih="${p('partName')}" value="${escapeHtml(row.partName)}" placeholder="örn. MOTOR KAPUTU">
      </label>
      ${row.operation === 'repaired' ? `
      <label class="aih-field"><span>İşçilik bedeli (KDV hariç)</span>
        <input type="text" data-aih="${p('laborAmount')}" value="${escapeHtml(row.laborAmount)}" placeholder="örn. 1.500"></label>
      <label class="aih-field"><span>Yeni parça fiyatı (KDV hariç)</span>
        <input type="text" data-aih="${p('newPartPrice')}" value="${escapeHtml(row.newPartPrice)}" placeholder="örn. 12.000"></label>` : ''}
      ${row.operation === 'painted' ? `
      <label class="aih-field"><span>Boya türü</span>
        <select data-aih="${p('paintType')}">${PAINT_OPTIONS.map((o) => `<option value="${o.v}" ${row.paintType === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}</select>
      </label>` : ''}
    </div>
    ${renderResolution(resolved)}
    <button class="secondary compact danger" data-action="aih-vl-part-del" data-part-index="${index}">Parça sil</button>
  </li>`;
}

/** Parça Bazlı Değer Kaybı Verileri bölümünü döner (form paneli içinde kullanılır). */
export function renderValueLossPartsForm(state: UiState): string {
  const rows = state.aiHelpers.vlParts;
  const groupForm = state.aiHelpers.vlForm.vehicleGroup;
  const group = groupForm === 'belirsiz' ? 'unknown' : groupForm;
  const items = partRowsToInput(rows);
  const resolvedById = new Map(items.map((i) => [i.id, resolvePartItem(i, group)]));
  const knownNames = group === 'unknown' ? [] : listPartNamesForGroup(group);

  return `<div class="vl-form-section vl-parts-section">
    <h6 class="vl-form-section-title">Parça Bazlı Değer Kaybı Verileri</h6>
    <p class="muted vl-form-note">Araç grubu: <b>${escapeHtml(groupForm === 'belirsiz' ? 'Belirsiz (önce Araç bölümünden seçin)' : `Grup ${groupForm}`)}</b>.
      Katsayılar yalnız SEİK tablosundaki bilinen parça adlarıyla çözülür; bilinmeyen ad tahmin edilmez.
      Satırlar da yalnız "Kaydet (onay istenir)" ile dosyaya yazılır; ayrı otomatik kayıt yoktur.</p>
    <datalist id="vl-part-names">${knownNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>
    ${rows.length === 0 ? '<p class="muted">Henüz parça satırı yok.</p>' : `<ul class="vl-part-list">${rows.map((r, i) => renderRow(r, i, resolvedById.get(r.id) ?? null)).join('')}</ul>`}
    <div class="vl-draft-actions">
      <button class="secondary compact" data-action="aih-vl-part-add">Parça ekle</button>
      <button class="secondary compact" data-action="aih-vl-preview">Önizle / normalize et</button>
    </div>
  </div>`;
}
