import { normalizeSearch } from './turkish';

/**
 * Usta Sözlüğü — oto parça terim normalizasyonu.
 * Servis/ustaların el yazısında kullandığı yerel/argo terimleri (ör. "amartisör", "davlumbaz",
 * "şarşıman", "intercol", "sis köpeği") resmi/gerçek parça adına çevirir.
 * Gömülü, çevrimdışı ve deterministiktir; AI-OCR katmanı bu sözlüğü BESLER, sözlük çıktıyı
 * standartlaştırır. Liste tohumdur; gerçek belgelerle (ve kullanıcı düzeltmeleriyle) büyür.
 */
export interface PartDictionaryEntry {
  /** Resmi/gerçek parça adı. */
  canonical: string;
  /** Kategori (Tampon, Aydınlatma, Kaporta, Soğutma, Motor, Süspansiyon, Elektrik…). */
  category: string;
  /** Usta dili / eş anlamlılar / yaygın yazım ve telaffuz biçimleri. */
  aliases: string[];
  /** Varsa gömülü işçilik fiyat listesindeki parça adıyla bağ. */
  laborPart?: string;
}

export const PART_DICTIONARY: readonly PartDictionaryEntry[] = [
  // --- Tampon ve çevresi ---
  { canonical: 'Ön Tampon', category: 'Tampon', aliases: ['ön tampon', 'on tampon', 'tampon on', 'tampon', 'ön tampon orjinal'], laborPart: 'Ön Tampon' },
  { canonical: 'Arka Tampon', category: 'Tampon', aliases: ['arka tampon', 'tampon arka'] },
  { canonical: 'Tampon Demiri', category: 'Tampon', aliases: ['tampon demiri', 'tampon demir', 'ön tampon demiri', 'arka tampon demiri', 'destek demiri tampon', 'tampon iskeleti', 'tampon takviyesi'] },
  { canonical: 'Tampon Desteği', category: 'Tampon', aliases: ['tampon desteği', 'tampon destegi', 'tampon destek', 'tampon destegi yan', 'tampon yan destek'] },
  { canonical: 'Tampon Braketi', category: 'Tampon', aliases: ['tampon braketi', 'tampon braket', 'braket tampon', 'tampon braketi sağ', 'tampon braketi sol'] },
  { canonical: 'Ön Tampon Alt Izgara', category: 'Tampon', aliases: ['ön tampon alt ızgara', 'on tampon alt izgara', 'tampon alt izgara', 'alt izgara', 'tampon orta ızgara', 'tampon orta izgarası', 'orta ızgara', 'tampon alt panjur'], laborPart: 'Alt Izgara' },
  { canonical: 'Ön Tampon Alt Spoiler', category: 'Tampon', aliases: ['ön tampon alt spoiler', 'on tampon alt spoiler', 'alt spoyler', 'alt spoiler', 'tampon spoyler', 'spoyler'], laborPart: 'Tampon Spoyler' },
  { canonical: 'Ön Tampon Darbe Emici', category: 'Tampon', aliases: ['ön tampon darbe emici', 'darbe emici', 'tampon darbe emici', 'tampon köpüğü'] },
  { canonical: 'Ön Tampon Alt Koruyucu', category: 'Tampon', aliases: ['ön tampon alt koruyucu', 'koruyucu ön tampon alt', 'alt koruyucu', 'tampon alt koruyucu', 'tampon alt davlumbaz'] },
  { canonical: 'Tampon İç Koruma Plastiği', category: 'Plastik', aliases: ['tampon iç koruma plastiği', 'tampon ic koruma plastigi', 'iç koruma plastiği'] },
  { canonical: 'İç Panel Tampon Plastiği', category: 'Plastik', aliases: ['iç panel tampon plastiği', 'ic panel tampon plastigi', 'panel tampon plastiği'] },
  { canonical: 'Tampon Plaketi', category: 'Tampon', aliases: ['tampon plaketi', 'plaket', 'tampon plaka'] },

  // --- Aydınlatma ---
  { canonical: 'Ön Far', category: 'Aydınlatma', aliases: ['ön far', 'on far', 'far', 'far ünitesi', 'far unitesi', 'onfar', 'onfar ünitesi', 'ön far ünitesi', 'far grubu'] },
  { canonical: 'Stop', category: 'Aydınlatma', aliases: ['stop', 'arka stop', 'stop lambası', 'arka lamba'] },
  { canonical: 'Sis Farı', category: 'Aydınlatma', aliases: ['sis farı', 'sis fari', 'sis lambası', 'sis'] },
  { canonical: 'Sis Far Kapağı', category: 'Aydınlatma', aliases: ['sis kapağı', 'sis kapagi', 'sis far kapağı', 'sis kapak', 'sis köpeği', 'sis kopegi', 'tampon sis deliği kapağı'] },
  { canonical: 'Sis Far Izgarası', category: 'Aydınlatma', aliases: ['sis far ızgarası', 'sis kapak ızgarası', 'sis kapak gıtası', 'sis ızgara'] },
  { canonical: 'Sinyal', category: 'Aydınlatma', aliases: ['sinyal', 'çamurluk sinyali', 'camurluk sinyali', 'sinyal lambası', 'ayna sinyali'] },
  { canonical: 'Amblem', category: 'Kaporta', aliases: ['amblem', 'ön amblem', 'on amblem', 'logo', 'marka amblemi'] },

  // --- Kaporta / gövde ---
  { canonical: 'Motor Kaputu', category: 'Kaporta', aliases: ['motor kaputu', 'kaput', 'motor kaput', 'kaputu'], laborPart: 'Kaput' },
  { canonical: 'Kaput Fitili', category: 'Kaporta', aliases: ['kaput fitili', 'fitil motor kaput', 'fitil kaput', 'kaput lastiği'] },
  { canonical: 'Kaput İzolatörü', category: 'Kaporta', aliases: ['kaput izolatörü', 'izolator kaput', 'kaput izolasyonu'] },
  { canonical: 'Kaput Menteşesi', category: 'Kaporta', aliases: ['kaput menteşesi', 'mentese kaput', 'menteşe', 'kaput mentese'] },
  { canonical: 'Kaput Kilidi', category: 'Kaporta', aliases: ['kaput kilidi', 'kilit motor kaput', 'kaput kilit'] },
  { canonical: 'Kaput Desteği', category: 'Kaporta', aliases: ['kaput desteği', 'destek motor kaputu', 'destek kaput kilit', 'kaput amortisörü', 'kaput çubuğu'] },
  { canonical: 'Ön Panel', category: 'Kaporta', aliases: ['ön panel', 'on panel', 'panel', 'ön panel komple', 'alın paneli', 'ön panel orjinal'], laborPart: 'Ön Panel' },
  { canonical: 'Ön Çamurluk', category: 'Kaporta', aliases: ['ön çamurluk', 'on camurluk', 'çamurluk', 'camurluk', 'sol ön çamurluk', 'sağ ön çamurluk'], laborPart: 'Ön Çamurluk' },
  { canonical: 'Arka Çamurluk', category: 'Kaporta', aliases: ['arka çamurluk', 'arka camurluk'] },
  { canonical: 'Çamurluk Davlumbazı', category: 'Kaporta', aliases: ['çamurluk davlumbazı', 'davlumbaz', 'davlumbaz çamurluk', 'çamurluk içliği', 'çamurluk davlumbaz', 'iç davlumbaz'] },
  { canonical: 'Çamurluk Desteği', category: 'Kaporta', aliases: ['çamurluk desteği', 'destek çamurluk', 'destek camurluk', 'paçalık', 'pacalik', 'd paçalık', 'davlumbaz paçalık'] },
  { canonical: 'Ön Kapı', category: 'Kaporta', aliases: ['ön kapı', 'on kapi'], laborPart: 'Kapı' },
  { canonical: 'Arka Kapı', category: 'Kaporta', aliases: ['arka kapı', 'arka kapi'], laborPart: 'Kapı' },
  { canonical: 'Kapı Bandı', category: 'Kaporta', aliases: ['kapı bandı', 'kapi banti', 'kapı çıtası', 'kapı fitili'] },
  { canonical: 'Marşpiyel', category: 'Kaporta', aliases: ['marşpiyel', 'marspiyel', 'eşik', 'kapı eşiği'] },

  // --- Izgara / panjur ---
  { canonical: 'Ön Panjur', category: 'Kaporta', aliases: ['ön panjur', 'on panjur', 'onpanjur', 'panjur'] },
  { canonical: 'Panjur Kaplaması', category: 'Kaporta', aliases: ['panjur kaplaması', 'panjur kaplamasi', 'panjur kaplama'] },
  { canonical: 'Panjur Braketi', category: 'Kaporta', aliases: ['panjur braketi', 'braket panjur', 'panjur alt braket', 'on panjur ust braket'] },

  // --- Soğutma / iklim ---
  { canonical: 'Su Radyatörü', category: 'Soğutma', aliases: ['su radyatörü', 'su radyatoru', 'radyatör', 'radyator', 'motor su radyatörü', 'motor radyatörü', 'motor radyatoru'] },
  { canonical: 'Klima Radyatörü', category: 'Soğutma', aliases: ['klima radyatörü', 'klima radyatoru', 'kondanser', 'kondenser', 'klima peteği'] },
  { canonical: 'İntercooler', category: 'Soğutma', aliases: ['intercooler', 'intercol', 'interkol', 'intercol radyatörü', 'interkol radyatörü', 'ara soğutucu', 'turbo radyatörü'] },
  { canonical: 'Radyatör Hortumu', category: 'Soğutma', aliases: ['radyatör hortumu', 'hortum radyator', 'radyator hortumu', 'hortum'] },
  { canonical: 'Fan', category: 'Soğutma', aliases: ['fan', 'davlumbaz fan', 'fan komple', 'fan modülü', 'fan komple modül', 'fan pervanesi'] },
  { canonical: 'Su Fıskiye Matarası', category: 'Soğutma', aliases: ['su fıskiye matarası', 'su fiskiye matarasi', 'fıskiye matarası', 'cam suyu deposu', 'su deposu'] },
  { canonical: 'Klima Borusu', category: 'İklim', aliases: ['klima borusu', 'klima hortumu'] },
  { canonical: 'Klima Gazı', category: 'İklim', aliases: ['klima gazı', 'klima gazi'], laborPart: 'Klima Gazı' },
  { canonical: 'Antifriz', category: 'İklim', aliases: ['antifriz', 'antifiriz', 'motor suyu', 'radyatör motor suyu', 'radyator motor suyu', 'soğutma sıvısı'], laborPart: 'Antifriz' },
  { canonical: 'Klima Paneli', category: 'İklim', aliases: ['klima paneli', 'klima kontrol paneli'] },

  // --- Motor / şanzıman / alt takım ---
  { canonical: 'Motor Takozu', category: 'Motor', aliases: ['motor takozu', 'motor kulağı', 'motor kulagi', 'motor kulak', 'motor kaidesi'] },
  { canonical: 'Şanzıman Takozu', category: 'Şanzıman', aliases: ['şanzıman takozu', 'sanziman takozu', 'şanzıman kulağı', 'sanziman kulagi', 'şarşıman kulağı', 'sarsiman kulagi', 'şarşıman takozu'] },
  { canonical: 'Motor Kasnağı', category: 'Motor', aliases: ['motor kasnağı', 'motor kasnagi', 'kasnak', 'krank kasnağı', 'triger kasnağı'] },
  { canonical: 'Alt Karter', category: 'Motor', aliases: ['alt karter', 'karter', 'yağ karteri'] },
  { canonical: 'Alt Beşik', category: 'Şasi', aliases: ['alt beşik', 'alt besik', 'beşik', 'motor beşiği', 'motor besigi', 'ön beşik', 'travers', 'ön travers', 'on travers', 'motor traversi', 'traversi', 'ön travers grubu'] },
  { canonical: 'Alt Motor Muhafazası', category: 'Kaporta', aliases: ['alt motor muhafazası', 'alt motor muhafazasi', 'alt muhafaza', 'motor muhafazası', 'motor altı muhafaza', 'tampon alt muhafaza'], laborPart: 'Alt Muhafaza' },
  { canonical: 'Şanzıman Kapağı', category: 'Şanzıman', aliases: ['şanzıman kapağı', 'sanziman kapagi', 'alt şanzıman kapağı', 'şanzıman alt kapağı', 'şarşıman kapağı', 'sarsiman kapagi'] },
  { canonical: 'Vites Halatı', category: 'Şanzıman', aliases: ['vites halatı', 'vites halati', 'vites kolu', 'vites teli'] },
  { canonical: 'Direksiyon Kutusu', category: 'Direksiyon', aliases: ['direksiyon kutusu', 'direksiyon kutu', 'direksiyon mili kutusu'] },

  // --- Süspansiyon / aktarma / tekerlek ---
  { canonical: 'Amortisör', category: 'Süspansiyon', aliases: ['amortisör', 'amortisor', 'amartisör', 'amartisor', 'amortizör', 'amartisör komple'] },
  { canonical: 'Salıncak', category: 'Süspansiyon', aliases: ['salıncak', 'salincak', 'salıncak kolu', 'tabla', 'sol tabla', 'sağ tabla', 'sag tabla', 'ön tabla', 'on tabla', 'salıncak tablası'] },
  { canonical: 'Rot', category: 'Süspansiyon', aliases: ['rot', 'z rot', 'z roto', 'rot başı', 'rotbasi'] },
  { canonical: 'Rotil', category: 'Süspansiyon', aliases: ['rotil', 'rot mili'] },
  { canonical: 'Aks', category: 'Aktarma', aliases: ['aks', 'akis', 'aks mili', 'aks kafası'] },
  { canonical: 'Lastik', category: 'Tekerlek', aliases: ['lastik', 'lastigi', 'dış lastik'], laborPart: 'Lastik' },
  { canonical: 'Jant', category: 'Tekerlek', aliases: ['jant', 'jant göbeği', 'çelik jant', 'alaşım jant'], laborPart: 'Jant' },
  { canonical: 'Şase', category: 'Şasi', aliases: ['şase', 'sase', 'şasi', 'sasi', 'şase ucu', 'sase ucu', 'şase başı', 'sase basi', 'sağ şase ucu', 'sol şase ucu'] },
  { canonical: 'Porya', category: 'Aktarma', aliases: ['porya', 'poryası', 'poryasi', 'teker poryası', 'teker poryasi', 'aks poryası', 'aks taşıyıcısı', 'teker taşıyıcı', 'taşıyıcı'] },

  // --- Elektrik / iç / güvenlik / multimedya ---
  { canonical: 'Tesisat', category: 'Elektrik', aliases: ['tesisat', 'motor odası kablo demeti', 'kablo demeti', 'wire engine room', 'motor tesisatı'] },
  { canonical: 'Korna', category: 'Elektrik', aliases: ['korna', 'klakson'] },
  { canonical: 'Sigorta Kutusu', category: 'Elektrik', aliases: ['sigorta kutusu', 'sigorta kutu'] },
  { canonical: 'Darbe Sensörü', category: 'Elektrik', aliases: ['darbe sensörü', 'darbe sensoru', 'çarpışma sensörü'] },
  { canonical: 'Park Sensörü', category: 'Elektrik', aliases: ['park sensörü', 'park sensoru', 'park sensör gözü', 'sensör gözü'] },
  { canonical: 'Hava Yastığı', category: 'Güvenlik', aliases: ['hava yastığı', 'hava yastigi', 'airbag', 'airbeg', 'air bag'] },
  { canonical: 'Radyo', category: 'Multimedya', aliases: ['radyo', 'teyp', 'teype', 'multimedya', 'oto teyp', 'müzik seti', 'çalar'] },

  // --- Fren sistemi (İŞ NOTLAR: fren diski + balata ana parçalar; kaliper/hortum ayrı değerlendirilir) ---
  { canonical: 'Fren Diski', category: 'Fren', aliases: ['fren diski', 'fren disk', 'disk', 'fren diski sağ', 'fren diski sol', 'ön fren diski', 'arka fren diski'] },
  { canonical: 'Fren Balatası', category: 'Fren', aliases: ['fren balatası', 'fren balatasi', 'balata', 'fren balata', 'disk balata', 'ön balata', 'arka balata', 'balatası'] },
  { canonical: 'Fren Kaliperi', category: 'Fren', aliases: ['fren kaliperi', 'kaliper', 'fren kaliper', 'kaliper sağ', 'kaliper sol', 'fren kaliperi sağ'] },
  { canonical: 'Fren Hortumu', category: 'Fren', aliases: ['fren hortumu', 'fren hortum', 'hidrolik hortum', 'fren borusu'] },

  // --- Arka bölüm / bagaj (İŞ NOTLAR: arka tampon arkası ve bagaj havuzu kontrolü) ---
  { canonical: 'Arka Panel', category: 'Kaporta', aliases: ['arka panel', 'arka alın paneli', 'arka alin paneli', 'arka panel komple', 'bagaj alın paneli'] },
  { canonical: 'Bagaj Havuzu', category: 'Kaporta', aliases: ['bagaj havuzu', 'bagaj tabanı', 'bagaj tabani', 'bagaj havuz sacı', 'stepne havuzu', 'bagaj saci'] },
  { canonical: 'Bagaj Kapağı', category: 'Kaporta', aliases: ['bagaj kapağı', 'bagaj kapagi', 'bagaj kapak', 'arka kaput'] }
];

