import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalyzedPartRow, PartsPhotoAnalysis } from '../../shared/types';
import { normalizePartName, type UserPartTerm } from '../../shared/parca-sozlugu';
import { parseMoney } from './excel-importer';
import { callGeminiVision } from './gemini-client';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif'
};

const PARTS_PROMPT = [
  'Sen deneyimli bir oto ekspertiz asistanısın. Görseldeki el yazısı veya karışık parça/teklif listesini dikkatle OKU.',
  'Yalnızca geçerli JSON döndür, başka hiçbir metin yazma. Şema:',
  '{"arac":{"marka":"","model":"","plaka":""},"parcalar":[{"ham":"","adet":null,"tutar":null,"not":""}]}',
  'Kurallar:',
  '- "ham": parçayı GÖRSELDE YAZILDIĞI GİBİ yaz (usta dili/argo/kısaltma dahil). Resmi adına ÇEVİRME; uygulama kendi çevirecek. Yön (sağ/sol/ön/arka/alt/üst) bilgisini koru.',
  '- "adet": satırda adet belirtilmişse tam sayı, yoksa null ("2 adet", "x2", "2.Adet" gibi).',
  '- "tutar": satırda TL fiyat varsa düz sayı (28.000 -> 28000, 1.250 -> 1250), yoksa null.',
  '- "not": satırdaki işlem/durum ipucu varsa kısaca yaz (onarım, değişim, boyalı, orjinal, mekanik, demir ise gibi); yoksa boş bırak.',
  '- Üstü çizili/iptal edilmiş satırları DAHİL ETME.',
  '- Okuyamadığın kelimeyi TAHMİN ETME; o kısmı "?" ile işaretle. Bulanık fotoğrafta okuyabildiğin kadarını yaz.',
  '- Araç marka/model/plakayı başlıktan veya görselden çıkar; yoksa boş bırak. Türk plakası biçimi olabilir (örn. 34 ABC 123).',
  '- Tüm parça satırlarını eksiksiz oku, hiçbirini atlama.'
].join('\n');

export interface AnalyzePartsOptions {
  model?: string;
  userTerms?: readonly UserPartTerm[];
}

export async function analyzePartsPhoto(filePath: string, apiKey: string, options: AnalyzePartsOptions = {}): Promise<PartsPhotoAnalysis> {
  const absolutePath = path.resolve(filePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) throw new Error('Desteklenmeyen görsel formatı. JPG, PNG veya WEBP kullanın.');
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) throw new Error('Görsel dosyası bulunamadı.');
  if (stat.size > MAX_IMAGE_BYTES) throw new Error(`Görsel çok büyük: ${Math.round(stat.size / 1024 / 1024)} MB (12 MB sınırı).`);
  const imageBase64 = (await fs.readFile(absolutePath)).toString('base64');
  const rawText = await callGeminiVision(apiKey, imageBase64, mimeType, PARTS_PROMPT, options.model ? { model: options.model } : {});
  return parsePartsResponse(rawText, absolutePath, options.userTerms);
}

interface RawGeminiParts {
  arac?: { marka?: unknown; model?: unknown; plaka?: unknown };
  parcalar?: Array<{ ham?: unknown; adet?: unknown; tutar?: unknown; not?: unknown }>;
}

/** Gemini JSON yanıtını ayrıştırır ve her satırı usta sözlüğüyle (+ öğrenilen terimlerle) normalize eder. (Saf; mock'la test edilebilir.) */
export function parsePartsResponse(rawText: string, filePath = '', userTerms?: readonly UserPartTerm[]): PartsPhotoAnalysis {
  const parsed = safeParseJson(rawText);
  const warnings: string[] = [];
  const vehicle = {
    make: asString(parsed?.arac?.marka),
    model: asString(parsed?.arac?.model),
    plate: asString(parsed?.arac?.plaka)
  };
  const rawParts = Array.isArray(parsed?.parcalar) ? parsed!.parcalar! : [];
  if (rawParts.length === 0) warnings.push('Görselden parça satırı okunamadı. Fotoğrafı netleştirip tekrar deneyin.');

  const rows: AnalyzedPartRow[] = [];
  const ambiguousRaws: string[] = [];
  for (const part of rawParts) {
    const raw = asString(part?.ham).trim();
    if (!raw) continue;
    const match = normalizePartName(raw, userTerms ? { userTerms } : {});
    const quantity = toPositiveQuantity(part?.adet);
    const amount = toPositiveAmount(part?.tutar);
    const note = asString(part?.not).trim().slice(0, 60);
    if (match.ambiguousSide) ambiguousRaws.push(raw);
    rows.push({
      raw,
      canonical: match.canonical,
      category: match.category,
      matched: match.matched,
      ...(match.laborPart ? { laborPart: match.laborPart } : {}),
      ...(quantity !== null ? { quantity } : {}),
      ...(amount !== null ? { amount } : {}),
      ...(note ? { note } : {}),
      ...(match.ambiguousSide ? { ambiguousSide: true } : {})
    });
  }

  const matchedCount = rows.filter((row) => row.matched).length;
  const unmatchedCount = rows.length - matchedCount;
  if (unmatchedCount > 0) {
    warnings.push(`${unmatchedCount} satır sözlükte eşleşmedi; gözden geçirip düzeltin (gerekirse sözlüğe eklenir).`);
  }
  if (ambiguousRaws.length > 0) {
    warnings.push(`Yön belirtilmemiş (ön/arka kontrol edin): ${ambiguousRaws.slice(0, 6).join(', ')}${ambiguousRaws.length > 6 ? ' …' : ''}. Otomatik "Ön ..." varsayıldı.`);
  }

  return {
    filePath,
    fileName: filePath ? path.basename(filePath) : '',
    vehicle,
    rows,
    matchedCount,
    unmatchedCount,
    warnings
  };
}

function safeParseJson(rawText: string): RawGeminiParts | null {
  const cleaned = rawText.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object') return value as RawGeminiParts;
    } catch {
      // sıradaki adaya geç
    }
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Tutar (TL) ayrıştırması. Gemini sayı yerine "2.500", "₺ 2.500", "1.250,50" gibi STRING
 * dönebilir; düz Number() bunları bozar ("2.500" → 2.5). Bu yüzden TR/EN uyumlu parseMoney
 * kullanılır: "2.500" → 2500, "1.250,50" → 1250.50, "₺ 2.500" → 2500.
 */
function toPositiveAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === 'string') {
    const n = parseMoney(value);
    return n !== null && n > 0 ? n : null;
  }
  return null;
}

/** Adet ayrıştırması: tam sayı; "2 adet", "x2", "2.Adet" gibi metinlerden rakamları çeker. */
function toPositiveQuantity(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  if (typeof value === 'string') {
    const digits = value.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number.parseInt(digits, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
