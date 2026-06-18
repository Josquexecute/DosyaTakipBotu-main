import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nativeImage } from 'electron';
import type { ThumbnailResult } from '../../shared/types';

export class ThumbnailCache {
  constructor(private readonly thumbnailRoot: string) {}

  async ensure(): Promise<void> {
    await fs.mkdir(this.thumbnailRoot, { recursive: true });
  }

  async getThumbnailDataUrl(filePath: string): Promise<ThumbnailResult> {
    await this.ensure();
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) {
      return { filePath, dataUrl: null, cacheHit: false, reason: 'Fotoğraf dosyası bulunamadı.' };
    }
    if (stat.size <= 0) {
      return { filePath, dataUrl: null, cacheHit: false, reason: 'Fotoğraf dosyası boş görünüyor.' };
    }

    const cacheFile = path.join(this.thumbnailRoot, `${this.cacheKey(filePath, stat.mtimeMs, stat.size)}.png`);
    const cached = await fs.readFile(cacheFile).catch(() => null);
    if (cached) {
      return { filePath, dataUrl: `data:image/png;base64,${cached.toString('base64')}`, cacheHit: true };
    }

    const image = nativeImage.createFromPath(filePath);
    if (image.isEmpty()) {
      return { filePath, dataUrl: null, cacheHit: false, reason: 'Fotoğraf küçük resmi üretilemedi. Dosya bozuk veya desteklenmeyen içerikte olabilir.' };
    }

    const size = image.getSize();
    const targetWidth = size.width >= size.height ? 240 : 160;
    const targetHeight = size.width >= size.height ? 160 : 240;
    const resized = image.resize({ width: targetWidth, height: targetHeight, quality: 'good' });
    const png = resized.toPNG();
    if (png.byteLength === 0) {
      return { filePath, dataUrl: null, cacheHit: false, reason: 'Fotoğraf küçük resmi boş üretildi.' };
    }
    await fs.writeFile(cacheFile, png);
    return { filePath, dataUrl: `data:image/png;base64,${png.toString('base64')}`, cacheHit: false };
  }

  async cleanup(maxFiles = 4000): Promise<void> {
    await this.ensure();
    const entries = await fs.readdir(this.thumbnailRoot, { withFileTypes: true }).catch(() => []);
    const files = entries.filter((e) => e.isFile()).map((e) => path.join(this.thumbnailRoot, e.name));
    if (files.length <= maxFiles) return;
    const stats = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })));
    stats.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
    for (const item of stats.slice(0, Math.max(0, stats.length - maxFiles))) {
      await fs.unlink(item.file).catch(() => undefined);
    }
  }

  private cacheKey(filePath: string, mtimeMs: number, size: number): string {
    return crypto.createHash('sha256').update(JSON.stringify({ filePath, mtimeMs, size, v: 2 })).digest('hex');
  }
}