const SIDE_TOKENS: Record<string, string> = { SAG: 'Sağ', SOL: 'Sol' };

export interface PartMatch {
  /** Girilen ham metin. */
  input: string;
  /** Normalize edilmiş gösterim (yön + resmi ad). Eşleşme yoksa düzeltilmiş ham metin. */
  canonical: string;
  /** Eşleşen resmi parça adı (yön hariç). */
  core: string;
  /** Kategori (eşleşme yoksa boş). */
  category: string;
  /** Yön bilgisi (Sağ / Sol / Sağ-Sol). */
  side: string;
  /** Sözlükte eşleşti mi? */
  matched: boolean;
  /** Eşleşen işçilik fiyat listesi parça adı (varsa). */
  laborPart?: string;
  /**
   * v0.4.6: Eşleşen resmi ad yönlü (Ön/Arka) olduğu hâlde girilen ifade yön belirtmedi.
   * Otomatik "Ön ..." varsayımı yapıldı; eksper ön/arka kontrol etmeli (yanlış parça riski).
   */
  ambiguousSide?: boolean;
  score: number;
}

function entryForms(entry: PartDictionaryEntry): string[] {
  const seen = new Set<string>();
  for (const value of [entry.canonical, ...entry.aliases]) {
    const norm = normalizeSearch(value);
    if (norm) seen.add(norm);
  }
  return [...seen];
}

