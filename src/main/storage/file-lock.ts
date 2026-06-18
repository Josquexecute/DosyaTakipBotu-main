import fs from 'node:fs/promises';
import path from 'node:path';

export interface FileLockOptions {
  staleMs?: number;
  retryMs?: number;
  timeoutMs?: number;
}

export async function withFileLock<T>(lockPath: string, owner: string, operation: () => Promise<T>, options: FileLockOptions = {}): Promise<T> {
  const staleMs = options.staleMs ?? 20_000;
  const retryMs = options.retryMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 30_000;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  let handle: fs.FileHandle | null = null;

  while (!handle) {
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ owner, pid: process.pid, createdAt: new Date().toISOString() }, null, 2), 'utf-8');
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      await removeStaleLock(lockPath, staleMs);
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('Takip dosyası başka bir işlem tarafından kullanılıyor. Birkaç saniye sonra tekrar deneyin.');
      }
      await delay(retryMs);
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

async function removeStaleLock(lockPath: string, staleMs: number): Promise<void> {
  try {
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs > staleMs) await fs.unlink(lockPath);
  } catch {
    // Lock dosyası arada kalkmış olabilir.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
