import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DeploymentStatus, OfficeVersionClient, OfficeVersionMarker } from '../../shared/types';
import { APP_VERSION, OFFICE_VERSION_FILE_NAME, OFFICE_VERSION_FOLDER_NAME } from '../../shared/constants';
import { nowIso } from '../tracking/tracking-defaults';
import { atomicWriteJson } from '../storage/atomic-write';
import { existsDirectory } from './fs-utils';
import { compareVersions, safeClientFileName } from './settings-normalizer';
import type { IpcDomainContext } from './ipc-domain-services';

/**
 * Ofis dağıtım (deployment) ve sürüm kontrol servisi. ipc-domain-services.ts'ten ayrıştırıldı;
 * davranış birebir korunur. Ofis hedef sürüm işaretini ve PC istemci kayıtlarını okur/yazar,
 * eski sürüm/çoklu sürüm uyarıları üretir. Yazma yalnızca aktif kök erişilebilirse yapılır.
 */
async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function readOfficeVersionClients(clientsDir: string): Promise<OfficeVersionClient[]> {
  const entries = await fs.readdir(clientsDir, { withFileTypes: true }).catch(() => []);
  const clients = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map(async (entry) => readJsonSafe<OfficeVersionClient>(path.join(clientsDir, entry.name))));
  return clients
    .filter((client): client is OfficeVersionClient => Boolean(client?.computer && client?.appVersion))
    .sort((a, b) => a.computer.localeCompare(b.computer, 'tr'));
}

export class DeploymentService {
  constructor(private readonly context: IpcDomainContext) {}

  async getStatus(registerClient: boolean): Promise<DeploymentStatus> {
    const settings = await this.context.getSettings();
    const rootAvailable = await existsDirectory(settings.rootPath);
    const officeStatusFolder = path.join(settings.rootPath, OFFICE_VERSION_FOLDER_NAME);
    const clientsDir = path.join(officeStatusFolder, 'clients');
    const markerPath = path.join(officeStatusFolder, OFFICE_VERSION_FILE_NAME);
    const warnings: string[] = [];

    const marker = rootAvailable ? await readJsonSafe<OfficeVersionMarker>(markerPath) : null;
    if (!rootAvailable) warnings.push('Ana klasör bağlı değil. Ofis sürüm kontrolü yerel önbellek modunda yapılamaz.');
    if (rootAvailable && !marker?.expectedVersion) {
      warnings.push(`Ofis hedef sürüm dosyası bulunamadı. Windows üzerinde \`npm run live:version-check -- -RootPath "D:\\BARAN_GLOBAL_EKSPERTIZ\\2026" -ExpectedVersion ${APP_VERSION} -SetExpected -RegisterThisPC\` komutu ile oluşturulabilir (aktif kök yerel klasör olmalıdır).`);
    }

    if (registerClient && rootAvailable) {
      await fs.mkdir(clientsDir, { recursive: true });
      const client: OfficeVersionClient = {
        computer: settings.activeComputer || process.env.COMPUTERNAME || 'BILINMEYEN-PC',
        user: settings.activeUser || 'Sistem',
        appVersion: APP_VERSION,
        packageName: app.getName() || 'hasarbotu-baran-ekspertiz',
        platform: process.platform,
        rootPath: settings.rootPath,
        recordedAt: nowIso()
      };
      await atomicWriteJson(path.join(clientsDir, `${safeClientFileName(client.computer)}.json`), client, { label: 'Ofis sürüm kontrol kaydı' });
    }

    const clients = rootAvailable ? await readOfficeVersionClients(clientsDir) : [];
    const expectedVersion = marker?.expectedVersion ?? '';
    const isOutdated = Boolean(expectedVersion) && compareVersions(APP_VERSION, expectedVersion) < 0;
    if (isOutdated) {
      warnings.unshift(`Bu bilgisayardaki HasarBotu v${APP_VERSION}; ofis hedef sürümü v${expectedVersion}. Güncelleme tamamlanmadan canlı dosya düzenlemeyin.`);
    }
    const clientVersions = [...new Set(clients.map((client) => client.appVersion).filter(Boolean))];
    if (clientVersions.length > 1) {
      warnings.push(`Ofis sürüm kayıtlarında birden çok sürüm görünüyor: ${clientVersions.join(', ')}. Tüm bilgisayarlar aynı EXE sürümüne alınmalı.`);
    }

    return {
      appVersion: APP_VERSION,
      packageName: app.getName() || 'hasarbotu-baran-ekspertiz',
      activeComputer: settings.activeComputer || process.env.COMPUTERNAME || 'BILINMEYEN-PC',
      activeUser: settings.activeUser || 'Sistem',
      rootPath: settings.rootPath,
      rootAvailable,
      checkedAt: nowIso(),
      officeStatusFolder,
      expectedVersion,
      expectedVersionSetAt: marker?.setAt ?? '',
      isOutdated,
      versionCheckAvailable: Boolean(marker?.expectedVersion),
      canWriteClientStatus: rootAvailable,
      clients,
      warnings
    };
  }
}
