import { normalizeSearch } from './turkish';

/**
 * İşçilik sınıflandırma kural tabanı (saf, çevrimdışı, deterministik).
 * Bir parça adını/kodunu 7 işçilik kategorisinden birine (veya birkaçına) eşler; güven seviyesi,
 * açıklanabilir gerekçe ve "kontrol gerekli" işareti üretir. AI katmanı yok — yerel kural motoru.
 * Karar önceliği (classifier-service'te): öğrenen sözlük > bu kurallar > fiyat listesi.
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

/**
 * Kategori anahtar kelimeleri. Çok kelimeli ifadeler (ör. "KAPI CAMI") tek kelimelere göre daha
 * spesifiktir ve daha yüksek puan alır; böylece "kapı camı" → Cam (Kaporta değil) olur.
 */
const KEYWORD_RULES: Array<{ category: LaborCategory; phrases: string[] }> = [
  { category: 'Cam', phrases: ['on cam', 'arka cam', 'kapi cami', 'kelebek cami', 'cam fitili', 'cam krikosu', 'cam mekanizmasi', 'cam', 'tavan cami', 'sunroof'] },
  { category: 'Döşeme/Kilit', phrases: ['emniyet kemeri', 'kemer tokasi', 'hava yastigi', 'airbag', 'tavan dosemesi', 'koltuk', 'doseme', 'torpido', 'ic trim', 'kapi kolu', 'kapi acma', 'kilit', 'kilit karsiligi', 'guneslik', 'paspas', 'bagaj dosemesi'] },
  { category: 'Elektrik', phrases: ['far', 'stop', 'sinyal', 'sensor', 'kamera', 'radar', 'beyin', 'ecu', 'modul', 'sigorta', 'tesisat', 'kablo', 'soket', 'korna', 'buji', 'bobin', 'role', 'anten', 'ekran', 'multimedya', 'hoparlor', 'xenon', 'led', 'ampul', 'sis far', 'plaka lambasi'] },
  { category: 'Mekanik', phrases: ['motor', 'sanziman', 'sarsiman', 'radyator', 'turbo', 'intercooler', 'dinamo', 'alternator', 'kompresor', 'klima kompresoru', 'egzoz', 'katalizator', 'aks', 'porya', 'salincak', 'rotil', 'rot', 'amortisor', 'suspansiyon', 'mafsal', 'debriyaj', 'fren', 'kaliper', 'balata', 'fren diski', 'mars', 'triger', 'kasnak', 'takoz', 'fan', 'su pompasi', 'devirdaim', 'karter', 'diferansiyel', 'sanziman askisi', 'direksiyon kutusu', 'rot mili', 'rot basi', 'jant', 'lastik', 'bilya', 'rulman'] },
  { category: 'Kaporta', phrases: ['radyator panjuru', 'radyator izgarasi', 'tampon', 'kaput', 'camurluk', 'davlumbaz', 'kapi', 'on panel', 'arka panel', 'panel', 'marspiyel', 'travers', 'sac', 'sase', 'sasi', 'besik', 'bagaj', 'tavan', 'dikme', 'direk', 'sutun', 'izgara', 'panjur', 'spoiler', 'spoyler', 'tampon demiri', 'braket', 'destek', 'havuz', 'taban saci', 'orta direk'] }
];

/** Boya gerektiren (boyanacak) dış gövde parçaları — Kaporta ile birlikte Boya eklenir. */
const PAINTABLE_BODY_PHRASES = ['tampon', 'kaput', 'camurluk', 'kapi', 'on panel', 'arka panel', 'panel', 'marspiyel', 'bagaj', 'tavan', 'dikme', 'direk', 'sutun', 'davlumbaz', 'spoiler', 'spoyler'];

/** Onarım sinyalleri (değişim değil): işçilik "Onarım" kategorisine yönlendirilebilir. */
const REPAIR_PHRASES = ['onarim', 'tamir', 'duzeltme', 'sok tak', 'sok-tak', 'mobil onarim', 'plastik tamir', 'isil', 'pdr'];

/** Far/stop gibi dış elektrik parçaları (boya/kaporta önerisi "kontrol gerekli" olur). */
const EXTERIOR_ELECTRIC_PHRASES = ['far', 'stop', 'sinyal', 'sis far'];

export interface RuleClassification {
  categories: LaborCategory[];
  confidence: LaborConfidence;
  needsReview: boolean;
  reason: string;
}

/** 250 TL katlarına yuvarlar (kuruşsuz). 0/negatif → 0. */
export function roundTo250(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount / 250) * 250;
}

function wordMatchesToken(word: string, token: string): boolean {
  if (word === token) return true;
  // "CAM" tek başına cam işidir; CAMURLUK/DAVLUMBAZ gibi kaporta kelimeleri cam sayılmamalı.
  if (token === 'CAM') return /^(CAM|CAMI|CAMA|CAMIN|CAMINI|CAMDA|CAMDAN|CAMLAR|CAMLARI)$/.test(word);
  // Türkçe çekim ekleri: "tampon"→"tamponu", "koltuk"→"koltuğu" (yumuşama). Önek/gövde eşleşmesi.
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
      if (matches) return p.length + tokens.length * 8;
    }
    return 0;
  }
  for (const word of words) {
    if (wordMatchesToken(word, p)) return word === p ? p.length + 4 : p.length;
  }
  return 0;
}

