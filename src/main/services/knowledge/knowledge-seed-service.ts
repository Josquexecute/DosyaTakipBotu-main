import { normalizeKnowledgeTags } from '../../../shared/knowledge/knowledge-tags';
import type { KnowledgeChunk, KnowledgeChunkPriority, KnowledgeRegistryData, KnowledgeSource, KnowledgeSourceType } from '../../../shared/knowledge/knowledge-types';
import { normalizeKnowledgeIndexText } from './knowledge-normalizer';

interface SeedSourceInput {
  sourceId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  tags: string[];
  description: string;
  chunks: Array<{
    chunkId: string;
    title: string;
    text: string;
    tags?: string[];
    section?: string;
    priority?: KnowledgeChunkPriority;
  }>;
}

const SEED_CREATED_AT = '2026-06-20T00:00:00.000Z';

const BUILT_IN_SEEDS: SeedSourceInput[] = [
  {
    sourceId: 'seed-heavy-damage-threshold',
    title: 'Agir Hasar Kritik Parca Ozet Kurali',
    sourceType: 'heavy_damage_rule',
    tags: ['agir_hasar', 'kritik_parca', 'pert'],
    description: 'Agir hasar kritik parca puan esigi icin local seed bilgi.',
    chunks: [
      {
        chunkId: 'seed-heavy-damage-threshold:chunk-1',
        title: '35 puan agir hasar esigi',
        text: 'Kritik parca puanlamasinda 35 puan ve uzeri agir hasar esigi olarak degerlendirilir. AI sonucu nihai karar degildir; eksper onayi gerekir.',
        priority: 'critical'
      }
    ]
  },
  {
    sourceId: 'seed-front-firewall-rule',
    title: 'On Gogus Saci Degisim Kurali',
    sourceType: 'heavy_damage_rule',
    tags: ['agir_hasar', 'kritik_parca', 'on_gogus_saci'],
    description: 'On gogus saci/firewall yapisal ayrimi icin local seed bilgi.',
    chunks: [
      {
        chunkId: 'seed-front-firewall-rule:chunk-1',
        title: 'On gogus saci ve firewall ayrimi',
        text: 'On gogus saci veya firewall bolgesi degisim gerektiriyorsa 40 puan olarak degerlendirilir ve 35 puan agir hasar esigini tek basina asar. Torpido/plastik gogus ile yapisal on gogus saci ayrimi kullanici tarafindan teyit edilmelidir.',
        priority: 'critical'
      }
    ]
  },
  {
    sourceId: 'seed-airbag-safety-system',
    title: 'Airbag ve Emniyet Sistemi Kurali',
    sourceType: 'heavy_damage_rule',
    tags: ['agir_hasar', 'airbag', 'emniyet_sistemi'],
    description: 'Airbag ve emniyet sistemi mukerrer puan guvenligi icin local seed bilgi.',
    chunks: [
      {
        chunkId: 'seed-airbag-safety-system:chunk-1',
        title: 'Airbag ve emniyet sistemi grup kontrolu',
        text: 'Hava yastiklari ve emniyet sistemleri agir hasar kritik parca degerlendirmesinde grup olarak ele alinmalidir. Ayni sistem icinde mukerrer puan sismesi engellenmelidir.',
        priority: 'high'
      }
    ]
  },
  {
    sourceId: 'seed-policy-deductible-check',
    title: 'Police Muafiyet Genel Kontrol',
    sourceType: 'policy_rule',
    tags: ['police', 'muafiyet', 'indirim', 'kiymet_kazanma'],
    description: 'Police ozel sart ve muafiyet kontrolu icin local seed bilgi.',
    chunks: [
      {
        chunkId: 'seed-policy-deductible-check:chunk-1',
        title: 'Police muafiyet ve tenzil kontrolu',
        text: 'Police incelemesinde genel muafiyet, hasarsizlik indirimi, kiymet kazanma tenzili, cam servis muafiyeti, pert arac klozu ve ozel sartlar ayri ayri kontrol edilmelidir.',
        priority: 'high'
      }
    ]
  },
  {
    sourceId: 'seed-ai-safety-principle',
    title: 'AI Guvenlik Ilkesi',
    sourceType: 'policy_rule',
    tags: ['ai', 'guvenlik', 'onay'],
    description: 'AI on degerlendirme ve kullanici onayi ilkesi icin local seed bilgi.',
    chunks: [
      {
        chunkId: 'seed-ai-safety-principle:chunk-1',
        title: 'AI kullanici onayi olmadan yazmaz',
        text: 'AI tarafindan uretilen bilgi on degerlendirmedir. Kalici veri yazma, takip.json guncelleme veya Excel kaydetme kullanici onayi olmadan yapilamaz.',
        priority: 'critical'
      }
    ]
  }
];

export function loadBuiltInKnowledgeSeeds(): KnowledgeRegistryData {
  const sources: KnowledgeSource[] = [];
  const chunks: KnowledgeChunk[] = [];

  for (const seed of BUILT_IN_SEEDS) {
    const sourceTags = normalizeKnowledgeTags(seed.tags);
    const source: KnowledgeSource = {
      sourceId: seed.sourceId,
      title: seed.title,
      sourceType: seed.sourceType,
      version: 'v0.6.0-p2a-seed',
      createdAt: SEED_CREATED_AT,
      tags: sourceTags,
      description: seed.description,
      owner: 'system',
      isEnabled: true
    };
    sources.push(source);
    for (const chunkInput of seed.chunks) {
      const chunkTags = normalizeKnowledgeTags([...(chunkInput.tags ?? []), ...seed.tags]);
      const chunk: KnowledgeChunk = {
        chunkId: chunkInput.chunkId,
        sourceId: seed.sourceId,
        title: chunkInput.title,
        text: chunkInput.text,
        normalizedText: normalizeKnowledgeIndexText(seed.title, chunkInput.title, chunkInput.text, chunkTags.join(' ')),
        tags: chunkTags,
        ...(chunkInput.section ? { section: chunkInput.section } : {}),
        priority: chunkInput.priority ?? 'normal',
        createdAt: SEED_CREATED_AT
      };
      chunks.push(chunk);
    }
  }

  return { sources, chunks };
}
