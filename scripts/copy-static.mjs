import fs from 'node:fs/promises';
import path from 'node:path';

const rendererOut = path.join(process.cwd(), 'dist-ui', 'renderer');
await fs.mkdir(rendererOut, { recursive: true });
await fs.copyFile('src/renderer/index.html', path.join(rendererOut, 'index.html'));
await fs.copyFile('src/renderer/styles.css', path.join(rendererOut, 'styles.css'));
await patchEsmImportExtensions(path.join(process.cwd(), 'dist-ui'));
console.log('Arayüz statik dosyaları kopyalandı ve ESM import uzantıları düzeltildi.');

async function patchEsmImportExtensions(root) {
  const files = await collectJsFiles(root);
  for (const file of files) {
    let text = await fs.readFile(file, 'utf-8');
    text = text.replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (_m, prefix, spec, suffix) => {
      if (/\.(js|json|css|png|jpg|jpeg|webp|svg)$/.test(spec)) return `${prefix}${spec}${suffix}`;
      return `${prefix}${spec}.js${suffix}`;
    });
    text = text.replace(/(import\s*\(\s*['"])(\.\.?\/[^'"]+?)(['"]\s*\))/g, (_m, prefix, spec, suffix) => {
      if (/\.(js|json|css|png|jpg|jpeg|webp|svg)$/.test(spec)) return `${prefix}${spec}${suffix}`;
      return `${prefix}${spec}.js${suffix}`;
    });
    await fs.writeFile(file, text, 'utf-8');
  }
}

async function collectJsFiles(root) {
  const out = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}
