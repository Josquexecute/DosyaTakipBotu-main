import type { BrowserWindow, OpenDialogOptions } from 'electron';
import path from 'node:path';
import { extractPdfText } from '../import/pdf-text';
import { callGeminiText } from '../import/gemini-client';
import {
  parseComplianceResponse,
  type ReportInvoiceAiTestResult,
  type ReportInvoiceComplianceArgs,
  type ReportInvoiceComplianceResult,
  type ReportInvoicePdfPick
} from '../../shared/report-invoice/report-invoice-types';

/**
 * v0.6.3: Rapor / Fatura Uyum Kontrolü servisi.
 *
 * - PDF metni yerel çıkarılır (pdf2json). Yalnız dosya ADI döner; TAM DOSYA YOLU asla renderer'a/AI'ya gönderilmez.
 * - Karşılaştırma AI (Gemini metin) ile yapılır; kullanıcı bu modülde rapor/fatura içeriğinin AI'ya gönderilmesini kabul etti.
 * - Geçici AI hataları (503/timeout/network) callGeminiText üzerinden kodlu fırlatılır; uygulama kilitlenmez.
 * - KALICI YAZMA YOKTUR: ana takip dosyasına / Excel'e / Bilgi Bankası'na / kullanıcı deposuna yazmaz; sonuç yalnız gösterim içindir.
 */
const MAX_PDF_TEXT_CHARS = 40_000;
// v0.6.3: Bu eşiğin altında "kullanılabilir metin" yoktur → taranmış/görsel PDF kabul edilir.
// Gerçek rapor/fatura PDF'leri yüzlerce-binlerce karakter taşır; taranmış PDF'ler ~0 metin verir.
const MIN_USABLE_PDF_TEXT_CHARS = 60;
// pdf2json ham metni boş sayfalarda bile "----------------Page (N) Break----------------" işaretleyebilir;
// kullanılabilir metni ölçerken bu işaretleri sayma, yoksa boş sayfalar yanlışlıkla "metin var" görünür.
const PDF_PAGE_BREAK_MARKER = /-+\s*page\s*\(\d+\)\s*break\s*-+/gi;
// v0.6.3: AI bağlantısını doğrulamak için kısa Türkçe test promptu. İçerik göndermez; yalnız erişimi sınar.
const AI_CONNECTION_TEST_PROMPT = [
  'Bu bir bağlantı testidir; gerçek veri yok.',
  'Yalnızca şu JSON ile yanıt ver, başka hiçbir şey yazma: {"durum":"ok"}'
].join('\n');

export async function chooseReportInvoicePdf(window: BrowserWindow | null): Promise<ReportInvoicePdfPick> {
  // Electron yalnız burada (dosya seçim diyaloğu) gerekir; modülü node testlerinde de yüklenebilir tutmak için tembel alınır.
  const { dialog } = require('electron') as typeof import('electron');
  const options: OpenDialogOptions = {
    title: 'Rapor / Fatura PDF seçin',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) throw new Error('PDF seçimi iptal edildi.');
  const selectedPath = path.resolve(result.filePaths[0]);
  const fileName = path.basename(selectedPath);
  const extracted = await extractPdfText(selectedPath);
  // Okuma başarısız (bozuk/PDF değil/zaman aşımı): tam dosya yolu içermeyen Türkçe mesajla bildir; uygulama kırılmaz.
  if (!extracted.ok) throw new Error('PDF metni okunamadı. Dosya bozuk, eksik veya metin içermiyor olabilir.');
  const usableText = collapseWhitespace(extracted.text.replace(PDF_PAGE_BREAK_MARKER, ' '));
  // v0.6.3: Metin boş/çok kısa → taranmış/görsel kabul et. AI'ya boş metin gönderme; sahte "Uyumlu" üretilmez.
  if (usableText.length < MIN_USABLE_PDF_TEXT_CHARS) {
    return { fileName, charCount: usableText.length, truncated: false, text: '', scanned: true };
  }
  return {
    fileName,
    charCount: usableText.length,
    truncated: usableText.length > MAX_PDF_TEXT_CHARS,
    text: usableText.slice(0, MAX_PDF_TEXT_CHARS),
    scanned: false
  };
}

