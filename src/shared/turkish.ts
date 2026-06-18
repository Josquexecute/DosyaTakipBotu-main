const TURKISH_CHAR_MAP: Record<string, string> = {
  'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'I': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U',
  'ç': 'C', 'ğ': 'G', 'ı': 'I', 'i': 'I', 'ö': 'O', 'ş': 'S', 'ü': 'U',
  'â': 'A', 'Â': 'A', 'î': 'I', 'Î': 'I', 'û': 'U', 'Û': 'U'
};

export function normalizeTurkish(input: string): string {
  let out = '';
  for (const char of input) out += TURKISH_CHAR_MAP[char] ?? char;
  return out
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSearch(input: string): string {
  return normalizeTurkish(input).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function compactKey(input: string): string {
  return normalizeTurkish(input).replace(/[^A-Z0-9]/g, '');
}

export function includesNormalized(haystack: string, needle: string): boolean {
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}

export function plateKey(input: string): string {
  return compactKey(input);
}

export function safeFileDisplayName(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 180);
}
