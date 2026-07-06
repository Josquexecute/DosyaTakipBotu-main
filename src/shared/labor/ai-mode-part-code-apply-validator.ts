/**
 * v0.6.x — AI İşçilik v3.8: D sütununa parça kodu yazma DOĞRULAMASI (SAF). Bloklayan hatalar + uyarılar döner.
 * Blok: boş kod / 17-hane VIN / çok kısa kod / satır adı-eski kod uyuşmazlığı / formüllü hücre.
 * Uyarı (bloklamaz): mevcut D farklı, düşük güven, genel parça adı, araç çelişkisi, kaynak yok.
 */
import { normalizeSearch } from '../turkish';
import { normalizePartCode } from './ai-mode-part-code-comparator';
import { isGenericPartName } from './ai-mode-part-candidate-store';
import type { AiModeConfidence } from './ai-mode-part-search-types';
import type { PostWriteVerification } from './ai-mode-part-code-apply-types';

export interface ApplyValidationInput {
  candidatePartCode: string;
  expectedOldPartCode?: string;
  actualOldPartCode?: string;
  expectedPartName?: string;
  actualPartName?: string;
  hasFormula?: boolean;
  isPartCodeColumn?: boolean;
  confidence?: AiModeConfidence;
  vehicleConflict?: boolean;
  sourceCount?: number;
}

export interface ApplyValidationResult {
  ok: boolean;
  blocking: string[];
  warnings: string[];
}

/** D sütununa yazma isteğini doğrular; ok=false ise yazma yapılmamalıdır. */
export function validateAiModePartCodeApply(input: ApplyValidationInput): ApplyValidationResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const code = normalizePartCode(input.candidatePartCode);

  if (!code) blocking.push('Yazılacak aday parça kodu boş.');
  else if (code.length === 17) blocking.push('Aday kod 17 haneli (VIN/şasi benzeri); parça kodu olarak yazılamaz.');
  else if (code.length < 3) blocking.push('Aday kod çok kısa/şüpheli; yazılamaz.');

  if (input.isPartCodeColumn === false) blocking.push('Hedef sütun parça kodu (KOD) sütunu değil; yazma durduruldu.');
  if (input.hasFormula) blocking.push('Hedef D hücresi formül içeriyor; formül ezilmez, yazma durduruldu.');

  if (input.expectedPartName !== undefined && input.actualPartName !== undefined &&
    normalizeSearch(input.expectedPartName) !== normalizeSearch(input.actualPartName)) {
    blocking.push('Excel satırındaki parça adı önizlemedekiyle uyuşmuyor; satır önizlemeden sonra değişmiş olabilir.');
  }
  if (input.expectedOldPartCode !== undefined && input.actualOldPartCode !== undefined &&
    normalizePartCode(input.expectedOldPartCode) !== normalizePartCode(input.actualOldPartCode)) {
    blocking.push('Excel D kodu önizlemedekiyle uyuşmuyor; satır önizlemeden sonra değişmiş olabilir.');
  }

  const actualOld = normalizePartCode(input.actualOldPartCode);
  if (actualOld && actualOld !== code) warnings.push(`Mevcut D kodu (${input.actualOldPartCode}) farklı; üzerine yazılacak. Kontrol gerekli.`);
  if (input.confidence === 'low') warnings.push('Aday güveni düşük; parça kodu kontrol edilmeli.');
  if (isGenericPartName(input.actualPartName ?? input.expectedPartName)) warnings.push('Genel/kısa parça adı; parça kodu kontrol edilmeli.');
  if (input.vehicleConflict) warnings.push('Araç bağlamı çelişkili; bu satıra yazma önerilmez.');
  if ((input.sourceCount ?? 0) === 0) warnings.push('Aday için kaynak/link yok; kontrol gerekli.');

  return { ok: blocking.length === 0, blocking, warnings };
}

/** v3.9: yazma sonrası yeniden okunan D kodunu yazılan kodla karşılaştırır (SAF). */
export function buildPostWriteVerification(input: {
  rowNumber: number;
  writtenCode: string;
  currentPartCode?: string;
  partName?: string;
}): PostWriteVerification {
  const matches = normalizePartCode(input.currentPartCode) === normalizePartCode(input.writtenCode);
  const out: PostWriteVerification = {
    rowNumber: input.rowNumber,
    matchesWrittenCode: matches,
    message: matches
      ? `Yazma sonrası D sütunu ${input.currentPartCode} olarak doğrulandı.`
      : `Yazma sonrası D sütunu beklenen kodla eşleşmedi (okunan: ${input.currentPartCode || 'boş'}); dosya kontrol edilmeli.`
  };
  if (input.partName) out.partName = input.partName;
  if (input.currentPartCode !== undefined) out.currentPartCode = input.currentPartCode;
  return out;
}
