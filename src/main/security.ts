import path from 'node:path';
import { shell, type BrowserWindow, type Session } from 'electron';
import { DEFAULT_PCLOUD_ROOT } from '../shared/constants';
import { isPathInsideNormalized } from '../shared/path-normalization';

export const SECURITY_FLAGS = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true
} as const;

export function installContentSecurityPolicy(session: Session): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });
}

export function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openSafeExternalUrl(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      void openSafeExternalUrl(url);
    }
  });
}

export async function openSafeExternalUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const allowedHosts = new Set(['turkiyesigorta.com.tr', 'www.turkiyesigorta.com.tr']);
    if (!allowedHosts.has(parsed.hostname)) return false;
    await shell.openExternal(parsed.toString());
    return true;
  } catch {
    return false;
  }
}

export { normalizePathForCompare } from '../shared/path-normalization';

export function isPathInside(childPath: string, parentPath: string): boolean {
  return isPathInsideNormalized(path.resolve(childPath), path.resolve(parentPath));
}

export function assertSafeCasePath(folderPath: string, configuredRoot: string): void {
  const root = configuredRoot || DEFAULT_PCLOUD_ROOT;
  if (!isPathInside(folderPath, root)) {
    throw new Error('Güvenlik nedeniyle seçilen yol aktif ana klasörün dışında işlenemez.');
  }
  const normalizedParts = path.normalize(folderPath).split(/[\\/]+/);
  if (normalizedParts.includes('..')) {
    throw new Error('Güvenlik nedeniyle üst klasöre kaçış içeren yollar reddedildi.');
  }
}
