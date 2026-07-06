/**
 * v0.6.x — AI İşçilik v3: Parça ekonomik bağlam tipleri + birleşik değerlendirme (SAF; ağ/dosya/online sorgu YOK).
 * Araç bağlamı, parça kodu, işlem türü, sahiplenme/orijinal bedel ve onarım/değişim ekonomisini TEK gerekçede toplar.
 * Çıktı yalnız önizleme gerekçesi/uyarısıdır; işçilik dağıtım sayılarını ve kontrol bayraklarını DEĞİŞTİRMEZ.
 */
import { detectOperationType, type OperationDetection } from './operation-type-detector';
import { evaluateCalibrationContext, type CalibrationEvaluation } from './calibration-context-rules';
import { evaluateRepairVsReplace, type RepairVsReplaceEvaluation } from './repair-vs-replace-evaluator';

/** Araç bağlamı (marka/model/yıl/şasi/motor) — yerel; online sorgu için kullanılmaz. */
export interface VehiclePartContext {
  make?: string;
  model?: string;
  year?: string;
  chassis?: string;
  engineNo?: string;
}

/** Gelecekteki YEREL parça referans tablosu için iskele tipi (online sorgu YOK). */
export interface LocalPartReference {
  partCode: string;
  canonicalName?: string;
  typicalOperation?: OperationDetection['type'];
  notes?: string;
}

export interface LaborV3Input {
  partName: string;
  group?: string;
  partCode?: string;
  note?: string;
  /** Portal "İşlem Türü" (E) sütun değeri — varsa işlem türü tespitinde birincil ipucu. */
  operationHint?: string;
  /** Portal "Kalibrasyon" (T) sütunundan anlamlı (sıfır olmayan) açıklama — varsa kalibrasyon bağlamı. */
  calibrationHint?: string;
  /** F = Parça Sahiplenme Bedeli. */
  salvagePrice?: number | null;
  /** G = Parça Orijinal Bedeli. */
  originalPrice?: number | null;
  /** Bu satıra dağıtılan işçilik toplamı (varsa). */
  repairLaborTotal?: number | null;
  vehicle?: VehiclePartContext;
  /** İleride doldurulabilecek yerel referans tablosu (varsa). */
  localReference?: readonly LocalPartReference[];
}

export interface LaborV3Context {
  operation: OperationDetection;
  calibration: CalibrationEvaluation;
  economic: RepairVsReplaceEvaluation;
  /** v3 bağlamı düşük güven/kontrol gerektiriyor mu (yalnız bilgi; mevcut needsReview'i değiştirmez). */
  needsReview: boolean;
  /** Önizleme gerekçe alanına eklenecek tek-satır Türkçe açıklama. */
  note: string;
  warnings: string[];
}

const OPERATION_LABEL: Record<OperationDetection['type'], string> = {
  onarim: 'Onarım',
  degisim: 'Değişim',
  belirsiz: 'İşlem türü belirsiz'
};

/**
 * YEREL parça referansı arar (online sorgu YOK). Tablo boşsa null döner — gelecekteki genişleme için iskele.
 */
export function lookupLocalPartReference(
  partCode: string,
  table: readonly LocalPartReference[] = []
): LocalPartReference | null {
  const code = (partCode || '').trim().toUpperCase();
  if (!code) return null;
  return table.find((r) => r.partCode.trim().toUpperCase() === code) ?? null;
}

function vehicleHint(vehicle?: VehiclePartContext): string {
  if (!vehicle) return '';
  const head = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ').trim();
  return head ? `Araç: ${head}.` : '';
}

/** İşlem türü + ekonomi + kalibrasyon + araç bağlamını tek değerlendirmede toplar. */
export function buildLaborV3Context(input: LaborV3Input): LaborV3Context {
  const partName = input.partName ?? '';
  const group = input.group ?? '';
  const note = input.note ?? '';
  const salvagePrice = input.salvagePrice ?? null;
  const originalPrice = input.originalPrice ?? null;
  // İşlem türü ipucu (E sütunu) ve kalibrasyon ipucu (T sütunu) varsa ilgili dedektöre birincil bağlam olur.
  const operationText = [input.operationHint, note].filter(Boolean).join(' ');
  const calibrationText = [input.calibrationHint, note].filter(Boolean).join(' ');

  const operation = detectOperationType(partName, group, operationText);
  const calibration = evaluateCalibrationContext(partName, group, calibrationText);
  const economic = evaluateRepairVsReplace({
    operationType: operation.type,
    salvagePrice,
    originalPrice,
    repairLaborTotal: input.repairLaborTotal ?? null
  });

  const localRef = lookupLocalPartReference(input.partCode ?? '', input.localReference ?? []);
  const needsReview = operation.type === 'belirsiz' || economic.verdict === 'kontrol-gerekli' || calibration.needsReview;

  const warnings: string[] = [];
  if (operation.type === 'belirsiz') warnings.push('İşlem türü (onarım/değişim) net değil; kontrol gerekli.');
  if (economic.verdict === 'kontrol-gerekli') warnings.push('Onarım/değişim ekonomisi netleşmedi; kontrol gerekli.');
  if (calibration.context === 'belirsiz' && calibration.needsReview) warnings.push(calibration.note);

  const parts = [
    vehicleHint(input.vehicle),
    `İşlem: ${OPERATION_LABEL[operation.type]}.`,
    economic.note,
    calibration.note ? `Kalibrasyon: ${calibration.note}` : '',
    localRef?.notes ? `Yerel referans: ${localRef.notes}` : ''
  ].filter(Boolean);

  return { operation, calibration, economic, needsReview, note: parts.join(' '), warnings };
}
