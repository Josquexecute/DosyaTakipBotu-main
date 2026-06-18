import fs from 'node:fs/promises';

for (const dir of ['dist', 'dist-electron', 'dist-ui']) {
  await fs.rm(dir, { recursive: true, force: true });
}
console.log('dist klasörleri temizlendi.');
