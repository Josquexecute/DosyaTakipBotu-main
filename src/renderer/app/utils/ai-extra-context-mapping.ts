/**
 * v0.6.x — "Dosya Ek Bilgileri" formu ↔ aiHelperContext eşlemeleri + efektif bağlam birleştirme.
 *
 * SAF renderer yardımcıları (DOM/IPC/yazma yok). Form yalnız UI bellektir; kaydetme ayrı akıştadır.
 */
import type { AiExtraForm, AiTriForm } from '../state';
import { emptyAiExtraForm } from '../state';
import type { CaseIndexItem } from '../../../shared/types';
import type { AiHelperContext, AiHelperContextInput } from '../../../shared/ai-context/ai-helper-context-types';
import type { AiCaseContext } from '../selectors/ai-case-context';
import { buildAiCaseContext, applyAiHelperOverride } from '../selectors/ai-case-context';

function triToBool(value: AiTriForm): boolean | null {
  return value === 'var' ? true : value === 'yok' ? false : null;
}
function boolToTri(value: boolean | null | undefined): AiTriForm {
  return value === true ? 'var' : value === false ? 'yok' : 'belirsiz';
}

/** Form → kaydetme/birleştirme girdisi (AiHelperContextInput). */
export function extraFormToInput(form: AiExtraForm): AiHelperContextInput {
  return {
    claimTypeOverride: form.claimType,
    vehicleGroup: form.vehicleGroup,
    hasValueLoss: triToBool(form.hasValueLoss),
    cityScope: form.cityScope,
    isOutOfTown: form.cityScope === 'farkli_il' ? true : form.cityScope === 'ayni_il' ? false : null,
    insurerName: form.insurerName,
    accidentDocumentType: form.accidentDocumentType,
    alcoholDocumentStatus: form.alcoholDocumentStatus,
    driverLicenseStatus: form.driverLicenseStatus,
    appointmentDateTime: form.appointmentDateTime,
    firstInspectionDate: form.firstInspectionDate,
    preliminaryReportDate: form.preliminaryReportDate,
    reportReadyDate: form.reportReadyDate,
    vehicleDeliveredToService: triToBool(form.vehicleDeliveredToService),
    vehicleDeliveredToServiceDate: form.vehicleDeliveredToServiceDate,
    repairStartedDate: form.repairStartedDate,
    repairCompletedDate: form.repairCompletedDate,
    notes: form.notes
  };
}

/** Kayıtlı ek bağlam → form (Dosyadaki kayıtlı bilgiye dön). */
export function savedToExtraForm(saved: AiHelperContext | null | undefined): AiExtraForm {
  if (!saved) return emptyAiExtraForm();
  return {
    claimType: saved.claimTypeOverride ?? 'belirsiz',
    vehicleGroup: saved.vehicleGroup ?? 'belirsiz',
    hasValueLoss: boolToTri(saved.hasValueLoss),
    cityScope: saved.cityScope ?? 'belirsiz',
    insurerName: saved.insurerName ?? '',
    accidentDocumentType: saved.accidentDocumentType ?? 'belirsiz',
    alcoholDocumentStatus: saved.alcoholDocumentStatus ?? 'belirsiz',
    driverLicenseStatus: saved.driverLicenseStatus ?? 'belirsiz',
    appointmentDateTime: saved.appointmentDateTime ?? '',
    firstInspectionDate: saved.firstInspectionDate ?? '',
    preliminaryReportDate: saved.preliminaryReportDate ?? '',
    reportReadyDate: saved.reportReadyDate ?? '',
    vehicleDeliveredToService: boolToTri(saved.vehicleDeliveredToService),
    vehicleDeliveredToServiceDate: saved.vehicleDeliveredToServiceDate ?? '',
    repairStartedDate: saved.repairStartedDate ?? '',
    repairCompletedDate: saved.repairCompletedDate ?? '',
    notes: saved.notes ?? ''
  };
}

function blankToken(value: unknown): string {
  if (value === undefined || value === null || value === '' || value === 'belirsiz') return '';
  return String(value);
}

/** Yalnız kayıtlıdan FARKLI olan alanları içeren override (geçici önizleme için). */
export function changedOverride(formInput: AiHelperContextInput, saved: AiHelperContext | null | undefined): AiHelperContextInput {
  const savedObj = (saved ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(formInput) as (keyof AiHelperContextInput)[]) {
    const formVal = (formInput as Record<string, unknown>)[key as string];
    if (blankToken(formVal) !== blankToken(savedObj[key as string])) out[key as string] = formVal;
  }
  return out as AiHelperContextInput;
}

/** Otomatik + kayıtlı + GEÇİCİ form değişikliklerini birleştirip efektif bağlamı verir (yazma yok). */
export function buildEffectiveAiContext(item: CaseIndexItem | null, form: AiExtraForm): AiCaseContext | null {
  const ctx = buildAiCaseContext(item);
  if (!ctx) return null;
  const saved = item?.tracking?.aiHelperContext ?? null;
  const changed = changedOverride(extraFormToInput(form), saved);
  return applyAiHelperOverride(ctx, changed, 'temp');
}

/** Bir Ek Bilgiler alanının rozeti: değişti mi (kaydedilecek) / kayıtlı mı / boş mu. */
export function extraFieldBadge(formValue: string, savedValue: unknown): string {
  const changed = blankToken(formValue) !== blankToken(savedValue);
  if (changed) return '<span class="aih-badge edited">geçici değişiklik · kaydedilecek</span>';
  if (blankToken(savedValue)) return '<span class="aih-badge saved">kaydedilmiş ek bilgi</span>';
  return '';
}
