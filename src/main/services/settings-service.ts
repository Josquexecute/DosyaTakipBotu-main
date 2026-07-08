import { dialog } from 'electron';
import type { OpenDialogOptions } from 'electron';
import path from 'node:path';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_PCLOUD_ROOT } from '../../shared/constants';
import { normalizeSettings } from './settings-normalizer';
import { existsDirectory } from './fs-utils';
import type { IpcDomainContext } from './ipc-domain-services';

/**
 * Uygulama ayarları servisi (oku/yaz/kök seç). ipc-domain-services.ts'ten ayrıştırıldı; davranış birebir korunur.
 * Ana kök değişince yerel önbellek güvenle temizlenir ve indeks sıfırlanır; ayarlar normalize edilerek kaydedilir.
 */
export class SettingsService {
  constructor(private readonly context: IpcDomainContext) {}

  async get(): Promise<AppSettings> {
    return this.context.readSettingsFromDisk();
  }

  async save(settings: AppSettings): Promise<AppSettings> {
    const previous = await this.context.getSettings();
    const normalized = normalizeSettings({ ...settings, rootPathConfirmed: true });
    if (path.resolve(previous.rootPath) !== path.resolve(normalized.rootPath)) {
      await this.context.clearCacheForRootChange(previous.rootPath, normalized.rootPath);
      this.context.state.index = null;
      this.context.state.lastScanAt = '';
    }
    this.context.state.settings = normalized;
    await this.context.cache.saveSettings(normalized);
    this.context.state.rootAvailable = await existsDirectory(normalized.rootPath);
    return normalized;
  }

  async chooseRoot(): Promise<AppSettings> {
    const previous = await this.context.getSettings();
    const defaultPath = await existsDirectory(previous.rootPath)
      ? previous.rootPath
      : await existsDirectory(DEFAULT_PCLOUD_ROOT)
        ? DEFAULT_PCLOUD_ROOT
        : undefined;
    const window = this.context.mainWindowProvider();
    const dialogOptions: OpenDialogOptions = {
      title: 'HasarBotu ana klasörünü seçin',
      ...(defaultPath ? { defaultPath } : {}),
      properties: ['openDirectory', 'createDirectory']
    };
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) return previous;
    return this.save({ ...previous, rootPath: result.filePaths[0], rootPathConfirmed: true });
  }

  /**
   * Kapanma ücreti için Ekspertiz Raporları (yıl) klasörünü seçtirir. Varsayılan olarak, çalışma
   * kökünün komşusundaki "EKSPERTİZ RAPORLARI/<yıl>" klasörünü açar (varsa). SALT-OKUNUR tarama
   * yüzeyi; yalnız yolu ayara yazar, o klasöre hiçbir şey yazmaz.
   */
  async chooseReportsRoot(): Promise<AppSettings> {
    const previous = await this.context.getSettings();
    const derived = deriveReportsRootFromWorkingRoot(previous.rootPath);
    const defaultPath = previous.reportsRootPath && await existsDirectory(previous.reportsRootPath)
      ? previous.reportsRootPath
      : derived && await existsDirectory(derived)
        ? derived
        : await existsDirectory(previous.rootPath) ? previous.rootPath : undefined;
    const window = this.context.mainWindowProvider();
    const dialogOptions: OpenDialogOptions = {
      title: 'Ekspertiz Raporları (yıl) klasörünü seçin — ör. ...\\EKSPERTİZ RAPORLARI\\2026',
      ...(defaultPath ? { defaultPath } : {}),
      properties: ['openDirectory']
    };
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) return previous;
    return this.save({ ...previous, reportsRootPath: result.filePaths[0] });
  }
}

/**
 * Çalışma kökünden ("...\<yıl>") kardeş "EKSPERTİZ RAPORLARI\<yıl>" yolunu türetir.
 * Ör. P:\BARAN GLOBAL EKSPERTİZ\2026 → P:\BARAN GLOBAL EKSPERTİZ\EKSPERTİZ RAPORLARI\2026.
 * Yıl klasörü değilse null döner (çağıran taraf mevcut kökü kullanır).
 */
export function deriveReportsRootFromWorkingRoot(workingRoot: string): string | null {
  const root = (workingRoot ?? '').trim();
  if (!root) return null;
  const leaf = path.basename(root);
  if (!/^\d{4}$/.test(leaf)) return null;
  const parent = path.dirname(root);
  if (!parent || parent === root) return null;
  return path.join(parent, 'EKSPERTİZ RAPORLARI', leaf);
}
