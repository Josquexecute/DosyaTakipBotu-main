import { normalizeSearch } from './turkish';

/**
 * İşçilik sınıflandırma kural tabanı (saf, çevrimdışı, deterministik).
 * v0.5.0 hazırlığı: kararlar artık pozitif kanıt puanı + negatif engel + çakışma çözümü ile açıklanır.
 * Karar önceliği classifier-service içinde korunur: öğrenen sözlük > bu kurallar > fiyat listesi.
 */

export type LaborCategory = 'Kaporta' | 'Boya' | 'Mekanik' | 'Elektrik' | 'Cam' | 'Döşeme/Kilit' | 'Onarım';

export const LABOR_CATEGORIES: readonly LaborCategory[] = ['Kaporta', 'Boya', 'Mekanik', 'Elektrik', 'Cam', 'Döşeme/Kilit', 'Onarım'];

export type LaborConfidence = 'Yüksek' | 'Orta' | 'Düşük';

/** Kategori başına varsayılan referans işçilik (fiyat listesi/öğrenme yoksa). 250 katı, kuruşsuz. */
export const DEFAULT_CATEGORY_AMOUNT: Record<LaborCategory, number> = {
  Kaporta: 2500,
  Boya: 6500,
  Mekanik: 2500,
  Elektrik: 1500,
  Cam: 1500,
  'Döşeme/Kilit': 1500,
  Onarım: 2000
};

const KEYWORD_RULES: Array<{ category: LaborCategory; phrases: string[] }> = [
  { category: 'Cam', phrases: ['on cam', 'ön cam', 'arka cam', 'kapi cami', 'kapı camı', 'kelebek cami', 'kelebek camı', 'cam fitili', 'cam krikosu', 'cam mekanizmasi', 'cam mekanizması', 'cam', 'tavan cami', 'tavan camı', 'sunroof'] },
  { category: 'Döşeme/Kilit', phrases: ['emniyet kemeri', 'kemer tokasi', 'kemer tokası', 'hava yastigi', 'hava yastığı', 'airbag', 'tavan dosemesi', 'tavan döşemesi', 'koltuk', 'doseme', 'döşeme', 'torpido', 'ic trim', 'iç trim', 'kapi kolu', 'kapı kolu', 'kapi acma', 'kapı açma', 'kilit', 'kilit karsiligi', 'kilit karşılığı', 'guneslik', 'güneşlik', 'paspas', 'bagaj dosemesi', 'bagaj döşemesi'] },
  { category: 'Elektrik', phrases: ['motor elektrik tesisati', 'motor elektrik tesisatı', 'elektrik tesisati', 'elektrik tesisatı', 'gunduz surus fari', 'gündüz sürüş farı', 'far', 'stop', 'sinyal', 'sensor', 'sensör', 'kamera', 'radar', 'beyin', 'ecu', 'modul', 'modül', 'sigorta kutusu', 'sigorta', 'tesisat', 'kablo', 'soket', 'korna', 'buji', 'bobin', 'role', 'röle', 'anten', 'ekran', 'multimedya', 'hoparlor', 'hoparlör', 'xenon', 'led', 'ampul', 'sis far', 'plaka lambasi', 'plaka lambası'] },
  { category: 'Mekanik', phrases: ['yag pompasi', 'yağ pompası', 'egr valfi', 'hava filtresi', 'filtre kutusu', 'motor', 'sanziman', 'şanzıman', 'sarsiman', 'radyator', 'radyatör', 'turbo', 'intercooler', 'dinamo', 'alternator', 'alternatör', 'sarj dinamosu', 'şarj dinamosu', 'pompa', 'egr', 'valf', 'filtre', 'kompresor', 'kompresör', 'klima kompresoru', 'klima kompresörü', 'egzoz', 'katalizator', 'katalizatör', 'aks', 'porya', 'salincak', 'salıncak', 'rotil', 'rot', 'amortisor', 'amortisör', 'suspansiyon', 'süspansiyon', 'mafsal', 'debriyaj', 'fren', 'kaliper', 'balata', 'fren diski', 'mars', 'marş', 'triger', 'kasnak', 'takoz', 'fan', 'su pompasi', 'su pompası', 'devirdaim', 'karter', 'diferansiyel', 'sanziman askisi', 'şanzıman askısı', 'direksiyon kutusu', 'rot mili', 'rot basi', 'rot başı', 'jant', 'lastik', 'bilya', 'rulman'] },
  { category: 'Kaporta', phrases: ['motor kaputu', 'radyator panjuru', 'radyatör panjuru', 'radyator izgarasi', 'radyatör ızgarası', 'baglanti parcasi', 'bağlantı parçası', 'tampon', 'kaput', 'kaputu', 'camurluk', 'çamurluk', 'davlumbaz', 'kapi', 'kapı', 'on panel', 'ön panel', 'arka panel', 'panel', 'marspiyel', 'marşpiyel', 'travers', 'sac', 'sase', 'şase', 'sasi', 'şasi', 'besik', 'beşik', 'bagaj', 'tavan', 'dikme', 'direk', 'sutun', 'sütun', 'izgara', 'ızgara', 'panjur', 'spoiler', 'spoyler', 'tampon demiri', 'braket', 'destek', 'havuz', 'taban saci', 'taban sacı', 'orta direk'] }
];

