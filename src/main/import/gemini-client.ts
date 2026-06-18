/**
 * Google Gemini (ücretsiz katman) görsel istemcisi.
 * API anahtarı KODA GÖMÜLMEZ; çağıran taraf (yerel ayardan okunan) anahtarı verir.
 * Yalnızca transport katmanıdır; yanıt ayrıştırma parts-list-analyzer'da yapılır.
 */
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 60_000;

export interface GeminiVisionOptions {
  model?: string;
  timeoutMs?: number;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  promptFeedback?: { blockReason?: string };
}

export async function callGeminiVision(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
  options: GeminiVisionOptions = {}
): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API anahtarı tanımlı değil. Ayarlar ekranından anahtarınızı girin.');
  }
  const model = options.model || DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(mapHttpError(response.status, body));
    }
    const data = (await response.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini içeriği işleyemedi (${data.promptFeedback.blockReason}). Farklı/net bir fotoğraf deneyin.`);
    }
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
    if (!text.trim()) throw new Error('Gemini boş yanıt döndü. Fotoğrafı netleştirip tekrar deneyin.');
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Gemini isteği zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin.');
    }
    if (error instanceof TypeError) {
      throw new Error('Gemini sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function mapHttpError(status: number, body: string): string {
  if (status === 400 && /API_KEY_INVALID|api key not valid/i.test(body)) {
    return 'Gemini API anahtarı geçersiz. Ayarlar ekranından doğru anahtarı girin.';
  }
  if (status === 429) return 'Gemini ücretsiz kota sınırına ulaşıldı (günlük/dakikalık limit). Bir süre sonra tekrar deneyin.';
  if (status === 403) return 'Gemini erişimi reddedildi (403). API anahtarının yetkisini ve projeyi kontrol edin.';
  if (status === 404) return 'Gemini modeli bulunamadı (404). Model adını kontrol edin.';
  if (status >= 500) return `Gemini sunucu hatası (HTTP ${status}). Birazdan tekrar deneyin.`;
  return `Gemini isteği başarısız oldu (HTTP ${status}).`;
}
