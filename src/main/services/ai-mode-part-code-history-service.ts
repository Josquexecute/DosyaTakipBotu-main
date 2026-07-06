/**
 * v0.6.x — AI İşçilik v3.11: D kodu apply/restore işlem geçmişini listeler (yalnız okuma; rapor amaçlı).
 * Geçmişe yazma apply/restore servislerinde (best-effort) yapılır; burada yalnız güncel listeyi döner.
 */
import { AiModePartCodeHistoryStoreFile } from '../local-cache/ai-mode-part-code-history-store-file';
import type { AiModePartCodeHistoryListResult } from '../../shared/labor/ai-mode-part-code-history-types';
import type { IpcDomainContext } from './ipc-domain-services';

export class AiModePartCodeHistoryService {
  constructor(private readonly context: IpcDomainContext) {}

  async list(): Promise<AiModePartCodeHistoryListResult> {
    const { entries, corrupt } = await new AiModePartCodeHistoryStoreFile(this.context.cache.cacheRoot).read();
    return { entries, corrupt };
  }
}
