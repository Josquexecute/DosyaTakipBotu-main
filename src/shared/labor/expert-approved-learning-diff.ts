/**
 * v0.6.x — AI İşçilik v3.2: Mevcut AI önerisi ile eksper onaylı geçmiş dağıtım FARK karşılaştırması (SAF).
 * Yalnız gösterim/evidence; Excel'e hiçbir şey yazmaz, dağıtımı otomatik değiştirmez.
 */
import type { AutoLaborCategory } from '../types';
import type { ExpertLaborDiffView, ExpertLearningMatchLevel, LaborDistribution } from './expert-approved-learning-types';

const CATEGORY_LABEL: Record<keyof LaborDistribution, string> = {
  kaporta: 'Kaporta', mekanik: 'Mekanik', elektrik: 'Elektrik',
  dosemeKilit: 'Döşeme/Kilit', cam: 'Cam', boya: 'Boya', onarim: 'Onarım'
};

const AI_CATEGORY_KEY: Record<AutoLaborCategory, keyof LaborDistribution> = {
  Kaporta: 'kaporta', Mekanik: 'mekanik', Elektrik: 'elektrik',
  'Döşeme/Kilit': 'dosemeKilit', Cam: 'cam', Boya: 'boya', Onarım: 'onarim'
};

export interface LaborDistributionDiff {
  category: keyof LaborDistribution;
  label: string;
  ai: number;
  expert: number;
  delta: number;
}

export interface ExpertDistributionComparison {
  diffs: LaborDistributionDiff[];
  totalDelta: number;
  identical: boolean;
}

/** AI önizleme satırının amounts'unu (AutoLaborCategory) LaborDistribution'a çevirir. */
export function aiAmountsToDistribution(amounts: Partial<Record<AutoLaborCategory, number>>): LaborDistribution {
  const dist: LaborDistribution = { kaporta: 0, mekanik: 0, elektrik: 0, dosemeKilit: 0, cam: 0, boya: 0, onarim: 0 };
  for (const [cat, value] of Object.entries(amounts)) {
    const key = AI_CATEGORY_KEY[cat as AutoLaborCategory];
    if (key && typeof value === 'number') dist[key] += value;
  }
  return dist;
}

/** İki dağıtımı karşılaştırır; yalnız farklı kategorileri döner. */
export function compareLaborDistribution(ai: LaborDistribution, expert: LaborDistribution): ExpertDistributionComparison {
  const diffs: LaborDistributionDiff[] = [];
  let totalDelta = 0;
  (Object.keys(CATEGORY_LABEL) as (keyof LaborDistribution)[]).forEach((key) => {
    const a = ai[key] ?? 0;
    const e = expert[key] ?? 0;
    if (a !== e) {
      diffs.push({ category: key, label: CATEGORY_LABEL[key], ai: a, expert: e, delta: e - a });
      totalDelta += Math.abs(e - a);
    }
  });
  return { diffs, totalDelta, identical: diffs.length === 0 };
}

/** Fark özetini kısa Türkçe metne çevirir (satır gerekçesine eklenebilir). */
export function describeDistributionDiff(cmp: ExpertDistributionComparison): string {
  if (cmp.identical) return 'AI önerisi eksper örneğiyle birebir aynı.';
  const cats = cmp.diffs.map((d) => d.label).join(', ');
  return `AI önerisi ile eksper örneği arasında ${cats} kalemlerinde fark var (toplam ${cmp.totalDelta} ₺). Kullanıcı onayı olmadan uygulanmaz.`;
}

/**
 * v3.3: Bir satır için diff görünümü kurar (UI diff kartı verisi). writePolicy DAİMA 'preview_only' —
 * bu model Excel'e yazma davranışı taşımaz; yalnız karşılaştırma gösterir.
 */
export function buildExpertLaborDiffView(
  rowIndex: number,
  matchLevel: Exclude<ExpertLearningMatchLevel, 'none'>,
  matchReasons: readonly string[],
  matchWarnings: readonly string[],
  aiDistribution: LaborDistribution,
  expertDistribution: LaborDistribution,
  vehicleSource: 'active-file' | 'excel' | 'unknown' = 'unknown'
): ExpertLaborDiffView {
  const cmp = compareLaborDistribution(aiDistribution, expertDistribution);
  return {
    rowIndex,
    matchLevel,
    matchReasons: [...matchReasons],
    matchWarnings: [...matchWarnings],
    aiDistribution,
    expertDistribution,
    differences: cmp.diffs.map((d) => ({ field: d.category, label: d.label, aiAmount: d.ai, expertAmount: d.expert, delta: d.delta })),
    totalDelta: cmp.totalDelta,
    writePolicy: 'preview_only',
    vehicleSource
  };
}
