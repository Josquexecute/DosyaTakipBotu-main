/**
 * v0.6.x — AI İşçilik v3.9: Excel yazma hatalarını kullanıcı dostu mesaja çevirir (SAF; ağ/dosya yok).
 * Windows'ta dosya Excel'de açıkken rename/silme EBUSY/EPERM/EACCES verir; kullanıcıya net yönlendirme sunulur.
 */
const LOCK_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);
const LOCK_TEXT = /rename|lock|permission denied|being used by another|kilit|erişim engellendi/i;

const LOCK_MESSAGE =
  'Excel dosyası açık veya kilitli görünüyor. Lütfen Excel\'i kapatıp tekrar deneyin. ' +
  'Yedek dosya oluşturulduysa korunur; yazma tamamlanmadıysa orijinal dosya değiştirilmemiş olabilir.';

/** Hata bir dosya kilidi/izin hatası mı? */
export function isExcelLockError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code ?? '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return LOCK_CODES.has(code) || LOCK_TEXT.test(message);
}

export interface NormalizedExcelWriteError {
  message: string;
  debugMessage: string;
}

/** Yazma hatasını kullanıcı mesajı + teknik detaya ayırır. */
export function describeExcelWriteError(error: unknown): NormalizedExcelWriteError {
  const err = (error && typeof error === 'object' ? error : {}) as { code?: string; message?: string };
  const rawMessage = error instanceof Error ? error.message : err.message ?? String(error ?? '');
  const debugMessage = `${err.code ?? ''} ${rawMessage}`.trim();
  if (isExcelLockError(error)) return { message: LOCK_MESSAGE, debugMessage };
  return { message: `Excel D sütununa yazma sırasında hata oluştu. ${debugMessage}`.trim(), debugMessage };
}
