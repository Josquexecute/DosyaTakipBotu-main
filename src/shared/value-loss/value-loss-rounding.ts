/**
 * v0.6.x — AI Değer Kaybı Yardımcısı v3: yuvarlama yardımcısı (SAF).
 *
 * Uygulama esasları 3.21: ön hesap tutarı 500 TL ve katlarına YUKARI yönlü yuvarlanır
 * (kaynak modüldeki C1 yuvarlama dallarıyla uyumlu: kalan ≤500 → +500, >500 → +1000).
 */

/**
 * Tutarı verilen adımın katına YUKARI yuvarlar. Negatif tutar 0'a çekilir; sayı değilse
 * undefined döner (hesap yapılmamış gibi davranılmaz).
 */
export function roundValueLossAmount(amount: unknown, step = 500): number | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
  if (amount <= 0) return 0;
  const safeStep = typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : 500;
  return Math.ceil(amount / safeStep) * safeStep;
}
