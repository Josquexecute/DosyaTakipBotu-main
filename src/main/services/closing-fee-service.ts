/**
 * v0.6.x — Kapanma (Ekspertiz) Ücreti tarayıcısı (SALT-OKUNUR).
 *
 * `EKSPERTİZ RAPORLARI/<yıl>` kökündeki ay klasörlerini gezer, "<PLAKA> EKSPERTİZ RAPORU.pdf"
 * dosyalarının METNİNİ mevcut pdf-text okuyucusuyla alır ve saf çıkarım motoruyla kapanma
 * ücretini çözer. HİÇBİR YERE YAZMAZ (disk cache dahi yok): sonuçlar yalnız oturum-içi bellek
 * önbelleğinde tutulur (dosya yolu+mtime+boyut imzalı). Rapor kökü pCloud'da olabilir; bu
 * yüzey yalnız OKUMA amaçlıdır — canlı kök kuralını değiştirmez.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractPdfText } from '../import/pdf-text';
import { extractClosingFeeFromText, parseReportFileName } from '../../shared/reports/closing-fee-extract';
import type { ClosingFeeRecord, ClosingFeeScanResult } from '../../shared/reports/closing-fee-scan-types';

const MAX_PDF_COUNT = 2000;
const SCAN_TTL_MS = 5 * 60_000;

interface CachedFile { signature: string; record: ClosingFeeRecord; }

export class ClosingFeeService {
  private fileCache = new Map<string, CachedFile>();
  private lastResult: ClosingFeeScanResult | null = null;
  private lastScanMs = 0;

  /** Rapor kökünü tarar. force=false iken kısa süreli sonuç önbelleği kullanılır. */
  async scan(rootPath: string, force: boolean): Promise<ClosingFeeScanResult> {
    const root = (rootPath ?? '').trim();
    const scannedAt = new Date().toISOString();
    if (!root) {
      return { ok: false, rootPath: '', scannedAt, totalPdf: 0, okCount: 0, unreadableCount: 0, feeMissingCount: 0, records: [], errors: ['Ekspertiz Raporları klasörü ayarlanmamış (Ayarlar ekranından seçin).'] };
    }
    if (!force && this.lastResult && this.lastResult.rootPath === root && Date.now() - this.lastScanMs < SCAN_TTL_MS) {
      return this.lastResult;
    }
    const errors: string[] = [];
    const pdfFiles: Array<{ file: string; monthFolder: string }> = [];
    const rootEntries = await fs.readdir(root, { withFileTypes: true }).catch(() => null);
    if (!rootEntries) {
      return { ok: false, rootPath: root, scannedAt, totalPdf: 0, okCount: 0, unreadableCount: 0, feeMissingCount: 0, records: [], errors: [`Rapor klasörü okunamadı: ${root}`] };
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
      if (pdfFiles.length > MAX_PDF_COUNT) {
        errors.push(`Güvenlik sınırı: ${MAX_PDF_COUNT} PDF üzeri tarama kesildi.`);
        break;
      }
    }

    const records: ClosingFeeRecord[] = [];
    for (const { file, monthFolder } of pdfFiles) {
      const fileName = path.basename(file);
      const parsedName = parseReportFileName(fileName);
      if (!parsedName.plateKey) {
        if (parsedName.isReport) errors.push(`Plaka çözülemedi: ${fileName}`);
        continue;
      }
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) { errors.push(`Dosya okunamadı: ${fileName}`); continue; }
      const signature = `${stat.mtimeMs}:${stat.size}`;
      const cached = this.fileCache.get(file);
      if (cached && cached.signature === signature) { records.push(cached.record); continue; }

      const textResult = await extractPdfText(file);
      const extraction = textResult.ok
        ? extractClosingFeeFromText(textResult.text)
        : { status: 'unreadable' as const, warnings: [textResult.reason ?? 'PDF metni okunamadı.'] };
      const record: ClosingFeeRecord = {
        plateKey: parsedName.plateKey,
        fileName,
        monthFolder,
        status: extraction.status,
        ...(extraction.feeTl !== undefined ? { feeTl: extraction.feeTl } : {}),
        ...(extraction.feeRaw ? { feeRaw: extraction.feeRaw } : {}),
        ...(extraction.dosyaNo ? { dosyaNo: extraction.dosyaNo } : {}),
        ...(extraction.raporNo ? { raporNo: extraction.raporNo } : {}),
        ...(extraction.ekspertizTuru ? { ekspertizTuru: extraction.ekspertizTuru } : {}),
        ...(extraction.kayitTarihi ? { kayitTarihi: extraction.kayitTarihi } : {}),
        warnings: extraction.warnings
      };
      this.fileCache.set(file, { signature, record });
      records.push(record);
    }

    const result: ClosingFeeScanResult = {
      ok: true,
      rootPath: root,
      scannedAt,
      totalPdf: records.length,
      okCount: records.filter((r) => r.status === 'ok').length,
      unreadableCount: records.filter((r) => r.status === 'unreadable').length,
      feeMissingCount: records.filter((r) => r.status === 'fee_missing').length,
      records,
      errors
    };
    this.lastResult = result;
    this.lastScanMs = Date.now();
    return result;
  }
}
