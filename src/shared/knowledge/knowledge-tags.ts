export const KNOWLEDGE_TAGS = [
  'agir_hasar',
  'kritik_parca',
  'on_gogus_saci',
  'sasi',
  'airbag',
  'emniyet_sistemi',
  'elektrik_tesisati',
  'pert',
  'rayic',
  'hasar_orani',
  'ktt',
  'kusur',
  'asli_kusur',
  'tali_kusur',
  'police',
  'muafiyet',
  'indirim',
  'kiymet_kazanma',
  'eksper_notu',
  'mail_taslagi',
  'mutabakat',
  'belge_kontrol',
  'iscilik',
  'mekanik',
  'kaporta',
  'elektrik',
  'doseme',
  'cam',
  'boya',
  'ai',
  'guvenlik',
  'onay'
] as const;

export type KnownKnowledgeTag = typeof KNOWLEDGE_TAGS[number];

const KNOWLEDGE_TAG_SET = new Set<string>(KNOWLEDGE_TAGS);

const TAG_ALIASES: Record<string, KnownKnowledgeTag> = {
  agirhasar: 'agir_hasar',
  agir_hasar: 'agir_hasar',
  'agir hasar': 'agir_hasar',
  kritikparca: 'kritik_parca',
  kritik_parca: 'kritik_parca',
  'kritik parca': 'kritik_parca',
  ongogussaci: 'on_gogus_saci',
  on_gogus_saci: 'on_gogus_saci',
  'on gogus saci': 'on_gogus_saci',
  firewall: 'on_gogus_saci',
  emniyetsistemi: 'emniyet_sistemi',
  emniyet_sistemi: 'emniyet_sistemi',
  'emniyet sistemi': 'emniyet_sistemi',
  elektriktesisati: 'elektrik_tesisati',
  elektrik_tesisati: 'elektrik_tesisati',
  'elektrik tesisati': 'elektrik_tesisati',
  hasarorani: 'hasar_orani',
  hasar_orani: 'hasar_orani',
  'hasar orani': 'hasar_orani',
  aslikusur: 'asli_kusur',
  asli_kusur: 'asli_kusur',
  'asli kusur': 'asli_kusur',
  talikusur: 'tali_kusur',
  tali_kusur: 'tali_kusur',
  'tali kusur': 'tali_kusur',
  kiymetkazanma: 'kiymet_kazanma',
  kiymet_kazanma: 'kiymet_kazanma',
  'kiymet kazanma': 'kiymet_kazanma',
  ekspernotu: 'eksper_notu',
  eksper_notu: 'eksper_notu',
  'eksper notu': 'eksper_notu',
  mailtaslagi: 'mail_taslagi',
  mail_taslagi: 'mail_taslagi',
  'mail taslagi': 'mail_taslagi',
  belgekontrol: 'belge_kontrol',
  belge_kontrol: 'belge_kontrol',
  'belge kontrol': 'belge_kontrol',
  doseme_kilit: 'doseme',
  'doseme kilit': 'doseme',
  tenzil: 'muafiyet',
  hava_yastigi: 'airbag',
  'hava yastigi': 'airbag'
};

export function normalizeKnowledgeTag(input: unknown): KnownKnowledgeTag | null {
  if (typeof input !== 'string') return null;
  const normalized = normalizeTagText(input);
  const alias = TAG_ALIASES[normalized] ?? TAG_ALIASES[normalized.replace(/\s+/g, '_')] ?? TAG_ALIASES[normalized.replace(/\s+/g, '')];
  if (alias) return alias;
  const underscored = normalized.replace(/\s+/g, '_');
  return KNOWLEDGE_TAG_SET.has(underscored) ? underscored as KnownKnowledgeTag : null;
}

export function normalizeKnowledgeTags(input: readonly unknown[] | undefined): KnownKnowledgeTag[] {
  const tags = new Set<KnownKnowledgeTag>();
  for (const item of input ?? []) {
    const tag = normalizeKnowledgeTag(item);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

export function isKnownKnowledgeTag(input: unknown): input is KnownKnowledgeTag {
  return normalizeKnowledgeTag(input) === input;
}

function normalizeTagText(input: string): string {
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
    .replace(/[^a-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