const PAINTABLE_BODY_PHRASES = ['tampon', 'kaput', 'kaputu', 'camurluk', 'çamurluk', 'kapi', 'kapı', 'on panel', 'ön panel', 'arka panel', 'panel', 'marspiyel', 'marşpiyel', 'bagaj', 'tavan', 'dikme', 'direk', 'sutun', 'sütun', 'davlumbaz', 'spoiler', 'spoyler'];
const PAINT_REVIEW_ONLY_PHRASES = ['davlumbaz'];
const REPAIR_PHRASES = ['onarim', 'onarım', 'tamir', 'duzeltme', 'düzeltme', 'sok tak', 'sök tak', 'sok-tak', 'sök-tak', 'mobil onarim', 'mobil onarım', 'plastik tamir', 'isil', 'ısıl', 'pdr'];
const EXTERIOR_ELECTRIC_PHRASES = ['far', 'stop', 'sinyal', 'sis far', 'gunduz surus fari', 'gündüz sürüş farı'];

const FALSE_CAM_PHRASES = ['camurluk', 'çamurluk', 'davlumbaz'];
const BODY_NOT_MECHANICAL_PHRASES = ['motor kaputu', 'kaput', 'kaputu', 'radyator panjuru', 'radyatör panjuru', 'radyator izgarasi', 'radyatör ızgarası', 'panjur', 'izgara', 'ızgara', 'camurluk', 'çamurluk', 'davlumbaz', 'travers', 'marspiyel', 'marşpiyel'];
const STRONG_ELECTRIC_PHRASES = ['motor elektrik tesisati', 'motor elektrik tesisatı', 'elektrik tesisati', 'elektrik tesisatı', 'sigorta kutusu', 'tesisat', 'beyin', 'sensor', 'sensör', 'far', 'stop', 'radar', 'kamera', 'modul', 'modül', 'kablo', 'soket'];
const STRONG_MECHANICAL_PHRASES = ['yag pompasi', 'yağ pompası', 'egr valfi', 'hava filtresi', 'filtre kutusu', 'sarj dinamosu', 'şarj dinamosu', 'alternator', 'alternatör', 'dinamo', 'motor', 'sanziman', 'şanzıman', 'turbo', 'radyator', 'radyatör', 'kompresor', 'kompresör', 'egzoz', 'aks', 'salincak', 'salıncak', 'amortisor', 'amortisör', 'pompa', 'egr', 'valf', 'filtre'];
const TRUE_GLASS_PHRASES = ['on cam', 'ön cam', 'arka cam', 'kapi cami', 'kapı camı', 'kelebek cami', 'kelebek camı', 'cam fitili', 'cam krikosu', 'cam mekanizmasi', 'cam mekanizması', 'tavan cami', 'tavan camı', 'sunroof', 'cam'];

interface CategoryEvidence {
  category: LaborCategory;
  score: number;
  matchedPhrases: string[];
  strongestPhrase: string;
}

export interface RuleClassification {
  categories: LaborCategory[];
  confidence: LaborConfidence;
  needsReview: boolean;
  reason: string;
}

export function roundTo250(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount / 250) * 250;
}

function wordMatchesToken(word: string, token: string): boolean {
  if (word === token) return true;
  if (token === 'CAM') return /^(CAM|CAMI|CAMA|CAMIN|CAMINI|CAMDA|CAMDAN|CAMLAR|CAMLARI)$/.test(word);
  if (token === 'FAR') return /^(FAR|FARI|FARA|FARIN|FARINI|FARLAR|FARLARI)$/.test(word);
  if (token === 'STOP') return /^(STOP|STOPU|STOPA|STOPUN|STOPUNU|STOPLAR|STOPLARI)$/.test(word);
  if (token.length >= 4 && word.startsWith(token)) return true;
  if (token.length >= 5 && word.startsWith(token.slice(0, -1))) return true;
  return false;
}

