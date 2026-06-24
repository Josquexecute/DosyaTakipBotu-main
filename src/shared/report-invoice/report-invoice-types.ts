/**
 * v0.6.3: Rapor / Fatura Uyum Kontrolü tipleri + GÜVENLİ AI-yanıt ayrıştırıcı.
 *
 * Bu modül saftır (ağ/dosya yok). AI'dan dönen JSON güvenilmezdir; bozuk/eksik yanıt "Kontrol gerekli"
 * olarak normalize edilir, uygulama kilitlenmez. Kalıcı yazma YOKTUR; sonuç yalnız gösterim içindir.
 */
export type ComplianceVerdict = 'Uyumlu' | 'Kısmen uyumlu' | 'Uyumsuz' | 'Kontrol gerekli';

export const COMPLIANCE_VERDICTS: ComplianceVerdict[] = ['Uyumlu', 'Kısmen uyumlu', 'Uyumsuz', 'Kontrol gerekli'];

export interface ComplianceAmountRow {
  label: string;
  report: string;
  invoice: string;
  note?: string;
}

export interface ReportInvoiceComplianceResult {
  overall: ComplianceVerdict;
  summary: string;
  differences: string[];
  amountComparison: ComplianceAmountRow[];
  partComparison: string[];
  laborComparison: string[];
  /** Kıymet kazanma tenzili kontrolü. */
  valueGainCheck: string;
  /** Tevkifat yorumu. */
  withholdingNote: string;
  recommendation: string;
  warnings: string[];
}

/** PDF seçim sonucu (bellek-içi; kalıcı yazılmaz, dosya yolu DÖNMEZ). */
export interface ReportInvoicePdfPick {
  fileName: string;
  charCount: number;
  truncated: boolean;
  text: string;
  /**
   * v0.6.3: PDF'ten kullanılabilir metin çıkarılamadıysa (boş/çok kısa) true.
   * Taranmış/görsel PDF kabul edilir; `text` boş bırakılır ve AI'ya gönderilmez.
   */
  scanned: boolean;
}

/** v0.6.3: AI (Gemini) bağlantı testi sonucu. Yalnız gösterim; hiçbir yere kalıcı yazılmaz. */
export interface ReportInvoiceAiTestResult {
  ok: boolean;
  message: string;
}

/** v0.6.3: Taranmış/görsel PDF için kullanıcıya gösterilen sabit Türkçe uyarı. */
export const SCANNED_PDF_NOTICE = 'PDF metni net okunamadı. Dosya taranmış/görsel olabilir. Manuel kontrol gerekli.';

export interface ReportInvoiceComplianceArgs {
  reportText: string;
  invoiceText: string;
  /** İsteğe bağlı dosya bağlamı (dosya no/plaka/servis). Tam dosya yolu GÖNDERİLMEZ. */
  context?: { fileNo?: string; plate?: string; serviceName?: string };
}

function asString(value: unknown, max = 600): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function asStringList(value: unknown, maxItems = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean).slice(0, maxItems);
}

function asAmountRows(value: unknown, maxItems = 30): ComplianceAmountRow[] {
  if (!Array.isArray(value)) return [];
  const rows: ComplianceAmountRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const label = asString(obj.label ?? obj.kalem ?? obj.ad, 120);
    if (!label) continue;
    const note = asString(obj.note ?? obj.not, 240);
    rows.push({
      label,
      report: asString(obj.report ?? obj.rapor, 60),
      invoice: asString(obj.invoice ?? obj.fatura, 60),
      ...(note ? { note } : {})
    });
    if (rows.length >= maxItems) break;
  }
  return rows;
}

function normalizeVerdict(value: unknown): ComplianceVerdict {
  const text = asString(value, 40).toLocaleLowerCase('tr-TR');
  if (/uyumsuz/.test(text)) return 'Uyumsuz';
  if (/kısmen|kismen|partial/.test(text)) return 'Kısmen uyumlu';
  if (/uyumlu|compliant|tutarl/.test(text)) return 'Uyumlu';
  return 'Kontrol gerekli';
}

/** Ham AI nesnesini güvenli, tam doldurulmuş bir sonuca çevirir. */
export function normalizeComplianceResult(raw: unknown): ReportInvoiceComplianceResult {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    overall: normalizeVerdict(obj.overall ?? obj.genelKarar ?? obj.karar),
    summary: asString(obj.summary ?? obj.ozet ?? obj['özet'], 1200) || 'AI özet döndürmedi; sonucu kontrol edin.',
    differences: asStringList(obj.differences ?? obj.farklar),
    amountComparison: asAmountRows(obj.amountComparison ?? obj.tutarKarsilastirmasi ?? obj.tutarlar),
    partComparison: asStringList(obj.partComparison ?? obj.parcaFarklari ?? obj.parcalar),
    laborComparison: asStringList(obj.laborComparison ?? obj.iscilikFarklari ?? obj.iscilik),
    valueGainCheck: asString(obj.valueGainCheck ?? obj.kiymetKazanma, 600),
    withholdingNote: asString(obj.withholdingNote ?? obj.tevkifat, 600),
    recommendation: asString(obj.recommendation ?? obj.oneri ?? obj['öneri'], 600),
    warnings: asStringList(obj.warnings ?? obj.uyarilar)
  };
}

/** AI metin yanıtını (kod-bloğu olabilir) güvenli JSON ayrıştırır; bozuksa "Kontrol gerekli" döner. */
export function parseComplianceResponse(rawText: string): ReportInvoiceComplianceResult {
  const cleaned = String(rawText ?? '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object') return normalizeComplianceResult(value);
    } catch {
      // sıradaki adaya geç
    }
  }
  return {
    overall: 'Kontrol gerekli',
    summary: 'AI yanıtı okunamadı veya beklenen biçimde gelmedi; rapor ve fatura manuel kontrol edilmelidir.',
    differences: [],
    amountComparison: [],
    partComparison: [],
    laborComparison: [],
    valueGainCheck: '',
    withholdingNote: '',
    recommendation: 'Manuel kontrol önerilir.',
    warnings: ['AI yanıtı çözümlenemedi.']
  };
}

/**
 * v0.6.3: Taranmış/görsel (metni okunamayan) PDF için "Kontrol gerekli" sonucu üretir.
 * AI çağrısı YAPILMADAN sonuç döndürür; böylece boş metinle sahte "Uyumlu" sonucu üretilmez.
 * Yalnız DOSYA ADI kullanılır; tam dosya yolu kullanılmaz.
 */
export function buildScannedPdfNotice(reportFileName: string, reportScanned: boolean, invoiceFileName: string, invoiceScanned: boolean): ReportInvoiceComplianceResult {
  const warnings: string[] = [];
  if (reportScanned) warnings.push(`Rapor PDF (${asString(reportFileName, 160) || 'dosya'}) metni okunamadı.`);
  if (invoiceScanned) warnings.push(`Fatura PDF (${asString(invoiceFileName, 160) || 'dosya'}) metni okunamadı.`);
  return {
    overall: 'Kontrol gerekli',
    summary: SCANNED_PDF_NOTICE,
    differences: [],
    amountComparison: [],
    partComparison: [],
    laborComparison: [],
    valueGainCheck: '',
    withholdingNote: '',
    recommendation: 'Taranmış/görsel görünen PDF için metin tabanlı PDF deneyin veya kalemleri manuel kontrol edin.',
    warnings
  };
}
