/**
 * v0.6.x — Kapanma ücreti tarama sonucu tipleri (SAF; yalnız tip tanımı).
 * IPC kontratı ve renderer bu tipleri paylaşır. Tarama SALT-OKUNURDUR; hiçbir alan
 * dosyaya/Excel'e/takip.json'a otomatik yazılmaz.
 */
import type { ClosingFeeStatus } from './closing-fee-extract';

export interface ClosingFeeRecord {
  /** Normalize plaka anahtarı (ör. 34MPD222) — vaka klasörüyle eşleştirme anahtarı. */
  plateKey: string;
  fileName: string;
  /** Ay klasörü adı (ör. "HAZİRAN 2026"); kökte ise boş. */
  monthFolder: string;
  status: ClosingFeeStatus;
  feeTl?: number;
  feeRaw?: string;
  dosyaNo?: string;
  raporNo?: string;
  ekspertizTuru?: string;
  kayitTarihi?: string;
  /** Değer OCR (görüntüden okuma) ile elde edildiyse true — kontrol edilmesi önerilir. */
  ocrUsed?: boolean;
  /** Değer kullanıcı tarafından elle girildiyse true (rapordan okumaya göre önceliklidir). */
  manual?: boolean;
  warnings: string[];
}

export interface ClosingFeeScanResult {
  ok: boolean;
  rootPath: string;
  scannedAt: string;
  totalPdf: number;
  okCount: number;
  unreadableCount: number;
  feeMissingCount: number;
  records: ClosingFeeRecord[];
  errors: string[];
}
