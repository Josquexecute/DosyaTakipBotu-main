import { normalizeSearch } from '../../shared/turkish';
import {
  applyDistributionConstraints,
  classifyByRules,
  DEFAULT_CATEGORY_AMOUNT,
  roundTo250,
  type LaborCategory,
  type LaborConfidence
} from '../../shared/labor-rules';
import { FUZZY_CONFIDENT_THRESHOLD, lookupLearned, type LaborLearningEntry } from '../../shared/labor-learning-dictionary';
import { normalizePartName } from '../../shared/parca-sozlugu';
import { BUILTIN_PRICE_LIST } from '../../shared/price-list';

/**
 * İşçilik sınıflandırma servisi (yerel, çevrimdışı). Karar önceliği: ÖĞRENEN SÖZLÜK > KURAL MOTORU > FİYAT LİSTESİ.
 * Her satır için her zaman bir karar üretir (bilinmeyen parçada en yakın mantıklı + "Kontrol gerekli").
 */
export interface LaborDecision {
  categories: LaborCategory[];
  amounts: Partial<Record<LaborCategory, number>>;
  confidence: LaborConfidence;
  needsReview: boolean;
  reason: string;
  source: 'learned' | 'rules' | 'price-list' | 'fallback';
}

const CATEGORY_ISLEM_KEYWORDS: Record<LaborCategory, string[]> = {
  Kaporta: ['KAPORTA'],
  Boya: ['DEGISIM BOYA', 'MACUNLU BOYA', 'BOYA'],
  Mekanik: ['ROT BALANS', 'MOBIL ONARIM'],
  Elektrik: ['ELEKTRIK', 'RADAR SENSORU'],
  Cam: ['CAM'],
  'Döşeme/Kilit': ['DOSEME'],
  Onarım: ['MOBIL ONARIM', 'BEDEL']
};

/** Fiyat listesinden bir parça + kategori için referans tutar (yoksa null). */
function priceListAmount(canonical: string, category: LaborCategory): number | null {
  const norm = normalizeSearch(canonical);
  if (!norm) return null;
  const entries = BUILTIN_PRICE_LIST.filter((e) => normalizeSearch(e.parca) === norm);
  if (entries.length === 0) return null;
  for (const kw of CATEGORY_ISLEM_KEYWORDS[category]) {
    const hit = entries.find((e) => normalizeSearch(e.islem).includes(kw));
    if (hit && Number.isFinite(hit.ustTutar) && hit.ustTutar > 0) return hit.ustTutar;
  }
  return null;
}

/** Kategori başına tutar: öğrenilen > fiyat listesi > kategori varsayılanı (250 katı). */
function computeAmounts(categories: LaborCategory[], learnedAmounts: Partial<Record<LaborCategory, number>> | undefined, partName: string): Partial<Record<LaborCategory, number>> {
  const canonical = (() => {
    const m = normalizePartName(partName);
    return m.matched ? m.core : partName;
  })();
  const amounts: Partial<Record<LaborCategory, number>> = {};
  for (const category of categories) {
    const learned = learnedAmounts?.[category];
    const base = learned ?? priceListAmount(canonical, category) ?? DEFAULT_CATEGORY_AMOUNT[category];
    amounts[category] = roundTo250(base);
  }
  return amounts;
}

export function classifyLaborRow(partName: string, partCode = '', note = '', learned: readonly LaborLearningEntry[] = []): LaborDecision {
  // 1) Öğrenen sözlük — kuraldan ÖNCE.
  const match = lookupLearned(learned, partName, partCode);
  if (match) {
    const confident = match.matchType === 'exact' || match.score >= FUZZY_CONFIDENT_THRESHOLD;
    const categories = match.entry.categories.length ? match.entry.categories : ['Onarım' as LaborCategory];
    return {
      categories,
      amounts: computeAmounts(categories, match.entry.amounts, partName),
      confidence: confident ? 'Yüksek' : 'Düşük',
      needsReview: !confident,
      reason: confident
        ? `Öğrenilen karar uygulandı (${match.matchType === 'exact' ? 'tam eşleşme' : `benzer parça %${Math.round(match.score * 100)}`}): "${match.entry.alias}" → ${categories.join(', ')}.`
        : `Benzer öğrenilmiş parça bulundu (güven %${Math.round(match.score * 100)}); en yakın karar uygulandı, kontrol gerekli.`,
      source: 'learned'
    };
  }

  // 2) Kural motoru + dağıtım kısıtları.
  const ruled = classifyByRules(partName, partCode, note);
  const constrained = applyDistributionConstraints(ruled.categories, normalizeSearch(`${partName} ${note}`));
  const categories = constrained.categories;
  const reason = [ruled.reason, constrained.removed.length ? `Dağıtım kısıtı: ${constrained.removed.join('; ')}.` : '']
    .filter(Boolean)
    .join(' ');
  return {
    categories,
    amounts: computeAmounts(categories, undefined, partName),
    confidence: ruled.confidence,
    needsReview: ruled.needsReview,
    reason,
    source: ruled.confidence === 'Düşük' ? 'fallback' : 'rules'
  };
}
