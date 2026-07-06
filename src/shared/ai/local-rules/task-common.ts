/**
 * v0.6.x — AI yerel kural görevleri için ORTAK metin/format yardımcıları.
 * SAF/shared: ağ/dosya/IPC YOK. Davranış değişmez; provider'dan ayrıştırılmıştır.
 */
import type { AiCaseContext } from '../../ai-context/ai-case-context';
import type { AiDraftTaskInput } from '../ai-orchestrator-types';

/** Her taslağın altına eklenen yardımcı/kontrol notu. */
export const HELPER_NOTE = 'Bu metin eksper yardımcısı / kontrol amaçlı bir taslaktır; kesin karar değildir ve dosyaya otomatik yazılmaz.';

export function formatTL(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

/** Boş/anlamsız satırları eler, temiz Türkçe taslak metni üretir. */
export function joinDraft(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join('\n\n');
}

export function triLabel(value: boolean | null): string {
  if (value === true) return 'Var';
  if (value === false) return 'Yok';
  return 'Belirsiz (kontrol gerekli)';
}

export function sigortaLabel(ctx: AiCaseContext): string {
  if (ctx.sigortaTuru === 'trafik') return 'Trafik / ZMSS';
  if (ctx.sigortaTuru === 'kasko') return 'Kasko';
  if (ctx.sigortaTuru === 'ihtiyari-mali-sorumluluk') return 'İhtiyari Mali Sorumluluk';
  return 'Belirsiz';
}

export function userInstructionSection(input: AiDraftTaskInput): string {
  const t = (input.userInstruction ?? '').trim();
  return t ? `Kullanıcı ek talimatı: ${t}` : '';
}

/** Görev metnine kullanıcı talimatını ve yardımcı notu ekleyerek birleştirir. */
export function withUser(parts: ReadonlyArray<string | null | undefined>, input: AiDraftTaskInput): string {
  return joinDraft([...parts, userInstructionSection(input), HELPER_NOTE]);
}
