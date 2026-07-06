/**
 * v0.6.x — AI yerel kural görevleri için bölüm (section) formatlayıcısı. SAF; davranış değişmez.
 */
import type { AiDraftSection } from '../ai-task-result-types';

/** Tek bir sonuç bölümü (başlık + içerik). Mail/not/rapor/liste bölümleri bununla üretilir. */
export function sec(title: string, content: string): AiDraftSection {
  return { title, content };
}
