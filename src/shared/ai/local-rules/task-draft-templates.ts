/**
 * v0.6.x — AI taslak ortak metin şablonları (madde listesi, etiketli satır, mail/not bloğu).
 * SAF; ağ/dosya/IPC YOK. Tutarlı ve okunabilir Türkçe çıktı için kullanılır.
 */
import { joinDraft } from './task-common';

/** Boş olmayan maddeleri "• madde" satırlarına çevirir. */
export function bulletList(items: ReadonlyArray<string | null | undefined>): string {
  return items.map((i) => (i ?? '').trim()).filter(Boolean).map((i) => `• ${i}`).join('\n');
}

/** Etiketli satırlar ("Etiket: değer"); değeri boş olanlar atlanır. */
export function kvLines(pairs: ReadonlyArray<[string, string]>): string {
  return pairs.filter(([, v]) => v && v.trim()).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** Hitap + paragraflar + kapanış birleştirir (boşlar elenir). */
export function mailDraft(opening: string, paragraphs: ReadonlyArray<string | null | undefined>, closing: string): string {
  return joinDraft([opening, ...paragraphs, closing]);
}