/**
 * v0.6.3: AI (Gemini) bağlantı testi. Mevcut Gemini ayarını/anahtarını kullanır, kısa Türkçe test promptu atar.
 * - Anahtar yoksa Türkçe uyarı döner (hata fırlatmaz).
 * - 503/zaman aşımı/ağ hataları callGeminiText üzerinden GEÇİCİ hata olarak yukarı taşınır; uygulama kilitlenmez.
 * KALICI YAZMA YOKTUR; yalnız gösterim içindir.
 */
export async function testReportInvoiceAiConnection(apiKey: string): Promise<ReportInvoiceAiTestResult> {
  const trimmed = String(apiKey ?? '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Gemini API anahtarı tanımlı değil. Ayarlar → "AI / Parça Okuma" bölümünden anahtarınızı girin.' };
  }
  await callGeminiText(trimmed, AI_CONNECTION_TEST_PROMPT, { timeoutMs: 20_000 });
  return { ok: true, message: 'AI bağlantısı çalışıyor.' };
}

export async function checkReportInvoiceCompliance(apiKey: string, args: ReportInvoiceComplianceArgs): Promise<ReportInvoiceComplianceResult> {
  const reportText = String(args?.reportText ?? '').slice(0, MAX_PDF_TEXT_CHARS).trim();
  const invoiceText = String(args?.invoiceText ?? '').slice(0, MAX_PDF_TEXT_CHARS).trim();
  if (!reportText) throw new Error('Önce ekspertiz raporu PDF seçin.');
  if (!invoiceText) throw new Error('Önce e-fatura PDF seçin.');
  const raw = await callGeminiText(apiKey, buildCompliancePrompt(reportText, invoiceText, args?.context));
  return parseComplianceResponse(raw);
}

function collapseWhitespace(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    out += code < 32 || code === 127 ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function buildCompliancePrompt(reportText: string, invoiceText: string, context?: ReportInvoiceComplianceArgs['context']): string {
  const ctxLines = [
    context?.fileNo ? `Dosya No: ${String(context.fileNo).slice(0, 60)}` : '',
    context?.plate ? `Plaka: ${String(context.plate).slice(0, 30)}` : '',
    context?.serviceName ? `Servis: ${String(context.serviceName).slice(0, 80)}` : ''
  ].filter(Boolean).join('\n');
  return [
    'Sen deneyimli bir oto sigorta eksperi / bilirkişisin. Aşağıda bir EKSPERTİZ RAPORU metni ve bir E-FATURA metni var.',
    'İkisini bir bilirkişi titizliğiyle KARŞILAŞTIR ve uyup uymadığını GEREKÇELİ açıkla. Sadece "uyuyor/uymuyor" deme; sebebini yaz.',
    '',
    'KURALLAR:',
    '- Rapor ve fatura tutarlarını AYRI AYRI göster; fark varsa farkın nereden geldiğini söyle.',
    '- Parça, sarf, LASTİK ve işçilik kalemlerini ayrı değerlendir. Lastik/sarf bir tarafta var diğerinde yoksa belirt.',
    '- Parça KODU farklı ama tutar aynıysa "kod farkı var" de. Parça ADI/açıklaması farklı ama tutar aynıysa "açıklama farkı var" de.',
    '- İskonto, kıymet kazanma tenzili, KDV, tevkifat, KDV dahil toplam ve ödenecek tutarı kontrol et.',
    '- Kıymet kazanma tenzili RAPORDA varsa FATURADA düşülmüş mü özellikle kontrol et; düşülmemişse açıkça yaz.',
    '- Fatura TEVKİFATLI ise "Ödenecek Tutar" ile "KDV Dahil Toplam" farkı NORMALDİR; bunu yanlışlıkla uyumsuzluk sayma, tevkifat olarak açıkla.',
    '- Emin olamadığın yerde "Kontrol gerekli" de; YANLIŞ KESİNLİK kullanma. Uydurma rakam verme.',
    '',
    'YALNIZCA aşağıdaki şemaya UYAN geçerli JSON döndür, başka metin yazma:',
    '{"overall":"Uyumlu|Kısmen uyumlu|Uyumsuz|Kontrol gerekli","summary":"","differences":[""],"amountComparison":[{"label":"","report":"","invoice":"","note":""}],"partComparison":[""],"laborComparison":[""],"valueGainCheck":"","withholdingNote":"","recommendation":"","warnings":[""]}',
    ctxLines ? `\nDOSYA BAĞLAMI:\n${ctxLines}` : '',
    '',
    '=== EKSPERTİZ RAPORU METNİ ===',
    reportText,
    '',
    '=== E-FATURA METNİ ===',
    invoiceText
  ].join('\n');
}