function tokenPresent(formToken: string, coreTokens: string[]): boolean {
  return coreTokens.some((ct) => ct === formToken || (formToken.length >= 4 && (ct.startsWith(formToken) || formToken.startsWith(ct))));
}

/**
 * Tek bir ham parça terimini sözlükle normalize eder.
 * Yön (sağ/sol) ayrıştırılır; çekirdek terim resmi ada eşlenir. Eşleşme yoksa matched=false döner.
 */
/** Kullanıcının "öğrettiği" terim: ham (usta dili) ifade → resmi ad. Kalıcı, kişisel sözlük. */
export interface UserPartTerm {
  alias: string;
  canonical: string;
  category?: string;
  laborPart?: string;
}

export interface NormalizeOptions {
  list?: readonly PartDictionaryEntry[];
  /** Öğrenilen kullanıcı terimleri — gömülü sözlükten ÖNCE, tam ifade eşleşmesiyle uygulanır. */
  userTerms?: readonly UserPartTerm[];
}

function categoryForCanonical(canonical: string, list: readonly PartDictionaryEntry[]): string {
  const norm = normalizeSearch(canonical);
  return list.find((entry) => normalizeSearch(entry.canonical) === norm)?.category ?? '';
}

function laborPartForCanonical(canonical: string, list: readonly PartDictionaryEntry[]): string | undefined {
  const norm = normalizeSearch(canonical);
  return list.find((entry) => normalizeSearch(entry.canonical) === norm)?.laborPart;
}