function phraseScore(normalized: string, phrase: string): number {
  const p = normalizeSearch(phrase);
  if (!p) return 0;
  const tokens = p.split(' ').filter(Boolean);
  const words = normalized.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    for (let index = 0; index <= words.length - tokens.length; index += 1) {
      const matches = tokens.every((token, offset) => wordMatchesToken(words[index + offset] ?? '', token));
      if (matches) return p.length + tokens.length * 10;
    }
    return 0;
  }
  for (const word of words) {
    if (wordMatchesToken(word, p)) return word === p ? p.length + 5 : p.length;
  }
  return 0;
}

function collectEvidence(normalized: string): CategoryEvidence[] {
  const evidence: CategoryEvidence[] = [];
  for (const rule of KEYWORD_RULES) {
    const matches = rule.phrases
      .map((phrase) => ({ phrase, score: phraseScore(normalized, phrase) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!matches.length) continue;
    const strongest = matches[0]!;
    const secondary = matches.slice(1, 4).reduce((sum, item) => sum + Math.min(item.score, 8), 0);
    evidence.push({
      category: rule.category,
      score: strongest.score + secondary,
      matchedPhrases: matches.slice(0, 3).map((item) => item.phrase),
      strongestPhrase: strongest.phrase
    });
  }
  return evidence.sort((a, b) => b.score - a.score);
}

function hasAny(normalized: string, phrases: readonly string[]): string | null {
  for (const phrase of phrases) {
    if (phraseScore(normalized, phrase) > 0) return phrase;
  }
  return null;
}

function addBlock(blocked: Map<LaborCategory, string[]>, category: LaborCategory, reason: string): void {
  const list = blocked.get(category) ?? [];
  list.push(reason);
  blocked.set(category, list);
}

function buildBlockedCategories(normalized: string): Map<LaborCategory, string[]> {
  const blocked = new Map<LaborCategory, string[]>();
  const falseCam = hasAny(normalized, FALSE_CAM_PHRASES);
  if (falseCam) addBlock(blocked, 'Cam', `cam benzeri kelime "${falseCam}" gerçek cam değildir`);

  const bodySignal = hasAny(normalized, BODY_NOT_MECHANICAL_PHRASES);
  if (bodySignal) addBlock(blocked, 'Mekanik', `"${bodySignal}" gövde/kaporta kanıtıdır; mekanik sayılmaz`);

  const electricSignal = hasAny(normalized, STRONG_ELECTRIC_PHRASES);
  if (electricSignal) {
    for (const category of ['Kaporta', 'Boya', 'Mekanik', 'Cam'] as LaborCategory[]) {
      addBlock(blocked, category, `"${electricSignal}" elektrik kanıtıdır; ${category} otomatik seçilmez`);
    }
  }

  const glassSignal = hasAny(normalized, TRUE_GLASS_PHRASES);
  if (glassSignal && !falseCam) {
    for (const category of ['Kaporta', 'Boya', 'Mekanik', 'Elektrik'] as LaborCategory[]) {
      addBlock(blocked, category, `"${glassSignal}" gerçek cam kanıtıdır; ${category} otomatik seçilmez`);
    }
  }

  const mechanicalSignal = hasAny(normalized, STRONG_MECHANICAL_PHRASES);
  if (mechanicalSignal && !bodySignal && !electricSignal) {
    for (const category of ['Cam', 'Kaporta', 'Boya', 'Elektrik'] as LaborCategory[]) {
      addBlock(blocked, category, `"${mechanicalSignal}" mekanik kanıtıdır; ${category} otomatik seçilmez`);
    }
  }
  return blocked;
}

function uniqueReasons(blocked: Map<LaborCategory, string[]>): string[] {
  return [...new Set([...blocked.values()].flat())];
}

export function classifyByRules(partName: string, partCode = '', note = ''): RuleClassification {
  const normalized = normalizeSearch(`${partName} ${note}`);
  if (!normalized.trim()) {
    return { categories: ['Onarım'], confidence: 'Düşük', needsReview: true, reason: 'Parça adı okunamadı; varsayılan Onarım seçildi, kontrol gerekli.' };
  }

  const repair = hasAny(normalized, REPAIR_PHRASES);
  const blockers = buildBlockedCategories(normalized);
  const evidence = collectEvidence(normalized);
  const eligible = evidence.filter((item) => !blockers.has(item.category));
  const best = eligible[0];

  if (!best) {
    const fallback: LaborCategory = repair ? 'Onarım' : 'Kaporta';
    const negative = uniqueReasons(blockers);
    return {
      categories: [fallback],
      confidence: 'Düşük',
      needsReview: true,
      reason: [`Bilinmeyen parça ("${partName.trim()}"); en yakın mantıklı işçilik ${fallback} seçildi, kontrol gerekli.`, negative.length ? `Negatif kurallar: ${negative.join('; ')}.` : ''].filter(Boolean).join(' ')
    };
  }

  const categories: LaborCategory[] = [best.category];
  const reasons: string[] = [`Kanıt: ${best.category} için ${best.matchedPhrases.map((p) => `"${p}"`).join(', ')} (puan ${Math.round(best.score)}).`];
  const negative = uniqueReasons(blockers).filter((reason) => !reason.includes(`${best.category} otomatik seçilmez`));
  if (negative.length) reasons.push(`Negatif kurallar: ${negative.join('; ')}.`);

  let confidence: LaborConfidence = 'Yüksek';
  let needsReview = false;

  const second = eligible[1];
  if (second && second.score >= best.score * 0.75) {
    confidence = 'Orta';
    needsReview = true;
    reasons.push(`Yakın ikinci aday ${second.category} (${second.matchedPhrases.join(', ')}) olduğu için kontrol gerekli.`);
  }

  if (best.category === 'Kaporta' && hasAny(normalized, PAINTABLE_BODY_PHRASES)) {
    const reviewOnly = hasAny(normalized, PAINT_REVIEW_ONLY_PHRASES);
    if (reviewOnly) {
      confidence = confidence === 'Yüksek' ? 'Orta' : confidence;
      needsReview = true;
      reasons.push(`"${reviewOnly}" satırında boya otomatik yazılmadı; boya gerekiyorsa kullanıcı kontrolü gerekir.`);
    } else {
      categories.push('Boya');
      reasons.push('Boyanacak dış gövde parçası olduğu için Boya da eklendi.');
    }
  }

  if (best.category === 'Elektrik' && hasAny(normalized, EXTERIOR_ELECTRIC_PHRASES)) {
    confidence = 'Orta';
    needsReview = true;
    reasons.push('Dış aydınlatma/elektrik parçası; gerekiyorsa boya/kaporta eklenmesi kullanıcı kontrolü gerektirir.');
  }

  if (repair && (best.category === 'Kaporta' || best.category === 'Mekanik')) {
    confidence = confidence === 'Yüksek' ? 'Orta' : confidence;
    needsReview = true;
    reasons.push('Onarım/tamir ifadesi var; değişim yerine onarım işçiliği olabilir.');
  }

  return { categories, confidence, needsReview, reason: reasons.join(' ') };
}

export function applyDistributionConstraints(categories: LaborCategory[], normalizedName: string): { categories: LaborCategory[]; removed: string[] } {
  const set = new Set(categories);
  const removed: string[] = [];
  const blockers = buildBlockedCategories(normalizedName);
  for (const category of [...set]) {
    const reasons = blockers.get(category);
    if (reasons?.length) {
      set.delete(category);
      removed.push(`${category} (${reasons.join('; ')})`);
    }
  }

  const isCam = hasAny(normalizedName, TRUE_GLASS_PHRASES) !== null && set.has('Cam');
  const isElectric = set.has('Elektrik');
  const isExteriorElectric = hasAny(normalizedName, EXTERIOR_ELECTRIC_PHRASES) !== null;

  if (set.has('Mekanik') && set.has('Cam')) { set.delete('Cam'); removed.push('Cam (mekanik parçaya cam işçiliği yazılmaz)'); }
  if (isCam && set.has('Mekanik')) { set.delete('Mekanik'); removed.push('Mekanik (cam parçasına mekanik yazılmaz)'); }
  if (isElectric && !isExteriorElectric) {
    if (set.has('Kaporta')) { set.delete('Kaporta'); removed.push('Kaporta (elektrik parçasına kaporta yazılmaz)'); }
    if (set.has('Boya')) { set.delete('Boya'); removed.push('Boya (elektrik parçasına boya yazılmaz)'); }
  }

  const next = LABOR_CATEGORIES.filter((category) => set.has(category));
  return { categories: next.length ? next : categories.slice(0, 1), removed };
}
