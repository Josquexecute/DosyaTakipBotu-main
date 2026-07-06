/**
 * v0.6.x — AI İşçilik v3.6: AI Mode aday parça kodu ile Excel D sütunu mevcut kodun karşılaştırması (SAF).
 * Normalize: boşluk/tire/nokta kaldır, BÜYÜK harf. "5C6 807 217" ile "5C6807217" aynı kabul edilir.
 */
export type PartCodeCompareStatus = 'same' | 'different' | 'missing_existing' | 'missing_candidate';

export interface PartCodeComparison {
  status: PartCodeCompareStatus;
  existingPartCode?: string;
  candidatePartCode?: string;
  message: string;
}

/** Parça kodunu karşılaştırma için sadeleştirir (boşluk/tire/nokta/altçizgi kaldır, BÜYÜK harf). */
export function normalizePartCode(code?: string | null): string {
  return (code ?? '').toString().replace(/[\s.\-_]+/g, '').toUpperCase().trim();
}

/** Mevcut D kodu ile aday kodu karşılaştırır; durum + Türkçe mesaj döner. */
export function comparePartCodes(existing?: string | null, candidate?: string | null): PartCodeComparison {
  const e = normalizePartCode(existing);
  const c = normalizePartCode(candidate);
  const out: PartCodeComparison = { status: 'missing_existing', message: '' };
  if (existing && e) out.existingPartCode = existing.trim();
  if (candidate && c) out.candidatePartCode = candidate.trim();

  if (!c) {
    out.status = 'missing_candidate';
    out.message = 'AI Mode cevabından güvenilir parça kodu çıkarılamadı.';
    return out;
  }
  if (!e) {
    out.status = 'missing_existing';
    out.message = 'Excel D sütununda mevcut parça kodu yok. Aday kod yalnız öneri/evidence olarak gösterilir.';
    return out;
  }
  if (e === c) {
    out.status = 'same';
    out.message = 'AI Mode adayı mevcut D sütunu parça kodu ile uyumlu.';
    return out;
  }
  out.status = 'different';
  out.message = `AI Mode adayı mevcut D sütunu parça kodundan farklı (mevcut: ${existing!.trim()}, aday: ${candidate!.trim()}); kullanıcı/eksper kontrolü gerekir.`;
  return out;
}
