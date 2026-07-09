/**
 * v0.6.x — Kapanma (Ekspertiz) Ücreti tarayıcısı (SALT-OKUNUR tarama + onaylı elle override).
 *
 * `EKSPERTİZ RAPORLARI/<yıl>` kökündeki ay klasörlerini gezer, "<PLAKA> EKSPERTİZ RAPORU.pdf"
 * dosyalarının METNİNİ mevcut pdf-text okuyucusuyla alır ve saf motorla GENEL TOPLAM'ı çözer.
 * Metin-korumalı (özel-glif) raporlarda OCR (görüntüden okuma) fallback'i denenir. Rapor
 * klasörüne HİÇBİR ŞEY YAZILMAZ; yalnızca kullanıcı ONAYIYLA girilen elle-tutar, local-cache
 * içindeki `closing-fee-overrides.json` dosyasına atomik yazılır (takip.json'a dokunmaz).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractPdfText } from '../import/pdf-text';
import { ocrPdfAllPages, detectOcrTools } from '../import/ocr';
import { atomicWriteJson } from '../storage/atomic-write';
import { extractClosingFeeFromText, parseReportFileName, normalizePlateKey, looksUnreadableReportText } from '../../shared/reports/closing-fee-extract';
import type { ClosingFeeRecord, ClosingFeeScanResult } from '../../shared/reports/closing-fee-scan-types';

const MAX_PDF_COUNT = 2000;
const SCAN_TTL_MS = 5 * 60_000;
const OVERRIDES_FILE = 'closing-fee-overrides.json';

interface CachedFile { signature: string; record: ClosingFeeRecord; }
interface OverrideEntry { feeTl: number; enteredAt: string; enteredBy: string; }
type OverrideMap = Record<string, OverrideEntry>;

export class ClosingFeeService {
  private fileCache = new Map<string, CachedFile>();
  private lastResult: ClosingFeeScanResult | null = null;
  private lastScanMs = 0;
  private overrides: OverrideMap | null = null;

  constructor(private readonly cacheRoot: string) {}

  private get overridesPath(): string {
    return path.join(this.cacheRoot, OVERRIDES_FILE);
  }

  private async loadOverrides(): Promise<OverrideMap> {
    if (this.overrides) return this.overrides;
    try {
      const raw = JSON.parse(await fs.readFile(this.overridesPath, 'utf-8'));
      const map: OverrideMap = {};
      for (const [plate, v] of Object.entries(raw ?? {})) {
        const fee = typeof (v as OverrideEntry)?.feeTl === 'number' ? (v as OverrideEntry).feeTl : null;
        if (fee !== null && fee >= 0) map[normalizePlateKey(plate)] = { feeTl: fee, enteredAt: String((v as OverrideEntry).enteredAt ?? ''), enteredBy: String((v as OverrideEntry).enteredBy ?? '') };
      }
      this.overrides = map;
    } catch {
      this.overrides = {};
    }
    return this.overrides;
  }

  /**
   * Bir plaka için kullanıcı-onaylı elle kapanma tutarı yazar/siler (feeTl=null → siler).
   * Yalnız local-cache override dosyasına atomik yazar; rapor klasörüne/takip.json'a dokunmaz.
   */
  async setOverride(plateRaw: string, feeTl: number | null, user: string): Promise<{ ok: boolean; message?: string }> {
    const plate = normalizePlateKey(plateRaw);
    if (!plate) return { ok: false, message: 'Plaka çözülemedi.' };
    const map = { ...(await this.loadOverrides()) };
    if (feeTl === null) {
      delete map[plate];
    } else {
      if (!Number.isFinite(feeTl) || feeTl < 0 || feeTl > 50_000_000) return { ok: false, message: 'Tutar geçersiz.' };
      map[plate] = { feeTl: Math.round(feeTl * 100) / 100, enteredAt: new Date().toISOString(), enteredBy: user || '' };
    }
    await atomicWriteJson(this.overridesPath, map);
    this.overrides = map;
    this.lastResult = null;
    return { ok: true };
  }

  async scan(rootPath: string, force: boolean): Promise<ClosingFeeScanResult> {
    const root = (rootPath ?? '').trim();
    const scannedAt = new Date().toISOString();
    const overrides = await this.loadOverrides();
    if (!root) {
      return this.withOverridesOnly(overrides, scannedAt, ['Ekspertiz Raporları klasörü ayarlanmamış (Ayarlar ekranından seçin).']);
    }
    if (!force && this.lastResult && this.lastResult.rootPath === root && Date.now() - this.lastScanMs < SCAN_TTL_MS) {
      return this.lastResult;
    }
    const errors: string[] = [];
    const pdfFiles: Array<{ file: string; monthFolder: string }> = [];
    const rootEntries = await fs.readdir(root, { withFileTypes: true }).catch(() => null);
    if (!rootEntries) {
      return this.withOverridesOnly(overrides, scannedAt, [`Rapor klasörü okunamadı: ${root}`], root);
    }
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        pdfFiles.push({ file: path.join(root, entry.name), monthFolder: '' });
      } else if (entry.isDirectory()) {
        const sub = await fs.readdir(path.join(root, entry.name), { withFileTypes: true }).catch(() => []);
        for (const child of sub) {
          if (child.isFile() && child.name.toLowerCase().endsWith('.pdf')) {
            pdfFiles.push({ file: path.join(root, entry.name, child.name), monthFolder: entry.name });
          }
        }
      }
      if (pdfFiles.length > MAX_PDF_COUNT) { errors.push(`Güvenlik sınırı: ${MAX_PDF_COUNT} PDF üzeri tarama kesildi.`); break; }
    }

    const byPlate = new Map<string, ClosingFeeRecord>();
    const ocrTools = await detectOcrTools();
    for (const { file, monthFolder } of pdfFiles) {
      const fileName = path.basename(file);
      const parsedName = parseReportFileName(fileName);
      if (!parsedName.plateKey) { if (parsedName.isReport) errors.push(`Plaka çözülemedi: ${fileName}`); continue; }
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) { errors.push(`Dosya okunamadı: ${fileName}`); continue; }
      const signature = `${stat.mtimeMs}:${stat.size}`;
      const cached = this.fileCache.get(file);
      let record: ClosingFeeRecord;
      if (cached && cached.signature === signature) {
        record = cached.record;
      } else {
        record = await this.extractFromFile(file, fileName, monthFolder, parsedName.plateKey, ocrTools.pdfAvailable);
        this.fileCache.set(file, { signature, record });
      }
      const existing = byPlate.get(record.plateKey);
      if (!existing || (existing.status !== 'ok' && record.status === 'ok')) byPlate.set(record.plateKey, record);
    }

    this.applyOverrides(byPlate, overrides);
    const result = this.finalize(byPlate, root, scannedAt, errors);
    this.lastResult = result;
    this.lastScanMs = Date.now();
    return result;
  }

  private async extractFromFile(file: string, fileName: string, monthFolder: string, plateKey: string, ocrAvailable: boolean): Promise<ClosingFeeRecord> {
    const textResult = await extractPdfText(file);
    let extraction = textResult.ok
      ? extractClosingFeeFromText(textResult.text)
      : { status: 'unreadable' as const, warnings: [textResult.reason ?? 'PDF metni okunamadı.'] };
    let ocrUsed = false;
    // Metin-korumalı (özel-glif) rapor: metin okunamadıysa OCR (görüntüden okuma) fallback'i.
    if (extraction.status === 'unreadable' && ocrAvailable) {
      const ocr = await ocrPdfAllPages(file).catch(() => null);
      if (ocr?.ok && ocr.text && !looksUnreadableReportText(ocr.text)) {
        const fromOcr = extractClosingFeeFromText(ocr.text);
        if (fromOcr.status === 'ok') { extraction = fromOcr; ocrUsed = true; }
      }
    }
    return {
      plateKey, fileName, monthFolder, status: extraction.status,
      ...(extraction.feeTl !== undefined ? { feeTl: extraction.feeTl } : {}),
      ...(extraction.feeRaw ? { feeRaw: extraction.feeRaw } : {}),
      ...(extraction.dosyaNo ? { dosyaNo: extraction.dosyaNo } : {}),
      ...(extraction.raporNo ? { raporNo: extraction.raporNo } : {}),
      ...(extraction.ekspertizTuru ? { ekspertizTuru: extraction.ekspertizTuru } : {}),
      ...(extraction.kayitTarihi ? { kayitTarihi: extraction.kayitTarihi } : {}),
      ...(ocrUsed ? { ocrUsed: true } : {}),
      warnings: ocrUsed ? [...extraction.warnings, 'Değer OCR ile okundu; doğruluğu kontrol edilmelidir.'] : extraction.warnings
    };
  }

  /** Elle girilen tutarlar rapordan okumaya göre önceliklidir; raporsuz plakalarda da kayıt üretir. */
  private applyOverrides(byPlate: Map<string, ClosingFeeRecord>, overrides: OverrideMap): void {
    for (const [plate, entry] of Object.entries(overrides)) {
      const existing = byPlate.get(plate);
      byPlate.set(plate, {
        plateKey: plate,
        fileName: existing?.fileName ?? '(elle girildi)',
        monthFolder: existing?.monthFolder ?? '',
        status: 'ok',
        feeTl: entry.feeTl,
        manual: true,
        ...(existing?.dosyaNo ? { dosyaNo: existing.dosyaNo } : {}),
        ...(existing?.raporNo ? { raporNo: existing.raporNo } : {}),
        warnings: ['Tutar kullanıcı tarafından elle girilmiştir.']
      });
    }
  }

  private finalize(byPlate: Map<string, ClosingFeeRecord>, root: string, scannedAt: string, errors: string[]): ClosingFeeScanResult {
    const records = [...byPlate.values()];
    return {
      ok: true, rootPath: root, scannedAt, totalPdf: records.length,
      okCount: records.filter((r) => r.status === 'ok').length,
      unreadableCount: records.filter((r) => r.status === 'unreadable').length,
      feeMissingCount: records.filter((r) => r.status === 'fee_missing').length,
      records, errors
    };
  }

  private withOverridesOnly(overrides: OverrideMap, scannedAt: string, errors: string[], root = ''): ClosingFeeScanResult {
    const byPlate = new Map<string, ClosingFeeRecord>();
    this.applyOverrides(byPlate, overrides);
    return { ...this.finalize(byPlate, root, scannedAt, errors), ok: root !== '' && errors.length === 0 ? true : byPlate.size > 0 };
  }
}
