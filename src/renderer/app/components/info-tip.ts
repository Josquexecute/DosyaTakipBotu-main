/**
 * v0.6.4 — Kompakt bilgi rozeti (ⓘ) yardımcı bileşeni (SAF render).
 *
 * Kafa karıştırabilecek etiket/kontrollerin yanına kısa açıklama ekler. Yerleşik `title`
 * tooltip'i kullanır (uygulamada mevcut desen); state/IPC/aksiyon-yönlendirici etkileşimi
 * YOKTUR (aksiyon niteliği taşımayan salt-görsel span'dır).
 */
import { escapeHtml } from '../validation';

/**
 * Etiket yanına kompakt ⓘ rozeti döner; `text` hover'da tooltip olarak görünür.
 * Buton/label içine güvenle yuvalanır (odaklanabilir değildir; ekran okuyucu için aria-label).
 */
export function infoTip(text: string): string {
  const safe = escapeHtml(text);
  return `<span class="info-tip" aria-label="${safe}" title="${safe}">i</span>`;
}
