/**
 * v0.6.x — AI İşçilik v3.2: Eksper onaylı öğrenme YEREL deposu (AppData/local-cache JSON; atomic).
 * Yalnız kendi dosyasına yazar; takip.json'a, Excel'e, case klasörüne, canlı/pCloud klasörüne DOKUNMAZ.
 * Bozuk/eksik dosya uygulamayı çökertmez (corrupt → boş + uyarı). Migration-safe normalize.
 */
import path from 'node:path';
import { atomicWriteJson } from '../storage/atomic-write';
import { readJsonFileOrNull } from '../storage/json-io';
import { normalizeExpertEntry } from '../../shared/labor/expert-approved-learning-store';
import type { ExpertApprovedLaborLearningEntry } from '../../shared/labor/expert-approved-learning-types';

const STORE_FILE = 'expert-approved-learning.json';

export interface ExpertApprovedLearningStoreData {
  version: 1;
  entries: ExpertApprovedLaborLearningEntry[];
  updatedAt: string;
}

export interface ExpertLearningReadResult {
  entries: ExpertApprovedLaborLearningEntry[];
  /** Dosya var ama okunamadı/biçimsiz (yok sayıldı; Excel akışı sürer). */
  corrupt: boolean;
}

export class ExpertApprovedLearningStoreFile {
  constructor(private readonly cacheRoot: string) {}

  storePath(): string {
    return path.join(this.cacheRoot, STORE_FILE);
  }

  /** Depoyu okur. Yoksa boş (corrupt=false); bozuksa boş (corrupt=true) — asla throw etmez. */
  async read(): Promise<ExpertLearningReadResult> {
    let raw: unknown;
    try {
      raw = await readJsonFileOrNull<unknown>(this.storePath());
    } catch {
      // Dosya var ama JSON parse edilemedi → bozuk, yok say.
      return { entries: [], corrupt: true };
    }
    if (raw === null) return { entries: [], corrupt: false };
    const data = raw as Partial<ExpertApprovedLearningStoreData>;
    if (typeof raw !== 'object' || !Array.isArray(data.entries)) return { entries: [], corrupt: true };
    const out: ExpertApprovedLaborLearningEntry[] = [];
    for (const item of data.entries) {
      const entry = normalizeExpertEntry(item);
      if (entry) out.push(entry);
    }
    return { entries: out, corrupt: false };
  }

  async write(entries: readonly ExpertApprovedLaborLearningEntry[]): Promise<ExpertApprovedLearningStoreData> {
    const data: ExpertApprovedLearningStoreData = {
      version: 1,
      entries: [...entries],
      updatedAt: new Date().toISOString()
    };
    await atomicWriteJson(this.storePath(), data, { allowLocalCacheReplace: true, label: 'Eksper onaylı işçilik öğrenme deposu' });
    return data;
  }
}
