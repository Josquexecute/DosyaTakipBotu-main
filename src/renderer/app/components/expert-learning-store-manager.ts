/**
 * v0.6.x — AI İşçilik v3.2: Eksper öğrenme kayıt yönetimi (aktif/pasif sayıları + pasifleştir/sil).
 * Yalnız yerel store kayıtlarını gösterir/yönetir; Excel'e dokunmaz. Silme onayı main.ts confirmDialog ile alınır.
 */
import { escapeHtml } from '../validation';
import type { UiState } from '../state';
import type { ExpertApprovedLaborLearningEntry } from '../../../shared/labor/expert-approved-learning-types';

const OP_LABEL: Record<string, string> = { onarim: 'Onarım', degisim: 'Değişim', belirsiz: 'Belirsiz' };

function renderEntry(entry: ExpertApprovedLaborLearningEntry): string {
  const status = entry.isActive ? '<span class="expert-learning-active">Aktif</span>' : '<span class="expert-learning-passive">Pasif</span>';
  const vehicle = [entry.vehicleModel, entry.modelYear ? String(entry.modelYear) : ''].filter(Boolean).join(' ');
  return `<li class="expert-learning-entry">
    <div class="expert-learning-entry-head"><b>${escapeHtml(entry.partName)}</b> ${status}</div>
    <div class="expert-learning-entry-meta">${escapeHtml(entry.partCode || 'kod yok')} • ${escapeHtml(OP_LABEL[entry.operationType] || entry.operationType)}${vehicle ? ` • ${escapeHtml(vehicle)}` : ''}</div>
    <div class="expert-learning-entry-actions">
      ${entry.isActive
        ? `<button class="secondary compact" data-action="expert-learning-deactivate" data-id="${escapeHtml(entry.id)}">Pasifleştir</button>`
        : `<button class="secondary compact" data-action="expert-learning-reactivate" data-id="${escapeHtml(entry.id)}">Yeniden Aktifleştir</button>`}
      <button class="secondary compact danger" data-action="expert-learning-delete" data-id="${escapeHtml(entry.id)}">Sil</button>
    </div>
  </li>`;
}

/** Store yönetim bölümünü döner (store yüklenmemişse yalnız "Yönet" çağrısı için boş özet). */
export function renderExpertLearningStoreManager(state: UiState): string {
  const store = state.expertLearning.store;
  if (!store) {
    return `<div class="expert-learning-store"><button class="secondary compact" data-action="expert-learning-manage">Öğrenme Kayıtlarını Yönet</button></div>`;
  }
  const recent = store.entries.slice(-8).reverse();
  return `<div class="expert-learning-store">
    <div class="expert-learning-store-summary">
      <span>Aktif: <b>${store.activeCount}</b></span>
      <span>Pasif: <b>${store.passiveCount}</b></span>
      <button class="secondary compact" data-action="expert-learning-manage">Yenile</button>
    </div>
    ${store.corrupt ? `<p class="expert-learning-warning">Öğrenme deposu bozuk olduğu için yok sayıldı; mevcut Excel akışı etkilenmez.</p>` : ''}
    ${store.entries.length === 0 ? '<p class="expert-learning-empty">Henüz kayıtlı eksper öğrenmesi yok.</p>' : `<ul class="expert-learning-entry-list">${recent.map(renderEntry).join('')}</ul>`}
  </div>`;
}
