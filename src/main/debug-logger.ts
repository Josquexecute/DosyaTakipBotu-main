import fs from 'node:fs/promises';
import path from 'node:path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_ARCHIVED_LOGS = 5;

export class DebugLogger {
  constructor(private readonly logDir: string) {}

  async ensure(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  async log(level: LogLevel, message: string, details?: unknown): Promise<void> {
    await this.ensure();
    const logPath = path.join(this.logDir, 'hasarbotu.log');
    await this.rotateIfNeeded(logPath);
    const line = JSON.stringify({ at: new Date().toISOString(), level, message, details: maskSensitive(details) }) + '\n';
    await fs.appendFile(logPath, line, 'utf-8');
  }

  private async rotateIfNeeded(logPath: string): Promise<void> {
    const stat = await fs.stat(logPath).catch(() => null);
    if (!stat || stat.size < MAX_LOG_BYTES) return;
    const archivePath = path.join(this.logDir, `hasarbotu-${timestampForFile()}.log`);
    await fs.rename(logPath, archivePath).catch(async () => {
      await fs.copyFile(logPath, archivePath).catch(() => undefined);
      await fs.truncate(logPath, 0).catch(() => undefined);
    });
    await pruneOldArchives(this.logDir);
  }
}

async function pruneOldArchives(logDir: string): Promise<void> {
  const entries = await fs.readdir(logDir, { withFileTypes: true }).catch(() => []);
  const archives = await Promise.all(entries
    .filter((entry) => entry.isFile() && /^hasarbotu-\d{8}-\d{6}\.log$/.test(entry.name))
    .map(async (entry) => {
      const filePath = path.join(logDir, entry.name);
      const stat = await fs.stat(filePath).catch(() => null);
      return stat ? { filePath, mtimeMs: stat.mtimeMs } : null;
    }));
  const sorted = archives
    .filter((item): item is { filePath: string; mtimeMs: number } => item !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  await Promise.all(sorted.slice(MAX_ARCHIVED_LOGS).map((item) => fs.unlink(item.filePath).catch(() => undefined)));
}

function timestampForFile(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function maskSensitive(input: unknown): unknown {
  if (typeof input === 'string') return input.replace(/(TOKEN|PASSWORD|SECRET|API_KEY)=([^\s]+)/gi, '$1=***');
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(maskSensitive);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (/token|password|secret|api/i.test(key)) result[key] = '***';
    else result[key] = maskSensitive(value);
  }
  return result;
}
