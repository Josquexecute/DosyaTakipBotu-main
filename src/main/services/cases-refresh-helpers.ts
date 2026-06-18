import type { ClaimType } from '../../shared/types';

/**
 * Dosya (case) sorgu/önbellek-tazeleme yardımcıları. ipc-domain-services.ts'ten ayrıştırıldı; davranış birebir korunur.
 * Eşzamanlılık sınırlı eşleme + mutasyon sırasında yeniden analiz edilemeyen durumlar için boş analiz nesneleri.
 */

/** cases:list / dashboard refresh sırasında diskten takip okuma eşzamanlılığı. */
export const TRACKING_REFRESH_CONCURRENCY = 12;
/** Art arda gelen list/dashboard çağrılarında aynı pCloud okumalarını tekrarlamamak için minimum aralık (ms). */
export const TRACKING_REFRESH_MIN_INTERVAL_MS = 1500;

/** Bir diziyi sınırlı eşzamanlılıkla (limit kadar worker) eşler; sırayı korur. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]!, index);
    }
  }));
  return output;
}

/** Mutasyon sırasında yeniden analiz edilemeyen durumlar için boş evrak analizi (uyarılı). */
export function emptyDocumentAnalysis(claimType: ClaimType) {
  return {
    claimType,
    evrakFolderExists: false,
    filesScanned: 0,
    requirements: [],
    missingCritical: [],
    claimNoticeNo: '',
    claimNoticeFiles: [],
    hasKttOrZabitOrBeyan: false,
    counterpartyPolicyCandidate: false,
    conflictFiles: [],
    warnings: ['Evrak analizi bu işlem sırasında yenilenemedi. Yeniden tarama ile güncellenecek.']
  };
}

/** Mutasyon sırasında yeniden analiz edilemeyen durumlar için boş fotoğraf analizi. */
export function emptyPhotoAnalysis() {
  return {
    hasarFolderExists: false,
    totalImageFiles: 0,
    damagePhotoCount: 0,
    hasKm: false,
    hasVites: false,
    hasSaseOrSasi: false,
    hasOlayYeri: false,
    olayYeriPhotoCount: 0,
    unsupportedFiles: [],
    corruptSuspects: [],
    previews: [],
    warnings: []
  };
}