function bestCategoryByRules(normalized: string): { category: LaborCategory; score: number; matchedPhrase: string } | null {
  let best: { category: LaborCategory; score: number; matchedPhrase: string } | null = null;
  for (const rule of KEYWORD_RULES) {
    for (const phrase of rule.phrases) {
      const score = phraseScore(normalized, phrase);
      if (score > 0 && (!best || score > best.score)) best = { category: rule.category, score, matchedPhrase: phrase };
    }
  }
  return best;
}

function hasAny(normalized: string, phrases: string[]): string | null {
  for (const phrase of phrases) {
    if (phraseScore(normalized, phrase) > 0) return phrase;
  }
  return null;
}

/**
 * Parça adını/kodunu/notunu kurallarla sınıflandırır. Her zaman bir karar üretir; bilinmeyen parçada
 * en yakın mantıklı kategoriyi seçip "Kontrol gerekli" (Düşük güven) işaretler.
 */
export function classifyByRules(partName: string, partCode = '', note = ''): RuleClassification {
  const normalized = normalizeSearch(`${partName} ${note}`);
  if (!normalized.trim()) {
    return { categories: ['Onarım'], confidence: 'Düşük', needsReview: true, reason: 'Parça adı okunamadı; varsayılan Onarım seçildi, kontrol gerekli.' };
  }

  const repair = hasAny(normalized, REPAIR_PHRASES);
  const best = bestCategoryByRules(normalized);

  if (!best) {
    // Bilinmeyen parça: değişim değilse Onarım, aksi hâlde en yaygın kategori (Kaporta); her hâlükârda kontrol gerekli.
    const fallback: LaborCategory = repair ? 'Onarım' : 'Kaporta';
    return { categories: [fallback], confidence: 'Düşük', needsReview: true, reason: `Bilinmeyen parça ("${partName.trim()}"); en yakın mantıklı işçilik ${fallback} seçildi, kontrol gerekli.` };
  }

  const categories: LaborCategory[] = [best.category];
  const reasons: string[] = [`Parça adı "${best.matchedPhrase}" içerdiği için ${best.category} yazıldı.`];
  let confidence: LaborConfidence = 'Yüksek';
  let needsReview = false;

  // Kaporta + boya: boyanacak dış gövde parçalarında Boya birlikte dağıtılır.
  if (best.category === 'Kaporta' && hasAny(normalized, PAINTABLE_BODY_PHRASES)) {
    categories.push('Boya');
    reasons.push('Boyanacak dış gövde parçası olduğundan Boya da eklendi.');
  }

  // Far/stop gibi dış elektrik parçaları: birincil Elektrik; boya/kaporta gerekiyorsa kontrol gerekli.
  if (best.category === 'Elektrik' && hasAny(normalized, EXTERIOR_ELECTRIC_PHRASES)) {
    confidence = 'Orta';
    needsReview = true;
    reasons.push('Dış aydınlatma parçası; gerekiyorsa boya/kaporta eklenmesi kontrol gerektirir.');
  }

  // Onarım sinyali varsa ve birincil Kaporta/Mekanik ise: gerekçeye eklenir (değişim değil olabilir).
  if (repair && (best.category === 'Kaporta' || best.category === 'Mekanik')) {
    confidence = confidence === 'Yüksek' ? 'Orta' : confidence;
    reasons.push('Onarım/tamir ifadesi var; değişim yerine onarım işçiliği olabilir (kontrol önerilir).');
    needsReview = true;
  }

  return { categories, confidence, needsReview, reason: reasons.join(' ') };
}

/**
 * Kategori-kategori dağıtım kısıtları. Kurallara aykırı kombinasyonları ayıklar (gerekçeli).
 * - Mekanik (motor tamiri) satırına Cam yazma. - Cam parçasına Mekanik yazma.
 * - Elektrik parçasına Kaporta/Boya yazma (far/stop hariç "kontrol gerekli").
 */
export function applyDistributionConstraints(categories: LaborCategory[], normalizedName: string): { categories: LaborCategory[]; removed: string[] } {
  const set = new Set(categories);
  const removed: string[] = [];
  const isCam = hasAny(normalizedName, ['cam']) !== null && set.has('Cam');
  const isElectric = set.has('Elektrik');
  const isExteriorElectric = hasAny(normalizedName, EXTERIOR_ELECTRIC_PHRASES) !== null;

  if (set.has('Mekanik') && set.has('Cam')) { set.delete('Cam'); removed.push('Cam (mekanik parçaya cam işçiliği yazılmaz)'); }
  if (isCam && set.has('Mekanik')) { set.delete('Mekanik'); removed.push('Mekanik (cam parçasına mekanik yazılmaz)'); }
  if (isElectric && !isExteriorElectric) {
    if (set.has('Kaporta')) { set.delete('Kaporta'); removed.push('Kaporta (elektrik parçasına kaporta yazılmaz)'); }
    if (set.has('Boya')) { set.delete('Boya'); removed.push('Boya (elektrik parçasına boya yazılmaz)'); }
  }
  const next = LABOR_CATEGORIES.filter((c) => set.has(c));
  return { categories: next.length ? next : categories.slice(0, 1), removed };
}
