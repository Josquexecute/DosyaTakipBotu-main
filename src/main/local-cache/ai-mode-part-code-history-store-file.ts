/**
 * v0.6.x — AI İşçilik v3.11: D kodu apply/restore işlem geçmişi deposu (AppData/local-cache JSON; atomic).
 * Yalnız kendi dosyasına yazar; takip.json'a/Excel'e/case klasörüne DOKUNMAZ. Bozuk dosya çökertmez (corrupt→boş).
 */
import path from 'node:path';
import { atomicWriteJson } from '../storage/atomic-write';
import { readJsonFileOrNull } from '../storage/json-io';
import { AI_MODE_HISTORY_MAX, appendHistoryEntry, normalizeHistoryEntry } from '../../shared/labor/ai-mode-part-code-history-types';
import type { AiModePartCodeHistoryEntry, AiModePartCodeHistoryStore } from '../../shared/labor/ai-mode-part-code-history-types';

const STORE_FILE = 'ai-mode-part-code-history.json';

export interface HistoryReadResult {
  entries: AiModePartCodeHistoryEntry[];
  corrupt: boolean;
}

export class AiModePartCodeHistoryStoreFile {
  constructor(private readonly cacheRoot: string) {}

  storePath(): string {
    return path.join(this.cacheRoot, STORE_FILE);
  }

  async read(): Promise<HistoryReadResult> {
    let raw: unknown;
    try {
      raw = await readJsonFileOrNull<unknown>(this.storePath());
    } catch {
      return { entries: [], corrupt: true };
    }
    if (raw === null) return { entries: [], corrupt: false };
    const data = raw as Partial<AiModePartCodeHistoryStore>;
    if (typeof raw !== 'object' || !Array.isArray(data.entries)) return { entries: [], corrupt: true };
    const out: AiModePartCodeHistoryEntry[] = [];
    for (const item of data.entries) {
      const entry = normalizeHistoryEntry(item);
      if (entry) out.push(entry);
    }
    return { entries: out.slice(0, AI_MODE_HISTORY_MAX), corrupt: false };
  }

  async write(entries: readonly AiModePartCodeHistoryEntry[]): Promise<AiModePartCodeHistoryStore> {
    const data: AiModePartCodeHistoryStore = { version: 1, entries: entries.slice(0, AI_MODE_HISTORY_MAX), updatedAt: new Date().toISOString() };
    await atomicWriteJson(this.storePath(), data, { allowLocalCacheReplace: true, label: 'AI Mode D kodu işlem geçmişi' });
    return data;
  }

  /** Yeni kaydı en başa ekler (son 100), atomic yazar. Bozuk depo yok sayılır. */
  async append(entry: AiModePartCodeHistoryEntry): Promise<AiModePartCodeHistoryEntry[]> {
    const { entries } = await this.read();
    const next = appendHistoryEntry(entries, entry);
    await this.write(next);
    return next;
  }
}
