/**
 * v0.6.1: AI (Gemini) görsel/OCR çağrılarındaki GEÇİCİ hataların (HTTP 5xx, zaman aşımı, ağ hatası)
 * merkezi sınıflandırması. Geçici hatalar uygulamayı kilitlememeli; kullanıcıya tek ve anlaşılır bir
 * Türkçe mesaj + tekrar deneme imkanı sunulmalıdır. Teknik ayrıntı yalnız main-process log'unda kalır.
 *
 * Yeni paid servis/dependency/IPC eklemez; yalnızca hata kodu + kullanıcı mesajı taşır.
 */
export const AI_TRANSIENT_ERROR_CODE = 'AI_SERVICE_TRANSIENT';
export const AI_TRANSIENT_USER_MESSAGE = 'AI servisi geçici olarak cevap vermiyor. Biraz sonra tekrar deneyin veya parçaları manuel girin.';

export interface CodedError extends Error {
  code: string;
}

/** Geçici AI hatası üretir; teknik mesaj korunur (log için) ama koda göre kullanıcıya dostu metin gösterilir. */
export function createTransientAiError(technicalMessage: string): CodedError {
  const error = new Error(technicalMessage) as CodedError;
  error.code = AI_TRANSIENT_ERROR_CODE;
  return error;
}

/** Bir hatanın/koda göre geçici AI hatası olup olmadığını söyler (renderer + main ortak kullanır). */
export function isTransientAiError(value: unknown): boolean {
  if (value && typeof value === 'object' && (value as { code?: unknown }).code === AI_TRANSIENT_ERROR_CODE) return true;
  return value === AI_TRANSIENT_ERROR_CODE;
}
