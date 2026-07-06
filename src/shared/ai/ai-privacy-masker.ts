/**
 * v0.6.x — Gizlilik / maskeleme yardımcıları (SAF: string -> string).
 *
 * Ağ/dosya/electron YOK. Bu görevde AI'ya veri GÖNDERMEZ; ileride harici AI öncesi hassas veriyi
 * maskelemek için altyapı hazırlığıdır. Yalnız metin dönüştürür.
 */

/** Plaka -> PLAKA-***  (ör. "34 ABC 123" / "34ABC123"). */
export function maskPlate(input: string): string {
  if (typeof input !== 'string') return input;
  return input.replace(/\b\d{2}\s?[A-Za-zÇĞİÖŞÜçğıöşü]{1,4}\s?\d{2,5}\b/g, 'PLAKA-***');
}

/** TC/VKN benzeri 10-11 haneli numara -> KIMLIK-***. */
export function maskTcVkn(input: string): string {
  if (typeof input !== 'string') return input;
  return input.replace(/\b\d{10,11}\b/g, 'KIMLIK-***');
}

/** Telefon (0 ile başlayan 10-11 hane veya +90...) -> TELEFON-***. */
export function maskPhone(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/(?:\+90|0)\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g, 'TELEFON-***');
}

/** E-posta -> EMAIL-***. */
export function maskEmail(input: string): string {
  if (typeof input !== 'string') return input;
  return input.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, 'EMAIL-***');
}

/** IBAN (TR + 24 hane) -> IBAN-***. */
export function maskIban(input: string): string {
  if (typeof input !== 'string') return input;
  return input.replace(/\bTR\d{2}[\s]?(?:\d{4}[\s]?){5}\d{2}\b/gi, 'IBAN-***');
}

/** Tüm maskeleri sırayla uygular (telefon, kimlik, plaka, e-posta, IBAN). */
export function maskSensitiveText(input: string): string {
  if (typeof input !== 'string') return input;
  // Sıra önemlidir: telefon ve IBAN, TC/VKN'den önce çalışır ki rakam dizileri doğru sınıflandırılsın.
  let out = input;
  out = maskEmail(out);
  out = maskIban(out);
  out = maskPhone(out);
  out = maskTcVkn(out);
  out = maskPlate(out);
  return out;
}
