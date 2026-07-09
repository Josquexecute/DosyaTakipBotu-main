import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const OCR_TIMEOUT_MS = 20_000;
const OCR_MAX_BUFFER = 2 * 1024 * 1024;
const OCR_LANGUAGES = 'tur+eng';
const OCR_TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

export interface OcrToolStatus {
  tesseractPath: string;
  pdftoppmPath: string;
  available: boolean;
  pdfAvailable: boolean;
  warnings: string[];
}

export interface OcrTextResult {
  ok: boolean;
  text: string;
  reason?: string;
  tools: OcrToolStatus;
}

let cachedStatus: { detectedAt: number; status: Promise<OcrToolStatus> } | null = null;

export async function detectOcrTools(): Promise<OcrToolStatus> {
  const now = Date.now();
  if (!cachedStatus || now - cachedStatus.detectedAt > OCR_TOOL_CACHE_TTL_MS) {
    cachedStatus = { detectedAt: now, status: detectOcrToolsInternal() };
  }
  return cachedStatus.status;
}

export async function ocrPdfFirstPage(filePath: string): Promise<OcrTextResult> {
  const tools = await detectOcrTools();
  if (!tools.pdfAvailable) {
    return { ok: false, text: '', reason: tools.warnings.join(' ') || 'PDF OCR araçları bulunamadı.', tools };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ocr-'));
  try {
    const outputPrefix = path.join(tempDir, 'page');
    await execFile(tools.pdftoppmPath, ['-f', '1', '-l', '1', '-r', '220', '-png', filePath, outputPrefix], {
      timeout: OCR_TIMEOUT_MS,
      maxBuffer: OCR_MAX_BUFFER,
      windowsHide: true
    });
    const rendered = (await fs.readdir(tempDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, 'tr'))[0];
    if (!rendered) return { ok: false, text: '', reason: 'PDF OCR için sayfa görüntüsü üretilemedi.', tools };
    return await ocrImageFile(path.join(tempDir, rendered), tools);
  } catch (error) {
    return { ok: false, text: '', reason: error instanceof Error ? error.message : 'PDF OCR başarısız oldu.', tools };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * PDF'in TÜM sayfalarını (güvenli üst sınırla) görüntüye çevirip OCR'lar ve metni birleştirir.
 * Kapanma ücreti gibi "GENEL TOPLAM" son sayfada olduğundan ilk-sayfa OCR'ı yetmez.
 * Metin-korumalı (özel-glif) raporlarda kullanılır; salt-okuma, hiçbir yere yazmaz.
 */
export async function ocrPdfAllPages(filePath: string, maxPages = 6): Promise<OcrTextResult> {
  const tools = await detectOcrTools();
  if (!tools.pdfAvailable) {
    return { ok: false, text: '', reason: tools.warnings.join(' ') || 'PDF OCR araçları bulunamadı.', tools };
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-ocrall-'));
  try {
    const outputPrefix = path.join(tempDir, 'page');
    await execFile(tools.pdftoppmPath, ['-f', '1', '-l', String(maxPages), '-r', '200', '-png', filePath, outputPrefix], {
      timeout: OCR_TIMEOUT_MS * 3,
      maxBuffer: OCR_MAX_BUFFER,
      windowsHide: true
    });
    const pages = (await fs.readdir(tempDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, 'tr'));
    if (pages.length === 0) return { ok: false, text: '', reason: 'PDF OCR için sayfa görüntüsü üretilemedi.', tools };
    const texts: string[] = [];
    for (const page of pages) {
      const res = await ocrImageFile(path.join(tempDir, page), tools);
      if (res.ok && res.text) texts.push(res.text);
    }
    if (texts.length === 0) return { ok: false, text: '', reason: 'OCR metin üretemedi.', tools };
    return { ok: true, text: texts.join('\n'), tools };
  } catch (error) {
    return { ok: false, text: '', reason: error instanceof Error ? error.message : 'PDF OCR başarısız oldu.', tools };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function ocrImageFile(filePath: string, existingTools?: OcrToolStatus): Promise<OcrTextResult> {
  const tools = existingTools ?? await detectOcrTools();
  if (!tools.available) {
    return { ok: false, text: '', reason: tools.warnings.join(' ') || 'Tesseract OCR bulunamadı.', tools };
  }

  const primary = await runTesseract(tools.tesseractPath, filePath, OCR_LANGUAGES);
  if (primary.ok || !/language|traineddata|data file/i.test(primary.reason ?? '')) return { ...primary, tools };
  const fallback = await runTesseract(tools.tesseractPath, filePath, 'eng');
  return { ...fallback, tools };
}

async function detectOcrToolsInternal(): Promise<OcrToolStatus> {
  const tesseractPath = await findExecutable('tesseract.exe', [
    process.env.TESSERACT_PATH,
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
    // NAPS2 tarayıcı yazılımı Tesseract'ı birlikte getirir; kuruluysa yeniden kurulum gerekmez.
    'C:\\Program Files\\NAPS2\\lib\\_win64\\tesseract.exe',
    'C:\\Program Files (x86)\\NAPS2\\lib\\_win64\\tesseract.exe'
  ]);
  const pdftoppmPath = await findExecutable('pdftoppm.exe', [
    process.env.PDFTOPPM_PATH,
    process.env.POPPLER_PATH ? path.join(process.env.POPPLER_PATH, 'pdftoppm.exe') : '',
    process.env.POPPLER_PATH ? path.join(process.env.POPPLER_PATH, 'Library', 'bin', 'pdftoppm.exe') : '',
    'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
    'C:\\Program Files\\poppler\\bin\\pdftoppm.exe',
    'C:\\Program Files\\Poppler\\Library\\bin\\pdftoppm.exe',
    'C:\\Program Files\\Poppler\\bin\\pdftoppm.exe'
  ]);

  const warnings: string[] = [];
  if (!tesseractPath) warnings.push('Tesseract OCR bulunamadı; taranmış görsel/PDF metni otomatik okunamaz.');
  if (!pdftoppmPath) warnings.push('Poppler pdftoppm bulunamadı; taranmış PDF ilk sayfası OCR için görüntüye çevrilemez.');
  return {
    tesseractPath,
    pdftoppmPath,
    available: Boolean(tesseractPath),
    pdfAvailable: Boolean(tesseractPath && pdftoppmPath),
    warnings
  };
}

async function findExecutable(executableName: string, candidates: Array<string | undefined>): Promise<string> {
  for (const candidate of candidates) {
    if (candidate && await executableWorks(candidate)) return candidate;
  }
  const fromPath = await whereExecutable(executableName);
  for (const candidate of fromPath) {
    if (await executableWorks(candidate)) return candidate;
  }
  const fromWinget = await findWingetExecutable(executableName);
  if (fromWinget) return fromWinget;
  return '';
}

async function findWingetExecutable(executableName: string): Promise<string> {
  const root = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages') : '';
  if (!root) return '';
  const matches = await findExecutableUnder(root, executableName, 6).catch(() => []);
  matches.sort((a, b) => b.localeCompare(a, 'tr'));
  return matches[0] ?? '';
}

async function findExecutableUnder(root: string, executableName: string, maxDepth: number, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const matches: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === executableName.toLowerCase()) matches.push(fullPath);
    if (entry.isDirectory()) matches.push(...await findExecutableUnder(fullPath, executableName, maxDepth, depth + 1));
  }
  return matches;
}

async function whereExecutable(executableName: string): Promise<string[]> {
  try {
    const result = await execFile('where.exe', [executableName], { timeout: 3000, maxBuffer: OCR_MAX_BUFFER, windowsHide: true });
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function executableWorks(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function runTesseract(tesseractPath: string, filePath: string, languages: string): Promise<Omit<OcrTextResult, 'tools'>> {
  try {
    const result = await execFile(tesseractPath, [filePath, 'stdout', '-l', languages, '--psm', '6'], {
      timeout: OCR_TIMEOUT_MS,
      maxBuffer: OCR_MAX_BUFFER,
      windowsHide: true
    });
    const text = normalizeOcrText(result.stdout);
    return text
      ? { ok: true, text }
      : { ok: false, text: '', reason: 'OCR çıktı üretti ama okunabilir metin bulunamadı.' };
  } catch (error) {
    return { ok: false, text: '', reason: error instanceof Error ? error.message : 'OCR başarısız oldu.' };
  }
}

function normalizeOcrText(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
