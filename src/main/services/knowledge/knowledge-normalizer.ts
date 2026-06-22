const SYNONYM_RULES: Array<{ phrase: string; terms: string[] }> = [
  { phrase: 'airbag', terms: ['hava', 'yastigi', 'emniyet', 'sistemi'] },
  { phrase: 'hava yastigi', terms: ['airbag', 'emniyet', 'sistemi'] },
  { phrase: 'emniyet kemeri', terms: ['kemer', 'emniyet', 'sistemi'] },
  { phrase: 'kemer', terms: ['emniyet', 'sistemi'] },
  { phrase: 'tenzil', terms: ['muafiyet', 'indirim'] },
  { phrase: 'muafiyet', terms: ['tenzil'] },
  { phrase: 'pert', terms: ['agir', 'hasar'] },
  { phrase: 'agir hasar', terms: ['pert'] },
  { phrase: 'on gogus', terms: ['firewall', 'gogus', 'saci'] },
  { phrase: 'firewall', terms: ['on', 'gogus', 'saci'] }
];

export function normalizeKnowledgeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeKnowledgeText(input: unknown): string[] {
  const normalized = normalizeKnowledgeText(input);
  const tokens = new Set(normalized.split(' ').filter((token) => token.length >= 2));
  for (const rule of SYNONYM_RULES) {
    if (!normalized.includes(rule.phrase)) continue;
    for (const term of rule.terms) tokens.add(term);
  }
  return [...tokens];
}

export function normalizeKnowledgeIndexText(...parts: unknown[]): string {
  const normalized = normalizeKnowledgeText(parts.filter((part) => typeof part === 'string' && part.trim()).join(' '));
  const tokens = tokenizeKnowledgeText(normalized);
  return [...new Set([...normalized.split(' ').filter(Boolean), ...tokens])].join(' ');
}
