/**
 * v0.6.x — AI İşçilik v3.5: Kullanıcının yapıştırdığı Google AI Mode cevabını parça kodu adaylarına çevirir (SAF).
 * Ağ/scraping YOK — yalnız yapıştırılan METNİ ayrıştırır. Tablo + madde listesi desteklenir; VIN (17 hane) kod sayılmaz.
 */
import { normalizeSearch } from '../turkish';
import { scoreCandidateConfidence } from './ai-mode-part-search-confidence';
import type { AiModePartCandidate, AiModePartKind } from './ai-mode-part-search-types';

const URL_RE = /\bhttps?:\/\/[^\s|)\]]+/gi;
const NO_SPACE_CODE_RE = /\b[0-9A-Z][0-9A-Z.\-]{3,15}[0-9A-Z]\b/g;
const KIND_MAP: Array<[RegExp, AiModePartKind]> = [
  [/YAN SANAYI|YANSANAYI|AFTERMARKET/, 'yan_sanayi'],
  [/ESDEGER|EQUIVALENT/, 'esdeger'],
  [/CIKMA|YENIDEN KULLAN|IKINCI EL|2 EL/, 'yeniden_kullanilabilir'],
  [/ORIJINAL|ORJINAL|ORIGINAL/, 'orijinal'],
  [/\bOEM\b/, 'oem']
];

function extractSources(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => m[0]).filter((v, i, a) => a.indexOf(v) === i);
}

function detectKind(text: string): AiModePartKind | undefined {
  const t = normalizeSearch(text);
  for (const [re, kind] of KIND_MAP) if (re.test(t)) return kind;
  return undefined;
}

function isCodeAlnum(alnum: string): boolean {
  if (alnum.length < 5 || alnum.length > 16) return false; // 17 = VIN dışlanır
  const digits = (alnum.match(/\d/g) ?? []).length;
  const letters = (alnum.match(/[A-Z]/g) ?? []).length;
  return (letters >= 1 && digits >= 2) || (letters === 0 && digits >= 7);
}

/** Boşluksuz/tireli kodları yakalar (madde satırları için). */
function extractCodesNoSpace(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toUpperCase().matchAll(NO_SPACE_CODE_RE)) {
    if (isCodeAlnum(m[0].replace(/[^0-9A-Z]/g, '')) && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/** Bir tablo hücresinin parça kodu gibi görünüp görünmediğini döner (boşluklu grup kodlarına izin verir). */
function cellAsCode(cell: string): string | undefined {
  const trimmed = cell.trim();
  if (!trimmed || trimmed.split(/\s+/).length > 4) return undefined; // cümleler kod değildir
  return isCodeAlnum(trimmed.toUpperCase().replace(/[^0-9A-Z]/g, '')) ? trimmed.replace(/\s+/g, ' ') : undefined;
}

function buildCandidate(rawEvidence: string, partCode: string | undefined, partName?: string, compatibility?: string): AiModePartCandidate {
  const { confidence, warnings } = scoreCandidateConfidence(rawEvidence);
  const candidate: AiModePartCandidate = { confidence, warnings, sources: extractSources(rawEvidence), rawEvidence: rawEvidence.trim() };
  if (partCode) candidate.partCode = partCode;
  if (partName) candidate.partName = partName;
  const kind = detectKind(rawEvidence);
  if (kind) candidate.partKind = kind;
  if (compatibility) candidate.compatibility = compatibility;
  return candidate;
}

function candidateFromTableRow(cells: string[], raw: string): AiModePartCandidate | null {
  let code: string | undefined;
  let codeIndex = -1;
  for (let i = 0; i < cells.length; i++) {
    const c = cellAsCode(cells[i]!);
    if (c) { code = c; codeIndex = i; break; }
  }
  if (!code) return null;
  // Parça adı: kod dışındaki, harf içeren, URL olmayan ilk metin hücresi.
  const nameCell = cells.find((c, i) => i !== codeIndex && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(c) && !URL_RE.test(c) && c.trim().length > 1);
  const compatCell = cells.find((c) => /uyum|yil|yıl|motor|kasa/i.test(c));
  return buildCandidate(raw, code, nameCell?.trim(), compatCell?.trim());
}

/** Yapıştırılan AI Mode cevabını parça kodu adaylarına çevirir (yoksa boş dizi). */
export function parseAiModeResponse(text: string): AiModePartCandidate[] {
  if (!text || !text.trim()) return [];
  const candidates: AiModePartCandidate[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.includes('|') && (line.match(/\|/g)?.length ?? 0) >= 2) {
      const cells = line.split('|').map((c) => c.trim()).filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
      if (cells.every((c) => /^[-:\s]*$/.test(c))) continue; // ayraç satırı
      if (/PARCA KODU|PART CODE|PARÇA KODU/i.test(line) && !cells.some((c) => cellAsCode(c))) continue; // başlık
      const cand = candidateFromTableRow(cells, line);
      if (cand) candidates.push(cand);
    } else if (/^[-*•]\s|^\d+[.)]\s/.test(line)) {
      const codes = extractCodesNoSpace(line);
      if (codes.length) candidates.push(buildCandidate(line, codes[0]));
    }
  }
  // Aynı parça kodunu tekrarlama (ilk kalsın).
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = (c.partCode ?? c.rawEvidence).toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
