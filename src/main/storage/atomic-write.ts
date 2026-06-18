import fs from 'node:fs/promises';
import path from 'node:path';

export interface AtomicWriteOptions {
  /**
   * Non-authoritative local cache dosyaları için Windows'ta hedef dosya kilitlenirse
   * eski cache dosyasını kaldırıp temp çıktıyı yerine koymaya izin verir.
   * `_HASARBOTU/takip.json` gibi otoritatif takip verilerinde kullanılmamalıdır.
   */
  allowLocalCacheReplace?: boolean;
  label?: string;
}

/**
 * Windows/pCloud için güvenli yazma:
 * 1) aynı klasöre temp dosya yazar,
 * 2) temp dosyayı fsync eder,
 * 3) atomic rename yapar,
 * 4) mümkünse klasör metadata'sını fsync eder.
 */
export async function atomicWriteUtf8(filePath: string, content: string, options: AtomicWriteOptions = {}): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let handle: fs.FileHandle | null = null;

  try {
    handle = await fs.open(tmpPath, 'w');
    await handle.writeFile(content, 'utf-8');
    await handle.sync();
    await handle.close();
    handle = null;

    await replaceFile(tmpPath, filePath, options);
    await fsyncDirectoryIfSupported(dir);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    // Veri güvenliği: hata halinde temp dosya silinmez; gerektiğinde kurtarma/inceleme için kalır.
    throw error;
  }
}

export async function atomicWriteJson(filePath: string, data: unknown, options: AtomicWriteOptions = {}): Promise<void> {
  await atomicWriteUtf8(filePath, JSON.stringify(data, null, 2) + '\n', options);
}

async function replaceFile(tmpPath: string, finalPath: string, options: AtomicWriteOptions): Promise<void> {
  try {
    await fs.rename(tmpPath, finalPath);
    return;
  } catch (firstError) {
    const firstCode = (firstError as NodeJS.ErrnoException).code;
    if (process.platform !== 'win32' || !isWindowsReplaceError(firstCode)) throw firstError;

    // Windows Defender, pCloud Drive, Explorer önizleme vb. kısa süreli kilitlerde önce silmeden retry yap.
    for (const waitMs of [75, 150, 300, 600]) {
      await delay(waitMs);
      try {
        await fs.rename(tmpPath, finalPath);
        return;
      } catch (retryError) {
        const retryCode = (retryError as NodeJS.ErrnoException).code;
        if (!isWindowsReplaceError(retryCode)) throw retryError;
      }
    }

    if (options.allowLocalCacheReplace) {
      await replaceLocalCacheFile(tmpPath, finalPath, firstCode);
      return;
    }

    const label = options.label ?? 'dosya';
    throw new Error(`${label} yazılamadı; mevcut dosya korundu. Geçici çıktı: ${tmpPath}. Windows/pCloud hata kodu: ${firstCode ?? 'UNKNOWN'}`);
  }
}

async function replaceLocalCacheFile(tmpPath: string, finalPath: string, firstCode?: string): Promise<void> {
  // local-cache otoritatif veri değildir; bozulursa uygulama yeniden tarayarak oluşturabilir.
  // Bu yüzden Windows'ta kilitli/eski cache dosyasını kaldırıp yeni cache çıktısını yerine koymak güvenlidir.
  try {
    await fs.rm(finalPath, { force: true });
    await fs.rename(tmpPath, finalPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(`Yerel önbellek yenilenemedi. Mevcut canlı takip verisi etkilenmedi. Geçici çıktı: ${tmpPath}. İlk hata: ${firstCode ?? 'UNKNOWN'} / Son hata: ${code ?? 'UNKNOWN'}`);
  }
}

function isWindowsReplaceError(code: string | undefined): boolean {
  return code === 'EEXIST' || code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fsyncDirectoryIfSupported(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  let dirHandle: fs.FileHandle | null = null;
  try {
    dirHandle = await fs.open(dir, 'r');
    await dirHandle.sync();
  } catch {
    // Windows ve bazı sanal/cloud FS sürücüleri klasör fsync desteklemez.
  } finally {
    if (dirHandle) await dirHandle.close().catch(() => undefined);
  }
}
