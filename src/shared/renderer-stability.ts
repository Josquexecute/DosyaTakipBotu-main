import type { TrackingFile } from './types';

export interface MutationQueue {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
  has(key: string): boolean;
  size(): number;
  pendingKeys(): string[];
}

export function createMutationQueue(): MutationQueue {
  const queues = new Map<string, Promise<void>>();

  return {
    async run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = queues.get(key) ?? Promise.resolve();
      const next = previous.then(task);
      const tracked = next.then(() => undefined, () => undefined);
      queues.set(key, tracked);
      try {
        return await next;
      } finally {
        if (queues.get(key) === tracked) queues.delete(key);
      }
    },
    has(key: string): boolean {
      return queues.has(key);
    },
    size(): number {
      return queues.size;
    },
    pendingKeys(): string[] {
      return [...queues.keys()];
    }
  };
}

export function setTrackingLocalField(tracking: TrackingFile, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('Gecersiz alan yolu.');
  let cursor: Record<string, unknown> = tracking as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      throw new Error(`Yerel degisiklik hazirlanamadi: ${dottedPath}`);
    }
    cursor = next as Record<string, unknown>;
  }
  const key = parts.at(-1);
  if (!key) throw new Error('Gecersiz alan yolu.');
  cursor[key] = value;
}
