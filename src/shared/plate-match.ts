/**
 * Merkezi plaka eşleşme doğrulaması (saf, çevrimdışı, test edilebilir).
 *
 * Kritik işlemlerde (ör. parça fotoğrafı okuma) seçilen varlığın (fotoğraf/klasör) ait olduğu
 * plaka ile aktif dosyanın plakasını karşılaştırmak için kullanılır. Uyuşmazlıkta çağıran
 * taraf işlemi SERT olarak (hard-block) durdurur — uyarı değil, engelleme.
 */

/** Karşılaştırma için plakayı sadeleştirir: harf/rakam dışını atar, büyütür. "34 BOP 660" -> "34BOP660". */
export function normalizePlateForCompare(value: string): string {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** Türk plakası biçimine (il kodu + 1-3 harf + 2-5 rakam) uyuyor mu? Sadeleştirilmiş değer beklenir. */
export function looksLikePlate(value: string): boolean {
  return /^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}\d{2,5}$/.test(normalizePlateForCompare(value));
}

export interface PlateMatchResult {
  /** Sadeleştirilmiş aktif plaka. */
  active: string;
  /** Sadeleştirilmiş aday plaka. */
  candidate: string;
  /** Her iki taraf da gerçek plaka olarak okunabildi mi (karşılaştırılabilir mi)? */
  comparable: boolean;
  /** Karşılaştırılabiliyorsa eşleşiyor mu? Karşılaştırılamıyorsa (kanıt yok) true döner. */
  matches: boolean;
}

/**
 * İki plakayı karşılaştırır. Yalnızca iki taraf da gerçek plaka olarak okunabildiğinde
 * "uyuşmazlık" iddia edilebilir; aksi halde kanıt yoktur ve matches=true (engelleme yok) döner.
 */
export function evaluatePlateMatch(activePlate: string, candidatePlate: string): PlateMatchResult {
  const active = normalizePlateForCompare(activePlate);
  const candidate = normalizePlateForCompare(candidatePlate);
  const comparable = looksLikePlate(active) && looksLikePlate(candidate);
  return { active, candidate, comparable, matches: comparable ? active === candidate : true };
}

/** Plaka uyuşmazlığı (hard-block) için kullanılan hata kodu. Çağıran taraf bu kodla modal gösterir. */
export const PHOTO_PLATE_MISMATCH_CODE = 'PHOTO_PLATE_MISMATCH';

/** Engelleme mesajını standart biçimde üretir (UI ve testler aynı metni kullanır). */
export function plateMismatchMessage(activePlateDisplay: string, candidateDisplay: string): string {
  const active = (activePlateDisplay || '').trim() || '(belirsiz)';
  const candidate = (candidateDisplay || '').trim() || '(belirlenemedi)';
  return `Seçilen fotoğraf bu dosyaya ait görünmüyor. Aktif plaka: ${active}, seçilen klasör/plaka: ${candidate}. İşlem güvenlik nedeniyle engellendi.`;
}
