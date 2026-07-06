/**
 * v0.6.x — AI İşçilik v3.6: Onaylı AI Mode parça kodu aday deposu (AppData/local-cache JSON; atomic).
 * Yalnız kendi dosyasına yazar; takip.json'a, Excel'e, case/canlı/pCloud klasörüne DOKUNMAZ.
 * Bozuk/eksik dosya uygulamayı çökertmez (corrupt → boş + uyarı). Migration-safe normalize.
 */
import path from 'node:path';
import { atomicWriteJson } from '../storage/atomic-write';
import { readJsonFileOrNull } from '../storage/json-io';
import { normalizeAiModeCandidateEntry } from '../../shared/labor/ai-mode-part-candidate-store';
import type { AiModePartCandidateStoreFile as StoreData, ApprovedAiModePartCandidateEntry } from '../../shared/labor/ai-mode-part-candidate-store-types';

const STORE_FILE = 'ai-mode-part-candidates.json';

export interface AiModeCandidateReadResult {
  entries: ApprovedAiModePartCandidateEntry[];
  corrupt: boolean;
}

export class AiModePartCandidateStoreFile {
  constructor(private readonly cacheRoot: string) {}

  storePath(): string {
    return path.join(this.cacheRoot, STORE_FILE);
  }

  /** Depoyu okur. Yoksa boş (corrupt=false); bozuksa boş (corrupt=true) — asla throw etmez. */
  async read(): Promise<AiModeCandidateReadResult> {
    let raw: unknown;
    try {
      raw = await readJsonFileOrNull<unknown>(this.storePath());
    } catch {
      return { entries: [], corrupt: true };
    }
    if (raw === null) return { entries: [], corrupt: false };
    const data = raw as Partial<StoreData>;
    if (typeof raw !== 'object' || !Array.isArray(data.entries)) return { entries: [], corrupt: true };
    const out: ApprovedAiModePartCandidateEntry[] = [];
    for (const item of data.entries) {
      const entry = normalizeAiModeCandidateEntry(item);
      if (entry) out.push(entry);
    }
    return { entries: out, corrupt: false };
  }

  async write(entries: readonly ApprovedAiModePartCandidateEntry[]): Promise<StoreData> {
    const data: StoreData = { version: 1, entries: [...entries], updatedAt: new Date().toISOString() };
    await atomicWriteJson(this.storePath(), data, { allowLocalCacheReplace: true, label: 'AI Mode parça kodu aday deposu' });
    return data;
  }
}
