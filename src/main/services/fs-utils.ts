import fs from 'node:fs/promises';

/** Verilen yolun var olan bir klasör olup olmadığını döndürür (hata durumunda false). */
export async function existsDirectory(folderPath: string): Promise<boolean> {
  try { return (await fs.stat(folderPath)).isDirectory(); } catch { return false; }
}
