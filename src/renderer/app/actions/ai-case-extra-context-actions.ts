/**
 * v0.6.x — "Dosya Ek Bilgileri" paneli aksiyonları (kaydetme HARİÇ).
 *
 * SALT UI: yalnız `state.aiHelpers` günceller. Kalıcı yazma "Değişiklikleri dosyaya kaydet" akışındadır
 * (main.ts, kullanıcı onaylı IPC). render() çağrısı caller'a aittir.
 */
import { state, selectedCase, emptyAiExtraForm } from '../state';
import { savedToExtraForm, buildEffectiveAiContext } from '../utils/ai-extra-context-mapping';
import { applyContextToAiHelpers } from '../utils/ai-context-mapping';

/** Geçici form değişikliklerini diğer yardımcı formlarına yansıtır (mevzuat filtresini ezmeden). */
export function extraReapplyToHelpers(): void {
  const ctx = buildEffectiveAiContext(selectedCase(), state.aiHelpers.extra);
  if (ctx) applyContextToAiHelpers(state.aiHelpers, ctx, { setMevzuatFilter: false });
}

export function toggleExtraPanel(): void {
  state.aiHelpers.extraOpen = !state.aiHelpers.extraOpen;
}

/** "Geçici uygula": sadece UI; takip.json'a yazmaz. */
export function applyExtraTemporary(): void {
  extraReapplyToHelpers();
  state.toast = 'Geçici değişiklikler uygulandı; yalnızca bu ekranda geçerli, dosyaya yazılmadı.';
  state.toastKind = 'info';
}

export function clearExtraForm(): void {
  state.aiHelpers.extra = emptyAiExtraForm();
  extraReapplyToHelpers();
  state.toast = 'Ek bilgiler temizlendi (yalnızca ekran; dosyaya yazılmadı).';
  state.toastKind = 'info';
}

export function revertExtraToSaved(): void {
  state.aiHelpers.extra = savedToExtraForm(selectedCase()?.tracking?.aiHelperContext ?? null);
  extraReapplyToHelpers();
  state.toast = 'Dosyadaki kayıtlı ek bilgiye dönüldü.';
  state.toastKind = 'info';
}
