import fs from 'node:fs/promises';
import type { Output, PDFParser as PdfParserClass } from 'pdf2json';

const PDF_TEXT_TIMEOUT_MS = 8000;
const PDF_HEAD_BYTES = 1024;
const PDF_TAIL_BYTES = 64 * 1024;

process.env.PDF2JSON_DISABLE_LOGS ??= '1';
const PDFParser = require('pdf2json') as typeof PdfParserClass;

export interface PdfTextResult {
  ok: boolean;
  text: string;
  reason?: string;
}

export async function extractPdfText(filePath: string, maxBytes = 10 * 1024 * 1024): Promise<PdfTextResult> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) return { ok: false, text: '', reason: 'PDF dosyasi okunamadi.' };
  if (stat.size > maxBytes) return { ok: false, text: '', reason: `PDF ${Math.round(stat.size / 1024 / 1024)} MB; guvenli okuma sinirini asti.` };
  const container = await checkPdfContainer(filePath, stat.size);
  if (!container.ok) return { ok: false, text: '', reason: container.reason };

  return await new Promise<PdfTextResult>((resolve) => {
    const parser = new PDFParser(null, true);
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const done = (result: PdfTextResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      parser.destroy?.();
      resolve(result);
    };
    timeout = setTimeout(() => done({ ok: false, text: '', reason: 'PDF metin okuma zaman asimina ugradi.' }), PDF_TEXT_TIMEOUT_MS);

    parser.on('pdfParser_dataError', (error) => {
      const raw = error instanceof Error ? error.message : error.parserError?.message;
      done({ ok: false, text: '', reason: raw || 'PDF metni okunamadi.' });
    });
    parser.on('pdfParser_dataReady', (data: Output) => {
      const jsonText = outputToText(data);
      const rawText = parser.getRawTextContent?.() || '';
      done({ ok: true, text: [jsonText, rawText].filter(Boolean).join('\n') });
    });
    Promise.resolve(parser.loadPDF(filePath, 0)).catch((error) => {
      done({ ok: false, text: '', reason: error instanceof Error ? error.message : 'PDF metni okunamadi.' });
    });
  });
}

async function checkPdfContainer(filePath: string, size: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (size < 12) return { ok: false, reason: 'PDF dosyasi tamamlanmamis veya bos gorunuyor.' };
  const handle = await fs.open(filePath, 'r').catch(() => null);
  if (!handle) return { ok: false, reason: 'PDF dosyasi okunamadi.' };

  try {
    const head = Buffer.alloc(Math.min(PDF_HEAD_BYTES, size));
    await handle.read(head, 0, head.length, 0);
    if (!head.toString('latin1').includes('%PDF-')) {
      return { ok: false, reason: 'Dosya PDF imzasi tasimiyor.' };
    }

    const tailLength = Math.min(PDF_TAIL_BYTES, size);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    const tailText = tail.toString('latin1');
    if (!tailText.includes('%%EOF')) {
      return { ok: false, reason: 'PDF dosyasi eksik veya bozuk gorunuyor.' };
    }
  } finally {
    await handle.close().catch(() => undefined);
  }

  return { ok: true };
}

function outputToText(data: Output): string {
  return data.Pages
    .flatMap((page) => page.Texts)
    .flatMap((text) => text.R)
    .map((run) => safeDecode(run.T))
    .join(' ');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