export function normalizePartName(raw: string, options: NormalizeOptions = {}): PartMatch {
  const list = options.list ?? PART_DICTIONARY;
  const norm = normalizeSearch(raw);
  // 1) Öğrenilen kullanıcı terimleri (tam ifade eşleşmesi) — gömülü sözlükten önce gelir.
  if (norm && options.userTerms) {
    for (const term of options.userTerms) {
      if (normalizeSearch(term.alias) === norm) {
        const canonical = (term.canonical || '').trim() || raw.trim();
        const laborPart = term.laborPart ?? laborPartForCanonical(canonical, list);
        return {
          input: raw,
          canonical,
          core: canonical,
          category: term.category ?? categoryForCanonical(canonical, list),
          side: '',
          matched: true,
          ...(laborPart ? { laborPart } : {}),
          score: 2000
        };
      }
    }
  }
  const sides: string[] = [];
  const coreTokens: string[] = [];
  for (const token of norm.split(' ').filter(Boolean)) {
    if (SIDE_TOKENS[token]) {
      const display = SIDE_TOKENS[token]!;
      if (!sides.includes(display)) sides.push(display);
    } else if (/^\d+$/.test(token)) {
      // adet/sayı; parça adına dahil değil
    } else {
      coreTokens.push(token);
    }
  }
  const core = coreTokens.join(' ');
  let best: { entry: PartDictionaryEntry; score: number } | null = null;
  if (core) {
    for (const entry of list) {
      let score = 0;
      for (const form of entryForms(entry)) {
        if (form === core) { score = Math.max(score, 1000 + form.length); continue; }
        const formTokens = form.split(' ').filter(Boolean);
        if (formTokens.length > 0 && formTokens.every((ft) => tokenPresent(ft, coreTokens))) {
          score = Math.max(score, 500 + form.length + formTokens.length * 10);
        } else if (form.length >= 5 && core.includes(form)) {
          score = Math.max(score, 300 + form.length);
        }
      }
      if (score > 0 && (!best || score > best.score)) best = { entry, score };
    }
  }

  const sideLabel = sides.join('-');
  if (best) {
    const canonical = sideLabel ? `${sideLabel} ${best.entry.canonical}` : best.entry.canonical;
    // v0.4.6: Resmi ad yönlü (Ön/Arka) ama girilen ifade yön içermiyorsa belirsiz olarak işaretle.
    // normalizeSearch Türkçe'yi büyütüp çevirir: "Ön"→"ON", "Arka"→"ARKA".
    const canonicalNorm = normalizeSearch(best.entry.canonical);
    const isDirectional = /^(ON|ARKA) /.test(canonicalNorm);
    const inputHasDirection = coreTokens.includes('ON') || coreTokens.includes('ARKA');
    const ambiguousSide = isDirectional && !inputHasDirection;
    return {
      input: raw,
      canonical,
      core: best.entry.canonical,
      category: best.entry.category,
      side: sideLabel,
      matched: true,
      ...(best.entry.laborPart ? { laborPart: best.entry.laborPart } : {}),
      ...(ambiguousSide ? { ambiguousSide: true } : {}),
      score: best.score
    };
  }
  return { input: raw, canonical: raw.trim(), core: raw.trim(), category: '', side: sideLabel, matched: false, score: 0 };
}

/** Bir liste (her satır bir parça) için toplu normalizasyon. */
export function normalizePartList(rawLines: string[], options: NormalizeOptions = {}): PartMatch[] {
  return rawLines.map((line) => normalizePartName(line, options)).filter((match) => match.input.trim().length > 0);
}

/** Resmi parça adı önerileri (düzeltme arayüzünde autocomplete için). */
export function partCanonicalSuggestions(): string[] {
  return PART_DICTIONARY.map((entry) => entry.canonical);
}

/**
 * v0.4.6: Kategoriye göre gruplanmış resmi parça adı önerileri.
 * Kaydırılabilir (scrollbar'lı) açılır listede <optgroup> olarak göstermek için.
 */
export function partCanonicalGroups(): Array<{ category: string; names: string[] }> {
  const map = new Map<string, string[]>();
  for (const entry of PART_DICTIONARY) {
    const list = map.get(entry.category) ?? [];
    if (!list.includes(entry.canonical)) list.push(entry.canonical);
    map.set(entry.category, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([category, names]) => ({ category, names: names.sort((a, b) => a.localeCompare(b, 'tr')) }));
}
