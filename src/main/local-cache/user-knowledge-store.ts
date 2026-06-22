import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { UserKnowledgeStore } from '../../shared/knowledge';
import { atomicWriteJson } from '../storage/atomic-write';
import { readJsonFileOrNull } from '../storage/json-io';

const USER_KNOWLEDGE_STORE_FILE = 'user-knowledge-store.json';

export function defaultUserKnowledgeStore(): UserKnowledgeStore {
  return {
    schemaVersion: 1,
    entries: [],
    metadata: { revision: 0, updatedAt: new Date().toISOString(), writeId: '' }
  };
}

/**
 * P4-E1: Kullanici bilgi deposu icin ATOMIC WRITE ISKELETI.
 *
 * Depo yalnizca AppData altindaki kendi dosyasina (user-knowledge-store.json) yazilir; ana takip dosyasina,
 * Excel'e, read-only kaynak kayitlarina veya canli dosya klasorlerine DOKUNMAZ. Yazim atomic'tir (temp + fsync + rename);
 * hata halinde mevcut dosya korunur (atomicWriteJson varsayilani).
 *
 * NOT: Bu iskelet henuz import akisina BAGLI DEGILDIR. Gercek import yazimi (dosya icerigini bu depoya kaydetme)
 * P4-D kilidi (KNOWLEDGE_IMPORT_PERSISTENT_WRITE_ENABLED) bilincli olarak acilana kadar yapilmaz.
 */
export class UserKnowledgeStoreFile {
  constructor(private readonly cacheRoot: string) {}

  storePath(): string {
    return path.join(this.cacheRoot, USER_KNOWLEDGE_STORE_FILE);
  }

  async read(): Promise<UserKnowledgeStore> {
    const raw = await readJsonFileOrNull<UserKnowledgeStore>(this.storePath());
    if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.entries)) return defaultUserKnowledgeStore();
    return raw;
  }

  async write(store: UserKnowledgeStore): Promise<UserKnowledgeStore> {
    const next: UserKnowledgeStore = {
      schemaVersion: 1,
      entries: Array.isArray(store.entries) ? store.entries : [],
      metadata: {
        revision: (store.metadata?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        writeId: randomUUID()
      }
    };
    await atomicWriteJson(this.storePath(), next, { label: 'Kullanici bilgi deposu' });
    return next;
  }
}
