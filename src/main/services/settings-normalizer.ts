import type { AppSettings } from '../../shared/types';
import { DEFAULT_PCLOUD_ROOT } from '../../shared/constants';
import { safeFileDisplayName } from '../../shared/turkish';

/**
 * Ayarlar / dağıtım (deployment) normalize ve sürüm karşılaştırma yardımcıları.
 * ipc-domain-services.ts'ten ayrıştırıldı (davranış birebir korunur).
 */

/** Ofis istemci dosya adını güvenli hâle getirir (dağıtım sürüm kayıtları için). */
export function safeClientFileName(value: string): string {
  const cleaned = safeFileDisplayName(value || 'BILINMEYEN-PC').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64);
  return cleaned || 'BILINMEYEN-PC';
}

/** Semver benzeri sürüm karşılaştırması. Yalnızca prerelease/build ekini (-, +) ayırır; noktayı sürüm bileşeni olarak bölmez. */
export function compareVersions(left: string, right: string): number {
  const l = (left.split(/[+-]/)[0] ?? '').split('.').map((part) => Number(part) || 0);
  const r = (right.split(/[+-]/)[0] ?? '').split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(l.length, r.length); i += 1) {
    const diff = (l[i] ?? 0) - (r[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Sayısal aralığı [min,max] içine kıstırır; geçersizse fallback döner. */
export function clampInterval(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Kullanıcı listesini temizler; aktif kullanıcıyı başa ekler, tekrarsız ve sınırlı tutar. */
export function normalizeUsers(input: unknown, activeUser: string): string[] {
  const defaults = ['Ömer Faruk İşleyen', 'Enes Özmen', 'Baran Gürbüz', 'Berfin Kapar'];
  const raw = Array.isArray(input) ? input : defaults;
  const users = raw
    .map((value) => safeFileDisplayName(String(value ?? '').trim()))
    .filter((value) => value.length > 0 && value.length <= 80);
  if (!users.includes(activeUser)) users.unshift(activeUser);
  return [...new Set(users)].slice(0, 50);
}

/** Uygulama ayarlarını güvenli varsayılanlara normalize eder (Gemini anahtarı yalnızca doluysa korunur). */
export function normalizeSettings(input: AppSettings): AppSettings {
  const { geminiApiKey: rawGeminiKey, ...rest } = input;
  const rootPath = String(rest.rootPath || DEFAULT_PCLOUD_ROOT).trim();
  if (!rootPath) throw new Error('Ana klasör yolu boş olamaz.');
  const activeUser = safeFileDisplayName(rest.activeUser || 'Sistem') || 'Sistem';
  const users = normalizeUsers(rest.users, activeUser);
  const geminiApiKey = typeof rawGeminiKey === 'string' ? rawGeminiKey.trim().slice(0, 200) : '';
  return {
    ...rest,
    rootPath,
    rootPathConfirmed: rest.rootPathConfirmed === true,
    theme: rest.theme === 'dark' ? 'dark' : 'light',
    zoom: Math.min(1.35, Math.max(0.8, Number(rest.zoom) || 1)),
    activeUser,
    activeComputer: safeFileDisplayName(rest.activeComputer || ''),
    users,
    scanIntervals: {
      fullYearLightMs: clampInterval(rest.scanIntervals?.fullYearLightMs, 300000, 3600000, 300000)
    },
    ...(geminiApiKey ? { geminiApiKey } : {})
  };
}
